// ═══════════════════════════════════════════════════════════
// COMPARISON — Rekabetçi Teklif Karşılaştırma (Faz D4)
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════
import { PANEL_TYPES, INVERTER_TYPES, PANEL_TYPE_OPTIONS, normalizePanelTypeKey } from './data.js';
import {
  buildHourlySimulationOptions,
  buildTariffModel,
  calculateSystemLayout,
  estimateSolarCapex,
  evaluateProjectEconomics,
  normalizeHourlyProfileToAnnual,
  normalizeMonthlyProductionToAnnual,
  resolveAnnualOperatingCosts,
  resolveTaxTreatment,
  simulateHourlyEnergy
} from './calc-core.js';
import { localeTag } from './output-i18n.js';

const SCENARIO_LETTERS = ['A', 'B', 'C'];
const DEFAULT_SCENARIOS = [
  { panelType: 'mono_perc',        inverterType: 'string',    customPrice: null },
  { panelType: 'bifacial_topcon',  inverterType: 'optimizer', customPrice: null },
  { panelType: 'n_type_topcon',    inverterType: 'string',    customPrice: null }
];
const ct = key => window.i18n?.t?.(key) || key;

function money(value) {
  const state = window.state || {};
  const currency = state.displayCurrency || 'TRY';
  const usdToTry = Math.max(0.0001, Number(state.usdToTry) || 38.5);
  const converted = currency === 'USD' ? (Number(value) || 0) / usdToTry : (Number(value) || 0);
  return converted.toLocaleString(currency === 'USD' ? 'en-US' : localeTag(), { maximumFractionDigits: 0 }) + ' ' + currency;
}

function moneyRate(value, unit = 'kWh') {
  const state = window.state || {};
  const currency = state.displayCurrency || 'TRY';
  const usdToTry = Math.max(0.0001, Number(state.usdToTry) || 38.5);
  const converted = currency === 'USD' ? (Number(value) || 0) / usdToTry : (Number(value) || 0);
  return converted.toLocaleString(currency === 'USD' ? 'en-US' : localeTag(), { maximumFractionDigits: currency === 'USD' ? 3 : 2 }) + ` ${currency}/${unit}`;
}

export function openComparison() {
  const modal = document.getElementById('comparison-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  buildComparisonUI();
}

export function closeComparison() {
  const modal = document.getElementById('comparison-modal');
  if (modal) modal.style.display = 'none';
  if (!document.querySelector('.modal-active, [data-modal-open="true"]')) {
    document.body.classList.remove('modal-open');
  }
}

function buildComparisonUI() {
  const state = window.state;
  if (!state.results) return;

  const wrap = document.getElementById('comparison-scenarios');
  if (!wrap) return;

  wrap.innerHTML = DEFAULT_SCENARIOS.map((sc, idx) => `
    <div class="comparison-scenario" id="comp-sc-${idx}">
      <h4 class="text-primary mb-3">${ct('comparison.scenarioLabel').replace('{letter}', SCENARIO_LETTERS[idx])}</h4>
      <div class="form-group">
        <label>${ct('comparison.panelTypeLabel')}</label>
        <select id="comp-panel-${idx}" data-change-action="runComparison" class="input-form-row">
          ${PANEL_TYPE_OPTIONS.map(k => {
            const p = PANEL_TYPES[k];
            return `<option value="${k}" ${k === sc.panelType ? 'selected' : ''}>${p.name}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>${ct('comparison.inverterTypeLabel')}</label>
        <select id="comp-inv-${idx}" data-change-action="runComparison" class="input-form-row">
          ${Object.entries(INVERTER_TYPES).map(([k, inv]) => `
            <option value="${k}" ${k === sc.inverterType ? 'selected' : ''}>${inv.name}</option>
          `).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>${ct('comparison.customPriceLabel')}</label>
        <input type="number" id="comp-price-${idx}" placeholder="Toplam TL"
          data-input-action="runComparison" class="input-form-row"/>
      </div>
    </div>
  `).join('');

  runComparison();
}

export function runComparison() {
  const state = window.state;
  if (!state.results) return;

  const r = state.results;
  const baseHourlyProduction8760 = Array.isArray(r.hourlySummary?.hourly8760) && r.hourlySummary.hourly8760.length >= 8760
    ? r.hourlySummary.hourly8760.slice(0, 8760).map(row => Math.max(0, Number(row?.production) || 0))
    : null;
  const results = DEFAULT_SCENARIOS.map((_, idx) => {
    const panelKey = normalizePanelTypeKey(document.getElementById(`comp-panel-${idx}`)?.value || 'mono_perc');
    const invKey = document.getElementById(`comp-inv-${idx}`)?.value || 'string';
    const customPrice = parseFloat(document.getElementById(`comp-price-${idx}`)?.value) || null;

    const panel = PANEL_TYPES[panelKey];
    const inv = INVERTER_TYPES[invKey];

    const layout = calculateSystemLayout({ ...state, panelType: panelKey }, panelKey);
    const panelCount = layout.panelCount;
    const systemPower = layout.systemPower;

    const basePower = Math.max(r.systemPower, 0.001);
    const baseBifacialGain = PANEL_TYPES[normalizePanelTypeKey(state.panelType || 'mono_perc')]?.bifacialGain ?? 0;
    const scenarioBifacialGain = panel.bifacialGain ?? 0;
    const bifacialFactor = (1 + scenarioBifacialGain) / (1 + baseBifacialGain);
    const baseInverterEff = Number(INVERTER_TYPES[state.inverterType || 'string']?.efficiency) || 0.97;
    const scenarioInverterEff = Number(inv.efficiency) || baseInverterEff;
    const inverterFactor = scenarioInverterEff / baseInverterEff;
    const annualEnergy = Math.round(r.annualEnergy * (systemPower / basePower) * inverterFactor * bifacialFactor);

    const costBreakdown = estimateSolarCapex({
      systemPowerKwp: systemPower,
      panel,
      inverterTypeKey: invKey,
      panelKdvRate: 0,
      nonPanelKdvRate: 0.20
    });
    const invUnit = costBreakdown.invUnit;
    const estimatedGrossCost = Math.round(costBreakdown.solarCost);
    const totalCost = customPrice || estimatedGrossCost;
    const taxTreatment = customPrice
      ? null
      : resolveTaxTreatment({
          grossTotalCost: estimatedGrossCost,
          solarKdv: costBreakdown.solarKdv,
          taxEnabled: state.taxEnabled,
          tax: state.tax
        });
    const financialCostBasis = Math.round(taxTreatment?.financialCostBasis ?? totalCost);
    const operatingCosts = resolveAnnualOperatingCosts({
      costBasis: customPrice ? totalCost : financialCostBasis,
      omEnabled: state.omEnabled,
      omRate: state.omRate,
      insuranceRate: state.insuranceRate
    });

    const monthlyData = normalizeMonthlyProductionToAnnual(r.monthlyData || [], annualEnergy);
    const monthlyLoad = Array.isArray(r.monthlyLoad)
      ? r.monthlyLoad
      : new Array(12).fill(Math.max(0, Number(state.dailyConsumption) || 0) * 365 / 12);
    const tariffModel = buildTariffModel({
      ...state,
      annualConsumptionKwh: monthlyLoad.reduce((a, b) => a + b, 0),
      annualProductionKwh: annualEnergy,
      annualPriceIncrease: r.annualPriceIncrease,
      discountRate: r.discountRate,
      tariff: r.tariff,
      exportTariff: r.tariffModel?.exportRate ?? state.exportTariff ?? r.tariff
    });
    const hourlyProduction8760 = normalizeHourlyProfileToAnnual(baseHourlyProduction8760, annualEnergy);
    const hourlySummary = simulateHourlyEnergy(monthlyData, monthlyLoad, buildHourlySimulationOptions({
      state,
      tariffModel,
      hourlyLoad8760: state.hourlyConsumption8760,
      hourlyProduction8760
    }));
    const annualOMCost = operatingCosts.annualOMCost;
    const annualInsurance = operatingCosts.annualInsurance;
    const inverterReplaceCost = state.omEnabled ? Math.round((systemPower * invUnit) * 1.1) : 0;
    const isOffGridScenario = state.scenarioKey === 'off-grid';
    const financialTariffModel = isOffGridScenario && r.financialSavingsRate
      ? { ...tariffModel, importRate: r.financialSavingsRate, distributionFee: 0, exportRate: 0, financialBasis: r.financialSavingsBasis || 'off-grid-alternative-energy-cost' }
      : tariffModel;
    // exportRateOverride evaluateProjectEconomics içinde tariffModel.exportRate'in önüne geçer
    // (calc-core.js evaluateProjectEconomics → computeFinancialTable). Tek doğruluk kaynağı bu satır.
    const netMeteringActive = state.netMeteringEnabled && !isOffGridScenario;
    const exportRateOverride = netMeteringActive ? Number(tariffModel.exportRate) || 0 : 0;
    const economicSummary = evaluateProjectEconomics({
      annualEnergy,
      hourlySummary,
      batterySummary: null,
      totalCost: financialCostBasis,
      tariffModel: financialTariffModel,
      panel,
      annualOMCost,
      annualInsurance,
      inverterLifetime: inv.lifetime || 12,
      inverterReplaceCost,
      netMeteringEnabled: netMeteringActive,
      exportRateOverride,
      annualGeneratorCost: isOffGridScenario ? (r.offgridL2Results?.generatorFuelCostAnnual || 0) : 0,
      scenarioKey: state.scenarioKey
    });

    return {
      name: ct('comparison.scenarioLabel').replace('{letter}', SCENARIO_LETTERS[idx]),
      panelName: panel.name,
      invName: inv.name,
      panelCount, systemPower: systemPower.toFixed(2),
      annualEnergy: annualEnergy.toLocaleString(localeTag()),
      totalCost,
      financialCostBasis,
      paybackYear: economicSummary.grossSimplePaybackYear ? Number(economicSummary.grossSimplePaybackYear).toFixed(1) : '>25',
      npv: Math.round(economicSummary.projectNPV),
      lcoe: economicSummary.lcoe,
      compensatedLcoe: economicSummary.compensatedLcoe,
      isCustom: !!customPrice
    };
  });

  // Tabloyu render et
  const tableEl = document.getElementById('comparison-result-table');
  if (!tableEl) return;

  const validPaybacks = results
    .filter(r => r.paybackYear !== '>25')
    .map(r => parseFloat(r.paybackYear))
    .filter(Number.isFinite);
  const bestPayback = validPaybacks.length ? Math.min(...validPaybacks) : null;

  tableEl.innerHTML = `
    <table class="comp-table">
      <thead>
        <tr>
          <th>${ct('comparison.metricLabel')}</th>
          ${results.map(r => `<th class="text-primary">${r.name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        <tr><td>${ct('comparison.panel')}</td>${results.map(r => `<td>${r.panelName}</td>`).join('')}</tr>
        <tr><td>${ct('comparison.inverter')}</td>${results.map(r => `<td>${r.invName}</td>`).join('')}</tr>
        <tr><td>${ct('comparison.systemKwp')}</td>${results.map(r => `<td>${r.systemPower} kWp</td>`).join('')}</tr>
        <tr><td>${ct('comparison.annualProduction')}</td>${results.map(r => `<td>${r.annualEnergy} kWh</td>`).join('')}</tr>
        <tr><td>${ct('comparison.totalCost')}</td>${results.map(r => `<td>${money(r.totalCost)}${r.isCustom ? ' *' : ''}</td>`).join('')}</tr>
        <tr><td>${ct('comparison.payback')}</td>${results.map(r => { const isBest = bestPayback != null && parseFloat(r.paybackYear) === bestPayback; return `<td class="${isBest ? 'comparison-cell-best' : ''}">${ct('comparison.paybackYears').replace('{n}', r.paybackYear)}${isBest ? ' ✓' : ''}</td>`; }).join('')}</tr>
        <tr><td>${ct('comparison.projectNpv')}</td>${results.map(r => `<td>${money(r.npv)}</td>`).join('')}</tr>
        <tr><td>${ct('comparison.lcoe')}</td>${results.map(r => `<td>${(r.compensatedLcoe != null || r.lcoe != null) ? moneyRate(r.compensatedLcoe ?? r.lcoe, 'kWh') : '—'}</td>`).join('')}</tr>
      </tbody>
    </table>
    <p class="text-helper-75-mt-2">${ct('comparison.footnote')}</p>
  `;
}

// window'a expose et
window.openComparison = openComparison;
window.closeComparison = closeComparison;
window.runComparison = runComparison;
