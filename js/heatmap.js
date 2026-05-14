// ═══════════════════════════════════════════════════════════
// HEATMAP — Türkiye Üretim Animasyon Haritası (Faz E1)
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════
import { TURKISH_CITIES, PSH_FALLBACK, MONTHS } from './data.js';

let heatmapMap = null;
let heatmapMarkers = [];
let animInterval = null;
let currentAnimMonth = 0;
let isPlaying = false;

// Aylık PSH ağırlıkları (MONTH_WEIGHTS'e benzer, ama PSH-scaled)
const MONTHLY_PSH_FACTORS = [0.60, 0.68, 0.88, 0.98, 1.08, 1.18, 1.15, 1.10, 0.93, 0.78, 0.58, 0.46];

export function initHeatmap() {
  const container = document.getElementById('heatmap-container');
  if (!container || heatmapMap) return;

  heatmapMap = L.map('heatmap-container', {
    center: [39.0, 35.0],
    zoom: 5,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 10,
    detectRetina: false
  }).addTo(heatmapMap);

  renderHeatmapMonth(0);
}

function getProductionColor(psh, monthFactor) {
  const effective = psh * monthFactor;
  if (effective < 1.5) return '#3B82F6';
  if (effective < 2.5) return '#06B6D4';
  if (effective < 3.5) return '#22C55E';
  if (effective < 4.5) return '#EAB308';
  if (effective < 5.5) return '#F97316';
  return '#EF4444';
}

function renderHeatmapMonth(monthIdx) {
  currentAnimMonth = monthIdx;

  // Mevcut marker'ları kaldır
  heatmapMarkers.forEach(m => m.remove());
  heatmapMarkers = [];

  const factor = MONTHLY_PSH_FACTORS[monthIdx];
  const state = window.state;

  TURKISH_CITIES.forEach(city => {
    const psh = PSH_FALLBACK[city.name] ?? PSH_FALLBACK['default'] ?? 3.5;
    const color = getProductionColor(psh, factor);
    const monthlyPSH = (psh * factor).toFixed(2);
    const isSelected = state.cityName === city.name;

    const marker = L.circleMarker([city.lat, city.lon], {
      radius: isSelected ? 9 : 6,
      fillColor: color,
      color: isSelected ? '#fff' : 'rgba(255,255,255,0.3)',
      weight: isSelected ? 2 : 0.5,
      opacity: 0.9,
      fillOpacity: isSelected ? 1.0 : 0.75
    }).addTo(heatmapMap);

    marker.bindTooltip(
      `<strong>${city.name}</strong><br>PSH: ${monthlyPSH} saat/gün<br>GHI: ${city.ghi} kWh/m²/yıl`,
      { direction: 'top', className: 'heatmap-tooltip' }
    );

    heatmapMarkers.push(marker);
  });

  // Ay göstergesini güncelle
  const monthEl = document.getElementById('heatmap-month');
  if (monthEl) monthEl.textContent = MONTHS[monthIdx] + ' — Aylık PSH Haritası';

  // Seçili şehri ortala
  if (state.lat && state.lon) {
    heatmapMap.setView([state.lat, state.lon], 6, { animate: false });
  }
}

function stopHeatmapAnimation() {
  if (animInterval) clearInterval(animInterval);
  animInterval = null;
  isPlaying = false;
  const btn = document.getElementById('heatmap-play-btn');
  if (btn) btn.textContent = '▶ Oynat';
}

export function toggleHeatmapAnimation() {
  if (isPlaying) {
    stopHeatmapAnimation();
  } else {
    isPlaying = true;
    const btn = document.getElementById('heatmap-play-btn');
    if (btn) btn.textContent = '⏸ Durdur';
    animInterval = setInterval(() => {
      currentAnimMonth = (currentAnimMonth + 1) % 12;
      renderHeatmapMonth(currentAnimMonth);
    }, 800);
  }
}

export function setHeatmapMonth(month) {
  stopHeatmapAnimation();
  renderHeatmapMonth(parseInt(month));
}

export function showHeatmapCard() {
  const card = document.getElementById('heatmap-card');
  if (!card) return;
  card.style.display = 'block';

  setTimeout(() => {
    if (!heatmapMap) initHeatmap();
    else {
      heatmapMap.invalidateSize();
      renderHeatmapMonth(currentAnimMonth);
    }
  }, 100);
}

// window'a expose et
window.toggleHeatmapAnimation = toggleHeatmapAnimation;
window.setHeatmapMonth = setHeatmapMonth;
window.showHeatmapCard = showHeatmapCard;
window.initHeatmap = initHeatmap;
