// Append-only local audit log helpers.

export const AUDIT_LOG_VERSION = 'GH-AUDIT-2026.04-v1';
const MAX_AUDIT_ENTRIES = 500;

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value, max = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function cleanDetails(details = {}) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  const out = {};
  Object.entries(details).slice(0, 40).forEach(([key, value]) => {
    const safeKey = cleanString(key, 80);
    if (!safeKey) return;
    if (typeof value === 'number' || typeof value === 'boolean' || value == null) out[safeKey] = value;
    else if (typeof value === 'string') out[safeKey] = cleanString(value, 500);
    else out[safeKey] = cleanString(JSON.stringify(value), 500);
  });
  return out;
}

export function createAuditEntry(action, details = {}, user = {}, timestamp = nowIso()) {
  const name = cleanString(user.name || user.displayName || user.id || 'local-user', 80) || 'local-user';
  const role = cleanString(user.role || 'unknown', 40) || 'unknown';
  // Geçersiz timestamp string'i Date.parse → NaN üretir; ID kuyruğunda NaN kalmasın
  // diye Date.now() fallback'i kullanılır. timestamp alanını da güvenli ISO'ya çevirir.
  const parsedTs = Date.parse(timestamp);
  const safeTimestamp = Number.isFinite(parsedTs) ? timestamp : nowIso();
  const idSeed = Number.isFinite(parsedTs) ? parsedTs : Date.now();
  return {
    id: `audit-${idSeed}-${Math.random().toString(36).slice(2, 8)}`,
    version: AUDIT_LOG_VERSION,
    timestamp: safeTimestamp,
    action: cleanString(action, 120) || 'unknown',
    user: { id: cleanString(user.id || name, 80), name, role },
    details: cleanDetails(details)
  };
}

export function appendAuditEntry(state = {}, action, details = {}, user = state.userIdentity || {}) {
  const current = Array.isArray(state.auditLog) ? state.auditLog : [];
  const next = [...current, createAuditEntry(action, details, user)].slice(-MAX_AUDIT_ENTRIES);
  state.auditLog = next;
  return next[next.length - 1];
}

export function summarizeAuditLog(auditLog = {}, max = 12) {
  return (Array.isArray(auditLog) ? auditLog : []).slice(-max).reverse();
}
