// Local identity and role checks for proposal workflow.
//
// ⚠ SECURITY NOTE (FIX-10): This module operates entirely client-side.
// User roles and identities are stored in window.state / localStorage and are
// trivially spoofable by any end-user. The "approver" and "admin" roles grant
// the ability to approve proposals in this browser session only — there is NO
// server-side authorization, digital signature, or cryptographic identity
// verification. Before using approval records as legally binding or as a trust
// signal in external systems, integrate a proper server-side auth layer (e.g.
// OAuth 2.0 / OIDC, company SSO, or a signed JWT from a backend endpoint).
//
// The basisHash in approval records is an FNV-1a hash of local state for
// change-detection purposes only — it is NOT a cryptographic commitment.

export const IDENTITY_VERSION = 'GH-ID-2026.04-v1';

export const USER_ROLES = ['sales', 'engineer', 'approver', 'admin'];
const APPROVAL_ROLES = new Set(['approver', 'admin']);

function cleanString(value, max = 120) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

export function normalizeUserIdentity(input = {}) {
  const role = USER_ROLES.includes(input.role) ? input.role : 'sales';
  const name = cleanString(input.name || input.displayName || 'local-user', 80) || 'local-user';
  return {
    version: IDENTITY_VERSION,
    id: cleanString(input.id || name.toLowerCase().replace(/[^a-z0-9]+/gi, '-'), 80) || 'local-user',
    name,
    role
  };
}

export function canApproveProposal(user = {}) {
  return APPROVAL_ROLES.has(normalizeUserIdentity(user).role);
}

export function describeApprover(user = {}) {
  const normalized = normalizeUserIdentity(user);
  return `${normalized.name} (${normalized.role})`;
}
