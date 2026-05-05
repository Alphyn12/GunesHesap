import { buildPvEngineRequest, getPvEngineRequestIssues, normalizePvEngineResponse } from './pv-engine-contracts.js';
import { BACKEND_CONFIG, buildBackendUrl, buildAuthHeaders } from './backend-config.js';

export const PVLIB_BRIDGE_STATUS = 'python-pvlib-mvp-ready';

function fetchWithTimeout(fetchImpl, endpoint, init, timeoutMs) {
  if (typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetchImpl(endpoint, { ...init, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }
  let timer;
  return Promise.race([
    fetchImpl(endpoint, init),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`backend timeout after ${timeoutMs}ms`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

export async function checkBackendHealth({ endpoint = buildBackendUrl(BACKEND_CONFIG.healthPath), fetchImpl = globalThis.fetch, timeoutMs = BACKEND_CONFIG.connectTimeoutMs } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  // /health endpoint'i auth gerektirmez — sadece accept header
  const res = await fetchWithTimeout(fetchImpl, endpoint, { method: 'GET', headers: { accept: 'application/json' } }, timeoutMs);
  if (!res.ok) throw new Error(`backend health HTTP ${res.status}`);
  return res.json();
}

export async function callPythonEngineeringBackend(state = {}, { endpoint = buildBackendUrl(BACKEND_CONFIG.pvCalculatePath), fetchImpl = globalThis.fetch, timeoutMs = BACKEND_CONFIG.connectTimeoutMs } = {}) {
  const request = buildPvEngineRequest(state);
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  const requestIssues = getPvEngineRequestIssues(request);
  if (requestIssues.length) {
    throw new Error(`backend request blocked: ${requestIssues.join(', ')}`);
  }

  // TODO(pvlib): deepen the backend MVP model chain:
  // - pvlib irradiance transposition and AOI losses
  // - temperature model selection by mounting type
  // - inverter clipping and part-load efficiency curves
  // - hourly battery dispatch with critical-load reserve
  // - bankable uncertainty bands and source provenance
  const res = await fetchWithTimeout(fetchImpl, endpoint, {
    method: 'POST',
    headers: buildAuthHeaders(),   // X-Api-Key + X-Timestamp (key tanımlıysa)
    body: JSON.stringify(request)
  }, timeoutMs);
  if (!res.ok) throw new Error(`python engineering backend HTTP ${res.status}`);
  return normalizePvEngineResponse(await res.json());
}

export function callPvlibService(state = {}, options = {}) {
  const endpoint = options.endpoint || buildBackendUrl(BACKEND_CONFIG.pvlibCompatPath);
  return callPythonEngineeringBackend(state, { ...options, endpoint });
}

export async function callPanelThermalCheck(payload, { endpoint = buildBackendUrl(BACKEND_CONFIG.panelThermalCheckPath), fetchImpl = globalThis.fetch, timeoutMs = BACKEND_CONFIG.connectTimeoutMs } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  const res = await fetchWithTimeout(fetchImpl, endpoint, {
    method: 'POST',
    headers: buildAuthHeaders(),   // X-Api-Key + X-Timestamp (key tanımlıysa)
    body: JSON.stringify(payload)
  }, timeoutMs);
  if (res.status === 422) {
    let detail = 'invalid datasheet input';
    try {
      const body = await res.json();
      if (body && typeof body.detail === 'string') detail = body.detail;
    } catch { /* non-JSON 422 */ }
    return { ok: false, status: 422, error: detail };
  }
  if (!res.ok) throw new Error(`panel thermal-check HTTP ${res.status}`);
  const data = await res.json();
  return { ok: true, status: res.status, data };
}

export function describePvlibBridge() {
  return {
    status: PVLIB_BRIDGE_STATUS,
    endpoint: buildBackendUrl(BACKEND_CONFIG.pvCalculatePath),
    healthEndpoint: buildBackendUrl(BACKEND_CONFIG.healthPath),
    contract: 'pv-engine-contracts.js',
    fallback: 'js-local/pvgis-hybrid',
    pvlibMvp: true,
    readyForBackend: true
  };
}
