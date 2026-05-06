import assert from 'node:assert/strict';
import {
  buildApprovalWorkflow,
  buildProposalGovernance,
  calculateBomCommercials,
  calculateFinancingModel,
  createApprovalBasisHash,
  createAssumptionLedger,
  createProposalRevision,
  diffProposalRevisions,
  isGridChecklistComplete
} from '../js/proposal-governance.js';

const blockedApproval = buildApprovalWorkflow(
  { proposalApproval: { state: 'approved' }, quoteInputsVerified: false },
  { score: 90 }
);
assert.equal(blockedApproval.state, 'finance-review');
assert.ok(blockedApproval.blockers.length > 0);

const zeroConsumptionApproval = buildApprovalWorkflow(
  {
    proposalApproval: { state: 'approved' },
    quoteInputsVerified: true,
    hasSignedCustomerBillData: false,
    monthlyConsumption: new Array(12).fill(0),
    userIdentity: { name: 'qa', role: 'approver' },
    evidence: {
      customerBill: { status: 'verified' },
      supplierQuote: { status: 'verified' },
      tariffSource: { status: 'verified' }
    },
    bomCommercials: { supplierQuoteState: 'received' }
  },
  { score: 90 }
);
assert.equal(zeroConsumptionApproval.state, 'finance-review');
assert.ok(zeroConsumptionApproval.blockers.some(blocker => blocker.includes('Fatura/tüketim')));

const bom = calculateBomCommercials(100000, {
  bomCommercials: { marginRate: 0.2, contingencyRate: 0.05, supplierQuoteState: 'received' }
});
assert.equal(bom.contingency, 5000);
assert.equal(bom.margin, 21000);
assert.equal(bom.proposedSellPrice, 126000);

const financing = calculateFinancingModel(100000, 40000, {
  financing: { downPayment: 20000, annualRate: 0.24, termYears: 4 }
});
assert.equal(financing.loanPrincipal, 80000);
assert.ok(financing.monthlyPayment > 0);
assert.ok(financing.firstYearDebtServiceCoverage > 0);

assert.equal(isGridChecklistComplete({ bill: { done: true } }), false);

const prev = createProposalRevision({ cityName: 'Ankara', tariffType: 'residential' }, { totalCost: 100, annualEnergy: 1000 });
const next = createProposalRevision({ cityName: 'Ankara', tariffType: 'commercial' }, { totalCost: 120, annualEnergy: 1000 }, prev);
const diff = diffProposalRevisions(prev, next);
assert.ok(diff.some(item => item.key === 'tariffType'));
assert.ok(diff.some(item => item.key === 'totalCost'));

const governance = buildProposalGovernance(
  {
    cityName: 'Ankara',
    roofGeometry: { areaM2: 100 },
    hasSignedCustomerBillData: true,
    evidence: {
      customerBill: { status: 'verified', ref: 'bill-001', checkedAt: '2026-04-10' },
      supplierQuote: { status: 'verified', ref: 'sq-001', issuedAt: '2026-04-01', validUntil: '2026-05-01' },
      tariffSource: { status: 'verified', ref: 'epdk', checkedAt: '2026-04-13' }
    },
    quoteInputsVerified: true,
    userIdentity: { name: 'qa', role: 'approver' },
    proposalApproval: { state: 'approved', approvedBy: 'qa' },
    bomCommercials: { supplierQuoteState: 'received' },
    gridApplicationChecklist: {
      bill: { done: true }, titleOrLease: { done: true }, connectionOpinion: { done: true },
      singleLine: { done: true }, staticReview: { done: true }, layout: { done: true },
      inverterDocs: { done: true }, metering: { done: true }
    }
  },
  {
    usedFallback: false,
    calculationWarnings: [],
    quoteReadiness: { status: 'quote-ready', blockers: [] },
    tariffModel: { effectiveRegime: 'pst', regulation: { warnings: [] }, exportCompensationPolicy: { sources: [{}], interval: 'hourly' } },
    costBreakdown: { subtotal: 100000 },
    totalCost: 120000,
    yearlyTable: [{ netCashFlow: 50000 }]
  }
);
assert.equal(governance.gridChecklistComplete, true);
assert.equal(governance.approval.state, 'approved');
assert.ok(governance.confidence.score >= 85);
assert.ok(governance.approval.approvalRecord.basisHash);

const completeChecklist = {
  bill: { done: true }, titleOrLease: { done: true }, connectionOpinion: { done: true },
  singleLine: { done: true }, staticReview: { done: true }, layout: { done: true },
  inverterDocs: { done: true }, metering: { done: true }
};
const approvedBasisState = {
  cityName: 'Ankara',
  lat: 39.9,
  lon: 32.8,
  roofArea: 100,
  roofGeometry: { areaM2: 100 },
  panelType: 'mono',
  inverterType: 'string',
  tariffType: 'commercial',
  tariffMode: 'auto',
  tariffRegime: 'pst',
  tariff: 8,
  exportTariff: 2,
  exportSettlementMode: 'monthly',
  evidence: {
    customerBill: { status: 'verified', ref: 'bill-001' },
    supplierQuote: { status: 'verified', ref: 'sq-001' },
    tariffSource: { status: 'verified', ref: 'epdk' }
  },
  monthlyConsumption: new Array(12).fill(1000),
  quoteInputsVerified: true,
  userIdentity: { name: 'qa', role: 'approver' },
  bomSelection: { panel: 'panel-a' },
  bomCommercials: { supplierQuoteState: 'received', supplierQuoteRef: 'sq-001' },
  gridApplicationChecklist: completeChecklist,
  results: {
    usedFallback: false,
    panelCount: 100,
    systemPower: 43,
    annualEnergy: 60000,
    totalCost: 1200000,
    annualSavings: 300000,
    npvTotal: 900000,
    roi: '120.0',
    calculationWarnings: [],
    tariffModel: { effectiveRegime: 'pst', exportCompensationPolicy: { interval: 'monthly' } },
    costBreakdown: { subtotal: 1000000, kdv: 200000, total: 1200000, bom: { subtotal: 1000000 } }
  },
  proposalApproval: { state: 'approved', approvedBy: 'qa' }
};
const initialApproval = buildApprovalWorkflow(approvedBasisState, { score: 90 });
assert.equal(initialApproval.state, 'approved');
assert.equal(initialApproval.approvalRecord.basisHash, createApprovalBasisHash(approvedBasisState));

const pvlibLedger = createAssumptionLedger({}, {
  usedFallback: false,
  calculationMode: 'python-pvlib-backed',
  authoritativeProduction: { source: 'pvlib-backed' },
  authoritativeEngineSource: { source: 'pvlib-backed', provider: 'python-pvlib', pvlibBacked: true, confidence: 'high' },
  tariffModel: { sourceDate: '2026-04-01' }
});
const productionLedgerEntry = pvlibLedger.entries.find(entry => entry.key === 'production.dataSource');
assert.equal(productionLedgerEntry.value, 'pvlib-backed');
assert.equal(productionLedgerEntry.sourceLabel, 'python-pvlib');
assert.equal(productionLedgerEntry.confidence, 'high');

for (const mutate of [
  state => { state.roofArea = 120; state.results.systemPower = 50; },
  state => { state.tariff = 9; state.exportSettlementMode = 'hourly'; },
  state => { state.bomSelection = { panel: 'panel-b' }; state.bomCommercials.supplierQuoteRef = 'sq-002'; },
  state => { state.evidence.customerBill.ref = 'bill-002'; },
  state => { state.results.annualEnergy = 65000; state.results.totalCost = 1300000; }
]) {
  const changed = structuredClone(approvedBasisState);
  changed.proposalApproval = {
    state: 'approved',
    approvedBy: 'qa',
    approvalRecord: initialApproval.approvalRecord
  };
  mutate(changed);
  const invalidated = buildApprovalWorkflow(changed, { score: 90 });
  assert.equal(invalidated.state, 'finance-review');
  assert.equal(invalidated.approvalRecord, null);
  assert.equal(invalidated.invalidatedApproval, true);
  assert.ok(invalidated.blockers.some(blocker => blocker.includes('ticari temeli')));
}

console.log('proposal governance tests passed');
