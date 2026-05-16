import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GoogleMapAdapter,
  buildGoogleMapsScriptUrl,
  createCircleMarkerIcon,
  getGhiMarkerColor,
  loadGoogleMaps,
  resolveGoogleMapsClasses,
  waitForGoogleMapConstructor
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

  it('waits until google.maps.Map becomes available after a short delay', async () => {
    class DelayedMapCtor {}
    const googleObj = { maps: {} };
    setTimeout(() => { googleObj.maps.Map = DelayedMapCtor; }, 300);
    const MapCtor = await waitForGoogleMapConstructor({
      googleObj,
      timeoutMs: 1000,
      intervalMs: 40
    });
    assert.equal(MapCtor, DelayedMapCtor);
  });

  it('retries after transient importLibrary failures', async () => {
    class ImportedMapCtor {}
    let attempts = 0;
    const MapCtor = await waitForGoogleMapConstructor({
      googleObj: {
        maps: {
          importLibrary(name) {
            assert.equal(name, 'maps');
            attempts += 1;
            if (attempts === 1) return Promise.reject(new Error('ERR_BLOCKED_BY_CLIENT'));
            return Promise.resolve({ Map: ImportedMapCtor });
          }
        }
      },
      timeoutMs: 500,
      intervalMs: 20
    });
    assert.equal(MapCtor, ImportedMapCtor);
    assert.ok(attempts >= 2);
  });

  it('times out when the Map constructor never becomes available', async () => {
    await assert.rejects(
      () => waitForGoogleMapConstructor({
        googleObj: { maps: {} },
        timeoutMs: 60,
        intervalMs: 10
      }),
      /google-maps-map-constructor-unavailable/
    );
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

  it('renders city GHI markers as custom circular data-svg icons instead of default pins', () => {
    const markerOptions = [];
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
    class MarkerCtor {
      constructor(options) { markerOptions.push(options); this.position = options.position; }
      addListener() {}
      setPosition(position) { this.position = position; }
      getPosition() { return { lat: () => this.position.lat, lng: () => this.position.lng }; }
    }
    new GoogleMapAdapter({
      container: {},
      MapCtor,
      MarkerCtor,
      cities: [{ name: 'Tekirdag', lat: 40.98, lon: 27.51, ghi: 1490 }]
    });
    const cityMarker = markerOptions.find(options => options.title?.includes('Tekirdag'));
    assert.ok(cityMarker?.icon?.url?.startsWith('data:image/svg+xml'), 'city marker must use custom SVG circle icon');
    assert.match(cityMarker.icon.url, /circle/);
    assert.notEqual(cityMarker.icon, undefined);
    assert.equal(getGhiMarkerColor(1490), '#22C55E');
    assert.match(createCircleMarkerIcon('#22C55E').url, /%2322C55E/);
  });

  it('creates, completes, edits, and clears Google roof polygons', () => {
    const listeners = {};
    class MapCtor {
      constructor() { this.zoom = 6; }
      addListener(event, handler) { listeners[event] = handler; }
      setCenter(center) { this.center = center; }
      setZoom(zoom) { this.zoom = zoom; }
      getZoom() { return this.zoom; }
      getCenter() { return this.center || { lat: 39, lng: 35 }; }
      setMapTypeId(type) { this.type = type; }
      getMapTypeId() { return this.type || 'roadmap'; }
    }
    class MarkerCtor {
      constructor(options) { this.options = options; this.position = options.position; }
      addListener(event, handler) { this.dragHandler = handler; }
      setPosition(position) { this.position = position; }
      setMap(map) { this.map = map; }
      getPosition() { return { lat: () => this.position.lat, lng: () => this.position.lng }; }
    }
    class PolylineCtor {
      constructor(options) { this.options = options; }
      setMap(map) { this.map = map; }
    }
    class PolygonCtor {
      constructor(options) { this.options = options; }
      setMap(map) { this.map = map; }
    }
    const events = [];
    const adapter = new GoogleMapAdapter({
      container: {},
      MapCtor,
      MarkerCtor,
      PolylineCtor,
      PolygonCtor,
      onRoofPolygonsChange: (polygons, reason) => events.push({ polygons, reason })
    });
    adapter.startRoofDrawing();
    listeners.click({ latLng: { lat: () => 41, lng: () => 29 } });
    listeners.click({ latLng: { lat: () => 41, lng: () => 29.001 } });
    listeners.click({ latLng: { lat: () => 41.001, lng: () => 29.001 } });
    adapter.finishRoofDrawing();
    assert.equal(events.at(-1).reason, 'complete');
    assert.equal(events.at(-1).polygons[0].length, 3);
    adapter.vertexMarkers[0].dragHandler({ latLng: { lat: () => 41.0005, lng: () => 29.0005 } });
    assert.equal(events.at(-1).reason, 'edit');
    adapter.clearRoofDrawing();
    assert.deepEqual(events.at(-1), { polygons: [], reason: 'clear' });
  });
});
