import { bearingBetween, distanceMeters } from './roof-geometry.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function normDeg(deg) { return ((deg % 360) + 360) % 360; }
function angleDiff(a, b) {
  const d = Math.abs(normDeg(a) - normDeg(b));
  return Math.min(d, 360 - d);
}

export function estimateBuildingHeight(tags = {}) {
  const direct = Number.parseFloat(String(tags.height || '').replace(',', '.'));
  if (Number.isFinite(direct) && direct > 0) return direct;
  const minHeight = Number.parseFloat(String(tags['min_height'] || '').replace(',', '.')) || 0;
  const levels = Number.parseFloat(String(tags['building:levels'] || tags.levels || '').replace(',', '.'));
  if (Number.isFinite(levels) && levels > 0) return minHeight + levels * 3.1;
  if (tags.building === 'apartments') return 12;
  if (tags.building === 'industrial' || tags.building === 'warehouse') return 8;
  return 6;
}

export function computeShadowRisk(roofCentroid, buildings, options = {}) {
  if (!roofCentroid || !Array.isArray(buildings)) return { score: 0, shadowFactorPct: 0, riskLevel: 'low', contributors: [] };
  const panelAzimuth = Number(options.panelAzimuth ?? 180);
  const contributors = buildings.map(b => {
    const centroid = b.centroid || b.points?.[0];
    const distanceM = Math.max(1, distanceMeters(roofCentroid, centroid));
    const heightM = Math.max(0, Number(b.heightM) || estimateBuildingHeight(b.tags));
    const bearing = bearingBetween(roofCentroid, centroid);
    const southWeight = Math.max(0, Math.cos(angleDiff(bearing, panelAzimuth) * Math.PI / 180));
    const nearWeight = Math.max(0, 1 - distanceM / 120);
    const heightWeight = Math.min(1, heightM / 30);
    const score = southWeight * nearWeight * heightWeight * 100;
    return { ...b, distanceM, bearing, score };
  }).filter(b => b.score > 1).sort((a, b) => b.score - a.score);
  const score = Math.min(100, contributors.reduce((s, b, i) => s + b.score * (i < 5 ? 1 : 0.35), 0));
  const shadowFactorPct = Math.min(35, score * 0.35);
  const riskLevel = score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low';
  return { score, shadowFactorPct, riskLevel, contributors: contributors.slice(0, 12) };
}

function polygonCentroid(points) {
  if (!points?.length) return null;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length
  };
}

function osmElementsToBuildings(elements = []) {
  const nodes = new Map();
  elements.filter(el => el.type === 'node').forEach(n => nodes.set(n.id, { lat: n.lat, lng: n.lon }));
  return elements
    .filter(el => el.type === 'way' && el.tags?.building && Array.isArray(el.nodes))
    .map(way => {
      const points = way.nodes.map(id => nodes.get(id)).filter(Boolean);
      return {
        id: way.id,
        tags: way.tags || {},
        points,
        centroid: polygonCentroid(points),
        heightM: estimateBuildingHeight(way.tags || {})
      };
    })
    .filter(b => b.points.length >= 3 && b.centroid);
}

async function fetchBuildingsAround(center, radiusM = 160, retries = 2) {
  const query = `
    [out:json][timeout:25];
    (
      way["building"](around:${Math.round(radiusM)},${center.lat.toFixed(6)},${center.lng.toFixed(6)});
    );
    (._;>;);
    out body;
  `;
  let lastErr = new Error('OSM Overpass fetch failed');
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1200 * attempt));
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: query })
      });
      if (!res.ok) throw new Error(`OSM Overpass yanıtı başarısız: HTTP ${res.status}`);
      const data = await res.json();
      return osmElementsToBuildings(data.elements || []);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr;
}

function drawBuildings(map, buildings, contributors) {
  if (!map || !window.L) return;
  // Önceki katmanı güvenli şekilde kaldır
  if (window.osmShadowLayer) {
    try { map.removeLayer(window.osmShadowLayer); } catch { /* ignore */ }
    window.osmShadowLayer = null;
  }
  const group = L.layerGroup();
  const contributorIds = new Set((contributors || []).map(b => b.id));
  buildings.forEach(b => {
    const risky = contributorIds.has(b.id);
    const score = contributors?.find(c => c.id === b.id)?.score ?? 0;
    // Renge göre risk yoğunluğu
    const color = risky
      ? (score >= 55 ? '#EF4444' : '#F97316')
      : '#38BDF8';
    const fillOpacity = risky
      ? (score >= 55 ? 0.45 : 0.32)
      : 0.18;
    const weight = risky ? 2.5 : 1.2;
    const name = b.tags?.name ? `${b.tags.name} · ` : '';
    const buildingType = b.tags?.building ? ` (${b.tags.building})` : '';
    L.polygon(b.points.map(p => [p.lat, p.lng]), {
      color,
      fillColor: color,
      fillOpacity,
      weight,
      opacity: 0.9
    }).bindTooltip(
      `${name}${Math.round(b.heightM)} m yükseklik${buildingType}${risky ? ` · Gölge skoru: ${Math.round(score)}` : ''}`
    ).addTo(group);
  });
  group.addTo(map);
  window.osmShadowLayer = group;
}

function renderShadowSummary(result, sourceLabel) {
  const el = document.getElementById('osm-shadow-summary');
  if (!el) return;
  const color = result.riskLevel === 'high' ? '#EF4444' : result.riskLevel === 'medium' ? '#F59E0B' : '#10B981';
  const riskLabel = result.riskLevel === 'high' ? 'Yüksek Risk' : result.riskLevel === 'medium' ? 'Orta Risk' : 'Düşük Risk';
  const progressWidth = Math.min(100, result.score).toFixed(0);
  const contributorList = result.contributors.length
    ? result.contributors.slice(0, 5).map(b =>
        `<div class="osm-row-flex">
          <span>${Math.round(b.heightM)} m yükseklik · ${Math.round(b.distanceM)} m mesafe</span>
          <span class="${b.score >= 25 ? 'osm-score-bad' : 'osm-score-warn'}">${b.score.toFixed(0)} puan</span>
        </div>`
      ).join('')
    : '<div class="text-muted">OSM verisinde belirgin engel tespit edilmedi</div>';

  el.innerHTML = `
    <div class="osm-summary-grid">
      <div><span class="text-muted">Risk seviyesi:</span>
        <strong class="osm-strong-color" data-c="${color}">${riskLabel}</strong></div>
      <div><span class="text-muted">Skor:</span>
        <strong class="osm-strong-color" data-c="${color}">${result.score.toFixed(0)} / 100</strong></div>
      <div><span class="text-muted">Ek gölge payı:</span>
        <strong class="osm-strong-default">${result.shadowFactorPct.toFixed(1)}%</strong></div>
      <div><span class="text-muted">Tespit edilen bina:</span>
        <strong class="osm-strong-default">${result.contributors.length}</strong></div>
    </div>
    <div class="osm-progress-track">
      <div class="osm-progress-fill" data-w="${progressWidth}" data-c="${color}"></div>
    </div>
    ${result.contributors.length ? `<div class="osm-helper-78-mb-1">En çok gölge yaratan binalar:</div>${contributorList}` : contributorList}
    <div class="osm-helper-72-divider">
      Kaynak: ${sourceLabel}
    </div>
  `;
  // F1.C.7: data-c ve data-w attribute'larını CSS var'a aktar
  if (typeof el.querySelectorAll === 'function') {
    el.querySelectorAll('[data-c]').forEach(node =>
      node.style.setProperty('--c', node.dataset.c));
    el.querySelectorAll('[data-w]').forEach(node =>
      node.style.setProperty('--w', node.dataset.w + '%'));
  }
  window.syncOsmShadowDoubleCountWarning?.();
}

export async function refreshOSMShadowAnalysis() {
  const state = window.state;
  if (!state?.osmShadowEnabled) return null;
  const center = state.roofGeometry?.centroid || (state.lat && state.lon ? { lat: state.lat, lng: state.lon } : null);
  if (!center) {
    window.showToast?.('Önce haritadan konum seçin veya çatı poligonu çizin.', 'error');
    return null;
  }
  const summary = document.getElementById('osm-shadow-summary');
  if (summary) summary.innerHTML = `
    <div class="osm-loading-row">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-1s">
        <path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
      OSM Overpass bina verisi alınıyor (${center.lat.toFixed(4)}, ${center.lng.toFixed(4)})...
    </div>`;

  // OSM analizi için OpenStreetMap katmanına geç (binalar daha net görünür)
  const previousTileLayer = window._activeTileLayer;
  if (previousTileLayer === 'dark' && window.map) {
    window._darkLayer?.remove();
    window._osmLayer?.addTo(window.map);
    window._activeTileLayer = 'osm';
    const lbl = document.getElementById('map-layer-label');
    if (lbl) lbl.textContent = 'Uydu';
    window.showToast?.('OSM binalar için harita görünümü değiştirildi.', 'info');
  }

  try {
    const buildings = await fetchBuildingsAround(center, 200);
    const result = computeShadowRisk(center, buildings, { panelAzimuth: state.azimuth || 180 });
    state.osmShadow = { ...result, buildings, source: 'OSM Overpass building tags' };
    drawBuildings(window.map, buildings, result.contributors);
    renderShadowSummary(result, `OSM Overpass (${buildings.length} bina bulundu)`);
    window.showToast?.(`OSM analizi tamamlandı: ${buildings.length} bina · Ek gölge varsayımı %${result.shadowFactorPct.toFixed(1)} · Risk ${result.riskLevel}`, result.riskLevel === 'high' ? 'error' : 'success');
    return result;
  } catch (err) {
    // Fetch başarısız: önceki tile katmanını geri yükle ki kullanıcı manuel geçişe zorlanmasın.
    if (previousTileLayer === 'dark' && window._activeTileLayer === 'osm' && window.map) {
      window._osmLayer?.remove();
      window._darkLayer?.addTo(window.map);
      window._activeTileLayer = 'dark';
      window.syncMapLayerButton?.();
    }
    const result = computeShadowRisk(center, [], { panelAzimuth: state.azimuth || 180 });
    state.osmShadow = { ...result, buildings: [], source: 'OSM unavailable fallback', error: err.message };
    renderShadowSummary(result, `OSM Overpass erişilemedi (${err.message}) — bina verisi olmadan tahmin`);
    window.showToast?.(`OSM erişilemedi: ${String(err.message || '').replace(/<[^>]*>/g, '')}`, 'error');
    return result;
  }
}

export function toggleOSMShadow(enabled) {
  window.state.osmShadowEnabled = !!enabled;
  const block = document.getElementById('osm-shadow-summary');
  if (!enabled) {
    if (block) block.textContent = 'OSM gölge analizi kapalı. Etkinleştirmek için kutuyu işaretleyin.';
    // Bina katmanını kaldır
    if (window.osmShadowLayer && window.map) {
      try { window.map.removeLayer(window.osmShadowLayer); } catch { /* ignore */ }
      window.osmShadowLayer = null;
    }
  } else {
    refreshOSMShadowAnalysis();
  }
  window.syncOsmShadowDoubleCountWarning?.();
}

if (typeof window !== 'undefined') {
  window.refreshOSMShadowAnalysis = refreshOSMShadowAnalysis;
  window.toggleOSMShadow = toggleOSMShadow;
}
