// Roof polygon geometry and Leaflet.draw wiring.
const STORAGE_KEY = 'guneshesap_roof_geometry_v1';
const EARTH_RADIUS_M = 6371008.8;

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }
function normDeg(deg) { return ((deg % 360) + 360) % 360; }
function angleDiff(a, b) {
  const d = Math.abs(normDeg(a) - normDeg(b));
  return Math.min(d, 360 - d);
}

export function bearingBetween(a, b) {
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const dLon = toRad(b.lng - a.lng);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normDeg(toDeg(Math.atan2(y, x)));
}

export function distanceMeters(a, b) {
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function toLocalMeters(points) {
  if (!Array.isArray(points) || !points.length) return [];
  const refLat = toRad(points.reduce((s, p) => s + p.lat, 0) / points.length);
  const ref = points[0];
  return points.map(p => ({
    x: toRad(p.lng - ref.lng) * EARTH_RADIUS_M * Math.cos(refLat),
    y: toRad(p.lat - ref.lat) * EARTH_RADIUS_M,
    lat: p.lat,
    lng: p.lng
  }));
}

export function calculatePolygonAreaM2(points) {
  const pts = toLocalMeters(points);
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(sum) / 2;
}

export function calculateCentroid(points) {
  const pts = toLocalMeters(points);
  if (pts.length < 3) {
    const first = points?.[0] || { lat: 0, lng: 0 };
    return { lat: first.lat, lng: first.lng };
  }
  let area2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    area2 += cross;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
  }
  if (Math.abs(area2) < 1e-9) return { lat: points[0].lat, lng: points[0].lng };
  cx /= (3 * area2);
  cy /= (3 * area2);
  const ref = points[0];
  const refLat = toRad(points.reduce((s, p) => s + p.lat, 0) / points.length);
  return {
    lat: ref.lat + toDeg(cy / EARTH_RADIUS_M),
    lng: ref.lng + toDeg(cx / (EARTH_RADIUS_M * Math.cos(refLat)))
  };
}

export function getPolygonEdgeBearings(points) {
  if (!Array.isArray(points) || points.length < 2) return [];
  return points.map((p, i) => {
    const next = points[(i + 1) % points.length];
    return {
      bearing: bearingBetween(p, next),
      lengthM: distanceMeters(p, next)
    };
  });
}

export function estimateDominantAzimuth(points) {
  const edges = getPolygonEdgeBearings(points);
  if (!edges.length) return 180;
  const dominant = edges.reduce((best, edge) => edge.lengthM > best.lengthM ? edge : best, edges[0]);
  const candidates = [normDeg(dominant.bearing + 90), normDeg(dominant.bearing + 270)];
  return candidates.sort((a, b) => angleDiff(a, 180) - angleDiff(b, 180))[0];
}

export function azimuthCoeff(azimuth) {
  return Math.max(0.55, 1 - angleDiff(azimuth, 180) / 180 * 0.45);
}

export function azimuthName(azimuth) {
  const dirs = [
    ['Kuzey', 0], ['Kuzeydoğu', 45], ['Doğu', 90], ['Güneydoğu', 135],
    ['Güney', 180], ['Güneybatı', 225], ['Batı', 270], ['Kuzeybatı', 315]
  ];
  return dirs.reduce((best, item) => angleDiff(azimuth, item[1]) < angleDiff(azimuth, best[1]) ? item : best, dirs[0])[0];
}

export function summarizeRoofGeometry(polygons) {
  const clean = (Array.isArray(polygons) ? polygons : [])
    .map(poly => poly.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)))
    .filter(poly => poly.length >= 3);
  const features = clean.map(points => {
    const areaM2 = calculatePolygonAreaM2(points);
    return {
      points,
      areaM2,
      centroid: calculateCentroid(points),
      edgeBearings: getPolygonEdgeBearings(points),
      azimuth: estimateDominantAzimuth(points)
    };
  });
  const totalAreaM2 = features.reduce((s, f) => s + f.areaM2, 0);
  const centroid = totalAreaM2 > 0
    ? {
        lat: features.reduce((s, f) => s + f.centroid.lat * f.areaM2, 0) / totalAreaM2,
        lng: features.reduce((s, f) => s + f.centroid.lng * f.areaM2, 0) / totalAreaM2
      }
    : null;
  const primary = features.reduce((best, f) => !best || f.areaM2 > best.areaM2 ? f : best, null);
  const azimuth = primary?.azimuth ?? 180;
  return {
    features,
    areaM2: totalAreaM2,
    centroid,
    azimuth,
    azimuthName: azimuthName(azimuth),
    azimuthCoeff: azimuthCoeff(azimuth)
  };
}

function layerToPoints(layer) {
  const latlngs = layer.getLatLngs?.()[0] || [];
  return latlngs.map(p => ({ lat: p.lat, lng: p.lng }));
}

function syncDrawToolbarLabels() {
  const t = key => window.i18n?.t?.(key) || key;
  const labels = [
    ['.leaflet-draw-draw-polygon', t('step3.drawToolPolygon')],
    ['.leaflet-draw-draw-rectangle', t('step3.drawToolRect')],
    ['.leaflet-draw-edit-edit', t('step3.drawToolEdit')],
    ['.leaflet-draw-edit-remove', t('step3.drawToolDelete')]
  ];
  labels.forEach(([selector, label]) => {
    document.querySelectorAll(selector).forEach(el => {
      el.setAttribute('title', label);
      el.setAttribute('aria-label', label);
    });
  });
}

function persist(summary) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(summary)); } catch { /* ignore */ }
}

function updateUiAndState(summary) {
  const state = window.state;
  state.roofGeometry = summary;
  state.roofArea = Number(summary.areaM2.toFixed(1));
  state.lat = summary.centroid?.lat ?? state.lat;
  state.lon = summary.centroid?.lng ?? state.lon;
  state.azimuth = Math.round(summary.azimuth);
  state.azimuthCoeff = summary.azimuthCoeff;
  state.azimuthName = summary.azimuthName;

  const roofArea = document.getElementById('roof-area');
  if (roofArea) roofArea.value = state.roofArea.toFixed(1);
  const dirName = document.getElementById('dir-name');
  const dirCoeff = document.getElementById('dir-coeff');
  if (dirName) dirName.textContent = state.azimuthName;
  if (dirCoeff) dirCoeff.textContent = state.azimuthCoeff.toFixed(2);
  window.syncRoofOrientationUI?.({
    azimuth: state.azimuth,
    coeff: state.azimuthCoeff,
    name: state.azimuthName
  });
  const selected = document.getElementById('selected-loc-text');
  if (selected && summary.centroid) {
    selected.textContent = `${state.cityName || 'Kurulum alanı merkezi'} — ${summary.centroid.lat.toFixed(4)}°K, ${summary.centroid.lng.toFixed(4)}°D`;
  }

  // ── Badge güncelle ───────────────────────────────────────
  const badge = document.getElementById('roof-area-badge');
  const badgeText = document.getElementById('roof-badge-text');
  if (badge && badgeText) {
    badgeText.textContent = `${summary.areaM2.toFixed(1)} m² · ${summary.azimuthName} (${Math.round(summary.azimuth)}°) · Katsayı ${summary.azimuthCoeff.toFixed(2)}`;
    badge.style.display = 'block';
  }

  // ── Temizle butonu göster ────────────────────────────────
  const clearBtn = document.getElementById('clear-roof-btn');
  if (clearBtn) clearBtn.style.display = '';

  const out = document.getElementById('roof-geometry-summary');
  if (out) {
    const featureRows = summary.features.map((f, i) => {
      const bearings = f.edgeBearings?.slice(0, 4).map(e => `${Math.round(e.bearing)}°`).join(', ') || '—';
      return `<div class="roof-poly-row">
        <span class="text-strong-primary">${i + 1}. Poligon:</span>
        <span class="text-color-default"> ${f.areaM2.toFixed(1)} m²</span>
        <span class="text-muted text-sm-78"> · ${azimuthName(f.azimuth)} (${Math.round(f.azimuth)}°)</span>
      </div>`;
    }).join('');
    out.innerHTML = `
      <div class="roof-summary-grid">
        <div><span class="text-muted">Toplam alan:</span> <strong class="text-color-default">${summary.areaM2.toFixed(1)} m²</strong></div>
        <div><span class="text-muted">Dominant yön:</span> <strong class="text-color-default">${summary.azimuthName} ${Math.round(summary.azimuth)}°</strong></div>
        <div><span class="text-muted">Katsayı:</span> <strong class="text-color-default">${summary.azimuthCoeff.toFixed(2)}</strong></div>
        <div><span class="text-muted">Merkez:</span> <strong class="text-color-default">${summary.centroid ? `${summary.centroid.lat.toFixed(4)}, ${summary.centroid.lng.toFixed(4)}` : '—'}</strong></div>
      </div>
      ${summary.features.length > 1 ? featureRows : ''}
    `;
  }
  window.updatePanelPreview?.();
  persist(summary);
}

export function syncRoofPolygonsToState(polygons) {
  const summary = summarizeRoofGeometry(polygons);
  if (!summary.features.length) {
    window.state.roofGeometry = null;
    window.state.roofArea = 0;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    const out = document.getElementById('roof-geometry-summary');
    if (out) out.textContent = 'Haritada bir veya daha fazla kurulum alanı poligonu çizin.';
    const roofArea = document.getElementById('roof-area');
    if (roofArea) roofArea.value = '';
    const badge = document.getElementById('roof-area-badge');
    if (badge) badge.style.display = 'none';
    const clearBtn = document.getElementById('clear-roof-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    window.updatePanelPreview?.();
    return null;
  }
  updateUiAndState(summary);
  window.refreshOSMShadowAnalysis?.();
  return summary;
}

export function initRoofDrawing(map) {
  const out = document.getElementById('roof-geometry-summary');
  if (!map || !window.L) return;

  const drawn = new L.FeatureGroup();
  map.addLayer(drawn);
  window.roofDrawnItems = drawn;

  if (!L.Control?.Draw) {
    if (out) out.textContent = 'Leaflet.draw yüklenemedi — lütfen sayfayı yenileyin veya alanı manuel girin.';
    return;
  }

  // ── Özel vertex ikonu (Etap 4: dokunmatik cihazlarda 28 px hit alanı) ──
  const _isCoarse = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const _vSize = _isCoarse ? 28 : 10;
  const vertexIcon = new L.DivIcon({
    iconSize: new L.Point(_vSize, _vSize),
    className: 'roof-vertex-icon' + (_isCoarse ? ' roof-vertex-icon--touch' : '')
  });

  const drawControl = new L.Control.Draw({
    position: 'topleft',
    draw: {
      marker: false,
      circle: false,
      circlemarker: false,
      polyline: false,
      rectangle: {
        shapeOptions: { color: '#F59E0B', fillColor: '#F59E0B', fillOpacity: 0.15, weight: 2.5 },
        showArea: true, metric: true
      },
      polygon: {
        allowIntersection: false,
        showArea: true,
        metric: true,
        precision: { m: 1 },
        icon: vertexIcon,
        shapeOptions: {
          color: '#F59E0B',
          fillColor: '#F59E0B',
          fillOpacity: 0.18,
          weight: 2.5,
          dashArray: null
        },
        repeatMode: false
      }
    },
    edit: {
      featureGroup: drawn,
      remove: true,
      poly: { allowIntersection: false }
    }
  });
  map.addControl(drawControl);
  syncDrawToolbarLabels();
  window.syncRoofDrawToolbarLabels = syncDrawToolbarLabels;

  // ── Çizim başladı ─────────────────────────────────────
  map.on(L.Draw.Event.DRAWSTART, () => {
    window._drawingMode = true;
    // Uydu katmanına otomatik geç
    if (window._activeTileLayer !== 'satellite') {
      window._darkLayer?.remove();
      window._osmLayer?.remove();
      window._satelliteLayer?.addTo(map);
      window._activeTileLayer = 'satellite';
      const lbl = document.getElementById('map-layer-label');
      if (lbl) lbl.textContent = window.i18n?.t?.('step2.darkMapLabel') || 'Koyu görünüm';
      document.getElementById('map-satellite-btn')?.classList.add('active');
    }
    if (map.getZoom() > 18) map.setZoom(18);
    const hint = document.getElementById('map-draw-hint');
    if (hint) hint.style.display = 'block';
    window.showToast?.(window.i18n?.t?.('step3.drawToastStart') || 'Kurulum alanının sınır noktalarına tıklayın, çift tıklayarak tamamlayın. Dikdörtgen araç düzenli alanlarda daha hızlıdır.', 'info');
  });

  map.on(L.Draw.Event.DRAWSTOP, () => {
    window._drawingMode = false;
    const hint = document.getElementById('map-draw-hint');
    if (hint) hint.style.display = 'none';
  });

  // ── Şekil oluşturuldu ─────────────────────────────────
  map.on(L.Draw.Event.CREATED, e => {
    const layer = e.layer;
    const startHint = document.getElementById('roof-draw-start-hint');
    if (startHint) startHint.style.display = 'none';
    const clearBtn = document.getElementById('clear-roof-btn');
    if (clearBtn) clearBtn.style.display = 'flex';
    // Rectangle ise polygon'a normalize et
    if (e.layerType === 'rectangle') {
      const bounds = layer.getBounds();
      const corners = [
        { lat: bounds.getNorth(), lng: bounds.getWest() },
        { lat: bounds.getNorth(), lng: bounds.getEast() },
        { lat: bounds.getSouth(), lng: bounds.getEast() },
        { lat: bounds.getSouth(), lng: bounds.getWest() }
      ];
      const poly = L.polygon(corners.map(p => [p.lat, p.lng]), {
        color: '#F59E0B', fillColor: '#F59E0B', fillOpacity: 0.18, weight: 2.5
      });
      drawn.addLayer(poly);
    } else {
      drawn.addLayer(layer);
    }
    const summary = syncRoofLayers(drawn);
    if (summary) {
      window.showToast?.(`Kurulum alanı çizildi: ${summary.areaM2.toFixed(1)} m² · ${summary.azimuthName} (${Math.round(summary.azimuth)}°)`, 'success');
    }
  });

  map.on(L.Draw.Event.EDITED, () => {
    syncRoofLayers(drawn);
    window.showToast?.('Kurulum alanı düzenlendi, alan güncellendi.', 'info');
  });

  map.on(L.Draw.Event.DELETED, () => {
    syncRoofLayers(drawn);
    window.showToast?.('Kurulum alanı poligonu silindi.', 'info');
  });

  // ── Kayıtlı poligonları geri yükle ──────────────────────
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.features?.length) {
      const layers = [];
      saved.features.forEach(feature => {
        const poly = L.polygon(feature.points.map(p => [p.lat, p.lng]), {
          color: '#F59E0B', fillColor: '#F59E0B', fillOpacity: 0.18, weight: 2.5
        });
        drawn.addLayer(poly);
        layers.push(poly);
      });
      syncRoofLayers(drawn);
      // Haritayı poligon alanına zoom yap
      if (layers.length > 0) {
        try {
          const group = L.featureGroup(layers);
          map.fitBounds(group.getBounds().pad(0.3));
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

export function syncRoofLayers(drawn) {
  const polygons = [];
  drawn.eachLayer(layer => {
    const points = layerToPoints(layer);
    if (points.length >= 3) polygons.push(points);
  });
  return syncRoofPolygonsToState(polygons);
}

if (typeof window !== 'undefined') {
  window.initRoofDrawing = initRoofDrawing;
  window.syncRoofLayers = syncRoofLayers;
  window.syncRoofPolygonsToState = syncRoofPolygonsToState;
  window.roofGeometryMath = { calculatePolygonAreaM2, calculateCentroid, estimateDominantAzimuth };
}
