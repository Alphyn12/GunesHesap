// Generic CRM/export adapter contract. This module intentionally does not call
// any external CRM API; it provides a stable payload for downstream systems.

import { buildStructuredProposalExport } from './evidence-governance.js';
import { i18n } from './i18n.js';
import { localizeMessageList, statusLabel } from './output-i18n.js';

export const CRM_EXPORT_VERSION = 'GH-CRM-2026.04-v1';

export function buildCrmLeadExport(state = {}, results = {}) {
  const proposal = buildStructuredProposalExport(state, results);
  const gov = results.proposalGovernance || {};
  return {
    schema: 'guneshesap.crm-lead.v1',
    adapterVersion: CRM_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    display: {
      language: i18n.locale || 'tr',
      productName: i18n.t('app.title'),
      title: i18n.t('export.crmLeadTitle'),
      userFacing: i18n.t('export.userFacing'),
      scenario: state.scenarioContext?.label || state.scenarioKey || null,
      confidenceLevel: statusLabel(results.confidenceLevel || gov.confidence?.level || null),
      quoteReadiness: statusLabel(results.quoteReadiness?.status || null),
      blockersLabel: i18n.t('export.blockersLabel'),
      blockers: localizeMessageList(results.quoteReadiness?.blockers || [])
    },
    lead: {
      name: state.customerName || null,
      cityName: state.cityName || null,
      segment: state.tariffType || null,
      scenario: state.scenarioContext?.label || state.scenarioKey || null,
      coordinates: state.lat && state.lon ? { lat: state.lat, lon: state.lon } : null
    },
    qualification: {
      confidenceLevel: results.confidenceLevel || gov.confidence?.level || null,
      confidenceScore: gov.confidence?.score ?? null,
      quoteReadiness: results.quoteReadiness?.status || null,
      blockers: results.quoteReadiness?.blockers || [],
      offgridFieldDataState: results.offgridL2Results?.fieldDataState || null,
      offgridGuaranteeCandidate: !!results.offgridL2Results?.fieldGuaranteeCandidate,
      offgridGuaranteeReady: !!results.offgridL2Results?.fieldGuaranteeReady
    },
    commercial: proposal.commercial,
    approval: proposal.approval,
    evidenceSummary: proposal.evidenceSummary,
    financialSummary: proposal.financialSummary,
    handoff: proposal
  };
}
