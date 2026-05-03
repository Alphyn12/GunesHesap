// USD/TRY exchange-rate service with live fetch, local cache, and safe fallback.
export const EXCHANGE_RATE_CACHE_KEY = 'guneshesap_usd_try_rate_v1';
export const FALLBACK_USD_TRY = 40.0;

function storageGet(storage, key) {
  try { return storage?.getItem?.(key) ?? null; } catch { return null; }
}

function storageSet(storage, key, value) {
  try { storage?.setItem?.(key, value); } catch { /* ignore */ }
}

export function readCachedUsdTryRate(storage = globalThis.localStorage) {
  try {
    const cached = JSON.parse(storageGet(storage, EXCHANGE_RATE_CACHE_KEY) || 'null');
    if (cached && Number(cached.rate) > 0) return cached;
  } catch { /* ignore */ }
  return null;
}

export function cacheUsdTryRate(rate, source = 'live', storage = globalThis.localStorage, timestamp = new Date().toISOString()) {
  const payload = {
    rate: Number(rate),
    source,
    timestamp
  };
  if (payload.rate > 0) storageSet(storage, EXCHANGE_RATE_CACHE_KEY, JSON.stringify(payload));
  return payload;
}

export function convertTry(valueTry, currency = 'TRY', usdTryRate = FALLBACK_USD_TRY) {
  const raw = Number(valueTry) || 0;
  if (currency !== 'USD') return raw;
  const rate = Math.max(0.0001, Number(usdTryRate) || FALLBACK_USD_TRY);
  return raw / rate;
}


const CACHE_TTL_HOURS = 24;

// Birincil: jsdelivr CDN — tarayıcıdan her yerden CORS-safe, response: { usd: { try: 38.5, ... } }
async function fetchJsdelivrRate(fetchImpl) {
  const res = await fetchImpl(
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`jsdelivr CDN HTTP ${res.status}`);
  const data = await res.json();
  const rate = Number(data?.usd?.try);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('geçersiz TRY kuru (jsdelivr)');
  return { rate, source: 'jsdelivr/fawazahmed0', timestamp: new Date().toISOString() };
}

// Yedek: exchangerate-api.com — CORS-safe, response: { rates: { TRY: 38.5 } }
async function fetchExchangeRateApiRate(fetchImpl) {
  const res = await fetchImpl(
    'https://api.exchangerate-api.com/v4/latest/USD',
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`exchangerate-api.com HTTP ${res.status}`);
  const data = await res.json();
  const rate = Number(data?.rates?.TRY);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('geçersiz TRY kuru (exchangerate-api backup)');
  return { rate, source: 'exchangerate-api.com (backup)', timestamp: new Date().toISOString() };
}

export async function fetchLiveUsdTryRate(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  // Birincil API dene, başarısız olursa yedek API
  try {
    return await fetchJsdelivrRate(fetchImpl);
  } catch (primaryErr) {
    try {
      return await fetchExchangeRateApiRate(fetchImpl);
    } catch (backupErr) {
      throw new Error(`Her iki API başarısız: [${primaryErr.message}] / [${backupErr.message}]`);
    }
  }
}

export async function resolveUsdTryRate({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage, allowLive = true } = {}) {
  // Önce cache'i kontrol et — 24 saatten tazeyse canlı fetch yapmadan döndür
  const cached = readCachedUsdTryRate(storage);
  if (cached?.timestamp) {
    const ageHours = (Date.now() - new Date(cached.timestamp).getTime()) / 3600000;
    if (ageHours < CACHE_TTL_HOURS && !allowLive) {
      return { ...cached, source: `${cached.source} (cached, ${ageHours.toFixed(1)}h önce)` };
    }
    // Cache taze ama canlı de isteniyorsa önce dene, başarısız olursa cache kullan
    if (ageHours < CACHE_TTL_HOURS && allowLive) {
      try {
        const live = await fetchLiveUsdTryRate(fetchImpl);
        return cacheUsdTryRate(live.rate, live.source, storage, live.timestamp);
      } catch {
        return { ...cached, source: `${cached.source} (cached, ${ageHours.toFixed(1)}h önce)` };
      }
    }
  }
  if (allowLive) {
    try {
      const live = await fetchLiveUsdTryRate(fetchImpl);
      return cacheUsdTryRate(live.rate, live.source, storage, live.timestamp);
    } catch { /* fall through to stale cache/fallback */ }
  }
  if (cached) return { ...cached, source: `${cached.source || 'cached'} (eski cached)` };
  return { rate: FALLBACK_USD_TRY, source: 'sabit yedek değer', timestamp: null, fallback: true };
}

export function formatRateMeta(meta, locale = 'tr') {
  if (!meta) return '';
  const stamp = meta.timestamp
    ? new Date(meta.timestamp).toLocaleString(locale === 'tr' ? 'tr-TR' : locale === 'de' ? 'de-DE' : 'en-US')
    : 'timestamp unavailable';
  return `USD/TRY ${Number(meta.rate).toFixed(2)} | ${meta.source} | ${stamp}`;
}

function syncRateInputs(rate) {
  const value = Number(rate).toFixed(2);
  const input = document.getElementById('usd-try-input');
  const nmInput = document.getElementById('usd-try-input-nm');
  if (input) input.value = value;
  if (nmInput) nmInput.value = value;
}

export async function initExchangeRateService() {
  const state = window.state || {};
  const meta = await resolveUsdTryRate();
  if (state.exchangeRate?.source === 'manual') {
    syncRateInputs(state.exchangeRate.rate);
    renderExchangeRateStatus();
    return state.exchangeRate;
  }
  state.usdToTry = meta.rate;
  state.exchangeRate = meta;
  syncRateInputs(meta.rate);
  renderExchangeRateStatus();
  return meta;
}

export async function refreshExchangeRate() {
  const meta = await resolveUsdTryRate({ allowLive: true });
  window.state.usdToTry = meta.rate;
  window.state.exchangeRate = meta;
  syncRateInputs(meta.rate);
  renderExchangeRateStatus();
  window.updateTariffAssumptions?.();
  // ui-render gibi tüketici modüller bu event'i dinler — exchange-rate doğrudan
  // renderResults referansına bağlanmıyor (loose coupling, test edilebilirlik için).
  if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
    document.dispatchEvent(new CustomEvent('exchange-rate-refreshed', { detail: meta }));
  }
  return meta;
}

export function setManualUsdTryRate(rate, storage = globalThis.localStorage) {
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    renderExchangeRateStatus();
    return window.state?.exchangeRate || null;
  }
  const meta = cacheUsdTryRate(numericRate, 'manual', storage);
  window.state.usdToTry = meta.rate;
  window.state.exchangeRate = meta;
  renderExchangeRateStatus();
  return meta;
}

export function renderExchangeRateStatus() {
  const meta = window.state?.exchangeRate;
  const locale = window.i18n?.locale || 'tr';

  const el = document.getElementById('exchange-rate-status');
  if (el) {
    if (meta?.fallback) {
      el.textContent = `⚠ Canlı kur alınamadı — ₺${Number(meta.rate).toFixed(2)} (sabit yedek)`;
      el.style.color = 'var(--primary)';
    } else if (meta?.source?.includes('cached')) {
      el.textContent = `📦 Önbellek — ${formatRateMeta(meta, locale)}`;
      el.style.color = '';
    } else {
      el.textContent = formatRateMeta(meta, locale);
      el.style.color = '';
    }
  }

  const headerEl = document.getElementById('exchange-rate-status-header');
  if (headerEl && meta?.rate) {
    headerEl.textContent = `₺${Number(meta.rate).toFixed(2)}`;
    headerEl.title = formatRateMeta(meta, locale);
    headerEl.style.color = meta.fallback ? 'var(--primary)' : 'var(--text-muted)';
  }

  const settingsEl = document.getElementById('exchange-rate-status-settings');
  if (settingsEl) {
    if (meta?.rate) {
      settingsEl.textContent = meta.fallback
        ? `⚠ Canlı kur alınamadı — sabit yedek kullanılıyor`
        : formatRateMeta(meta, locale);
      settingsEl.style.color = meta.fallback ? 'var(--primary)' : '';
    }
  }

  const settingsInput = document.getElementById('usd-try-settings');
  if (settingsInput && meta?.rate && !settingsInput.matches(':focus')) {
    settingsInput.value = Number(meta.rate).toFixed(2);
  }
}

if (typeof window !== 'undefined') {
  window.initExchangeRateService = initExchangeRateService;
  window.refreshExchangeRate = refreshExchangeRate;
  window.setManualUsdTryRate = setManualUsdTryRate;
  window.renderExchangeRateStatus = renderExchangeRateStatus;
}
