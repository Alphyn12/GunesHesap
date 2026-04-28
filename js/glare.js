import { solarPosition } from './sun-path.js';

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }
function normDeg(deg) { return ((deg % 360) + 360) % 360; }
function angleDiff(a, b) {
  const d = Math.abs(normDeg(a) - normDeg(b));
  return Math.min(d, 360 - d);
}
function haversine(a, b) {
  const R = 6371008.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const dLon = toRad(b.lng - a.lng);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normDeg(toDeg(Math.atan2(y, x)));
}

export function estimateGlareRisk({ sunAzimuth, sunElevation, panelAzimuth, panelTilt, targetBearing, targetDistanceM }) {
  if (sunElevation <= 0 || targetDistanceM <= 0) return 0;
  const reflectedAzimuth = normDeg(2 * panelAzimuth - sunAzimuth);
  const reflectedElevation = Math.max(0, sunElevation - Math.max(0, panelTilt - 10) * 0.25);
  const azScore = Math.max(0, 1 - angleDiff(reflectedAzimuth, targetBearing) / 35);
  const elevScore = Math.max(0, 1 - Math.abs(reflectedElevation - 8) / 28);
  const distanceScore = Math.max(0.15, Math.min(1, 600 / Math.max(80, targetDistanceM)));
  return Math.min(100, azScore * elevScore * distanceScore * 100);
}

export function simulateGlareTimeline({ roof, targets, lat, lon, panelAzimuth, panelTilt, date = new Date() }) {
  const center = roof?.centroid || (lat && lon ? { lat, lng: lon } : null);
  if (!center || !targets?.length) return { riskScore: 0, riskyHours: [], rows: [] };
  const rows = [];
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // 15 dakika aralıklı tarama (daha hassas sonuç)
  for (let hour = 5; hour <= 20; hour++) {
    for (let min = 0; min < 60; min += 15) {
      const dt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, min);
      const sun = solarPosition(lat || center.lat, lon || center.lng, dt);
      targets.forEach(target => {
        const dist = haversine(center, target);
        const targetBearing = bearing(center, target);
        const score = estimateGlareRisk({
          sunAzimuth: sun.azimuth,
          sunElevation: sun.elevation,
          panelAzimuth,
          panelTilt,
          targetBearing,
          targetDistanceM: dist
        });
        rows.push({
          hour,
          minute: min,
          timeLabel: `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
          targetName: target.name || 'Gözlem Noktası',
          score,
          sun,
          targetBearing,
          distanceM: dist
        });
      });
    }
  }
  const riskyHours = rows.filter(r => r.score >= 35);
  const riskScore = rows.length ? Math.max(...rows.map(r => r.score)) : 0;
  return { riskScore, riskyHours, rows };
}

function drawTargets(targets) {
  if (!window.map || !window.L) return;
  if (!window.glareLayer) window.glareLayer = L.layerGroup().addTo(window.map);
  window.glareLayer.clearLayers();
  targets.forEach((t, i) => {
    const icon = L.divIcon({
      html: `<div class="glare-marker-rozet">${i + 1}</div>`,
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    const marker = L.marker([t.lat, t.lng], { icon })
      .bindPopup(`<div class="glare-popup">
        <strong>${t.name || `Gözlem Noktası ${i + 1}`}</strong><br>
        <span class="glare-popup-coord">${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}</span><br>
        <button class="glare-popup-remove" data-i="${i}">Sil</button>
      </div>`, { maxWidth: 200 })
      .addTo(window.glareLayer);
    // F1.C.7 batch 4: CSP-safe popup button — popupopen event listener attaches
    // a real DOM click handler instead of inline onclick attribute.
    marker.on('popupopen', e => {
      const btn = e.popup.getElement()?.querySelector('.glare-popup-remove');
      if (btn) btn.addEventListener('click', () => removeGlareTarget(+btn.dataset.i));
    });
  });
}

function scoreColor(score) {
  if (score >= 65) return '#EF4444';
  if (score >= 40) return '#F97316';
  if (score >= 20) return '#F59E0B';
  if (score > 0)   return '#22C55E';
  return '#334155';
}

function renderGlare(result) {
  const el = document.getElementById('glare-summary');
  if (!el) return;

  if (!result.rows.length) {
    el.innerHTML = `<div class="glare-empty">Gözlem noktası yok. Haritadan nokta ekleyin.</div>`;
    return;
  }

  const color = result.riskScore >= 55 ? '#EF4444' : result.riskScore >= 25 ? '#F59E0B' : '#10B981';
  const riskLabel = result.riskScore >= 55 ? 'Yüksek' : result.riskScore >= 25 ? 'Orta' : 'Düşük';

  // Saat bazlı max skor (her saat için)
  const hourScores = {};
  result.rows.forEach(r => {
    if (!hourScores[r.hour] || r.score > hourScores[r.hour]) {
      hourScores[r.hour] = r.score;
    }
  });

  // Bar chart — saat bazlı (height ve background dynamic — data-h/c + setProperty)
  const bars = Object.entries(hourScores)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([hour, score]) => {
      const h = Math.max(4, (score / 100) * 40);
      const c = scoreColor(score);
      return `<div class="glare-bar-cell">
        <div class="glare-bar-fill" data-h="${h}px" data-c="${c}" title="${hour}:00 — ${score.toFixed(0)}"></div>
        <div class="glare-bar-hour">${hour}</div>
      </div>`;
    }).join('');

  // Riskli saatler listesi
  const riskyList = result.riskyHours.length
    ? [...new Set(result.riskyHours.map(r => `${r.timeLabel} ${r.targetName}`))].slice(0, 8).join(' · ')
    : 'Belirgin risk saati tespit edilmedi';

  // Hedef listesi
  const targets = window.state?.glareTargets || [];
  const targetList = targets.map((t, i) =>
    `<div class="glare-target-row">
      <span><strong>${i + 1}.</strong> ${t.name || 'Gözlem Noktası'}</span>
      <span class="glare-target-coord">${t.lat.toFixed(4)}, ${t.lng.toFixed(4)}</span>
    </div>`
  ).join('');

  el.innerHTML = `
    <div class="glare-summary-grid">
      <div><span class="text-muted">Risk:</span> <strong class="glare-summary-strong-c" data-c="${color}">${riskLabel} (${result.riskScore.toFixed(0)}/100)</strong></div>
      <div><span class="text-muted">Riskli slot:</span> <strong class="glare-summary-strong-d">${result.riskyHours.length}</strong></div>
      <div><span class="text-muted">Gözlem noktası:</span> <strong class="glare-summary-strong-d">${targets.length}</strong></div>
    </div>
    <div class="glare-bar-chart">
      ${bars}
    </div>
    <div class="glare-axis-label">Saat (05–20)</div>
    <div class="glare-risky-line">
      <strong>Riskli saatler:</strong> ${riskyList}
    </div>
    ${targets.length ? `<div class="glare-targets-title"><strong>Gözlem noktaları:</strong></div>${targetList}` : ''}
    <div class="glare-footnote">
      Mühendislik ön tahmin modeli (15 dk aralıklı) · Kesin havalimanı/yol glare etüdü yerine geçmez.
    </div>
  `;
  // F1.C.7: dynamic height/background CSS var aktarımı (bar fill + risk strong)
  if (typeof el.querySelectorAll === 'function') {
    el.querySelectorAll('[data-h]').forEach(node =>
      node.style.setProperty('--h', node.dataset.h));
    el.querySelectorAll('[data-c]').forEach(node =>
      node.style.setProperty('--c', node.dataset.c));
  }
}

export function runGlareAnalysis() {
  const state = window.state;
  const targets = state.glareTargets || [];
  const result = simulateGlareTimeline({
    roof: state.roofGeometry,
    targets,
    lat: state.lat,
    lon: state.lon,
    panelAzimuth: state.azimuth || 180,
    panelTilt: state.tilt || 30
  });
  state.glareAnalysis = result;
  renderGlare(result);
  if (window.map && window.L) {
    if (!window.glareLayer) window.glareLayer = L.layerGroup().addTo(window.map);
    drawTargets(targets);
  }
  return result;
}

export function addGlareTargetFromMap() {
  if (!window.map) return;
  if (window._glarePickMode) {
    // İkinci kez tıklandıysa iptal et
    window._glarePickMode = false;
    window.showToast?.('Gözlem noktası ekleme iptal edildi.', 'info');
    return;
  }
  window._glarePickMode = true;
  window.showToast?.('Haritada bir gözlem noktası seçin. İptal için tekrar butona tıklayın.', 'info');
  // Cursor değişimi — harita üzerinde crosshair
  const container = window.map.getContainer();
  const prevCursor = container.style.cursor;
  container.style.cursor = 'crosshair';

  window.map.once('click', e => {
    window._glarePickMode = false;
    container.style.cursor = prevCursor;
    const targets = window.state.glareTargets || [];
    targets.push({ lat: e.latlng.lat, lng: e.latlng.lng, name: `Nokta ${targets.length + 1}` });
    window.state.glareTargets = targets;
    runGlareAnalysis();
    window.showToast?.(`Gözlem noktası ${targets.length} eklendi.`, 'success');
  });
}

export function removeGlareTarget(index) {
  const targets = window.state.glareTargets || [];
  targets.splice(index, 1);
  window.state.glareTargets = targets;
  // Popup kapat
  window.map?.closePopup?.();
  runGlareAnalysis();
}

export function clearGlareTargets() {
  window._glarePickMode = false;
  window.state.glareTargets = [];
  if (window.glareLayer) window.glareLayer.clearLayers();
  runGlareAnalysis();
  window.showToast?.('Tüm gözlem noktaları temizlendi.', 'info');
}

if (typeof window !== 'undefined') {
  window.runGlareAnalysis = runGlareAnalysis;
  window.addGlareTargetFromMap = addGlareTargetFromMap;
  window.removeGlareTarget = removeGlareTarget;
  window.clearGlareTargets = clearGlareTargets;
}
