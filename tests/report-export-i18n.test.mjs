import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { i18n } from '../js/i18n.js';

async function setLocale(lang) {
  i18n.locale = lang;
  i18n.translations = JSON.parse(await readFile(new URL(`../locales/${lang}.json`, import.meta.url), 'utf8'));
}

const reportBody = {
  innerHTML: '',
  innerText: '',
  classList: { contains: () => false, toggle: () => {}, remove: () => {} }
};

globalThis.document = {
  getElementById: id => id === 'eng-report-body' ? reportBody : null,
  querySelectorAll: () => [],
  querySelector: () => null,
  documentElement: { lang: 'tr' }
};
globalThis.window = {
  state: {},
  showToast: () => {},
  renderExchangeRateStatus: () => {}
};

const { renderEngReport } = await import('../js/eng-report.js');
const { buildStructuredProposalExport } = await import('../js/evidence-governance.js');
const { buildCrmLeadExport } = await import('../js/crm-export.js');
const { downloadPDF, downloadTechnicalPDF } = await import('../js/ui-render.js');

function yearlyTable() {
  return Array.from({ length: 25 }, (_, index) => ({
    year: index + 1,
    energy: 15000 - index * 40,
    rate: 3.5 + index * 0.1,
    savings: 50000 + index * 1000,
    expenses: 1500,
    netCashFlow: 48500 + index * 1000,
    cumulative: -350000 + index * 48500,
    npv: 45000 + index * 500
  }));
}

function sampleState() {
  return {
    cityName: 'Ankara',
    lat: 39.93,
    lon: 32.85,
    ghi: 1680,
    panelType: 'mono',
    inverterType: 'string',
    roofArea: 120,
    azimuth: 180,
    azimuthName: 'South',
    azimuthCoeff: 1,
    tilt: 30,
    shadingFactor: 8,
    soilingFactor: 3,
    dailyConsumption: 45,
    displayCurrency: 'TRY',
    usdToTry: 40,
    tariffType: 'commercial',
    subscriberType: 'commercial',
    connectionType: 'trifaze',
    usageProfile: 'business-hours',
    annualConsumptionKwh: 16425,
    designTarget: 'bill-offset',
    roofType: 'metal-trapez',
    usableRoofRatio: 0.7,
    shadingQuality: 'map-assisted',
    exportSettlementMode: 'monthly',
    settlementDate: '2026-04-01',
    authoritativeFinancialBasis: 'frontend-8760',
    netMeteringEnabled: true,
    omRate: 1,
    insuranceRate: 0.5,
    auditLog: [],
    scenarioKey: 'on-grid',
    scenarioContext: {
      label: 'On-Grid',
      nextAction: 'Validate evidence before approval.',
      resultFrame: 'Grid-connected savings and proposal readiness'
    },
    results: {
      annualEnergy: 15000,
      pvgisRawEnergy: 17000,
      pvgisPoa: 1800,
      systemPower: 10,
      panelCount: 24,
      inverterType: 'string',
      inverterEfficiency: 97,
      pvgisLossParam: 0,
      usedFallback: false,
      shadingLoss: 900,
      tempLossEnergy: 0,
      azimuthLossEnergy: 0,
      bifacialGainEnergy: 0,
      soilingLoss: 500,
      cableLossPct: 1.2,
      cableLoss: 180,
      effectiveShadingFactor: 8,
      pr: 82,
      psh: 4.4,
      ysp: 1500,
      cf: 17,
      irr: 14,
      lcoe: 2.1,
      tariff: 3.6,
      totalCost: 350000,
      annualSavings: 54000,
      simplePaybackYear: 6.4,
      discountedPaybackYear: 8.2,
      npvTotal: 220000,
      roi: 160,
      co2Savings: '7.5',
      annualOMCost: 3500,
      annualInsurance: 1200,
      totalExpenses25y: 140000,
      inverterReplaceCost: 40000,
      inverterLifetime: 12,
      discountRate: 0.12,
      annualPriceIncrease: 0.25,
      expenseEscalationRate: 0.15,
      lidFactor: 2,
      paybackYear: 7,
      methodologyVersion: 'GH-CALC-2026.04',
      calculationMode: 'backend-pvlib',
      confidenceLevel: 'high',
      sourceQualityNote: 'validated',
      authoritativeEngineMode: 'backend',
      authoritativeEngineFallbackReason: 'PVGIS canlı veri yok; fallback üretim quote-ready kabul edilmez.',
      authoritativeEngineSource: {
        provider: 'backend',
        source: 'pvlib',
        pvlibBacked: true,
        engineQuality: 'high'
      },
      authoritativeProduction: {
        annualEnergyKwh: 15000,
        monthlyEnergyKwh: yearlyTable().slice(0, 12).map((_, index) => 1250 + index),
        systemPowerKwp: 10,
        panelCount: 24,
        source: 'pvlib'
      },
      engineParity: {
        authoritativeSource: 'pvlib',
        comparisonSource: 'browser-pvgis',
        localAnnualEnergyKwh: 14500,
        authoritativeAnnualEnergyKwh: 15000,
        deltaKwh: 500,
        deltaPct: 3.45,
        intentionalDifference: true
      },
      costBreakdown: {
        panel: 86000,
        inverter: 50000,
        mounting: 22000,
        dcCable: 6000,
        acElec: 9000,
        labor: 18000,
        permits: 10000,
        subtotal: 201000,
        kdv: 40200,
        kdvRate: 0.2,
        total: 241200,
        invUnit: 5000
      },
      yearlyTable: yearlyTable(),
      tariffModel: {
        type: 'commercial',
        effectiveRegime: 'PST',
        importRate: 3.6,
        exportRate: 1.2,
        sourceDate: '2026-01-01',
        sourceLabel: 'Tariff source',
        regulation: {
          effectiveRegimeBasis: 'activation-date-reached',
          activationDate: '2026-04-01',
          evaluationDate: '2026-04-19'
        },
        exportCompensationPolicy: { version: 'TR-REG-2026.04', interval: 'monthly' }
      },
      hourlySummary: { annualLoad: 16425 },
      nmMetrics: {
        selfConsumedEnergy: 12000,
        directSelfConsumedEnergy: 9000,
        importOffsetEnergy: 2500,
        compensableSurplus: 1800,
        paidGridExport: 1500,
        annualGridExport: 3000,
        annualExportRevenue: 1800,
        selfConsumptionPct: 80,
        unpaidGridExport: 1500,
        systemType: 'monthly-aggregation'
      },
      settlementProvisional: false,
      settlementAssumptionBasis: null,
      compensationSummary: {
        directSelfConsumptionKwh: 9000,
        importOffsetKwh: 2500,
        paidExportKwh: 1500,
        unpaidExportKwh: 1500,
        compensatedConsumptionEnergy: 11500
      },
      proposalGovernance: {
        confidence: { score: 62, level: 'medium' },
        approval: {
          state: 'draft',
          blockers: ['Proposal ticari temeli değişti; mevcut onay geçersiz, yeni revizyon/onay gerekli.']
        },
        gridChecklistComplete: false,
        financing: {},
        maintenance: {},
        revision: { id: 'rev-1', diff: [] },
        ledger: { entries: [] }
      },
      quoteReadiness: {
        status: 'not-quote-ready',
        version: 'TR-REG-2026.04',
        blockers: ['PVGIS canlı veri yok; fallback üretim quote-ready kabul edilmez.']
      },
      evidenceGovernance: {
        registry: {},
        validation: {
          status: 'incomplete',
          blockers: ['supplierQuote: doğrulanmış kanıt yok.'],
          warnings: ['supplierQuote: geçerlilik tarihi yok; marj ve satış fiyatı riskli.']
        }
      },
      tariffSourceGovernance: {
        sourceLabel: 'Tariff source',
        ageDays: 50,
        stale: true,
        warning: 'Tarife kaynak kontrol tarihi 45 günden eski veya eksik.'
      }
    }
  };
}

await setLocale('en');
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(indexHtml, /id="on-grid-flow-panel"/);
assert.match(indexHtml, /id="on-grid-subscriber-type"/);
assert.match(indexHtml, /id="on-grid-usage-profile"/);
assert.match(indexHtml, /id="on-grid-design-target"/);
assert.match(indexHtml, /id="on-grid-result-layers"/);
assert.match(indexHtml, /data-i18n="onGridFlow\.title"/);
assert.match(indexHtml, /data-i18n="onGridFlow\.profileBusiness"/);
assert.equal(i18n.t('finance.simplePayback'), 'Cumulative Net Payback Period');
assert.equal(i18n.t('report.simplePayback'), 'Cumulative Net Payback');
assert.doesNotMatch(i18n.t('finance.simplePayback'), /Simple Payback/);
window.state = sampleState();
renderEngReport();
assert.match(reportBody.innerHTML, /Panel and System Design/);
assert.match(reportBody.innerHTML, /Panel area = width/);
assert.match(reportBody.innerHTML, /Inverter AC output efficiency/);
assert.match(reportBody.innerHTML, /The usable-area factor is a pre-feasibility assumption/);
assert.match(reportBody.innerHTML, /Cost Breakdown/);
assert.match(reportBody.innerHTML, /PVGIS live data is unavailable/);
assert.match(reportBody.innerHTML, /Instant self-consumption/);
assert.match(reportBody.innerHTML, /Settlement import offset/);
assert.doesNotMatch(reportBody.innerHTML, /Panel &amp; Sistem Tasarımı/);
assert.doesNotMatch(reportBody.innerHTML, /Maliyet Kırılımı/);
assert.doesNotMatch(reportBody.innerHTML, /Kullanılabilir çatı alanı/);
assert.doesNotMatch(reportBody.innerHTML, /İnverter AC çıkış verimi/);
assert.equal(i18n.t('onGridFlow.title'), 'Customer, consumption, and settlement basis');
assert.equal(i18n.t('onGridFlow.profileBusiness'), 'Business-hours focused');
assert.equal(i18n.t('onGridResult.confidenceTitle'), 'Calculation Confidence / Assumptions');
const onGridProposalEn = buildStructuredProposalExport(window.state, window.state.results);
assert.equal(onGridProposalEn.onGridFlow.subscriberType, 'commercial');
assert.equal(onGridProposalEn.onGridFlow.usageProfile, 'business-hours');
assert.equal(onGridProposalEn.onGridFlow.designTarget, 'bill-offset');
assert.equal(onGridProposalEn.onGridFlow.authoritativeFinancialBasis, 'frontend-8760-financial-model');
assert.equal(onGridProposalEn.onGridFlow.settlementProvisional, false);
assert.equal(onGridProposalEn.onGridFlow.compensationSummary.importOffsetKwh, 2500);
assert.equal(onGridProposalEn.tariff.regimeBasis, 'activation-date-reached');
assert.equal(onGridProposalEn.tariff.skttActivationDate, '2026-04-01');
assert.equal(onGridProposalEn.tariff.tariffEvaluationDate, '2026-04-19');

const offGridState = sampleState();
offGridState.scenarioKey = 'off-grid';
offGridState.netMeteringEnabled = false;
offGridState.battery = { capacity: 9.6, dod: 0.9 };
offGridState.scenarioContext = {
  label: 'Off-Grid',
  nextAction: 'Validate autonomy with field evidence.',
  resultFrame: 'Off-grid pre-feasibility sizing'
};
offGridState.results = {
  ...offGridState.results,
  financialSavingsRate: 19.5,
  financialSavingsBasis: 'off-grid-user-alternative-energy-cost',
  tariffModel: { ...offGridState.results.tariffModel, exportRate: 1.2 },
  nmMetrics: { ...offGridState.results.nmMetrics, paidGridExport: 0, annualExportRevenue: 0 },
  bessMetrics: {
    modelName: 'LFP',
    dailyProduction: 41.1,
    usableCapacity: 8.6,
    gridIndependence: '78.0',
    nightCoverage: '62.0',
    batteryCost: 120000
  },
  generatorCapex: 65000,
  offgridL2Results: {
    productionSource: 'PVGIS-based',
    productionSourceLabel: 'PVGIS Live',
    productionFallback: false,
    productionDispatchProfile: 'real-hourly-pv-8760',
    productionDispatchMetadata: { hasRealHourlyProduction: true, synthetic: false },
    loadSource: 'hourly-uploaded',
    loadMode: 'hourly-8760',
    dispatchType: 'hourly-8760-dispatch',
    fieldDataState: 'field-input-ready',
    dataLineage: {
      version: 'GH-OFFGRID-LINEAGE-2026.04-v1',
      fieldDataState: 'field-input-ready',
      production: { realHourly: true, fallback: false, dispatchProfile: 'real-hourly-pv-8760' },
      load: { realHourly: true, mode: 'hourly-8760' },
      criticalLoad: { realHourly: false },
      economics: { financialSavingsBasis: 'off-grid-user-alternative-energy-cost' },
      gates: { phase1Ready: true, phase2Ready: false, phase3Ready: false, phase4Ready: false, phase5Ready: false, phase6Ready: false }
    },
    generatorEnabled: true,
    generatorCapacityKw: 5,
    generatorEnergyKwh: 900,
    generatorKwh: 900,
    generatorFuelCostAnnual: 7200,
    generatorCapex: 65000,
    generatorCapexMissing: false,
    pvBatteryLoadCoverage: 0.72,
    pvBatteryCriticalCoverage: 0.91,
    totalLoadCoverage: 0.96,
    criticalLoadCoverage: 0.99,
    criticalCoverageWithGenerator: 0.99,
    criticalCoverageWithoutGenerator: 0.91,
    minimumSoc: 0.1,
    averageSoc: 0.48,
    batteryMaxChargeKw: 4,
    batteryMaxDischargeKw: 4,
    inverterAcLimitKw: 5,
    inverterSurgeMultiplier: 1.25,
    inverterPowerLimitedKwh: 120,
    batteryChargeLimitedKwh: 50,
    batteryDischargeLimitedKwh: 70,
    unmetLoadKwh: 250,
    unmetCriticalKwh: 20,
    curtailedPvKwh: 600,
    weatherScenario: 'moderate',
    methodologyNote: 'hourly-load-dispatch-pre-feasibility',
    provisional: true,
    synthetic: false,
    feasibilityNotGuaranteed: true,
    fieldStressAnalysis: {
      worstCriticalScenario: { key: 'combined-design-stress', label: 'Combined design stress', criticalLoadCoverage: 0.88, unmetCriticalKwh: 110 },
      worstTotalScenario: { key: 'load-growth', label: 'Load growth', totalLoadCoverage: 0.84, unmetLoadKwh: 640 },
      maxUnmetCriticalScenario: { key: 'combined-design-stress', label: 'Combined design stress', criticalLoadCoverage: 0.88, unmetCriticalKwh: 110 }
    },
    dispatchVersion: 'OGD-2026.04-v1.1'
  }
};
window.state = offGridState;
renderEngReport();
assert.match(reportBody.innerHTML, /real hourly PV 8760/i);
assert.match(reportBody.innerHTML, /surplus PV is not monetized/);
assert.match(reportBody.innerHTML, /synthetic 8760 dispatch pre-check/);
assert.match(reportBody.innerHTML, /PV\+BESS total coverage/);
assert.match(reportBody.innerHTML, /Generator CAPEX/);
assert.match(reportBody.innerHTML, /Weakest critical-load scenario/i);
assert.doesNotMatch(reportBody.innerHTML, /Grid Export \/ Settlement/);
assert.doesNotMatch(reportBody.innerHTML, /Annual export/);

const proposalEn = buildStructuredProposalExport(window.state, window.state.results);
assert.equal(proposalEn.display.language, 'en');
assert.equal(proposalEn.display.productName, 'Solar Rota');
assert.equal(proposalEn.display.title, 'Proposal handoff summary');
assert.match(proposalEn.display.blockers.join(' '), /PVGIS live data is unavailable/);
assert.match(proposalEn.display.approvalBlockers.join(' '), /commercial basis changed/);
assert.match(proposalEn.display.evidenceBlockers.join(' '), /Supplier quote: no verified evidence/);
assert.doesNotMatch(proposalEn.display.evidenceBlockers.join(' '), /supplierQuote/);
assert.deepEqual(proposalEn.blockers, window.state.results.quoteReadiness.blockers);
assert.equal(proposalEn.system.authoritativeProduction.annualEnergyKwh, 15000);
assert.equal(proposalEn.system.productionParity.deltaKwh, 500);
assert.equal(proposalEn.tariff.exportRate, 0);
assert.equal(proposalEn.financialSummary.financialSavingsBasis, 'off-grid-user-alternative-energy-cost');
assert.equal(proposalEn.offGridL2.loadMode, 'hourly-8760');
assert.equal(proposalEn.offGridL2.dispatchType, 'hourly-8760-dispatch');
assert.equal(proposalEn.offGridL2.generatorCapex, 65000);
assert.equal(proposalEn.offGridL2.pvBatteryLoadCoverage, 0.72);
assert.equal(proposalEn.offGridL2.inverterAcLimitKw, 5);
assert.equal(proposalEn.offGridL2.fieldDataState, 'field-input-ready');
assert.equal(proposalEn.offGridL2.dataLineage.production.realHourly, true);
assert.equal(proposalEn.system.dataLineage.fieldDataState, 'field-input-ready');

const crmEn = buildCrmLeadExport(window.state, window.state.results);
assert.equal(crmEn.display.language, 'en');
assert.equal(crmEn.display.productName, 'Solar Rota');
assert.equal(crmEn.display.quoteReadiness, 'Not quote-ready');
assert.match(crmEn.display.blockers.join(' '), /PVGIS live data is unavailable/);
assert.deepEqual(crmEn.qualification.blockers, window.state.results.quoteReadiness.blockers);
assert.equal(crmEn.qualification.offgridFieldDataState, 'field-input-ready');

const pdfText = [];
class FakePdf {
  setFillColor() {}
  rect() {}
  setTextColor() {}
  setFontSize() {}
  setFont() {}
  text(value) { pdfText.push(Array.isArray(value) ? value.join(' ') : String(value)); }
  setDrawColor() {}
  setLineWidth() {}
  line() {}
  addPage() {}
  save(value) { pdfText.push(`save:${value}`); }
}
window.jspdf = { jsPDF: FakePdf };
window.showToast = message => pdfText.push(`toast:${message}`);
downloadPDF();
assert.ok(pdfText.some(value => value.includes('Turkey Solar Energy and Investment Report')));
assert.ok(pdfText.some(value => value.includes('System Design')));
assert.ok(!pdfText.some(value => value.includes('Türkiye Güneş Paneli Enerji ve Yatırım Raporu')));

pdfText.length = 0;
reportBody.innerText = 'Authoritative Production Engine\nPanel and System Design\nPanel area = width × height';
downloadTechnicalPDF();
assert.ok(pdfText.some(value => value.includes('Solar Rota Technical Calculation Report')));
assert.ok(pdfText.some(value => value.includes('PDF uses a built-in font fallback')));
assert.ok(pdfText.some(value => value.includes('Panel area = width')));

await setLocale('de');
window.state = sampleState();
renderEngReport();
assert.match(reportBody.innerHTML, /Panel- und Systemauslegung/);
assert.match(reportBody.innerHTML, /Panelfläche = Breite/);
assert.match(reportBody.innerHTML, /AC-Ausgangswirkungsgrad/);
assert.doesNotMatch(reportBody.innerHTML, /Kullanılabilir çatı alanı/);
const proposalDe = buildStructuredProposalExport(window.state, window.state.results);
assert.equal(proposalDe.display.language, 'de');
assert.equal(proposalDe.display.title, 'Zusammenfassung für die Angebotsübergabe');
assert.match(proposalDe.display.blockers.join(' '), /PVGIS-Livedaten/);
assert.match(proposalDe.display.evidenceWarnings.join(' '), /Gültigkeitsdatum fehlt/);
assert.match(proposalDe.display.evidenceBlockers.join(' '), /Lieferantenangebot: kein verifizierter Nachweis/);

await setLocale('tr');
window.state = sampleState();
pdfText.length = 0;
downloadPDF();
assert.ok(pdfText.some(value => value.includes('PDF yerlesik font fallback')));
assert.ok(pdfText.some(value => value.includes('Turkiye Gunes Paneli Enerji ve Yatirim Raporu')));
assert.ok(pdfText.some(value => value.includes('Solar Rota')));

// --- New i18n key existence tests ---
await setLocale('en');
// onGridFlow new keys
assert.ok(i18n.t('onGridFlow.tariffInputMode') !== 'onGridFlow.tariffInputMode', 'tariffInputMode key missing in en');
assert.ok(i18n.t('onGridFlow.tariffInputModeNet') !== 'onGridFlow.tariffInputModeNet', 'tariffInputModeNet key missing in en');
assert.ok(i18n.t('onGridFlow.tariffInputModeGross') !== 'onGridFlow.tariffInputModeGross', 'tariffInputModeGross key missing in en');
assert.ok(i18n.t('onGridFlow.hourlyUpload') !== 'onGridFlow.hourlyUpload', 'hourlyUpload key missing in en');
assert.ok(i18n.t('onGridFlow.tariffSourceType') !== 'onGridFlow.tariffSourceType', 'tariffSourceType key missing in en');
assert.ok(i18n.t('onGridFlow.tariffSourceOfficial') !== 'onGridFlow.tariffSourceOfficial', 'tariffSourceOfficial key missing in en');
assert.ok(i18n.t('onGridFlow.costSourceType') !== 'onGridFlow.costSourceType', 'costSourceType key missing in en');
assert.ok(i18n.t('onGridFlow.costSourceBom') !== 'onGridFlow.costSourceBom', 'costSourceBom key missing in en');
// onGridResult new keys
assert.ok(i18n.t('onGridResult.profileSourceLabel') !== 'onGridResult.profileSourceLabel', 'profileSourceLabel key missing in en');
assert.ok(i18n.t('onGridResult.profileSourceSynthetic') !== 'onGridResult.profileSourceSynthetic', 'profileSourceSynthetic key missing in en');
assert.ok(i18n.t('onGridResult.profileSourceHourly') !== 'onGridResult.profileSourceHourly', 'profileSourceHourly key missing in en');
assert.ok(i18n.t('onGridResult.shadowQualityLabel') !== 'onGridResult.shadowQualityLabel', 'shadowQualityLabel key missing in en');
assert.ok(i18n.t('onGridResult.costConfidenceLabel') !== 'onGridResult.costConfidenceLabel', 'costConfidenceLabel key missing in en');
assert.ok(i18n.t('onGridResult.dataSourceQuestion') !== 'onGridResult.dataSourceQuestion', 'dataSourceQuestion key missing in en');
assert.ok(i18n.t('onGridResult.missingDataQuestion') !== 'onGridResult.missingDataQuestion', 'missingDataQuestion key missing in en');
// warnings new keys
assert.ok(i18n.t('warnings.syntheticConsumptionProfile') !== 'warnings.syntheticConsumptionProfile', 'syntheticConsumptionProfile key missing in en');
assert.ok(i18n.t('warnings.noBomCostEvidence') !== 'warnings.noBomCostEvidence', 'noBomCostEvidence key missing in en');
assert.ok(i18n.t('warnings.shadowQualityLow') !== 'warnings.shadowQualityLow', 'shadowQualityLow key missing in en');

// Same checks in TR
await setLocale('tr');
assert.ok(i18n.t('onGridFlow.tariffInputMode') !== 'onGridFlow.tariffInputMode', 'tariffInputMode key missing in tr');
assert.ok(i18n.t('onGridResult.profileSourceSynthetic') !== 'onGridResult.profileSourceSynthetic', 'profileSourceSynthetic key missing in tr');
assert.ok(i18n.t('warnings.syntheticConsumptionProfile') !== 'warnings.syntheticConsumptionProfile', 'syntheticConsumptionProfile key missing in tr');

// Same checks in DE
await setLocale('de');
assert.ok(i18n.t('onGridFlow.tariffInputMode') !== 'onGridFlow.tariffInputMode', 'tariffInputMode key missing in de');
assert.ok(i18n.t('onGridResult.profileSourceSynthetic') !== 'onGridResult.profileSourceSynthetic', 'profileSourceSynthetic key missing in de');
assert.ok(i18n.t('warnings.syntheticConsumptionProfile') !== 'warnings.syntheticConsumptionProfile', 'syntheticConsumptionProfile key missing in de');

// New HTML fields exist in index.html
assert.match(indexHtml, /id="tariff-input-mode"/, 'tariff-input-mode select missing from index.html');
assert.match(indexHtml, /id="hourly-csv-upload"/, 'hourly-csv-upload input missing from index.html');
assert.match(indexHtml, /id="tariff-source-type"/, 'tariff-source-type select missing from index.html');
assert.match(indexHtml, /id="cost-source-type"/, 'cost-source-type select missing from index.html');

// Proposal export includes new metadata fields
await setLocale('en');
window.state = sampleState();
window.state.tariffInputMode = 'net-plus-fee';
window.state.tariffSourceType = 'official';
window.state.costSourceType = 'bom-verified';
window.state.hourlyProfileSource = 'hourly-uploaded';
window.state.shadingQuality = 'site-verified';
const proposalWithNewMeta = buildStructuredProposalExport(window.state, window.state.results);
assert.equal(proposalWithNewMeta.system.tariffInputMode, 'net-plus-fee', 'tariffInputMode not in proposal export');
assert.equal(proposalWithNewMeta.system.tariffSourceType, 'official', 'tariffSourceType not in proposal export');
assert.equal(proposalWithNewMeta.system.costSourceType, 'bom-verified', 'costSourceType not in proposal export');
assert.equal(proposalWithNewMeta.system.hourlyProfileSource, 'hourly-uploaded', 'hourlyProfileSource not in proposal export');
assert.equal(proposalWithNewMeta.system.shadowQuality, 'site-verified', 'shadowQuality not in proposal export');

// --- Turn-2 i18n key existence tests ---
await setLocale('en');
assert.ok(i18n.t('engine.comparisonUnavailable') !== 'engine.comparisonUnavailable', 'EN: engine.comparisonUnavailable missing');
assert.ok(i18n.t('engine.comparisonUnavailableHint') !== 'engine.comparisonUnavailableHint', 'EN: engine.comparisonUnavailableHint missing');
assert.ok(i18n.t('offGrid.syntheticDispatchNote') !== 'offGrid.syntheticDispatchNote', 'EN: offGrid.syntheticDispatchNote missing');
assert.ok(i18n.t('offGrid.notFeasibilityAnalysis') !== 'offGrid.notFeasibilityAnalysis', 'EN: offGrid.notFeasibilityAnalysis missing');
assert.ok(i18n.t('offGrid.preFeasibilityOnly') !== 'offGrid.preFeasibilityOnly', 'EN: offGrid.preFeasibilityOnly missing');
assert.ok(i18n.t('offgridL2.loadSourceHourly') !== 'offgridL2.loadSourceHourly', 'EN: offgridL2.loadSourceHourly missing');
assert.ok(i18n.t('offgridL2.pvBessCoverageLabel') !== 'offgridL2.pvBessCoverageLabel', 'EN: offgridL2.pvBessCoverageLabel missing');
assert.ok(i18n.t('offgridL2.generatorCapex') !== 'offgridL2.generatorCapex', 'EN: offgridL2.generatorCapex missing');
assert.ok(i18n.t('onGridResult.parityLabel') !== 'onGridResult.parityLabel', 'EN: onGridResult.parityLabel missing');
assert.ok(i18n.t('onGridResult.parityUnavailable') !== 'onGridResult.parityUnavailable', 'EN: onGridResult.parityUnavailable missing');

await setLocale('tr');
assert.ok(i18n.t('engine.comparisonUnavailable') !== 'engine.comparisonUnavailable', 'TR: engine.comparisonUnavailable missing');
assert.ok(i18n.t('offGrid.syntheticDispatchNote') !== 'offGrid.syntheticDispatchNote', 'TR: offGrid.syntheticDispatchNote missing');
assert.ok(i18n.t('offGrid.preFeasibilityOnly') !== 'offGrid.preFeasibilityOnly', 'TR: offGrid.preFeasibilityOnly missing');
assert.ok(i18n.t('offgridL2.loadSourceHourly') !== 'offgridL2.loadSourceHourly', 'TR: offgridL2.loadSourceHourly missing');
assert.ok(i18n.t('offgridL2.pvBessCoverageLabel') !== 'offgridL2.pvBessCoverageLabel', 'TR: offgridL2.pvBessCoverageLabel missing');
assert.ok(i18n.t('onGridResult.parityUnavailable') !== 'onGridResult.parityUnavailable', 'TR: onGridResult.parityUnavailable missing');

await setLocale('de');
assert.ok(i18n.t('engine.comparisonUnavailable') !== 'engine.comparisonUnavailable', 'DE: engine.comparisonUnavailable missing');
assert.ok(i18n.t('offGrid.syntheticDispatchNote') !== 'offGrid.syntheticDispatchNote', 'DE: offGrid.syntheticDispatchNote missing');
assert.ok(i18n.t('offGrid.preFeasibilityOnly') !== 'offGrid.preFeasibilityOnly', 'DE: offGrid.preFeasibilityOnly missing');
assert.ok(i18n.t('offgridL2.loadSourceHourly') !== 'offgridL2.loadSourceHourly', 'DE: offgridL2.loadSourceHourly missing');
assert.ok(i18n.t('offgridL2.pvBessCoverageLabel') !== 'offgridL2.pvBessCoverageLabel', 'DE: offgridL2.pvBessCoverageLabel missing');

// parityAvailable boolean in buildStructuredProposalExport
await setLocale('en');
window.state = sampleState();
// With intentionalDifference=true in fixture — should be true
const exportWithParity = buildStructuredProposalExport(window.state, window.state.results);
assert.strictEqual(typeof exportWithParity.system.parityAvailable, 'boolean', 'parityAvailable must be boolean');
assert.strictEqual(exportWithParity.system.parityAvailable, true, 'parityAvailable should be true when intentionalDifference=true');
assert.strictEqual(exportWithParity.system.parityDeltaPct, 3.45, 'parityDeltaPct should equal deltaPct from fixture');

// Without engineParity — should be false
const stateNoParity = sampleState();
stateNoParity.results = { ...stateNoParity.results, engineParity: null };
const exportNoParity = buildStructuredProposalExport(stateNoParity, stateNoParity.results);
assert.strictEqual(exportNoParity.system.parityAvailable, false, 'parityAvailable should be false when engineParity is null');
assert.strictEqual(exportNoParity.system.parityDeltaPct, null, 'parityDeltaPct should be null when no parity');

console.log('report/export i18n tests passed');
