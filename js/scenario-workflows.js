import { APRIL_2026_TARIFF_PROFILES, DEFAULT_TARIFFS } from './data.js';

export const DEFAULT_SCENARIO_KEY = 'on-grid';

export const SCENARIO_DEFINITIONS = {
  'on-grid': {
    key: 'on-grid',
    i18nKey: 'scenarios.onGrid',
    label: 'On-Grid',
    shortLabel: 'On-grid',
    description: 'Bill savings, self-consumption, export revenue, ROI, and proposal readiness.',
    decisionHint: 'Use this when the site has grid access and the primary goal is bill reduction.',
    workflowLabel: 'Grid-connected proposal workflow',
    resultFrame: 'Grid-connected savings and proposal readiness',
    nextAction: 'Validate the site, bill evidence, tariff source, and supplier quote before quote-ready approval.',
    confidenceHint: 'Best for commercial proposals when PVGIS, bill evidence, and source checks are verified.',
    resultCaution: 'Proposal language should remain conditional until site, tariff, bill, and supplier evidence are verified.',
    primaryCta: 'Continue with On-Grid',
    defaults: {
      netMeteringEnabled: true,
      batteryEnabled: false,
      tariffType: 'commercial',
      tariff: DEFAULT_TARIFFS.commercial,
      skttTariff: APRIL_2026_TARIFF_PROFILES.commercial.sktt,
      contractedTariff: DEFAULT_TARIFFS.commercial,
      dailyConsumption: 30,
      exportSettlementMode: 'auto',
      quoteInputsVerified: false
    },
    visibleBlocks: { netMetering: true, battery: true, heatPump: true, ev: true, tax: true, governance: true },
    proposalTone: 'commercial-grid'
  },
  'off-grid': {
    key: 'off-grid',
    i18nKey: 'scenarios.offGrid',
    label: 'Off-Grid',
    shortLabel: 'Off-grid',
    description: 'Critical loads, battery capacity, and synthetic dispatch coverage.',
    decisionHint: 'Use this when the load must run without grid access or grid reliability is not acceptable.',
    workflowLabel: 'Off-grid pre-feasibility and battery dispatch workflow',
    resultFrame: 'Off-grid pre-feasibility sizing',
    nextAction: 'Define critical loads and validate autonomy with field evidence before proposal approval.',
    confidenceHint: 'Surplus PV is not monetized; confidence depends on battery dispatch and critical-load evidence.',
    resultCaution: 'This is a pre-feasibility autonomy estimate, not a field guarantee or final off-grid design.',
    primaryCta: 'Continue with Off-Grid',
    defaults: {
      netMeteringEnabled: false,
      batteryEnabled: true,
      dailyConsumption: 12,
      offgridCalculationMode: 'basic',
      offgridLoadProfileKey: 'family-home',
      offgridCriticalFraction: 0.45,
      offgridAutonomyGoal: 'reliability',
      tariffType: 'residential',
      tariff: DEFAULT_TARIFFS.residential,
      battery: { model: 'huawei_luna15', capacity: 15.0, dod: 1.00, efficiency: 0.95, chemistry: 'LFP', warranty: 10, cycles: 5000 },
      exportSettlementMode: 'monthly'
    },
    visibleBlocks: { netMetering: false, battery: true, heatPump: true, ev: false, tax: false, governance: true },
    proposalTone: 'autonomy'
  },
  'agricultural-irrigation': {
    key: 'agricultural-irrigation',
    i18nKey: 'scenarios.agriculturalIrrigation',
    label: 'Agricultural Irrigation',
    shortLabel: 'Irrigation',
    description: 'Seasonal pump loads, daytime solar match, and rural operating cost reduction.',
    decisionHint: 'Use this for seasonal daytime pump loads and rural operating-cost reduction.',
    workflowLabel: 'Seasonal pump-load proposal workflow',
    resultFrame: 'Daytime irrigation load offset and seasonal yield',
    nextAction: 'Confirm pump power, watering season, and daytime load profile before quote-ready approval.',
    confidenceHint: 'Confidence depends on pump schedule and seasonal consumption evidence.',
    resultCaution: 'Seasonal pump schedule and field load evidence must be checked before proposal use.',
    primaryCta: 'Continue with Irrigation',
    defaults: {
      netMeteringEnabled: false,
      batteryEnabled: false,
      dailyConsumption: 45,
      tariffType: 'agriculture',
      tariff: DEFAULT_TARIFFS.agriculture,
      skttTariff: APRIL_2026_TARIFF_PROFILES.agriculture.sktt,
      contractedTariff: DEFAULT_TARIFFS.agriculture,
      tariffRegime: 'custom',
      exportSettlementMode: 'monthly'
    },
    visibleBlocks: { netMetering: false, battery: true, heatPump: false, ev: false, tax: true, governance: true },
    proposalTone: 'agri'
  },
  'heat-pump': {
    key: 'heat-pump',
    i18nKey: 'scenarios.heatPump',
    label: 'Heat Pump',
    shortLabel: 'Heat pump',
    description: 'Heating/cooling electrification, SPF assumptions, and solar offset.',
    decisionHint: 'Use this when the solar case depends on heating or cooling electrification.',
    workflowLabel: 'Electrification offset workflow',
    resultFrame: 'Solar-assisted heating and cooling offset',
    nextAction: 'Validate heated area, insulation class, and current heating fuel cost assumptions.',
    confidenceHint: 'Heat pump SPF and building envelope assumptions are the dominant risk.',
    resultCaution: 'Treat savings as conditional until SPF, insulation, and current fuel cost are verified.',
    primaryCta: 'Continue with Heat Pump',
    defaults: {
      heatPumpEnabled: true,
      heatPump: { area: 120, insulation: 'avg', heatingType: 'both', currentHeating: 'gas' },
      dailyConsumption: 18,
      netMeteringEnabled: true,
      batteryEnabled: false,
      tariffType: 'residential',
      tariff: DEFAULT_TARIFFS.residential
    },
    visibleBlocks: { netMetering: true, battery: true, heatPump: true, ev: false, tax: true, governance: true },
    proposalTone: 'electrification'
  },
  'flexible-mobile': {
    key: 'flexible-mobile',
    i18nKey: 'scenarios.flexibleMobile',
    label: 'Flexible Panel / Caravan / Boat',
    shortLabel: 'Mobile',
    description: 'Portable loads, compact off-grid use, and simplified client-facing guidance.',
    decisionHint: 'Use this for small portable systems where simple autonomy guidance is enough.',
    workflowLabel: 'Portable energy workflow',
    resultFrame: 'Portable solar and compact battery autonomy',
    nextAction: 'Confirm daily appliance loads and storage target; keep commercial proposal controls optional.',
    confidenceHint: 'Use as an early sizing estimate unless field load measurements are attached.',
    resultCaution: 'Use as early sizing guidance unless measured appliance loads are available.',
    primaryCta: 'Continue with Mobile Solar',
    defaults: {
      netMeteringEnabled: false,
      batteryEnabled: true,
      dailyConsumption: 4,
      roofArea: 12,
      tariffType: 'residential',
      tariff: DEFAULT_TARIFFS.residential,
      panelType: 'mono_perc',
      battery: { model: 'custom', name: 'Özel Batarya', capacity: 3.0, dod: 0.80, efficiency: 0.90, chemistry: 'LFP', warranty: 5, cycles: 3000, price_try: 0, brand: 'Özel' }
    },
    visibleBlocks: { netMetering: false, battery: true, heatPump: false, ev: false, tax: false, governance: false },
    proposalTone: 'portable'
  },
  'ev-charging': {
    key: 'ev-charging',
    i18nKey: 'scenarios.evCharging',
    label: 'EV Charging Station',
    shortLabel: 'EV charging',
    description: 'Charging demand, daytime solar synergy, and commercial electricity offset.',
    decisionHint: 'Use this when EV charging sessions drive the solar sizing and financial case.',
    workflowLabel: 'Charging infrastructure workflow',
    resultFrame: 'Solar-backed EV charging demand and ROI',
    nextAction: 'Confirm charge sessions, charger power, and daytime utilization before quote-ready approval.',
    confidenceHint: 'Charging profile evidence and commercial tariff validation drive quote confidence.',
    resultCaution: 'Treat ROI as conditional until charging sessions and tariff evidence are validated.',
    primaryCta: 'Continue with EV Charging',
    defaults: {
      evEnabled: true,
      ev: { type: 'custom', dailyKm: 120, consumptionPer100km: 18, chargeTime: 'day', chargerPowerKw: 22, fuelPricePerLiter: 45, fuelConsumptionL100km: 8 },
      dailyConsumption: 55,
      tariffType: 'commercial',
      tariff: DEFAULT_TARIFFS.commercial,
      skttTariff: APRIL_2026_TARIFF_PROFILES.commercial.sktt,
      contractedTariff: DEFAULT_TARIFFS.commercial,
      netMeteringEnabled: true,
      batteryEnabled: false
    },
    visibleBlocks: { netMetering: true, battery: true, heatPump: false, ev: true, tax: true, governance: true },
    proposalTone: 'charging'
  }
};

export function getScenarioDefinition(key = DEFAULT_SCENARIO_KEY) {
  return SCENARIO_DEFINITIONS[key] || SCENARIO_DEFINITIONS[DEFAULT_SCENARIO_KEY];
}

export function listScenarioDefinitions() {
  return Object.values(SCENARIO_DEFINITIONS);
}

export function localizeScenarioDefinition(scenarioOrKey = DEFAULT_SCENARIO_KEY, translate = key => key) {
  const scenario = typeof scenarioOrKey === 'string' ? getScenarioDefinition(scenarioOrKey) : scenarioOrKey;
  const baseKey = scenario.i18nKey || `scenarios.${scenario.key}`;
  const pick = (field, fallback) => {
    const key = `${baseKey}.${field}`;
    const value = translate(key);
    return value && value !== key ? value : fallback;
  };
  return {
    ...scenario,
    label: pick('label', scenario.label),
    shortLabel: pick('shortLabel', scenario.shortLabel),
    description: pick('description', scenario.description),
    decisionHint: pick('decisionHint', scenario.decisionHint || scenario.description),
    workflowLabel: pick('workflowLabel', scenario.workflowLabel),
    resultFrame: pick('resultFrame', scenario.resultFrame),
    nextAction: pick('nextAction', scenario.nextAction),
    confidenceHint: pick('confidenceHint', scenario.confidenceHint),
    resultCaution: pick('resultCaution', scenario.resultCaution || scenario.confidenceHint),
    primaryCta: pick('primaryCta', scenario.primaryCta || 'Continue')
  };
}

export function applyScenarioDefaults(state = {}, key = DEFAULT_SCENARIO_KEY) {
  const scenario = getScenarioDefinition(key);
  const defaults = scenario.defaults || {};
  const next = { ...state, scenarioKey: scenario.key, scenarioSelectedAt: new Date().toISOString() };
  Object.entries(defaults).forEach(([field, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[field] = { ...(next[field] || {}), ...value };
    } else {
      next[field] = value;
    }
  });
  next.scenarioContext = {
    key: scenario.key,
    label: scenario.label,
    workflowLabel: scenario.workflowLabel,
    resultFrame: scenario.resultFrame,
    nextAction: scenario.nextAction,
    confidenceHint: scenario.confidenceHint,
    decisionHint: scenario.decisionHint,
    resultCaution: scenario.resultCaution,
    primaryCta: scenario.primaryCta,
    proposalTone: scenario.proposalTone,
    visibleBlocks: scenario.visibleBlocks
  };
  return next;
}

export function scenarioSourceQualityNote(scenarioKey, calculationMode = 'fallback-psh') {
  const scenario = getScenarioDefinition(scenarioKey);
  const source = calculationMode === 'pvgis-live' || calculationMode === 'pvgis-hybrid'
    ? 'PVGIS-based'
    : calculationMode === 'pvlib-service' || calculationMode === 'python-backend' || calculationMode === 'python-backend-pvlib-ready'
      ? 'Python backend pvlib-ready'
      : 'local simplified';
  return `${scenario.shortLabel}: ${source} engine context. ${scenario.confidenceHint}`;
}
