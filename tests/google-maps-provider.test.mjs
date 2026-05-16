import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GoogleMapAdapter,
  buildGoogleMapsScriptUrl,
  buildGoogleMapOptions,
  createCircleMarkerIcon,
  DEFAULT_GOOGLE_MAP_TYPE_ID,
  GOOGLE_DARK_MAP_STYLES,
  getGhiMarkerBucket,
  getGhiMarkerColor,
  loadGoogleMaps,
  resolveGoogleMapsClasses,
  waitForGoogleMapConstructor
} from '../js/google-maps-provider.js';
import {
  MAP_PROVIDER_CONFIG,
  getDefaultMapProvider,
  getGoogleMapsApiKey,
  getGoogleMapsMapId
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

  it('reads runtime map id names without hard-coding a value', () => {
    const previous = globalThis.SOLAR_ROTA_CONFIG;
    globalThis.SOLAR_ROTA_CONFIG = { VITE_GOOGLE_MAPS_MAP_ID: 'runtime-map-id' };
    assert.equal(getGoogleMapsMapId(), 'runtime-map-id');
    globalThis.SOLAR_ROTA_CONFIG = { GOOGLE_MAPS_MAP_ID: 'runtime-map-id-2' };
    assert.equal(getGoogleMapsMapId(), 'runtime-map-id-2');
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
    class AdvancedMarkerElement {}
    const resolved = await resolveGoogleMapsClasses({
      maps: {
        importLibrary(name) {
          if (name === 'marker') return Promise.resolve({ AdvancedMarkerElement });
          assert.equal(name, 'maps');
          return Promise.resolve({ Map: ImportedMapCtor });
        }
      }
    });
    assert.equal(resolved.MapCtor, ImportedMapCtor);
    assert.equal(resolved.AdvancedMarkerCtor, AdvancedMarkerElement);
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
    assert.equal(getGhiMarkerBucket(1490).className, 'solar-map-marker--gte1600');
  });

  it('builds Google map options without local styles when mapId is present', () => {
    const options = buildGoogleMapOptions({
      center: { lat: 39, lng: 35 },
      zoom: 7,
      mapId: 'test-map-id',
      mapTypeId: 'hybrid'
    });
    assert.equal(options.mapId, 'test-map-id');
    assert.equal(options.mapTypeId, 'hybrid');
    assert.equal(options.styles, undefined);
    assert.equal(options.disableDefaultUI, true);
  });

  it('keeps local dark roadmap styles only for the no-mapId fallback', () => {
    const options = buildGoogleMapOptions({
      mapTypeId: 'roadmap',
      mapId: '',
      theme: 'dark'
    });
    assert.equal(options.mapId, undefined);
    assert.equal(options.mapTypeId, 'roadmap');
    assert.equal(options.styles, GOOGLE_DARK_MAP_STYLES);
  });

  it('uses hybrid by default and disables native Google controls that collide with custom tools', () => {
    let mapOptions = null;
    class MapCtor {
      constructor(_container, options) { mapOptions = options; this.zoom = options.zoom; this.type = options.mapTypeId; }
      addListener() {}
      setCenter(center) { this.center = center; }
      setZoom(zoom) { this.zoom = zoom; }
      getZoom() { return this.zoom; }
      getCenter() { return this.center || { lat: 39, lng: 35 }; }
      setMapTypeId(type) { this.type = type; }
      getMapTypeId() { return this.type; }
    }
    const adapter = new GoogleMapAdapter({ container: {}, MapCtor, mapId: 'test-map-id' });
    assert.equal(DEFAULT_GOOGLE_MAP_TYPE_ID, 'hybrid');
    assert.equal(mapOptions.mapTypeId, 'hybrid');
    assert.equal(mapOptions.mapId, 'test-map-id');
    assert.equal(mapOptions.disableDefaultUI, true);
    assert.equal(mapOptions.fullscreenControl, false);
    assert.equal(mapOptions.streetViewControl, false);
    assert.equal(mapOptions.mapTypeControl, false);
    assert.equal(mapOptions.zoomControl, false);
    assert.equal(mapOptions.styles, undefined);
    adapter.setMapType('hybrid');
    assert.equal(adapter.getMapType(), 'hybrid');
    adapter.setMapType('roadmap');
    assert.equal(adapter.getMapType(), 'roadmap');
  });

  it('prefers AdvancedMarkerElement so production avoids deprecated google.maps.Marker', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
      createElement() {
        return {
          className: '',
          appendChild() {}
        };
      }
    };
    let advancedUsed = false;
    const contents = [];
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
    class AdvancedMarkerCtor {
      constructor(options) { advancedUsed = true; this.position = options.position; this.content = options.content; contents.push(options.content); }
      addListener() {}
    }
    class MarkerCtor {
      constructor() { throw new Error('legacy Marker should not be used'); }
    }
    const adapter = new GoogleMapAdapter({
      container: {},
      MapCtor,
      AdvancedMarkerCtor,
      MarkerCtor,
      mapId: 'test-map-id',
      cities: [{ name: 'Ankara', lat: 39.93, lon: 32.85, ghi: 1620 }]
    });
    assert.equal(advancedUsed, true);
    assert.ok(adapter.marker);
    assert.ok(contents.some(content => content?.className?.includes('solar-map-marker--gte1700')));
    globalThis.document = previousDocument;
  });

  it('falls back to legacy SVG circle markers when mapId is missing', () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
      createElement() {
        return {
          className: '',
          appendChild() {}
        };
      }
    };
    let advancedUsed = false;
    let legacyUsed = false;
    class MapCtor {
      constructor(_container, options) { this.options = options; this.zoom = 6; }
      addListener() {}
      setCenter(center) { this.center = center; }
      setZoom(zoom) { this.zoom = zoom; }
      getZoom() { return this.zoom; }
      getCenter() { return this.center || { lat: 39, lng: 35 }; }
      setMapTypeId(type) { this.type = type; }
      getMapTypeId() { return this.type || 'roadmap'; }
    }
    class AdvancedMarkerCtor {
      constructor() { advancedUsed = true; }
    }
    class MarkerCtor {
      constructor(options) { legacyUsed = true; this.position = options.position; }
      addListener() {}
      setPosition(position) { this.position = position; }
      getPosition() { return { lat: () => this.position.lat, lng: () => this.position.lng }; }
    }
    const adapter = new GoogleMapAdapter({
      container: {},
      MapCtor,
      AdvancedMarkerCtor,
      MarkerCtor
    });
    assert.equal(advancedUsed, false);
    assert.equal(legacyUsed, true);
    assert.ok(adapter.marker);
    globalThis.document = previousDocument;
  });

  it('renders simplified roof drawing tools without an edit button', () => {
    const previousDocument = globalThis.document;
    class FakeElement {
      constructor() {
        this.children = [];
        this.dataset = {};
        this.className = '';
        this.classList = { add() {}, remove() {}, toggle() {} };
      }
      set innerHTML(value) {
        this._innerHTML = value;
        this.children = [...value.matchAll(/data-google-roof-action="([^"]+)"/g)]
          .map(match => {
            const child = new FakeElement();
            child.dataset.googleRoofAction = match[1];
            child.disabled = false;
            return child;
          });
      }
      get innerHTML() { return this._innerHTML || ''; }
      appendChild(child) { this.children.push(child); child.parent = this; }
      addEventListener() {}
      querySelector(selector) {
        if (selector === '.google-roof-tools') return this.children.find(child => child.className === 'google-roof-tools') || null;
        if (selector === '[data-google-roof-action]') return this.children.find(child => child.dataset.googleRoofAction) || null;
        return null;
      }
      querySelectorAll(selector) {
        if (selector === '[data-google-roof-action]') return this.children.filter(child => child.dataset.googleRoofAction);
        return [];
      }
    }
    globalThis.document = {
      createElement() { return new FakeElement(); }
    };
    const container = new FakeElement();
    class MapCtor {
      constructor() { this.zoom = 6; }
      addListener() {}
      setCenter(center) { this.center = center; }
      setZoom(zoom) { this.zoom = zoom; }
      getZoom() { return this.zoom; }
      getCenter() { return this.center || { lat: 39, lng: 35 }; }
      setMapTypeId(type) { this.type = type; }
      getMapTypeId() { return this.type || 'hybrid'; }
    }
    new GoogleMapAdapter({ container, MapCtor });
    const tools = container.querySelector('.google-roof-tools');
    const actions = tools.querySelectorAll('[data-google-roof-action]').map(button => button.dataset.googleRoofAction);
    assert.deepEqual(actions, ['draw', 'finish', 'undo', 'clear']);
    assert.equal(actions.includes('edit'), false);
    assert.equal(actions.includes('rectangle'), false);
    globalThis.document = previousDocument;
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

  it('supports rectangle drawing as a four-corner polygon', () => {
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
      constructor(options) { this.position = options.position; }
      addListener() {}
      setMap(map) { this.map = map; }
      setPosition(position) { this.position = position; }
      getPosition() { return { lat: () => this.position.lat, lng: () => this.position.lng }; }
    }
    class PolylineCtor { constructor(options) { this.options = options; } setMap(map) { this.map = map; } }
    class PolygonCtor { constructor(options) { this.options = options; } setMap(map) { this.map = map; } }
    const events = [];
    const adapter = new GoogleMapAdapter({
      container: {},
      MapCtor,
      MarkerCtor,
      PolylineCtor,
      PolygonCtor,
      onRoofPolygonsChange: (polygons, reason) => events.push({ polygons, reason })
    });
    adapter.startRoofDrawing('rectangle');
    listeners.click({ latLng: { lat: () => 41, lng: () => 29 } });
    listeners.click({ latLng: { lat: () => 41.002, lng: () => 29.003 } });
    assert.equal(events.at(-1).reason, 'complete');
    assert.deepEqual(events.at(-1).polygons[0], [
      { lat: 41, lng: 29 },
      { lat: 41, lng: 29.003 },
      { lat: 41.002, lng: 29.003 },
      { lat: 41.002, lng: 29 }
    ]);
  });
});
