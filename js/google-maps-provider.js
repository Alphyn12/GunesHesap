let googleMapsLoadPromise = null;

export const GOOGLE_MAPS_SCRIPT_BASE_URL = 'https://maps.googleapis.com/maps/api/js';

export function buildGoogleMapsScriptUrl(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('missing-api-key');
  const url = new URL(GOOGLE_MAPS_SCRIPT_BASE_URL);
  url.searchParams.set('key', key);
  url.searchParams.set('loading', 'async');
  return url.toString();
}

export function loadGoogleMaps(apiKey, doc = globalThis.document) {
  if (globalThis.google?.maps) return Promise.resolve(globalThis.google.maps);
  const key = String(apiKey || '').trim();
  if (!key) return Promise.reject(new Error('missing-api-key'));
  if (googleMapsLoadPromise) return googleMapsLoadPromise;
  if (!doc?.createElement || !doc.head) return Promise.reject(new Error('document-unavailable'));

  googleMapsLoadPromise = new Promise((resolve, reject) => {
    const existing = doc.querySelector('script[data-solar-rota-google-maps="true"]');
    const previousAuthFailure = globalThis.gm_authFailure;
    let settled = false;
    const cleanup = () => {
      if (globalThis.gm_authFailure === authFailure) {
        if (previousAuthFailure) globalThis.gm_authFailure = previousAuthFailure;
        else {
          try { delete globalThis.gm_authFailure; } catch { globalThis.gm_authFailure = undefined; }
        }
      }
    };
    const rejectOnce = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const authFailure = () => rejectOnce(new Error('google-maps-authorization-failed'));
    globalThis.gm_authFailure = authFailure;
    const done = () => {
      if (globalThis.google?.maps) resolveOnce(globalThis.google.maps);
      else rejectOnce(new Error('google-maps-unavailable'));
    };

    if (existing) {
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', () => rejectOnce(new Error('script-load-failed')), { once: true });
      return;
    }

    const script = doc.createElement('script');
    script.src = buildGoogleMapsScriptUrl(key);
    script.async = true;
    script.defer = true;
    script.dataset.solarRotaGoogleMaps = 'true';
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', () => rejectOnce(new Error('script-load-failed')), { once: true });
    doc.head.appendChild(script);
    globalThis.console?.debug?.('[map-provider] Google Maps script appended');
  }).catch(err => {
    googleMapsLoadPromise = null;
    throw err;
  });

  return googleMapsLoadPromise;
}

export async function resolveGoogleMapsClasses(googleObj = globalThis.google) {
  if (!googleObj?.maps) throw new Error('google-maps-namespace-unavailable');

  let MapCtor = googleObj.maps.Map;
  if (typeof MapCtor !== 'function' && typeof googleObj.maps.importLibrary === 'function') {
    const mapsLibrary = await googleObj.maps.importLibrary('maps');
    MapCtor = mapsLibrary?.Map;
  }
  if (typeof MapCtor !== 'function') throw new Error('google-maps-map-constructor-unavailable');

  return {
    googleObj,
    MapCtor,
    MarkerCtor: typeof googleObj.maps.Marker === 'function' ? googleObj.maps.Marker : null,
    SymbolPath: googleObj.maps.SymbolPath || null,
    eventApi: googleObj.maps.event || null
  };
}

function normalizeLatLng(value) {
  if (Array.isArray(value)) return { lat: Number(value[0]), lng: Number(value[1]) };
  return { lat: Number(value?.lat), lng: Number(value?.lng ?? value?.lon) };
}

export class GoogleMapAdapter {
  constructor({
    container,
    MapCtor,
    MarkerCtor = null,
    SymbolPath = null,
    eventApi = null,
    center = { lat: 39, lng: 35 },
    zoom = 6,
    onLocationSelect,
    cities = [],
    getGhiColor
  }) {
    if (!container) throw new Error('map-container-missing');
    if (typeof MapCtor !== 'function') throw new Error('google-maps-map-constructor-unavailable');
    this.container = container;
    this.MarkerCtor = typeof MarkerCtor === 'function' ? MarkerCtor : null;
    this.SymbolPath = SymbolPath;
    this.eventApi = eventApi;
    this.onLocationSelect = onLocationSelect;
    this.cityMarkers = [];
    this.selectedPosition = center;
    this.map = new MapCtor(container, {
      center,
      zoom,
      mapTypeId: 'roadmap',
      clickableIcons: false,
      streetViewControl: false,
      fullscreenControl: true,
      mapTypeControl: false
    });
    this.marker = this.createMarker({
      position: center,
      draggable: true,
      title: 'Seçili konum',
      onDragEnd: event => {
        const latLng = event.latLng;
        if (!latLng) return;
        this.onLocationSelect?.(latLng.lat(), latLng.lng(), true);
      }
    });
    this.map.addListener('click', event => {
      if (globalThis._drawingMode || globalThis._glarePickMode) return;
      const latLng = event.latLng;
      if (!latLng) return;
      this.onLocationSelect?.(latLng.lat(), latLng.lng(), true);
    });
    if (!this.MarkerCtor) return;
    cities.forEach(city => {
      const color = typeof getGhiColor === 'function' ? getGhiColor(city.ghi) : '#F59E0B';
      const icon = this.SymbolPath?.CIRCLE ? {
        path: this.SymbolPath.CIRCLE,
        scale: 5,
        fillColor: color,
        fillOpacity: 0.78,
        strokeColor: '#ffffff',
        strokeWeight: 1
      } : undefined;
      const marker = this.createMarker({
        position: { lat: city.lat, lng: city.lon },
        title: `${city.name} - GHI: ${city.ghi} kWh/m2/yil`,
        icon,
        clickable: false
      });
      if (marker) this.cityMarkers.push(marker);
    });
  }

  createMarker({ onDragEnd, ...options }) {
    if (!this.MarkerCtor) return null;
    try {
      const marker = new this.MarkerCtor({ map: this.map, ...options });
      if (typeof onDragEnd === 'function' && marker?.addListener) marker.addListener('dragend', onDragEnd);
      return marker;
    } catch (err) {
      globalThis.console?.warn?.('[map-provider] Google marker unavailable:', err);
      return null;
    }
  }

  setMarkerPosition(position) {
    const next = normalizeLatLng(position);
    if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return;
    this.selectedPosition = next;
    this.marker?.setPosition?.(next);
  }

  setView(latLng, zoom = this.map.getZoom()) {
    const next = normalizeLatLng(latLng);
    if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return;
    this.map.setCenter(next);
    if (Number.isFinite(Number(zoom))) this.map.setZoom(Number(zoom));
  }

  invalidateSize() {
    const center = this.map.getCenter();
    this.eventApi?.trigger?.(this.map, 'resize');
    if (center) this.map.setCenter(center);
  }

  setMapType(type) {
    this.map.setMapTypeId(type === 'satellite' ? 'satellite' : 'roadmap');
  }

  getMapType() {
    return this.map.getMapTypeId();
  }
}

export function createGoogleMarkerFacade(adapter) {
  return {
    setLatLng(latLng) {
      adapter.setMarkerPosition(latLng);
    },
    getLatLng() {
      const position = adapter.marker?.getPosition?.();
      return position ? { lat: position.lat(), lng: position.lng() } : adapter.selectedPosition || null;
    }
  };
}
