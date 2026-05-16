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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForGoogleMapConstructor({
  googleObj,
  timeoutMs = 5000,
  intervalMs = 120
} = {}) {
  const startedAt = Date.now();
  let importLibraryPromise = null;
  let waitingLogged = false;

  while (Date.now() - startedAt < timeoutMs) {
    const currentGoogleObj = googleObj?.maps ? googleObj : globalThis.google;
    if (typeof currentGoogleObj?.maps?.Map === 'function') {
      globalThis.console?.debug?.('[map-provider] Map constructor ready');
      return currentGoogleObj.maps.Map;
    }

    if (currentGoogleObj?.maps && !waitingLogged) {
      waitingLogged = true;
      globalThis.console?.debug?.('[map-provider] Google namespace available; waiting for Map constructor');
    }

    if (typeof currentGoogleObj?.maps?.importLibrary === 'function') {
      if (!importLibraryPromise) {
        importLibraryPromise = Promise.resolve(currentGoogleObj.maps.importLibrary('maps'))
          .catch(err => {
            globalThis.console?.debug?.('[map-provider] importLibrary("maps") transient failure:', String(err?.message || err));
            return null;
          })
          .finally(() => { importLibraryPromise = null; });
      }
      const mapsLibrary = await Promise.race([
        importLibraryPromise,
        delay(intervalMs).then(() => null)
      ]);
      if (typeof mapsLibrary?.Map === 'function') {
        globalThis.console?.debug?.('[map-provider] Map constructor ready');
        return mapsLibrary.Map;
      }
    } else {
      await delay(intervalMs);
    }
  }

  throw new Error('google-maps-map-constructor-unavailable');
}

export async function resolveGoogleMapsClasses(googleObj = globalThis.google, options = {}) {
  const MapCtor = await waitForGoogleMapConstructor({ googleObj, ...options });
  const resolvedGoogleObj = googleObj?.maps ? googleObj : globalThis.google;
  if (!resolvedGoogleObj?.maps) throw new Error('google-maps-namespace-unavailable');

  return {
    googleObj: resolvedGoogleObj,
    MapCtor,
    MarkerCtor: typeof resolvedGoogleObj.maps.Marker === 'function' ? resolvedGoogleObj.maps.Marker : null,
    PolygonCtor: typeof resolvedGoogleObj.maps.Polygon === 'function' ? resolvedGoogleObj.maps.Polygon : null,
    PolylineCtor: typeof resolvedGoogleObj.maps.Polyline === 'function' ? resolvedGoogleObj.maps.Polyline : null,
    SymbolPath: resolvedGoogleObj.maps.SymbolPath || null,
    eventApi: resolvedGoogleObj.maps.event || null
  };
}

function normalizeLatLng(value) {
  if (Array.isArray(value)) return { lat: Number(value[0]), lng: Number(value[1]) };
  return { lat: Number(value?.lat), lng: Number(value?.lng ?? value?.lon) };
}

export const GHI_MARKER_COLORS = Object.freeze({
  lt1300: '#6B7280',
  gte1450: '#3B82F6',
  gte1600: '#22C55E',
  gte1700: '#EAB308',
  gte1800: '#F97316',
  gt1800: '#EF4444'
});

export function getGhiMarkerColor(ghi) {
  const value = Number(ghi);
  if (!Number.isFinite(value)) return GHI_MARKER_COLORS.gte1700;
  if (value < 1300) return GHI_MARKER_COLORS.lt1300;
  if (value < 1450) return GHI_MARKER_COLORS.gte1450;
  if (value < 1600) return GHI_MARKER_COLORS.gte1600;
  if (value < 1700) return GHI_MARKER_COLORS.gte1700;
  if (value < 1800) return GHI_MARKER_COLORS.gte1800;
  return GHI_MARKER_COLORS.gt1800;
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function createCircleMarkerIcon(fillColor, { size = 16, strokeColor = '#F8FAFC', strokeWidth = 3, glow = false } = {}) {
  const radius = Math.max(2, (size - strokeWidth * 2) / 2);
  const center = size / 2;
  const shadow = glow ? `<circle cx="${center}" cy="${center}" r="${Math.max(radius + 3, radius)}" fill="${fillColor}" opacity="0.22"/>` : '';
  return {
    url: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      ${shadow}
      <circle cx="${center}" cy="${center}" r="${radius}" fill="${fillColor}" fill-opacity="0.96" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
    </svg>`)
  };
}

export class GoogleMapAdapter {
  constructor({
    container,
    MapCtor,
    MarkerCtor = null,
    PolygonCtor = null,
    PolylineCtor = null,
    SymbolPath = null,
    eventApi = null,
    center = { lat: 39, lng: 35 },
    zoom = 6,
    onLocationSelect,
    onRoofPolygonsChange,
    cities = [],
    getGhiColor
  }) {
    if (!container) throw new Error('map-container-missing');
    if (typeof MapCtor !== 'function') throw new Error('google-maps-map-constructor-unavailable');
    this.container = container;
    this.MarkerCtor = typeof MarkerCtor === 'function' ? MarkerCtor : null;
    this.PolygonCtor = typeof PolygonCtor === 'function' ? PolygonCtor : null;
    this.PolylineCtor = typeof PolylineCtor === 'function' ? PolylineCtor : null;
    this.SymbolPath = SymbolPath;
    this.eventApi = eventApi;
    this.onLocationSelect = onLocationSelect;
    this.onRoofPolygonsChange = onRoofPolygonsChange;
    this.cityMarkers = [];
    this.vertexMarkers = [];
    this.drawingPoints = [];
    this.isRoofDrawing = false;
    this.isRoofComplete = false;
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
      icon: createCircleMarkerIcon('#F59E0B', { size: 20, strokeColor: '#FFFFFF', strokeWidth: 4, glow: true }),
      onDragEnd: event => {
        const latLng = event.latLng;
        if (!latLng) return;
        this.onLocationSelect?.(latLng.lat(), latLng.lng(), true);
      }
    });
    this.map.addListener('click', event => {
      const latLng = event.latLng;
      if (!latLng) return;
      if (this.isRoofDrawing) {
        this.addRoofVertex({ lat: latLng.lat(), lng: latLng.lng() });
        return;
      }
      if (globalThis._drawingMode || globalThis._glarePickMode) return;
      this.onLocationSelect?.(latLng.lat(), latLng.lng(), true);
    });
    this.map.addListener('dblclick', () => {
      if (this.isRoofDrawing) this.finishRoofDrawing();
    });
    if (this.MarkerCtor) {
      cities.forEach(city => {
        const color = typeof getGhiColor === 'function' ? getGhiColor(city.ghi) : getGhiMarkerColor(city.ghi);
        const marker = this.createMarker({
          position: { lat: city.lat, lng: city.lon },
          title: `${city.name} - GHI: ${city.ghi} kWh/m2/yil`,
          icon: createCircleMarkerIcon(color, { size: 15, strokeColor: '#F8FAFC', strokeWidth: 3 }),
          clickable: false
        });
        if (marker) this.cityMarkers.push(marker);
      });
    }
    this.installRoofDrawingControls();
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

  installRoofDrawingControls() {
    if (!this.container?.querySelector || !this.container?.appendChild || typeof document === 'undefined') return;
    if (this.container.querySelector('.google-roof-tools')) return;
    const tools = document.createElement('div');
    tools.className = 'google-roof-tools';
    tools.innerHTML = `
      <button type="button" class="google-roof-tool-btn" data-google-roof-action="draw">Poligon</button>
      <button type="button" class="google-roof-tool-btn" data-google-roof-action="finish">Bitir</button>
      <button type="button" class="google-roof-tool-btn" data-google-roof-action="undo">Geri al</button>
      <button type="button" class="google-roof-tool-btn" data-google-roof-action="edit">Düzenle</button>
      <button type="button" class="google-roof-tool-btn danger" data-google-roof-action="clear">Sil</button>
    `;
    tools.addEventListener('click', event => {
      const button = event.target.closest('[data-google-roof-action]');
      if (!button) return;
      const action = button.dataset.googleRoofAction;
      if (action === 'draw') this.startRoofDrawing();
      if (action === 'finish') this.finishRoofDrawing();
      if (action === 'undo') this.undoRoofVertex();
      if (action === 'edit') this.enableRoofEditing();
      if (action === 'clear') this.clearRoofDrawing();
    });
    this.container.appendChild(tools);
  }

  startRoofDrawing() {
    if (!this.PolygonCtor || !this.PolylineCtor) {
      globalThis.console?.warn?.('[map-provider] Google polygon drawing unavailable');
      return;
    }
    this.clearRoofDrawing({ notify: false });
    this.isRoofDrawing = true;
    this.isRoofComplete = false;
    globalThis._drawingMode = true;
    this.container.classList?.add?.('google-roof-drawing-active');
    this.setDrawHintVisible(true);
  }

  addRoofVertex(latLng) {
    const point = normalizeLatLng(latLng);
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
    this.drawingPoints.push(point);
    this.addVertexMarker(point, this.drawingPoints.length - 1);
    this.renderRoofShape();
  }

  addVertexMarker(point, index) {
    if (!this.MarkerCtor) return;
    const marker = this.createMarker({
      position: point,
      draggable: true,
      title: `Poligon noktası ${index + 1}`,
      icon: createCircleMarkerIcon('#F59E0B', { size: 18, strokeColor: '#FFFFFF', strokeWidth: 4, glow: true }),
      onDragEnd: event => {
        const latLng = event.latLng;
        if (!latLng) return;
        this.drawingPoints[index] = { lat: latLng.lat(), lng: latLng.lng() };
        this.renderRoofShape();
        if (this.isRoofComplete) this.notifyRoofPolygons('edit');
      }
    });
    if (marker) this.vertexMarkers.push(marker);
  }

  renderRoofShape() {
    if (!this.PolygonCtor || !this.PolylineCtor) return;
    if (this.roofDraftLine) this.roofDraftLine.setMap(null);
    if (this.roofPolygon) this.roofPolygon.setMap(null);
    if (this.drawingPoints.length >= 2 && !this.isRoofComplete) {
      this.roofDraftLine = new this.PolylineCtor({
        map: this.map,
        path: this.drawingPoints,
        strokeColor: '#F59E0B',
        strokeOpacity: 0.95,
        strokeWeight: 3
      });
    }
    if (this.drawingPoints.length >= 3) {
      this.roofPolygon = new this.PolygonCtor({
        map: this.map,
        paths: this.drawingPoints,
        strokeColor: '#F59E0B',
        strokeOpacity: 0.95,
        strokeWeight: 3,
        fillColor: '#F59E0B',
        fillOpacity: 0.18,
        clickable: false
      });
    }
  }

  finishRoofDrawing() {
    if (this.drawingPoints.length < 3) return;
    this.isRoofDrawing = false;
    this.isRoofComplete = true;
    globalThis._drawingMode = false;
    this.container.classList?.remove?.('google-roof-drawing-active');
    this.setDrawHintVisible(false);
    if (this.roofDraftLine) {
      this.roofDraftLine.setMap(null);
      this.roofDraftLine = null;
    }
    this.renderRoofShape();
    this.notifyRoofPolygons('complete');
  }

  enableRoofEditing() {
    if (!this.drawingPoints.length) return;
    this.isRoofDrawing = false;
    this.isRoofComplete = this.drawingPoints.length >= 3;
    globalThis._drawingMode = false;
    this.container.classList?.remove?.('google-roof-drawing-active');
    this.setDrawHintVisible(false);
    this.renderRoofShape();
  }

  undoRoofVertex() {
    if (!this.drawingPoints.length) return;
    this.drawingPoints.pop();
    const marker = this.vertexMarkers.pop();
    marker?.setMap?.(null);
    this.isRoofComplete = this.drawingPoints.length >= 3 && this.isRoofComplete;
    this.renderRoofShape();
    if (this.isRoofComplete) this.notifyRoofPolygons('edit');
  }

  clearRoofDrawing({ notify = true } = {}) {
    this.isRoofDrawing = false;
    this.isRoofComplete = false;
    globalThis._drawingMode = false;
    this.container.classList?.remove?.('google-roof-drawing-active');
    this.setDrawHintVisible(false);
    this.drawingPoints = [];
    this.vertexMarkers.forEach(marker => marker?.setMap?.(null));
    this.vertexMarkers = [];
    if (this.roofDraftLine) this.roofDraftLine.setMap(null);
    if (this.roofPolygon) this.roofPolygon.setMap(null);
    this.roofDraftLine = null;
    this.roofPolygon = null;
    if (notify) this.onRoofPolygonsChange?.([], 'clear');
  }

  loadRoofGeometry(summary) {
    const points = summary?.features?.[0]?.points;
    if (!Array.isArray(points) || points.length < 3) return;
    this.clearRoofDrawing({ notify: false });
    this.drawingPoints = points.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    this.drawingPoints.forEach((point, index) => this.addVertexMarker(point, index));
    this.isRoofComplete = this.drawingPoints.length >= 3;
    this.renderRoofShape();
  }

  notifyRoofPolygons(reason) {
    if (!this.isRoofComplete || this.drawingPoints.length < 3) return;
    this.onRoofPolygonsChange?.([this.drawingPoints.map(p => ({ ...p }))], reason);
  }

  setDrawHintVisible(visible) {
    if (typeof document === 'undefined') return;
    document.getElementById('map-draw-hint')?.classList.toggle('is-visible', !!visible);
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
