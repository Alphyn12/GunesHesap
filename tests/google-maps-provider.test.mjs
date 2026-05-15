import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GoogleMapAdapter,
  buildGoogleMapsScriptUrl,
  loadGoogleMaps
} from '../js/google-maps-provider.js';
import {
  MAP_PROVIDER_CONFIG,
  getDefaultMapProvider,
  getGoogleMapsApiKey
} from '../js/map-provider-config.js';

describe('Google Maps provider config', () => {
  it('production default is Google and OSM/Carto are optional', () => {
    assert.equal(getDefaultMapProvider(), 'google');
    assert.equal(MAP_PROVIDER_CONFIG.fallback, 'manualCoordinate');
    assert.equal(MAP_PROVIDER_CONFIG.optionalTileProviders.osm.enabledByDefault, false);
    assert.equal(MAP_PROVIDER_CONFIG.optionalTileProviders.carto.enabledByDefault, false);
  });

  it('reads runtime key names without hard-coding a key', () => {
    const previous = globalThis.SOLAR_ROTA_CONFIG;
    globalThis.SOLAR_ROTA_CONFIG = { VITE_GOOGLE_MAPS_API_KEY: 'runtime-key' };
    assert.equal(getGoogleMapsApiKey(), 'runtime-key');
    globalThis.SOLAR_ROTA_CONFIG = previous;
  });
});

describe('Google Maps script loader', () => {
  it('builds Maps JavaScript API URL without places library', () => {
    const url = buildGoogleMapsScriptUrl('abc123');
    assert.match(url, /^https:\/\/maps\.googleapis\.com\/maps\/api\/js\?/);
    assert.match(url, /key=abc123/);
    assert.match(url, /loading=async/);
    assert.doesNotMatch(url, /libraries=places/);
    assert.doesNotMatch(url, /routes|geocoding|solar/i);
  });

  it('rejects without an API key instead of throwing synchronously', async () => {
    await assert.rejects(() => loadGoogleMaps('', { createElement() {}, head: {} }), /missing-api-key/);
  });
});

describe('GoogleMapAdapter', () => {
  it('passes clicked lat/lon to the location update callback', () => {
    let clickHandler = null;
    const maps = {
      SymbolPath: { CIRCLE: 'circle' },
      Map: class {
        constructor() { this.zoom = 6; }
        addListener(event, handler) { if (event === 'click') clickHandler = handler; }
        setCenter(center) { this.center = center; }
        setZoom(zoom) { this.zoom = zoom; }
        getZoom() { return this.zoom; }
        getCenter() { return this.center || { lat: 39, lng: 35 }; }
        setMapTypeId(type) { this.type = type; }
        getMapTypeId() { return this.type || 'roadmap'; }
      },
      Marker: class {
        constructor(options) { this.options = options; this.position = options.position; }
        addListener() {}
        setPosition(position) { this.position = position; }
        getPosition() { return { lat: () => this.position.lat, lng: () => this.position.lng }; }
      },
      event: { trigger() {} }
    };
    let selected = null;
    new GoogleMapAdapter({
      maps,
      container: {},
      onLocationSelect: (lat, lng, checkBounds) => { selected = { lat, lng, checkBounds }; }
    });
    clickHandler({ latLng: { lat: () => 39.95, lng: () => 32.85 } });
    assert.deepEqual(selected, { lat: 39.95, lng: 32.85, checkBounds: true });
  });
});
