import assert from 'node:assert/strict';
import {
  buildOffgridFieldAcceptanceGate,
  buildOffgridFieldEvidenceGate,
  buildOffgridFieldImportGate,
  buildOffgridFieldOperationGate,
  buildOffgridFieldRevalidationGate,
  buildEvidenceRegistry,
  buildStructuredProposalExport,
  buildTariffSourceGovernance,
  isEvidenceExpired,
  isEvidenceFresh,
  validateEvidenceRegistry
} from '../js/evidence-governance.js';

assert.equal(isEvidenceFresh({ checkedAt: '2026-04-01' }, { today: '2026-04-13', maxAgeDays: 45 }), true);
assert.equal(isEvidenceFresh({ checkedAt: '2026-01-01' }, { today: '2026-04-13', maxAgeDays: 45 }), false);
assert.equal(isEvidenceExpired({ validUntil: '2026-04-01' }, { today: '2026-04-13' }), true);

const emptyMonthlyRegistry = buildEvidenceRegistry(
  { hasSignedCustomerBillData: false, monthlyConsumption: new Array(12).fill(0), evidence: {} },
  {},
  { today: '2026-04-13' }
);
assert.equal(emptyMonthlyRegistry.registry.customerBill.status, 'missing');

const registry = buildEvidenceRegistry(
  {
    hasSignedCustomerBillData: true,
    evidence: {
      customerBill: { status: 'verified', ref: 'bill-001', checkedAt: '2026-04-10', files: [{ id: 'bill-file', name: 'bill.pdf', size: 10, sha256: 'a'.repeat(64), validationStatus: 'validated' }] },
      supplierQuote: { status: 'verified', ref: 'sq-001', issuedAt: '2026-04-01', validUntil: '2026-05-01', files: [{ id: 'sq-file', name: 'sq.pdf', size: 10, sha256: 'b'.repeat(64), validationStatus: 'validated' }] },
      tariffSource: { status: 'verified', ref: 'epdk', checkedAt: '2026-04-13', sourceUrl: 'https://epdk.gov.tr' },
      gridApplication: { status: 'verified', ref: 'grid', checkedAt: '2026-04-12' }
    },
    bomCommercials: { supplierQuoteState: 'received', supplierQuoteRef: 'sq-001', supplierQuoteDate: '2026-04-01', supplierQuoteValidUntil: '2026-05-01' },
    gridApplicationChecklist: {
      bill: { done: true, evidence: 'x' },
      titleOrLease: { done: true, evidence: 'x' },
      connectionOpinion: { done: true, evidence: 'x' },
      singleLine: { done: true, evidence: 'x' },
      staticReview: { done: true, evidence: 'x' },
      layout: { done: true, evidence: 'x' },
      inverterDocs: { done: true, evidence: 'x' },
      metering: { done: true, evidence: 'x' }
    }
  },
  {
    tariffModel: {
      sourceDate: '2026-04-12',
      sourceLabel: 'EPDK local',
      exportCompensationPolicy: {
        version: 'TR-REG',
        sources: [{ label: 'EPDK', checkedDate: '2026-04-13', url: 'https://epdk.gov.tr' }]
      }
    }
  }
);
assert.equal(registry.validation.status, 'complete');

const stale = buildTariffSourceGovernance(
  { sourceDate: '2026-01-01', sourceLabel: 'old' },
  { registry: { tariffSource: { checkedAt: '2026-01-01', sourceLabel: 'old' } } },
  { today: '2026-04-13' }
);
assert.equal(stale.stale, true);

const invalid = validateEvidenceRegistry({
  customerBill: { status: 'missing' },
  supplierQuote: { status: 'verified', validUntil: '2026-04-01' },
  tariffSource: { status: 'verified', checkedAt: '2026-01-01' },
  regulationSource: { status: 'verified', checkedAt: '2026-04-01' },
  gridApplication: { status: 'missing' }
});
assert.equal(invalid.status, 'incomplete');
assert.ok(invalid.blockers.length >= 3);

const offgridEvidenceBlocked = buildOffgridFieldEvidenceGate(
  { registry: {} },
  {
    offgridL2Results: {
      fieldGuaranteeReadiness: { status: 'blocked', phase1Ready: false },
      productionDispatchMetadata: { hasRealHourlyProduction: false },
      loadMode: 'device-list',
      synthetic: true
    }
  },
  { today: '2026-04-13' }
);
assert.equal(offgridEvidenceBlocked.phase2Ready, false);
assert.ok(offgridEvidenceBlocked.blockers.some(item => item.includes('offgridPvProduction')));

const evidenceFile = (id, sha) => ({ id, name: `${id}.csv`, size: 100, sha256: sha.repeat(64).slice(0, 64), validationStatus: 'validated' });
const verifiedOffgridEvidence = {
  offgridPvProduction: { status: 'verified', ref: 'pv.csv', checkedAt: '2026-04-12', files: [evidenceFile('pv', 'a')] },
  offgridLoadProfile: { status: 'verified', ref: 'load.csv', checkedAt: '2026-04-12', files: [evidenceFile('load', 'b')] },
  offgridCriticalLoadProfile: { status: 'verified', ref: 'critical.csv', checkedAt: '2026-04-12', files: [evidenceFile('critical', 'c')] },
  offgridSiteShading: { status: 'verified', ref: 'shade.pdf', checkedAt: '2026-04-12', files: [evidenceFile('shade', 'd')] },
  offgridEquipmentDatasheets: { status: 'verified', ref: 'datasheets.pdf', checkedAt: '2026-04-12', files: [evidenceFile('datasheets', 'e')] },
  offgridCommissioningReport: { status: 'verified', ref: 'commissioning.pdf', checkedAt: '2026-04-12', files: [evidenceFile('commissioning', 'f')] },
  offgridAcceptanceTest: { status: 'verified', ref: 'acceptance.pdf', checkedAt: '2026-04-12', files: [evidenceFile('acceptance', 'g')] },
  offgridMonitoringCalibration: { status: 'verified', ref: 'calibration.pdf', checkedAt: '2026-04-12', files: [evidenceFile('calibration', 'h')] },
  offgridAsBuiltDocs: { status: 'verified', ref: 'asbuilt.pdf', checkedAt: '2026-04-12', files: [evidenceFile('asbuilt', 'i')] },
  offgridWarrantyOandM: { status: 'verified', ref: 'warranty-om.pdf', checkedAt: '2026-04-12', files: [evidenceFile('warranty', 'j')] },
  offgridTelemetry30Day: { status: 'verified', ref: 'telemetry.csv', checkedAt: '2026-04-12', notes: 'availability 99.9%; critical events 0', files: [evidenceFile('telemetry', 'k')] },
  offgridPerformanceBaseline: { status: 'verified', ref: 'baseline.pdf', checkedAt: '2026-04-12', notes: 'measured baseline accepted', files: [evidenceFile('baseline', 'l')] },
  offgridMaintenanceLog: { status: 'verified', ref: 'maintenance.pdf', checkedAt: '2026-04-12', files: [evidenceFile('maintenance', 'm')] },
  offgridIncidentLog: { status: 'verified', ref: 'incidents.pdf', checkedAt: '2026-04-12', files: [evidenceFile('incidents', 'n')] },
  offgridRemoteMonitoringSla: { status: 'verified', ref: 'sla.pdf', checkedAt: '2026-04-12', files: [evidenceFile('sla', 'o')] },
  offgridAnnualRevalidation: { status: 'verified', ref: 'annual.pdf', checkedAt: '2026-04-12', notes: 'annual coverage/SOC/generator drift accepted', files: [evidenceFile('annual', 'p')] },
  offgridBatteryHealthReport: { status: 'verified', ref: 'battery-soh.pdf', checkedAt: '2026-04-12', notes: 'SOH 94%; capacity test accepted', files: [evidenceFile('battery', 'q')] },
  offgridGeneratorServiceRecord: { status: 'verified', ref: 'generator-service.pdf', checkedAt: '2026-04-12', files: [evidenceFile('generator', 'r')] },
  offgridFirmwareSettingsBackup: { status: 'verified', ref: 'settings-backup.pdf', checkedAt: '2026-04-12', files: [evidenceFile('settings', 's')] },
  offgridCustomerSignoff: { status: 'verified', ref: 'customer-signoff.pdf', checkedAt: '2026-04-12', files: [evidenceFile('signoff', 't')] }
};
const offgridRegistry = buildEvidenceRegistry(
  {
    scenarioKey: 'off-grid',
    hourlyConsumption8760: new Array(8760).fill(1),
    offgridPvHourly8760: new Array(8760).fill(0.5),
    offgridCriticalLoad8760: new Array(8760).fill(0.3),
    offgridFieldImports: {
      highResolutionLoad: {
        sampleCount: 10080,
        intervalMinutes: 1,
        durationDays: 7,
        observedPeakKw: 5.4,
        p95Kw: 3.2,
        derivedHourly8760Ready: true,
        derivedHourly8760: new Array(8760).fill(1)
      },
      inverterEventLog: {
        eventCount: 12,
        tripCount: 1,
        overloadCount: 2,
        faultCount: 0
      }
    },
    shadingQuality: 'site-verified',
    evidence: {
      ...verifiedOffgridEvidence,
      offgridHighResLoadProfile: { status: 'verified', ref: 'highres.xlsx', checkedAt: '2026-04-12', files: [evidenceFile('highres', 'u')] },
      offgridInverterEventLog: { status: 'verified', ref: 'inverter-log.xlsx', checkedAt: '2026-04-12', files: [evidenceFile('invlog', 'v')] }
    }
  },
  {
    offgridL2Results: {
      fieldGuaranteeReadiness: { status: 'phase1-ready', phase1Ready: true },
      productionDispatchMetadata: { hasRealHourlyProduction: true },
      loadMode: 'hourly-8760',
      synthetic: false
    }
  },
  { today: '2026-04-13' }
);
const offgridEvidenceReady = buildOffgridFieldEvidenceGate(
  offgridRegistry,
  {
    offgridL2Results: {
      fieldGuaranteeReadiness: { status: 'phase1-ready', phase1Ready: true },
      productionDispatchMetadata: { hasRealHourlyProduction: true },
      loadMode: 'hourly-8760',
      synthetic: false
    }
  },
  { today: '2026-04-13' }
);
assert.equal(offgridEvidenceReady.phase2Ready, true);
assert.equal(offgridEvidenceReady.fieldGuaranteeReady, false);

const offgridFieldImportReady = buildOffgridFieldImportGate(
  offgridRegistry,
  {
    offgridL2Results: {
      fieldImportSummary: {
        highResolutionLoad: {
          sampleCount: 10080,
          intervalMinutes: 1,
          durationDays: 7,
          observedPeakKw: 5.4,
          p95Kw: 3.2,
          derivedHourly8760Ready: true
        },
        inverterEventLog: {
          eventCount: 12,
          tripCount: 1,
          overloadCount: 2
        }
      }
    }
  },
  { today: '2026-04-13' }
);
assert.equal(offgridFieldImportReady.phase7Ready, true);
assert.ok(offgridFieldImportReady.warnings.some(item => item.includes('trip/overload')));

const offgridAcceptanceBlocked = buildOffgridFieldAcceptanceGate(
  { registry: {} },
  { offgridL2Results: { fieldGuaranteeReadiness: { phase1Ready: false }, fieldEvidenceGate: { phase2Ready: false }, fieldModelMaturityGate: { phase3Ready: false } } },
  { today: '2026-04-13' }
);
assert.equal(offgridAcceptanceBlocked.phase4Ready, false);
assert.ok(offgridAcceptanceBlocked.blockers.some(item => item.includes('Faz 1')));

const offgridAcceptanceReady = buildOffgridFieldAcceptanceGate(
  offgridRegistry,
  {
    offgridL2Results: {
      fieldGuaranteeReadiness: { phase1Ready: true },
      fieldEvidenceGate: { phase2Ready: true },
      fieldModelMaturityGate: { phase3Ready: true },
      fieldStressAnalysis: { scenarios: [{ key: 'combined-design-stress' }] },
      generatorEnabled: false
    }
  },
  { today: '2026-04-13' }
);
assert.equal(offgridAcceptanceReady.phase4Ready, true);
assert.equal(offgridAcceptanceReady.fieldGuaranteeReady, true);

const offgridOperationBlocked = buildOffgridFieldOperationGate(
  { registry: {} },
  { offgridL2Results: { fieldAcceptanceGate: { phase4Ready: false } } },
  { today: '2026-04-13' }
);
assert.equal(offgridOperationBlocked.phase5Ready, false);
assert.ok(offgridOperationBlocked.blockers.some(item => item.includes('Faz 4')));

const offgridOperationReady = buildOffgridFieldOperationGate(
  offgridRegistry,
  { offgridL2Results: { fieldAcceptanceGate: { phase4Ready: true } } },
  { today: '2026-04-13' }
);
assert.equal(offgridOperationReady.phase5Ready, true);
assert.equal(offgridOperationReady.fieldGuaranteeReady, true);

const offgridRevalidationBlocked = buildOffgridFieldRevalidationGate(
  { registry: {} },
  { offgridL2Results: { fieldOperationGate: { phase5Ready: false } } },
  { today: '2026-04-13' }
);
assert.equal(offgridRevalidationBlocked.phase6Ready, false);
assert.ok(offgridRevalidationBlocked.blockers.some(item => item.includes('Faz 5')));

const offgridRevalidationReady = buildOffgridFieldRevalidationGate(
  offgridRegistry,
  { offgridL2Results: { fieldOperationGate: { phase5Ready: true }, generatorEnabled: true } },
  { today: '2026-04-13' }
);
assert.equal(offgridRevalidationReady.phase6Ready, true);
assert.equal(offgridRevalidationReady.fieldGuaranteeReady, true);
assert.ok(offgridRevalidationReady.requiredEvidenceKeys.includes('offgridGeneratorServiceRecord'));

const offgridRevalidationReadyWithoutGenerator = buildOffgridFieldRevalidationGate(
  offgridRegistry,
  { offgridL2Results: { fieldOperationGate: { phase5Ready: true }, generatorEnabled: false } },
  { today: '2026-04-13' }
);
assert.equal(offgridRevalidationReadyWithoutGenerator.phase6Ready, true);
assert.ok(offgridRevalidationReadyWithoutGenerator.skippedEvidenceKeys.includes('offgridGeneratorServiceRecord'));

const exported = buildStructuredProposalExport(
  { cityName: 'Ankara', tariffType: 'commercial', panelType: 'mono', inverterType: 'string' },
  {
    systemPower: 10,
    annualEnergy: 15000,
    totalCost: 1000000,
    quoteReadiness: { blockers: ['x'] },
    proposalGovernance: { confidence: { score: 70, level: 'engineering estimate' }, approval: { state: 'finance-review' } },
    tariffModel: { effectiveRegime: 'sktt', importRate: 8, exportRate: 2, sourceDate: '2026-04-12', sourceLabel: 'EPDK' }
  }
);
assert.equal(exported.schema, 'guneshesap.proposal-handoff.v2');
assert.equal(exported.customer.cityName, 'Ankara');
assert.equal(exported.commercial.confidenceScore, 70);
assert.ok(exported.financialSummary);

const offgridExported = buildStructuredProposalExport(
  { scenarioKey: 'off-grid', cityName: 'Ankara' },
  {
    offgridL2Results: {
      productionDispatchProfile: 'monthly-production-derived-synthetic-8760',
      productionDispatchMetadata: { hasRealHourlyProduction: false, synthetic: true },
      loadMode: 'device-list',
      dispatchType: 'synthetic-8760-dispatch',
      generatorEnabled: true,
      autonomousDays: 120,
      autonomousDaysPct: 32.9,
      autonomousDaysWithGenerator: 360,
      autonomousDaysWithGeneratorPct: 98.6,
      badWeatherScenario: {
        weatherLevel: 'moderate',
        criticalCoverageDropPct: 12.5,
        totalCoverageDropPct: 18.2,
        additionalGeneratorKwh: 240,
        windowCoverage: 0.72,
        windowCriticalCoverage: 0.91,
        worstWindowDayOfYear: 15
      },
      fieldGuaranteeReadiness: { status: 'blocked', phase1Ready: false, fieldGuaranteeReady: false, blockers: ['missing real PV'] },
      fieldEvidenceGate: { status: 'blocked', phase2Ready: false, fieldGuaranteeReady: false, blockers: ['missing evidence'] },
      fieldStressAnalysis: { version: 'test', scenarios: [{ key: 'combined-design-stress', totalLoadCoverage: 0.95, criticalLoadCoverage: 0.99, unmetLoadKwh: 10, unmetCriticalKwh: 1 }] },
      fieldModelMaturityGate: { status: 'blocked', phase3Ready: false, fieldGuaranteeReady: false, blockers: ['stress failed'] },
      fieldAcceptanceGate: { status: 'blocked', phase4Ready: false, fieldGuaranteeReady: false, blockers: ['acceptance missing'] },
      fieldOperationGate: { status: 'blocked', phase5Ready: false, fieldGuaranteeReady: false, blockers: ['operation missing'] },
      fieldRevalidationGate: { status: 'blocked', phase6Ready: false, fieldGuaranteeReady: false, blockers: ['revalidation missing'] },
      fieldGuaranteeCandidate: false,
      fieldGuaranteeReady: false
    },
    proposalGovernance: { confidence: { score: 50 } },
    tariffModel: {}
  }
);
assert.equal(offgridExported.offGridL2.productionDispatchProfile, 'monthly-production-derived-synthetic-8760');
assert.equal(offgridExported.offGridL2.productionDispatchMetadata.synthetic, true);
assert.equal(offgridExported.offGridL2.autonomousDays, 120);
assert.equal(offgridExported.offGridL2.autonomousDaysWithGenerator, 360);
assert.equal(offgridExported.offGridL2.badWeatherCriticalCoverageDropPct, 12.5);
assert.equal(offgridExported.offGridL2.badWeatherAdditionalGeneratorKwh, 240);
assert.equal(offgridExported.offGridL2.fieldGuaranteeReadiness.status, 'blocked');
assert.equal(offgridExported.offGridL2.fieldEvidenceGate.status, 'blocked');
assert.equal(offgridExported.offGridL2.fieldModelMaturityGate.status, 'blocked');
assert.equal(offgridExported.offGridL2.fieldAcceptanceGate.status, 'blocked');
assert.equal(offgridExported.offGridL2.fieldOperationGate.status, 'blocked');
assert.equal(offgridExported.offGridL2.fieldRevalidationGate.status, 'blocked');
assert.equal(offgridExported.offGridL2.fieldStressAnalysis.scenarios[0].key, 'combined-design-stress');
assert.equal(offgridExported.offGridL2.fieldGuaranteeReady, false);

console.log('evidence governance tests passed');
