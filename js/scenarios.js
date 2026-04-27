// ═══════════════════════════════════════════════════════════
// SCENARIOS — Enflasyon & Döviz Kuru Senaryoları (Faz D1-D2)
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════

import { buildTariffModel, evaluateProjectEconomics } from './calc-core.js';

let scenarioChart = null;
let fxChart = null;

const t = key => window.i18n?.t?.(key) || key;

const INFLATION_SCENARIOS = {
  low:    { labelKey: 'scenarioAnalysis.lowInflation',  rate: 0.15, color: '#10B981' },
  mid:    { labelKey: 'scenarioAnalysis.midInflation',  rate: 0.25, color: '#F59E0B' },
  high:   { labelKey: 'scenarioAnalysis.highInflation', rate: 0.40, color: '#EF4444' }
};

function money(value) {
  const state = window.state || {};
  const currency = state.displayCurrency || 'TRY';
  const usdToTry = Math.max(0.0001, Number(state.usdToTry) || 38.5);
  const converted = currency === 'USD' ? (Number(value) || 0) / usdToTry : (Number(value) || 0);
  return converted.toLocaleString(currency === 'USD' ? 'en-US' : 'tr-TR', { maximumFractionDigits: 0 }) + ' ' + currency;
}

export function renderScenarioAnalysis() {
  const state = window.state;
  const r = state.results;
  const card = document.getElementById('scenario-card');
  if (!card || !r) return;

  card.style.display = 'block';

  // Senaryo metrikleri hesapla
  const scenarios = Object.entries(INFLATION_SCENARIOS).map(([key, sc]) => {
    return computeScenario(r, sc.rate, state);
  });

  // Özel senaryo
  const customRate = parseFloat(document.getElementById('scenario-custom-rate')?.value) / 100 || 0.30;
  const customScenario = computeScenario(r, customRate, state);
  const summaryEl = document.getElementById('scenario-summary-strip');
  if (summaryEl) {
    const bestScenario = scenarios.reduce((best, current) => Number(current.npv) > Number(best.npv) ? current : best, scenarios[0]);
    const worstScenario = scenarios.reduce((worst, current) => Number(current.npv) < Number(worst.npv) ? current : worst, scenarios[0]);
    const scenarioKeyByRate = rate => Object.entries(INFLATION_SCENARIOS).find(([, sc]) => sc.rate === rate)?.[1];
    const bestMeta = scenarioKeyByRate(bestScenario.inflationRate) || { labelKey: 'scenarioAnalysis.midInflation' };
    const worstMeta = scenarioKeyByRate(worstScenario.inflationRate) || { labelKey: 'scenarioAnalysis.lowInflation' };
    summaryEl.innerHTML = `
      <article class="scenario-insight-card">
        <div class="scenario-insight-value">${bestScenario.paybackYear ? t('scenarioAnalysis.paybackYears').replace('{n}', bestScenario.paybackYear) : t('scenarioAnalysis.paybackOver25')}</div>
        <div class="scenario-insight-label">En hızlı geri dönen senaryo</div>
        <div class="scenario-insight-note">${t(bestMeta.labelKey)} koşulunda yatırım en hızlı şekilde kendini geri ödüyor.</div>
      </article>
      <article class="scenario-insight-card">
        <div class="scenario-insight-value">${money(customScenario.npv)}</div>
        <div class="scenario-insight-label">Seçtiğiniz özel senaryonun 25 yıllık etkisi</div>
        <div class="scenario-insight-note">%${(customRate * 100).toFixed(0)} yıllık artış varsayımıyla yatırımın uzun vadeli toplam etkisi.</div>
      </article>
      <article class="scenario-insight-card">
        <div class="scenario-insight-value">${money(bestScenario.npv - worstScenario.npv)}</div>
        <div class="scenario-insight-label">İyimser ve zorlayıcı senaryo farkı</div>
        <div class="scenario-insight-note">${t(bestMeta.labelKey)} ile ${t(worstMeta.labelKey)} arasında beklenen fark bu seviyeye çıkıyor.</div>
      </article>
    `;
  }

  // Metric tablosu
  const tableEl = document.getElementById('scenario-table');
  if (tableEl) {
    const scenarioVals = Object.values(INFLATION_SCENARIOS);
    tableEl.innerHTML = `
      <table class="scenario-compare-table">
        <thead>
          <tr>
            <th>${t('scenarioAnalysis.scenario')}</th>
            <th>${t('scenarioAnalysis.payback')}</th>
            <th>${t('scenarioAnalysis.npv25y')}</th>
            <th>${t('scenarioAnalysis.irr')}</th>
            <th>${t('scenarioAnalysis.roi')}</th>
          </tr>
        </thead>
        <tbody>
          ${scenarios.map((sc, i) => `
            <tr class="scenario-row-color" data-c="${scenarioVals[i].color}">
              <td class="scenario-text-color" data-c="${scenarioVals[i].color}">${t(scenarioVals[i].labelKey)}</td>
              <td>${sc.paybackYear ? t('scenarioAnalysis.paybackYears').replace('{n}', sc.paybackYear) : t('scenarioAnalysis.paybackOver25')}</td>
              <td>${money(sc.npv)}</td>
              <td>${sc.irr}%</td>
              <td>${sc.roi}%</td>
            </tr>
          `).join('')}
          <tr class="scenario-row-purple">
            <td class="scenario-text-purple">${t('scenarioAnalysis.customScenario').replace('{rate}', (customRate*100).toFixed(0))}</td>
            <td>${customScenario.paybackYear ? t('scenarioAnalysis.paybackYears').replace('{n}', customScenario.paybackYear) : t('scenarioAnalysis.paybackOver25')}</td>
            <td>${money(customScenario.npv)}</td>
            <td>${customScenario.irr}%</td>
            <td>${customScenario.roi}%</td>
          </tr>
        </tbody>
      </table>
    `;
    // F1.C.7: data-c attribute'larını CSS var'a aktar
    if (typeof tableEl.querySelectorAll === 'function') {
      tableEl.querySelectorAll('[data-c]').forEach(el =>
        el.style.setProperty('--c', el.dataset.c));
    }
  }

  // Kümülatif nakit akışı grafiği
  renderScenarioChart(r, state, customRate);
  renderSensitivityTable(r);

  // Döviz kuru projeksiyonu (NM aktifse)
  if (state.netMeteringEnabled) renderFXProjection(r, state);
}

function computeSensitivityNpv(r, state, overrides = {}) {
  // FIX-1: Re-compute NPV via the shared project-economics helper so each sensitivity case
  // uses a correctly scaled 25-year cash-flow model with proper degradation and
  // escalation — instead of the old heuristic (annualSavings × 0.10 × 8) which
  // was wrong and produced identical deltas for "Üretim -10%" and "Tarife -10%".
  const panel = window._appData?.PANEL_TYPES?.[state.panelType] ||
    { degradation: 0.0045, firstYearDeg: 0.02 };
  const tariffModel = buildTariffModel({
    ...state,
    annualConsumptionKwh: r.hourlySummary?.annualLoad || r.tariffModel?.annualConsumptionKwh,
    tariff: overrides.tariffMultiplier != null
      ? (r.tariffModel?.pstRate ?? r.tariff) * overrides.tariffMultiplier
      : (r.tariffModel?.pstRate ?? r.tariff),
    skttTariff: overrides.tariffMultiplier != null
      ? (r.tariffModel?.skttRate ?? r.tariff) * overrides.tariffMultiplier
      : (r.tariffModel?.skttRate ?? r.tariff),
    contractedTariff: overrides.tariffMultiplier != null
      ? (r.tariffModel?.contractedRate ?? r.tariff) * overrides.tariffMultiplier
      : (r.tariffModel?.contractedRate ?? r.tariff),
    exportTariff: r.tariffModel?.exportRate ?? r.tariff,
    // Faz-4 Fix-17: Monte Carlo can override tariff growth rate per sample
    annualPriceIncrease: overrides._annualPriceIncrease ?? (state.annualPriceIncrease ?? 0.12),
    discountRate: r.discountRate
  });
  const financialTariffModel = state.scenarioKey === 'off-grid' && r.financialSavingsRate
    ? { ...tariffModel, importRate: r.financialSavingsRate, exportRate: 0, financialBasis: r.financialSavingsBasis || 'off-grid-alternative-energy-cost' }
    : tariffModel;
  // When energy is scaled, the hourly summary must be scaled proportionally so
  // that selfRatio (= selfConsumption / annualEnergy) is preserved and savings
  // change correctly. Without this, the multiplier cancels out in the formula:
  //   selfE = annualEnergy × (selfConsumption / annualEnergy) = selfConsumption (unchanged).
  const em = overrides.energyMultiplier ?? 1;
  const scaledHourlySummary = em !== 1 && r.hourlySummary ? {
    ...r.hourlySummary,
    annualProduction: (r.hourlySummary.annualProduction || 0) * em,
    selfConsumption:  (r.hourlySummary.selfConsumption  || 0) * em,
    gridExport:       (r.hourlySummary.gridExport        || 0) * em,
    paidGridExport:   (r.hourlySummary.paidGridExport    || 0) * em,
    unpaidGridExport: (r.hourlySummary.unpaidGridExport  || 0) * em
  } : r.hourlySummary;
  const scaledBatterySummary = em !== 1 && r.batterySummary ? {
    ...r.batterySummary,
    totalSelfConsumption: (r.batterySummary.totalSelfConsumption || 0) * em,
    paidGridExport:       (r.batterySummary.paidGridExport       || 0) * em
  } : r.batterySummary;

  const baseCost = Number(r.financialCostBasis || r.totalCost) || 0;
  const costMultiplier = overrides.costMultiplier ?? 1;
  const annualOMCost = overrides.costMultiplier != null ? r.annualOMCost * costMultiplier : r.annualOMCost;
  const annualInsurance = overrides.costMultiplier != null ? r.annualInsurance * costMultiplier : r.annualInsurance;
  const inverterReplaceCost = overrides.costMultiplier != null ? r.inverterReplaceCost * costMultiplier : r.inverterReplaceCost;
  const economicSummary = evaluateProjectEconomics({
    annualEnergy: r.annualEnergy * em,
    hourlySummary: scaledHourlySummary,
    batterySummary: scaledBatterySummary,
    totalCost: baseCost * costMultiplier,
    tariffModel: financialTariffModel,
    panel,
    annualOMCost,
    annualInsurance,
    inverterLifetime: r.inverterLifetime || 12,
    inverterReplaceCost,
    netMeteringEnabled: state.netMeteringEnabled,
    exportRateOverride: state.netMeteringEnabled && state.scenarioKey !== 'off-grid' ? tariffModel.exportRate : 0,
    annualGeneratorCost: state.scenarioKey === 'off-grid' ? (r.offgridL2Results?.generatorFuelCostAnnual || 0) : 0,
    scenarioKey: state.scenarioKey
  });
  return Math.round(economicSummary.projectNPV);
}

function renderSensitivityTable(r) {
  const el = document.getElementById('sensitivity-table');
  if (!el) return;
  const state = window.state;
  const baseNpv = Number(r.npvTotal) || 0;
  // FIX-1: Each case calls computeSensitivityNpv() so Üretim and Tarife produce
  // different — and correct — NPV deltas based on actual 25-year model.
  const cases = [
    { label: t('scenarioAnalysis.energyMinus10'), npv: computeSensitivityNpv(r, state, { energyMultiplier: 0.90 }) },
    { label: t('scenarioAnalysis.energyPlus10'),  npv: computeSensitivityNpv(r, state, { energyMultiplier: 1.10 }) },
    { label: t('scenarioAnalysis.costMinus10'),   npv: computeSensitivityNpv(r, state, { costMultiplier: 0.90 }) },
    { label: t('scenarioAnalysis.costPlus10'),    npv: computeSensitivityNpv(r, state, { costMultiplier: 1.10 }) },
    { label: t('scenarioAnalysis.tariffMinus10'), npv: computeSensitivityNpv(r, state, { tariffMultiplier: 0.90 }) },
    { label: t('scenarioAnalysis.tariffPlus10'),  npv: computeSensitivityNpv(r, state, { tariffMultiplier: 1.10 }) },
  ].map(c => ({ ...c, delta: c.npv - baseNpv }));

  const mcBands = computeMonteCarloBands(r, state, 500);
  const mcHtml = mcBands
    ? `<div class="mc-card-frame">
        <div class="mc-card-title">
          Monte Carlo NPV Güven Bandı (500 iterasyon)
          <span class="mc-card-hint"> — üretim ±15%, tarife artışı %10–40%</span>
        </div>
        <div class="mc-card-grid">
          <div><div class="mc-percentile-label">P90 (muhafazakâr)</div><div class="mc-percentile-value mc-percentile-value--p90">${money(mcBands.p90)}</div></div>
          <div><div class="mc-percentile-label">P50 (medyan)</div><div class="mc-percentile-value mc-percentile-value--p50">${money(mcBands.p50)}</div></div>
          <div><div class="mc-percentile-label">P10 (iyimser)</div><div class="mc-percentile-value mc-percentile-value--p10">${money(mcBands.p10)}</div></div>
        </div>
      </div>`
    : '';

  el.innerHTML = `
    <div class="scenario-section-title">${t('scenarioAnalysis.sensitivityTitle')}</div>
    <table class="scenario-compare-table">
      <thead><tr><th>${t('scenarioAnalysis.variable')}</th><th>${t('scenarioAnalysis.npvImpact')}</th><th>${t('scenarioAnalysis.newNpv')}</th></tr></thead>
      <tbody>
        ${cases.map(c => `<tr>
          <td>${c.label}</td>
          <td class="${c.delta >= 0 ? 'scenario-delta-positive' : 'scenario-delta-negative'}">${c.delta >= 0 ? '+' : ''}${money(c.delta)}</td>
          <td>${money(c.npv)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    ${mcHtml}
  `;
}

// Faz-4 Fix-17: Stochastic sensitivity — Monte Carlo P10/P50/P90 NPV distribution.
// Samples 500 (production multiplier, annualPriceIncrease) pairs from the
// realistic uncertainty envelope and runs the full 25-year financial model for each.
// Production: uniform ±15% around P50 (PVGIS 10-year interannual + model uncertainty).
// Tariff growth: uniform 10%–40% (Turkish electricity market historical range).
function computeMonteCarloBands(r, state, iterations = 500) {
  try {
    const npvs = [];
    const rng = () => Math.random(); // uniform [0,1)
    for (let i = 0; i < iterations; i++) {
      // Sample from uniform distributions over the uncertainty ranges
      const energyMult = 0.85 + rng() * 0.30;           // [0.85, 1.15]
      const tariffGrowth = 0.10 + rng() * 0.30;          // [0.10, 0.40]
      const npv = computeSensitivityNpv(r, state, {
        energyMultiplier: energyMult,
        // Override tariff growth via state-level clone inside the helper
        _annualPriceIncrease: tariffGrowth
      });
      npvs.push(npv);
    }
    npvs.sort((a, b) => a - b);
    const p90idx = Math.floor(iterations * 0.10);   // 10th percentile = P90 exceedance
    const p50idx = Math.floor(iterations * 0.50);
    const p10idx = Math.floor(iterations * 0.90);   // 90th percentile = P10 exceedance
    return { p90: npvs[p90idx], p50: npvs[p50idx], p10: npvs[p10idx] };
  } catch (e) {
    console.warn('[MC] Monte Carlo NPV failed:', e);
    return null;
  }
}

function computeScenario(r, inflationRate, state) {
  const totalCost = Number(r.financialCostBasis || r.totalCost) || 0;
  const panel = window._appData?.PANEL_TYPES?.[state.panelType] ||
    { degradation: 0.0045, firstYearDeg: 0.02 };
  const tariffModel = buildTariffModel({
    ...state,
    annualConsumptionKwh: r.hourlySummary?.annualLoad || r.tariffModel?.annualConsumptionKwh,
    tariff: r.tariffModel?.pstRate ?? r.tariff,
    skttTariff: r.tariffModel?.skttRate ?? r.tariff,
    contractedTariff: r.tariffModel?.contractedRate ?? r.tariff,
    exportTariff: r.tariffModel?.exportRate ?? r.tariff,
    annualPriceIncrease: inflationRate,
    discountRate: r.discountRate
  });
  const financialTariffModel = state.scenarioKey === 'off-grid' && r.financialSavingsRate
    ? { ...tariffModel, importRate: r.financialSavingsRate, exportRate: 0, financialBasis: r.financialSavingsBasis || 'off-grid-alternative-energy-cost' }
    : tariffModel;
  const economicSummary = evaluateProjectEconomics({
    annualEnergy: r.annualEnergy,
    hourlySummary: r.hourlySummary,
    batterySummary: r.batterySummary,
    totalCost,
    tariffModel: financialTariffModel,
    panel,
    annualOMCost: r.annualOMCost,
    annualInsurance: r.annualInsurance,
    inverterLifetime: r.inverterLifetime || 12,
    inverterReplaceCost: r.inverterReplaceCost,
    netMeteringEnabled: state.netMeteringEnabled,
    exportRateOverride: state.netMeteringEnabled && state.scenarioKey !== 'off-grid' ? tariffModel.exportRate : 0,
    annualGeneratorCost: state.scenarioKey === 'off-grid' ? (r.offgridL2Results?.generatorFuelCostAnnual || 0) : 0,
    scenarioKey: state.scenarioKey
  });
  const cashFlows = [-totalCost, ...economicSummary.yearlyTable.map(row => row.netCashFlow)];

  return {
    inflationRate,
    paybackYear: economicSummary.grossSimplePaybackYear ? Number(economicSummary.grossSimplePaybackYear).toFixed(1) : economicSummary.simplePaybackYear,
    npv: Math.round(economicSummary.projectNPV),
    irr: economicSummary.irr,
    roi: economicSummary.roi.toFixed(1),
    cashFlows
  };
}

function renderScenarioChart(r, state, customRate) {
  const canvas = document.getElementById('scenario-chart-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (scenarioChart) scenarioChart.destroy();

  const labels = Array.from({length: 25}, (_, i) => t('scenarioAnalysis.yearLabel').replace('{n}', i + 1));
  const allScenarios = [
    ...Object.entries(INFLATION_SCENARIOS).map(([k, sc]) => ({
      ...sc,
      label: t(sc.labelKey),
      data: computeScenario(r, sc.rate, state).cashFlows.slice(1)
    })),
    {
      label: t('scenarioAnalysis.customScenario').replace('{rate}', (customRate*100).toFixed(0)),
      rate: customRate,
      color: '#8B5CF6',
      data: computeScenario(r, customRate, state).cashFlows.slice(1)
    }
  ];

  // Kümülatif dönüştür
  const cumData = allScenarios.map(sc => {
    let cum = -r.totalCost;
    return sc.data.map(v => { cum += v; return Math.round(cum); });
  });

  scenarioChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: allScenarios.map((sc, i) => ({
        label: sc.label,
        data: cumData[i],
        borderColor: sc.color,
        backgroundColor: sc.color + '18',
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.3
      }))
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#94A3B8', font: { size: 11 } } },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)',
          titleColor: '#F1F5F9',
          bodyColor: '#94A3B8',
          callbacks: {
            label: c => ` ${c.dataset.label}: ${money(c.raw)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94A3B8', maxTicksLimit: 10 }, grid: { color: 'rgba(71,85,105,0.15)' } },
        y: { ticks: { color: '#94A3B8', callback: v => money(v) }, grid: { color: 'rgba(71,85,105,0.15)' } }
      }
    }
  });
}

function renderFXProjection(r, state) {
  const canvas = document.getElementById('fx-chart-canvas');
  const fxCard = document.getElementById('fx-projection-card');
  if (!canvas || !fxCard) return;
  fxCard.style.display = 'block';

  const baseRate = state.usdToTry || 38.5;
  const growth = parseFloat(document.getElementById('fx-growth-rate')?.value) / 100 || 0.20;

  const labels = Array.from({length: 11}, (_, i) => i === 0 ? t('scenarioAnalysis.today') : t('scenarioAnalysis.yearLabel').replace('{n}', i));
  const centerData = labels.map((_, i) => Math.round(baseRate * Math.pow(1 + growth, i)));
  const upperData = labels.map((_, i) => Math.round(baseRate * Math.pow(1 + growth * 1.3, i)));
  const lowerData = labels.map((_, i) => Math.round(baseRate * Math.pow(1 + growth * 0.7, i)));

  const ctx = canvas.getContext('2d');
  if (fxChart) fxChart.destroy();

  fxChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: t('scenarioAnalysis.fxUpperScenario'),
          data: upperData,
          borderColor: '#EF4444',
          borderWidth: 1.5,
          borderDash: [5, 3],
          pointRadius: 0,
          fill: '+2',
          backgroundColor: 'rgba(239,68,68,0.08)'
        },
        {
          label: t('scenarioAnalysis.fxBaseScenario').replace('{rate}', (growth*100).toFixed(0)),
          data: centerData,
          borderColor: '#F59E0B',
          borderWidth: 2.5,
          pointRadius: 3,
          fill: false
        },
        {
          label: t('scenarioAnalysis.fxLowerScenario'),
          data: lowerData,
          borderColor: '#10B981',
          borderWidth: 1.5,
          borderDash: [5, 3],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#94A3B8', font: { size: 11 } } },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)',
          titleColor: '#F1F5F9',
          bodyColor: '#94A3B8',
          callbacks: {
            label: c => ` USD/TRY: ${c.raw}`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94A3B8' }, grid: { color: 'rgba(71,85,105,0.15)' } },
        y: { ticks: { color: '#94A3B8', callback: v => v + ' TRY' }, grid: { color: 'rgba(71,85,105,0.15)' } }
      }
    }
  });
}

export function onScenarioCustomChange() {
  const state = window.state;
  if (state.results) renderScenarioAnalysis();
}

// window'a expose et
window.renderScenarioAnalysis = renderScenarioAnalysis;
window.onScenarioCustomChange = onScenarioCustomChange;
