export const MAP_PROVIDER_CONFIG = Object.freeze({
  productionDefault: 'google',
  developmentDefault: 'google',
  fallback: 'manualCoordinate',
  optionalTileProviders: Object.freeze({
    osm: Object.freeze({ enabledByDefault: false }),
    carto: Object.freeze({ enabledByDefault: false })
  })
});

export function getRuntimeEnv() {
  try {
    return typeof import.meta !== 'undefined' ? (import.meta.env || {}) : {};
  } catch {
    return {};
  }
}

export function getGoogleMapsApiKey() {
  const env = getRuntimeEnv();
  return String(
    env?.VITE_GOOGLE_MAPS_API_KEY
    || globalThis?.SOLAR_ROTA_CONFIG?.GOOGLE_MAPS_API_KEY
    || globalThis?.SOLAR_ROTA_CONFIG?.VITE_GOOGLE_MAPS_API_KEY
    || ''
  ).trim();
}

export function getDefaultMapProvider() {
  return MAP_PROVIDER_CONFIG.productionDefault;
}

export function hasGoogleMapsApiKey() {
  return getGoogleMapsApiKey().length > 0;
}
