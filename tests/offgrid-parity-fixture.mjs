import fs from 'node:fs';

import {
  buildOffgridAccuracyAssessment,
  buildOffgridFieldModelMaturityGate,
  buildOffgridLoadProfile,
  buildOffgridPvDispatchProfile,
  buildOffgridResults,
  evaluateOffgridFieldGuaranteeReadiness,
  runBadWeatherScenario,
  runOffgridDispatch,
  runOffgridStressScenarios
} from '../js/offgrid-dispatch.js';

const HOURS_PER_YEAR = 8760;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function isComplete8760(values) {
  return Array.isArray(values) && values.length >= HOURS_PER_YEAR;
}

function buildFallbackHourlyRowsFromMonthly(monthlyKwh = []) {
  const rows = [];
  for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
    const monthlyTotal = Math.max(0, finite(monthlyKwh[monthIdx], 0));
    const hourlyValue = monthlyTotal / (MONTH_DAYS[monthIdx] * 24);
    for (let day = 0; day < MONTH_DAYS[monthIdx]; day++) {
      for (let hour = 0; hour < 24; hour++) {
        rows.push({ production: hourlyValue });
      }
    }
  }
  return rows;
}

function summarizeStress(stress = null) {
  if (!stress) return null;
  return {
    worstCriticalScenarioKey: stress.worstCriticalScenario?.key || null,
    worstTotalScenarioKey: stress.worstTotalScenario?.key || null,
    maxUnmetCriticalScenarioKey: stress.maxUnmetCriticalScenario?.key || null,
    generatorCriticalPeakReservePct: stress.generatorCriticalPeakReservePct ?? null,
    scenarios: Array.isArray(stress.scenarios)
      ? stress.scenarios.map(row => ({
        key: row.key,
        totalLoadCoverage: row.totalLoadCoverage,
        criticalLoadCoverage: row.criticalLoadCoverage,
        unmetCriticalKwh: row.unmetCriticalKwh,
        generatorKwh: row.generatorKwh,
        inverterPowerLimitedKwh: row.inverterPowerLimitedKwh,
        batteryDischargeLimitedKwh: row.batteryDischargeLimitedKwh,
        peakCriticalKw: row.peakCriticalKw
      }))
      : []
  };
}

function summarizeBadWeather(badWeatherScenario = null) {
  if (!badWeatherScenario) return null;
  return {
    weatherLevel: badWeatherScenario.weatherLevel,
    pvScaleFactor: badWeatherScenario.pvScaleFactor,
    consecutiveDays: badWeatherScenario.consecutiveDays,
    worstWindowDayOfYear: badWeatherScenario.worstWindowDayOfYear,
    criticalCoverageDropPct: badWeatherScenario.criticalCoverageDropPct,
    totalCoverageDropPct: badWeatherScenario.totalCoverageDropPct,
    additionalGeneratorKwh: badWeatherScenario.additionalGeneratorKwh
  };
}

function summarizeResult(result) {
  return {
    dispatchVersion: result.dispatchVersion,
    loadMode: result.loadMode,
    loadSource: result.loadSource,
    criticalLoadBasis: result.criticalLoadBasis,
    calculationMode: result.calculationMode,
    productionSource: result.productionSource,
    productionDispatchProfile: result.productionDispatchProfile,
    productionDispatchMetadata: {
      hasRealHourlyProduction: !!result.productionDispatchMetadata?.hasRealHourlyProduction,
      syntheticWeatherModel: result.productionDispatchMetadata?.syntheticWeatherModel || null,
      syntheticWeatherMetadata: result.productionDispatchMetadata?.syntheticWeatherMetadata || null
    },
    annualTotalLoadKwh: result.annualTotalLoadKwh,
    annualCriticalLoadKwh: result.annualCriticalLoadKwh,
    directPvKwh: result.directPvKwh,
    batteryKwh: result.batteryKwh,
    generatorKwh: result.generatorKwh,
    curtailedPvKwh: result.curtailedPvKwh,
    unmetLoadKwh: result.unmetLoadKwh,
    unmetCriticalKwh: result.unmetCriticalKwh,
    totalLoadCoverage: result.totalLoadCoverage,
    criticalLoadCoverage: result.criticalLoadCoverage,
    pvBatteryLoadCoverage: result.pvBatteryLoadCoverage,
    pvBatteryCriticalCoverage: result.pvBatteryCriticalCoverage,
    autonomousDays: result.autonomousDays,
    autonomousDaysWithGenerator: result.autonomousDaysWithGenerator,
    cyclesPerYear: result.cyclesPerYear,
    minimumSoc: result.minimumSoc,
    averageSoc: result.averageSoc,
    batteryChargeLimitedKwh: result.batteryChargeLimitedKwh,
    batteryDischargeLimitedKwh: result.batteryDischargeLimitedKwh,
    inverterPowerLimitedKwh: result.inverterPowerLimitedKwh,
    generatorRunHoursPerYear: result.generatorRunHoursPerYear,
    generatorFuelCostAnnual: result.generatorFuelCostAnnual,
    generatorStartSocPct: result.generatorStartSocPct,
    generatorStopSocPct: result.generatorStopSocPct,
    syntheticPeakModel: result.syntheticPeakModel || null,
    designCorrections: result.designCorrections || null,
    accuracyScore: result.accuracyScore,
    accuracyTier: result.accuracyTier,
    expectedUncertaintyPct: result.expectedUncertaintyPct,
    fieldGuaranteeReadiness: {
      status: result.fieldGuaranteeReadiness?.status || null,
      phase1Ready: !!result.fieldGuaranteeReadiness?.phase1Ready
    },
    fieldModelMaturityGate: {
      status: result.fieldModelMaturityGate?.status || null,
      phase3Ready: !!result.fieldModelMaturityGate?.phase3Ready
    },
    fieldGuaranteeCandidate: !!result.fieldGuaranteeCandidate,
    fieldDataState: result.fieldDataState || null,
    dataLineage: {
      version: result.dataLineage?.version || null,
      economics: result.dataLineage?.economics || null,
      gates: result.dataLineage?.gates || null
    },
    badWeatherScenario: summarizeBadWeather(result.badWeatherScenario),
    fieldStressAnalysis: summarizeStress(result.fieldStressAnalysis)
  };
}

function buildParityResult(request, production) {
  const load = request.load || {};
  const system = request.system || {};
  const tariff = request.tariff || {};
  const offgrid = request.offgrid || {};
  const batteryContract = system.battery || {};

  const loadProfile = buildOffgridLoadProfile(load.offgridDevices || [], {
    hourlyLoad8760: load.hourlyConsumption8760 || null,
    criticalHourly8760: load.offgridCriticalLoad8760 || null,
    hourlyLoadSource: 'real-hourly-8760',
    fallbackDailyKwh: finite(load.dailyConsumptionKwh, 0),
    criticalFraction: finite(load.offgridCriticalFraction, 0.45),
    tariffType: tariff.tariffType || 'residential',
    fieldImportSummary: request.governance?.fieldImports || null
  });

  const explicitHourlyPv = isComplete8760(load.hourlyProduction8760) ? load.hourlyProduction8760 : null;
  const backendHourlyPv = isComplete8760(production?.hourlyEnergyKwh) ? production.hourlyEnergyKwh : null;
  const realHourlyPv8760 = explicitHourlyPv || backendHourlyPv;
  const pvProfile = buildOffgridPvDispatchProfile({
    realHourlyPv8760,
    source: explicitHourlyPv
      ? 'user-supplied-real-hourly-pv'
      : backendHourlyPv
        ? 'backend-hourly-production'
        : undefined,
    sourceLabel: explicitHourlyPv
      ? 'Real hourly PV 8760'
      : backendHourlyPv
        ? 'Backend hourly PV 8760'
        : undefined,
    cityName: request.site?.cityName,
    panelTempCoeffPerC: system.panelTempCoeffPerC,
    fallbackHourlyRows: realHourlyPv8760 ? null : buildFallbackHourlyRowsFromMonthly(production?.monthlyEnergyKwh || []),
    fallbackSource: 'monthly-production-derived-synthetic-8760',
    fallbackSourceLabel: 'Monthly-derived synthetic 8760',
    fallbackUsed: !realHourlyPv8760
  });

  const capacityKwh = Math.max(0, finite(batteryContract.capacity, 0));
  const dod = clamp(finite(batteryContract.dod, 0.9), 0, 1);
  const usableCapacityKwh = capacityKwh * dod;
  const reservePct = clamp(finite(batteryContract.socReservePct, 15), 0, 50);
  const maxChargePowerKw = usableCapacityKwh > 0
    ? Math.max(0.1, finite(system.batteryMaxChargeKw || batteryContract.maxChargePowerKw, usableCapacityKwh * 0.5))
    : 0;
  const maxDischargePowerKw = usableCapacityKwh > 0
    ? Math.max(0.1, finite(system.batteryMaxDischargeKw || batteryContract.maxDischargePowerKw, usableCapacityKwh * 0.5))
    : 0;

  const battery = {
    usableCapacityKwh,
    efficiency: clamp(finite(batteryContract.efficiency, 0.92), 0.5, 1),
    chargeEfficiency: finite(batteryContract.chargeEfficiency, 0) > 0
      ? clamp(finite(batteryContract.chargeEfficiency, 0.92), 0, 1)
      : undefined,
    dischargeEfficiency: finite(batteryContract.dischargeEfficiency, 0) > 0
      ? clamp(finite(batteryContract.dischargeEfficiency, 0.92), 0, 1)
      : undefined,
    chemistry: batteryContract.chemistry || null,
    dynamicEfficiencyModelEnabled: true,
    socReserveKwh: usableCapacityKwh * (reservePct / 100),
    initialSocKwh: usableCapacityKwh * (reservePct / 100),
    maxChargePowerKw,
    maxDischargePowerKw,
    eolCapacityPct: finite(batteryContract.eolCapacityPct, 80),
    eolEfficiencyLossPct: finite(batteryContract.eolEfficiencyLossPct, 3)
  };

  const generator = {
    enabled: !!(offgrid.generatorEnabled && finite(offgrid.generatorKw, 0) > 0),
    capacityKw: Math.max(0, finite(offgrid.generatorKw, 0)),
    fuelCostPerKwh: Math.max(0, finite(offgrid.generatorFuelCostPerKwh, 0)),
    chargeBatteryEnabled: offgrid.generatorChargeBatteryEnabled === true
  };

  const inverterAcLimitKw = Math.max(
    0.5,
    finite(system.offgridInverterAcKw, Math.max(finite(production?.systemPowerKwp, 0), maxDischargePowerKw, 1))
  );

  const dispatchOptions = {
    loadPeakKw8760: loadProfile.hourlyPeakKw8760,
    criticalPeakKw8760: loadProfile.criticalPeakKw8760,
    inverterAcLimitKw,
    inverterSurgeMultiplier: clamp(finite(system.offgridInverterSurgeMultiplier, 1.25), 1, 3),
    autonomyThresholdPct: clamp(finite(offgrid.autonomyThresholdPct, 1), 0, 25),
    generatorStartSocPct: clamp(finite(offgrid.generatorStartSocPct, 0), 0, 100),
    generatorStopSocPct: clamp(finite(offgrid.generatorStopSocPct, 0), 0, 100),
    generatorMaxHoursPerDay: finite(offgrid.generatorMaxHoursPerDay, 24),
    generatorMinLoadRatePct: clamp(finite(offgrid.generatorMinLoadRatePct, 30), 0, 100),
    generatorChargeBatteryEnabled: offgrid.generatorChargeBatteryEnabled === true,
    generatorStrategy: offgrid.generatorStrategy || 'critical-backup'
  };

  const warmup = runOffgridDispatch(
    pvProfile.pvHourly8760,
    loadProfile.totalHourly8760,
    loadProfile.criticalHourly8760,
    battery,
    generator,
    dispatchOptions
  );
  const batterySteady = {
    ...battery,
    initialSocKwh: clamp(
      finite(warmup.hourly8760?.[warmup.hourly8760.length - 1]?.soc, battery.socReserveKwh),
      battery.socReserveKwh,
      battery.usableCapacityKwh
    )
  };
  const normal = runOffgridDispatch(
    pvProfile.pvHourly8760,
    loadProfile.totalHourly8760,
    loadProfile.criticalHourly8760,
    batterySteady,
    generator,
    dispatchOptions
  );
  const withoutGenerator = generator.enabled
    ? runOffgridDispatch(
      pvProfile.pvHourly8760,
      loadProfile.totalHourly8760,
      loadProfile.criticalHourly8760,
      batterySteady,
      { ...generator, enabled: false },
      dispatchOptions
    )
    : null;
  const badWeatherScenario = runBadWeatherScenario(
    normal,
    pvProfile.pvHourly8760,
    loadProfile.totalHourly8760,
    loadProfile.criticalHourly8760,
    batterySteady,
    generator,
    offgrid.badWeatherLevel || '',
    dispatchOptions
  );
  const fieldStressAnalysis = runOffgridStressScenarios({
    pvHourly8760: pvProfile.pvHourly8760,
    loadHourly8760: loadProfile.totalHourly8760,
    criticalHourly8760: loadProfile.criticalHourly8760,
    battery: batterySteady,
    generator,
    dispatchOptions
  });
  const fieldGuaranteeReadiness = evaluateOffgridFieldGuaranteeReadiness({
    productionProfile: pvProfile,
    loadProfile,
    battery,
    generator,
    dispatchOptions
  });
  const fieldModelMaturityGate = buildOffgridFieldModelMaturityGate(fieldStressAnalysis, {
    phase1Ready: !!fieldGuaranteeReadiness.phase1Ready,
    phase2Ready: false,
    generator
  });

  const systemCapexTry = 0;
  const result = buildOffgridResults(
    normal,
    badWeatherScenario,
    loadProfile,
    generator,
    {
      alternativeEnergyCostPerKwh: Math.max(0, finite(tariff.offGridCostPerKwhTry, 0)),
      systemCapexTry,
      generatorCapexTry: Math.max(0, finite(offgrid.generatorCapexTry, 0)),
      generatorMaintenanceCostTry: Math.max(0, finite(offgrid.generatorMaintenanceCostTry, 0)),
      generatorStrategy: offgrid.generatorStrategy || 'critical-backup',
      generatorFuelType: offgrid.generatorFuelType || 'diesel',
      generatorSizePreset: offgrid.generatorSizePreset || 'auto',
      generatorReservePct: Math.max(0, finite(offgrid.generatorReservePct, 0)),
      generatorStartSocPct: Math.max(0, finite(offgrid.generatorStartSocPct, 0)),
      generatorStopSocPct: Math.max(0, finite(offgrid.generatorStopSocPct, 0)),
      generatorMaxHoursPerDay: Math.max(0, finite(offgrid.generatorMaxHoursPerDay, 24)),
      generatorMinLoadRatePct: Math.max(0, clamp(finite(offgrid.generatorMinLoadRatePct, 30), 0, 100)),
      generatorChargeBatteryEnabled: offgrid.generatorChargeBatteryEnabled === true,
      generatorOverhaulHours: Math.max(0, finite(offgrid.generatorOverhaulHours, 0)),
      generatorOverhaulCostTry: Math.max(0, finite(offgrid.generatorOverhaulCostTry, 0)),
      batteryCapexTry: 0,
      batteryLifetimeYears: Math.max(0, finite(batteryContract.warranty, 0)),
      batteryReplacementFractionPct: Math.max(0, finite(batteryContract.replacementFractionPct, 85)),
      weatherScenario: offgrid.badWeatherLevel || '',
      productionProfile: pvProfile,
      batteryConfig: battery,
      dispatchOptions,
      calculationMode: offgrid.calculationMode || 'basic',
      fieldImportSummary: request.governance?.fieldImports || null
    },
    withoutGenerator,
    pvProfile
  );

  const hasRealPvHourly = !!pvProfile.hasRealHourlyProduction;
  const hasRealLoadHourly = !!loadProfile.hasRealHourlyLoad;
  const hasRealCriticalLoadHourly = loadProfile.criticalLoadBasis === 'real-hourly-critical-load';
  let fieldDataState = 'synthetic';
  if (fieldGuaranteeReadiness.phase1Ready) fieldDataState = 'field-input-ready';
  else if (hasRealPvHourly || hasRealLoadHourly || hasRealCriticalLoadHourly) fieldDataState = 'hybrid-hourly';

  result.productionSource = pvProfile.productionSeriesSource;
  result.productionSourceLabel = pvProfile.productionSourceLabel;
  result.productionFallback = pvProfile.productionFallback;
  result.productionDispatchProfile = pvProfile.productionDispatchProfile;
  result.productionDispatchMetadata = {
    productionSeriesSource: pvProfile.productionSeriesSource,
    annualKwh: Math.round(pvProfile.annualKwh),
    hasRealHourlyProduction: pvProfile.hasRealHourlyProduction,
    dispatchBus: pvProfile.dispatchBus,
    resolution: pvProfile.resolution,
    missingHours: pvProfile.missingHours,
    synthetic: pvProfile.synthetic,
    syntheticWeatherModel: pvProfile.syntheticWeatherModel || null,
    syntheticWeatherMetadata: pvProfile.syntheticWeatherMetadata || null
  };
  result.loadSource = loadProfile.loadSource || loadProfile.mode;
  result.loadMode = loadProfile.mode;
  result.synthetic = !!(result.synthetic || pvProfile.synthetic);
  result.methodologyNote = pvProfile.hasRealHourlyProduction && loadProfile.hasRealHourlyLoad
    ? 'real-pv-and-real-load-hourly-dispatch-pre-feasibility'
    : result.methodologyNote;
  result.fieldGuaranteeReadiness = fieldGuaranteeReadiness;
  result.fieldStressAnalysis = fieldStressAnalysis;
  result.fieldModelMaturityGate = fieldModelMaturityGate;
  result.fieldGuaranteeCandidate = !!fieldGuaranteeReadiness.phase1Ready;
  result.fieldGuaranteeReady = false;
  result.fieldDataState = fieldDataState;
  result.dataLineage = {
    version: 'GH-OFFGRID-LINEAGE-2026.04-v1',
    fieldDataState,
    economics: {
      financialSavingsBasis: finite(tariff.offGridCostPerKwhTry, 0) > 0
        ? 'off-grid-user-alternative-energy-cost'
        : 'off-grid-grid-tariff-times-2_5-proxy',
      authoritativeFinancialBasis: 'backend-offgrid-l2-dispatch'
    },
    gates: {
      phase1Ready: !!fieldGuaranteeReadiness.phase1Ready,
      phase2Ready: false,
      phase3Ready: !!fieldModelMaturityGate.phase3Ready,
      phase4Ready: false,
      phase5Ready: false,
      phase6Ready: false
    }
  };
  result.accuracyAssessment = buildOffgridAccuracyAssessment({
    productionProfile: pvProfile,
    loadProfile,
    battery,
    generator,
    dispatchOptions,
    calculationMode: offgrid.calculationMode || 'basic',
    badWeatherEnabled: !!badWeatherScenario
  });
  result.accuracyScore = result.accuracyAssessment.accuracyScore;
  result.accuracyTier = result.accuracyAssessment.tier;
  result.expectedUncertaintyPct = result.accuracyAssessment.expectedUncertaintyPct;
  result.calculationMode = result.accuracyAssessment.calculationMode;

  return summarizeResult(result);
}

const raw = fs.readFileSync(0, 'utf8');
const { request, production } = JSON.parse(raw);
process.stdout.write(JSON.stringify(buildParityResult(request, production)));
