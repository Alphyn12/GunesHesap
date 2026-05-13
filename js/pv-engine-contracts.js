import { INVERTER_TYPES } from './data.js';
import { calculateSystemLayout, resolvePanelSpec } from './calc-core.js';
import {
  COST_ASSUMPTIONS,
  FINANCIAL_ASSUMPTIONS,
  DEFAULT_COST_PROFILE,
  DEFAULT_FINANCIAL_PROFILE,
  DEFAULT_PANEL_FORM_FACTOR,
  DEFAULT_VAT_PROFILE,
  resolveFinancialAssumptions
} from './assumptions/index.js';

export const PV_ENGINE_CONTRACT_VERSION = 'GH-PV-ENGINE-CONTRACT-2026.04-v1';

function finite(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableFinite(value) {
  return finite(value, null);
}

function currentTargetPowerKwp(state = {}) {
  const explicit = nullableFinite(state.targetSystemPowerKwp ?? state.systemPowerKwp);
  return explicit !== null && explicit > 0 ? explicit : null;
}

function _resolveMountingType(roofType) {
  if (!roofType) return 'rooftop';
  if (roofType === 'ground-mount' || roofType === 'carport') return 'ground-mount';
  if (roofType === 'bipv' || roofType === 'building-integrated') return 'bipv';
  return 'rooftop';  // flat-concrete, metal-trapez, kiremit ve diğer çatı tipleri
}

function buildLayoutSnapshot(state = {}) {
  if (!state || !Number.isFinite(Number(state.roofArea)) || Number(state.roofArea) <= 0) return null;
  try {
    const layout = calculateSystemLayout(state, state.panelType || 'mono_perc');
    const sections = (layout.sections || []).map(sec => ({
      areaM2: finite(sec.area, 0),
      tiltDeg: finite(sec.tilt, 0),
      azimuthDeg: finite(sec.azimuth, 180),
      azimuthName: sec.azimuthName || null,
      shadingPct: finite(sec.shadingFactor, 0),
      panelCount: finite(sec.panelCount, 0),
      systemPowerKwp: finite(sec.systemPower, 0)
    }));
    return {
      authoritativeSizing: true,
      panelCount: layout.panelCount,
      chosenSystemPowerKwp: Number((layout.systemPower || 0).toFixed(6)),
      targetSystemPowerKwp: layout.targetSystemPowerKwp,
      usableRoofRatio: finite(state.usableRoofRatio, 0.75),
      usableAreaM2: Number((layout.usableArea || 0).toFixed(3)),
      designTargetMode: state.designTarget || 'fill-roof',
      designTargetApplied: layout.designTargetApplied,
      limitedBy: layout.designTargetApplied === 'bill-offset' ? 'bill-target' : 'roof-area',
      multiRoof: !!state.multiRoof,
      sections,
      shadow: {
        userShadingPct: finite(state.shadingFactor, 0),
        osmShadowEnabled: !!state.osmShadowEnabled,
        osmShadowFactorPct: finite(state.osmShadow?.shadowFactorPct, 0),
        shadingQuality: state.shadingQuality || 'user-estimate'
      }
    };
  } catch {
    return null;
  }
}

export function hasValidSiteCoordinates(site = {}) {
  if (site.lat === null || site.lat === undefined || site.lon === null || site.lon === undefined) return false;
  const lat = Number(site.lat);
  const lon = Number(site.lon);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

export function getPvEngineRequestIssues(request = {}) {
  const issues = [];
  if (!hasValidSiteCoordinates(request.site || {})) {
    issues.push('missing-or-invalid-site-coordinates');
  }
  return issues;
}

function normalizeHourlyProfile(values) {
  if (!Array.isArray(values) || values.length !== 8760) return null;
  return values.map(value => Math.max(0, finite(value, 0)));
}

export function buildPvEngineRequest(state = {}) {
  const panel = resolvePanelSpec(state, state.panelType || 'mono_perc');
  const inverter = INVERTER_TYPES[state.inverterType || 'string'] || INVERTER_TYPES.string;
  const financialAssumptions = resolveFinancialAssumptions({
    ...state,
    financialProfile: state.financialProfile || (state.annualPriceIncrease !== undefined || state.discountRate !== undefined ? 'custom' : DEFAULT_FINANCIAL_PROFILE)
  });
  const cableLossPct = state.cableLossEnabled
    ? Math.max(0, finite(state.cableLoss?.totalLossPct ?? state.cableLossPct ?? state.cableLoss, 0))
    : 0;
  const layoutSnapshot = buildLayoutSnapshot(state);
  const offgridGeneratorEnabled = !!state.offgridGeneratorEnabled;
  const fieldRevalidationRequired = [
    'offgridAnnualRevalidation',
    'offgridBatteryHealthReport',
    ...(offgridGeneratorEnabled ? ['offgridGeneratorServiceRecord'] : []),
    'offgridFirmwareSettingsBackup',
    'offgridCustomerSignoff'
  ];
  const fieldRevalidationSkipped = offgridGeneratorEnabled ? [] : ['offgridGeneratorServiceRecord'];
  return {
    schema: PV_ENGINE_CONTRACT_VERSION,
    requestedEngine: state.enginePreference || 'auto',
    scenario: {
      key: state.scenarioKey || 'on-grid',
      label: state.scenarioContext?.label || 'On-Grid',
      proposalTone: state.scenarioContext?.proposalTone || 'commercial-grid'
    },
    site: {
      lat: nullableFinite(state.lat),
      lon: nullableFinite(state.lon),
      cityName: state.cityName || null,
      ghi: nullableFinite(state.ghi),
      timezone: 'Europe/Istanbul'
    },
    roof: {
      areaM2: finite(state.roofArea, 0),
      tiltDeg: finite(state.tilt, 33),
      azimuthDeg: finite(state.azimuth, 180),
      azimuthName: state.azimuthName || 'Güney',
      shadingPct: finite(state.shadingFactor, 0),
      soilingPct: finite(state.soilingFactor, 0),
      geometry: state.roofGeometry || null,
      sections: Array.isArray(state.roofSections) ? state.roofSections : [],
      mountingType: _resolveMountingType(state.roofType)
    },
    system: {
      panelType: state.panelType || 'mono_perc',
      panelWattPeak: finite(panel.wattPeak, 0),
      panelAreaM2: finite(panel.areaM2, 0),
      panelTempCoeffPerC: finite(panel.tempCoeff, -0.0037),
      panelDegradationRate: finite(panel.degradation, 0.0045),
      panelFirstYearDegradationRate: finite(panel.firstYearDeg, 0.02),
      bifacialGain: finite(panel.bifacialGain, 0),
      inverterType: state.inverterType || 'string',
      inverterEfficiency: finite(inverter.efficiency, 0.97),
      cableLossPct,
      wiringMismatchPct: cableLossPct,
      targetPowerKwp: currentTargetPowerKwp(state),
      layoutSnapshot,
      authoritativePanelCount: layoutSnapshot?.panelCount ?? null,
      chosenSystemPowerKwp: layoutSnapshot?.chosenSystemPowerKwp ?? null,
      batteryEnabled: !!state.batteryEnabled,
      battery: state.battery || null,
      batteryMaxChargeKw: state.scenarioKey === 'off-grid' ? nullableFinite(state.offgridBatteryMaxChargeKw) : null,
      batteryMaxDischargeKw: state.scenarioKey === 'off-grid' ? nullableFinite(state.offgridBatteryMaxDischargeKw) : null,
      offgridInverterAcKw: state.scenarioKey === 'off-grid' ? nullableFinite(state.offgridInverterAcKw) : null,
      offgridInverterSurgeMultiplier: state.scenarioKey === 'off-grid' ? finite(state.offgridInverterSurgeMultiplier, 1.25) : null,
      netMeteringEnabled: state.scenarioKey === 'off-grid' ? false : !!state.netMeteringEnabled,
      evEnabled: !!state.evEnabled,
      ev: state.ev || null,
      heatPumpEnabled: !!state.heatPumpEnabled,
      heatPump: state.heatPump || null
    },
    assumptions: {
      costProfile: state.costProfile || DEFAULT_COST_PROFILE,
      panelFormFactor: state.panelFormFactor || DEFAULT_PANEL_FORM_FACTOR,
      vatProfile: state.vatProfile || DEFAULT_VAT_PROFILE,
      manualCostMode: state.manualCostMode || 'none',
      manualCostOverrides: state.manualCostOverrides || null,
      manualVatRates: state.manualVatRates || null,
      financialProfile: financialAssumptions.profile,
      costAssumptionVersion: COST_ASSUMPTIONS.version,
      financialAssumptionVersion: FINANCIAL_ASSUMPTIONS.version
    },
    parity: {
      contractPurpose: 'frontend-backend-production-parity',
      authoritativeSourceRule: 'one-production-source-per-run',
      browserModel: 'PVGIS/JS hybrid or local PSH fallback',
      backendModel: 'pvlib-backed when available, deterministic fallback otherwise',
      notes: [
        'Panel, inverter and scenario fields are passed explicitly to avoid hidden default drift.',
        'pvlib-backed production may intentionally differ from browser PVGIS/JS because it uses hourly solar position, transposition and temperature modeling.'
      ]
    },
    load: {
      dailyConsumptionKwh: finite(state.dailyConsumption, 0),
      monthlyConsumptionKwh: Array.isArray(state.monthlyConsumption) ? state.monthlyConsumption.map(v => Math.max(0, finite(v, 0))).slice(0, 12) : null,
      hourlyConsumption8760: normalizeHourlyProfile(state.hourlyConsumption8760),
      hourlyProduction8760: state.scenarioKey === 'off-grid'
        ? (normalizeHourlyProfile(state.offgridPvHourly8760) || normalizeHourlyProfile(state.hourlyProduction8760))
        : null,
      offgridCriticalLoad8760: state.scenarioKey === 'off-grid'
        ? (normalizeHourlyProfile(state.offgridCriticalLoad8760) || normalizeHourlyProfile(state.criticalLoad8760))
        : null,
      offgridDevices: state.scenarioKey === 'off-grid' && Array.isArray(state.offgridDevices) ? state.offgridDevices : [],
      offgridCriticalFraction: state.scenarioKey === 'off-grid' ? finite(state.offgridCriticalFraction, 0.3) : null
    },
    offgrid: state.scenarioKey === 'off-grid' ? {
      calculationMode: state.offgridCalculationMode || 'basic',
      generatorEnabled: offgridGeneratorEnabled,
      generatorKw: finite(state.offgridGeneratorKw, 0),
      generatorFuelCostPerKwh: finite(state.offgridGeneratorFuelCostPerKwh, 0),
      generatorCapexTry: finite(state.offgridGeneratorCapexTry, 0),
      generatorStrategy: state.offgridGeneratorStrategy || 'critical-backup',
      generatorFuelType: state.offgridGeneratorFuelType || 'diesel',
      generatorSizePreset: state.offgridGeneratorSizePreset || 'auto',
      generatorReservePct: finite(state.offgridGeneratorReservePct, 20),
      generatorStartSocPct: finite(state.offgridGeneratorStartSocPct, 25),
      generatorMaxHoursPerDay: finite(state.offgridGeneratorMaxHoursPerDay, 8),
      generatorMaintenanceCostTry: finite(state.offgridGeneratorMaintenanceCostTry, 0),
      badWeatherLevel: state.offgridBadWeatherLevel || '',
      fieldGuaranteeMode: !!state.offgridFieldGuaranteeMode,
      productionSourcePriority: ['offgridPvHourly8760', 'hourlyProduction8760', 'monthlyProductionDerivedSynthetic8760'],
      loadSourcePriority: ['hourlyConsumption8760', 'offgridDevices', 'dailyConsumptionSyntheticProfile'],
      fieldEvidenceRequired: ['offgridPvProduction', 'offgridLoadProfile', 'offgridCriticalLoadProfile', 'offgridSiteShading', 'offgridEquipmentDatasheets'],
      fieldModelStressRequired: ['low-pv-year', 'load-growth', 'battery-eol', 'combined-design-stress'],
      fieldAcceptanceRequired: ['offgridCommissioningReport', 'offgridAcceptanceTest', 'offgridMonitoringCalibration', 'offgridAsBuiltDocs', 'offgridWarrantyOandM'],
      fieldOperationRequired: ['offgridTelemetry30Day', 'offgridPerformanceBaseline', 'offgridMaintenanceLog', 'offgridIncidentLog', 'offgridRemoteMonitoringSla'],
      fieldRevalidationRequired,
      fieldRevalidationSkipped,
      dispatchLevel: 'L2',
      fieldGuaranteeGate: 'OFFGRID-FIELD-GATE-2026.04-v6'
    } : null,
    tariff: {
      tariffType: state.tariffType || 'residential',
      tariffRegime: state.tariffRegime || 'auto',
      importRateTryKwh: finite(state.tariff, 0),
      exportRateTryKwh: state.scenarioKey === 'off-grid' ? 0 : finite(state.exportTariff, 0),
      tariffInputMode: state.tariffInputMode || 'net-plus-fee',
      distributionFeeTryKwh: (state.scenarioKey === 'on-grid' && state.tariffInputMode !== 'gross')
        ? Math.max(0, finite(state.distributionFee, 0))
        : 0,
      offGridCostPerKwhTry: state.scenarioKey === 'off-grid' ? nullableFinite(state.offGridCostPerKwh) : null,
      contractedPowerKw: finite(state.contractedPowerKw, 0),
      annualPriceIncrease: finite(financialAssumptions.tariffIncreaseCurve?.[0]?.rate, 0),
      tariffIncreaseCurve: financialAssumptions.tariffIncreaseCurve,
      financialProfile: financialAssumptions.profile,
      financialModelLabel: financialAssumptions.modelLabel,
      financialAssumptionVersion: FINANCIAL_ASSUMPTIONS.version,
      discountRate: finite(financialAssumptions.discountRate, 0),
      sourceDate: state.tariffSourceDate || null,
      sourceCheckedAt: state.tariffSourceCheckedAt || null
    },
    governance: {
      evidence: state.evidence || {},
      proposalApproval: state.proposalApproval || null,
      quoteInputsVerified: !!state.quoteInputsVerified,
      hasSignedCustomerBillData: !!state.hasSignedCustomerBillData,
      fieldImports: state.offgridFieldImports || null
    }
  };
}

export function buildEngineSourceMeta({ engine = 'js-local', usedFallback = false, provider = null } = {}) {
  const isPythonBackend = ['python-backend', 'pvlib-service'].includes(engine);
  const source = isPythonBackend
    ? 'Python backend pvlib-ready'
    : usedFallback
      ? 'local simplified'
      : 'PVGIS-based';
  return {
    engine,
    provider: provider || (isPythonBackend ? 'python-pvlib-ready' : usedFallback ? 'local-psh-fallback' : 'pvgis-hybrid-js'),
    source,
    confidence: isPythonBackend ? 'medium' : usedFallback ? 'low' : 'medium',
    engineQuality: isPythonBackend ? 'adapter-ready' : usedFallback ? 'fallback-estimate' : 'pvgis-hybrid',
    pvlibReady: true,
    pvlibBacked: false,
    fallbackUsed: !!usedFallback,
    notes: [
      'Panel wattage, panel area, inverter efficiency and bifacial gain are passed explicitly in the engine request.',
      'Browser PVGIS/JS and backend pvlib are different production models; any remaining divergence should be explained by engine metadata, not hidden defaults.',
      'Downstream financial, report, audit and export layers must use one authoritative production source for the completed run.'
    ]
  };
}

export function normalizePvEngineResponse(response = {}) {
  return {
    schema: response.schema || PV_ENGINE_CONTRACT_VERSION,
    engineSource: response.engineSource || buildEngineSourceMeta({ usedFallback: !!response.usedFallback }),
    production: response.production || null,
    losses: response.losses || null,
    financial: response.financial || null,
    proposal: response.proposal || null,
    offgridL2Results: response.offgridL2Results || null,
    raw: response.raw || null,
    engineUsed: response.raw?.engineUsed || response.production?.engine_used || response.engineSource?.source || null,
    engineQuality: response.raw?.engineQuality || response.production?.engine_quality || response.engineSource?.engineQuality || null,
    fallbackUsed: !!(response.raw?.fallbackUsed || response.engineSource?.fallbackUsed),
    parityNotes: response.raw?.parityNotes || response.losses?.parityNotes || response.engineSource?.notes || []
  };
}

export function isAuthoritativeBackendResponse(response = {}) {
  return !!(
    response?.engineSource?.pvlibBacked &&
    !response?.fallbackUsed &&
    !response?.engineSource?.fallbackUsed &&
    response?.production?.annualEnergyKwh > 0
  );
}
