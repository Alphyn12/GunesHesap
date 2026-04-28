// Evidence/source governance helpers for quote-ready proposal workflow.
import { hasMeaningfulConsumptionEvidence, hasMeaningfulHourlyProfile8760 } from './consumption-evidence.js';
import { i18n } from './i18n.js';
import { localizeMessageList, statusLabel } from './output-i18n.js';

export const EVIDENCE_GOVERNANCE_VERSION = 'GH-EVID-2026.04-v1';
export const OFFGRID_FIELD_EVIDENCE_VERSION = 'GH-OFFGRID-FIELD-EVID-2026.04-v1';
export const OFFGRID_FIELD_ACCEPTANCE_VERSION = 'GH-OFFGRID-FIELD-ACCEPT-2026.04-v1';
export const OFFGRID_FIELD_OPERATION_VERSION = 'GH-OFFGRID-FIELD-OPS-2026.04-v1';
export const OFFGRID_FIELD_REVALIDATION_VERSION = 'GH-OFFGRID-FIELD-REVALIDATE-2026.04-v1';
export const OFFGRID_FIELD_IMPORT_VERSION = 'GH-OFFGRID-FIELD-IMPORT-2026.04-v1';

export const OFFGRID_FIELD_EVIDENCE_REQUIREMENTS = [
  { key: 'offgridPvProduction', label: 'Off-grid PV 8760 production evidence', maxAgeDays: 365 },
  { key: 'offgridLoadProfile', label: 'Off-grid total load 8760 evidence', maxAgeDays: 365 },
  { key: 'offgridCriticalLoadProfile', label: 'Off-grid critical load 8760 evidence', maxAgeDays: 365 },
  { key: 'offgridSiteShading', label: 'Off-grid site shading evidence', maxAgeDays: 365 },
  { key: 'offgridEquipmentDatasheets', label: 'Off-grid equipment datasheet evidence', maxAgeDays: 365 }
];

export const OFFGRID_FIELD_ACCEPTANCE_REQUIREMENTS = [
  { key: 'offgridCommissioningReport', label: 'Off-grid commissioning report', maxAgeDays: 90 },
  { key: 'offgridAcceptanceTest', label: 'Off-grid site acceptance test', maxAgeDays: 90 },
  { key: 'offgridMonitoringCalibration', label: 'Off-grid monitoring and meter calibration', maxAgeDays: 90 },
  { key: 'offgridAsBuiltDocs', label: 'Off-grid as-built drawings and protection settings', maxAgeDays: 365 },
  { key: 'offgridWarrantyOandM', label: 'Off-grid warranty terms and O&M plan', maxAgeDays: 365 }
];

export const OFFGRID_FIELD_OPERATION_REQUIREMENTS = [
  { key: 'offgridTelemetry30Day', label: 'Off-grid first 30-day telemetry export', maxAgeDays: 45 },
  { key: 'offgridPerformanceBaseline', label: 'Off-grid measured performance baseline', maxAgeDays: 365 },
  { key: 'offgridMaintenanceLog', label: 'Off-grid maintenance log', maxAgeDays: 120 },
  { key: 'offgridIncidentLog', label: 'Off-grid incident and outage log', maxAgeDays: 120 },
  { key: 'offgridRemoteMonitoringSla', label: 'Off-grid remote monitoring SLA', maxAgeDays: 365 }
];

export const OFFGRID_FIELD_REVALIDATION_REQUIREMENTS = [
  { key: 'offgridAnnualRevalidation', label: 'Off-grid annual field revalidation report', maxAgeDays: 365 },
  { key: 'offgridBatteryHealthReport', label: 'Off-grid battery SOH and health report', maxAgeDays: 180 },
  { key: 'offgridGeneratorServiceRecord', label: 'Off-grid generator service and fuel record', maxAgeDays: 180, generatorOnly: true },
  { key: 'offgridFirmwareSettingsBackup', label: 'Off-grid firmware and settings backup', maxAgeDays: 365 },
  { key: 'offgridCustomerSignoff', label: 'Off-grid customer operating sign-off', maxAgeDays: 365 }
];

export const OFFGRID_FIELD_IMPORT_REQUIREMENTS = [
  { key: 'offgridHighResLoadProfile', label: 'Off-grid 1-minute field load profile', minDurationDays: 7, maxIntervalMinutes: 5 },
  { key: 'offgridInverterEventLog', label: 'Off-grid inverter trip/event log' }
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function currentDateIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayDate(today = currentDateIso()) {
  return parseDate(today) || new Date();
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}

function normalizeEvidenceRecord(record = {}, defaults = {}) {
  const status = record.status || defaults.status || 'missing';
  const files = Array.isArray(record.files) ? record.files : (Array.isArray(defaults.files) ? defaults.files : []);
  return {
    type: defaults.type || record.type || 'generic',
    status,
    ref: String(record.ref || defaults.ref || '').trim(),
    sourceUrl: String(record.sourceUrl || defaults.sourceUrl || '').trim(),
    sourceLabel: String(record.sourceLabel || defaults.sourceLabel || '').trim(),
    issuedAt: record.issuedAt || defaults.issuedAt || null,
    checkedAt: record.checkedAt || defaults.checkedAt || null,
    validUntil: record.validUntil || defaults.validUntil || null,
    validationStatus: record.validationStatus || defaults.validationStatus || (status === 'verified' ? 'validated' : 'unvalidated'),
    notes: String(record.notes || defaults.notes || '').trim(),
    files: files.map(file => ({
      id: String(file.id || '').trim(),
      name: String(file.name || '').trim(),
      size: Number(file.size) || 0,
      mimeType: String(file.mimeType || file.type || '').trim(),
      sha256: String(file.sha256 || '').trim(),
      storage: String(file.storage || '').trim(),
      attachedAt: file.attachedAt || null,
      validationStatus: file.validationStatus || 'unvalidated'
    })).filter(file => file.id && file.sha256)
  };
}

function hasValidatedFile(record = {}) {
  return Array.isArray(record.files) && record.files.some(file => file.sha256 && file.validationStatus !== 'rejected');
}

function runtimeEvidenceStatus(existing, hasRuntimeData) {
  if (existing?.status) return existing.status;
  return hasRuntimeData ? 'review-required' : 'missing';
}

export function isEvidenceFresh(record = {}, { today = currentDateIso(), maxAgeDays = 30 } = {}) {
  const checked = parseDate(record.checkedAt || record.issuedAt);
  if (!checked) return false;
  return daysBetween(checked, todayDate(today)) <= maxAgeDays;
}

export function isEvidenceExpired(record = {}, { today = currentDateIso() } = {}) {
  const validUntil = parseDate(record.validUntil);
  return !!validUntil && validUntil < todayDate(today);
}

export function buildEvidenceRegistry(state = {}, results = {}, { today = currentDateIso() } = {}) {
  const evidence = state.evidence || {};
  const tariffModel = results.tariffModel || {};
  const exportPolicy = tariffModel.exportCompensationPolicy || {};
  const supplier = state.bomCommercials || {};
  const hasConsumptionEvidence = hasMeaningfulConsumptionEvidence(state);

  const registry = {
    customerBill: normalizeEvidenceRecord(evidence.customerBill, {
      type: 'customerBill',
      status: hasConsumptionEvidence ? 'verified' : 'missing',
      ref: evidence.customerBill?.ref || (hasConsumptionEvidence ? 'consumption-evidence-input' : ''),
      checkedAt: evidence.customerBill?.checkedAt || null,
      sourceLabel: 'Customer bill / consumption evidence'
    }),
    supplierQuote: normalizeEvidenceRecord(evidence.supplierQuote, {
      type: 'supplierQuote',
      status: state.costSourceType === 'bom-verified'
        ? 'verified'
        : supplier.supplierQuoteState === 'received' ? 'verified' : supplier.supplierQuoteState || 'missing',
      ref: supplier.supplierQuoteRef || '',
      issuedAt: supplier.supplierQuoteDate || null,
      validUntil: supplier.supplierQuoteValidUntil || null,
      sourceLabel: 'Supplier BOM quote',
      notes: state.costSourceType ? `costSourceType: ${state.costSourceType}` : ''
    }),
    tariffSource: normalizeEvidenceRecord(evidence.tariffSource, {
      type: 'tariffSource',
      status: tariffModel.sourceDate && tariffModel.sourceLabel ? 'verified' : 'missing',
      ref: tariffModel.sourceDate || '',
      sourceLabel: tariffModel.sourceLabel || 'Tariff source',
      sourceUrl: tariffModel.sourceUrl || exportPolicy.sources?.[0]?.url || '',
      checkedAt: state.tariffSourceCheckedAt || tariffModel.sourceDate || null
    }),
    regulationSource: normalizeEvidenceRecord(evidence.regulationSource, {
      type: 'regulationSource',
      status: exportPolicy.sources?.length ? 'verified' : 'missing',
      ref: exportPolicy.version || '',
      sourceLabel: exportPolicy.sources?.map(s => s.label).join(' + ') || 'Regulation source',
      sourceUrl: exportPolicy.sources?.[0]?.url || '',
      checkedAt: exportPolicy.sources?.[0]?.checkedDate || null
    }),
    gridApplication: normalizeEvidenceRecord(evidence.gridApplication, {
      type: 'gridApplication',
      status: state.gridApplicationChecklist && Object.values(state.gridApplicationChecklist).every(item => item?.done && item?.evidence)
        ? 'verified'
        : 'missing',
      ref: 'grid-checklist',
      checkedAt: evidence.gridApplication?.checkedAt || null,
      sourceLabel: 'Grid application checklist'
    })
  };

  if (state.scenarioKey === 'off-grid') {
    const offgrid = results.offgridL2Results || {};
    const fieldImports = state.offgridFieldImports || {};
    const highResLoad = fieldImports.highResolutionLoad || {};
    const inverterEventLog = fieldImports.inverterEventLog || {};
    const hasDerivedHighResLoad8760 = hasMeaningfulHourlyProfile8760(highResLoad.derivedHourly8760, { minAnnualKwh: 12, minPositiveHours: 24 });
    const hasRealPvFromResult = offgrid.productionDispatchMetadata?.hasRealHourlyProduction === true
      && Number(offgrid.productionDispatchMetadata?.annualKwh || 0) >= 1;
    const hasRealPvProduction = hasRealPvFromResult
      || hasMeaningfulHourlyProfile8760(state.offgridPvHourly8760, { minAnnualKwh: 1, minPositiveHours: 24 })
      || hasMeaningfulHourlyProfile8760(state.hourlyProduction8760, { minAnnualKwh: 1, minPositiveHours: 24 });
    const hasRealLoad = hasMeaningfulHourlyProfile8760(state.hourlyConsumption8760, { minAnnualKwh: 12, minPositiveHours: 24 }) || hasDerivedHighResLoad8760;
    const hasRealCriticalLoad = hasMeaningfulHourlyProfile8760(state.offgridCriticalLoad8760, { minAnnualKwh: 0.1, minPositiveHours: 1 })
      || hasMeaningfulHourlyProfile8760(state.criticalLoad8760, { minAnnualKwh: 0.1, minPositiveHours: 1 });
    const hasSiteVerifiedShading = state.shadingQuality === 'site-verified';

    registry.offgridPvProduction = normalizeEvidenceRecord(evidence.offgridPvProduction, {
      type: 'offgridPvProduction',
      status: runtimeEvidenceStatus(evidence.offgridPvProduction, hasRealPvProduction),
      ref: evidence.offgridPvProduction?.ref || state.offgridPvHourlySource || (hasRealPvProduction ? 'runtime-offgrid-pv-8760' : ''),
      checkedAt: evidence.offgridPvProduction?.checkedAt || null,
      sourceLabel: 'Off-grid PV 8760 production evidence',
      notes: hasRealPvProduction ? 'Runtime 8760 PV profile is present; Phase 2 still requires an auditable file hash.' : ''
    });
    registry.offgridLoadProfile = normalizeEvidenceRecord(evidence.offgridLoadProfile, {
      type: 'offgridLoadProfile',
      status: evidence.offgridLoadProfile?.status === 'verified'
        ? 'verified'
        : evidence.offgridHighResLoadProfile?.status === 'verified' && hasDerivedHighResLoad8760
          ? 'verified'
          : runtimeEvidenceStatus(evidence.offgridLoadProfile, hasRealLoad),
      ref: evidence.offgridLoadProfile?.ref || (hasDerivedHighResLoad8760
        ? (evidence.offgridHighResLoadProfile?.ref || 'runtime-derived-from-highres-load')
        : (hasRealLoad ? 'runtime-total-load-8760' : '')),
      checkedAt: evidence.offgridLoadProfile?.checkedAt || evidence.offgridHighResLoadProfile?.checkedAt || null,
      sourceLabel: 'Off-grid total load 8760 evidence',
      notes: hasDerivedHighResLoad8760
        ? 'High-resolution field profile was aggregated into a dispatch-ready 8760 load series.'
        : hasRealLoad ? 'Runtime 8760 total load profile is present; Phase 2 still requires an auditable file hash.' : '',
      files: evidence.offgridLoadProfile?.files?.length ? evidence.offgridLoadProfile.files : (evidence.offgridHighResLoadProfile?.files || [])
    });
    registry.offgridCriticalLoadProfile = normalizeEvidenceRecord(evidence.offgridCriticalLoadProfile, {
      type: 'offgridCriticalLoadProfile',
      status: runtimeEvidenceStatus(evidence.offgridCriticalLoadProfile, hasRealCriticalLoad),
      ref: evidence.offgridCriticalLoadProfile?.ref || (hasRealCriticalLoad ? 'runtime-critical-load-8760' : ''),
      checkedAt: evidence.offgridCriticalLoadProfile?.checkedAt || null,
      sourceLabel: 'Off-grid critical load 8760 evidence',
      notes: hasRealCriticalLoad ? 'Runtime 8760 critical load profile is present; Phase 2 still requires an auditable file hash.' : ''
    });
    registry.offgridHighResLoadProfile = normalizeEvidenceRecord(evidence.offgridHighResLoadProfile, {
      type: 'offgridHighResLoadProfile',
      status: evidence.offgridHighResLoadProfile?.status || (highResLoad.sampleCount ? 'review-required' : 'missing'),
      ref: evidence.offgridHighResLoadProfile?.ref || (highResLoad.sampleCount ? 'runtime-highres-load-import' : ''),
      checkedAt: evidence.offgridHighResLoadProfile?.checkedAt || null,
      sourceLabel: 'Off-grid 1-minute field load profile',
      notes: highResLoad.sampleCount
        ? `Observed peak ${Number(highResLoad.observedPeakKw || 0).toFixed(2)} kW at ${Number(highResLoad.intervalMinutes || 0).toFixed(0)} min resolution.`
        : ''
    });
    registry.offgridInverterEventLog = normalizeEvidenceRecord(evidence.offgridInverterEventLog, {
      type: 'offgridInverterEventLog',
      status: evidence.offgridInverterEventLog?.status || (inverterEventLog.eventCount ? 'review-required' : 'missing'),
      ref: evidence.offgridInverterEventLog?.ref || (inverterEventLog.eventCount ? 'runtime-inverter-event-log' : ''),
      checkedAt: evidence.offgridInverterEventLog?.checkedAt || null,
      sourceLabel: 'Off-grid inverter trip/event log',
      notes: inverterEventLog.eventCount
        ? `Trips ${Number(inverterEventLog.tripCount || 0)}, overload ${Number(inverterEventLog.overloadCount || 0)}, faults ${Number(inverterEventLog.faultCount || 0)}.`
        : ''
    });
    registry.offgridSiteShading = normalizeEvidenceRecord(evidence.offgridSiteShading, {
      type: 'offgridSiteShading',
      status: runtimeEvidenceStatus(evidence.offgridSiteShading, hasSiteVerifiedShading),
      ref: evidence.offgridSiteShading?.ref || (hasSiteVerifiedShading ? 'site-verified-shading-input' : ''),
      checkedAt: evidence.offgridSiteShading?.checkedAt || null,
      sourceLabel: 'Off-grid site shading evidence',
      notes: hasSiteVerifiedShading ? 'Shading quality is marked site-verified; Phase 2 still requires an auditable file hash.' : ''
    });
    registry.offgridEquipmentDatasheets = normalizeEvidenceRecord(evidence.offgridEquipmentDatasheets, {
      type: 'offgridEquipmentDatasheets',
      status: evidence.offgridEquipmentDatasheets?.status || 'missing',
      ref: evidence.offgridEquipmentDatasheets?.ref || '',
      checkedAt: evidence.offgridEquipmentDatasheets?.checkedAt || null,
      sourceLabel: 'Off-grid equipment datasheet evidence'
    });
    OFFGRID_FIELD_ACCEPTANCE_REQUIREMENTS.forEach(req => {
      registry[req.key] = normalizeEvidenceRecord(evidence[req.key], {
        type: req.key,
        status: evidence[req.key]?.status || 'missing',
        ref: evidence[req.key]?.ref || '',
        checkedAt: evidence[req.key]?.checkedAt || null,
        sourceLabel: req.label
      });
    });
    OFFGRID_FIELD_OPERATION_REQUIREMENTS.forEach(req => {
      registry[req.key] = normalizeEvidenceRecord(evidence[req.key], {
        type: req.key,
        status: evidence[req.key]?.status || 'missing',
        ref: evidence[req.key]?.ref || '',
        checkedAt: evidence[req.key]?.checkedAt || null,
        sourceLabel: req.label
      });
    });
    OFFGRID_FIELD_REVALIDATION_REQUIREMENTS.forEach(req => {
      registry[req.key] = normalizeEvidenceRecord(evidence[req.key], {
        type: req.key,
        status: evidence[req.key]?.status || 'missing',
        ref: evidence[req.key]?.ref || '',
        checkedAt: evidence[req.key]?.checkedAt || null,
        sourceLabel: req.label
      });
    });
  }

  const validation = validateEvidenceRegistry(registry, { today });
  return { version: EVIDENCE_GOVERNANCE_VERSION, today, registry, validation };
}

export function buildOffgridFieldImportGate(evidenceGovernance = {}, results = {}, { today = currentDateIso() } = {}) {
  const registry = evidenceGovernance.registry || evidenceGovernance || {};
  const offgrid = results.offgridL2Results || {};
  const fieldImportSummary = offgrid.fieldImportSummary || {};
  const highRes = fieldImportSummary.highResolutionLoad || {};
  const inverterLog = fieldImportSummary.inverterEventLog || {};
  const blockers = [];
  const warnings = [];
  const requiredEvidenceKeys = OFFGRID_FIELD_IMPORT_REQUIREMENTS.map(item => item.key);

  const loadRecord = registry.offgridHighResLoadProfile || {};
  const inverterRecord = registry.offgridInverterEventLog || {};
  if (loadRecord.status !== 'verified' || !hasValidatedFile(loadRecord)) {
    blockers.push('offgridHighResLoadProfile: doğrulanmış 1 dakikalık saha yük dosyası ve SHA-256 izi yok.');
  }
  if (!highRes.sampleCount) blockers.push('1 dakikalık saha yük özeti çözümlenmedi.');
  if (inverterRecord.status !== 'verified' || !hasValidatedFile(inverterRecord)) {
    blockers.push('offgridInverterEventLog: doğrulanmış inverter olay logu ve SHA-256 izi yok.');
  }
  if (!inverterLog.eventCount) blockers.push('İnverter olay logu özeti çözümlenmedi.');
  if (highRes.intervalMinutes && highRes.intervalMinutes > 5) warnings.push('Yüksek çözünürlüklü saha yükü 5 dakikadan kaba; inverter eşzamanlılık riski eksik yakalanabilir.');
  if (highRes.durationDays && highRes.durationDays < 7) warnings.push('Yüksek çözünürlüklü saha yükü 7 günden kısa; saha çeşitliliği ve kötü gün davranışı eksik temsil edilebilir.');
  if (inverterLog.tripCount > 0 || inverterLog.overloadCount > 0) warnings.push('İnverter logunda trip/overload olayları görüldü; inverter sizing ve surge marjı tekrar doğrulanmalı.');
  if (!highRes.derivedHourly8760Ready) warnings.push('Dakika-profili 8760 dispatch girdisine dönüşmedi; bu import şu aşamada pik/olay doğrulaması için kullanılıyor.');
  if (loadRecord.status === 'verified' && !isEvidenceFresh(loadRecord, { today, maxAgeDays: 365 })) {
    warnings.push('1 dakikalık saha yük dosyasının kontrol tarihi 365 günden eski veya eksik.');
  }
  if (inverterRecord.status === 'verified' && !isEvidenceFresh(inverterRecord, { today, maxAgeDays: 365 })) {
    warnings.push('İnverter olay logunun kontrol tarihi 365 günden eski veya eksik.');
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  const phase7Ready = uniqueBlockers.length === 0;
  return {
    version: OFFGRID_FIELD_IMPORT_VERSION,
    status: phase7Ready ? 'phase7-ready' : 'blocked',
    phase7Ready,
    fieldGuaranteeReady: false,
    requiredEvidenceKeys,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    summary: {
      observedPeakKw: Number(highRes.observedPeakKw || 0),
      p95Kw: Number(highRes.p95Kw || 0),
      intervalMinutes: Number(highRes.intervalMinutes || 0),
      durationDays: Number(highRes.durationDays || 0),
      inverterTripCount: Number(inverterLog.tripCount || 0),
      inverterOverloadCount: Number(inverterLog.overloadCount || 0)
    }
  };
}

export function buildOffgridFieldEvidenceGate(evidenceGovernance = {}, results = {}, { today = currentDateIso() } = {}) {
  const registry = evidenceGovernance.registry || evidenceGovernance || {};
  const offgrid = results.offgridL2Results || {};
  const phase1 = offgrid.fieldGuaranteeReadiness || {};
  const blockers = [];
  const warnings = [];
  const requiredEvidenceKeys = OFFGRID_FIELD_EVIDENCE_REQUIREMENTS.map(item => item.key);

  if (phase1.status && phase1.phase1Ready !== true) {
    blockers.push('Faz 1 saha dispatch girdileri tamamlanmadan Faz 2 kanıt kapısı açılamaz.');
  }

  OFFGRID_FIELD_EVIDENCE_REQUIREMENTS.forEach(req => {
    const record = registry[req.key] || {};
    if (record.status !== 'verified' || record.validationStatus === 'rejected') {
      blockers.push(`${req.key}: doğrulanmış kanıt kaydı yok.`);
    }
    if (!hasValidatedFile(record)) {
      blockers.push(`${req.key}: doğrulanmış dosya eki ve SHA-256 parmak izi yok.`);
    }
    if (isEvidenceExpired(record, { today })) {
      blockers.push(`${req.key}: kanıt geçerlilik tarihi dolmuş.`);
    }
    if (record.status === 'verified' && !isEvidenceFresh(record, { today, maxAgeDays: req.maxAgeDays })) {
      blockers.push(`${req.key}: kaynak kontrol tarihi ${req.maxAgeDays} günden eski veya eksik.`);
    }
  });

  if (offgrid.loadMode && offgrid.loadMode !== 'hourly-8760') {
    warnings.push('Cihaz kütüphanesi veya basit günlük yük modeli Faz 2 kanıtı sayılmaz; gerçek toplam yük 8760 dosyası gerekir.');
  }
  if (offgrid.productionDispatchMetadata?.hasRealHourlyProduction !== true) {
    warnings.push('Aylık üretimden türetilmiş sentetik PV dispatch Faz 2 kanıtı sayılmaz; gerçek PV 8760 dosyası gerekir.');
  }
  if (offgrid.synthetic) {
    warnings.push('Sentetik dispatch sonucu saha garantisi olarak kullanılamaz.');
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  const phase2Ready = uniqueBlockers.length === 0;
  return {
    version: OFFGRID_FIELD_EVIDENCE_VERSION,
    status: phase2Ready ? 'phase2-ready' : 'blocked',
    phase2Ready,
    fieldGuaranteeReady: false,
    requiredEvidenceKeys,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    records: Object.fromEntries(requiredEvidenceKeys.map(key => {
      const record = registry[key] || {};
      return [key, {
        status: record.status || 'missing',
        validationStatus: record.validationStatus || 'unvalidated',
        ref: record.ref || '',
        checkedAt: record.checkedAt || record.issuedAt || null,
        fileCount: Array.isArray(record.files) ? record.files.length : 0,
        hasValidatedFile: hasValidatedFile(record)
      }];
    }))
  };
}

export function buildOffgridFieldAcceptanceGate(evidenceGovernance = {}, results = {}, { today = currentDateIso() } = {}) {
  const registry = evidenceGovernance.registry || evidenceGovernance || {};
  const offgrid = results.offgridL2Results || {};
  const blockers = [];
  const warnings = [];
  const requiredEvidenceKeys = OFFGRID_FIELD_ACCEPTANCE_REQUIREMENTS.map(item => item.key);

  if (offgrid.fieldGuaranteeReadiness?.phase1Ready !== true) {
    blockers.push('Faz 1 saatlik dispatch girdileri tamamlanmadan Faz 4 saha kabul kapısı açılamaz.');
  }
  if (offgrid.fieldEvidenceGate?.phase2Ready !== true) {
    blockers.push('Faz 2 doğrulanmış saha kanıtları tamamlanmadan Faz 4 saha kabul kapısı açılamaz.');
  }
  if (offgrid.fieldModelMaturityGate?.phase3Ready !== true) {
    blockers.push('Faz 3 stres/model olgunluğu tamamlanmadan Faz 4 saha kabul kapısı açılamaz.');
  }

  OFFGRID_FIELD_ACCEPTANCE_REQUIREMENTS.forEach(req => {
    const record = registry[req.key] || {};
    if (record.status !== 'verified' || record.validationStatus === 'rejected') {
      blockers.push(`${req.key}: doğrulanmış saha kabul kanıtı yok.`);
    }
    if (!hasValidatedFile(record)) {
      blockers.push(`${req.key}: doğrulanmış dosya eki ve SHA-256 parmak izi yok.`);
    }
    if (isEvidenceExpired(record, { today })) {
      blockers.push(`${req.key}: kanıt geçerlilik tarihi dolmuş.`);
    }
    if (record.status === 'verified' && !isEvidenceFresh(record, { today, maxAgeDays: req.maxAgeDays })) {
      blockers.push(`${req.key}: kaynak kontrol tarihi ${req.maxAgeDays} günden eski veya eksik.`);
    }
  });

  if (!offgrid.fieldStressAnalysis?.scenarios?.length) {
    warnings.push('Faz 4 kabul dosyası, Faz 3 stres senaryosu özeti olmadan eksik kalır.');
  }
  if (offgrid.generatorEnabled && (offgrid.generatorCapexMissing || !offgrid.generatorCapacityKw)) {
    warnings.push('Jeneratör içeren saha kabulünde jeneratör kapasite ve yatırım kaydı ayrıca doğrulanmalıdır.');
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  const phase4Ready = uniqueBlockers.length === 0;
  return {
    version: OFFGRID_FIELD_ACCEPTANCE_VERSION,
    status: phase4Ready ? 'phase4-ready' : 'blocked',
    phase4Ready,
    fieldGuaranteeReady: phase4Ready,
    requiredEvidenceKeys,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    records: Object.fromEntries(requiredEvidenceKeys.map(key => {
      const record = registry[key] || {};
      return [key, {
        status: record.status || 'missing',
        validationStatus: record.validationStatus || 'unvalidated',
        ref: record.ref || '',
        checkedAt: record.checkedAt || record.issuedAt || null,
        fileCount: Array.isArray(record.files) ? record.files.length : 0,
        hasValidatedFile: hasValidatedFile(record)
      }];
    }))
  };
}

export function buildOffgridFieldOperationGate(evidenceGovernance = {}, results = {}, { today = currentDateIso() } = {}) {
  const registry = evidenceGovernance.registry || evidenceGovernance || {};
  const offgrid = results.offgridL2Results || {};
  const blockers = [];
  const warnings = [];
  const requiredEvidenceKeys = OFFGRID_FIELD_OPERATION_REQUIREMENTS.map(item => item.key);

  if (offgrid.fieldAcceptanceGate?.phase4Ready !== true) {
    blockers.push('Faz 4 saha kabul kapısı tamamlanmadan Faz 5 garanti operasyon kapısı açılamaz.');
  }

  OFFGRID_FIELD_OPERATION_REQUIREMENTS.forEach(req => {
    const record = registry[req.key] || {};
    if (record.status !== 'verified' || record.validationStatus === 'rejected') {
      blockers.push(`${req.key}: doğrulanmış operasyon/izleme kanıtı yok.`);
    }
    if (!hasValidatedFile(record)) {
      blockers.push(`${req.key}: doğrulanmış dosya eki ve SHA-256 parmak izi yok.`);
    }
    if (isEvidenceExpired(record, { today })) {
      blockers.push(`${req.key}: kanıt geçerlilik tarihi dolmuş.`);
    }
    if (record.status === 'verified' && !isEvidenceFresh(record, { today, maxAgeDays: req.maxAgeDays })) {
      blockers.push(`${req.key}: kaynak kontrol tarihi ${req.maxAgeDays} günden eski veya eksik.`);
    }
  });

  const telemetry = registry.offgridTelemetry30Day || {};
  if (telemetry.status === 'verified' && !telemetry.notes) {
    warnings.push('30 günlük telemetri dosyası var; PR/availability/critical-load-event özeti ayrıca not edilmelidir.');
  }
  const baseline = registry.offgridPerformanceBaseline || {};
  if (baseline.status === 'verified' && !baseline.notes) {
    warnings.push('Ölçülen performans baseline dosyası var; garanti eşiği ve sapma toleransı ayrıca not edilmelidir.');
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  const phase5Ready = uniqueBlockers.length === 0;
  return {
    version: OFFGRID_FIELD_OPERATION_VERSION,
    status: phase5Ready ? 'phase5-ready' : 'blocked',
    phase5Ready,
    activeGuaranteeReady: phase5Ready,
    fieldGuaranteeReady: phase5Ready,
    requiredEvidenceKeys,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    records: Object.fromEntries(requiredEvidenceKeys.map(key => {
      const record = registry[key] || {};
      return [key, {
        status: record.status || 'missing',
        validationStatus: record.validationStatus || 'unvalidated',
        ref: record.ref || '',
        checkedAt: record.checkedAt || record.issuedAt || null,
        fileCount: Array.isArray(record.files) ? record.files.length : 0,
        hasValidatedFile: hasValidatedFile(record)
      }];
    }))
  };
}

export function buildOffgridFieldRevalidationGate(evidenceGovernance = {}, results = {}, { today = currentDateIso() } = {}) {
  const registry = evidenceGovernance.registry || evidenceGovernance || {};
  const offgrid = results.offgridL2Results || {};
  const blockers = [];
  const warnings = [];
  const generatorEnabled = !!offgrid.generatorEnabled;
  const effectiveRequirements = OFFGRID_FIELD_REVALIDATION_REQUIREMENTS
    .filter(req => !req.generatorOnly || generatorEnabled);
  const skippedEvidenceKeys = OFFGRID_FIELD_REVALIDATION_REQUIREMENTS
    .filter(req => req.generatorOnly && !generatorEnabled)
    .map(req => req.key);
  const requiredEvidenceKeys = effectiveRequirements.map(item => item.key);

  if (offgrid.fieldOperationGate?.phase5Ready !== true) {
    blockers.push('Faz 5 aktif izleme/operasyon kapısı tamamlanmadan Faz 6 revalidasyon kapısı açılamaz.');
  }

  effectiveRequirements.forEach(req => {
    const record = registry[req.key] || {};
    if (record.status !== 'verified' || record.validationStatus === 'rejected') {
      blockers.push(`${req.key}: doğrulanmış revalidasyon/yenileme kanıtı yok.`);
    }
    if (!hasValidatedFile(record)) {
      blockers.push(`${req.key}: doğrulanmış dosya eki ve SHA-256 parmak izi yok.`);
    }
    if (isEvidenceExpired(record, { today })) {
      blockers.push(`${req.key}: kanıt geçerlilik tarihi dolmuş.`);
    }
    if (record.status === 'verified' && !isEvidenceFresh(record, { today, maxAgeDays: req.maxAgeDays })) {
      blockers.push(`${req.key}: kaynak kontrol tarihi ${req.maxAgeDays} günden eski veya eksik.`);
    }
  });

  if (!generatorEnabled) {
    warnings.push('Jeneratör kapalı olduğu için jeneratör servis/yakıt revalidasyon kaydı zorunlu tutulmadı.');
  }
  const batteryHealth = registry.offgridBatteryHealthReport || {};
  if (batteryHealth.status === 'verified' && !batteryHealth.notes) {
    warnings.push('Batarya sağlık raporu var; SOH yüzdesi, kapasite testi ve garanti eşiği not edilmelidir.');
  }
  const annual = registry.offgridAnnualRevalidation || {};
  if (annual.status === 'verified' && !annual.notes) {
    warnings.push('Yıllık revalidasyon raporu var; ölçülen kapsama/SOC/jeneratör sapma özeti ayrıca not edilmelidir.');
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueWarnings = [...new Set(warnings)];
  const phase6Ready = uniqueBlockers.length === 0;
  return {
    version: OFFGRID_FIELD_REVALIDATION_VERSION,
    status: phase6Ready ? 'phase6-ready' : 'blocked',
    phase6Ready,
    renewalReady: phase6Ready,
    activeGuaranteeReady: phase6Ready,
    fieldGuaranteeReady: phase6Ready,
    requiredEvidenceKeys,
    skippedEvidenceKeys,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    records: Object.fromEntries(requiredEvidenceKeys.map(key => {
      const record = registry[key] || {};
      return [key, {
        status: record.status || 'missing',
        validationStatus: record.validationStatus || 'unvalidated',
        ref: record.ref || '',
        checkedAt: record.checkedAt || record.issuedAt || null,
        fileCount: Array.isArray(record.files) ? record.files.length : 0,
        hasValidatedFile: hasValidatedFile(record)
      }];
    }))
  };
}

export function validateEvidenceRegistry(registry = {}, { today = currentDateIso() } = {}) {
  const blockers = [];
  const warnings = [];
  const required = ['customerBill', 'supplierQuote', 'tariffSource', 'regulationSource', 'gridApplication'];

  required.forEach(key => {
    const record = registry[key] || {};
    if (record.status !== 'verified' || record.validationStatus === 'rejected') {
      blockers.push(`${key}: doğrulanmış kanıt yok.`);
    }
    if (['customerBill', 'supplierQuote'].includes(key) && record.status === 'verified' && !hasValidatedFile(record)) {
      blockers.push(`${key}: doğrulanmış dosya eki ve SHA-256 parmak izi yok.`);
    }
    if (key === 'tariffSource' && record.status === 'verified' && !hasValidatedFile(record) && !record.sourceUrl) {
      blockers.push('tariffSource: kaynak doküman eki veya kaynak URL yok.');
    }
    if (key === 'tariffSource' && !isEvidenceFresh(record, { today, maxAgeDays: 45 })) {
      blockers.push('tariffSource: kaynak kontrol tarihi eski veya eksik.');
    }
    if (key === 'regulationSource' && !isEvidenceFresh(record, { today, maxAgeDays: 90 })) {
      warnings.push('regulationSource: regülasyon kaynak kontrol tarihi 90 günden eski veya eksik.');
    }
    if (isEvidenceExpired(record, { today })) {
      blockers.push(`${key}: kanıt geçerlilik tarihi dolmuş.`);
    }
    if (key === 'supplierQuote' && record.status === 'verified' && !record.validUntil) {
      warnings.push('supplierQuote: geçerlilik tarihi yok; marj ve satış fiyatı riskli.');
    }
  });

  return {
    status: blockers.length ? 'incomplete' : 'complete',
    blockers,
    warnings
  };
}

export function isEvidenceComplete(evidenceGovernance) {
  return evidenceGovernance?.validation?.status === 'complete';
}

export function buildTariffSourceGovernance(tariffModel = {}, evidenceGovernance = null, { today = currentDateIso() } = {}) {
  const tariffEvidence = evidenceGovernance?.registry?.tariffSource || {};
  const sourceDate = parseDate(tariffEvidence.checkedAt || tariffModel.sourceDate);
  const ageDays = sourceDate ? daysBetween(sourceDate, todayDate(today)) : null;
  const stale = ageDays == null || ageDays > 45;
  return {
    sourceLabel: tariffModel.sourceLabel || tariffEvidence.sourceLabel || 'unknown',
    sourceDate: tariffEvidence.checkedAt || tariffModel.sourceDate || null,
    sourceUrl: tariffEvidence.sourceUrl || tariffModel.sourceUrl || '',
    validationStatus: tariffEvidence.validationStatus || 'unvalidated',
    lifecycle: tariffModel.sourceLifecycle || null,
    effectiveFrom: tariffModel.sourceLifecycle?.sources?.[0]?.effectiveFrom || null,
    effectiveTo: tariffModel.sourceLifecycle?.sources?.[0]?.effectiveTo || null,
    ageDays,
    stale,
    warning: stale ? 'Tarife kaynak kontrol tarihi 45 günden eski veya eksik.' : null
  };
}

export function buildStructuredProposalExport(state = {}, results = {}) {
  const gov = results.proposalGovernance || {};
  const isOffGrid = state.scenarioKey === 'off-grid';
  const offgridLineage = results.offgridL2Results?.dataLineage || null;
  const evidenceRegistry = results.evidenceGovernance?.registry || {};
  const evidenceSummary = Object.fromEntries(Object.entries(evidenceRegistry).map(([key, record]) => [
    key,
    {
      status: record.status,
      validationStatus: record.validationStatus,
      ref: record.ref,
      checkedAt: record.checkedAt || record.issuedAt || null,
      validUntil: record.validUntil || null,
      files: (record.files || []).map(file => ({
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        sha256: file.sha256,
        storage: file.storage,
        attachedAt: file.attachedAt
      }))
    }
  ]));
  const quoteBlockers = results.quoteReadiness?.blockers || [];
  const evidenceBlockers = results.evidenceGovernance?.validation?.blockers || [];
  const evidenceWarnings = results.evidenceGovernance?.validation?.warnings || [];
  const approvalBlockers = gov.approval?.blockers || [];
  return {
    schema: 'guneshesap.proposal-handoff.v2',
    exportedAt: new Date().toISOString(),
    display: {
      language: i18n.locale || 'tr',
      productName: i18n.t('app.title'),
      title: i18n.t('export.proposalSummaryTitle'),
      userFacing: i18n.t('export.userFacing'),
      quoteReadiness: statusLabel(results.quoteReadiness?.status || null),
      approvalState: statusLabel(gov.approval?.state || null),
      confidenceLevel: statusLabel(gov.confidence?.level || results.confidenceLevel || null),
      blockersLabel: i18n.t('export.blockersLabel'),
      blockers: localizeMessageList(quoteBlockers),
      approvalBlockers: localizeMessageList(approvalBlockers),
      evidenceBlockers: localizeMessageList(evidenceBlockers),
      evidenceWarnings: localizeMessageList(evidenceWarnings)
    },
    customer: {
      cityName: state.cityName || null,
      lat: state.lat || null,
      lon: state.lon || null,
      segment: state.tariffType || null
    },
    system: {
      scenario: state.scenarioContext || { key: state.scenarioKey || 'on-grid' },
      engineSource: results.authoritativeEngineSource || results.engineSource || null,
      authoritativeEngineSource: results.authoritativeEngineSource || results.engineSource || null,
      authoritativeEngineMode: results.authoritativeEngineMode || results.calculationMode || null,
      authoritativeEngineFallbackReason: results.authoritativeEngineFallbackReason || null,
      authoritativeProduction: results.authoritativeProduction || results.authoritativeEngineResponse?.production || {
        annualEnergyKwh: results.annualEnergy || null,
        monthlyEnergyKwh: results.monthlyData || null,
        systemPowerKwp: results.systemPower || null,
        panelCount: results.panelCount || null,
        source: results.authoritativeEngineSource?.source || results.engineSource?.source || results.calculationMode || null
      },
      authoritativeLosses: results.authoritativeEngineResponse?.losses || null,
      productionParity: results.engineParity || null,
      panelType: state.panelType || null,
      inverterType: state.inverterType || null,
      systemPowerKwp: results.systemPower || null,
      annualEnergyKwh: results.annualEnergy || null,
      usedFallback: !!results.usedFallback,
      parityAvailable: results.engineParity?.intentionalDifference === true,
      parityDeltaPct: results.engineParity?.intentionalDifference === true ? (results.engineParity.deltaPct ?? null) : null,
      hourlyProfileSource: results.hourlyProfileSource || state.hourlyProfileSource || 'synthetic',
      productionProfileSource: results.productionProfileSource || 'monthly-derived-synthetic-pv',
      shadowQuality: results.shadowQuality || state.shadingQuality || 'user-estimate',
      tariffInputMode: results.tariffInputMode || state.tariffInputMode || 'net-plus-fee',
      tariffSourceType: results.tariffSourceType || state.tariffSourceType || 'manual',
      costSourceType: results.costSourceType || state.costSourceType || 'catalog',
      dataLineage: isOffGrid ? offgridLineage : {
        version: 'GH-ONGRID-LINEAGE-2026.04-v1',
        productionProfileSource: results.productionProfileSource || 'monthly-derived-synthetic-pv',
        hourlyProfileSource: results.hourlyProfileSource || state.hourlyProfileSource || 'synthetic',
        financialSavingsBasis: results.financialSavingsBasis || null
      }
    },
    commercial: {
      totalCost: results.totalCost || null,
      proposedSellPrice: gov.bomCommercials?.proposedSellPrice || null,
      annualSavings: results.annualSavings || null,
      npv: results.npvTotal || null,
      irr: results.irr || null,
      lcoe: results.lcoe || null,
      confidenceScore: gov.confidence?.score || null,
      confidenceLevel: gov.confidence?.level || results.confidenceLevel || null,
      approvalState: gov.approval?.state || null
    },
    financialSummary: {
      cumulativeNetPaybackYear: results.cumulativeNetPaybackYear || results.simplePaybackYear || null,
      grossSimplePaybackYear: results.grossSimplePaybackYear || null,
      netSimplePaybackYear: results.netSimplePaybackYear || null,
      discountedPaybackYear: results.discountedPaybackYear || null,
      roi: results.roi || null,
      npvTotal: results.npvTotal || null,
      irr: results.irr || null,
      lcoe: results.lcoe || null,
      compensatedLcoe: results.compensatedLcoe || null,
      annualSavings: results.annualSavings || null,
      firstYearGrossSavings: results.firstYearGrossSavings || null,
      firstYearNetCashFlow: results.firstYearNetCashFlow || null,
      financialSavingsRate: results.financialSavingsRate || results.tariff || null,
      financialSavingsBasis: results.financialSavingsBasis || (isOffGrid ? 'off-grid-alternative-energy-cost' : 'grid-import-tariff'),
      totalCost: results.totalCost || null,
      financialCostBasis: results.financialCostBasis || results.totalCost || null,
      paybackBasis: 'cumulative-net-cash-flow',
      financing: gov.financing || null,
      maintenance: gov.maintenance || null,
      bomCommercials: gov.bomCommercials || null
    },
    onGridFlow: state.scenarioKey === 'on-grid' ? {
      subscriberType: state.subscriberType || null,
      connectionType: state.connectionType || null,
      usageProfile: state.usageProfile || null,
      annualConsumptionKwh: state.annualConsumptionKwh || null,
      designTarget: state.designTarget || null,
      roofType: state.roofType || null,
      usableRoofRatio: state.usableRoofRatio || null,
      shadingQuality: state.shadingQuality || null,
      settlementMode: state.exportSettlementMode || null,
      settlementDate: state.settlementDate || null,
      authoritativeFinancialBasis: results.authoritativeFinancialBasis || 'frontend-8760-financial-model',
      settlementProvisional: !!results.settlementProvisional,
      settlementAssumptionBasis: results.settlementAssumptionBasis || null,
      compensationSummary: results.compensationSummary || null,
      enterpriseQuoteGate: {
        officialTariffSource: (results.tariffSourceType || state.tariffSourceType) === 'official',
        hourlyConsumption8760: Array.isArray(state.hourlyConsumption8760) && state.hourlyConsumption8760.length >= 8760,
        hourlyProduction8760: ['backend-pvlib-hourly', 'pvgis-seriescalc-hourly', 'user-hourly-pv-normalized-to-authoritative-annual'].includes(results.productionProfileSource),
        supplierQuoteValidUntil: !!(evidenceRegistry.supplierQuote?.validUntil || state.bomCommercials?.supplierQuoteValidUntil),
        regulationSourceFresh: !(results.quoteReadiness?.blockers || []).some(item => String(item).includes('Regülasyon kaynak kontrol tarihi')),
        productionLimitExceeded: !!results.compensationSummary?.productionLimitExceeded
      }
    } : null,
    offGridL2: isOffGrid && results.offgridL2Results ? {
      productionSource: results.offgridL2Results.productionSource || null,
      productionSourceLabel: results.offgridL2Results.productionSourceLabel || null,
      productionFallback: !!results.offgridL2Results.productionFallback,
      productionDispatchProfile: results.offgridL2Results.productionDispatchProfile || null,
      productionDispatchMetadata: results.offgridL2Results.productionDispatchMetadata || null,
      loadSource: results.offgridL2Results.loadSource || null,
      loadMode: results.offgridL2Results.loadMode || null,
      calculationMode: results.offgridL2Results.calculationMode || null,
      accuracyScore: results.offgridL2Results.accuracyScore ?? null,
      accuracyTier: results.offgridL2Results.accuracyTier || null,
      expectedUncertaintyPct: results.offgridL2Results.expectedUncertaintyPct || null,
      accuracyAssessment: results.offgridL2Results.accuracyAssessment || null,
      dispatchType: results.offgridL2Results.dispatchType || null,
      generatorEnabled: !!results.offgridL2Results.generatorEnabled,
      generatorCapacityKw: results.offgridL2Results.generatorCapacityKw ?? null,
      generatorEnergyKwh: results.offgridL2Results.generatorEnergyKwh ?? results.offgridL2Results.generatorKwh ?? null,
      generatorFuelCostAnnual: results.offgridL2Results.generatorFuelCostAnnual ?? null,
      generatorCapex: results.offgridL2Results.generatorCapex ?? results.generatorCapex ?? null,
      generatorCapexMissing: !!results.offgridL2Results.generatorCapexMissing,
      pvBatteryLoadCoverage: results.offgridL2Results.pvBatteryLoadCoverage ?? null,
      pvBatteryCriticalCoverage: results.offgridL2Results.pvBatteryCriticalCoverage ?? null,
      totalLoadCoverage: results.offgridL2Results.totalLoadCoverage ?? null,
      criticalLoadCoverage: results.offgridL2Results.criticalLoadCoverage ?? null,
      autonomousDays: results.offgridL2Results.autonomousDays ?? null,
      autonomousDaysPct: results.offgridL2Results.autonomousDaysPct ?? null,
      autonomousDaysWithGenerator: results.offgridL2Results.autonomousDaysWithGenerator ?? null,
      autonomousDaysWithGeneratorPct: results.offgridL2Results.autonomousDaysWithGeneratorPct ?? null,
      minimumSoc: results.offgridL2Results.minimumSoc ?? null,
      averageSoc: results.offgridL2Results.averageSoc ?? null,
      batteryMaxChargeKw: results.offgridL2Results.batteryMaxChargeKw ?? null,
      batteryMaxDischargeKw: results.offgridL2Results.batteryMaxDischargeKw ?? null,
      inverterAcLimitKw: results.offgridL2Results.inverterAcLimitKw ?? null,
      inverterSurgeMultiplier: results.offgridL2Results.inverterSurgeMultiplier ?? null,
      inverterPowerLimitedKwh: results.offgridL2Results.inverterPowerLimitedKwh ?? null,
      batteryChargeLimitedKwh: results.offgridL2Results.batteryChargeLimitedKwh ?? null,
      batteryDischargeLimitedKwh: results.offgridL2Results.batteryDischargeLimitedKwh ?? null,
      unmetLoadKwh: results.offgridL2Results.unmetLoadKwh ?? null,
      unmetCriticalKwh: results.offgridL2Results.unmetCriticalKwh ?? null,
      curtailedPvKwh: results.offgridL2Results.curtailedPvKwh ?? null,
      weatherScenario: results.offgridL2Results.weatherScenario || results.offgridL2Results.badWeatherScenario?.weatherLevel || null,
      badWeatherCriticalCoverageDropPct: results.offgridL2Results.badWeatherScenario?.criticalCoverageDropPct ?? null,
      badWeatherTotalCoverageDropPct: results.offgridL2Results.badWeatherScenario?.totalCoverageDropPct ?? null,
      badWeatherAdditionalGeneratorKwh: results.offgridL2Results.badWeatherScenario?.additionalGeneratorKwh ?? null,
      badWeatherWindowCoverage: results.offgridL2Results.badWeatherScenario?.windowCoverage ?? null,
      badWeatherWindowCriticalCoverage: results.offgridL2Results.badWeatherScenario?.windowCriticalCoverage ?? null,
      badWeatherWorstWindowDayOfYear: results.offgridL2Results.badWeatherScenario?.worstWindowDayOfYear ?? null,
      methodologyNote: results.offgridL2Results.methodologyNote || null,
      fieldDataState: results.offgridL2Results.fieldDataState || offgridLineage?.fieldDataState || null,
      dataLineage: offgridLineage,
      provisional: results.offgridL2Results.provisional !== false,
      synthetic: !!results.offgridL2Results.synthetic,
      feasibilityNotGuaranteed: results.offgridL2Results.feasibilityNotGuaranteed !== false,
      fieldGuaranteeReadiness: results.offgridL2Results.fieldGuaranteeReadiness || null,
      fieldEvidenceGate: results.offgridL2Results.fieldEvidenceGate || null,
      fieldStressAnalysis: results.offgridL2Results.fieldStressAnalysis ? {
        version: results.offgridL2Results.fieldStressAnalysis.version || null,
        worstCriticalScenario: results.offgridL2Results.fieldStressAnalysis.worstCriticalScenario || null,
        worstTotalScenario: results.offgridL2Results.fieldStressAnalysis.worstTotalScenario || null,
        maxUnmetCriticalScenario: results.offgridL2Results.fieldStressAnalysis.maxUnmetCriticalScenario || null,
        generatorCriticalPeakReservePct: results.offgridL2Results.fieldStressAnalysis.generatorCriticalPeakReservePct ?? null,
        scenarios: (results.offgridL2Results.fieldStressAnalysis.scenarios || []).map(row => ({
          key: row.key,
          totalLoadCoverage: row.totalLoadCoverage,
          criticalLoadCoverage: row.criticalLoadCoverage,
          unmetLoadKwh: row.unmetLoadKwh,
          unmetCriticalKwh: row.unmetCriticalKwh,
          batteryEol: !!row.batteryEol,
          pvFactor: row.pvFactor,
          loadFactor: row.loadFactor
        }))
      } : null,
      fieldModelMaturityGate: results.offgridL2Results.fieldModelMaturityGate || null,
      fieldAcceptanceGate: results.offgridL2Results.fieldAcceptanceGate || null,
      fieldOperationGate: results.offgridL2Results.fieldOperationGate || null,
      fieldRevalidationGate: results.offgridL2Results.fieldRevalidationGate || null,
      fieldImportGate: results.offgridL2Results.fieldImportGate || null,
      fieldImportSummary: results.offgridL2Results.fieldImportSummary || null,
      fieldGuaranteeCandidate: !!results.offgridL2Results.fieldGuaranteeCandidate,
      fieldGuaranteeReady: !!results.offgridL2Results.fieldGuaranteeReady,
      quoteGate: {
        fieldGuaranteePhase1: !!results.offgridL2Results.fieldGuaranteeReadiness?.phase1Ready,
        fieldEvidencePhase2: !!results.offgridL2Results.fieldEvidenceGate?.phase2Ready,
        fieldModelPhase3: !!results.offgridL2Results.fieldModelMaturityGate?.phase3Ready,
        fieldAcceptancePhase4: !!results.offgridL2Results.fieldAcceptanceGate?.phase4Ready
      },
      dispatchVersion: results.offgridL2Results.dispatchVersion || null
    } : null,
    tariff: {
      regime: results.tariffModel?.effectiveRegime || null,
      regimeBasis: results.tariffModel?.regulation?.effectiveRegimeBasis || null,
      skttActivationDate: results.tariffModel?.regulation?.activationDate || null,
      tariffEvaluationDate: results.tariffModel?.regulation?.evaluationDate || null,
      importRate: results.tariffModel?.importRate || null,
      exportRate: isOffGrid ? 0 : (results.tariffModel?.exportRate || null),
      sourceDate: results.tariffModel?.sourceDate || null,
      sourceLabel: results.tariffModel?.sourceLabel || null
    },
    approval: gov.approval || null,
    governance: {
      proposal: gov,
      quoteReadiness: results.quoteReadiness || null,
      tariffSource: results.tariffSourceGovernance || null,
      auditLog: Array.isArray(state.auditLog) ? state.auditLog.slice(-100) : []
    },
    evidence: results.evidenceGovernance || null,
    evidenceSummary,
    ledger: gov.ledger || null,
    revision: gov.revision || null,
    blockers: quoteBlockers
  };
}
