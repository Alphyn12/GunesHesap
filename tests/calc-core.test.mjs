import assert from 'node:assert/strict';
import {
  buildBaseHourlyLoad8760,
  buildTariffModel,
  calculateSystemLayout,
  computeFinancialTable,
  getLoadProfile,
  normalizeMonthlyProductionToAnnual,
  normalizeProfile,
  resolveProductionTemperatureAdjustment,
  resolveTaxTreatment,
  simulateBatteryOnHourlySummary,
  simulateHourlyEnergy
} from '../js/calc-core.js';
import { DEFAULT_TARIFFS, PANEL_TYPES } from '../js/data.js';

function nearly(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

const normalized = normalizeProfile([0, 2, 2]);
nearly(normalized.reduce((a, b) => a + b, 0), 1);
nearly(normalized[1], 0.5);
nearly(DEFAULT_TARIFFS.residential * 230, 744.7, 0.01);

const daytimeProfile = getLoadProfile('daytime-heavy');
const eveningProfile = getLoadProfile('evening-heavy');
const businessProfile = getLoadProfile('business-hours');
nearly(daytimeProfile.reduce((sum, value) => sum + value, 0), 1);
assert.ok(daytimeProfile.slice(9, 16).reduce((sum, value) => sum + value, 0)
  > eveningProfile.slice(9, 16).reduce((sum, value) => sum + value, 0));
assert.ok(eveningProfile.slice(17, 23).reduce((sum, value) => sum + value, 0)
  > daytimeProfile.slice(17, 23).reduce((sum, value) => sum + value, 0));
assert.ok(businessProfile.slice(8, 17).reduce((sum, value) => sum + value, 0) > 0.75);

const daytimeLoad8760 = buildBaseHourlyLoad8760(new Array(12).fill(310), 'residential', 'daytime-heavy');
const eveningLoad8760 = buildBaseHourlyLoad8760(new Array(12).fill(310), 'residential', 'evening-heavy');
nearly(daytimeLoad8760.reduce((sum, value) => sum + value, 0), 3720);
assert.ok(daytimeLoad8760.slice(10, 15).reduce((sum, value) => sum + value, 0)
  > eveningLoad8760.slice(10, 15).reduce((sum, value) => sum + value, 0));

const normalizedMonthlyProduction = normalizeMonthlyProductionToAnnual(new Array(12).fill(100), 1234);
assert.equal(normalizedMonthlyProduction.reduce((sum, value) => sum + value, 0), 1234);
assert.equal(normalizedMonthlyProduction.length, 12);

const pvgisTemperatureAdjustment = resolveProductionTemperatureAdjustment({
  source: 'pvgis-live',
  panelTempCoeff: -0.0037,
  avgSummerTemp: 38
});
assert.equal(pvgisTemperatureAdjustment.factor, 1);
assert.equal(pvgisTemperatureAdjustment.applied, false);
assert.equal(pvgisTemperatureAdjustment.lossRate, 0);

const fallbackTemperatureAdjustment = resolveProductionTemperatureAdjustment({
  source: 'fallback-psh',
  panelTempCoeff: -0.0037,
  avgSummerTemp: 38
});
assert.ok(fallbackTemperatureAdjustment.applied);
nearly(fallbackTemperatureAdjustment.factor, 1 + (-0.0037 * 13 * 0.45));
assert.ok(fallbackTemperatureAdjustment.factor < 1);
assert.equal(fallbackTemperatureAdjustment.basis, 'fallback-annualized-temperature-derate');

const hourly = simulateHourlyEnergy(
  new Array(12).fill(100),
  new Array(12).fill(80),
  { tariffType: 'residential' }
);
nearly(hourly.annualProduction, 1200);
nearly(hourly.annualLoad, 960);
assert.ok(hourly.selfConsumption <= hourly.annualProduction);
assert.ok(hourly.gridExport >= 0);
assert.equal(hourly.exportPolicy.interval, 'monthly');
assert.ok(hourly.importOffsetEnergy > 0);
assert.ok(hourly.paidGridExport >= 0);

const daytimeHourly = simulateHourlyEnergy(
  new Array(12).fill(300),
  new Array(12).fill(300),
  { tariffType: 'residential', loadProfileKey: 'daytime-heavy' }
);
const eveningHourly = simulateHourlyEnergy(
  new Array(12).fill(300),
  new Array(12).fill(300),
  { tariffType: 'residential', loadProfileKey: 'evening-heavy' }
);
assert.ok(daytimeHourly.selfConsumption > eveningHourly.selfConsumption);

const fillRoofLayout = calculateSystemLayout({
  scenarioKey: 'on-grid',
  designTarget: 'fill-roof',
  panelType: 'mono',
  roofArea: 100,
  tilt: 30,
  azimuth: 180,
  usableRoofRatio: 0.75,
  annualConsumptionKwh: 1000,
  ghi: 1600
}, 'mono');
const billTargetLayout = calculateSystemLayout({
  scenarioKey: 'on-grid',
  designTarget: 'bill-offset',
  panelType: 'mono',
  roofArea: 100,
  tilt: 30,
  azimuth: 180,
  usableRoofRatio: 0.75,
  annualConsumptionKwh: 1000,
  ghi: 1600
}, 'mono');
assert.ok(billTargetLayout.panelCount < fillRoofLayout.panelCount);
assert.equal(billTargetLayout.designTargetApplied, 'bill-offset');

const qcellsLayout = calculateSystemLayout({
  scenarioKey: 'on-grid',
  designTarget: 'fill-roof',
  panelType: 'n_type_topcon',
  panelCatalogId: 'qcells_qtron_blk_mg2',
  roofArea: 60,
  usableRoofRatio: 0.75
}, 'n_type_topcon');
nearly(qcellsLayout.panelArea, 1.722 * 1.134, 1e-9);
assert.equal(qcellsLayout.panelCount, 23);
nearly(qcellsLayout.systemPower, 23 * 440 / 1000, 1e-9);
assert.ok(qcellsLayout.panelCount > calculateSystemLayout({
  scenarioKey: 'on-grid',
  designTarget: 'fill-roof',
  panelType: 'n_type_topcon',
  roofArea: 60,
  usableRoofRatio: 0.75
}, 'n_type_topcon').panelCount);

const battery = simulateBatteryOnHourlySummary(hourly, { capacity: 10, dod: 0.9, efficiency: 0.9 });
assert.ok(battery.totalSelfConsumption >= hourly.selfConsumption);
assert.ok(battery.remainingExport <= hourly.gridExport);

const tariffModel = buildTariffModel({
  tariffType: 'residential',
  tariff: 5,
  exportTariff: 2,
  annualPriceIncrease: 0,
  discountRate: 0
});
const financial = computeFinancialTable({
  annualEnergy: 1000,
  hourlySummary: {
    annualProduction: 1000,
    annualLoad: 1000,
    selfConsumption: 800,
    gridExport: 200,
    gridImport: 200
  },
  batterySummary: null,
  totalCost: 10000,
  tariffModel,
  panel: PANEL_TYPES.mono,
  annualOMCost: 0,
  annualInsurance: 0,
  inverterLifetime: 12,
  inverterReplaceCost: 0,
  netMeteringEnabled: true,
  exportRateOverride: 2
});
assert.equal(financial.rows[0].rate, '5.00');
assert.ok(financial.projectNPV < financial.discountedCashFlow);
assert.equal(Math.round(financial.projectNPV), Math.round(financial.discountedCashFlow - 10000));
assert.equal(financial.simplePaybackYear, financial.paybackYear);
assert.ok(financial.discountedPaybackYear >= financial.simplePaybackYear || financial.discountedPaybackYear === 0);

const cappedFinancial = computeFinancialTable({
  annualEnergy: 1000,
  hourlySummary: {
    annualProduction: 1000,
    annualLoad: 200,
    selfConsumption: 100,
    gridExport: 900,
    paidGridExport: 200,
    gridImport: 100
  },
  batterySummary: null,
  totalCost: 10000,
  tariffModel,
  panel: { firstYearDeg: 0, degradation: 0 },
  annualOMCost: 0,
  annualInsurance: 0,
  inverterLifetime: 12,
  inverterReplaceCost: 0,
  netMeteringEnabled: true,
  exportRateOverride: 2
});
assert.equal(cappedFinancial.rows[0].savings, 900);

const offsetFinancial = computeFinancialTable({
  annualEnergy: 1000,
  hourlySummary: {
    annualProduction: 1000,
    annualLoad: 1000,
    selfConsumption: 300,
    importOffsetEnergy: 400,
    gridExport: 700,
    paidGridExport: 200,
    unpaidGridExport: 100,
    gridImport: 700
  },
  batterySummary: null,
  totalCost: 10000,
  tariffModel,
  panel: { firstYearDeg: 0, degradation: 0 },
  annualOMCost: 0,
  annualInsurance: 0,
  inverterLifetime: 12,
  inverterReplaceCost: 0,
  netMeteringEnabled: true,
  exportRateOverride: 2
});
assert.equal(offsetFinancial.rows[0].selfConsumptionKwh, 300);
assert.equal(offsetFinancial.rows[0].importOffsetKwh, 400);
assert.equal(offsetFinancial.rows[0].paidExportKwh, 200);
assert.equal(offsetFinancial.rows[0].savings, 3900);

const zeroExportTariffOffsetFinancial = computeFinancialTable({
  annualEnergy: 1000,
  hourlySummary: {
    annualProduction: 1000,
    annualLoad: 1000,
    selfConsumption: 300,
    importOffsetEnergy: 400,
    gridExport: 700,
    paidGridExport: 200,
    unpaidGridExport: 100,
    gridImport: 700
  },
  batterySummary: null,
  totalCost: 10000,
  tariffModel: { ...tariffModel, exportRate: 0 },
  panel: { firstYearDeg: 0, degradation: 0 },
  annualOMCost: 0,
  annualInsurance: 0,
  inverterLifetime: 12,
  inverterReplaceCost: 0,
  netMeteringEnabled: true,
  exportRateOverride: 0
});
assert.equal(zeroExportTariffOffsetFinancial.rows[0].importOffsetKwh, 400);
assert.equal(zeroExportTariffOffsetFinancial.rows[0].paidExportKwh, 200);
assert.equal(zeroExportTariffOffsetFinancial.rows[0].savings, 3500);

const offGridRate = 19.5;
const offGridTariffModel = { ...tariffModel, importRate: offGridRate, exportRate: 0, annualPriceIncrease: 0 };
const offGridFinancial = computeFinancialTable({
  annualEnergy: 1000,
  hourlySummary: {
    annualProduction: 1000,
    annualLoad: 1000,
    selfConsumption: 800,
    gridExport: 200,
    paidGridExport: 200,
    gridImport: 200
  },
  batterySummary: null,
  totalCost: 10000,
  tariffModel: offGridTariffModel,
  panel: { firstYearDeg: 0, degradation: 0 },
  annualOMCost: 0,
  annualInsurance: 0,
  inverterLifetime: 12,
  inverterReplaceCost: 0,
  netMeteringEnabled: false,
  exportRateOverride: 0
});
assert.equal(offGridFinancial.rows[0].savings, Math.round(800 * offGridRate));
assert.equal(offGridFinancial.rows[0].paidExportKwh, 0);

const skttTariff = buildTariffModel({
  tariffType: 'residential',
  tariffRegime: 'auto',
  annualConsumptionKwh: 4500,
  tariff: 5,
  skttTariff: 8
});
assert.equal(skttTariff.effectiveRegime, 'sktt');
assert.equal(skttTariff.importRate, 8);

const cappedExport = simulateHourlyEnergy(
  new Array(12).fill(500),
  new Array(12).fill(100),
  { tariffType: 'residential' }
);
assert.ok(cappedExport.gridExport > cappedExport.paidGridExport);
assert.ok(cappedExport.unpaidGridExport > 0);

const chronologicalBattery = simulateBatteryOnHourlySummary(cappedExport, { capacity: 5, dod: 0.9, efficiency: 0.9 });
assert.equal(chronologicalBattery.batteryExportPaid, 0);
assert.ok(chronologicalBattery.remainingExport <= cappedExport.gridExport);
assert.ok(chronologicalBattery.remainingImport <= cappedExport.gridImport);

const recoverableVatTreatment = resolveTaxTreatment({
  grossTotalCost: 120000,
  solarKdv: 20000,
  taxEnabled: true,
  tax: { kdvRecovery: true }
});
assert.equal(recoverableVatTreatment.recoverableKdv, 20000);
assert.equal(recoverableVatTreatment.financialCostBasis, 100000);
assert.equal(recoverableVatTreatment.vatTreatment, 'recoverable-kdv-excluded-from-financial-cost-basis');

const noVatRecoveryTreatment = resolveTaxTreatment({
  grossTotalCost: 120000,
  solarKdv: 20000,
  taxEnabled: true,
  tax: { kdvRecovery: false }
});
assert.equal(noVatRecoveryTreatment.recoverableKdv, 0);
assert.equal(noVatRecoveryTreatment.financialCostBasis, 120000);

// --- Tariff Input Mode / Distribution Fee Tests ---

// net-plus-fee mode: state.tariff remains the base import tariff; buildTariffModel
// adds distributionFee only to effectiveImportRate.
const tariffNetPlusFee = buildTariffModel({
  tariffType: 'residential',
  tariff: 5.0,
  distributionFee: 1.0,
  tariffInputMode: 'net-plus-fee',
  annualPriceIncrease: 0,
  discountRate: 0
});
assert.equal(tariffNetPlusFee.tariffInputMode, 'net-plus-fee');
assert.equal(tariffNetPlusFee.distributionFee, 1.0);
assert.equal(tariffNetPlusFee.importRate, 5.0);

// gross mode: distributionFee should be zeroed out in model (app.js does not add fee)
const tariffGross = buildTariffModel({
  tariffType: 'residential',
  tariff: 6.0,           // gross tariff — no fee to add
  distributionFee: 1.0,
  tariffInputMode: 'gross',
  annualPriceIncrease: 0,
  discountRate: 0
});
assert.equal(tariffGross.tariffInputMode, 'gross');
assert.equal(tariffGross.distributionFee, 0, 'gross mode: distributionFee in model must be 0');
// importRate is still what was passed as tariff (app.js sends 6.0 without adding fee in gross mode)
assert.equal(tariffGross.importRate, 6.0);

// Verify distribution fee does NOT leak to export rate
assert.equal(tariffNetPlusFee.exportRate, 0);
assert.equal(tariffGross.exportRate, 0);

// effectiveImportRate = importRate + distributionFee in net-plus-fee mode
assert.equal(tariffNetPlusFee.effectiveImportRate, 6.0, 'net-plus-fee: effectiveImportRate = importRate + distributionFee');
// gross mode: effectiveImportRate = importRate (no fee added)
assert.equal(tariffGross.effectiveImportRate, 6.0, 'gross mode: effectiveImportRate = importRate');

// Distribution fee increases savings in net-plus-fee mode
const feeModel = buildTariffModel({
  tariffType: 'residential',
  tariff: 5.0,
  distributionFee: 2.0,
  tariffInputMode: 'net-plus-fee',
  annualPriceIncrease: 0,
  discountRate: 0,
  exportTariff: 0
});
const feeFinancial = computeFinancialTable({
  annualEnergy: 1000,
  hourlySummary: { annualProduction: 1000, annualLoad: 1000, selfConsumption: 500, gridExport: 500, paidGridExport: 0, gridImport: 500 },
  batterySummary: null,
  totalCost: 10000,
  tariffModel: feeModel,
  panel: { firstYearDeg: 0, degradation: 0 },
  annualOMCost: 0, annualInsurance: 0, inverterLifetime: 12, inverterReplaceCost: 0,
  netMeteringEnabled: false, exportRateOverride: 0
});
// effectiveImportRate = 5 + 2 = 7; savings = 500 * 7 = 3500
assert.equal(feeModel.effectiveImportRate, 7.0);
assert.equal(feeFinancial.rows[0].savings, 3500, 'distribution fee included in savings');
// row.rate should still show base importRate (5.00), not effective rate
assert.equal(feeFinancial.rows[0].rate, '5.00', 'row.rate shows importRate (display), not effectiveImportRate');
assert.equal(feeFinancial.rows[0].effectiveImportRate, '7.00', 'row.effectiveImportRate shows the rate used in savings');
assert.equal(feeFinancial.rows[0].rateBasis, 'import-plus-distribution-fee');
assert.equal(Number(feeFinancial.grossSimplePaybackYear.toFixed(2)), 2.86);
assert.equal(feeFinancial.cumulativeNetPaybackYear, feeFinancial.simplePaybackYear);

// tariffSourceType is passed through
const tariffOfficial = buildTariffModel({ tariff: 5, tariffSourceType: 'official', annualPriceIncrease: 0, discountRate: 0 });
assert.equal(tariffOfficial.tariffSourceType, 'official');
const tariffManual = buildTariffModel({ tariff: 5, tariffSourceType: 'manual', annualPriceIncrease: 0, discountRate: 0 });
assert.equal(tariffManual.tariffSourceType, 'manual');

// --- Hourly profile source test ---
// simulateHourlyEnergy uses real hourly data when provided
const syntheticMonthly = new Array(12).fill(500);
const syntheticLoad = new Array(12).fill(310);
const syntheticResult = simulateHourlyEnergy(syntheticMonthly, syntheticLoad, {});
assert.equal(syntheticResult.hourly8760.length, 8760);

// With real hourly data the annual load should match the provided data exactly
const fakeHourly8760 = new Array(8760).fill(1.0); // 1 kWh/h = 8760 kWh/year
const realProfileResult = simulateHourlyEnergy(syntheticMonthly, syntheticLoad, { hourlyLoad8760: fakeHourly8760 });
assert.ok(Math.abs(realProfileResult.annualLoad - 8760) < 1, 'Real hourly profile annual load should equal sum of provided data');

const fakeHourlyProduction8760 = new Array(8760).fill(0.5); // 4380 kWh/year
const realPvResult = simulateHourlyEnergy(syntheticMonthly, syntheticLoad, { hourlyProduction8760: fakeHourlyProduction8760 });
assert.ok(Math.abs(realPvResult.annualProduction - 4380) < 1, 'Real hourly PV profile annual production should equal sum of provided data');
assert.equal(Math.round(realPvResult.monthly.reduce((sum, row) => sum + row.production, 0)), 4380);

console.log('calc-core tests passed');
