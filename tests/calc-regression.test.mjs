import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildTariffModel,
  COMMON_YEAR_MONTH_DAYS,
  computeFinancialTable,
  simulateHourlyEnergy
} from '../js/calc-core.js';

const fixtures = JSON.parse(
  await readFile(new URL('./fixtures/financial-regression.json', import.meta.url), 'utf8')
);

function runFinancialFixture(fx) {
  return computeFinancialTable({
    annualEnergy: fx.annualEnergy,
    hourlySummary: fx.hourlySummary,
    batterySummary: null,
    totalCost: fx.totalCost,
    tariffModel: buildTariffModel(fx.tariff),
    panel: fx.panel,
    annualOMCost: 0,
    annualInsurance: 0,
    inverterLifetime: 12,
    inverterReplaceCost: 0,
    netMeteringEnabled: true,
    exportRateOverride: fx.tariff.exportTariff
  });
}

{
  const fx = fixtures.flatNoDegradation;
  const result = runFinancialFixture(fx);

  assert.equal(result.rows[0].rate, fx.expected.year1Rate);
  assert.equal(result.rows[0].savings, fx.expected.year1Savings);
  assert.equal(result.discountedCashFlow, fx.expected.discountedCashFlow);
  assert.equal(result.projectNPV, fx.expected.projectNPV);
  assert.equal(result.paybackYear, fx.expected.paybackYear);
  assert.equal(result.roi, fx.expected.roi);
}

{
  const fx = fixtures.priceIncreaseStartsAfterFirstYear;
  const result = runFinancialFixture(fx);

  assert.equal(result.rows[0].rate, fx.expected.year1Rate);
  assert.equal(result.rows[1].rate, fx.expected.year2Rate);
  assert.equal(result.rows[0].savings, fx.expected.year1Savings);
  assert.equal(result.rows[1].savings, fx.expected.year2Savings);
}

{
  const annualHours = COMMON_YEAR_MONTH_DAYS.reduce((sum, days) => sum + days * 24, 0);
  assert.equal(annualHours, 8760);

  const hourlyLoad = new Array(8760).fill(1);
  const noProduction = simulateHourlyEnergy(
    new Array(12).fill(0),
    new Array(12).fill(0),
    { tariffType: 'commercial', hourlyLoad8760: hourlyLoad }
  );

  assert.equal(noProduction.annualLoad, 8760);
  assert.equal(noProduction.selfConsumption, 0);
  assert.equal(noProduction.gridExport, 0);
  assert.equal(noProduction.gridImport, 8760);
  assert.equal(noProduction.monthly[1].load, 28 * 24);
}

console.log('calc regression tests passed');
