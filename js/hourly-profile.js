// ═══════════════════════════════════════════════════════════
// HOURLY PROFILE — Saatlik Üretim Profili (Faz B1)
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════
import { HOURLY_SOLAR_PROFILE } from './data.js';
import { getLoadProfile, normalizeProfile } from './calc-core.js';

let hourlyChart = null;
let currentSeason = 'summer';

export function renderHourlyProfile() {
  const state = window.state;
  const r = state.results;
  const card = document.getElementById('hourly-profile-card');
  if (!card || !r) return;

  card.style.display = 'block';

  const canvas = document.getElementById('hourly-chart-canvas');
  if (!canvas) return;

  updateHourlyChart(state, r);
}

function updateHourlyChart(state, r) {
  const canvas = document.getElementById('hourly-chart-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Günlük üretim
  const dailyProduction = r.annualEnergy / 365;
  const profile = normalizeProfile(HOURLY_SOLAR_PROFILE[currentSeason]);
  const hourlyProduction = profile.map(p => parseFloat((dailyProduction * p).toFixed(2)));

  // Tüketim profili
  const dailyConsumption = (r.hourlySummary?.annualLoad || state.dailyConsumption * 365) / 365;
  const loadProfile = getLoadProfile(state.tariffType);
  const hourlyConsumption = loadProfile.map(l => parseFloat((dailyConsumption * l).toFixed(2)));

  // Self-consumption (overlap)
  const selfConsumption = hourlyProduction.map((p, i) => parseFloat(Math.min(p, hourlyConsumption[i]).toFixed(2)));
  const gridExport = hourlyProduction.map((p, i) => parseFloat(Math.max(0, p - hourlyConsumption[i]).toFixed(2)));
  const gridImport = hourlyConsumption.map((c, i) => parseFloat(Math.max(0, c - hourlyProduction[i]).toFixed(2)));

  const hours = Array.from({length: 24}, (_, i) => i + ':00');

  if (hourlyChart) hourlyChart.destroy();

  hourlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours,
      datasets: [
        {
          label: 'Üretim (kWh)',
          data: hourlyProduction,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245,158,11,0.15)',
          borderWidth: 2.5,
          pointRadius: 0,
          fill: true,
          tension: 0.4,
          order: 3
        },
        {
          label: 'Tüketim (kWh)',
          data: hourlyConsumption,
          borderColor: '#06B6D4',
          borderDash: [5, 3],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.4,
          order: 2
        },
        {
          label: 'Öz Tüketim (kWh)',
          data: selfConsumption,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16,185,129,0.25)',
          borderWidth: 0,
          pointRadius: 0,
          fill: true,
          tension: 0.4,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#94A3B8', font: { family: 'Space Grotesk, Inter', size: 11 } }
        },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)',
          borderColor: 'rgba(71,85,105,0.5)',
          borderWidth: 1,
          titleColor: '#F1F5F9',
          bodyColor: '#94A3B8',
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.raw} kWh`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#94A3B8',
            font: { family: 'Space Grotesk, Inter', size: 10 },
            maxTicksLimit: 12
          },
          grid: { color: 'rgba(71,85,105,0.15)' }
        },
        y: {
          ticks: { color: '#94A3B8', font: { family: 'Space Grotesk, Inter', size: 10 } },
          grid: { color: 'rgba(71,85,105,0.15)' }
        }
      }
    }
  });

  // İstatistikleri güncelle
  const totalSelf = selfConsumption.reduce((a, b) => a + b, 0);
  const totalExport = gridExport.reduce((a, b) => a + b, 0);
  const totalImport = gridImport.reduce((a, b) => a + b, 0);
  const selfRatio = (totalSelf / dailyProduction * 100).toFixed(1);

  const statsEl = document.getElementById('hourly-stats');
  if (statsEl) {
    const isOffGrid = state.scenarioKey === 'off-grid';
    statsEl.innerHTML = `
      <span class="hourly-stat"><span class="hourly-bullet-self">●</span> Öz tüketim: ${totalSelf.toFixed(1)} kWh/gün (${selfRatio}%)</span>
      <span class="hourly-stat"><span class="hourly-bullet-export">●</span> ${isOffGrid ? 'Fazla PV' : 'Şebeke export'}: ${totalExport.toFixed(1)} kWh/gün</span>
      <span class="hourly-stat"><span class="hourly-bullet-import">●</span> ${isOffGrid ? 'Karşılanamayan yük' : 'Şebeke import'}: ${totalImport.toFixed(1)} kWh/gün</span>
    `;
  }
}

export function setHourlySeason(season) {
  currentSeason = season;
  const state = window.state;
  if (state.results) updateHourlyChart(state, state.results);

  document.querySelectorAll('.season-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.season === season);
  });
}

// window'a expose et
window.renderHourlyProfile = renderHourlyProfile;
window.setHourlySeason = setHourlySeason;
