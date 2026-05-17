export function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function nonNegativeNumber(value, fallback = 0) {
  return Math.max(0, safeNumber(value, fallback));
}

export function roundNumber(value, digits = 0) {
  const numeric = safeNumber(value, 0);
  const factor = 10 ** Math.max(0, digits);
  return Math.round(numeric * factor) / factor;
}

export function displayValue(value, fallback = 'Hesaplanamadı') {
  if (value === null || value === undefined || value === '') return fallback;
  const text = String(value);
  if (/^(nan|undefined|null)$/i.test(text)) return fallback;
  return text;
}

export function formatCurrency(value, currency = 'TRY', { locale = null, digits = 0, fallback = 'Hesaplanamadı' } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const safeCurrency = currency === 'USD' ? 'USD' : 'TRY';
  const suffix = safeCurrency === 'USD' ? 'USD' : 'TL';
  const activeLocale = locale || (safeCurrency === 'USD' ? 'en-US' : 'tr-TR');
  return numeric.toLocaleString(activeLocale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  }) + ' ' + suffix;
}

export function formatKwh(value, suffix = 'kWh') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Hesaplanamadı';
  return Math.round(numeric).toLocaleString('tr-TR') + ` ${suffix}`;
}

export function formatKwp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Hesaplanamadı';
  return numeric.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' kWp';
}

export function formatPercent(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Hesaplanamadı';
  return numeric.toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: 0 }) + '%';
}

export function formatYears(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '25 yıl içinde oluşmuyor';
  return numeric.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' yıl';
}
