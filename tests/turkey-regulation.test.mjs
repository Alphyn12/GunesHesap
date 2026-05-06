import assert from 'node:assert/strict';
import {
  applyExportCompensation,
  buildExportCompensationPolicy,
  buildQuoteReadiness,
  determineSkttRegime
} from '../js/turkey-regulation.js';

const residentialSktt = determineSkttRegime({
  tariffType: 'residential',
  annualConsumptionKwh: 4500,
  tariffRegime: 'auto'
});
assert.equal(residentialSktt.effectiveRegime, 'sktt');
assert.equal(residentialSktt.limitKwh, 4000);

const activationPending = determineSkttRegime({
  tariffType: 'residential',
  annualConsumptionKwh: 4500,
  tariffRegime: 'auto',
  skttExceededDate: '2026-04-15',
  tariffEvaluationDate: '2026-05-01'
});
assert.equal(activationPending.effectiveRegime, 'pst');
assert.equal(activationPending.activationDate, '2026-07-01');
assert.equal(activationPending.activationReached, false);

const activationReached = determineSkttRegime({
  tariffType: 'residential',
  annualConsumptionKwh: 4500,
  tariffRegime: 'auto',
  skttExceededDate: '2026-04-15',
  tariffEvaluationDate: '2026-07-01'
});
assert.equal(activationReached.effectiveRegime, 'sktt');
assert.equal(activationReached.activationReached, true);

const residentialPst = determineSkttRegime({
  tariffType: 'residential',
  annualConsumptionKwh: 3500,
  tariffRegime: 'auto'
});
assert.equal(residentialPst.effectiveRegime, 'pst');

const contract = determineSkttRegime({
  tariffType: 'industrial',
  annualConsumptionKwh: 100000,
  tariffRegime: 'contract',
  hasBilateralContract: true,
  contractedTariff: 6
});
assert.equal(contract.effectiveRegime, 'contract');

const monthlyRows = [
  { gridExport: 100, gridImport: 50, load: 50 },
  { gridExport: 200, gridImport: 500, load: 500 }
];
const monthly = applyExportCompensation(monthlyRows, { interval: 'monthly', annualSellableExportCapKwh: 1000 });
assert.equal(monthly.importOffsetEnergy, 250);
assert.equal(monthly.paidGridExport, 50);
assert.equal(monthly.unpaidGridExport, 0);

const monthlyCapped = applyExportCompensation(
  [{ gridExport: 500, gridImport: 100, load: 100 }],
  { interval: 'monthly', annualSellableExportCapKwh: 150 }
);
assert.equal(monthlyCapped.importOffsetEnergy, 100);
assert.equal(Math.round(monthlyCapped.paidGridExport), 150);
assert.equal(Math.round(monthlyCapped.unpaidGridExport), 250);

const hourlyRows = new Array(8760).fill(0).map((_, idx) => ({
  month: idx < 2 ? 0 : 1,
  gridExport: idx === 0 ? 100 : idx === 1 ? 200 : 0,
  load: idx === 0 ? 50 : idx === 1 ? 500 : 0
}));
const hourly = applyExportCompensation(monthlyRows, {
  interval: 'hourly',
  annualSellableExportCapKwh: 180,
  hourlyRows
});
assert.equal(Math.round(hourly.paidGridExport), 180);
assert.equal(Math.round(hourly.unpaidGridExport), 120);
assert.equal(hourly.policy.interval, 'hourly');

const zeroLoadNoonExport = applyExportCompensation(
  [{ gridExport: 100, gridImport: 0, load: 0 }],
  {
    interval: 'hourly',
    annualSellableExportCapKwh: 1000,
    hourlyRows: new Array(8760).fill(0).map((_, idx) => ({
      month: 0,
      gridExport: idx === 0 ? 100 : 0,
      gridImport: 0,
      load: 0
    }))
  }
);
assert.equal(Math.round(zeroLoadNoonExport.paidGridExport), 100);
assert.equal(Math.round(zeroLoadNoonExport.unpaidGridExport), 0);

const mislabeledHourly = applyExportCompensation(monthlyRows, { interval: 'hourly', annualSellableExportCapKwh: 180 });
assert.equal(mislabeledHourly.paidGridExport, 0);
assert.equal(mislabeledHourly.unpaidGridExport, 300);
assert.equal(mislabeledHourly.policy.interval, 'monthly-aggregate-no-hourly-settlement');
assert.equal(mislabeledHourly.policy.requestedInterval, 'hourly');

const policy = buildExportCompensationPolicy({
  annualConsumptionKwh: 1000,
  previousYearConsumptionKwh: 2000,
  sellableExportCapKwh: 0,
  settlementDate: '2026-05-01'
});
assert.equal(policy.interval, 'hourly');
assert.equal(policy.annualSellableExportCapKwh, 2000);

const productionLimitPolicy = buildExportCompensationPolicy({
  annualConsumptionKwh: 1000,
  annualProductionKwh: 2300,
  settlementDate: '2026-05-01'
});
assert.equal(productionLimitPolicy.productionToConsumptionLimitKwh, 2000);
assert.equal(productionLimitPolicy.productionLimitExceeded, true);

const provisionalPolicy = buildExportCompensationPolicy({
  annualConsumptionKwh: 1000,
  exportSettlementMode: 'auto'
});
assert.equal(provisionalPolicy.interval, 'monthly');
assert.equal(provisionalPolicy.provisional, true);
assert.equal(provisionalPolicy.settlementDateMissing, true);

const readiness = buildQuoteReadiness({
  state: { roofGeometry: null },
  results: { usedFallback: true, calculationWarnings: [] },
  tariffModel: { regulation: { effectiveRegime: 'pst', warnings: [] }, exportCompensationPolicy: { sources: [{}] } }
});
assert.equal(readiness.status, 'not-quote-ready');
assert.ok(readiness.blockers.some(b => b.includes('PVGIS')));
assert.ok(readiness.blockers.some(b => b.includes('Proposal')));

const hourlySyntheticPvReadiness = buildQuoteReadiness({
  state: { exportSettlementMode: 'hourly', roofGeometry: {}, quoteInputsVerified: true, hasSignedCustomerBillData: true, proposalApproval: { state: 'approved', approvalRecord: { immutable: true } }, costSourceType: 'bom-verified', tariffSourceType: 'official', gridApplicationChecklist: { applicationPrepared: true, connectionOpinionReceived: true, projectApproved: true, meterBidirectional: true, acceptanceScheduled: true } },
  results: { usedFallback: false, calculationWarnings: [], productionProfileSource: 'monthly-derived-synthetic-pv' },
  tariffModel: { sourceDate: '2026-04-01', sourceLabel: 'official', tariffSourceType: 'official', regulation: { effectiveRegime: 'pst', warnings: [] }, exportCompensationPolicy: { interval: 'hourly', sources: [{}] } },
  evidenceGovernance: { registry: { supplierQuote: { status: 'verified' } } }
});
assert.ok(hourlySyntheticPvReadiness.blockers.some(b => b.includes('PV üretim profili sentetik')));
assert.ok(hourlySyntheticPvReadiness.blockers.some(b => b.includes('tüketim profili 8760')));

const manualTariffReadiness = buildQuoteReadiness({
  state: { roofGeometry: {}, quoteInputsVerified: true, hasSignedCustomerBillData: true, proposalApproval: { state: 'approved', approvalRecord: { immutable: true } }, bomCommercials: { supplierQuoteState: 'received' }, costSourceType: 'bom-verified', tariffSourceType: 'manual', shadingQuality: 'site-verified', gridApplicationChecklist: { bill: { done: true } } },
  results: { usedFallback: false, calculationWarnings: [], productionProfileSource: 'pvgis-seriescalc-hourly' },
  tariffModel: { sourceDate: '2026-04-01', sourceLabel: 'manual', tariffSourceType: 'manual', regulation: { effectiveRegime: 'pst', warnings: [] }, exportCompensationPolicy: { interval: 'monthly', sources: [{}] } },
  evidenceGovernance: { validation: { status: 'complete', warnings: [] }, registry: { supplierQuote: { status: 'verified', validUntil: '2026-05-01' } } }
});
assert.ok(manualTariffReadiness.blockers.some(b => b.includes('official tariff source')));

const enterpriseReady = buildQuoteReadiness({
  state: {
    exportSettlementMode: 'hourly',
    roofGeometry: {},
    quoteInputsVerified: true,
    hasSignedCustomerBillData: true,
    hourlyConsumption8760: new Array(8760).fill(1),
    proposalApproval: { state: 'approved', approvalRecord: { immutable: true } },
    bomCommercials: { supplierQuoteState: 'received' },
    costSourceType: 'bom-verified',
    tariffSourceType: 'official',
    shadingQuality: 'site-verified',
    gridApplicationChecklist: { bill: { done: true }, project: { done: true } }
  },
  results: { usedFallback: false, calculationWarnings: [], productionProfileSource: 'backend-pvlib-hourly' },
  tariffModel: { sourceDate: '2026-04-01', sourceLabel: 'official', tariffSourceType: 'official', regulation: { effectiveRegime: 'pst', warnings: [] }, exportCompensationPolicy: { interval: 'hourly', sources: [{}] } },
  evidenceGovernance: { validation: { status: 'complete', warnings: [] }, registry: { supplierQuote: { status: 'verified', validUntil: '2026-05-01' } } }
});
assert.equal(enterpriseReady.status, 'quote-ready');

const missingSettlementReadiness = buildQuoteReadiness({
  state: { exportSettlementMode: 'auto', settlementDate: '' },
  results: { usedFallback: false, calculationWarnings: [] },
  tariffModel: { regulation: { effectiveRegime: 'pst', warnings: [] }, exportCompensationPolicy: { sources: [{}] } }
});
assert.ok(missingSettlementReadiness.blockers.some(b => b.includes('SETTLEMENT_DATE_MISSING')));

const datedSettlementReadiness = buildQuoteReadiness({
  state: { exportSettlementMode: 'auto', settlementDate: '2026-04-01' },
  results: { usedFallback: false, calculationWarnings: [] },
  tariffModel: { regulation: { effectiveRegime: 'pst', warnings: [] }, exportCompensationPolicy: { sources: [{}] } }
});
assert.ok(!datedSettlementReadiness.blockers.some(b => b.includes('SETTLEMENT_DATE_MISSING')));

console.log('turkey regulation tests passed');
