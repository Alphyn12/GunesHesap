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

export function isBackendModeEnabled(state = {}, options = {}) {
  const preference = state.enginePreference || 'pvgis-hybrid-js';
  if (['python-backend', 'pvlib-service'].includes(preference)) return true;
  if (preference !== 'auto') return false;
  const windowOptIn = typeof window !== 'undefined' && window.GUNESHESAP_ENABLE_BACKEND_AUTO === true;
  return !!(state.backendAutoDiscoveryEnabled || options.autoDiscover || windowOptIn);
}
