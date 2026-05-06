// ═══════════════════════════════════════════════════════════
// PVGIS Fetch Hardening — Solar Rota
// Fetch tiers: backend proxy (preferred) → direct PVGIS → PSH fallback
// Typed status, source metadata, user-friendly error messages
// ═══════════════════════════════════════════════════════════

import { buildAuthHeaders } from './backend-config.js';

export const PVGIS_FETCH_STATUS = {
  LIVE_SUCCESS:    'live-success',
  PROXY_SUCCESS:   'proxy-success',
  FALLBACK_USED:   'fallback-used',
  PARTIAL_DATA:    'partial-data',
  ERROR:           'error'
};

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

const PROXY_TIMEOUT_MS             = 15000; // annual/monthly proxy path
const PROXY_HOURLY_TIMEOUT_MS      = 75000; // PVGIS seriescalc can take ~50-60 s
const DEFAULT_TIMEOUT_MS           = 20000; // direct PVGIS per attempt
export const CALC_TOTAL_TIMEOUT_MS = 120000; // live PVGIS hourly proxy path can approach 75 s
const DEFAULT_RETRY_DELAYS_MS = [0, 2500, 5000];
const PVGIS_HTTP_OUTAGE_COOLDOWN_MS = 5 * 60 * 1000;
const COMMON_YEAR_MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
const MONTH_START_HOURS = COMMON_YEAR_MONTH_DAYS.reduce((acc, days, index) => {
  acc.push(index === 0 ? 0 : acc[index - 1] + COMMON_YEAR_MONTH_DAYS[index - 1] * 24);
  return acc;
}, []);
let pvgisHttpOutageUntil = 0;
let _lastPvgisError = null;

export function getLastPvgisError() {
  return _lastPvgisError;
}

function classifyError(e) {
  const msg = (e?.message || String(e)).toLowerCase();
  if (msg.includes('abort') || msg.includes('timeout')) return 'timeout';
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network')) return 'network';
  if (msg.includes('cors') || msg.includes('cross-origin')) return 'cors';
  if (msg.includes('ssl') || msg.includes('certificate')) return 'ssl';
  return 'unknown';
}

function buildUserMessage(errorType, lang) {
  const isEN = lang === 'en';
  const isDE = lang === 'de';
  switch (errorType) {
    case 'timeout':
      if (isEN) return 'Live solar data request timed out — estimated model used.';
      if (isDE) return 'Echtzeit-Solardaten-Anfrage abgelaufen — Schätzmodell verwendet.';
      return 'Canlı güneş verisi zaman aşımına uğradı — tahmini model kullanıldı.';
    case 'network':
      if (isEN) return 'Live solar data unavailable (network error) — estimated model used.';
      if (isDE) return 'Echtzeit-Solardaten nicht verfügbar (Netzwerkfehler) — Schätzmodell verwendet.';
      return 'Canlı güneş verisi alınamadı (ağ hatası) — tahmini model kullanıldı.';
    case 'cors':
      if (isEN) return 'Browser security blocked live data access — estimated model used.';
      if (isDE) return 'Browsersicherheit blockierte Echtzeitdatenzugriff — Schätzmodell verwendet.';
      return 'Tarayıcı güvenliği canlı veri erişimini engelledi — tahmini model kullanıldı.';
    case 'proxy-unavailable':
      if (isEN) return 'PVGIS proxy is unavailable — estimated model used.';
      if (isDE) return 'PVGIS-Proxy nicht verfügbar — Schätzmodell verwendet.';
      return 'PVGIS proxy çalışmıyor — tahmini model kullanıldı.';
    case 'http-error':
      if (isEN) return 'PVGIS service temporarily unavailable — estimated model used.';
      if (isDE) return 'PVGIS-Dienst vorübergehend nicht verfügbar — Schätzmodell verwendet.';
      return 'PVGIS servisi geçici olarak yanıt vermedi — tahmini model kullanıldı.';
    default:
      if (isEN) return 'Live solar data unavailable — local estimated model used.';
      if (isDE) return 'Echtzeit-Solardaten nicht verfügbar — lokales Schätzmodell verwendet.';
      return 'Canlı güneş verisi alınamadı — yerel tahmini model kullanıldı.';
  }
}

/**
 * Attempt to fetch from the backend PVGIS proxy endpoint.
 * Returns a result object or null if the proxy is unavailable/fails quickly.
 */
async function _tryBackendProxy(backendProxyUrl, baseParams, fetchImpl, timeoutMs, includeHourly = false) {
  let timer = null;
  try {
    const ctrl = new AbortController();
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const proxyParams = includeHourly ? `${baseParams}&includeHourly=1` : baseParams;
    const res = await fetchImpl(`${backendProxyUrl}?${proxyParams}`, {
      signal: ctrl.signal,
      headers: buildAuthHeaders({ accept: 'application/json' }),  // X-Api-Key ekle
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data.ok) return null;

    const ey = data.rawEnergy || data.E_y;
    if (!ey || ey <= 0) return null;

    return {
      fetchStatus: PVGIS_FETCH_STATUS.PROXY_SUCCESS,
      rawEnergy: ey,
      rawPoa: data.rawPoa || data['H(i)_y'] || null,
      rawMonthly: data.rawMonthly || null,
      rawHourly: data.rawHourly || null,
      endpointUsed: backendProxyUrl,
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parsePvgisHourIndex(time) {
  const text = String(time || '');
  const compact = text.match(/^(\d{4})(\d{2})(\d{2}):?(\d{2})/);
  if (compact) {
    const month = Number(compact[2]);
    const day = Number(compact[3]);
    const hour = Math.min(23, Number(compact[4]));
    if (month === 2 && day === 29) return null;
    if (month >= 1 && month <= 12 && day >= 1 && day <= COMMON_YEAR_MONTH_DAYS[month - 1]) {
      return MONTH_START_HOURS[month - 1] + (day - 1) * 24 + hour;
    }
  }
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) {
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const hour = d.getUTCHours();
    if (month === 2 && day === 29) return null;
    if (month >= 1 && month <= 12 && day >= 1 && day <= COMMON_YEAR_MONTH_DAYS[month - 1]) {
      return MONTH_START_HOURS[month - 1] + (day - 1) * 24 + hour;
    }
  }
  return null;
}

function hourlyRowsToTypical8760(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const sums = new Array(8760).fill(0);
  const counts = new Array(8760).fill(0);
  rows.forEach((row, fallbackIndex) => {
    const idx = parsePvgisHourIndex(row.time || row.Time || row.timestamp) ?? (rows.length >= 8760 ? fallbackIndex % 8760 : null);
    if (idx == null || idx < 0 || idx >= 8760) return;
    const watts = Number(row.P ?? row.PV ?? row.p ?? row.power ?? 0);
    if (!Number.isFinite(watts) || watts < 0) return;
    sums[idx] += watts / 1000;
    counts[idx] += 1;
  });
  if (!counts.some(Boolean)) return null;
  return sums.map((sum, index) => counts[index] > 0 ? sum / counts[index] : 0);
}

async function fetchPVGISHourlySeries(baseParams, fetchImpl, timeoutMs) {
  if (typeof fetchImpl !== 'function') return null;
  const seriesParams = `${baseParams}&pvcalculation=1&localtime=1`;
  for (const endpoint of PVGIS_SERIES_ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${endpoint}?${seriesParams}`, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
      if (!res.ok) {
        if ([429, 500, 502, 503, 504].includes(res.status)) break;
        continue;
      }
      const data = await res.json();
      const hourly = hourlyRowsToTypical8760(data.outputs?.hourly);
      if (hourly && hourly.length === 8760 && hourly.some(v => v > 0)) return hourly;
    } catch {
      // Hourly PVGIS is optional; annual/monthly PVcalc remains the authority.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Fetch PVGIS live data with retry/timeout/proxy fallback.
 *
 * Architecture (when backendProxyUrl provided):
 *   1. Backend proxy (avoids CORS, shorter timeout)
 *   2. Direct PVGIS endpoints (with retries)
 *   3. PSH local fallback (caller must handle)
 *
 * @param {{ lat, lon, peakpower, loss, angle, aspect }} params
 * @param {{
 *   retries?: number,
 *   timeoutMs?: number,
 *   backendProxyUrl?: string|null,
 *   proxyFirst?: boolean,
 *   fetchImpl?: Function,
 *   includeHourly?: boolean,
 *   allowDirectPvgisFetch?: boolean,
 *   retryHttpErrors?: boolean,
 *   logFetchDiagnostics?: boolean,
 *   useOutageCooldown?: boolean,
 *   lang?: string
 * }} options
 */
export async function fetchPVGISLive(params, options = {}) {
  const {
    retries = 3,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    backendProxyUrl = null,
    proxyFirst = true,
    fetchImpl = globalThis.fetch,
    includeHourly = false,
    allowDirectPvgisFetch = typeof window === 'undefined',
    hourlyTimeoutMs = 25000,
    retryHttpErrors = false,
    logFetchDiagnostics = false,
    useOutageCooldown = typeof window !== 'undefined',
    lang = 'tr'
  } = options;

  const { lat, lon, peakpower, loss = 0, angle, aspect } = params;
  const baseParams = `lat=${lat}&lon=${lon}&peakpower=${peakpower}&loss=${loss}&angle=${angle}&aspect=${aspect}&outputformat=json&pvtechchoice=crystSi&mountingplace=building`;

  // ── Tier 1: Backend proxy (preferred, avoids CORS) ──────────────────────────
  let proxyAttempted = false;
  if (backendProxyUrl && proxyFirst && typeof fetchImpl === 'function') {
    proxyAttempted = true;
    const proxyTimeoutMs = includeHourly ? PROXY_HOURLY_TIMEOUT_MS : PROXY_TIMEOUT_MS;
    const proxyResult = await _tryBackendProxy(backendProxyUrl, baseParams, fetchImpl, proxyTimeoutMs, includeHourly);
    if (proxyResult) {
      return {
        ...proxyResult,
        attemptCount: 1,
        errorType: null,
        errorMessage: null,
        userMessage: null
      };
    }
    // Proxy failed — fall through to direct PVGIS
    if (logFetchDiagnostics) console.info('[pvgis-fetch] Backend proxy unavailable — trying direct PVGIS');
  }

  if (!allowDirectPvgisFetch) {
    const errorType = proxyAttempted ? 'proxy-unavailable' : 'cors';
    const errorMessage = proxyAttempted
      ? 'Backend PVGIS proxy unavailable; direct browser PVGIS calls are disabled because PVGIS does not allow AJAX/CORS.'
      : 'Direct browser PVGIS calls are disabled because PVGIS does not allow AJAX/CORS.';
    _lastPvgisError = errorMessage;
    return {
      fetchStatus: PVGIS_FETCH_STATUS.FALLBACK_USED,
      rawEnergy: null,
      rawPoa: null,
      rawMonthly: null,
      rawHourly: null,
      endpointUsed: null,
      attemptCount: proxyAttempted ? 1 : 0,
      errorType,
      errorMessage,
      userMessage: buildUserMessage(errorType, lang)
    };
  }

  if (useOutageCooldown && Date.now() < pvgisHttpOutageUntil) {
    return {
      fetchStatus: PVGIS_FETCH_STATUS.FALLBACK_USED,
      rawEnergy: null,
      rawPoa: null,
      rawMonthly: null,
      rawHourly: null,
      endpointUsed: null,
      attemptCount: 0,
      errorType: 'service-cooldown',
      errorMessage: 'PVGIS temporarily skipped after recent service error',
      userMessage: buildUserMessage('http-error', lang)
    };
  }

  // ── Tier 2: Direct PVGIS endpoints ──────────────────────────────────────────
  let lastError = null;
  let lastErrorType = null;
  let attemptCount = 0;

  for (let attempt = 0; attempt < retries; attempt++) {
    attemptCount++;
    if (attempt > 0) {
      const delay = retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)];
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
    }

    const endpoint = PVGIS_ENDPOINTS[Math.min(attempt, PVGIS_ENDPOINTS.length - 1)];
    const url = `${endpoint}?${baseParams}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        lastErrorType = 'http-error';
        if (useOutageCooldown && [429, 500, 502, 503, 504].includes(res.status)) {
          pvgisHttpOutageUntil = Date.now() + PVGIS_HTTP_OUTAGE_COOLDOWN_MS;
        }
        if (logFetchDiagnostics) console.warn('[pvgis-fetch] HTTP error:', res.status, 'attempt', attempt + 1);
        if (retryHttpErrors && attempt < retries - 1) continue;
        break;
      }

      const data = await res.json();
      const ey = data.outputs?.totals?.fixed?.E_y;
      if (!ey || ey <= 0) {
        lastError = 'Empty or zero E_y in response';
        lastErrorType = 'empty-response';
        continue;
      }

      const rawMonthly = data.outputs?.monthly?.fixed
        ? data.outputs.monthly.fixed.map(m => m.E_m)
        : null;
      const rawPoa = data.outputs?.totals?.fixed?.['H(i)_y']
        || data.outputs?.totals?.fixed?.H_i_y
        || null;

      return {
        fetchStatus: PVGIS_FETCH_STATUS.LIVE_SUCCESS,
        rawEnergy: ey,
        rawPoa,
        rawMonthly,
        rawHourly: includeHourly ? await fetchPVGISHourlySeries(baseParams, fetchImpl, hourlyTimeoutMs) : null,
        endpointUsed: endpoint,
        attemptCount,
        errorType: null,
        errorMessage: null,
        userMessage: null
      };
    } catch (e) {
      const etype = classifyError(e);
      lastError = e?.message || String(e);
      lastErrorType = etype;
      if (logFetchDiagnostics) console.warn('[pvgis-fetch] Attempt', attempt + 1, 'failed:', etype, '-', e?.message);
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Tier 3 (legacy): backend proxy as last resort if not proxyFirst ──────────
  if (backendProxyUrl && !proxyFirst && typeof fetchImpl === 'function') {
    const proxyTimeoutMs = includeHourly ? PROXY_HOURLY_TIMEOUT_MS : PROXY_TIMEOUT_MS;
    const proxyResult = await _tryBackendProxy(backendProxyUrl, baseParams, fetchImpl, proxyTimeoutMs, includeHourly);
    if (proxyResult) {
      const rawHourly = proxyResult.rawHourly
        || (includeHourly ? await fetchPVGISHourlySeries(baseParams, fetchImpl, hourlyTimeoutMs) : null);
      return {
        ...proxyResult,
        rawHourly,
        attemptCount: attemptCount + 1,
        errorType: null,
        errorMessage: null,
        userMessage: null
      };
    }
  }

  // ── All tiers failed — caller must use PSH fallback ─────────────────────────
  const userMessage = buildUserMessage(lastErrorType, lang);
  _lastPvgisError = lastError;

  return {
    fetchStatus: PVGIS_FETCH_STATUS.FALLBACK_USED,
    rawEnergy: null,
    rawPoa: null,
    rawMonthly: null,
    rawHourly: null,
    endpointUsed: null,
    attemptCount,
    errorType: lastErrorType,
    errorMessage: lastError,
    userMessage
  };
}

/**
 * Human-readable source label for UI display.
 * @param {string} fetchStatus
 * @param {string} [lang]
 * @returns {string}
 */
export function getPvgisSourceLabel(fetchStatus, lang = 'tr') {
  const isEN = lang === 'en';
  const isDE = lang === 'de';
  switch (fetchStatus) {
    case PVGIS_FETCH_STATUS.LIVE_SUCCESS:
      return isEN ? 'PVGIS Live' : isDE ? 'PVGIS Live' : 'PVGIS Canlı';
    case PVGIS_FETCH_STATUS.PROXY_SUCCESS:
      return isEN ? 'PVGIS Live (Proxy)' : isDE ? 'PVGIS Live (Proxy)' : 'PVGIS Canlı (Proxy)';
    case PVGIS_FETCH_STATUS.FALLBACK_USED:
      return isEN ? 'PSH Estimate' : isDE ? 'PSH-Schätzung' : 'PSH Tahmini';
    case PVGIS_FETCH_STATUS.PARTIAL_DATA:
      return isEN ? 'Partial Data' : isDE ? 'Teilweise Daten' : 'Kısmi Veri';
    default:
      return isEN ? 'Unknown' : isDE ? 'Unbekannt' : 'Bilinmeyen';
  }
}

/**
 * Whether backend vs. PVGIS parity comparison is meaningful.
 * Only true when live data succeeded AND backend also ran.
 */
export function isPvgisParityAvailable(fetchStatus, hasBackendResult) {
  return fetchStatus === PVGIS_FETCH_STATUS.LIVE_SUCCESS && !!hasBackendResult;
}
