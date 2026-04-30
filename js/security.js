import { normalizePanelTypeKey } from './data.js';

// Shared defensive helpers for rendering and imported state.

const NUMBER_LIMITS = {
  lat: [-90, 90],
  lon: [-180, 180],
  ghi: [500, 2500],
  roofArea: [0, 200000],
  tilt: [0, 90],
  azimuth: [0, 359],
  azimuthCoeff: [0.3, 1.1],
  shadingFactor: [0, 80],
  soilingFactor: [0, 50],
  tariff: [0, 1000],
  importTariffBase: [0, 1000],
  distributionFee: [0, 1000],
  exportTariff: [0, 1000],
  skttTariff: [0, 1000],
  contractedTariff: [0, 1000],
  contractedPowerKw: [0, 100000],
  onGridMonthlyConsumptionKwh: [0, 100000000],
  onGridMonthlyBillEstimate: [0, 100000000],
  previousYearConsumptionKwh: [0, 100000000],
  currentYearConsumptionKwh: [0, 100000000],
  sellableExportCapKwh: [0, 100000000],
  annualPriceIncrease: [-0.5, 2],
  discountRate: [0, 2],
  expenseEscalationRate: [-0.5, 2],
  dailyConsumption: [0, 100000],
  offgridCriticalFraction: [0.1, 1],
  offgridGeneratorKw: [0, 500],
  offgridGeneratorFuelCostPerKwh: [0, 1000],
  offgridGeneratorCapexTry: [0, 100000000],
  offgridGeneratorReservePct: [0, 200],
  offgridGeneratorStartSocPct: [0, 90],
  offgridGeneratorMaxHoursPerDay: [0, 24],
  offgridGeneratorMaintenanceCostTry: [0, 100000000],
  offgridBatteryMaxChargeKw: [0, 100000],
  offgridBatteryMaxDischargeKw: [0, 100000],
  offgridInverterAcKw: [0, 100000],
  offgridInverterSurgeMultiplier: [1, 3],
  usdToTry: [0.0001, 10000],
  omRate: [0, 20],
  insuranceRate: [0, 20],
  targetSystemPowerKwp: [0, 100000],
  systemPowerKwp: [0, 100000],
  previewSystemPower: [0, 100000],
  step: [1, 7]
};

const STRING_LIMITS = {
  cityName: 80,
  azimuthName: 40,
  panelType: 40,
  panelSelectionMode: 20,
  panelCatalogId: 80,
  panelCatalogTechFilter: 40,
  panelCatalogSegmentFilter: 40,
  tariffType: 40,
  tariffMode: 40,
  tariffRegime: 40,
  tariffInputMode: 40,
  tariffSourceType: 40,
  exportSettlementMode: 20,
  designTarget: 20,
  settlementDate: 20,
  displayCurrency: 3,
  inverterType: 40,
  tariffSourceDate: 20,
  tariffSourceCheckedAt: 40,
  scenarioKey: 40,
  scenarioSelectedAt: 40,
  enginePreference: 40,
  offgridCalculationMode: 20,
  offgridLoadProfileKey: 40,
  offgridAutonomyGoal: 40,
  offgridBadWeatherLevel: 20,
  offgridGeneratorStrategy: 40,
  offgridGeneratorFuelType: 20,
  offgridGeneratorSizePreset: 20,
  offgridPvHourlySource: 120,
  hourlyProductionSource: 120
};

const BOOLEAN_KEYS = new Set([
  'batteryEnabled', 'netMeteringEnabled', 'omEnabled',
  'billAnalysisEnabled', 'evEnabled', 'heatPumpEnabled', 'taxEnabled',
  'osmShadowEnabled', 'hasBilateralContract',
  'hasSignedCustomerBillData', 'quoteInputsVerified', 'quoteReadyApproved',
  'multiRoof', 'tariffIncludesTax', 'satelliteEnhancementEnabled',
  'offgridFieldGuaranteeMode', 'offgridGeneratorEnabled'
]);

const OBJECT_KEYS = new Set([
  'battery', 'ev', 'heatPump', 'tax',
  'roofGeometry', 'osmShadow', 'financing',
  'maintenanceContract', 'gridApplicationChecklist', 'proposalApproval', 'evidence',
  'userIdentity', 'scenarioContext', 'engineContext', 'exchangeRate',
  'satelliteEnhancement', 'offgridFieldImports'
]);

const ARRAY_KEYS = new Set([
  'roofSections', 'monthlyConsumption', 'hourlyConsumption8760', 'hourlyProduction8760',
  'offgridDevices', 'offgridPvHourly8760', 'offgridCriticalLoad8760', 'criticalLoad8760',
  'glareTargets', 'proposalRevisions',
  'auditLog'
]);

const ENUM_VALUES = {
  panelType: new Set(['mono', 'poly', 'bifacial', 'mono_perc', 'n_type_topcon', 'bifacial_topcon', 'hjt']),
  panelSelectionMode: new Set(['basic', 'advanced']),
  tariffType: new Set(['residential', 'commercial', 'industrial', 'agriculture', 'custom']),
  tariffMode: new Set(['auto', 'custom', 'pst', 'sktt', 'contract']),
  tariffRegime: new Set(['auto', 'pst', 'sktt', 'contract']),
  tariffInputMode: new Set(['net-plus-fee', 'gross']),
  tariffSourceType: new Set(['official', 'manual', 'estimate']),
  exportSettlementMode: new Set(['auto', 'hourly', 'monthly']),
  designTarget: new Set(['bill-offset', 'fill-roof']),
  scenarioKey: new Set(['on-grid', 'off-grid', 'agricultural-irrigation', 'heat-pump', 'flexible-mobile', 'ev-charging']),
  enginePreference: new Set(['auto', 'js-local', 'pvgis-hybrid-js', 'python-backend', 'pvlib-service']),
  offgridCalculationMode: new Set(['basic', 'advanced']),
  offgridLoadProfileKey: new Set(['studio', 'small-home', 'family-home', 'comfort-home', 'rural-pump']),
  offgridAutonomyGoal: new Set(['cost-focus', 'reliability', 'critical-safety']),
  offgridBadWeatherLevel: new Set(['', 'light', 'moderate', 'severe']),
  offgridGeneratorStrategy: new Set(['critical-backup', 'bad-weather', 'full-backup', 'manual']),
  offgridGeneratorFuelType: new Set(['diesel', 'gasoline', 'lpg', 'hybrid']),
  offgridGeneratorSizePreset: new Set(['auto', 'small', 'large', 'custom']),
  displayCurrency: new Set(['TRY', 'USD']),
  inverterType: new Set(['string', 'micro', 'optimizer'])
};

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  ...Object.keys(NUMBER_LIMITS),
  ...Object.keys(STRING_LIMITS),
  ...BOOLEAN_KEYS,
  ...OBJECT_KEYS,
  ...ARRAY_KEYS
]);

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function clampNumber(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanString(value, maxLen) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLen);
}

function cleanPlainObject(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) return null;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const safeKey = cleanString(key, 80);
    if (!safeKey) continue;
    if (typeof raw === 'number' || typeof raw === 'boolean') out[safeKey] = raw;
    else if (typeof raw === 'string') out[safeKey] = cleanString(raw, 200);
    else if (Array.isArray(raw)) out[safeKey] = raw.slice(0, 100).map(item => cleanPlainValue(item, depth + 1)).filter(v => v !== undefined);
    else if (raw && typeof raw === 'object') out[safeKey] = cleanPlainObject(raw, depth + 1);
  }
  return out;
}

function cleanPlainValue(value, depth = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return cleanString(value, 200);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => cleanPlainValue(item, depth + 1)).filter(v => v !== undefined);
  if (value && typeof value === 'object') return cleanPlainObject(value, depth);
  return undefined;
}

function sanitizeArray(key, value) {
  if (!Array.isArray(value)) return undefined;
  if (key === 'monthlyConsumption') return value.slice(0, 12).map(v => clampNumber(v, 0, 1000000, 0));
  if (key === 'hourlyConsumption8760' || key === 'hourlyProduction8760'
    || key === 'offgridPvHourly8760' || key === 'offgridCriticalLoad8760'
    || key === 'criticalLoad8760') {
    if (value.length !== 8760) return undefined;
    return value.map(v => clampNumber(v, 0, 1000000, 0));
  }
  if (key === 'roofSections') {
    return value.slice(0, 24).map(sec => ({
      id: cleanString(sec?.id ?? `sec-${Date.now()}`, 40),
      area: clampNumber(sec?.area, 0, 200000, 0),
      tilt: clampNumber(sec?.tilt, 0, 90, 20),
      azimuth: clampNumber(sec?.azimuth, 0, 359, 180),
      azimuthCoeff: clampNumber(sec?.azimuthCoeff, 0.3, 1.1, 1),
      azimuthName: cleanString(sec?.azimuthName ?? '', 40),
      shadingFactor: clampNumber(sec?.shadingFactor, 0, 80, 0)
    })).filter(sec => sec.area > 0);
  }
  return value.slice(0, 200).map(item => cleanPlainValue(item)).filter(v => v !== undefined);
}

export function sanitizeSharedState(input) {
  return sanitizeState(input, { trustedLocal: false });
}

export function sanitizeLocalState(input) {
  return sanitizeState(input, { trustedLocal: true });
}

function sanitizeState(input, { trustedLocal = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) continue;
    if (NUMBER_LIMITS[key]) {
      const [min, max] = NUMBER_LIMITS[key];
      out[key] = clampNumber(value, min, max, min);
    } else if (STRING_LIMITS[key]) {
      const clean = cleanString(value, STRING_LIMITS[key]);
      if (ENUM_VALUES[key] && !ENUM_VALUES[key].has(clean)) continue;
      out[key] = key === 'panelType' ? normalizePanelTypeKey(clean) : clean;
    } else if (BOOLEAN_KEYS.has(key)) {
      out[key] = !!value;
    } else if (OBJECT_KEYS.has(key)) {
      out[key] = cleanPlainObject(value);
    } else if (ARRAY_KEYS.has(key)) {
      const sanitized = sanitizeArray(key, value);
      if (sanitized !== undefined) out[key] = sanitized;
    }
  }
  return out;
}

export function createShareStateSnapshot(state) {
  const snapshot = {};
  for (const key of ALLOWED_TOP_LEVEL_KEYS) {
    if (key in state) snapshot[key] = state[key];
  }
  return sanitizeSharedState(snapshot);
}
