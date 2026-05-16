import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GoogleMapAdapter,
  buildGoogleMapsScriptUrl,
  loadGoogleMaps,
  resolveGoogleMapsClasses
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

  it('creates a Google Maps script element when a runtime key is available', async () => {
    const previousGoogle = globalThis.google;
    let appendedScript = null;
    const doc = {
      head: {
        appendChild(script) {
          appendedScript = script;
          globalThis.google = { maps: {} };
          script._handlers.load();
        }
      },
      querySelector() { return null; },
      createElement(tag) {
        assert.equal(tag, 'script');
        return {
          dataset: {},
          _handlers: {},
          addEventListener(event, handler) { this._handlers[event] = handler; }
        };
      }
    };
    await loadGoogleMaps('runtime-key', doc);
    assert.ok(appendedScript, 'script element should be appended');
    assert.match(appendedScript.src, /^https:\/\/maps\.googleapis\.com\/maps\/api\/js\?/);
    assert.match(appendedScript.src, /key=runtime-key/);
    assert.match(appendedScript.src, /loading=async/);
    assert.doesNotMatch(appendedScript.src, /libraries=places/);
    globalThis.google = previousGoogle;
  });
});

describe('GoogleMapAdapter', () => {
  it('passes clicked lat/lon to the location update callback', () => {
    let clickHandler = null;
    class MapCtor {
      constructor() { this.zoom = 6; }
      addListener(event, handler) { if (event === 'click') clickHandler = handler; }
      setCenter(center) { this.center = center; }
      setZoom(zoom) { this.zoom = zoom; }
      getZoom() { return this.zoom; }
      getCenter() { return this.center || { lat: 39, lng: 35 }; }
      setMapTypeId(type) { this.type = type; }
      getMapTypeId() { return this.type || 'roadmap'; }
    }
    class MarkerCtor {
      constructor(options) { this.options = options; this.position = options.position; }
      addListener() {}
      setPosition(position) { this.position = position; }
      getPosition() { return { lat: () => this.position.lat, lng: () => this.position.lng }; }
    }
    let selected = null;
    new GoogleMapAdapter({
      container: {},
      MapCtor,
      MarkerCtor,
      SymbolPath: { CIRCLE: 'circle' },
      eventApi: { trigger() {} },
      onLocationSelect: (lat, lng, checkBounds) => { selected = { lat, lng, checkBounds }; }
    });
    clickHandler({ latLng: { lat: () => 39.95, lng: () => 32.85 } });
    assert.deepEqual(selected, { lat: 39.95, lng: 32.85, checkBounds: true });
  });

  it('creates a map with injected MapCtor and does not depend on maps.Map', () => {
    let constructed = false;
    class MapCtor {
      constructor() { constructed = true; this.zoom = 6; }
      addListener() {}
      setCenter(center) { this.center = center; }
      setZoom(zoom) { this.zoom = zoom; }
      getZoom() { return this.zoom; }
      getCenter() { return this.center || { lat: 39, lng: 35 }; }
      setMapTypeId(type) { this.type = type; }
      getMapTypeId() { return this.type || 'roadmap'; }
    }
    const adapter = new GoogleMapAdapter({ container: {}, MapCtor, MarkerCtor: undefined });
    assert.equal(constructed, true);
    assert.ok(adapter.map);
    adapter.setMarkerPosition([40, 30]);
    assert.deepEqual(adapter.selectedPosition, { lat: 40, lng: 30 });
  });

  it('resolves MapCtor from importLibrary("maps") when google.maps.Map is not ready', async () => {
    class ImportedMapCtor {}
    const resolved = await resolveGoogleMapsClasses({
      maps: {
        importLibrary(name) {
          assert.equal(name, 'maps');
          return Promise.resolve({ Map: ImportedMapCtor });
        }
      }
    });
    assert.equal(resolved.MapCtor, ImportedMapCtor);
    assert.equal(resolved.MarkerCtor, null);
  });

  it('keeps MarkerCtor optional so missing markers do not block map init', () => {
    class MapCtor {
      constructor() { this.zoom = 6; }
      addListener() {}
      setCenter(center) { this.center = center; }
      setZoom(zoom) { this.zoom = zoom; }
      getZoom() { return this.zoom; }
      getCenter() { return this.center || { lat: 39, lng: 35 }; }
      setMapTypeId(type) { this.type = type; }
      getMapTypeId() { return this.type || 'roadmap'; }
    }
    const adapter = new GoogleMapAdapter({
      container: {},
      MapCtor,
      MarkerCtor: null,
      cities: [{ name: 'Ankara', lat: 39.93, lon: 32.85, ghi: 1620 }]
    });
    assert.ok(adapter.map);
    assert.equal(adapter.marker, null);
    assert.deepEqual(adapter.cityMarkers, []);
  });
});
