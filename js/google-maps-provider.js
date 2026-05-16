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
  let AdvancedMarkerCtor = resolvedGoogleObj.maps.marker?.AdvancedMarkerElement || null;
  if (!AdvancedMarkerCtor && typeof resolvedGoogleObj.maps.importLibrary === 'function') {
    try {
      const markerLibrary = await resolvedGoogleObj.maps.importLibrary('marker');
      AdvancedMarkerCtor = markerLibrary?.AdvancedMarkerElement || null;
    } catch (err) {
      globalThis.console?.debug?.('[map-provider] importLibrary("marker") unavailable:', String(err?.message || err));
    }
  }

  return {
    googleObj: resolvedGoogleObj,
    MapCtor,
    AdvancedMarkerCtor: typeof AdvancedMarkerCtor === 'function' ? AdvancedMarkerCtor : null,
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

export const GHI_MARKER_BUCKETS = Object.freeze([
  { key: 'lt1300', className: 'solar-map-marker--lt1300', color: GHI_MARKER_COLORS.lt1300, maxExclusive: 1300 },
  { key: 'gte1450', className: 'solar-map-marker--gte1450', color: GHI_MARKER_COLORS.gte1450, maxExclusive: 1450 },
  { key: 'gte1600', className: 'solar-map-marker--gte1600', color: GHI_MARKER_COLORS.gte1600, maxExclusive: 1600 },
  { key: 'gte1700', className: 'solar-map-marker--gte1700', color: GHI_MARKER_COLORS.gte1700, maxExclusive: 1700 },
  { key: 'gte1800', className: 'solar-map-marker--gte1800', color: GHI_MARKER_COLORS.gte1800, maxExclusive: 1800 },
  { key: 'gt1800', className: 'solar-map-marker--gt1800', color: GHI_MARKER_COLORS.gt1800, maxExclusive: Infinity }
]);

export const GOOGLE_DARK_MAP_STYLES = Object.freeze([
  { elementType: 'geometry', stylers: [{ color: '#172032' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#D6DEE8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1120' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#52606F' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#142033' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1B2A3D' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#173226' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#28364A' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#111827' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3A4354' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#243044' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0B3B4C' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9CCBDA' }] }
]);

export function getGhiMarkerBucket(ghi) {
  const value = Number(ghi);
  if (!Number.isFinite(value)) return GHI_MARKER_BUCKETS[3];
  return GHI_MARKER_BUCKETS.find(bucket => value < bucket.maxExclusive) || GHI_MARKER_BUCKETS.at(-1);
}

export function getGhiMarkerColor(ghi) {
  return getGhiMarkerBucket(ghi).color;
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

export function createAdvancedMarkerContent({ bucketClass = '', selected = false, vertex = false } = {}) {
  if (typeof document === 'undefined') return null;
  const root = document.createElement('span');
  root.className = [
    'solar-map-marker',
    bucketClass,
    selected ? 'solar-map-marker--selected' : '',
    vertex ? 'solar-map-marker--vertex' : ''
  ].filter(Boolean).join(' ');
  const dot = document.createElement('span');
  dot.className = 'solar-map-marker-dot';
  root.appendChild(dot);
  return root;
}

export const DEFAULT_GOOGLE_MAP_TYPE_ID = 'hybrid';

export function buildGoogleMapOptions({
  center = { lat: 39, lng: 35 },
  zoom = 6,
  mapId = '',
  mapTypeId = DEFAULT_GOOGLE_MAP_TYPE_ID,
  theme = 'dark'
} = {}) {
  const normalizedMapId = String(mapId || '').trim();
  const normalizedType = mapTypeId === 'roadmap' ? 'roadmap' : 'hybrid';
  const options = {
    center,
    zoom,
    mapTypeId: normalizedType,
    clickableIcons: false,
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
    zoomControl: false,
    rotateControl: false,
    scaleControl: false,
    cameraControl: false,
    disableDefaultUI: true,
    gestureHandling: 'greedy'
  };
  if (normalizedMapId) {
    options.mapId = normalizedMapId;
  } else if (theme === 'dark' && normalizedType === 'roadmap') {
    options.styles = GOOGLE_DARK_MAP_STYLES;
  }
  return options;
}

export class GoogleMapAdapter {
  constructor({
    container,
    MapCtor,
    AdvancedMarkerCtor = null,
    MarkerCtor = null,
    PolygonCtor = null,
    PolylineCtor = null,
    SymbolPath = null,
    eventApi = null,
    center = { lat: 39, lng: 35 },
    zoom = 6,
    mapId = '',
    onLocationSelect,
    onRoofPolygonsChange,
    cities = [],
    getGhiColor
  }) {
    if (!container) throw new Error('map-container-missing');
    if (typeof MapCtor !== 'function') throw new Error('google-maps-map-constructor-unavailable');
    this.container = container;
    this.mapId = String(mapId || '').trim();
    this.AdvancedMarkerCtor = this.mapId && typeof AdvancedMarkerCtor === 'function' ? AdvancedMarkerCtor : null;
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
    this.roofDrawMode = 'polygon';
    this.rectangleStart = null;
    this.isRoofDrawing = false;
    this.isRoofComplete = false;
    this.selectedPosition = center;
    const mapOptions = buildGoogleMapOptions({
      center,
      zoom,
      mapId: this.mapId,
      mapTypeId: DEFAULT_GOOGLE_MAP_TYPE_ID
    });
    this.map = new MapCtor(container, mapOptions);
    this.marker = this.createMarker({
      position: center,
      draggable: true,
      selected: true,
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
    if (this.AdvancedMarkerCtor || this.MarkerCtor) {
      cities.forEach(city => {
        const bucket = getGhiMarkerBucket(city.ghi);
        const color = typeof getGhiColor === 'function' ? getGhiColor(city.ghi) : bucket.color;
        const marker = this.createMarker({
          position: { lat: city.lat, lng: city.lon },
          title: `${city.name} - GHI: ${city.ghi} kWh/m2/yil`,
          bucketClass: bucket.className,
          icon: createCircleMarkerIcon(color, { size: 21, strokeColor: '#F8FAFC', strokeWidth: 4, glow: true }),
          clickable: false
        });
        if (marker) this.cityMarkers.push(marker);
      });
    }
    this.installRoofDrawingControls();
  }

  createMarker({ onDragEnd, bucketClass, selected = false, vertex = false, draggable = false, ...options }) {
    if (this.AdvancedMarkerCtor) {
      try {
        const marker = new this.AdvancedMarkerCtor({
          map: this.map,
          position: options.position,
          title: options.title,
          content: createAdvancedMarkerContent({ bucketClass, selected, vertex }),
          gmpDraggable: !!draggable
        });
        if (typeof onDragEnd === 'function' && marker?.addListener) marker.addListener('dragend', onDragEnd);
        return this.wrapAdvancedMarker(marker, options.position);
      } catch (err) {
        globalThis.console?.warn?.('[map-provider] Advanced marker unavailable:', String(err?.message || err));
      }
    }
    if (!this.MarkerCtor) return null;
    try {
      const marker = new this.MarkerCtor({ map: this.map, draggable, ...options });
      if (typeof onDragEnd === 'function' && marker?.addListener) marker.addListener('dragend', onDragEnd);
      return marker;
    } catch (err) {
      globalThis.console?.warn?.('[map-provider] Google marker unavailable:', err);
      return null;
    }
  }

  wrapAdvancedMarker(marker, initialPosition) {
    let position = normalizeLatLng(initialPosition);
    return {
      rawMarker: marker,
      addListener: (...args) => marker.addListener?.(...args),
      setPosition(nextPosition) {
        position = normalizeLatLng(nextPosition);
        marker.position = position;
      },
      getPosition() {
        const current = normalizeLatLng(marker.position || position);
        return { lat: () => current.lat, lng: () => current.lng };
      },
      setMap(map) {
        marker.map = map;
      }
    };
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
      <button type="button" class="google-roof-tool-btn danger" data-google-roof-action="clear">Sil</button>
    `;
    tools.addEventListener('click', event => {
      const button = event.target.closest('[data-google-roof-action]');
      if (!button) return;
      const action = button.dataset.googleRoofAction;
      if (action === 'draw') this.startRoofDrawing('polygon');
      if (action === 'finish') this.finishRoofDrawing();
      if (action === 'undo') this.undoRoofVertex();
      if (action === 'clear') this.clearRoofDrawing();
    });
    this.container.appendChild(tools);
    this.updateRoofToolState();
  }

  startRoofDrawing(mode = 'polygon') {
    if (!this.PolygonCtor || !this.PolylineCtor) {
      globalThis.console?.warn?.('[map-provider] Google polygon drawing unavailable');
      return;
    }
    this.clearRoofDrawing({ notify: false });
    this.roofDrawMode = mode === 'rectangle' ? 'rectangle' : 'polygon';
    this.rectangleStart = null;
    this.isRoofDrawing = true;
    this.isRoofComplete = false;
    globalThis._drawingMode = true;
    this.container.classList?.add?.('google-roof-drawing-active');
    this.setDrawHintVisible(true);
    this.updateRoofToolState();
  }

  addRoofVertex(latLng) {
    const point = normalizeLatLng(latLng);
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
    if (this.roofDrawMode === 'rectangle') {
      this.addRectangleVertex(point);
      return;
    }
    this.drawingPoints.push(point);
    this.addVertexMarker(point, this.drawingPoints.length - 1);
    this.renderRoofShape();
    this.updateRoofToolState();
  }

  addRectangleVertex(point) {
    if (!this.rectangleStart) {
      this.rectangleStart = point;
      this.drawingPoints = [point];
      this.addVertexMarker(point, 0);
      this.updateRoofToolState();
      return;
    }
    const a = this.rectangleStart;
    const b = point;
    this.clearVertexMarkers();
    this.drawingPoints = [
      { lat: a.lat, lng: a.lng },
      { lat: a.lat, lng: b.lng },
      { lat: b.lat, lng: b.lng },
      { lat: b.lat, lng: a.lng }
    ];
    this.drawingPoints.forEach((rectPoint, index) => this.addVertexMarker(rectPoint, index));
    this.finishRoofDrawing();
  }

  clearVertexMarkers() {
    this.vertexMarkers.forEach(marker => marker?.setMap?.(null));
    this.vertexMarkers = [];
  }

  addVertexMarker(point, index) {
    if (!this.MarkerCtor) return;
    const marker = this.createMarker({
      position: point,
      draggable: true,
      vertex: true,
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
    this.updateRoofToolState();
  }

  enableRoofEditing() {
    if (!this.drawingPoints.length) return;
    this.isRoofDrawing = false;
    this.isRoofComplete = this.drawingPoints.length >= 3;
    globalThis._drawingMode = false;
    this.container.classList?.remove?.('google-roof-drawing-active');
    this.setDrawHintVisible(false);
    this.renderRoofShape();
    this.updateRoofToolState();
  }

  undoRoofVertex() {
    if (!this.drawingPoints.length) return;
    this.drawingPoints.pop();
    const marker = this.vertexMarkers.pop();
    marker?.setMap?.(null);
    this.isRoofComplete = this.drawingPoints.length >= 3 && this.isRoofComplete;
    this.renderRoofShape();
    if (this.isRoofComplete) this.notifyRoofPolygons('edit');
    this.updateRoofToolState();
  }

  clearRoofDrawing({ notify = true } = {}) {
    this.isRoofDrawing = false;
    this.isRoofComplete = false;
    globalThis._drawingMode = false;
    this.container.classList?.remove?.('google-roof-drawing-active');
    this.setDrawHintVisible(false);
    this.drawingPoints = [];
    this.rectangleStart = null;
    this.clearVertexMarkers();
    if (this.roofDraftLine) this.roofDraftLine.setMap(null);
    if (this.roofPolygon) this.roofPolygon.setMap(null);
    this.roofDraftLine = null;
    this.roofPolygon = null;
    if (notify) this.onRoofPolygonsChange?.([], 'clear');
    this.updateRoofToolState();
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
    this.updateRoofToolState();
  }

  notifyRoofPolygons(reason) {
    if (!this.isRoofComplete || this.drawingPoints.length < 3) return;
    this.onRoofPolygonsChange?.([this.drawingPoints.map(p => ({ ...p }))], reason);
  }

  setDrawHintVisible(visible) {
    if (typeof document === 'undefined') return;
    document.getElementById('map-draw-hint')?.classList.toggle('is-visible', !!visible);
  }

  updateRoofToolState() {
    const tools = this.container?.querySelector?.('.google-roof-tools');
    if (!tools) return;
    const hasPoints = this.drawingPoints.length > 0;
    const canFinish = this.isRoofDrawing && this.drawingPoints.length >= 3;
    const hasShape = hasPoints || !!this.roofPolygon;
    tools.querySelectorAll?.('[data-google-roof-action]')?.forEach(button => {
      const action = button.dataset.googleRoofAction;
      const isActive = action === 'draw' && this.isRoofDrawing && this.roofDrawMode === 'polygon';
      button.classList?.toggle?.('active', isActive);
      button.disabled = (action === 'finish' && !canFinish)
        || (action === 'undo' && !hasPoints)
        || (action === 'clear' && !hasShape);
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
    this.eventApi?.trigger?.(this.map, 'resize');
    if (center) this.map.setCenter(center);
  }

  setMapType(type) {
    const nextType = type === 'hybrid' || type === 'satellite' ? 'hybrid' : 'roadmap';
    this.map.setMapTypeId(nextType);
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
