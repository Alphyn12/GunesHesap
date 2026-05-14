const PVGIS_ENDPOINTS = [
  'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc',
  'https://re.jrc.ec.europa.eu/api/v5_2/PVcalc',
  'https://re.jrc.ec.europa.eu/api/PVcalc',
];

const PVGIS_SERIES_ENDPOINTS = [
  'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc',
  'https://re.jrc.ec.europa.eu/api/v5_2/seriescalc',
  'https://re.jrc.ec.europa.eu/api/seriescalc',
];

const COMMON_YEAR_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_START_HOURS = COMMON_YEAR_MONTH_DAYS.reduce((acc, days, index) => {
  acc.push(index === 0 ? 0 : acc[index - 1] + COMMON_YEAR_MONTH_DAYS[index - 1] * 24);
  return acc;
}, []);

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(query, key, fallback = null) {
  const raw = firstQueryValue(query?.[key]);
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function booleanParam(query, key) {
  const raw = String(firstQueryValue(query?.[key]) ?? '').toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function validateRange(errors, key, value, min, max, exclusiveMin = false) {
  const minOk = exclusiveMin ? value > min : value >= min;
  if (!Number.isFinite(value) || !minOk || value > max) {
    errors.push(`${key} must be ${exclusiveMin ? '>' : '>='}${min} and <=${max}`);
  }
}

export function normalizePvgisProxyQuery(query = {}) {
  const params = {
    lat: numberParam(query, 'lat'),
    lon: numberParam(query, 'lon'),
    peakpower: numberParam(query, 'peakpower'),
    loss: numberParam(query, 'loss', 0),
    angle: numberParam(query, 'angle', 30),
    aspect: numberParam(query, 'aspect', 0),
    includeHourly: booleanParam(query, 'includeHourly'),
  };

  const errors = [];
  validateRange(errors, 'lat', params.lat, -90, 90);
  validateRange(errors, 'lon', params.lon, -180, 180);
  validateRange(errors, 'peakpower', params.peakpower, 0, 10000, true);
  validateRange(errors, 'loss', params.loss, 0, 100);
  validateRange(errors, 'angle', params.angle, 0, 90);
  validateRange(errors, 'aspect', params.aspect, -180, 180);

  return { params, errors };
}

export function buildPvgisSearchParams(params, hourly = false) {
  const search = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
    peakpower: String(params.peakpower),
    loss: String(params.loss),
    angle: String(params.angle),
    aspect: String(params.aspect),
    outputformat: 'json',
    pvtechchoice: 'crystSi',
    mountingplace: 'building',
  });
  if (hourly) {
    search.set('pvcalculation', '1');
    search.set('localtime', '1');
  }
  return search;
}

function parsePvgisHourIndex(time, fallbackIndex = null) {
  const text = String(time || '');
  const match = text.match(/^(\d{4})(\d{2})(\d{2}):?(\d{2})/);
  if (match) {
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Math.min(23, Number(match[4]));
    if (month === 2 && day === 29) return null;
    if (month >= 1 && month <= 12 && day >= 1 && day <= COMMON_YEAR_MONTH_DAYS[month - 1]) {
      return MONTH_START_HOURS[month - 1] + (day - 1) * 24 + hour;
    }
  }
  return fallbackIndex == null ? null : fallbackIndex % 8760;
}

function hourlyRowsToTypical8760(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const sums = new Array(8760).fill(0);
  const counts = new Array(8760).fill(0);
  const useFallbackIndex = rows.length >= 8760;
  rows.forEach((row, fallbackIndex) => {
    if (!row || typeof row !== 'object') return;
    const index = parsePvgisHourIndex(row.time || row.Time || row.timestamp, useFallbackIndex ? fallbackIndex : null);
    if (index == null || index < 0 || index >= 8760) return;
    const watts = Number(row.P ?? row.PV ?? row.p ?? row.power ?? 0);
    if (!Number.isFinite(watts) || watts < 0) return;
    sums[index] += watts / 1000;
    counts[index] += 1;
  });
  if (!counts.some(Boolean)) return null;
  return sums.map((sum, index) => counts[index] > 0 ? sum / counts[index] : 0);
}

async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return { ok: false, status: response.status, data: null };
    return { ok: true, status: response.status, data: await response.json() };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHourly(params) {
  const search = buildPvgisSearchParams(params, true);
  for (const endpoint of PVGIS_SERIES_ENDPOINTS) {
    const result = await fetchJson(`${endpoint}?${search}`, 25000);
    if (!result.ok) continue;
    const hourly = hourlyRowsToTypical8760(result.data?.outputs?.hourly);
    if (hourly && hourly.some(value => value > 0)) return hourly;
  }
  return null;
}

function proxyFailure(errorType, message, statusCode = 502) {
  return {
    statusCode,
    body: {
      ok: false,
      fetchStatus: 'proxy-failed',
      rawEnergy: null,
      rawPoa: null,
      rawMonthly: null,
      rawHourly: null,
      endpointUsed: null,
      error_type: errorType,
      error_message: message,
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const { params, errors } = normalizePvgisProxyQuery(req.query);
  if (errors.length) {
    return res.status(422).json({ ok: false, error: 'validation_failed', errors });
  }

  const search = buildPvgisSearchParams(params);
  let lastFailure = proxyFailure('upstream-unavailable', 'All PVGIS endpoints failed');

  try {
    for (const endpoint of PVGIS_ENDPOINTS) {
      const upstream = await fetchJson(`${endpoint}?${search}`, 22000);
      if (!upstream.ok) {
        lastFailure = proxyFailure('http-error', `HTTP ${upstream.status}`, 502);
        continue;
      }

      const fixed = upstream.data?.outputs?.totals?.fixed || {};
      const rawEnergy = Number(fixed.E_y);
      if (!Number.isFinite(rawEnergy) || rawEnergy <= 0) {
        lastFailure = proxyFailure('empty-response', 'E_y missing or zero', 502);
        continue;
      }

      const monthly = upstream.data?.outputs?.monthly?.fixed;
      const rawMonthly = Array.isArray(monthly) && monthly.length === 12
        ? monthly.map(item => item?.E_m ?? null)
        : null;

      return res.status(200).json({
        ok: true,
        fetchStatus: 'proxy-success',
        rawEnergy,
        rawPoa: fixed['H(i)_y'] ?? fixed.H_i_y ?? null,
        rawMonthly,
        rawHourly: params.includeHourly ? await fetchHourly(params) : null,
        endpointUsed: endpoint,
        error_type: null,
        error_message: null,
      });
    }
  } catch {
    lastFailure = proxyFailure('network', 'PVGIS upstream unavailable', 502);
  }

  return res.status(lastFailure.statusCode).json(lastFailure.body);
}
