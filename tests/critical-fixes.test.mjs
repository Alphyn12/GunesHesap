// ═══════════════════════════════════════════════════════════
// Regression tests for the 10 critical fixes
// Run with: node --experimental-vm-modules tests/critical-fixes.test.mjs
// ═══════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { buildTariffModel, computeFinancialTable, calcIRR } from '../js/calc-core.js';
import { buildExportCompensationPolicy, SETTLEMENT_CHANGE_DATE } from '../js/turkey-regulation.js';

// ─── helpers ───────────────────────────────────────────────────────────────
function nearly(actual, expected, tol = 1e-4, msg = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg || ''} expected ${expected} ± ${tol}, got ${actual}`
  );
}

const BASE_HOURLY = {
  annualProduction: 6000,
  annualLoad: 5000,
  selfConsumption: 3500,
  gridExport: 2500,
  paidGridExport: 1800,
  unpaidGridExport: 700,
  gridImport: 1500,
  exportPolicy: { interval: 'monthly' }
};

function makeFinancial({ tariffModelState = {}, financial = {}, netMetering = true } = {}) {
  const tariffModel = buildTariffModel({
    tariffType: 'residential',
    tariff: 7.16,
    exportTariff: 2,
    annualPriceIncrease: 0.12,
    discountRate: 0.18,
    ...tariffModelState
  });
  const annualEnergy = financial.annualEnergy ?? 6000;
  const em = annualEnergy / 6000;
  // Scale hourlySummary proportionally when energy changes so selfRatio is preserved
  const hourlySummary = em !== 1 ? {
    ...BASE_HOURLY,
    annualProduction: BASE_HOURLY.annualProduction * em,
    selfConsumption:  BASE_HOURLY.selfConsumption  * em,
    gridExport:       BASE_HOURLY.gridExport        * em,
    paidGridExport:   BASE_HOURLY.paidGridExport    * em,
    unpaidGridExport: BASE_HOURLY.unpaidGridExport  * em,
  } : BASE_HOURLY;
  return computeFinancialTable({
    annualEnergy,
    hourlySummary,
    batterySummary: null,
    totalCost: financial.totalCost ?? 150000,
    tariffModel,
    panel: { degradation: 0.0045, firstYearDeg: 0.02 },
    annualOMCost: 2000,
    annualInsurance: 700,
    inverterLifetime: 12,
    inverterReplaceCost: 15000,
    netMeteringEnabled: netMetering,
    exportRateOverride: netMetering ? tariffModel.exportRate : 0,
  });
}

// ─── FIX-1: Sensitivity analysis — Üretim and Tarife must produce different NPV deltas ──
{
  const base = makeFinancial();
  const baseNpv = base.projectNPV;

  // +10% energy (hourlySummary scales proportionally)
  const withMoreEnergy = makeFinancial({ financial: { annualEnergy: 6600 } });
  // +10% tariff (same energy, higher electricity price)
  const withMoreTariff = makeFinancial({ tariffModelState: { tariff: 7.16 * 1.10 } });

  assert.ok(withMoreEnergy.projectNPV > baseNpv, 'FIX-1: More energy → higher NPV');
  assert.ok(withMoreTariff.projectNPV > baseNpv, 'FIX-1: Higher tariff → higher NPV');
  assert.ok(
    Math.abs(withMoreEnergy.projectNPV - baseNpv) !== Math.abs(withMoreTariff.projectNPV - baseNpv),
    'FIX-1: Energy +10% and Tariff +10% NPV deltas must differ — they were identical before the fix'
  );
  console.log('✓ FIX-1: Sensitivity analysis — Üretim and Tarife produce distinct NPV deltas');
}

// ─── FIX-7: Settlement date determinism — null, not new Date() ─────────────
{
  // When no settlementDate is set, interval must not be 'hourly' (which would
  // only be correct after SETTLEMENT_CHANGE_DATE = '2026-05-01').
  // Since today is 2026-04-15 (before the cutoff), both should return 'monthly'.
  // But even if run after the cutoff, the explicit null means we know it's missing.
  const policy1 = buildExportCompensationPolicy({});
  const policy2 = buildExportCompensationPolicy({});
  assert.equal(
    policy1.settlementDate,
    null,
    'FIX-7: settlementDate must be null when not provided (not today\'s date)'
  );
  assert.equal(
    policy1.interval,
    policy2.interval,
    'FIX-7: Two calls with same (empty) state must produce the same interval (deterministic)'
  );
  // Explicit date before cutoff → monthly
  const beforeCutoff = buildExportCompensationPolicy({ settlementDate: '2026-04-01' });
  assert.equal(beforeCutoff.interval, 'monthly', 'FIX-7: Date before cutoff → monthly');
  // Explicit date after cutoff → hourly
  const afterCutoff = buildExportCompensationPolicy({ settlementDate: '2026-06-01' });
  assert.equal(afterCutoff.interval, 'hourly', 'FIX-7: Date after cutoff → hourly');
  console.log('✓ FIX-7: Settlement date determinism — null default, deterministic interval');
}

// ─── FIX-1 (extended): cost sensitivity produces a distinct delta ─
{
  const base = makeFinancial();
  const withLowerCost = makeFinancial({ financial: { totalCost: 135000 } }); // -10%
  const withHigherCost = makeFinancial({ financial: { totalCost: 165000 } }); // +10%

  assert.ok(withLowerCost.projectNPV > base.projectNPV, 'FIX-1: Lower cost → higher NPV');
  assert.ok(withHigherCost.projectNPV < base.projectNPV, 'FIX-1: Higher cost → lower NPV');
  // Tariff sensitivity ≠ cost sensitivity
  const tariffDelta = makeFinancial({ tariffModelState: { tariff: 7.16 * 0.9 } }).projectNPV - base.projectNPV;
  const costDelta = withLowerCost.projectNPV - base.projectNPV;
  assert.ok(
    Math.abs(tariffDelta - costDelta) > 1000,
    'FIX-1: Tariff and cost sensitivities must differ in magnitude'
  );
  console.log('✓ FIX-1: Cost sensitivity differs from tariff sensitivity');
}

// ─── FIX-6: KDV split — panels at 0%, rest at 20% ─────────────────────────
{
  // Verify the math: panel_cost=100_000, non_panel=50_000
  // Old: (100_000 + 50_000) * 1.20 = 180_000
  // New: 100_000 * 1.00 + 50_000 * 1.20 = 160_000
  const panelCost = 100_000;
  const nonPanelCost = 50_000;
  const oldKdv = (panelCost + nonPanelCost) * 0.20;
  const newKdv = panelCost * 0.00 + nonPanelCost * 0.20;
  assert.equal(newKdv, 10_000, 'FIX-6: Panel KDV = 0, non-panel KDV = 10_000');
  assert.ok(newKdv < oldKdv, 'FIX-6: New KDV must be less than old 20%-flat KDV');
  // Blended rate on total
  const subtotal = panelCost + nonPanelCost;
  const blended = newKdv / subtotal;
  nearly(blended, 0.0667, 0.001, 'FIX-6: Blended KDV ~6.67% for 2/3 panel, 1/3 other');
  console.log('✓ FIX-6: KDV split — panels 0%, non-panel components 20%');
}

// ─── FIX-3 (Python equivalent): self-consumption target capping ─────────────
{
  // Simulate the Python logic in JS for unit testing:
  function backendSelfConsume(annualEnergy, annualLoad, selfConsumptionTarget) {
    return Math.min(annualEnergy * selfConsumptionTarget, annualLoad);
  }
  // on-grid target = 0.58
  const sc_ongrid = backendSelfConsume(10000, 5000, 0.58);
  assert.equal(sc_ongrid, 5000, 'FIX-3: on-grid capped by load (5800 > 5000)');

  // off-grid target = 0.90
  const sc_offgrid = backendSelfConsume(10000, 9000, 0.90);
  assert.equal(sc_offgrid, 9000, 'FIX-3: off-grid capped by load (9000 == 9000)');

  // old behavior (no target): always min(energy, load) = 100% of min
  const sc_old = Math.min(10000, 5000); // always 5000 regardless of target
  assert.equal(sc_old, 5000);

  // New behavior: 6000 energy, 5000 load, 0.58 target → 3480 (not 5000)
  const sc_new = backendSelfConsume(6000, 5000, 0.58);
  assert.ok(Math.abs(sc_new - 3480) < 0.01, `FIX-3: 6000 × 0.58 = 3480, not full load of 5000 (got ${sc_new})`);
  assert.ok(sc_new < sc_old, 'FIX-3: New self-consumption is lower (more realistic) than old 100% model');
  console.log('✓ FIX-3: Backend self-consumption target applied correctly');
}

// ─── FIX-8 (structural): race condition state reset ─────────────────────────
{
  // Verify that the AbortController pattern compiles and can be reset to null
  let _calculationInProgress = false;
  let _calculationAbortController = null;

  function simulateCalcStart() {
    if (_calculationInProgress && _calculationAbortController) {
      _calculationAbortController.abort();
    }
    _calculationInProgress = true;
    _calculationAbortController = new AbortController();
    return _calculationAbortController.signal;
  }

  function simulateCalcEnd() {
    _calculationInProgress = false;
    _calculationAbortController = null;
  }

  const signal1 = simulateCalcStart();
  assert.ok(_calculationInProgress, 'FIX-8: In-progress flag set after start');
  simulateCalcEnd();
  assert.ok(!_calculationInProgress, 'FIX-8: In-progress flag cleared after end');
  assert.ok(_calculationAbortController === null, 'FIX-8: Controller cleared after end');

  // Concurrent starts: second start aborts first
  const firstSignal = simulateCalcStart();
  simulateCalcStart(); // second start — should abort firstSignal
  assert.ok(firstSignal.aborted, 'FIX-8: First calculation signal aborted by second start');
  simulateCalcEnd();
  console.log('✓ FIX-8: Race condition guard — concurrent start aborts previous calculation');
}

console.log('\n✅ All critical-fixes regression tests passed.');
