// Proposal governance, confidence, revision, and commercial workflow helpers.
import { hasMeaningfulConsumptionEvidence } from './consumption-evidence.js';
import { canApproveProposal, describeApprover, normalizeUserIdentity } from './identity.js';

export const PROPOSAL_GOVERNANCE_VERSION = 'GH-PROP-2026.04-v1';

const APPROVAL_STATES = new Set(['draft', 'engineering-review', 'finance-review', 'approved', 'rejected']);

function nowIso() {
  return new Date().toISOString();
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(value, fallback = 0) {
  return Math.max(-1, Math.min(5, finiteNumber(value, fallback)));
}

function stableNormalize(value) {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stableNormalize(value[key])])
    );
  }
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
  if (value === undefined) return null;
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableNormalize(value));
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createApprovalBasisSnapshot(state = {}) {
  const results = state.results || {};
  return {
    version: PROPOSAL_GOVERNANCE_VERSION,
    design: {
      cityName: state.cityName || null,
      lat: state.lat ?? null,
      lon: state.lon ?? null,
      roofArea: state.roofArea ?? null,
      roofSections: state.roofSections || null,
      roofGeometry: state.roofGeometry || null,
      panelType: state.panelType || null,
      inverterType: state.inverterType || null,
      targetSystemPowerKwp: state.targetSystemPowerKwp ?? state.systemPowerKwp ?? null,
      batteryEnabled: !!state.batteryEnabled,
      battery: state.battery || null
    },
    tariff: {
      tariffType: state.tariffType || null,
      tariffMode: state.tariffMode || null,
      tariffRegime: state.tariffRegime || null,
      tariff: state.tariff ?? null,
      exportTariff: state.exportTariff ?? null,
      exportSettlementMode: state.exportSettlementMode || null,
      settlementDate: state.settlementDate || null,
      previousYearConsumptionKwh: state.previousYearConsumptionKwh ?? null,
      currentYearConsumptionKwh: state.currentYearConsumptionKwh ?? null,
      sellableExportCapKwh: state.sellableExportCapKwh ?? null,
      tariffSourceDate: state.tariffSourceDate || null,
      tariffSourceCheckedAt: state.tariffSourceCheckedAt || null
    },
    commercial: {
      costOverridesEnabled: !!state.costOverridesEnabled,
      costOverrides: state.costOverrides || null,
      bomSelection: state.bomSelection || null,
      bomCommercials: state.bomCommercials || null,
      displayCurrency: state.displayCurrency || 'TRY',
      usdToTry: state.usdToTry ?? null
    },
    evidence: state.evidence || null,
    result: {
      panelCount: results.panelCount ?? null,
      systemPower: results.systemPower ?? null,
      annualEnergy: results.annualEnergy ?? null,
      totalCost: results.totalCost ?? null,
      financialCostBasis: results.financialCostBasis ?? null,
      annualSavings: results.annualSavings ?? null,
      npvTotal: results.npvTotal ?? null,
      roi: results.roi ?? null,
      usedFallback: !!results.usedFallback,
      calculationMode: results.calculationMode || null,
      tariffEffectiveRegime: results.tariffModel?.effectiveRegime || null,
      exportPolicy: results.hourlySummary?.exportPolicy || results.tariffModel?.exportCompensationPolicy || null,
      bomSubtotal: results.costBreakdown?.bom?.subtotal ?? null,
      kdv: results.costBreakdown?.kdv ?? null
    }
  };
}

export function createApprovalBasisHash(state = {}) {
  return hashString(stableStringify(createApprovalBasisSnapshot(state)));
}

export function createAssumptionLedger(state = {}, results = {}) {
  const tariff = results.tariffModel || {};
  const exchange = state.exchangeRate || {};
  const evidence = results.evidenceGovernance?.registry || {};
  const offgridFieldGate = results.offgridL2Results?.fieldEvidenceGate || {};
  const offgridModelGate = results.offgridL2Results?.fieldModelMaturityGate || {};
  const offgridAcceptanceGate = results.offgridL2Results?.fieldAcceptanceGate || {};
  const offgridOperationGate = results.offgridL2Results?.fieldOperationGate || {};
  const offgridRevalidationGate = results.offgridL2Results?.fieldRevalidationGate || {};
  const productionSource = results.authoritativeProduction?.source
    || results.authoritativeEngineSource?.source
    || results.engineSource?.source
    || results.calculationMode
    || (results.usedFallback ? 'fallback-psh' : 'pvgis-live');
  const productionConfidence = results.authoritativeEngineSource?.confidence
    || (results.authoritativeEngineSource?.pvlibBacked ? 'medium-high' : results.usedFallback ? 'low' : 'medium');
  const productionSourceLabel = results.authoritativeEngineSource?.provider
    || results.pvgisSourceLabel
    || (results.usedFallback ? 'Local PSH fallback' : 'PVGIS API');
  return {
    version: PROPOSAL_GOVERNANCE_VERSION,
    generatedAt: nowIso(),
    entries: [
      {
        key: 'production.dataSource',
        value: productionSource,
        confidence: productionConfidence,
        sourceLabel: productionSourceLabel,
        sourceDate: results.usedFallback ? results.methodologyVersion : tariff.sourceDate || null
      },
      {
        key: 'tariff.regime',
        value: tariff.effectiveRegime || 'unknown',
        confidence: evidence.tariffSource?.status === 'verified' && !results.tariffSourceGovernance?.stale ? 'high' : 'low',
        sourceLabel: tariff.sourceLabel || 'Manual tariff input',
        sourceDate: tariff.sourceDate || null
      },
      {
        key: 'export.compensation',
        value: tariff.exportCompensationPolicy?.interval || 'unknown',
        confidence: evidence.regulationSource?.status === 'verified' ? 'medium' : 'low',
        sourceLabel: tariff.exportCompensationPolicy?.capBasis || 'unknown',
        sourceDate: tariff.exportCompensationPolicy?.settlementDate || null
      },
      {
        key: 'evidence.customerBill',
        value: evidence.customerBill?.status || 'missing',
        confidence: evidence.customerBill?.status === 'verified' ? 'high' : 'low',
        sourceLabel: evidence.customerBill?.ref || 'missing',
        sourceDate: evidence.customerBill?.checkedAt || evidence.customerBill?.issuedAt || null
      },
      {
        key: 'currency.usdTry',
        value: finiteNumber(state.usdToTry, results.usdToTry || 0),
        confidence: exchange.source && exchange.source !== 'manual/fallback' ? 'medium' : 'low',
        sourceLabel: exchange.source || 'manual/fallback',
        sourceDate: exchange.fetchedAt || null
      },
      {
        key: 'bom.commercials',
        value: state.bomCommercials?.supplierQuoteState || 'not-requested',
        confidence: state.bomCommercials?.supplierQuoteState === 'received' ? 'high' : 'low',
        sourceLabel: state.bomCommercials?.supplierQuoteRef || 'BOM fixture/manual',
        sourceDate: state.bomCommercials?.supplierQuoteDate || null
      },
      {
        key: 'approval.state',
        value: state.proposalApproval?.state || 'draft',
        confidence: state.proposalApproval?.state === 'approved' ? 'high' : 'low',
        sourceLabel: state.proposalApproval?.approvedBy || 'not-approved',
        sourceDate: state.proposalApproval?.approvedAt || null
      },
      ...(state.scenarioKey === 'off-grid' ? [
        {
          key: 'offgrid.fieldEvidenceGate',
          value: offgridFieldGate.status || 'not-evaluated',
          confidence: offgridFieldGate.phase2Ready ? 'medium' : 'low',
          sourceLabel: offgridFieldGate.version || 'missing',
          sourceDate: null
        },
        {
          key: 'offgrid.fieldModelMaturityGate',
          value: offgridModelGate.status || 'not-evaluated',
          confidence: offgridModelGate.phase3Ready ? 'medium' : 'low',
          sourceLabel: offgridModelGate.version || 'missing',
          sourceDate: null
        },
        {
          key: 'offgrid.fieldAcceptanceGate',
          value: offgridAcceptanceGate.status || 'not-evaluated',
          confidence: offgridAcceptanceGate.phase4Ready ? 'high' : 'low',
          sourceLabel: offgridAcceptanceGate.version || 'missing',
          sourceDate: null
        },
        {
          key: 'offgrid.fieldOperationGate',
          value: offgridOperationGate.status || 'not-evaluated',
          confidence: offgridOperationGate.phase5Ready ? 'high' : 'low',
          sourceLabel: offgridOperationGate.version || 'missing',
          sourceDate: null
        },
        {
          key: 'offgrid.fieldRevalidationGate',
          value: offgridRevalidationGate.status || 'not-evaluated',
          confidence: offgridRevalidationGate.phase6Ready ? 'high' : 'low',
          sourceLabel: offgridRevalidationGate.version || 'missing',
          sourceDate: null
        },
        {
          key: 'offgrid.pv8760Evidence',
          value: evidence.offgridPvProduction?.status || 'missing',
          confidence: evidence.offgridPvProduction?.status === 'verified' ? 'medium' : 'low',
          sourceLabel: evidence.offgridPvProduction?.ref || 'missing',
          sourceDate: evidence.offgridPvProduction?.checkedAt || null
        },
        {
          key: 'offgrid.load8760Evidence',
          value: evidence.offgridLoadProfile?.status || 'missing',
          confidence: evidence.offgridLoadProfile?.status === 'verified' ? 'medium' : 'low',
          sourceLabel: evidence.offgridLoadProfile?.ref || 'missing',
          sourceDate: evidence.offgridLoadProfile?.checkedAt || null
        },
        {
          key: 'offgrid.criticalLoad8760Evidence',
          value: evidence.offgridCriticalLoadProfile?.status || 'missing',
          confidence: evidence.offgridCriticalLoadProfile?.status === 'verified' ? 'medium' : 'low',
          sourceLabel: evidence.offgridCriticalLoadProfile?.ref || 'missing',
          sourceDate: evidence.offgridCriticalLoadProfile?.checkedAt || null
        },
        {
          key: 'offgrid.siteShadingEvidence',
          value: evidence.offgridSiteShading?.status || 'missing',
          confidence: evidence.offgridSiteShading?.status === 'verified' ? 'medium' : 'low',
          sourceLabel: evidence.offgridSiteShading?.ref || 'missing',
          sourceDate: evidence.offgridSiteShading?.checkedAt || null
        },
        {
          key: 'offgrid.equipmentDatasheetEvidence',
          value: evidence.offgridEquipmentDatasheets?.status || 'missing',
          confidence: evidence.offgridEquipmentDatasheets?.status === 'verified' ? 'medium' : 'low',
          sourceLabel: evidence.offgridEquipmentDatasheets?.ref || 'missing',
          sourceDate: evidence.offgridEquipmentDatasheets?.checkedAt || null
        }
      ] : [])
    ]
  };
}

export function calculateProposalConfidence({ state = {}, results = {}, quoteReadiness = null } = {}) {
  let score = 100;
  const factors = [];
  const add = (points, reason) => {
    score -= points;
    factors.push({ points: -points, reason });
  };

  // PVGIS fallback aynı zamanda buildApprovalWorkflow'da hard-blocker; ikisi tutarlı
  // olarak fallback'i quote-ready'den engelliyor (confidence -25, approval blocked).
  if (results.usedFallback) add(25, 'PVGIS canlı veri yok.');
  if (!state.roofGeometry) add(15, 'Çatı geometrisi doğrulanmadı.');
  if (!hasMeaningfulConsumptionEvidence(state)) add(15, 'Fatura/tüketim kanıtı yok.');
  // Kanıt yönetimi blocker'ları için 5 puan/blocker × max 35 (önceki 25 cap, çok blocker
  // varken yeterince agresif ceza vermiyordu — quote-ready eşiği 85'in altına itmek için).
  if (results.evidenceGovernance?.validation?.blockers?.length) add(Math.min(35, results.evidenceGovernance.validation.blockers.length * 5), 'Kanıt yönetimi eksik.');
  if (results.tariffSourceGovernance?.stale) add(12, 'Tarife kaynağı eski veya doğrulanmamış.');
  if (!state.quoteInputsVerified) add(10, 'Teklif varsayımları onaylanmadı.');
  if (state.proposalApproval?.state !== 'approved' || !state.proposalApproval?.approvalRecord?.immutable) add(15, 'Proposal onayı tamamlanmadı veya immutable kayıt yok.');
  if (results.tariffModel?.regulation?.warnings?.length) add(10, 'Tarife rejimi uyarıları var.');
  if (results.nmMetrics?.unpaidGridExport > 0) add(5, 'Ücretlendirilmeyen ihracat var.');
  if (state.bomCommercials?.supplierQuoteState !== 'received') add(7, 'Tedarikçi teklif durumu alınmadı.');
  if (state.gridApplicationChecklist && !isGridChecklistComplete(state.gridApplicationChecklist)) add(8, 'Şebeke başvuru kontrol listesi eksik.');
  if (quoteReadiness?.blockers?.length) add(Math.min(20, quoteReadiness.blockers.length * 3), 'Quote-readiness blocker mevcut.');
  if (state.scenarioKey === 'off-grid') {
    const offgrid = results.offgridL2Results || {};
    if (offgrid.fieldDataState === 'synthetic') add(18, 'Off-grid dispatch sentetik veri ağırlıklı.');
    else if (offgrid.fieldDataState === 'hybrid-hourly') add(10, 'Off-grid dispatch kısmen gerçek saatlik veri kullanıyor.');
    if (offgrid.fieldGuaranteeReadiness?.phase1Ready !== true) add(12, 'Faz 1 saha dispatch girdileri eksik.');
    if (offgrid.fieldEvidenceGate?.phase2Ready !== true) add(10, 'Faz 2 saha kanıtları eksik.');
    if (offgrid.fieldModelMaturityGate?.phase3Ready !== true) add(10, 'Faz 3 stres/model olgunluğu eksik.');
    if (offgrid.fieldAcceptanceGate?.phase4Ready !== true) add(8, 'Faz 4 saha kabul kanıtları eksik.');
    if (offgrid.fieldImportGate?.phase7Ready !== true) add(4, 'Faz 7 yüksek çözünürlüklü saha importu eksik.');
  }

  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  const level = normalized >= 85 && state.proposalApproval?.state === 'approved'
    ? 'quote-ready proposal'
    : normalized >= 65
      ? 'engineering estimate'
      : 'rough estimate';
  return { score: normalized, level, factors };
}

export function buildApprovalWorkflow(state = {}, confidence = null) {
  const current = state.proposalApproval || {};
  const user = normalizeUserIdentity(state.userIdentity || { name: current.updatedBy || current.approvedBy || 'local-user', role: 'sales' });
  const existingRecord = current.approvalRecord || null;
  const basisHash = createApprovalBasisHash(state);
  const approvalBasisChanged = !!(existingRecord?.basisHash && existingRecord.basisHash !== basisHash);
  const legacyApprovalWithoutBasis = !!(existingRecord && !existingRecord.basisHash);
  const requestedState = current.state || 'draft';
  const safeState = APPROVAL_STATES.has(requestedState) ? requestedState : 'draft';
  const blockers = [];
  if (safeState === 'approved') {
    if (!canApproveProposal(user) && !existingRecord) blockers.push('Yalnızca approver/admin rolü proposal onayı verebilir.');
    if (legacyApprovalWithoutBasis || approvalBasisChanged) blockers.push('Proposal ticari temeli değişti; mevcut onay geçersiz, yeni revizyon/onay gerekli.');
    if (state.results?.usedFallback) blockers.push('PVGIS canlı veri yok; fallback üretim quote-ready kabul edilmez.');
    if (!state.roofGeometry) blockers.push('Çatı geometrisi harita/saha çizimiyle doğrulanmadı.');
    if (!state.quoteInputsVerified) blockers.push('Teklif varsayımları doğrulanmadan onay verilemez.');
    if (!hasMeaningfulConsumptionEvidence(state)) blockers.push('Fatura/tüketim kanıtı olmadan onay verilemez.');
    if (confidence && confidence.score < 85) blockers.push('Güven skoru 85 altında; quote-ready onay bloke edildi.');
    if (state.evidence?.customerBill?.status !== 'verified') blockers.push('Müşteri fatura kanıtı doğrulanmadan onay verilemez.');
    const supplierEvidenceOk = state.evidence?.supplierQuote?.status === 'verified' || state.bomCommercials?.supplierQuoteState === 'received';
    if (!supplierEvidenceOk) blockers.push('Tedarikçi teklif kanıtı doğrulanmadan onay verilemez.');
    if (state.evidence?.tariffSource?.status !== 'verified') blockers.push('Tarife kaynak kanıtı doğrulanmadan onay verilemez.');
    if (state.gridApplicationChecklist && !isGridChecklistComplete(state.gridApplicationChecklist)) blockers.push('Şebeke başvuru kontrol listesi eksik.');
    if (!state.gridApplicationChecklist) blockers.push('Şebeke başvuru kontrol listesi oluşturulmadı.');
    if (state.results?.evidenceGovernance?.validation?.blockers?.length) blockers.push(...state.results.evidenceGovernance.validation.blockers);
    if (Array.isArray(state.results?.calculationWarnings) && state.results.calculationWarnings.length) blockers.push(...state.results.calculationWarnings);
    if (existingRecord && current.approvedBy && current.approvedBy !== existingRecord.approvedBy) {
      blockers.push('Mevcut immutable onay kaydı sessizce değiştirilemez; yeni revizyon/onay süreci açılmalı.');
    }
  }
  const effectiveState = blockers.length && safeState === 'approved' ? 'finance-review' : safeState;
  const reusableExistingRecord = (approvalBasisChanged || legacyApprovalWithoutBasis) ? null : existingRecord;
  const approvalRecord = reusableExistingRecord || (effectiveState === 'approved'
    ? {
      id: `approval-${Date.now()}`,
      state: 'approved',
      approvedBy: current.approvedBy || describeApprover(user),
      approvedAt: current.approvedAt || nowIso(),
      user,
      immutable: true,
      version: PROPOSAL_GOVERNANCE_VERSION,
      basisHash,
      basisVersion: PROPOSAL_GOVERNANCE_VERSION
    }
    : null);
  return {
    state: effectiveState,
    requestedState: safeState,
    blockers,
    approvedBy: approvalRecord?.approvedBy || (effectiveState === 'approved' ? current.approvedBy || describeApprover(user) : null),
    approvedAt: approvalRecord?.approvedAt || (effectiveState === 'approved' ? current.approvedAt || nowIso() : null),
    approvalRecord,
    basisHash,
    invalidatedApproval: !!(existingRecord && !reusableExistingRecord),
    invalidatedApprovalRecord: existingRecord && !reusableExistingRecord ? existingRecord : null,
    authorizedRole: canApproveProposal(user),
    history: Array.isArray(current.history) ? current.history.slice(-20) : []
  };
}

export function calculateBomCommercials(subtotal = 0, state = {}, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const cfg = state.bomCommercials || {};
  const marginRate = pct(cfg.marginRate, 0.18);
  const contingencyRate = pct(cfg.contingencyRate, 0.05);
  const supplierQuoteState = cfg.supplierQuoteState || 'not-requested';
  const validUntil = cfg.supplierQuoteValidUntil || state.evidence?.supplierQuote?.validUntil || null;
  const baseSubtotal = Math.max(0, finiteNumber(subtotal));
  const contingency = baseSubtotal * contingencyRate;
  const margin = (baseSubtotal + contingency) * marginRate;
  const proposedSellPrice = baseSubtotal + contingency + margin;
  return {
    marginRate,
    contingencyRate,
    supplierQuoteState,
    supplierQuoteRef: cfg.supplierQuoteRef || '',
    supplierQuoteDate: cfg.supplierQuoteDate || null,
    supplierQuoteValidUntil: validUntil,
    quoteExpired: validUntil ? new Date(`${validUntil}T00:00:00Z`) < new Date(`${today}T00:00:00Z`) : false,
    subtotal: Math.round(baseSubtotal),
    contingency: Math.round(contingency),
    margin: Math.round(margin),
    proposedSellPrice: Math.round(proposedSellPrice),
    grossMarginPct: proposedSellPrice > 0 ? Number((margin / proposedSellPrice * 100).toFixed(1)) : 0
  };
}

export function calculateFinancingModel(totalCost = 0, annualNetCashFlow = 0, state = {}) {
  const cfg = state.financing || {};
  const principal = Math.max(0, finiteNumber(cfg.principal, totalCost));
  const downPayment = Math.max(0, finiteNumber(cfg.downPayment, 0));
  const loanPrincipal = Math.max(0, principal - downPayment);
  const annualRate = Math.max(0, finiteNumber(cfg.annualRate, 0.35));
  const termYears = Math.max(1, Math.round(finiteNumber(cfg.termYears, 5)));
  const monthlyRate = annualRate / 12;
  const n = termYears * 12;
  const monthlyPayment = monthlyRate > 0
    ? loanPrincipal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -n))
    : loanPrincipal / n;
  const annualDebtService = monthlyPayment * 12;
  return {
    principal: Math.round(principal),
    downPayment: Math.round(downPayment),
    loanPrincipal: Math.round(loanPrincipal),
    annualRate,
    termYears,
    monthlyPayment: Math.round(monthlyPayment),
    annualDebtService: Math.round(annualDebtService),
    firstYearDebtServiceCoverage: annualDebtService > 0 ? Number((annualNetCashFlow / annualDebtService).toFixed(2)) : null
  };
}

export function buildMaintenancePlan(totalCost = 0, state = {}) {
  const cfg = state.maintenanceContract || {};
  const baseRate = pct(cfg.baseRate, Math.max(0, finiteNumber(state.omRate, 1) / 100));
  const escalationRate = pct(cfg.escalationRate, Math.max(0, finiteNumber(state.expenseEscalationRate, 0.10)));
  const includeMonitoring = cfg.includeMonitoring ?? true;
  const includeCleaning = cfg.includeCleaning ?? true;
  const annualBase = Math.max(0, finiteNumber(totalCost) * baseRate);
  return {
    baseRate,
    escalationRate,
    includeMonitoring,
    includeCleaning,
    contractStatus: cfg.contractStatus || 'not-offered',
    annualBase: Math.round(annualBase),
    tenYearNominal: Math.round(Array.from({ length: 10 }, (_, i) => annualBase * Math.pow(1 + escalationRate, i)).reduce((a, b) => a + b, 0))
  };
}

export function defaultGridApplicationChecklist(existing = {}) {
  const items = [
    ['bill', 'Son 12 aylık tüketim/fatura kanıtı'],
    ['titleOrLease', 'Tapu/kira ve kullanım hakkı evrakı'],
    ['connectionOpinion', 'Dağıtım şirketi bağlantı görüşü'],
    ['singleLine', 'Tek hat şeması'],
    ['staticReview', 'Statik uygunluk/taşıyıcı sistem kontrolü'],
    ['layout', 'Çatı yerleşim planı'],
    ['inverterDocs', 'İnverter/panel teknik dokümanları'],
    ['metering', 'Sayaç/mahsuplaşma gereksinimleri']
  ];
  return Object.fromEntries(items.map(([key, label]) => [
    key,
    { label, done: !!existing[key]?.done, evidence: existing[key]?.evidence || '' }
  ]));
}

export function isGridChecklistComplete(checklist = {}) {
  const normalized = defaultGridApplicationChecklist(checklist);
  return Object.values(normalized).every(item => item.done);
}

export function createProposalRevision(state = {}, results = {}, previous = null) {
  const user = normalizeUserIdentity(state.userIdentity || { name: state.proposalApproval?.updatedBy || 'local-user', role: 'sales' });
  const watched = {
    cityName: state.cityName,
    roofArea: state.roofArea,
    panelType: state.panelType,
    inverterType: state.inverterType,
    tariffType: state.tariffType,
    tariffRegime: state.tariffRegime,
    exportTariff: state.exportTariff,
    totalCost: results.totalCost,
    annualEnergy: results.annualEnergy,
    annualSavings: results.annualSavings,
    npvTotal: results.npvTotal,
    confidenceLevel: results.confidenceLevel,
    quoteStatus: results.quoteReadiness?.status
  };
  return {
    id: `rev-${Date.now()}`,
    createdAt: nowIso(),
    author: user.name,
    authorRole: user.role,
    watched,
    diff: previous ? diffProposalRevisions(previous, { watched }) : []
  };
}

export function diffProposalRevisions(prev = {}, next = {}) {
  const before = prev.watched || {};
  const after = next.watched || {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter(key => before[key] !== after[key])
    .map(key => ({ key, before: before[key], after: after[key] }));
}

export function buildProposalGovernance(state = {}, results = {}) {
  const quoteReadiness = results.quoteReadiness || null;
  const confidence = calculateProposalConfidence({ state, results, quoteReadiness });
  const approval = buildApprovalWorkflow(state, confidence);
  const bomCommercials = calculateBomCommercials(results.costBreakdown?.bom?.subtotal || results.costBreakdown?.subtotal || 0, state);
  const firstYearCashFlow = results.yearlyTable?.[0]?.netCashFlow ?? results.firstYearNetCashFlow ?? results.annualSavings ?? 0;
  const financingBasis = results.financialCostBasis || results.totalCost || 0;
  const maintenanceBasis = results.omCostBasis || results.financialCostBasis || results.totalCost || 0;
  const financing = calculateFinancingModel(financingBasis, firstYearCashFlow, state);
  const maintenance = buildMaintenancePlan(maintenanceBasis, state);
  const gridChecklist = defaultGridApplicationChecklist(state.gridApplicationChecklist || {});
  const ledger = createAssumptionLedger(state, results);
  const previousRevision = Array.isArray(state.proposalRevisions) ? state.proposalRevisions[0] : null;
  const revision = createProposalRevision(state, results, previousRevision);

  return {
    version: PROPOSAL_GOVERNANCE_VERSION,
    generatedAt: nowIso(),
    confidence,
    approval,
    bomCommercials,
    financing,
    maintenance,
    gridChecklist,
    gridChecklistComplete: isGridChecklistComplete(gridChecklist),
    ledger,
    revision
  };
}
