const COST_PROFILES = new Set(['economy', 'standard', 'premium']);
const PANEL_FORM_FACTORS = new Set(['compactResidential', 'largeFormatCommercial']);
const FINANCIAL_PROFILES = new Set(['conservative', 'base', 'optimistic', 'custom']);
const VAT_PROFILES = new Set(['standard', 'incentive', 'manual']);
const MANUAL_COST_MODES = new Set(['none', 'partialManualOverride', 'fullManualBom']);

export const ASSUMPTION_UI_DEFAULTS = {
  costProfile: 'standard',
  panelFormFactor: 'compactResidential',
  financialProfile: 'base',
  vatProfile: 'standard',
  manualCostMode: 'none'
};

export function normalizeAssumptionUiState(state = {}) {
  return {
    costProfile: COST_PROFILES.has(state.costProfile) ? state.costProfile : ASSUMPTION_UI_DEFAULTS.costProfile,
    panelFormFactor: PANEL_FORM_FACTORS.has(state.panelFormFactor) ? state.panelFormFactor : ASSUMPTION_UI_DEFAULTS.panelFormFactor,
    financialProfile: FINANCIAL_PROFILES.has(state.financialProfile) ? state.financialProfile : ASSUMPTION_UI_DEFAULTS.financialProfile,
    vatProfile: VAT_PROFILES.has(state.vatProfile) ? state.vatProfile : ASSUMPTION_UI_DEFAULTS.vatProfile,
    manualCostMode: MANUAL_COST_MODES.has(state.manualCostMode) ? state.manualCostMode : ASSUMPTION_UI_DEFAULTS.manualCostMode
  };
}

export function clampPercentInput(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

export function flatTariffIncreaseCurveFromPercent(percent) {
  return [{ fromYear: 1, toYear: 25, rate: clampPercentInput(percent, 0) / 100 }];
}

export function manualVatRatesFromUi(values = {}) {
  if (['panelVatRate', 'inverterVatRate', 'bosVatRate', 'laborVatRate'].some(key => (
    values[key] === '' || values[key] === null || values[key] === undefined
  ))) return null;
  const panel = Number(values.panelVatRate);
  const inverter = Number(values.inverterVatRate);
  const bos = Number(values.bosVatRate);
  const labor = Number(values.laborVatRate);
  if (![panel, inverter, bos, labor].every(Number.isFinite)) return null;
  const nonPanelVatRate = (clampPercentInput(inverter) + clampPercentInput(bos) + clampPercentInput(labor)) / 300;
  return {
    panelVatRate: clampPercentInput(panel) / 100,
    inverterVatRate: clampPercentInput(inverter) / 100,
    bosVatRate: clampPercentInput(bos) / 100,
    laborVatRate: clampPercentInput(labor) / 100,
    nonPanelVatRate
  };
}

export function compactManualCostOverrides(values = {}) {
  const out = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === '' || value === null || value === undefined) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}
