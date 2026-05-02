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
  const isOffGrid = state.scenarioKey === 'off-grid';

  if (isOffGrid && Array.isArray(r.batterySummary?.hourly8760) && r.batterySummary.hourly8760.length >= 8760) {
    renderOffgridDispatchChart(ctx, r);
    return;
  }

  // Günlük üretim
  const dailyProduction = r.annualEnergy / 365;
  const profile = normalizeProfile(HOURLY_SOLAR_PROFILE[currentSeason]);
  const hourlyProduction = profile.map(p => parseFloat((dailyProduction * p).toFixed(2)));

  // Tüketim profili
  const dailyConsumption = (r.hourlySummary?.annualLoad || state.dailyConsumption * 365) / 365;
  // calc-core.js ve calc-engine.js ile tutarlı: usageProfile öncelikli, yoksa tariffType.
  const loadProfile = getLoadProfile(state.usageProfile || state.onGridUsageProfile || state.tariffType);
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
    statsEl.innerHTML = `
      <span class="hourly-stat"><span class="hourly-bullet-self">●</span> Öz tüketim: ${totalSelf.toFixed(1)} kWh/gün (${selfRatio}%)</span>
      <span class="hourly-stat"><span class="hourly-bullet-export">●</span> ${isOffGrid ? 'Fazla PV' : 'Şebeke export'}: ${totalExport.toFixed(1)} kWh/gün</span>
      <span class="hourly-stat"><span class="hourly-bullet-import">●</span> ${isOffGrid ? 'Karşılanamayan yük' : 'Şebeke import'}: ${totalImport.toFixed(1)} kWh/gün</span>
    `;
  }
}

function selectedSeasonMonths(season) {
  const map = {
    winter: new Set([11, 0, 1]),
    spring: new Set([2, 3, 4]),
    summer: new Set([5, 6, 7]),
    autumn: new Set([8, 9, 10]),
    fall: new Set([8, 9, 10])
  };
  return map[season] || map.summer;
}

function monthForHourIndex(hourIndex) {
  const monthDays = [31,28,31,30,31,30,31,31,30,31,30,31];
  let dayOfYear = Math.floor(hourIndex / 24);
  for (let month = 0; month < monthDays.length; month += 1) {
    if (dayOfYear < monthDays[month]) return month;
    dayOfYear -= monthDays[month];
  }
  return 11;
}

function aggregateOffgridTraceByHour(hourly8760, season) {
  const months = selectedSeasonMonths(season);
  const keys = ['pv', 'load', 'directPv', 'battery', 'generator', 'unmet', 'curtailed'];
  const out = Object.fromEntries(keys.map(key => [key, new Array(24).fill(0)]));
  const counts = new Array(24).fill(0);
  hourly8760.slice(0, 8760).forEach((row, idx) => {
    if (!months.has(monthForHourIndex(idx))) return;
    const h = idx % 24;
    counts[h] += 1;
    out.pv[h] += Math.max(0, Number(row.pvKwh) || 0);
    out.load[h] += Math.max(0, Number(row.loadKwh) || 0);
    out.directPv[h] += Math.max(0, Number(row.directSelf ?? row.directPv) || 0);
    out.battery[h] += Math.max(0, Number(row.batteryDischarge) || 0);
    out.generator[h] += Math.max(0, Number(row.generatorKwh ?? row.generatorToLoad) || 0);
    out.unmet[h] += Math.max(0, Number(row.unmet) || 0);
    out.curtailed[h] += Math.max(0, Number(row.curtailed ?? row.curtailedPv) || 0);
  });
  keys.forEach(key => {
    out[key] = out[key].map((value, h) => parseFloat((value / Math.max(1, counts[h])).toFixed(2)));
  });
  return out;
}

function renderOffgridDispatchChart(ctx, r) {
  const trace = aggregateOffgridTraceByHour(r.batterySummary.hourly8760, currentSeason);
  const hours = Array.from({ length: 24 }, (_, i) => i + ':00');
  if (hourlyChart) hourlyChart.destroy();

  const datasets = [
    {
      label: 'PV üretim (kWh)',
      data: trace.pv,
      borderColor: '#F59E0B',
      backgroundColor: 'rgba(245,158,11,0.12)',
      borderWidth: 2.5,
      pointRadius: 0,
      fill: true,
      tension: 0.35,
      order: 6
    },
    {
      label: 'Yük (kWh)',
      data: trace.load,
      borderColor: '#06B6D4',
      borderDash: [5, 3],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0.35,
      order: 5
    },
    {
      label: 'PV doğrudan yük',
      data: trace.directPv,
      borderColor: '#10B981',
      backgroundColor: 'rgba(16,185,129,0.20)',
      borderWidth: 0,
      pointRadius: 0,
      fill: true,
      tension: 0.35,
      order: 2
    },
    {
      label: 'Batarya deşarj',
      data: trace.battery,
      borderColor: '#6366F1',
      backgroundColor: 'rgba(99,102,241,0.18)',
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0.35,
      order: 3
    },
    {
      label: 'Karşılanamayan yük',
      data: trace.unmet,
      borderColor: '#EF4444',
      backgroundColor: 'rgba(239,68,68,0.18)',
      borderWidth: 2,
      pointRadius: 0,
      fill: true,
      tension: 0.2,
      order: 1
    },
    {
      label: 'Kırpılan PV',
      data: trace.curtailed,
      borderColor: '#94A3B8',
      borderDash: [4, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      tension: 0.25,
      order: 4
    }
  ];
  if (trace.generator.some(value => value > 0.001)) {
    datasets.splice(4, 0, {
      label: 'Jeneratör yük',
      data: trace.generator,
      borderColor: '#F97316',
      backgroundColor: 'rgba(249,115,22,0.16)',
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0.25,
      order: 3
    });
  }

  hourlyChart = new Chart(ctx, {
    type: 'line',
    data: { labels: hours, datasets },
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

  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const direct = sum(trace.directPv);
  const battery = sum(trace.battery);
  const generator = sum(trace.generator);
  const unmet = sum(trace.unmet);
  const curtailed = sum(trace.curtailed);
  const statsEl = document.getElementById('hourly-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <span class="hourly-stat"><span class="hourly-bullet-self">●</span> PV doğrudan: ${direct.toFixed(1)} kWh/gün</span>
      <span class="hourly-stat"><span class="hourly-bullet-export">●</span> Batarya: ${battery.toFixed(1)} kWh/gün</span>
      ${generator > 0.01 ? `<span class="hourly-stat"><span class="hourly-bullet-export">●</span> Jeneratör: ${generator.toFixed(1)} kWh/gün</span>` : ''}
      <span class="hourly-stat"><span class="hourly-bullet-import">●</span> Karşılanamayan yük: ${unmet.toFixed(1)} kWh/gün</span>
      <span class="hourly-stat"><span class="hourly-bullet-import">●</span> Kırpılan PV: ${curtailed.toFixed(1)} kWh/gün</span>
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
