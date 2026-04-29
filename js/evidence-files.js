// Browser-side evidence file handling. Files are validated, fingerprinted and
// stored locally in IndexedDB; state stores only the auditable metadata.

import { appendAuditEntry } from './audit-log.js';
import { saveEvidenceBlob } from './storage.js';

export const EVIDENCE_FILE_VERSION = 'GH-EVID-FILE-2026.04-v1';
export const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]);

function cleanString(value, max = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function byteHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function cleanProfileSummary(summary = null) {
  if (!summary || typeof summary !== 'object') return null;
  return {
    annualKwh: Number(summary.annualKwh) || 0,
    peakKwh: Number(summary.peakKwh) || 0,
    positiveHours: Number(summary.positiveHours) || 0,
    zeroHours: Number(summary.zeroHours) || 0
  };
}

function cleanArray(value) {
  return Array.isArray(value) ? value.map(item => String(item || '').trim()).filter(Boolean) : [];
}

function cleanNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanAcceptanceSnapshot(snapshot = null) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const scenarioCoverage = snapshot.scenarioCoverage || {};
  const badWeather = snapshot.badWeatherStress || {};
  const coverage = snapshot.coverage || {};
  const equipment = snapshot.equipment || {};
  return {
    version: cleanString(snapshot.version, 80),
    capturedAt: snapshot.capturedAt || null,
    fieldDataState: cleanString(snapshot.fieldDataState, 80) || null,
    dispatchVersion: cleanString(snapshot.dispatchVersion, 80) || null,
    fieldModelVersion: cleanString(snapshot.fieldModelVersion, 80) || null,
    fieldStressVersion: cleanString(snapshot.fieldStressVersion, 80) || null,
    phase1Ready: snapshot.phase1Ready === true,
    phase2Ready: snapshot.phase2Ready === true,
    phase3Ready: snapshot.phase3Ready === true,
    modelStatus: cleanString(snapshot.modelStatus, 80) || null,
    scenarioCoverage: {
      requiredKeys: cleanArray(scenarioCoverage.requiredKeys),
      executedKeys: cleanArray(scenarioCoverage.executedKeys),
      missingKeys: cleanArray(scenarioCoverage.missingKeys),
      unexpectedKeys: cleanArray(scenarioCoverage.unexpectedKeys)
    },
    badWeatherStress: {
      required: !!badWeather.required,
      evaluated: !!badWeather.evaluated,
      ready: badWeather.ready === true ? true : badWeather.ready === false ? false : null,
      weatherLevel: cleanString(badWeather.weatherLevel, 40) || null,
      consecutiveDays: cleanNumberOrNull(badWeather.consecutiveDays),
      worstWindowDayOfYear: cleanNumberOrNull(badWeather.worstWindowDayOfYear),
      windowCoverage: cleanNumberOrNull(badWeather.windowCoverage),
      windowCriticalCoverage: cleanNumberOrNull(badWeather.windowCriticalCoverage),
      unmetCriticalKwh: cleanNumberOrNull(badWeather.unmetCriticalKwh),
      additionalGeneratorKwh: cleanNumberOrNull(badWeather.additionalGeneratorKwh)
    },
    coverage: {
      totalLoadCoverage: cleanNumberOrNull(coverage.totalLoadCoverage),
      criticalLoadCoverage: cleanNumberOrNull(coverage.criticalLoadCoverage),
      solarBatteryLoadCoverage: cleanNumberOrNull(coverage.solarBatteryLoadCoverage),
      badWeatherWindowCoverage: cleanNumberOrNull(coverage.badWeatherWindowCoverage),
      badWeatherWindowCriticalCoverage: cleanNumberOrNull(coverage.badWeatherWindowCriticalCoverage),
      unmetCriticalKwh: cleanNumberOrNull(coverage.unmetCriticalKwh)
    },
    equipment: {
      generatorEnabled: !!equipment.generatorEnabled,
      generatorCapacityKw: cleanNumberOrNull(equipment.generatorCapacityKw),
      batteryUsableCapacityKwh: cleanNumberOrNull(equipment.batteryUsableCapacityKwh),
      inverterAcLimitKw: cleanNumberOrNull(equipment.inverterAcLimitKw)
    }
  };
}

function cleanOperationSnapshot(snapshot = null) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const telemetry = snapshot.telemetry || {};
  const performance = snapshot.performance || {};
  const maintenance = snapshot.maintenance || {};
  const incident = snapshot.incident || {};
  const monitoring = snapshot.monitoring || {};
  return {
    version: cleanString(snapshot.version, 80),
    capturedAt: snapshot.capturedAt || null,
    evidenceType: cleanString(snapshot.evidenceType, 60) || null,
    phase4Ready: snapshot.phase4Ready === true,
    acceptanceSnapshotStatus: cleanString(snapshot.acceptanceSnapshotStatus, 60) || null,
    acceptanceCapturedAt: snapshot.acceptanceCapturedAt || null,
    fieldDataState: cleanString(snapshot.fieldDataState, 80) || null,
    telemetry: {
      durationDays: cleanNumberOrNull(telemetry.durationDays),
      availabilityPct: cleanNumberOrNull(telemetry.availabilityPct),
      criticalEventCount: cleanNumberOrNull(telemetry.criticalEventCount),
      outageEventCount: cleanNumberOrNull(telemetry.outageEventCount),
      tripCount: cleanNumberOrNull(telemetry.tripCount),
      overloadCount: cleanNumberOrNull(telemetry.overloadCount)
    },
    performance: {
      baselineAccepted: performance.baselineAccepted === true,
      totalLoadCoverage: cleanNumberOrNull(performance.totalLoadCoverage),
      criticalLoadCoverage: cleanNumberOrNull(performance.criticalLoadCoverage),
      badWeatherWindowCoverage: cleanNumberOrNull(performance.badWeatherWindowCoverage),
      badWeatherWindowCriticalCoverage: cleanNumberOrNull(performance.badWeatherWindowCriticalCoverage),
      unmetCriticalKwh: cleanNumberOrNull(performance.unmetCriticalKwh)
    },
    maintenance: {
      logAttached: maintenance.logAttached === true,
      openCriticalItems: cleanNumberOrNull(maintenance.openCriticalItems)
    },
    incident: {
      logAttached: incident.logAttached === true,
      unresolvedCriticalIncidents: cleanNumberOrNull(incident.unresolvedCriticalIncidents)
    },
    monitoring: {
      slaActive: monitoring.slaActive === true,
      responseHours: cleanNumberOrNull(monitoring.responseHours)
    }
  };
}

async function fingerprintFile(file) {
  const buffer = await file.arrayBuffer();
  if (globalThis.crypto?.subtle?.digest) {
    return byteHex(await crypto.subtle.digest('SHA-256', buffer));
  }
  let hash = 0;
  const view = new Uint8Array(buffer);
  for (let i = 0; i < view.length; i += 1) hash = ((hash << 5) - hash + view[i]) | 0;
  return `fallback-${Math.abs(hash).toString(16)}`;
}

export function validateEvidenceFile(file) {
  const errors = [];
  if (!file) errors.push('Dosya seçilmedi.');
  if (file && file.size > MAX_EVIDENCE_FILE_BYTES) errors.push('Kanıt dosyası 10 MB sınırını aşıyor.');
  if (file && file.type && !ALLOWED_EVIDENCE_MIME_TYPES.has(file.type)) {
    errors.push(`Desteklenmeyen dosya türü: ${file.type}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    maxBytes: MAX_EVIDENCE_FILE_BYTES,
    allowedTypes: [...ALLOWED_EVIDENCE_MIME_TYPES]
  };
}

export async function attachEvidenceFile(state = {}, evidenceType, file, user = state.userIdentity || {}, context = {}) {
  const validation = validateEvidenceFile(file);
  const type = cleanString(evidenceType, 40);
  if (!validation.ok) {
    appendAuditEntry(state, 'evidence.validation_failed', { evidenceType: type, errors: validation.errors }, user);
    return { ok: false, errors: validation.errors };
  }

  const sha256 = await fingerprintFile(file);
  const now = new Date().toISOString();
  const profileFingerprint = cleanString(context.profileFingerprint, 80);
  const profileSummary = cleanProfileSummary(context.profileSummary);
  const acceptanceSnapshot = cleanAcceptanceSnapshot(context.acceptanceSnapshot);
  const operationSnapshot = cleanOperationSnapshot(context.operationSnapshot);
  const id = `${type}-${Date.now()}-${sha256.slice(0, 12)}`;
  const metadata = {
    id,
    version: EVIDENCE_FILE_VERSION,
    evidenceType: type,
    name: cleanString(file.name, 180),
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    sha256,
    attachedAt: now,
    storage: 'indexeddb',
    validationStatus: 'validated',
    ...(profileFingerprint ? { profileFingerprint } : {}),
    ...(profileSummary ? { profileSummary } : {}),
    ...(acceptanceSnapshot ? { acceptanceSnapshot } : {}),
    ...(operationSnapshot ? { operationSnapshot } : {})
  };

  await saveEvidenceBlob(metadata, file);
  state.evidence = state.evidence || {};
  const record = state.evidence[type] || { type, status: 'missing' };
  const files = Array.isArray(record.files) ? record.files.slice() : [];
  state.evidence[type] = {
    ...record,
    type,
    status: 'verified',
    validationStatus: 'validated',
    ref: record.ref || metadata.name,
    checkedAt: now.slice(0, 10),
    ...(profileFingerprint ? { profileFingerprint } : {}),
    ...(profileSummary ? { profileSummary } : {}),
    ...(acceptanceSnapshot ? { acceptanceSnapshot } : {}),
    ...(operationSnapshot ? { operationSnapshot } : {}),
    files: [...files, metadata].slice(-10)
  };
  appendAuditEntry(state, 'evidence.file_attached', {
    evidenceType: type,
    fileName: metadata.name,
    size: metadata.size,
    sha256: metadata.sha256,
    profileFingerprint: metadata.profileFingerprint || null,
    storage: metadata.storage
  }, user);
  return { ok: true, metadata };
}
