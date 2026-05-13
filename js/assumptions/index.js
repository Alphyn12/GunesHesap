import costAssumptions from './cost-assumptions-tr-2026-q2.js';
import financialAssumptions from './financial-assumptions-tr-2026-q2.js';

export const COST_ASSUMPTIONS = costAssumptions;
export const FINANCIAL_ASSUMPTIONS = financialAssumptions;

export const DEFAULT_COST_PROFILE = 'standard';
export const DEFAULT_PANEL_FORM_FACTOR = 'compactResidential';
export const DEFAULT_VAT_PROFILE = 'standard';
export const DEFAULT_FINANCIAL_PROFILE = 'base';

function clampRate(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(-0.5, Math.min(2, n)) : fallback;
}

export function normalizeCostProfile(profile) {
  return ['economy', 'standard', 'premium'].includes(profile) ? profile : DEFAULT_COST_PROFILE;
}

export function normalizePanelFormFactor(formFactor) {
  return COST_ASSUMPTIONS.panelFormFactors?.[formFactor] ? formFactor : DEFAULT_PANEL_FORM_FACTOR;
}

export function normalizeVatProfile(profile) {
  return COST_ASSUMPTIONS.vatProfiles?.[profile] ? profile : DEFAULT_VAT_PROFILE;
}

export function normalizeFinancialProfile(profile) {
  return FINANCIAL_ASSUMPTIONS.financialProfiles?.[profile] ? profile : DEFAULT_FINANCIAL_PROFILE;
}

export function getPanelPriceBand(panelType, costProfile = DEFAULT_COST_PROFILE) {
  const key = panelType === 'mono' ? 'mono_perc'
    : panelType === 'poly' ? 'n_type_topcon'
      : panelType === 'bifacial' ? 'bifacial_topcon'
        : panelType;
  const band = COST_ASSUMPTIONS.panelPrices?.[key] || COST_ASSUMPTIONS.panelPrices?.mono_perc;
  const profile = normalizeCostProfile(costProfile);
  const price = profile === 'economy' ? band.low : profile === 'premium' ? band.high : band.base;
  return { ...band, selected: price, profile };
}

export function getPanelFormFactor(formFactor = DEFAULT_PANEL_FORM_FACTOR) {
  const key = normalizePanelFormFactor(formFactor);
  return { key, ...(COST_ASSUMPTIONS.panelFormFactors[key] || {}) };
}

export function resolveVatRates({ vatProfile = DEFAULT_VAT_PROFILE, manualVatRates = null } = {}) {
  const requested = normalizeVatProfile(vatProfile);
  if (requested === 'manual') {
    const panelManual = Number(manualVatRates?.panelVatRate);
    const nonPanelManual = Number(manualVatRates?.nonPanelVatRate);
    if (Number.isFinite(panelManual) && Number.isFinite(nonPanelManual)) {
      return {
        profile: 'manual',
        requestedProfile: requested,
        fallbackApplied: false,
        panelVatRate: Math.max(0, Math.min(1, panelManual)),
        nonPanelVatRate: Math.max(0, Math.min(1, nonPanelManual)),
        metadata: COST_ASSUMPTIONS.vatProfiles.manual
      };
    }
    const standard = COST_ASSUMPTIONS.vatProfiles.standard;
    return {
      profile: 'standard',
      requestedProfile: requested,
      fallbackApplied: true,
      panelVatRate: standard.panelVatRate,
      nonPanelVatRate: standard.nonPanelVatRate,
      metadata: standard
    };
  }
  const profile = COST_ASSUMPTIONS.vatProfiles[requested] || COST_ASSUMPTIONS.vatProfiles.standard;
  return {
    profile: requested,
    requestedProfile: requested,
    fallbackApplied: false,
    panelVatRate: profile.panelVatRate,
    nonPanelVatRate: profile.nonPanelVatRate,
    metadata: profile
  };
}

export function resolveFinancialAssumptions(state = {}) {
  const requestedProfile = state.financialProfile === 'custom' ? 'custom' : normalizeFinancialProfile(state.financialProfile);
  const baseProfile = FINANCIAL_ASSUMPTIONS.financialProfiles[requestedProfile] || FINANCIAL_ASSUMPTIONS.financialProfiles.base;
  const customCurve = Array.isArray(state.customTariffIncreaseCurve) && state.customTariffIncreaseCurve.length
    ? state.customTariffIncreaseCurve
    : null;
  const legacyFlatRate = state.annualPriceIncrease !== undefined && state.annualPriceIncrease !== null && state.annualPriceIncrease !== ''
    ? clampRate(state.annualPriceIncrease, null)
    : null;
  const curve = requestedProfile === 'custom' && customCurve
    ? customCurve
    : requestedProfile === 'custom' && legacyFlatRate !== null
      ? [{ fromYear: 1, toYear: 25, rate: legacyFlatRate }]
      : baseProfile.tariffIncreaseCurve;
  const discountRate = requestedProfile === 'custom' && state.customDiscountRate !== undefined && state.customDiscountRate !== null && state.customDiscountRate !== ''
    ? Math.max(0, Number(state.customDiscountRate) || 0)
    : state.discountRate !== undefined && state.discountRate !== null && state.discountRate !== '' && requestedProfile === 'custom'
      ? Math.max(0, Number(state.discountRate) || 0)
      : baseProfile.discountRate;
  return {
    profile: requestedProfile,
    discountRate,
    tariffIncreaseCurve: curve.map(seg => ({
      fromYear: Math.max(1, Math.round(Number(seg.fromYear) || 1)),
      toYear: Math.max(1, Math.round(Number(seg.toYear) || 25)),
      rate: clampRate(seg.rate, 0)
    })),
    modelLabel: FINANCIAL_ASSUMPTIONS.modelLabel,
    version: FINANCIAL_ASSUMPTIONS.version,
    metadata: baseProfile
  };
}

export function tariffIncreaseRateForYear(curve, year) {
  const y = Math.max(1, Math.round(Number(year) || 1));
  const segments = Array.isArray(curve) ? curve : [];
  const found = segments.find(seg => y >= Number(seg.fromYear) && y <= Number(seg.toYear));
  return clampRate(found?.rate, 0);
}
