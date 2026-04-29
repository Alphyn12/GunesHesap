function cleanCell(value) {
  return String(value ?? '').replace(/^\ufeff/, '').trim();
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function median(values = []) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values = [], p = 0.95) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function splitRows(text) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function parseDelimitedRows(text) {
  const lines = splitRows(text);
  if (!lines.length) return [];
  const sample = lines.slice(0, 8).join('\n');
  const tabCount = (sample.match(/\t/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  const delimiter = tabCount >= semiCount && tabCount >= commaCount
    ? '\t'
    : semiCount > commaCount ? ';' : ',';
  return lines.map(line => line.split(delimiter).map(cleanCell));
}

function parseTimestamp(value) {
  const raw = cleanCell(value);
  if (!raw) return null;
  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return new Date(direct);
  const m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  const date = new Date(year, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function headerScore(value, patterns) {
  const lower = cleanCell(value).toLowerCase();
  return patterns.some(pattern => lower.includes(pattern)) ? 1 : 0;
}

function detectTableColumns(rows) {
  const header = rows[0] || [];
  const candidates = header.map((cell, idx) => ({
    idx,
    timestampScore: headerScore(cell, ['timestamp', 'date', 'time', 'tarih', 'zaman', 'datetime']),
    valueScore: headerScore(cell, ['kw', 'kwh', 'power', 'load', 'energy', 'yük', 'güç', 'enerji']),
    severityScore: headerScore(cell, ['severity', 'level', 'alarm', 'priority', 'durum']),
    codeScore: headerScore(cell, ['code', 'fault', 'event', 'alarm', 'hata']),
    messageScore: headerScore(cell, ['message', 'description', 'text', 'note', 'açıklama', 'mesaj'])
  }));
  return {
    timestampIdx: candidates.sort((a, b) => b.timestampScore - a.timestampScore)[0]?.idx ?? 0,
    valueIdx: candidates.sort((a, b) => b.valueScore - a.valueScore)[0]?.idx ?? 1,
    severityIdx: candidates.find(c => c.severityScore > 0)?.idx ?? null,
    codeIdx: candidates.find(c => c.codeScore > 0)?.idx ?? null,
    messageIdx: candidates.find(c => c.messageScore > 0)?.idx ?? null,
    header
  };
}

function normalizePowerKw(value, intervalMinutes, unitHint) {
  const n = finite(value, NaN);
  if (!Number.isFinite(n) || n < 0) return null;
  const hours = Math.max((intervalMinutes || 60) / 60, 1 / 60);
  if (unitHint === 'wh') return (n / 1000) / hours;
  if (unitHint === 'kwh') return n / hours;
  return n;
}

function normalizeEnergyKwh(value, intervalMinutes, unitHint) {
  const n = finite(value, NaN);
  if (!Number.isFinite(n) || n < 0) return null;
  const hours = Math.max((intervalMinutes || 60) / 60, 1 / 60);
  if (unitHint === 'wh') return n / 1000;
  if (unitHint === 'kwh') return n;
  return n * hours;
}

function inferUnitHint(header = []) {
  const joined = header.map(cleanCell).join(' ').toLowerCase();
  if (joined.includes('wh') && !joined.includes('kwh')) return 'wh';
  if (joined.includes('kwh')) return 'kwh';
  return 'kw';
}

function inferIntervalMinutes(samples = []) {
  const diffs = [];
  for (let i = 1; i < samples.length && diffs.length < 2048; i += 1) {
    const diffMinutes = (samples[i].timestamp - samples[i - 1].timestamp) / 60000;
    if (diffMinutes > 0 && diffMinutes <= 24 * 60) diffs.push(diffMinutes);
  }
  const med = median(diffs);
  return med ? Math.max(1, Math.round(med)) : null;
}

function buildHourlyBuckets(samples = [], intervalMinutes = 60, unitHint = 'kw') {
  const buckets = new Map();
  for (const sample of samples) {
    const ts = sample.timestamp;
    const hourKey = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')} ${String(ts.getHours()).padStart(2, '0')}:00`;
    const prev = buckets.get(hourKey) || { ts: new Date(ts.getFullYear(), ts.getMonth(), ts.getDate(), ts.getHours()), energyKwh: 0, peakKw: 0 };
    const powerKw = normalizePowerKw(sample.value, intervalMinutes, unitHint);
    const energyKwh = normalizeEnergyKwh(sample.value, intervalMinutes, unitHint);
    if (powerKw != null) prev.peakKw = Math.max(prev.peakKw, powerKw);
    if (energyKwh != null) prev.energyKwh += energyKwh;
    buckets.set(hourKey, prev);
  }
  return [...buckets.values()].sort((a, b) => a.ts - b.ts);
}

function compressHourlyBucketsTo8760(hourly = []) {
  if (!hourly.length) return null;
  const filtered = hourly.filter(bucket => !(bucket.ts.getMonth() === 1 && bucket.ts.getDate() === 29));
  if (filtered.length < 8760) return null;
  const first8760 = filtered.slice(0, 8760);
  return first8760.map(bucket => Number(bucket.energyKwh.toFixed(6)));
}

function summarizeLoadSamples(samples = [], unitHint = 'kw') {
  if (!samples.length) throw new Error('Geçerli zaman damgalı saha yük satırı bulunamadı.');
  samples.sort((a, b) => a.timestamp - b.timestamp);
  const intervalMinutes = inferIntervalMinutes(samples);
  if (!intervalMinutes) throw new Error('Örnekleme aralığı çözülemedi. Dosyada zaman damgası kolonu gerekli.');
  const powerSeries = samples.map(sample => normalizePowerKw(sample.value, intervalMinutes, unitHint)).filter(v => v != null);
  const hourlyBuckets = buildHourlyBuckets(samples, intervalMinutes, unitHint);
  const totalEnergyKwh = samples.reduce((sum, sample) => sum + (normalizeEnergyKwh(sample.value, intervalMinutes, unitHint) || 0), 0);
  const firstTs = samples[0].timestamp;
  const lastTs = samples[samples.length - 1].timestamp;
  const durationHours = Math.max(0, (lastTs - firstTs) / 3600000);
  const durationDays = durationHours / 24;
  const derivedHourly8760 = hourlyBuckets.length >= 8760 && durationDays >= 360
    ? compressHourlyBucketsTo8760(hourlyBuckets)
    : null;
  const peakBucket = hourlyBuckets.reduce((max, bucket) => bucket.peakKw > (max?.peakKw || 0) ? bucket : max, null);
  return {
    kind: 'high-resolution-load',
    sampleCount: samples.length,
    intervalMinutes,
    totalEnergyKwh: Number(totalEnergyKwh.toFixed(3)),
    durationHours: Number(durationHours.toFixed(1)),
    durationDays: Number(durationDays.toFixed(1)),
    observedPeakKw: Number(Math.max(...powerSeries, 0).toFixed(3)),
    p95Kw: Number(percentile(powerSeries, 0.95).toFixed(3)),
    averageKw: Number((totalEnergyKwh / Math.max(durationHours, 1 / 60)).toFixed(3)),
    firstTimestamp: firstTs.toISOString(),
    lastTimestamp: lastTs.toISOString(),
    hourlyBucketCount: hourlyBuckets.length,
    derivedHourly8760,
    derivedHourly8760Ready: Array.isArray(derivedHourly8760) && derivedHourly8760.length === 8760,
    peakHourTimestamp: peakBucket?.ts?.toISOString() || null
  };
}

function classifyEvent(text = '') {
  const lower = cleanCell(text).toLowerCase();
  if (!lower) return 'other';
  if (/(trip|shutdown|stopped|disconnect|tripped|kesinti|kapandi)/.test(lower)) return 'trip';
  if (/(overload|over current|overcurrent|surge|aşırı yük|over power)/.test(lower)) return 'overload';
  if (/(battery low|low battery|battery voltage|low soc|low voltage|under voltage|undervoltage|düşük gerilim|düşük soc)/.test(lower)) return 'battery';
  if (/(fault|error|fail|hata|arıza)/.test(lower)) return 'fault';
  return 'other';
}

function eventFlags(text = '') {
  const lower = cleanCell(text).toLowerCase();
  return {
    trip: /(trip|shutdown|stopped|disconnect|tripped|kesinti|kapandi)/.test(lower),
    overload: /(overload|over current|overcurrent|surge|aşırı yük|over power)/.test(lower),
    fault: /(fault|error|fail|hata|arıza)/.test(lower),
    battery: /(battery low|low battery|battery voltage|low soc|low voltage|under voltage|undervoltage|düşük gerilim|düşük soc)/.test(lower)
  };
}

function summarizeEventRows(rows = [], columns = {}) {
  const events = [];
  for (const row of rows) {
    const timestamp = parseTimestamp(row[columns.timestampIdx]);
    const severity = columns.severityIdx != null ? cleanCell(row[columns.severityIdx]) : '';
    const code = columns.codeIdx != null ? cleanCell(row[columns.codeIdx]) : '';
    const messageCell = columns.messageIdx != null ? cleanCell(row[columns.messageIdx]) : row.map(cleanCell).join(' ');
    const text = [severity, code, messageCell].filter(Boolean).join(' | ');
    if (!text) continue;
    events.push({ timestamp, severity, code, text, type: classifyEvent(text), flags: eventFlags(text) });
  }
  if (!events.length) throw new Error('Geçerli inverter olay kaydı bulunamadı.');
  const timedEvents = events.filter(event => event.timestamp).sort((a, b) => a.timestamp - b.timestamp);
  return {
    kind: 'inverter-event-log',
    eventCount: events.length,
    tripCount: events.filter(event => event.flags.trip).length,
    overloadCount: events.filter(event => event.flags.overload).length,
    faultCount: events.filter(event => event.flags.fault).length,
    batteryAlarmCount: events.filter(event => event.flags.battery).length,
    firstTimestamp: timedEvents[0]?.timestamp?.toISOString() || null,
    lastTimestamp: timedEvents[timedEvents.length - 1]?.timestamp?.toISOString() || null,
    uniqueCodes: [...new Set(events.map(event => event.code).filter(Boolean))].slice(0, 20),
    criticalEventCount: events.filter(event => event.type !== 'other').length
  };
}

export function parseHighResolutionLoadText(text, { kind = 'load' } = {}) {
  const rows = parseDelimitedRows(text);
  if (rows.length < 2) throw new Error('Dosya en az iki satır içermeli.');
  const columns = detectTableColumns(rows);
  const unitHint = inferUnitHint(columns.header);
  const dataRows = rows.slice(1);
  const samples = dataRows.map((row, idx) => {
    const timestamp = parseTimestamp(row[columns.timestampIdx]);
    const value = finite(row[columns.valueIdx], NaN);
    if (!timestamp || !Number.isFinite(value) || value < 0) return null;
    return { timestamp, value, rowNumber: idx + 2 };
  }).filter(Boolean);
  const summary = summarizeLoadSamples(samples, unitHint);
  return { ...summary, loadProfileKind: kind };
}

export function parseInverterEventLogText(text) {
  const rows = parseDelimitedRows(text);
  if (rows.length < 2) throw new Error('Dosya en az iki satır içermeli.');
  const columns = detectTableColumns(rows);
  return summarizeEventRows(rows.slice(1), columns);
}

export function isSpreadsheetFilename(name = '') {
  return /\.(xlsx|xls)$/i.test(String(name || ''));
}
