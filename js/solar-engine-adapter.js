import { buildEngineSourceMeta, buildPvEngineRequest } from './pv-engine-contracts.js';
import { isBackendModeEnabled } from './backend-config.js';
import { callPythonEngineeringBackend, describePvlibBridge } from './pvlib-bridge.js';

export const ENGINE_KEYS = {
  AUTO: 'auto',
  JS_LOCAL: 'js-local',
  PVGIS_HYBRID: 'pvgis-hybrid-js',
  PYTHON_BACKEND: 'python-backend',
  PVLIB_SERVICE: 'pvlib-service'
};

export function createSolarEngineContext(state = {}) {
  const request = buildPvEngineRequest(state);
  const selectedEngine = state.enginePreference || ENGINE_KEYS.AUTO;
  return {
    request,
    selectedEngine,
    availableEngines: [
      { key: ENGINE_KEYS.AUTO, label: 'Auto: Python backend with JS/PVGIS fallback', active: selectedEngine === ENGINE_KEYS.AUTO, bridge: describePvlibBridge() },
      { key: ENGINE_KEYS.JS_LOCAL, label: 'Local simplified JS', active: false },
      { key: ENGINE_KEYS.PVGIS_HYBRID, label: 'PVGIS hybrid JS', active: true },
      { key: ENGINE_KEYS.PYTHON_BACKEND, label: 'Python engineering backend', active: selectedEngine === ENGINE_KEYS.PYTHON_BACKEND, bridge: describePvlibBridge() },
      { key: ENGINE_KEYS.PVLIB_SERVICE, label: 'Python pvlib-compatible endpoint', active: selectedEngine === ENGINE_KEYS.PVLIB_SERVICE, bridge: describePvlibBridge() }
    ]
  };
}

export async function resolveExternalEngine(state = {}, options = {}) {
  if (!isBackendModeEnabled(state, options)) return null;
  try {
    return await callPythonEngineeringBackend(state, options);
  } catch (error) {
    return {
      failed: true,
      error: error?.message || String(error),
      // PVGIS_HYBRID engine'i kendisi bir fallback (local-PSH) değil — workflow seviyesinde
      // Python backend'den buna düştük. Bu yüzden engine metadata'da usedFallback=false kalır;
      // workflow tarafı `failed: true` ve `attemptedEngine` ile gerçek fallback'i raporlar.
      fallbackEngineSource: buildEngineSourceMeta({ engine: ENGINE_KEYS.PVGIS_HYBRID, usedFallback: false }),
      attemptedEngine: state.enginePreference || ENGINE_KEYS.AUTO
    };
  }
}

export function sourceMetaForCurrentCalculation({ usedFallback = false } = {}) {
  return buildEngineSourceMeta({ engine: usedFallback ? ENGINE_KEYS.JS_LOCAL : ENGINE_KEYS.PVGIS_HYBRID, usedFallback });
}
