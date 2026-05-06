import assert from 'node:assert/strict';
import { appendAuditEntry } from '../js/audit-log.js';
import { buildCrmLeadExport } from '../js/crm-export.js';
import { validateEvidenceFile } from '../js/evidence-files.js';
import { canApproveProposal, normalizeUserIdentity } from '../js/identity.js';
import { buildApprovalWorkflow } from '../js/proposal-governance.js';

const approver = normalizeUserIdentity({ name: 'Ayse', role: 'approver' });
assert.equal(canApproveProposal(approver), true);
assert.equal(canApproveProposal({ name: 'Sales', role: 'sales' }), false);

const state = { userIdentity: approver, auditLog: [] };
appendAuditEntry(state, 'proposal.changed', { field: 'tariff' }, approver, '2026-04-13T10:00:00.000Z');
appendAuditEntry(state, 'evidence.file_attached', { evidenceType: 'customerBill' }, approver, '2026-04-13T10:01:00.000Z');
assert.equal(state.auditLog.length, 2);
assert.equal(state.auditLog[0].action, 'proposal.changed');
assert.equal(state.auditLog[1].user.role, 'approver');

const invalidFile = validateEvidenceFile({ name: 'bad.exe', size: 12, type: 'application/x-msdownload' });
assert.equal(invalidFile.ok, false);

const validFile = validateEvidenceFile({ name: 'bill.pdf', size: 1024, type: 'application/pdf' });
assert.equal(validFile.ok, true);

const approval = buildApprovalWorkflow({
  userIdentity: approver,
  roofGeometry: { areaM2: 80 },
  quoteInputsVerified: true,
  hasSignedCustomerBillData: true,
  evidence: {
    customerBill: { status: 'verified' },
    supplierQuote: { status: 'verified' },
    tariffSource: { status: 'verified' }
  },
  bomCommercials: { supplierQuoteState: 'received' },
  gridApplicationChecklist: {
    bill: { done: true }, titleOrLease: { done: true }, connectionOpinion: { done: true },
    singleLine: { done: true }, staticReview: { done: true }, layout: { done: true },
    inverterDocs: { done: true }, metering: { done: true }
  },
  proposalApproval: { state: 'approved' }
}, { score: 90 });
assert.equal(approval.state, 'approved');
assert.ok(approval.approvalRecord.immutable);

const blocked = buildApprovalWorkflow({
  userIdentity: { name: 'Satis', role: 'sales' },
  roofGeometry: { areaM2: 80 },
  quoteInputsVerified: true,
  hasSignedCustomerBillData: true,
  evidence: {
    customerBill: { status: 'verified' },
    supplierQuote: { status: 'verified' },
    tariffSource: { status: 'verified' }
  },
  bomCommercials: { supplierQuoteState: 'received' },
  gridApplicationChecklist: {
    bill: { done: true }, titleOrLease: { done: true }, connectionOpinion: { done: true },
    singleLine: { done: true }, staticReview: { done: true }, layout: { done: true },
    inverterDocs: { done: true }, metering: { done: true }
  },
  proposalApproval: { state: 'approved' }
}, { score: 90 });
assert.equal(blocked.state, 'finance-review');
assert.ok(blocked.blockers.some(item => item.includes('approver/admin')));

const crm = buildCrmLeadExport(
  { cityName: 'Izmir', tariffType: 'commercial', auditLog: state.auditLog },
  {
    confidenceLevel: 'engineering estimate',
    annualSavings: 1000,
    totalCost: 10000,
    quoteReadiness: { status: 'not-quote-ready', blockers: ['missing evidence'] },
    proposalGovernance: { confidence: { score: 70, level: 'engineering estimate' }, approval: { state: 'finance-review' } },
    evidenceGovernance: { registry: {}, validation: { status: 'incomplete' } }
  }
);
assert.equal(crm.schema, 'guneshesap.crm-lead.v1');
assert.equal(crm.qualification.confidenceScore, 70);
assert.equal(crm.handoff.governance.auditLog.length, 2);

console.log('enterprise governance tests passed');
