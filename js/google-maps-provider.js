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
  }).catch(err => {
    googleMapsLoadPromise = null;
    throw err;
  });

  return googleMapsLoadPromise;
}

function normalizeLatLng(value) {
  if (Array.isArray(value)) return { lat: Number(value[0]), lng: Number(value[1]) };
  return { lat: Number(value?.lat), lng: Number(value?.lng ?? value?.lon) };
}

export class GoogleMapAdapter {
  constructor({ maps, container, center = { lat: 39, lng: 35 }, zoom = 6, onLocationSelect, cities = [], getGhiColor }) {
    if (!maps) throw new Error('google-maps-unavailable');
    if (!container) throw new Error('map-container-missing');
    this.maps = maps;
    this.container = container;
    this.onLocationSelect = onLocationSelect;
    this.cityMarkers = [];
    this.map = new maps.Map(container, {
      center,
      zoom,
      mapTypeId: 'roadmap',
      clickableIcons: false,
      streetViewControl: false,
      fullscreenControl: true,
      mapTypeControl: false
    });
    this.marker = new maps.Marker({
      map: this.map,
      position: center,
      draggable: true,
      title: 'Seçili konum'
    });
    this.marker.addListener('dragend', event => {
      const latLng = event.latLng;
      if (!latLng) return;
      this.onLocationSelect?.(latLng.lat(), latLng.lng(), true);
    });
    this.map.addListener('click', event => {
      if (globalThis._drawingMode || globalThis._glarePickMode) return;
      const latLng = event.latLng;
      if (!latLng) return;
      this.onLocationSelect?.(latLng.lat(), latLng.lng(), true);
    });
    cities.forEach(city => {
      const color = typeof getGhiColor === 'function' ? getGhiColor(city.ghi) : '#F59E0B';
      const marker = new maps.Marker({
        map: this.map,
        position: { lat: city.lat, lng: city.lon },
        title: `${city.name} - GHI: ${city.ghi} kWh/m2/yil`,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: color,
          fillOpacity: 0.78,
          strokeColor: '#ffffff',
          strokeWeight: 1
        },
        clickable: false
      });
      this.cityMarkers.push(marker);
    });
  }

  setView(latLng, zoom = this.map.getZoom()) {
    const next = normalizeLatLng(latLng);
    if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return;
    this.map.setCenter(next);
    if (Number.isFinite(Number(zoom))) this.map.setZoom(Number(zoom));
  }

  invalidateSize() {
    const center = this.map.getCenter();
    this.maps.event.trigger(this.map, 'resize');
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
      const next = normalizeLatLng(latLng);
      if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return;
      adapter.marker.setPosition(next);
    },
    getLatLng() {
      const position = adapter.marker.getPosition();
      return position ? { lat: position.lat(), lng: position.lng() } : null;
    }
  };
}
