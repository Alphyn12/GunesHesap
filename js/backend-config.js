export const BACKEND_CONFIG = {
  defaultBaseUrl: 'http://127.0.0.1:8000',
  storageKey: 'guneshesap_backend_base_url_v1',
  connectTimeoutMs: 4000,
  healthPath: '/health',
  pvCalculatePath: '/api/pv/calculate',
  pvlibCompatPath: '/api/pvlib/calculate',
  financialPath: '/api/financial/proposal',
  pvgisProxyPath: '/api/pvgis-proxy',
  panelThermalCheckPath: '/api/panel/thermal-check'
};

function cleanBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

export function getBackendBaseUrl() {
  const explicit = typeof window !== 'undefined' ? window.GUNESHESAP_BACKEND_URL : '';
  if (explicit) return cleanBaseUrl(explicit);
  try {
    const stored = localStorage.getItem(BACKEND_CONFIG.storageKey);
    if (stored) return cleanBaseUrl(stored);
  } catch {
    // localStorage can be unavailable in private or file contexts.
  }
  return BACKEND_CONFIG.defaultBaseUrl;
}

export function setBackendBaseUrl(value) {
  const next = cleanBaseUrl(value);
  try {
    if (next) localStorage.setItem(BACKEND_CONFIG.storageKey, next);
    else localStorage.removeItem(BACKEND_CONFIG.storageKey);
  } catch {
    // Best-effort developer setting only.
  }
  return next || BACKEND_CONFIG.defaultBaseUrl;
}

export function buildBackendUrl(path = BACKEND_CONFIG.pvCalculatePath, baseUrl = getBackendBaseUrl()) {
  const base = cleanBaseUrl(baseUrl) || BACKEND_CONFIG.defaultBaseUrl;
  const suffix = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  return `${base}${suffix}`;
}

/**
 * Güvenlik (S-04 / S-08 düzeltmesi): Backend API çağrıları için auth header'ları üretir.
 *
 * Key kaynağı öncelik sırası:
 *   1. window.SOLARROTA_API_KEY  — deployment'ta HTML'e inject edilir (en güvenli)
 *   2. localStorage'da saklı key  — kullanıcı ayarlarından manuel ayar
 *   3. Boş string               — dev-mode, key göndermez (backend auth'u atlar)
 *
 * Dev-mode (key boş): sadece content-type döner, X-Api-Key header eklenmez.
 * Production: X-Api-Key + X-Timestamp header'ları eklenir.
 * X-Timestamp: replay attack koruması için Unix ms cinsinden zaman damgası.
 */
export function buildAuthHeaders(extraHeaders = {}) {
  const apiKey = (
    (typeof window !== 'undefined' && window.SOLARROTA_API_KEY) ||
    (() => { try { return localStorage.getItem('solarrota_api_key_v1') || ''; } catch { return ''; } })()
  ).trim();

  const base = { 'content-type': 'application/json', ...extraHeaders };
  if (!apiKey) return base;   // dev-mode: auth header yok

  return {
    ...base,
    'x-api-key': apiKey,
    'x-timestamp': String(Date.now()),
  };
}

/**
 * Backend (Python pvlib) modunun aktif olup olmadığını belirler.
 *
 * Karar tablosu:
 *  - enginePreference === 'python-backend' veya 'pvlib-service' → her zaman true (kullanıcı açıkça istedi)
 *  - enginePreference != 'auto' → false (klasik JS/PVGIS hibrit)
 *  - 'auto' modunda backend yalnızca üç açık opt-in sinyalinden BİRİ varsa devreye girer:
 *      1. state.backendAutoDiscoveryEnabled (ayarlardan kullanıcı işaretledi)
 *      2. options.autoDiscover (test/SDK çağrıları için runtime override)
 *      3. window.GUNESHESAP_ENABLE_BACKEND_AUTO === true (deployment-level global,
 *         backend hazır olduğunda HTML/operasyon ekibi enable eder)
 *
 *  Hiçbir opt-in olmadan 'auto' tercihi backend'i denemez ve sessizce JS/PVGIS yoluna
 *  düşer; gereksiz network çağrısı/timeout yaşatmaz.
 */
export function isBackendModeEnabled(state = {}, options = {}) {
  const preference = state.enginePreference || 'pvgis-hybrid-js';
  if (['python-backend', 'pvlib-service'].includes(preference)) return true;
  if (preference !== 'auto') return false;
  const windowOptIn = typeof window !== 'undefined' && window.GUNESHESAP_ENABLE_BACKEND_AUTO === true;
  return !!(state.backendAutoDiscoveryEnabled || options.autoDiscover || windowOptIn);
}
