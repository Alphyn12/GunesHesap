// ═══════════════════════════════════════════════════════════
// UI RENDER — Sonuç gösterimi, PDF, Share
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════
import { PANEL_TYPES, MONTHS, COMPASS_DIRS } from './data.js';
import { convertTry, renderExchangeRateStatus } from './exchange-rate.js';
import { i18n } from './i18n.js';
import { localeTag, localizeKnownMessage, localizeMessageList, statusLabel, tx } from './output-i18n.js';
import { createShareStateSnapshot, escapeHtml, sanitizeSharedState } from './security.js';
import { buildStructuredProposalExport } from './evidence-governance.js';
import { buildCrmLeadExport } from './crm-export.js';
import { resolvePanelSpec } from './calc-core.js';

let monthlyChart = null;

function moneyContext(state = window.state) {
  const currency = state.displayCurrency || 'TRY';
  const usdToTry = Math.max(0.0001, Number(state.usdToTry) || 38.5);
  const suffix = currency === 'USD' ? 'USD' : 'TL';
  const locale = currency === 'USD' ? 'en-US' : 'tr-TR';
  return { currency, usdToTry, suffix, locale };
}

function money(value, opts = {}) {
  const ctx = moneyContext();
  const raw = Number(value) || 0;
  const converted = convertTry(raw, ctx.currency, ctx.usdToTry);
  const digits = opts.digits ?? (ctx.currency === 'USD' ? 0 : 0);
  return converted.toLocaleString(ctx.locale, { maximumFractionDigits: digits, minimumFractionDigits: opts.minDigits ?? 0 }) + ' ' + ctx.suffix;
}

function moneyRate(value, unit = 'kWh') {
  const ctx = moneyContext();
  const raw = Number(value) || 0;
  const converted = convertTry(raw, ctx.currency, ctx.usdToTry);
  return converted.toLocaleString(ctx.locale, { maximumFractionDigits: ctx.currency === 'USD' ? 3 : 2 }) + ` ${ctx.suffix}/${unit}`;
}

export function formatPaybackYears(value, yearLabel = i18n.t('units.year')) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return `>25 ${yearLabel}`;
  const display = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
  return `${display} ${yearLabel}`;
}

function setSignedFinancialClass(el, value) {
  if (!el) return;
  el.classList.remove('positive', 'negative');
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return;
  el.classList.add(numeric > 0 ? 'positive' : 'negative');
}

function setVisible(el, visible, display = '') {
  if (window.setElementVisible) return window.setElementVisible(el, visible, display);
  if (!el) return;
  el.classList.toggle('is-hidden', !visible);
  el.style.display = visible ? display : 'none';
}

// Faz-3 D7: explicit weather-provenance labels so a "8760-hour simulation" badge
// can never imply "real meteorology" when the actual data is a clear-sky scaling
// or deterministic PSH model. Mirrors the synthetic set guarded by the
// frontend authoritative-backend gate and turkey-regulation.js quote-readiness.
const WEATHER_SOURCE_DISCLOSURE = {
  'pvgis-live':                     { label: 'PVGIS canlı (gerçek)',         synthetic: false },
  'pvgis-tmy':                      { label: 'PVGIS TMY (gerçek)',           synthetic: false },
  'pvgis-hourly':                   { label: 'PVGIS saatlik (gerçek)',       synthetic: false },
  'era5-hourly':                    { label: 'ERA5 saatlik (gerçek)',        synthetic: false },
  'measured-tmy':                   { label: 'Ölçülmüş TMY (gerçek)',        synthetic: false },
  'real-meteorology':               { label: 'Gerçek meteoroloji',           synthetic: false },
  'clearsky-scaled-synthetic':      { label: 'Bulutsuz gökyüzü (sentetik)',  synthetic: true  },
  'psh-deterministic-synthetic':    { label: 'PSH deterministik (sentetik)', synthetic: true  },
  'monthly-derived-synthetic-pv':   { label: 'Aylıktan türetilmiş (sentetik)', synthetic: true },
  'monthly-production-derived-synthetic-8760': { label: 'Aylıktan türetilmiş 8760 (sentetik)', synthetic: true }
};

function resolveWeatherSourceMeta(results = {}) {
  const key =
    results.authoritativeEngineSource?.weatherSource
    || results.engineSource?.weatherSource
    || results.authoritativeEngineResponse?.engineSource?.weatherSource
    || results.authoritativeEngineResponse?.production?.weatherSource
    || results.authoritativeEngineResponse?.production?.assumption_flags?.weatherSource
    || results.authoritativeEngineResponse?.losses?.weatherSource
    || (results.usedFallback ? 'psh-deterministic-synthetic'
        : results.authoritativeEngineMode === 'browser-pvgis' ? 'pvgis-live'
        : null);
  if (!key) return null;
  return { key, ...(WEATHER_SOURCE_DISCLOSURE[key] || { label: key, synthetic: false }) };
}

function engineSummaryText(results = {}, state = window.state || {}) {
  const source = results.authoritativeEngineSource || results.engineSource || results.backendEngineSource;
  const fallback = results.authoritativeEngineFallbackReason || (state.backendEngineAvailable === false ? state.backendEngineLastError : '');
  const weather = resolveWeatherSourceMeta(results);
  const weatherSuffix = weather
    ? ` · Hava modeli: ${weather.label}${weather.synthetic ? ' ⚠' : ''}`
    : '';
  if (fallback) return `Canlı veri geçici olarak alınamadı; yerel tahmin modeli kullanıldı.${weatherSuffix}`;
  if (source?.pvlibBacked || source?.source) {
    const sourceLabel = source?.source ? ` (${source.source})` : '';
    return `Canlı güneş verisiyle desteklenen hesaplama kullanıldı${sourceLabel}.${weatherSuffix}`;
  }
  return `Yerel tahmin modeliyle hesaplama yapıldı.${weatherSuffix}`;
}

function backendEngineText(results = {}, state = window.state || {}) {
  const source = results.authoritativeEngineSource || results.engineSource || results.backendEngineSource || results.backendEngineResponse?.engineSource;
  const weather = resolveWeatherSourceMeta(results);
  const weatherTag = weather ? ` / hava: ${weather.label}${weather.synthetic ? ' (sentetik)' : ''}` : '';
  if (source) {
    const backed = source.pvlibBacked ? 'pvlib-backed' : source.fallbackUsed || results.authoritativeEngineFallbackReason ? i18n.t('engine.fallback') : i18n.t('engine.primary');
    const annual = results.authoritativeEngineResponse?.production?.annualEnergyKwh || results.backendEngineResponse?.production?.annualEnergyKwh || results.annualEnergy;
    const energy = annual ? ` / ${Number(annual).toLocaleString(localeTag())} kWh/${i18n.t('units.year')}` : '';
    return `${source.provider || 'engine'} / ${source.source || results.calculationMode || '—'} / ${backed}${energy}${weatherTag}`;
  }
  return state.backendEngineAvailable === false
    ? `${i18n.t('engine.fallbackActive')} / ${state.backendEngineLastError || i18n.t('engine.backendUnavailable')}${weatherTag}`
    : `${i18n.t('engine.browserActive')}${weatherTag}`;
}

function offgridStatColorModifier(color) {
  if (color === 'var(--danger)' || color === 'danger') return 'offgrid-stat-card--danger';
  if (color === 'var(--success)' || color === 'good') return 'offgrid-stat-card--success';
  if (color === '#F97316' || color === 'warn') return 'offgrid-stat-card--orange';
  if (color === '#94A3B8') return 'offgrid-stat-card--gray';
  if (color === 'rgba(71,85,105,0.18)') return 'offgrid-stat-card--subtle';
  return 'offgrid-stat-card--primary';
}
function offgridStatCard({ value, label, note = '', color = 'var(--primary)' }) {
  return `
    <article class="offgrid-stat-card ${offgridStatColorModifier(color)}">
      <div class="offgrid-stat-value">${escapeHtml(String(value))}</div>
      <div class="offgrid-stat-label">${escapeHtml(label)}</div>
      ${note ? `<div class="offgrid-stat-note">${escapeHtml(note)}</div>` : ''}
    </article>
  `;
}

function offgridChipCard({ label, value, note = '' }) {
  return `
    <article class="offgrid-chip-card">
      <span class="offgrid-chip-label">${escapeHtml(label)}</span>
      <span class="offgrid-chip-value">${escapeHtml(String(value))}</span>
      ${note ? `<span class="bess-detail-note">${escapeHtml(note)}</span>` : ''}
    </article>
  `;
}

function offgridDetailCard({ label, value, note = '' }) {
  return `
    <article class="bess-detail-card">
      <span class="bess-detail-label">${escapeHtml(label)}</span>
      <span class="bess-detail-value">${escapeHtml(String(value))}</span>
      ${note ? `<span class="bess-detail-note">${escapeHtml(note)}</span>` : ''}
    </article>
  `;
}

function offgridFinancialBasisMeta(basis) {
  switch (basis) {
    case 'off-grid-user-alternative-energy-cost':
      return {
        label: i18n.t('offgridL2.financialBasisUserAlternative'),
        warning: ''
      };
    case 'off-grid-grid-tariff-times-2_5-proxy':
      return {
        label: i18n.t('offgridL2.financialBasisGridProxy'),
        warning: i18n.t('offgridL2.financialBasisProxyWarning')
      };
    default:
      return {
        label: basis || '—',
        warning: ''
      };
  }
}

function offgridFieldDataStateMeta(L = {}) {
  const state = L.fieldDataState || L.dataLineage?.fieldDataState || 'synthetic';
  if (state === 'field-guarantee-ready') {
    return { label: i18n.t('offgridL2.fieldDataStateGuaranteed'), note: i18n.t('offgridL2.fieldDataStateNoteGuaranteed'), tone: 'ok' };
  }
  if (state === 'accepted-hourly-evidence') {
    return { label: i18n.t('offgridL2.fieldDataStateAccepted'), note: i18n.t('offgridL2.fieldDataStateNoteAccepted'), tone: 'ok' };
  }
  if (state === 'field-input-ready') {
    return { label: i18n.t('offgridL2.fieldDataStateInputReady'), note: i18n.t('offgridL2.fieldDataStateNoteInputReady'), tone: 'warn' };
  }
  if (state === 'hybrid-hourly') {
    return { label: i18n.t('offgridL2.fieldDataStateHybrid'), note: i18n.t('offgridL2.fieldDataStateNoteHybrid'), tone: 'warn' };
  }
  return { label: i18n.t('offgridL2.fieldDataStateSynthetic'), note: i18n.t('offgridL2.fieldDataStateNoteSynthetic'), tone: 'danger' };
}

function offgridStressScenarioLabel(row = {}) {
  return row.label || row.key || '—';
}

function isOffgridCoverageApproximate(L = {}) {
  const hasRealHourlyPv = L.productionDispatchProfile === 'real-hourly-pv-8760'
    || !!L.productionDispatchMetadata?.hasRealHourlyProduction;
  const hasRealHourlyLoad = !!L.hasRealHourlyLoad || L.loadMode === 'hourly-8760';
  return !(hasRealHourlyPv && hasRealHourlyLoad);
}

function formatOffgridCoverageValue(value, L = {}, { decimals = 1 } = {}) {
  const pct = Math.max(0, Math.min(100, (Number(value) || 0) * 100));
  if (!isOffgridCoverageApproximate(L)) return `${pct.toFixed(decimals)}%`;
  if (pct >= 99.5) return '>%98';
  if (pct >= 97) return '95-99%';
  if (pct >= 92) return '90-97%';
  if (pct >= 85) return '85-95%';
  if (pct >= 75) return '75-90%';
  return `~${pct.toFixed(0)}%`;
}

function hasDefinedCriticalLoad(L = {}) {
  return Number(L.annualCriticalLoadKwh) > 0;
}

function criticalLoadUndefinedText() {
  return i18n.t('offgridL2.criticalLoadNotDefinedShort');
}

function offgridCoverageInterpretationMeta(L = {}) {
  if (!hasDefinedCriticalLoad(L)) {
    return {
      total: i18n.t('offgridL2.coverageNoteApprox'),
      critical: i18n.t('offgridL2.criticalLoadNotDefinedNote')
    };
  }
  if (!isOffgridCoverageApproximate(L)) {
    return {
      total: i18n.t('offgridL2.coverageNoteMeasured'),
      critical: i18n.t('offgridL2.criticalCoverageNoteMeasured')
    };
  }
  return {
    total: i18n.t('offgridL2.coverageNoteApprox'),
    critical: i18n.t('offgridL2.criticalCoverageNoteApprox')
  };
}

function offgridSyntheticPeakMeta(L = {}) {
  const peak = L.syntheticPeakModel || null;
  if (!peak || !peak.peakEnvelopeApplied) return null;
  const calibration = peak.fieldCalibration || null;
  const isFieldCalibrated = peak.peakModel === 'field-calibrated-peak-envelope' && calibration?.applied;
  return {
    label: i18n.t(isFieldCalibrated ? 'offgridL2.syntheticPeakModelFieldCalibrated' : 'offgridL2.syntheticPeakModelConservative'),
    severity: i18n.t(`offgridL2.syntheticPeakSeverity_${peak.severity || 'medium'}`),
    note: (isFieldCalibrated
      ? i18n.t('offgridL2.syntheticPeakFieldCalibrationNote')
        .replace('{peak}', Number(calibration?.observedPeakKw || 0).toFixed(1))
        .replace('{p95}', Number(calibration?.observedP95Kw || 0).toFixed(1))
        .replace('{days}', Number(calibration?.durationDays || 0).toFixed(1))
        .replace('{trips}', Math.round(Number(calibration?.tripCount || 0)).toLocaleString(localeTag()))
        .replace('{overloads}', Math.round(Number(calibration?.overloadCount || 0)).toLocaleString(localeTag()))
      : i18n.t('offgridL2.syntheticPeakNote')
      .replace('{factor}', Number(peak.peakEnvelopeMaxFactor || 1).toFixed(2))
      .replace('{delta}', Number(peak.peakDeltaKw || 0).toFixed(1))
      .replace('{hours}', Math.round(Number(peak.peakEnvelopeHours) || 0).toLocaleString(localeTag())))
  };
}

function offgridSyntheticPvMeta(L = {}) {
  const weatherMeta = L.productionDispatchMetadata?.syntheticWeatherMetadata || null;
  if (!L.productionDispatchMetadata?.synthetic || !weatherMeta) return null;
  return {
    label: i18n.t('offgridL2.syntheticPvWeatherModelClustered'),
    note: i18n.t('offgridL2.syntheticPvWeatherNote')
      .replace('{days}', Math.round(Number(weatherMeta.longestLowPvClusterDays) || 0).toLocaleString(localeTag()))
      .replace('{min}', Number(((weatherMeta.minimumDailyFractionOfAverage || 0) * 100)).toFixed(0))
      .replace('{max}', Number(((weatherMeta.maximumDailyFractionOfAverage || 0) * 100)).toFixed(0))
  };
}

function offgridDesignCorrectionMeta(L = {}) {
  const correction = L.designCorrections || null;
  if (!correction) return null;
  const reasons = Array.isArray(correction.reasons) ? correction.reasons : [];
  const reasonText = reasons.slice(0, 3).map(reason => i18n.t(`offgridL2.designCorrectionReason_${reason}`)).join(', ');
  const triggerPeak = Number(correction.triggers?.modeledPeakKw || 0).toFixed(1);
  const currentSurge = Number(correction.current?.inverterSurgeLimitKw || 0).toFixed(1);
  return {
    severity: i18n.t(`offgridL2.syntheticPeakSeverity_${correction.severity || 'medium'}`),
    title: i18n.t('offgridL2.designCorrectionTitle'),
    note: i18n.t('offgridL2.designCorrectionSummary')
      .replace('{peak}', triggerPeak)
      .replace('{surge}', currentSurge)
      .replace('{reason}', reasonText || i18n.t('offgridL2.designCorrectionReason_dispatch-inverter-power-limit'))
  };
}

export function renderResults() {
  const state = window.state;
  const r = state.results;
  const p = PANEL_TYPES[state.panelType];
  const activeLocale = localeTag();
  renderExchangeRateStatus();

  window.animateCounter('kpi-energy', r.annualEnergy, v => Math.round(v).toLocaleString(activeLocale));
  // Faz-4 Fix-15: P50/P90 confidence band below the annual energy KPI
  const bandEl = document.getElementById('kpi-energy-band');
  if (bandEl && r.energyP90 && r.energyP10) {
    bandEl.textContent = `P90: ${r.energyP90.toLocaleString(activeLocale)} – P10: ${r.energyP10.toLocaleString(activeLocale)} kWh`;
    bandEl.style.display = '';
  } else if (bandEl) {
    bandEl.style.display = 'none';
  }
  window.animateCounter('kpi-savings', r.annualSavings, v => money(v));
  window.animateCounter('kpi-power', r.systemPower, v => v.toFixed(2));
  window.animateCounter('kpi-co2', parseFloat(r.co2Savings), v => v.toFixed(2));
  document.getElementById('kpi-panels-sub').textContent = `${r.panelCount} ${i18n.t('units.panelUnit')}`;
  document.getElementById('kpi-tree-sub').textContent = `≈ ${r.trees} ${i18n.t('units.treeEquivalent')}`;
  const scenarioLabel = document.getElementById('result-scenario-label');
  const scenarioFrame = document.getElementById('result-scenario-frame');
  const engineSource = document.getElementById('result-engine-source');
  if (scenarioLabel) scenarioLabel.textContent = state.scenarioContext?.label || 'On-Grid';
  if (scenarioFrame) {
    scenarioFrame.innerHTML = `
      <span class="result-context-main">${escapeHtml(state.scenarioContext?.resultFrame || 'Grid-connected savings and proposal readiness')}</span>
      <span class="result-context-caution">${escapeHtml(state.scenarioContext?.resultCaution || i18n.t('report.preFeasibilityDisclaimer'))}</span>
    `;
  }
  if (engineSource) engineSource.textContent = engineSummaryText(r, state);
  const resultAlertStack = document.getElementById('result-alert-stack');
  if (resultAlertStack) {
    const status = statusLabel(r.quoteReadiness?.status || r.confidenceLevel || '—');
    const quoteBlockers = localizeMessageList(r.quoteReadiness?.blockers || []);
    const calcWarnings = localizeMessageList(Array.isArray(r.calculationWarnings) ? r.calculationWarnings : []);
    const prominentWarnings = [...new Set([...quoteBlockers, ...calcWarnings])].slice(0, 3);
    const alertCards = [
      `
        <div id="result-trust-note" class="result-trust-note ui-callout ui-callout--warn" data-testid="result-trust-note" role="status">
          <strong>${escapeHtml(i18n.t('report.trustNoteTitle'))}: ${escapeHtml(status)}</strong>
          <span>${escapeHtml(state.scenarioContext?.nextAction || i18n.t('onGridResult.commercialNextAction'))}</span>
        </div>
      `
    ];
    if (state.scenarioKey === 'off-grid') {
      alertCards.push(`
        <div class="result-alert-banner result-alert-banner--danger ui-callout ui-callout--danger" data-testid="result-offgrid-warning" role="alert">
          <strong>${escapeHtml(i18n.t('offGrid.preFeasibilityOnly'))}</strong>
          <span>${escapeHtml(i18n.t('offGrid.notFeasibilityAnalysis'))}</span>
        </div>
      `);
    }
    if (r.settlementProvisional) {
      alertCards.push(`
        <div id="result-settlement-banner" class="result-alert-banner result-alert-banner--warn ui-callout ui-callout--warn" data-testid="result-settlement-warning" role="alert">
          <strong>${escapeHtml(i18n.t('onGridResult.settlementProvisionalBannerTitle'))}</strong>
          <span>${escapeHtml(i18n.t('onGridResult.settlementProvisionalBannerBody'))}</span>
        </div>
      `);
    }
    if (prominentWarnings.length) {
      alertCards.push(`
        <div class="result-alert-banner result-alert-banner--warn ui-callout ui-callout--warn" data-testid="result-prominent-warnings" role="alert">
          <strong>${escapeHtml(i18n.t('audit.warningsTitle'))}</strong>
          <ul class="result-alert-list">${prominentWarnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>
      `);
    }
    resultAlertStack.innerHTML = alertCards.join('');
  }

  const savingsUnit = document.querySelector('#step-7 .kpi-card:nth-child(2) .kpi-unit');
  if (savingsUnit) {
    savingsUnit.textContent = (state.displayCurrency === 'USD' ? `USD / ${i18n.t('units.year')}` : `TL / ${i18n.t('units.year')}`);
  }
  // Faz-2 Fix-8: When commercial tax recovery is active, show gross / KDV / net-basis
  // breakdown so the user understands which cost drives NPV/payback calculations.
  const finCostEl = document.getElementById('fin-cost');
  if (finCostEl) {
    const grossCost  = r.totalCost;
    const netBasis   = r.financialCostBasis;
    const kdvAmt     = r.costBreakdown?.kdv ?? 0;
    const taxActive  = state.taxEnabled && kdvAmt > 0 && netBasis < grossCost;
    if (taxActive) {
      finCostEl.innerHTML =
        `${money(grossCost)}<span class="cost-amount-helper">` +
        `KDV: ${money(kdvAmt)} · ${i18n.t('kdv.financialBasisLabel')}: <strong>${money(netBasis)}</strong></span>`;
    } else {
      finCostEl.textContent = money(grossCost);
    }
  }
  document.getElementById('fin-payback').textContent = formatPaybackYears(r.grossSimplePaybackYear);
  const discountedPaybackEl = document.getElementById('fin-discounted-payback');
  if (discountedPaybackEl) discountedPaybackEl.textContent = formatPaybackYears(r.discountedPaybackYear);
  const finTotalEl = document.getElementById('fin-total');
  if (finTotalEl) {
    finTotalEl.textContent = money(r.npvTotal);
    setSignedFinancialClass(finTotalEl, r.npvTotal);
  }
  const finRoiEl = document.getElementById('fin-roi');
  if (finRoiEl) {
    const nominalReturn = r.nominalTotalReturnPct ?? r.roi;
    finRoiEl.textContent = nominalReturn + '%';
    setSignedFinancialClass(finRoiEl, nominalReturn);
  }
  // ROI etiketi: childNodes[0].nodeValue yerine dedikli span (tooltip yapısı değişse bile sağlam).
  const finRoiLabelText = document.querySelector('#fin-roi-label .fin-label-text');
  if (finRoiLabelText) finRoiLabelText.textContent = `${i18n.t('onGridResult.roiLabel')} `;
  const finRoiTooltip = document.querySelector('#fin-roi-label .tooltip-box');
  if (finRoiTooltip) finRoiTooltip.textContent = i18n.t('onGridResult.roiTooltip');
  const finIrrEl = document.getElementById('fin-irr');
  if (finIrrEl) {
    finIrrEl.textContent = r.irr === 'N/A' ? 'N/A' : r.irr + '%';
    setSignedFinancialClass(finIrrEl, r.irr === 'N/A' ? null : r.irr);
  }
  document.getElementById('fin-lcoe').textContent = moneyRate(r.compensatedLcoe || r.lcoe, 'kWh');

  const omRow = document.getElementById('fin-om-row');
  const invRow = document.getElementById('fin-inverter-row');
  if (r.annualOMCost > 0 || r.annualInsurance > 0) {
    if (omRow) { omRow.style.display = ''; document.getElementById('fin-om-cost').textContent = '-' + money(r.annualOMCost + r.annualInsurance) + `/${i18n.t('units.year')}`; }
    if (invRow) { invRow.style.display = ''; document.getElementById('fin-inverter-cost').textContent = '-' + money(r.inverterReplaceCost); }
  } else {
    if (omRow) omRow.style.display = 'none';
    if (invRow) invRow.style.display = 'none';
  }
  const paybackPct = Math.min(((r.grossSimplePaybackYear || 25) / 15) * 100, 100);
  document.getElementById('payback-bar').style.width = paybackPct + '%';

  const engReportBody = document.getElementById('eng-report-body');
  if (engReportBody) {
    engReportBody.innerHTML = '';
    engReportBody.classList.remove('open');
  }
  document.getElementById('eng-report-toggle')?.classList.remove('open');
  document.getElementById('eng-chevron')?.classList.remove('open');

  const tbody = document.getElementById('tech-table-body');
  tbody.innerHTML = '';
  const tt = k => i18n.t(`techTable.${k}`);
  const annualLoad = Math.round(r.hourlySummary?.annualLoad || state.dailyConsumption * 365 || 0);
  const roofAreaTotal = (Number(state.roofArea) || 0) + (state.multiRoof ? (state.roofSections || []).reduce((s, sec) => s + (Number(sec.area) || 0), 0) : 0);
  const roofUseArea = (p.areaM2 || 0) * (Number(r.panelCount) || 0);
  const coveragePct = annualLoad > 0 ? Math.min(999, (Number(r.annualEnergy || 0) / annualLoad) * 100) : 0;
  const rows = [
    [tt('summarySystemSize'), `${r.systemPower.toFixed(2)} kWp · ${r.panelCount} ${i18n.t('report.panelCountUnit')}`],
    [tt('summaryRoofUse'), roofAreaTotal > 0 ? `${roofUseArea.toFixed(1)} m² panel yerleşimi / ${roofAreaTotal.toFixed(1)} m² alan` : '—'],
    [tt('summaryAnnualProduction'), `${Number(r.annualEnergy || 0).toLocaleString(activeLocale)} kWh/${i18n.t('units.year')}`],
    [tt('summaryMonthlyAverage'), `${Math.round((Number(r.annualEnergy || 0) / 12)).toLocaleString(activeLocale)} kWh/ay`],
    [tt('summaryConsumption'), `${annualLoad.toLocaleString(activeLocale)} kWh/${i18n.t('units.year')}`],
    [tt('summaryCoverage'), `%${coveragePct.toFixed(0)} civarı`],
    [tt('summaryOrientation'), `${state.azimuthName || '—'} · ${state.tilt}° eğim`],
    [tt('summarySavingsEffect'), money(r.annualSavings)],
    [i18n.t('settings.currency'), state.displayCurrency === 'USD' ? `USD · 1 USD = ${Number(state.usdToTry || 0).toLocaleString(activeLocale)} TL` : 'TRY'],
    [tt('summaryPayback'), formatPaybackYears(r.grossSimplePaybackYear)],
    [tt('summarySource'), engineSummaryText(r, state)],
    [tt('summaryNextStep'), state.scenarioContext?.nextAction || i18n.t('onGridResult.commercialNextAction')],
  ];
  rows.forEach(([k, v]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${k}</td><td>${escapeHtml(v)}</td>`;
    tbody.appendChild(tr);
  });

  // ── Kurulum yüzeyleri kırılımı ────────────────────────────────────────────
  const sectionCard = document.getElementById('section-breakdown-card');
  const sectionBody = document.getElementById('section-breakdown-body');
  if (r.sectionResults && r.sectionResults.length > 1 && sectionCard && sectionBody) {
    sectionCard.style.display = 'block';
    sectionBody.innerHTML = '';
    let totalPC = 0, totalPow = 0, totalE = 0;
    r.sectionResults.forEach((sec, i) => {
      totalPC  += sec.panelCount;
      totalPow += sec.systemPower;
      totalE   += sec.annualEnergy;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i18n.t('techTable.sectionLabel').replace('{n}', i + 1)}</td>
        <td>${escapeHtml(sec.sectionArea)} m²</td>
        <td>${escapeHtml(sec.sectionAzimuthName)}</td>
        <td>${escapeHtml(sec.sectionTilt)}°</td>
        <td>${sec.panelCount}</td>
        <td>${sec.systemPower.toFixed(2)}</td>
        <td>${Math.round(sec.annualEnergy).toLocaleString(activeLocale)} kWh</td>`;
      sectionBody.appendChild(tr);
    });
    const totalRow = document.createElement('tr');
    totalRow.className = 'section-total-row';
    totalRow.innerHTML = `
      <td>${i18n.t('techTable.sectionTotal')}</td><td>—</td><td>—</td><td>—</td>
      <td>${totalPC}</td>
      <td>${totalPow.toFixed(2)}</td>
      <td>${Math.round(totalE).toLocaleString(activeLocale)} kWh</td>`;
    sectionBody.appendChild(totalRow);
  } else if (sectionCard) {
    sectionCard.style.display = 'none';
  }

  const avgConsumption = state.dailyConsumption ? Math.round(state.dailyConsumption * 30) : Math.round(r.annualEnergy / 12 * 0.6);
  renderMonthlyChart(r.monthlyData, avgConsumption);
  window.renderPRGauge(r.usedFallback ? null : parseFloat(r.pr));

  renderBESSResults(r.bessMetrics);
  renderOffgridL2Results(r.offgridL2Results, state);
  renderNMResults(r.nmMetrics, state.netMeteringEnabled);
  renderOnGridResultLayers(state, r);
  document.getElementById('audit-panel-card')?.remove();
  updateTurkeyMapDot(state.lat, state.lon, state.cityName);
  renderBomResults(r.costBreakdown?.bom);

  // Faz B: Fatura analizi sonuçları
  if (r.billAnalysis) renderBillAnalysisResults(r.billAnalysis);
  else { const _bc = document.getElementById('bill-result-card'); if (_bc) _bc.style.display = 'none'; }

  // Faz C: EV Şarj sonuçları
  renderEVResults(r.evMetrics);

  // Faz C: Isı Pompası sonuçları
  renderHeatPumpResults(r.heatPumpMetrics);

  // Faz C: Yapısal kontrol sonuçları
  renderStructuralResults(r.structuralCheck);

  // Faz D: Vergi avantajı
  renderTaxResults(r.taxMetrics);

  // Karşılaştırmalı dashboard güncelle
  if (window.updateDashboard) window.updateDashboard();
}

function renderBESSResults(bess) {
  const section = document.getElementById('bess-result-section');
  if (!section) return;
  if (!bess) { setVisible(section, false); return; }
  const isOffGrid = window.state?.scenarioKey === 'off-grid';
  const detailRow = document.getElementById('bess-detail-row');
  const noteStrip = document.getElementById('bess-note-strip');
  setVisible(section, true, 'block');
  document.getElementById('bess-model-badge').textContent = bess.modelName || 'Batarya';
  document.getElementById('bess-independence').textContent = `${bess.gridIndependence}%`;
  document.getElementById('bess-night').textContent = `${bess.nightCoverage}%`;
  const autonomyPct = Number.isFinite(Number(bess.autonomousDaysPct)) ? `${Number(bess.autonomousDaysPct).toFixed(1)}%` : '—';
  const autonomyDays = Number.isFinite(Number(bess.autonomousDays)) ? `${Math.round(Number(bess.autonomousDays))} gün/yıl` : '—';
  const detailItems = [
    {
      label: 'Kullanılabilir kapasite',
      value: `${bess.usableCapacity} kWh`,
      note: 'Bataryada gerçek kullanıma ayrılan enerji'
    },
    {
      label: 'Yıllık batarya kullanımı',
      value: `${Number(bess.batteryStored || 0).toLocaleString(localeTag())} kWh`,
      note: 'Gündüz depolanıp sonra kullanılan toplam enerji'
    },
    {
      label: 'Tahmini çevrim',
      value: `${bess.cyclesPerYear || '—'} / yıl`,
      note: 'Bataryanın yıl içindeki yaklaşık şarj-deşarj sayısı'
    },
    {
      label: 'Batarya maliyeti',
      value: money(bess.batteryCost),
      note: 'Seçili batarya paketi için tahmini yatırım'
    }
  ];
  if (isOffGrid) {
    detailItems.push(
      {
        label: 'Batarya güç sınırı',
        value: `${bess.batteryMaxChargeKw || '—'} / ${bess.batteryMaxDischargeKw || '—'} kW`,
        note: 'Bataryanın aynı anda şarj ve deşarj limiti'
      },
      {
        label: 'İnverter çıkış sınırı',
        value: `${bess.inverterAcLimitKw || '—'} kW AC`,
        note: 'Aynı anda taşınabilecek en yüksek AC güç'
      }
    );
  }
  if (bess.autonomousDaysPct != null) {
    detailItems.push(
      {
        label: 'Tahmini bağımsız gün',
        value: autonomyDays,
        note: `Yalnız güneş ve batarya ile idare edebileceği süre (${autonomyPct})`
      },
      {
        label: 'Karşılanamayan enerji',
        value: `${Number(bess.unmetLoadKwh || 0).toLocaleString(localeTag())} kWh/yıl`,
        note: 'Bu kısım için ek batarya, jeneratör veya daha büyük sistem gerekir'
      }
    );
  }
  if (detailRow) detailRow.innerHTML = detailItems.map(offgridDetailCard).join('');
  if (noteStrip) {
    noteStrip.innerHTML = isOffGrid
      ? `
        <div class="offgrid-note offgrid-note--warn"><strong>Ön değerlendirme:</strong> ${escapeHtml(i18n.t('offGrid.syntheticDispatchNote'))}</div>
        <div class="offgrid-note offgrid-note--danger"><strong>Dikkat:</strong> ${escapeHtml(i18n.t('offGrid.notFeasibilityAnalysis'))}</div>
      `
      : `<div class="offgrid-note offgrid-note--warn"><strong>Not:</strong> Model sabit batarya kapasitesi varsayar. Gerçekte LFP piller ~3.000–5.000 çevrimde %80'e iner; 10+ yılda özerklik değerleri bu tablodan düşük çıkabilir.</div>`;
  }
}

function renderOffgridL2Results(offgridL2Results, state) {
  const section = document.getElementById('offgrid-l2-result-section');
  if (!section) return;

  if (state?.scenarioKey !== 'off-grid' || !offgridL2Results) {
    setVisible(section, false);
    return;
  }
  setVisible(section, true, 'block');

  const L = offgridL2Results;
  const locale = localeTag();
  const accuracy = L.accuracyAssessment || null;
  const criticalLoadDefined = hasDefinedCriticalLoad(L);
  const criticalCoverageWithGenerator = Number(L.criticalCoverageWithGenerator ?? L.criticalLoadCoverage ?? 0);
  const criticalCoverageWithoutGenerator = Number(L.criticalCoverageWithoutGenerator ?? L.criticalLoadCoverageWithoutGenerator ?? L.pvBatteryCriticalCoverage ?? 0);
  const financialBasisMeta = offgridFinancialBasisMeta(state?.results?.financialSavingsBasis);
  const uncertainty = accuracy?.expectedUncertaintyPct || L.expectedUncertaintyPct || null;
  const uncertaintyText = uncertainty
    ? `±${Number(uncertainty.lowPct || 0).toFixed(0)}-${Number(uncertainty.highPct || 0).toFixed(0)}%`
    : '—';
  const totalCoverageText = formatOffgridCoverageValue(L.totalLoadCoverage, L);
  const criticalCoverageWithGeneratorText = criticalLoadDefined ? formatOffgridCoverageValue(criticalCoverageWithGenerator, L) : criticalLoadUndefinedText();
  const criticalCoverageWithoutGeneratorText = criticalLoadDefined ? formatOffgridCoverageValue(criticalCoverageWithoutGenerator, L) : criticalLoadUndefinedText();
  const coverageNotes = offgridCoverageInterpretationMeta(L);
  const syntheticPeakMeta = offgridSyntheticPeakMeta(L);
  const syntheticPvMeta = offgridSyntheticPvMeta(L);
  const designCorrectionMeta = offgridDesignCorrectionMeta(L);
  const accuracyColor = (L.accuracyScore || 0) >= 80 ? '#22C55E'
    : (L.accuracyScore || 0) >= 60 ? '#F59E0B'
    : '#EF4444';

  // Dispatch özeti kartları
  const dispatchGrid = document.getElementById('offgrid-dispatch-grid');
  if (dispatchGrid) {
    const items = [
      { label: i18n.t('offgridL2.directPvLabel'),  value: `${Math.round(L.directPvKwh).toLocaleString(locale)} kWh`, color: 'var(--primary)', note: 'Üretilip aynı anda kullanılan enerji' },
      { label: i18n.t('offgridL2.batteryLabel'),   value: `${Math.round(L.batteryKwh).toLocaleString(locale)} kWh`, color: 'var(--success)', note: 'Bataryada depolanıp sonra kullanılan enerji' },
      { label: i18n.t('offgridL2.curtailedLabel'), value: `${Math.round(L.curtailedPvKwh).toLocaleString(locale)} kWh`, color: '#94A3B8', note: 'Sistemin kullanamadığı fazla üretim' },
      { label: i18n.t('offgridL2.unmetLabel'),     value: `${Math.round(L.unmetLoadKwh).toLocaleString(locale)} kWh`, color: 'var(--danger)', note: 'Sistemin yetişemediği enerji ihtiyacı' },
    ];
    if (L.generatorEnabled) {
      items.splice(2, 0, { label: i18n.t('offgridL2.generatorLabel'), value: `${Math.round(L.generatorKwh).toLocaleString(locale)} kWh`, color: '#F97316', note: 'Jeneratörün devraldığı destek enerjisi' });
    }
    dispatchGrid.innerHTML = items.map(offgridStatCard).join('');
  }

  // Kapsama metrikleri
  const totalCovEl = document.getElementById('offgrid-total-coverage');
  const critCovEl = document.getElementById('offgrid-critical-coverage');
  if (totalCovEl) totalCovEl.textContent = totalCoverageText;
  if (critCovEl) critCovEl.textContent = criticalCoverageWithGeneratorText;
  const totalCovNoteEl = document.getElementById('offgrid-total-coverage-note');
  const critCovNoteEl = document.getElementById('offgrid-critical-coverage-note');
  if (totalCovNoteEl) totalCovNoteEl.textContent = coverageNotes.total;
  if (critCovNoteEl) critCovNoteEl.textContent = coverageNotes.critical;

  // Jeneratör analizi (enhanced with narrative)
  const genResultWrap = document.getElementById('offgrid-generator-result-wrap');
  const genResultDetails = document.getElementById('offgrid-generator-result-details');
  if (genResultWrap && genResultDetails) {
    if (L.generatorEnabled) {
      setVisible(genResultWrap, true);
      const hoursStr = Math.round(L.generatorRunHoursPerYear).toLocaleString(locale);
      const kwhStr   = Math.round(L.generatorKwh).toLocaleString(locale);
      const narrative = i18n.t('offgridL2.genNarrativeActive')
        .replace('{hours}', hoursStr).replace('{kwh}', kwhStr)
        .replace('{cost}', Math.round(L.generatorFuelCostAnnual).toLocaleString(locale));
      const strategyLabel = L.generatorStrategy === 'critical-backup' || L.generatorStrategy === 'critical-only'
        ? 'Sadece kritik yükleri koru'
        : L.generatorStrategy === 'full-backup' || L.generatorStrategy === 'support-all-loads'
          ? 'Toplam yükü destekle'
          : L.generatorStrategy === 'bad-weather'
            ? 'Kötü hava için dayanım öncelikli'
            : 'Akıllı destek modu';
      genResultDetails.innerHTML = `
        <div class="offgrid-stat-grid">
          ${offgridStatCard({ label: i18n.t('offgridL2.genRunHours'), value: `${hoursStr} saat/yıl`, note: 'Jeneratörün yaklaşık çalışma süresi', color: '#F97316' })}
          ${offgridStatCard({ label: i18n.t('offgridL2.genKwh'), value: `${kwhStr} kWh/yıl`, note: 'Yıl boyunca ürettiği destek enerjisi', color: '#F97316' })}
          ${offgridStatCard({ label: i18n.t('offgridL2.genFuelCost'), value: `${money(L.generatorFuelCostAnnual)} / yıl`, note: 'Tahmini yıllık yakıt gideri', color: '#F97316' })}
        </div>
        <div class="offgrid-chip-grid">
          ${offgridChipCard({ label: 'Çalışma yaklaşımı', value: strategyLabel })}
          ${offgridChipCard({ label: 'Tahmini jeneratör yatırımı', value: money(L.generatorCapex || 0) })}
          ${L.generatorMaintenanceCostAnnual ? offgridChipCard({ label: 'Yıllık servis gideri', value: `${money(L.generatorMaintenanceCostAnnual)} / yıl` }) : ''}
          ${offgridChipCard({ label: i18n.t('offgridL2.generatorMinLoadLabel'), value: `%${Math.round(Number(L.generatorMinLoadRatePct) || 0)}` })}
          ${offgridChipCard({ label: i18n.t('offgridL2.generatorStopSocLabel'), value: `%${Math.round(Number(L.generatorStartSocPct) || 0)} → %${Math.round(Number(L.generatorStopSocPct) || 0)}` })}
          ${offgridChipCard({ label: i18n.t('offgridL2.generatorChargeBatteryLabel'), value: L.generatorChargeBatteryEnabled ? i18n.t('yes') : i18n.t('no') })}
        </div>
        ${L.generatorCapexMissing ? `<div class="offgrid-note-strip"><div class="offgrid-note offgrid-note--warn">${escapeHtml(i18n.t('offgridL2.generatorCapexMissing'))}</div></div>` : ''}
        <div class="offgrid-body-copy">${escapeHtml(narrative)}</div>
      `;
    } else {
      setVisible(genResultWrap, false);
    }
  }

  // Kötü hava senaryosu (enhanced with narrative)
  const bwWrap = document.getElementById('offgrid-badweather-result-wrap');
  const bwDetails = document.getElementById('offgrid-badweather-result-details');
  if (bwWrap && bwDetails) {
    const bw = L.badWeatherScenario;
    if (bw) {
      setVisible(bwWrap, true);
      const levelKey = 'offgridL2.badWeather_' + bw.weatherLevel;
      const critDrop = bw.criticalCoverageDropPct.toFixed(1);
      const totalDrop = bw.totalCoverageDropPct.toFixed(1);
      const days = bw.consecutiveDays || 0;
      const resilient = bw.criticalCoverageDropPct < 10
        ? i18n.t('offgridL2.badWeatherResilientYes')
        : i18n.t('offgridL2.badWeatherResilientNo');
      const risk = bw.criticalCoverageDropPct < 15
        ? i18n.t('offgridL2.badWeatherRiskLow')
        : i18n.t('offgridL2.badWeatherRiskHigh');
      const narrativeKey = `offgridL2.badWeatherNarrative${bw.weatherLevel.charAt(0).toUpperCase() + bw.weatherLevel.slice(1)}`;
      const narrative = i18n.t(narrativeKey)
        .replace('{days}', days).replace('{critDrop}', critDrop)
        .replace('{totalDrop}', totalDrop).replace('{resilient}', resilient)
        .replace('{risk}', risk);
      const windowDay = bw.worstWindowDayOfYear;
      const windowCoveragePart = Number.isFinite(Number(bw.windowCoverage))
        ? `${i18n.t('offgridL2.badWeatherWindowCoverage')}: ${(Number(bw.windowCoverage) * 100).toFixed(1)}%`
        : '';
      const windowCriticalCoveragePart = Number.isFinite(Number(bw.windowCriticalCoverage))
        ? `${i18n.t('offgridL2.badWeatherWindowCriticalCoverage')}: ${(Number(bw.windowCriticalCoverage) * 100).toFixed(1)}%`
        : '';
      const windowPart = windowDay
        ? `${i18n.t('offgridL2.badWeatherWindowDay') || 'En kötü pencere'} ${windowDay}`
        : '';
      const addGenPart = bw.additionalGeneratorKwh > 0
        ? `<div class="offgrid-chip-grid">${offgridChipCard({ label: i18n.t('offgridL2.addGenKwh'), value: `${Math.round(bw.additionalGeneratorKwh).toLocaleString(locale)} kWh`, note: 'Bu hava penceresinde gerekebilecek ek jeneratör desteği' })}</div>`
        : '';
      bwDetails.innerHTML = `
        <div class="offgrid-stat-grid">
          ${offgridStatCard({ label: i18n.t('offgridL2.badWeatherLevel'), value: i18n.t(levelKey), note: 'Seçilen stres testi seviyesi', color: '#94A3B8' })}
          ${offgridStatCard({ label: i18n.t('offgridL2.criticalDropLabel'), value: `−${critDrop}%`, note: 'Kritik yük korumasındaki düşüş', color: 'var(--danger)' })}
          ${offgridStatCard({ label: i18n.t('offgridL2.totalDropLabel'), value: `−${totalDrop}%`, note: 'Toplam kapsamadaki düşüş', color: 'var(--primary)' })}
        </div>
        <div class="offgrid-inline-badges">
          ${windowCoveragePart ? `<span class="offgrid-inline-badge">${escapeHtml(windowCoveragePart)}</span>` : ''}
          ${windowCriticalCoveragePart ? `<span class="offgrid-inline-badge">${escapeHtml(windowCriticalCoveragePart)}</span>` : ''}
          ${windowPart ? `<span class="offgrid-inline-badge">${escapeHtml(windowPart)}</span>` : ''}
        </div>
        <div class="offgrid-body-copy">${escapeHtml(narrative)}</div>
        ${addGenPart}
      `;
    } else {
      setVisible(bwWrap, false);
    }
  }

  // Stres senaryoları
  const stressWrap = document.getElementById('offgrid-stress-result-wrap');
  const stressDetails = document.getElementById('offgrid-stress-result-details');
  if (stressWrap && stressDetails) {
    const stress = L.fieldStressAnalysis;
    if (stress?.scenarios?.length) {
      setVisible(stressWrap, true);
      const worstCritical = stress.worstCriticalScenario || null;
      const worstTotal = stress.worstTotalScenario || null;
      const maxUnmetCritical = stress.maxUnmetCriticalScenario || null;
      const reservePct = Number.isFinite(Number(stress.generatorCriticalPeakReservePct))
        ? `${(Number(stress.generatorCriticalPeakReservePct) * 100).toFixed(0)}%`
        : '—';
      stressDetails.innerHTML = `
        <div class="offgrid-stat-grid">
          ${worstCritical ? offgridStatCard({
            label: i18n.t('offgridL2.stressWorstCriticalLabel'),
            value: `${offgridStressScenarioLabel(worstCritical)} · ${formatOffgridCoverageValue(worstCritical.criticalLoadCoverage, L)}`,
            note: `${i18n.t('offgridL2.unmetLabel')}: ${Math.round(worstCritical.unmetCriticalKwh || 0).toLocaleString(locale)} kWh`,
            color: 'var(--danger)'
          }) : ''}
          ${worstTotal ? offgridStatCard({
            label: i18n.t('offgridL2.stressWorstTotalLabel'),
            value: `${offgridStressScenarioLabel(worstTotal)} · ${formatOffgridCoverageValue(worstTotal.totalLoadCoverage, L)}`,
            note: `${i18n.t('offgridL2.unmetLabel')}: ${Math.round(worstTotal.unmetLoadKwh || 0).toLocaleString(locale)} kWh`,
            color: 'var(--primary)'
          }) : ''}
          ${maxUnmetCritical ? offgridStatCard({
            label: i18n.t('offgridL2.stressMaxUnmetCriticalLabel'),
            value: `${offgridStressScenarioLabel(maxUnmetCritical)} · ${Math.round(maxUnmetCritical.unmetCriticalKwh || 0).toLocaleString(locale)} kWh`,
            note: `${i18n.t('offgridL2.criticalCoverageWithGeneratorLabel')}: ${formatOffgridCoverageValue(maxUnmetCritical.criticalLoadCoverage, L)}`,
            color: '#F97316'
          }) : ''}
        </div>
        <div class="offgrid-inline-badges">
          <span class="offgrid-inline-badge">${escapeHtml(i18n.t('offgridL2.stressScenarioCountLabel'))}: ${stress.scenarios.length}</span>
          <span class="offgrid-inline-badge">${escapeHtml(i18n.t('offgridL2.generatorReserveLabel'))}: ${escapeHtml(reservePct)}</span>
        </div>
        <div class="offgrid-body-copy">${escapeHtml(i18n.t('offgridL2.stressCardNote'))}</div>
      `;
    } else {
      setVisible(stressWrap, false);
    }
  }

  // Faz 9: saha verisi / limiter tabanli tasarim duzeltmeleri
  const designWrap = document.getElementById('offgrid-design-corrections');
  const designBody = document.getElementById('offgrid-design-corrections-body');
  if (designWrap && designBody) {
    const correction = L.designCorrections || null;
    if (correction) {
      setVisible(designWrap, true);
      const severityTone = correction.severity === 'high'
        ? 'var(--danger)'
        : correction.severity === 'medium' ? '#F97316' : 'var(--primary)';
      const reasons = Array.isArray(correction.reasons) ? correction.reasons : [];
      designBody.innerHTML = `
        <div class="offgrid-stat-grid">
          ${offgridStatCard({
            label: i18n.t('offgridL2.designCorrectionInverterAcLabel'),
            value: `${Number(correction.recommended?.inverterAcKw || 0).toFixed(1)} kW`,
            note: `${i18n.t('offgridL2.designCorrectionCurrentLabel')}: ${Number(correction.current?.inverterAcKw || 0).toFixed(1)} kW`,
            color: severityTone
          })}
          ${offgridStatCard({
            label: i18n.t('offgridL2.designCorrectionSurgeLabel'),
            value: `×${Number(correction.recommended?.inverterSurgeMultiplier || 0).toFixed(2)}`,
            note: `${i18n.t('offgridL2.designCorrectionCurrentLabel')}: ×${Number(correction.current?.inverterSurgeMultiplier || 0).toFixed(2)}`,
            color: severityTone
          })}
          ${offgridStatCard({
            label: i18n.t('offgridL2.designCorrectionBatteryDischargeLabel'),
            value: `${Number(correction.recommended?.batteryMaxDischargeKw || 0).toFixed(1)} kW`,
            note: `${i18n.t('offgridL2.designCorrectionCurrentLabel')}: ${Number(correction.current?.batteryMaxDischargeKw || 0).toFixed(1)} kW`,
            color: severityTone
          })}
        </div>
        <div class="offgrid-chip-grid">
          ${offgridChipCard({ label: i18n.t('offgridL2.syntheticPeakSeverityLabel'), value: i18n.t(`offgridL2.syntheticPeakSeverity_${correction.severity || 'medium'}`), note: i18n.t('offgridL2.designCorrectionSeverityNote') })}
          ${offgridChipCard({ label: i18n.t('offgridL2.syntheticPeakMaxLabel'), value: `${Number(correction.triggers?.modeledPeakKw || 0).toFixed(1)} kW`, note: `${i18n.t('offgridL2.designCorrectionObservedPeakLabel')}: ${Number(correction.triggers?.observedPeakKw || 0).toFixed(1)} kW` })}
          ${offgridChipCard({ label: i18n.t('offgridL2.syntheticPeakCriticalMaxLabel'), value: `${Number(correction.triggers?.modeledCriticalPeakKw || 0).toFixed(1)} kW`, note: `${i18n.t('offgridL2.designCorrectionP95Label')}: ${Number(correction.triggers?.modeledP95Kw || 0).toFixed(1)} kW` })}
          ${offgridChipCard({ label: i18n.t('offgridL2.powerLimitedLabel'), value: `${Math.round(Number(correction.triggers?.inverterPowerLimitedKwh || 0)).toLocaleString(locale)} kWh`, note: `${Math.round(Number(correction.triggers?.inverterPowerLimitHours || 0)).toLocaleString(locale)} saat` })}
          ${offgridChipCard({ label: i18n.t('offgridL2.batteryPowerLimitLabel'), value: `${Math.round(Number(correction.triggers?.batteryDischargeLimitedKwh || 0)).toLocaleString(locale)} kWh`, note: i18n.t('offgridL2.designCorrectionBatteryLimitNote') })}
          ${offgridChipCard({ label: i18n.t('offgridL2.inverterLogUpload'), value: `${Math.round(Number(correction.triggers?.tripCount || 0)).toLocaleString(locale)} trip / ${Math.round(Number(correction.triggers?.overloadCount || 0)).toLocaleString(locale)} overload`, note: `${i18n.t('offgridL2.syntheticPeakFactorLabel')}: ×${Number(correction.triggers?.calibrationFactor || 1).toFixed(2)}` })}
        </div>
        ${designCorrectionMeta ? `<div class="offgrid-body-copy">${escapeHtml(designCorrectionMeta.note)}</div>` : ''}
        ${reasons.length ? `<div class="offgrid-list-title">${escapeHtml(i18n.t('offgridL2.designCorrectionReasonTitle'))}</div><ul class="offgrid-list">${reasons.map(reason => `<li>${escapeHtml(i18n.t(`offgridL2.designCorrectionReason_${reason}`))}</li>`).join('')}</ul>` : ''}
      `;
    } else {
      setVisible(designWrap, false);
    }
  }

  // Yaşam döngüsü maliyeti
  const lcWrap = document.getElementById('offgrid-lifecycle-details');
  if (lcWrap) {
    const monthlyLifecycle = (Number(L.lifecycleCostAnnual) || 0) / 12;
    const lifecycleNote = Number(L.generatorOverhaulAnnual) > 0
      ? i18n.t('offgridL2.lifecycleGeneratorOverhaulIncluded')
        .replace('{annual}', money(L.generatorOverhaulAnnual))
        .replace('{count}', Math.round(Number(L.generatorOverhaulCount25y) || 0).toLocaleString(locale))
      : i18n.t('offgridL2.lifecycleGeneratorOverhaulExcluded');
    lcWrap.innerHTML = `
      <div class="offgrid-stat-grid">
        ${offgridStatCard({ label: i18n.t('offgridL2.lifecycleAnnual'), value: `${money(L.lifecycleCostAnnual)} / yıl`, note: i18n.t('offgridL2.lifecycleAnnualNote'), color: 'var(--success)' })}
        ${offgridStatCard({ label: 'Aylık ortalama maliyet', value: `${money(monthlyLifecycle)} / ay`, note: 'Uzun vadeli maliyeti aylık okumak için yaklaşık karşılığı', color: 'var(--primary)' })}
      </div>
      <div class="offgrid-note-strip">
        <div class="offgrid-note offgrid-note--warn">${escapeHtml(lifecycleNote)}</div>
      </div>
    `;
  }

  // Genişletilmiş dispatch metrikleri
  const extMetricsEl = document.getElementById('offgrid-extended-metrics');
  const extMetricsBody = document.getElementById('offgrid-extended-metrics-body');
  if (extMetricsEl && extMetricsBody) {
    setVisible(extMetricsEl, true);
    const items = [
      { label: i18n.t('offgridL2.resultTotalLoad'), value: `${Math.round(L.annualTotalLoadKwh || 0).toLocaleString(locale)} kWh/yıl`, note: 'Tüm yıl boyunca beklenen toplam tüketim' },
      L.annualCriticalLoadKwh > 0 ? { label: i18n.t('offgridL2.resultCriticalLoad'), value: `${Math.round(L.annualCriticalLoadKwh).toLocaleString(locale)} kWh/yıl`, note: 'Kesintide öncelikli tutulacak kritik kısım' } : '',
      { label: i18n.t('offgridL2.directPvLabel'), value: `${Math.round(L.directPvKwh || 0).toLocaleString(locale)} kWh/yıl`, note: 'Güneşten gelip anında kullanılan enerji' },
      { label: i18n.t('offgridL2.batteryLabel'), value: `${Math.round(L.batteryKwh || 0).toLocaleString(locale)} kWh/yıl`, note: 'Bataryanın devreye girip taşıdığı enerji' },
      criticalLoadDefined ? { label: i18n.t('offgridL2.pvBessCriticalCoverageLabel'), value: criticalCoverageWithoutGeneratorText, note: 'Sadece PV ve batarya ile kritik yük koruması' } : '',
      criticalLoadDefined && L.generatorEnabled ? { label: i18n.t('offgridL2.criticalCoverageWithGeneratorLabel'), value: criticalCoverageWithGeneratorText, note: 'Jeneratör dahil kritik yük koruması' } : '',
      L.batteryReservePct != null ? { label: i18n.t('offgridL2.batteryReserveLabel'), value: `%${Number(L.batteryReservePct).toFixed(0)}`, note: 'Korunan minimum batarya rezervi' } : '',
      L.batteryChargeEfficiencyPct != null ? { label: i18n.t('offgridL2.batteryChargeEfficiencyLabel'), value: `%${Number(L.batteryChargeEfficiencyPct).toFixed(1)}`, note: 'Şarj tarafı verimi' } : '',
      L.batteryDischargeEfficiencyPct != null ? { label: i18n.t('offgridL2.batteryDischargeEfficiencyLabel'), value: `%${Number(L.batteryDischargeEfficiencyPct).toFixed(1)}`, note: 'Deşarj tarafı verimi' } : '',
      L.minimumSoc != null ? { label: i18n.t('offgridL2.minSocLabel'), value: `${(L.minimumSoc * 100).toFixed(1)}%`, note: 'Bataryada korunan en düşük doluluk seviyesi' } : '',
      L.averageSoc != null ? { label: i18n.t('offgridL2.avgSocLabel'), value: `${(L.averageSoc * 100).toFixed(1)}%`, note: 'Bataryanın yıl içindeki ortalama doluluğu' } : '',
      L.inverterAcLimitKw != null ? { label: i18n.t('offgridL2.inverterLimitLabel'), value: `${Number(L.inverterAcLimitKw).toFixed(1)} kW AC`, note: 'Aynı anda çekilebilecek üst güç sınırı' } : '',
      (L.inverterPowerLimitedKwh || 0) > 0 ? { label: i18n.t('offgridL2.powerLimitedLabel'), value: `${Math.round(L.inverterPowerLimitedKwh).toLocaleString(locale)} kWh`, note: `${L.inverterPowerLimitHours || 0} saat boyunca güç sınırı etkisi görüldü` } : '',
      L.autonomousDays != null ? { label: i18n.t('offgridL2.resultAutonomousDays'), value: `${L.autonomousDays} gün`, note: i18n.t('offgridL2.autonomyThresholdNote').replace('{pct}', Number(L.autonomyThresholdPct || 1).toFixed(1)).replace('{coverage}', L.autonomousDaysPct != null ? Number(L.autonomousDaysPct).toFixed(1) : '—') } : '',
      L.generatorEnabled && L.autonomousDaysWithGenerator != null ? { label: i18n.t('offgridL2.resultAutonomousDaysWithGenerator'), value: `${L.autonomousDaysWithGenerator} gün`, note: 'Jeneratör desteğiyle uzayan tahmini süre' } : '',
    ].filter(Boolean);
    extMetricsBody.innerHTML = items.map(offgridChipCard).join('');
  }

  // Cihaz özet metrikleri (cihaz listesi modunda)
  const deviceMetricsEl = document.getElementById('offgrid-device-metrics');
  const deviceMetricsBody = document.getElementById('offgrid-device-metrics-body');
  if (deviceMetricsEl) {
    if (L.loadMode === 'device-list' && L.deviceCount > 0) {
      const totalWh = L.annualTotalLoadKwh > 0 ? (L.annualTotalLoadKwh / 365 * 1000).toFixed(0) : '—';
      const critWh  = L.annualCriticalLoadKwh > 0 ? (L.annualCriticalLoadKwh / 365 * 1000).toFixed(0) : '0';
      setVisible(deviceMetricsEl, true);
      if (deviceMetricsBody) {
        deviceMetricsBody.innerHTML = `
          <div class="offgrid-chip-grid">
            ${offgridChipCard({ label: i18n.t('offgridL2.deviceCount'), value: L.deviceCount, note: 'Listeye eklenen toplam cihaz sayısı' })}
            ${offgridChipCard({ label: i18n.t('offgridL2.totalDailyWh'), value: `${totalWh} Wh/gün`, note: 'Günlük toplam enerji ihtiyacı' })}
            ${offgridChipCard({ label: i18n.t('offgridL2.criticalDailyWh'), value: `${critWh} Wh/gün`, note: 'Kesintide mutlaka korunması gereken günlük tüketim' })}
            ${offgridChipCard({ label: i18n.t('offgridL2.criticalDeviceCount'), value: L.criticalDeviceCount || 0, note: 'Kritik olarak işaretlenen cihaz adedi' })}
            ${syntheticPeakMeta ? offgridChipCard({ label: i18n.t('offgridL2.syntheticPeakModelLabel'), value: syntheticPeakMeta.label, note: syntheticPeakMeta.note }) : ''}
            ${syntheticPeakMeta ? offgridChipCard({ label: i18n.t('offgridL2.syntheticPeakMaxLabel'), value: `${Number(L.syntheticPeakModel?.maxSyntheticPeakKw || 0).toFixed(1)} kW`, note: `${i18n.t('offgridL2.syntheticPeakFactorLabel')}: ×${Number(L.syntheticPeakModel?.peakEnvelopeMaxFactor || 1).toFixed(2)}` }) : ''}
            ${syntheticPeakMeta ? offgridChipCard({ label: i18n.t('offgridL2.syntheticPeakCriticalMaxLabel'), value: `${Number(L.syntheticPeakModel?.maxCriticalPeakKw || 0).toFixed(1)} kW`, note: `${i18n.t('offgridL2.syntheticPeakSeverityLabel')}: ${syntheticPeakMeta.severity}` }) : ''}
          </div>`;
      }
    } else {
      if (L.loadMode === 'hourly-8760') {
        setVisible(deviceMetricsEl, true);
        if (deviceMetricsBody) {
          deviceMetricsBody.innerHTML = `<div class="offgrid-body-copy">${escapeHtml(i18n.t('offgridL2.loadSourceHourly'))}</div>`;
        }
      } else {
        setVisible(deviceMetricsEl, false);
      }
    }
  }

  // Karşılanamayan yük uyarısı
  const unmetWarnEl = document.getElementById('offgrid-unmet-warn');
  const unmetWarnBody = document.getElementById('offgrid-unmet-warn-body');
  if (unmetWarnEl) {
    const unmetKwh = Math.round(L.unmetLoadKwh || 0);
    if (unmetKwh > 10) {
      const msg = i18n.t(L.generatorEnabled
        ? 'offgridL2.genNarrativeUnmetWithGenerator'
        : 'offgridL2.honestUnmetWarning')
        .replace('{unmet}', unmetKwh.toLocaleString(locale));
      setVisible(unmetWarnEl, true);
      if (unmetWarnBody) {
        unmetWarnBody.innerHTML = `
          <div class="offgrid-stat-grid">
            ${offgridStatCard({ label: 'Karşılanamayan yıllık ihtiyaç', value: `${unmetKwh.toLocaleString(locale)} kWh`, note: 'Bu açık mevcut kurulumla tamamen kapanmıyor', color: 'var(--danger)' })}
            ${offgridStatCard({ label: 'Önerilen aksiyon', value: L.generatorEnabled ? 'Batarya veya jeneratör desteğini büyüt' : 'Batarya ya da jeneratör ekle', note: 'Kesin çözüm için yük profili ve saha şartı birlikte gözden geçirilmeli', color: 'var(--primary)' })}
          </div>
          <div class="offgrid-body-copy">${escapeHtml(msg)}</div>
        `;
      }
    } else {
      setVisible(unmetWarnEl, false);
    }
  }

  // Kaynak şeffaflığı (üretim + yük kaynağı)
  const sourceTransEl = document.getElementById('offgrid-source-transparency');
  const sourceTransBody = document.getElementById('offgrid-source-transparency-body');
  if (sourceTransEl) {
    const prodSource = L.productionSourceLabel || (L.productionFallback ? i18n.t('pvgis.fallbackUsed') : i18n.t('pvgis.liveSuccess'));
    const loadSrc = L.loadMode === 'hourly-8760'
      ? i18n.t('offgridL2.loadSourceHourly')
      : (L.loadMode === 'device-list' ? i18n.t('offgridL2.loadSourceDeviceList') : i18n.t('offgridL2.loadSourceSimple'));
    const dispatchLabel = L.dispatchType === 'hourly-8760-dispatch'
      ? i18n.t('offgridL2.dispatchHourly')
      : i18n.t('offgridL2.syntheticDispatch');
    const productionDispatchText = L.productionDispatchProfile === 'real-hourly-pv-8760'
      ? i18n.t('offgridL2.productionDispatchReal')
      : i18n.t('offgridL2.productionDispatchSynthetic');
    const parityText = L.parityAvailable
      ? 'Ek doğrulama mevcut'
      : 'Ek karşılaştırma yapılmadı';
    const fieldDataMeta = offgridFieldDataStateMeta(L);
    const tierLabel = i18n.t(`offgridL2.accuracyTier_${accuracy?.tier || L.accuracyTier || 'basic-synthetic'}`);
    const modeLabel = i18n.t(`offgridL2.calculationMode_${accuracy?.calculationMode || L.calculationMode || 'basic'}`);
    const mainAccuracyBlocker = accuracy?.blockers?.[0] || '';
    setVisible(sourceTransEl, true);
    const gateReadyState = gate => {
      const readyKey = Object.keys(gate || {}).find(k => /^phase\d+Ready$/.test(k));
      return readyKey ? gate?.[readyKey] : null;
    };
    const pendingSteps = [
      ['Saha üretim doğrulaması', L.fieldGuaranteeReadiness],
      ['Saha kanıtları', L.fieldEvidenceGate],
      ['Model olgunluğu', L.fieldModelMaturityGate],
      ['Saha kabulü', L.fieldAcceptanceGate],
      ['Garanti operasyonu', L.fieldOperationGate],
      ['Yıllık yeniden doğrulama', L.fieldRevalidationGate],
      ['Yüksek çözünürlüklü saha importu', L.fieldImportGate]
    ].filter(([, gate]) => gate && gateReadyState(gate) === false)
      .map(([label, gate]) => `${label}: ${gate.blockers?.[0] || 'İlgili saha verisi tamamlanmalı.'}`);
    const highResLoad = L.fieldImportSummary?.highResolutionLoad || null;
    const inverterLog = L.fieldImportSummary?.inverterEventLog || null;
    const confidenceCopy = accuracy?.interpretation || i18n.t('offgridL2.accuracyInterpretationFallback');
    if (sourceTransBody) {
      sourceTransBody.innerHTML = `
        ${accuracy ? `
        <div class="offgrid-stat-grid">
          ${offgridStatCard({ label: i18n.t('offgridL2.accuracyScoreLabel'), value: `${L.accuracyScore}/100`, note: 'Skor yükseldikçe sonuç daha savunulabilir hale gelir', color: accuracyColor })}
          ${offgridStatCard({ label: i18n.t('offgridL2.expectedUncertaintyLabel'), value: uncertaintyText, note: 'Gerçek saha davranışı bu bant içinde değişebilir', color: accuracyColor })}
          ${offgridStatCard({ label: i18n.t('offgridL2.calculationModeLabel'), value: `${modeLabel} · ${tierLabel}`, note: 'Sonucun hangi veri yoğunluğu ile üretildiği', color: 'var(--primary)' })}
        </div>` : ''}
        <div class="offgrid-body-copy">${escapeHtml(confidenceCopy)}${mainAccuracyBlocker ? ` ${escapeHtml(mainAccuracyBlocker)}` : ''}</div>
        <div class="offgrid-chip-grid">
          ${offgridChipCard({ label: i18n.t('offgridL2.fieldDataStateLabel'), value: fieldDataMeta.label, note: fieldDataMeta.note })}
          ${offgridChipCard({ label: i18n.t('offgridL2.productionSource'), value: prodSource, note: productionDispatchText })}
          ${offgridChipCard({ label: i18n.t('offgridL2.loadSourceLabel'), value: loadSrc, note: 'Tüketim tarafında esas alınan veri kaynağı' })}
          ${offgridChipCard({ label: i18n.t('offgridL2.dispatchLabel'), value: dispatchLabel, note: 'Hesabın yıl içine nasıl yayıldığı' })}
          ${offgridChipCard({ label: i18n.t('offgridL2.financialBasisLabel'), value: financialBasisMeta.label, note: 'Tasarruf ve ekonomik karşılaştırma için kullanılan baz fiyat' })}
          ${offgridChipCard({ label: 'Ek doğrulama durumu', value: parityText, note: L.productionFallback ? i18n.t('offgridL2.fallbackUsed') : i18n.t('offgridL2.liveData') })}
          ${syntheticPvMeta ? offgridChipCard({ label: i18n.t('offgridL2.syntheticPvWeatherModelLabel'), value: syntheticPvMeta.label, note: syntheticPvMeta.note }) : ''}
          ${syntheticPeakMeta ? offgridChipCard({ label: i18n.t('offgridL2.syntheticPeakModelLabel'), value: syntheticPeakMeta.label, note: syntheticPeakMeta.note }) : ''}
          ${designCorrectionMeta ? offgridChipCard({ label: i18n.t('offgridL2.designCorrectionTitle'), value: designCorrectionMeta.severity, note: designCorrectionMeta.note }) : ''}
          ${highResLoad ? offgridChipCard({ label: i18n.t('offgridL2.fieldImportStatus'), value: `${Number(highResLoad.observedPeakKw || 0).toFixed(1)} kW peak`, note: `${Number(highResLoad.intervalMinutes || 0).toFixed(0)} dk · ${Number(highResLoad.durationDays || 0).toFixed(1)} gün` }) : ''}
          ${inverterLog ? offgridChipCard({ label: i18n.t('offgridL2.inverterLogUpload'), value: `${Number(inverterLog.tripCount || 0)} trip / ${Number(inverterLog.overloadCount || 0)} overload`, note: `${Number(inverterLog.eventCount || 0)} kayıt` }) : ''}
        </div>
        <div class="offgrid-note-strip"><div class="offgrid-note ${fieldDataMeta.tone === 'danger' ? 'offgrid-note--warn' : ''}">${escapeHtml(fieldDataMeta.note)}</div></div>
        ${syntheticPvMeta ? `<div class="offgrid-note-strip"><div class="offgrid-note offgrid-note--warn">${escapeHtml(i18n.t('offgridL2.syntheticPvWeatherPenaltyApplied').replace('{days}', Math.round(Number(L.productionDispatchMetadata?.syntheticWeatherMetadata?.longestLowPvClusterDays) || 0).toLocaleString(localeTag())).replace('{min}', Number(((L.productionDispatchMetadata?.syntheticWeatherMetadata?.minimumDailyFractionOfAverage || 0) * 100)).toFixed(0)))}</div></div>` : ''}
        ${syntheticPeakMeta ? `<div class="offgrid-note-strip"><div class="offgrid-note offgrid-note--warn">${escapeHtml(i18n.t('offgridL2.syntheticPeakPenaltyApplied').replace('{severity}', syntheticPeakMeta.severity).replace('{factor}', Number(L.syntheticPeakModel?.peakEnvelopeMaxFactor || 1).toFixed(2)))}</div></div>` : ''}
        ${financialBasisMeta.warning ? `<div class="offgrid-note-strip"><div class="offgrid-note offgrid-note--warn">${escapeHtml(financialBasisMeta.warning)}</div></div>` : ''}
        <div class="offgrid-list-title">${pendingSteps.length ? 'Kesin projeye geçmeden önce tamamlanması gerekenler' : 'Bu aşama için durum'}</div>
        ${pendingSteps.length
          ? `<ul class="offgrid-list">${pendingSteps.slice(0, 4).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
          : `<div class="offgrid-body-copy">Bu sonuçta kritik bir saha engeli görünmüyor. Yine de nihai proje için yerinde ölçüm ve ekipman doğrulaması önerilir.</div>`}
        <div class="offgrid-inline-badges">
          <span class="offgrid-inline-badge"><strong>Not:</strong> ${escapeHtml(fieldDataMeta.note)}</span>
          <span class="offgrid-inline-badge"><strong>Seviye:</strong> ${escapeHtml(i18n.t('offgridL2.honestPreFeasibility'))}</span>
          <span class="offgrid-inline-badge"><strong>Sonraki adım:</strong> ${escapeHtml(i18n.t('offgridL2.honestSiteRequired'))}</span>
        </div>
      `;
    }
  }

  // Versiyon damgası ve yük modu
  const versionEl = document.getElementById('offgrid-l2-version');
  if (versionEl) versionEl.textContent = L.dispatchVersion ? `Model sürümü: ${L.dispatchVersion}` : '';
  const loadModeEl = document.getElementById('offgrid-l2-load-mode');
  if (loadModeEl) {
    const modeKey = L.loadMode === 'hourly-8760'
      ? 'offgridL2.loadModeHourly'
      : (L.loadMode === 'device-list' ? 'offgridL2.loadModeDeviceList' : 'offgridL2.loadModeSimple');
    loadModeEl.textContent = `Yük modeli: ${i18n.t(modeKey)}`;
  }
}

function renderNMResults(nm, enabled) {
  const section = document.getElementById('nm-result-section');
  if (!section) return;
  const scenarioAllowsExport = window.state?.scenarioContext?.visibleBlocks?.netMetering !== false;
  if (!nm || !enabled || !scenarioAllowsExport) { setVisible(section, false); return; }
  const activeLocale = localeTag();
  setVisible(section, true, 'block');
  document.getElementById('nm-license-badge').textContent = enabled ? nm.systemType : 'Satış kapalı';
  document.getElementById('nm-export-kwh').textContent = `${nm.paidGridExport.toLocaleString(activeLocale)} / ${nm.annualGridExport.toLocaleString(activeLocale)}`;
  document.getElementById('nm-export-revenue').textContent = money(nm.annualExportRevenue);
  document.getElementById('nm-self-consumption').textContent = `${nm.selfConsumptionPct}%`;
}

function percentText(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric.toFixed(digits)}%`;
}

function resultMetricCell({ eyebrow = '', value = '—', label = '', note = '', tone = 'neutral', wide = false } = {}) {
  return `
    <article class="result-metric-cell result-metric-cell--${escapeHtml(tone)}${wide ? ' result-metric-cell--wide' : ''}">
      ${eyebrow ? `<div class="result-metric-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
      <strong>${escapeHtml(String(value))}</strong>
      <span>${escapeHtml(label)}</span>
      ${note ? `<p>${escapeHtml(note)}</p>` : ''}
    </article>
  `;
}

function resultChip(label, value, tone = 'neutral') {
  return `
    <span class="result-chip result-chip--${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </span>
  `;
}

function resultSection(title, cells, className = '') {
  return `
    <div class="result-section ${escapeHtml(className)}">
      <div class="result-section-title">${escapeHtml(title)}</div>
      <div class="result-section-grid">${cells.join('')}</div>
    </div>
  `;
}

function financialDecisionCopy(r = {}) {
  const npv = Number(r.npvTotal);
  const irr = Number(r.irr);
  const discountPct = Number(r.discountRate || 0) * 100;
  if (Number.isFinite(npv) && npv >= 0 && (!Number.isFinite(irr) || irr >= discountPct)) {
    return {
      tone: 'good',
      title: i18n.t('onGridResult.verdictPositiveTitle'),
      body: i18n.t('onGridResult.verdictPositiveBody')
    };
  }
  if (Number.isFinite(npv) && npv < 0 && Number(r.nominalTotalReturnPct ?? r.roi) > 0) {
    return {
      tone: 'warn',
      title: i18n.t('onGridResult.verdictMixedTitle'),
      body: i18n.t('onGridResult.verdictMixedBody')
    };
  }
  return {
    tone: npv >= 0 ? 'neutral' : 'warn',
    title: i18n.t('onGridResult.verdictCautiousTitle'),
    body: i18n.t('onGridResult.verdictCautiousBody')
  };
}

function renderOnGridResultLayers(state, r) {
  const wrap = document.getElementById('on-grid-result-layers');
  if (!wrap) return;
  if (state.scenarioKey !== 'on-grid') {
    setVisible(wrap, false);
    wrap.innerHTML = '';
    return;
  }
  const roofAreaTotal = (Number(state.roofArea) || 0) + (state.multiRoof ? (state.roofSections || []).reduce((s, sec) => s + (Number(sec.area) || 0), 0) : 0);
  const panelSpec = resolvePanelSpec(state, state.panelType);
  const panelArea = (panelSpec.areaM2 || 0) * (Number(r.panelCount) || 0);
  const roofUsePct = roofAreaTotal > 0 ? Math.min(100, panelArea / roofAreaTotal * 100) : 0;
  const comp = r.compensationSummary || {};
  const netMeteringActive = !!state.netMeteringEnabled && state.scenarioKey === 'on-grid';
  const paidExportKwh = netMeteringActive ? Math.round(r.nmMetrics?.paidGridExport ?? comp.paidExportKwh ?? 0) : 0;
  const totalExportKwh = Math.round(r.nmMetrics?.annualGridExport ?? r.hourlySummary?.gridExport ?? 0);
  const unpaidExportKwh = Math.max(0, totalExportKwh - paidExportKwh);
  const multiRoofNote = state.multiRoof && Array.isArray(r.sectionResults) && r.sectionResults.length > 1
    ? `${r.sectionResults.length} ${i18n.t('onGridResult.roofSurfaces')}`
    : i18n.t('onGridResult.singleRoof');
  const usageProfileLabels = {
    'daytime-heavy': i18n.t('onGridFlow.profileDaytime'),
    balanced: i18n.t('onGridFlow.profileBalanced'),
    'evening-heavy': i18n.t('onGridFlow.profileEvening'),
    'business-hours': i18n.t('onGridFlow.profileBusiness')
  };
  const usageProfileText = usageProfileLabels[state.usageProfile] || state.usageProfile || i18n.t('onGridFlow.profileBalanced');

  // Profile source labels
  const profileSourceKey = r.hourlyProfileSource || state.hourlyProfileSource || 'synthetic';
  const profileSourceLabels = {
    'hourly-uploaded': i18n.t('onGridResult.profileSourceHourly'),
    'monthly-derived': i18n.t('onGridResult.profileSourceMonthly'),
    'synthetic': i18n.t('onGridResult.profileSourceSynthetic')
  };
  const profileSourceText = profileSourceLabels[profileSourceKey] || profileSourceLabels.synthetic;
  const profileSourceClass = profileSourceKey === 'hourly-uploaded' ? 'data-source-good' : profileSourceKey === 'monthly-derived' ? 'data-source-ok' : 'data-source-warn';
  const productionProfileSourceKey = r.productionProfileSource || 'monthly-derived-synthetic-pv';
  const productionProfileLabels = {
    'backend-pvlib-hourly': 'Canlı veriyle detaylı üretim modeli',
    'pvgis-seriescalc-hourly': 'Canlı güneş verisiyle saatlik hesap',
    'user-hourly-pv-normalized-to-authoritative-annual': 'Saatlik üretim profiline göre hesap',
    'monthly-derived-synthetic-pv': 'Aylık veriye göre hızlı üretim tahmini'
  };
  const productionProfileText = productionProfileLabels[productionProfileSourceKey] || productionProfileSourceKey;
  const productionProfileClass = productionProfileSourceKey === 'backend-pvlib-hourly' || productionProfileSourceKey === 'pvgis-seriescalc-hourly' || productionProfileSourceKey === 'user-hourly-pv-normalized-to-authoritative-annual'
    ? 'data-source-good'
    : 'data-source-warn';

  // Shadow quality display
  const shadowQuality = r.shadowQuality || state.shadingQuality || 'user-estimate';
  const shadowLabels = {
    'site-verified': i18n.t('onGridFlow.shadingSite'),
    'map-assisted': i18n.t('onGridFlow.shadingMap'),
    'user-estimate': i18n.t('onGridFlow.shadingUser'),
    'unknown': i18n.t('onGridFlow.shadingUnknown')
  };
  const shadowText = shadowLabels[shadowQuality] || shadowQuality;
  const shadowClass = shadowQuality === 'site-verified' ? 'data-source-good' : shadowQuality === 'map-assisted' ? 'data-source-ok' : 'data-source-warn';
  const shadowDoubleCountWarning = state.osmShadowEnabled && (Number(state.shadingFactor) || 0) > 0
    ? i18n.t('onGridResult.osmDoubleCountWarning')
    : '';

  // Tariff mode display
  const tariffInputMode = r.tariffInputMode || state.tariffInputMode || 'net-plus-fee';
  const tariffModeText = tariffInputMode === 'gross' ? i18n.t('onGridResult.tariffModeGross') : i18n.t('onGridResult.tariffModeNet');
  const settlementIntervalRaw = comp.settlementInterval || r.tariffModel?.exportCompensationPolicy?.interval || '—';
  const settlementIntervalLabels = {
    monthly: 'Aylık dengeleme',
    hourly: 'Saatlik dengeleme',
    annual: 'Yıllık dengeleme',
    yearly: 'Yıllık dengeleme'
  };
  const settlementBasisText = !netMeteringActive
    ? i18n.t('onGridResult.exportDisabledLabel')
    : r.settlementProvisional
    ? (() => {
        const importOffsetKwh = r.compensationSummary?.importOffsetKwh ?? 0;
        const effectiveImport = (r.tariffModel?.importRate ?? 0) + (r.tariffModel?.distributionFee ?? 0);
        const exportRt = r.tariffModel?.exportRate ?? 0;
        const annualDelta = Math.round(importOffsetKwh * (effectiveImport - exportRt));
        const deltaStr = annualDelta > 0
          ? ` (aylık mod saatliğe göre yılda yaklaşık ${annualDelta.toLocaleString('tr-TR')} TL daha avantajlı)`
          : '';
        return i18n.t('onGridResult.settlementProvisional') + deltaStr;
      })()
    : `${settlementIntervalLabels[settlementIntervalRaw] || settlementIntervalRaw}${comp.annualExportCapKwh ? ` / yıllık ${Math.round(comp.annualExportCapKwh).toLocaleString(localeTag())} kWh sınır` : ''}`;

  // Cost source display
  const costSourceType = r.costSourceType || state.costSourceType || 'catalog';
  const costSourceLabels = {
    'bom-verified': i18n.t('onGridFlow.costSourceBom'),
    'manual': i18n.t('onGridFlow.costSourceManual'),
    'catalog': i18n.t('onGridFlow.costSourceCatalog')
  };
  const costSourceText = costSourceLabels[costSourceType] || costSourceType;
  const costSourceClass = costSourceType === 'bom-verified' ? 'data-source-good' : costSourceType === 'manual' ? 'data-source-ok' : 'data-source-warn';
  const costSourceTone = costSourceType === 'bom-verified' ? 'good' : costSourceType === 'manual' ? 'neutral' : 'warn';
  const profileSourceTone = profileSourceKey === 'hourly-uploaded' ? 'good' : profileSourceKey === 'monthly-derived' ? 'neutral' : 'warn';
  const productionTone = productionProfileClass === 'data-source-good' ? 'good' : 'warn';
  const shadowTone = shadowQuality === 'site-verified' ? 'good' : shadowQuality === 'map-assisted' ? 'neutral' : 'warn';
  const decision = financialDecisionCopy(r);
  const nominalReturn = r.nominalTotalReturnPct ?? r.roi;
  const discountedReturn = r.discountedReturnPct;
  const npvTone = Number(r.npvTotal) >= 0 ? 'good' : 'bad';
  const irrTone = Number(r.irr) >= (Number(r.discountRate || 0) * 100) ? 'good' : 'warn';
  const directUseValue = Number(r.directSelfConsumptionValue);
  const offsetValue = netMeteringActive ? Number(r.importOffsetValue) : 0;
  const exportValue = netMeteringActive ? Number(r.exportRevenueValue ?? r.nmMetrics?.annualExportRevenue ?? 0) : 0;
  const mismatch = r.financialMismatchExplanation === 'nominal-positive-discounted-negative'
    || (Number(r.npvTotal) < 0 && Number(nominalReturn) > 0);
  const energyFlow = [
    { label: i18n.t('onGridResult.flowProduction'), value: `${Number(r.annualEnergy || 0).toLocaleString(localeTag())} kWh` },
    { label: i18n.t('onGridResult.flowDirectUse'), value: `${Math.round(comp.directSelfConsumptionKwh || 0).toLocaleString(localeTag())} kWh` },
    { label: i18n.t('onGridResult.flowOffset'), value: `${Math.round(comp.importOffsetKwh || 0).toLocaleString(localeTag())} kWh` },
    { label: i18n.t('onGridResult.flowSurplus'), value: `${totalExportKwh.toLocaleString(localeTag())} kWh` }
  ];

  setVisible(wrap, true);
  wrap.innerHTML = `
    <section class="on-grid-result-card result-panel result-panel--technical">
      <div class="result-panel-header">
        <div>
          <h3>${escapeHtml(i18n.t('onGridResult.technicalTitle'))}</h3>
          <p class="result-helper">${escapeHtml(i18n.t('onGridResult.technicalHelper'))}</p>
        </div>
        <div class="result-chip-row">
          ${resultChip(i18n.t('onGridResult.profileSourceLabel'), profileSourceText, profileSourceTone)}
          ${resultChip(i18n.t('onGridResult.productionSourceLabel'), productionProfileText, productionTone)}
        </div>
      </div>
      <div class="energy-flow-strip">
        ${energyFlow.map((item, idx) => `
          <div class="energy-flow-step">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </div>
          ${idx < energyFlow.length - 1 ? '<div class="energy-flow-arrow">→</div>' : ''}
        `).join('')}
      </div>
      ${resultSection(i18n.t('onGridResult.sectionInstallation'), [
        resultMetricCell({ eyebrow: i18n.t('onGridResult.installedPower'), value: `${Number(r.systemPower || 0).toFixed(2)} kWp`, label: `${Number(r.panelCount || 0).toLocaleString(localeTag())} ${i18n.t('units.panelUnit')}`, tone: 'accent' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.roofUse'), value: `${roofUsePct.toFixed(1)}%`, label: multiRoofNote, tone: 'neutral' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.shadowQualityLabel'), value: shadowText, label: i18n.t('onGridResult.dataQualityLabel'), tone: shadowTone, wide: true })
      ])}
      ${resultSection(i18n.t('onGridResult.sectionProduction'), [
        resultMetricCell({ eyebrow: i18n.t('onGridResult.annualProduction'), value: `${Number(r.annualEnergy || 0).toLocaleString(localeTag())} kWh`, label: i18n.t('onGridResult.annualProductionNote'), tone: 'accent' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.specificYield'), value: `${r.ysp} kWh/kWp`, label: i18n.t('onGridResult.specificYieldNote'), tone: 'info' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.loadProfile'), value: usageProfileText, label: i18n.t('onGridResult.loadProfileNote'), tone: 'neutral', wide: true })
      ])}
      ${resultSection(i18n.t('onGridResult.sectionEnergyMatch'), [
        resultMetricCell({ eyebrow: i18n.t('onGridResult.selfConsumption'), value: `${r.nmMetrics?.selfConsumptionPct || 0}%`, label: i18n.t('onGridResult.selfConsumptionNote'), tone: 'good' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.directSelfConsumption'), value: `${Math.round(comp.directSelfConsumptionKwh || 0).toLocaleString(localeTag())} kWh`, label: i18n.t('onGridResult.directSelfConsumptionNote'), tone: 'good' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.monthlyOffset'), value: `${Math.round(comp.importOffsetKwh || 0).toLocaleString(localeTag())} kWh`, label: i18n.t('onGridResult.monthlyOffsetNote'), tone: 'neutral' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.totalSurplus'), value: `${totalExportKwh.toLocaleString(localeTag())} kWh`, label: `${i18n.t('onGridResult.paidSurplus')}: ${paidExportKwh.toLocaleString(localeTag())} kWh`, note: `${i18n.t('onGridResult.unpaidSurplus')}: ${unpaidExportKwh.toLocaleString(localeTag())} kWh`, tone: paidExportKwh > 0 ? 'good' : 'warn', wide: true })
      ])}
      ${shadowDoubleCountWarning ? `<div class="on-grid-explain"><span class="data-source-warn">${escapeHtml(shadowDoubleCountWarning)}</span></div>` : ''}
    </section>
    <section class="on-grid-result-card result-panel result-panel--finance">
      <div class="result-panel-header">
        <div>
          <h3>${escapeHtml(i18n.t('onGridResult.economicTitle'))}</h3>
          <p class="result-helper">${escapeHtml(i18n.t('onGridResult.economicHelper'))}</p>
        </div>
        <div class="result-chip-row">
          ${resultChip(i18n.t('onGridResult.pricingModeLabel'), tariffModeText, 'neutral')}
          ${resultChip(i18n.t('onGridResult.costConfidenceLabel'), costSourceText, costSourceTone)}
        </div>
      </div>
      <div class="financial-verdict financial-verdict--${escapeHtml(decision.tone)}">
        <div>
          <strong>${escapeHtml(decision.title)}</strong>
          <span>${escapeHtml(decision.body)}</span>
        </div>
        <b>${escapeHtml(money(r.npvTotal))}</b>
      </div>
      ${mismatch ? `<div class="financial-explain">${escapeHtml(i18n.t('onGridResult.nominalVsDiscountedWarning'))}</div>` : ''}
      ${resultSection(i18n.t('onGridResult.sectionBudget'), [
        resultMetricCell({ eyebrow: i18n.t('onGridResult.totalCost'), value: money(r.totalCost), label: i18n.t('onGridResult.totalCostNote'), tone: 'accent' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.financialBasis'), value: money(r.financialCostBasis || r.totalCost), label: i18n.t('onGridResult.financialBasisNote'), tone: 'neutral' })
      ])}
      ${resultSection(i18n.t('onGridResult.sectionYearOne'), [
        resultMetricCell({ eyebrow: i18n.t('onGridResult.annualSavings'), value: money(r.annualSavings), label: i18n.t('onGridResult.annualSavingsNote'), tone: 'good' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.directUseValue'), value: money(Number.isFinite(directUseValue) ? directUseValue : 0), label: i18n.t('onGridResult.directUseValueNote'), tone: 'good' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.offsetValue'), value: money(Number.isFinite(offsetValue) ? offsetValue : 0), label: i18n.t('onGridResult.offsetValueNote'), tone: offsetValue > 0 ? 'good' : 'neutral' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.exportValue'), value: money(Number.isFinite(exportValue) ? exportValue : 0), label: netMeteringActive ? i18n.t('onGridResult.exportValueNote') : i18n.t('onGridResult.exportValueDisabledNote'), tone: exportValue > 0 ? 'good' : 'warn' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.firstYearNetCashFlow'), value: money(r.firstYearNetCashFlow ?? 0), label: i18n.t('onGridResult.firstYearNetCashFlowNote'), tone: Number(r.firstYearNetCashFlow) >= 0 ? 'good' : 'bad', wide: true })
      ])}
      ${resultSection(i18n.t('onGridResult.sectionPayback'), [
        resultMetricCell({ eyebrow: i18n.t('finance.grossSimplePayback'), value: formatPaybackYears(r.grossSimplePaybackYear), label: i18n.t('onGridResult.simplePaybackNote'), tone: 'accent' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.discountedPaybackLabel'), value: formatPaybackYears(r.discountedPaybackYear), label: i18n.t('onGridResult.discountedPaybackNote'), tone: Number(r.discountedPaybackYear) > 0 ? 'neutral' : 'warn' })
      ])}
      ${resultSection(i18n.t('onGridResult.sectionLongTerm'), [
        resultMetricCell({ eyebrow: i18n.t('onGridResult.netGainPotential'), value: money(r.npvTotal), label: `${i18n.t('onGridResult.discountedReturnLabel')}: ${percentText(discountedReturn)}`, tone: npvTone }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.roiLabel'), value: percentText(nominalReturn), label: i18n.t('onGridResult.nominalReturnNote'), tone: Number(nominalReturn) >= 0 ? 'good' : 'bad' }),
        resultMetricCell({ eyebrow: i18n.t('onGridResult.averageAnnualReturn'), value: r.irr === 'N/A' ? 'N/A' : `${r.irr}%`, label: `${i18n.t('onGridResult.discountRateLabel')}: ${percentText(Number(r.discountRate || 0) * 100, 0)}`, tone: irrTone }),
        resultMetricCell({ eyebrow: i18n.t(r.compensatedLcoe ? 'onGridResult.compensatedLcoeLabel' : 'onGridResult.lcoeLabel'), value: moneyRate(r.compensatedLcoe || r.lcoe, 'kWh'), label: i18n.t('onGridResult.lcoeNoteShort'), tone: 'neutral' })
      ])}
      <div class="assumption-strip">
        ${resultChip(i18n.t('onGridResult.priceIncreaseLabel'), percentText(Number(r.annualPriceIncrease || 0) * 100, 0), 'neutral')}
        ${resultChip(i18n.t('onGridResult.discountRateLabel'), percentText(Number(r.discountRate || 0) * 100, 0), 'neutral')}
        ${resultChip(i18n.t('onGridResult.settlementBasisLabel'), settlementBasisText, 'neutral')}
      </div>
    </section>
  `;
}

function renderBomResults(bom) {
  const techCard = document.getElementById('tech-table-body')?.closest('.card');
  if (!techCard) return;
  let card = document.getElementById('bom-result-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'bom-result-card';
    card.className = 'card';
    card.style.marginTop = '16px';
    techCard.insertAdjacentElement('afterend', card);
  }
  if (!bom?.rows?.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  card.innerHTML = `
    <details class="advanced-details">
      <summary class="advanced-details-summary">Kalem kalem maliyet listesi (isteğe bağlı)</summary>
      <div class="result-helper mb-3">Bu alan teklif hazırlarken kullanılan kalem kalem maliyet listesini gösterir. İlk bakışta gerekli değilse kapalı bırakabilirsiniz.</div>
      <table class="tech-table">
        <tbody>
          ${bom.rows.map(row => `<tr><td>${escapeHtml(row.supplier)} — ${escapeHtml(row.name)}</td><td>${Number(row.quantity || 0).toFixed(row.unit === 'fixed' ? 0 : 1)} ${escapeHtml(row.unit)}</td><td>${money(row.total)}</td></tr>`).join('')}
          <tr><td colspan="2"><strong>BOM Ara Toplam</strong></td><td><strong>${money(bom.subtotal)}</strong></td></tr>
          ${window.state?.results?.proposalGovernance?.bomCommercials ? `
          <tr><td colspan="2">Kontenjan / Risk payı</td><td>${money(window.state.results.proposalGovernance.bomCommercials.contingency)}</td></tr>
          <tr><td colspan="2">Brüt marj</td><td>${money(window.state.results.proposalGovernance.bomCommercials.margin)} (${window.state.results.proposalGovernance.bomCommercials.grossMarginPct}%)</td></tr>
          <tr><td colspan="2"><strong>Önerilen satış fiyatı</strong></td><td><strong>${money(window.state.results.proposalGovernance.bomCommercials.proposedSellPrice)}</strong></td></tr>` : ''}
        </tbody>
      </table>
    </details>
  `;
}

function renderWarningsAndAudit(state, r) {
  document.getElementById('audit-panel-card')?.remove();
  updateTurkeyMapDot(state.lat, state.lon, state.cityName);
  return;

  const techCard = document.getElementById('tech-table-body')?.closest('.card');
  if (!techCard) return;

  let audit = document.getElementById('audit-panel-card');
  if (!audit) {
    audit = document.createElement('div');
    audit.id = 'audit-panel-card';
    audit.className = 'card';
    audit.style.marginTop = '16px';
    techCard.insertAdjacentElement('afterend', audit);
  }

  const warnings = localizeMessageList(Array.isArray(r.calculationWarnings) ? r.calculationWarnings : []);
  const gov = r.proposalGovernance || {};
  const confidence = gov.confidence || {};
  const approval = gov.approval || {};
  const financing = gov.financing || {};
  const maintenance = gov.maintenance || {};
  const revision = gov.revision || {};
  const evidence = r.evidenceGovernance || {};
  const tariffSource = r.tariffSourceGovernance || {};
  const ledgerRows = (gov.ledger?.entries || []).slice(0, 8).map(entry =>
    `<tr><td>${escapeHtml(entry.key)}</td><td>${escapeHtml(entry.value)}</td><td>${escapeHtml(entry.confidence)}</td><td>${escapeHtml(entry.sourceLabel || '—')}</td></tr>`
  ).join('');
  const revisionRows = (revision.diff || []).slice(0, 8).map(item =>
    `<tr><td>${escapeHtml(item.key)}</td><td>${escapeHtml(item.before ?? '—')}</td><td>${escapeHtml(item.after ?? '—')}</td></tr>`
  ).join('');
  const evidenceRows = Object.entries(evidence.registry || {}).map(([key, record]) => {
    const latestFile = (record.files || []).slice(-1)[0];
    const fileText = latestFile ? `${latestFile.name} / ${String(latestFile.sha256 || '').slice(0, 12)}` : '—';
    return `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(statusLabel(record.status))}</td><td>${escapeHtml(record.ref || '—')}</td><td>${escapeHtml(record.checkedAt || record.issuedAt || '—')}</td><td>${escapeHtml(record.validUntil || '—')}</td><td>${escapeHtml(fileText)}</td></tr>`;
  }).join('');
  const auditRows = (state.auditLog || []).slice(-10).reverse().map(entry =>
    `<tr><td>${escapeHtml(entry.timestamp || '—')}</td><td>${escapeHtml(entry.action || '—')}</td><td>${escapeHtml(entry.user?.name || '—')} (${escapeHtml(entry.user?.role || '—')})</td></tr>`
  ).join('');
  const simplifyAuditWarning = warning => {
    const text = String(warning || '').trim();
    if (!text) return '';
    return text
      .replace(/PVGIS verisi alınamadı; fallback PSH hesabı düşük güven seviyesidir\./i, 'Canlı güneş verisi alınamadı. Sonuç geçici yerel tahmin modeliyle üretildiği için güven düşer.')
      .replace(/Off-grid doğruluk puanı düşük:[^.]*\./i, 'Off-grid sonucu şu an kaba ön değerlendirme seviyesinde; saha verisi olmadan belirsizlik yüksektir.')
      .replace(/Gerçek 8760 saatlik PV üretim serisi yok; dispatch aylık üretimden türetilmiş sentetik profil kullanıyor\./i, 'Saatlik gerçek üretim verisi yok. Sistem yıl içine tahmini profil ile dağıtıldı.')
      .replace(/Faz 1 saha dispatch girdileri tamamlanmadan Faz 2 kanıt kapısı açılamaz\./i, 'Saha ölçümü ve saatlik veri olmadan ikinci doğrulama aşamasına geçilemez.')
      .replace(/Faz 1 saatlik dispatch girdileri tamamlanmadan Faz 3 model olgunluğu kabul edilemez\./i, 'Modelin güvenini artırmak için önce gerçek saatlik saha verisi gerekir.')
      .replace(/Faz 1 saatlik dispatch girdileri tamamlanmadan Faz 4 saha kabul kapısı açılamaz\./i, 'Saha kabulü için önce temel ölçüm ve yük kayıtları tamamlanmalıdır.')
      .replace(/Faz 4 saha kabul kapısı tamamlanmadan Faz 5 garanti operasyon kapısı açılamaz\./i, 'Garanti ve işletme aşamasına geçmeden önce saha kabulü tamamlanmalıdır.')
      .replace(/Faz 5 aktif izleme\/operasyon kapısı tamamlanmadan Faz 6 revalidasyon kapısı açılamaz\./i, 'Yıllık yeniden doğrulama için önce aktif izleme dönemi gerekir.')
      .replace(/Kurulu güç sözleşme gücünü aşıyor; bağlantı görüşü ve mahsuplaşma sınırları proje bazında kontrol edilmeli\./i, 'Kurulu güç mevcut sınırları aşıyor olabilir. Bağlantı ve mahsuplaşma tarafı ayrıca kontrol edilmelidir.')
      .replace(/(?:Quote-ready değil|Henüz teklife hazır değil) \| /i, 'Bu sonuç henüz teklif sunumuna hazır değil: ');
  };

  const quoteBlockers = localizeMessageList(r.quoteReadiness?.blockers || []).slice(0, 3);
  const approvalBlockers = localizeMessageList(approval.blockers || []);
  const gridStatus = gov.gridChecklistComplete ? i18n.t('audit.complete') : i18n.t('audit.missingDocuments');
  const tariffFreshness = tariffSource.stale ? 'STALE' : i18n.t('audit.current');
  const parity = r.engineParity || null;
  const parityHasRealComparison = parity?.intentionalDifference === true;
  const parityText = parity && parityHasRealComparison
    ? `${i18n.t('engine.authoritativeSource')}: ${parity.authoritativeSource || '—'} | ${i18n.t('engine.productionDelta')}: ${Number(parity.deltaKwh || 0).toLocaleString(localeTag())} kWh (${Number(parity.deltaPct || 0).toFixed(2)}%)`
    : i18n.t('engine.comparisonUnavailable');
  const isOffGrid = state.scenarioKey === 'off-grid';
  const offGridAuditNote = isOffGrid
    ? `<p class="audit-offgrid-note">${escapeHtml(i18n.t('offGrid.preFeasibilityOnly'))} ${escapeHtml(i18n.t('offGrid.notFeasibilityAnalysis'))}</p>`
    : '';
  const energyBalanceLabel = state.netMeteringEnabled
    ? i18n.t('audit.selfConsumptionExport')
    : isOffGrid
      ? i18n.t('audit.selfConsumptionOffGrid')
      : i18n.t('audit.selfConsumptionSurplus');
  const L2 = isOffGrid ? r.offgridL2Results : null;
  const missingEvidenceCount = Object.values(evidence.registry || {}).filter(record => record?.status !== 'verified').length;
  const simplifiedWarnings = warnings.map(simplifyAuditWarning).filter(Boolean);
  const visibleWarnings = simplifiedWarnings.slice(0, 6);
  const readinessStatus = statusLabel(r.quoteReadiness?.status || confidence.level || '—');
  const reliabilityScore = isOffGrid ? `${L2?.accuracyScore ?? '—'}/100` : `${confidence.score ?? '—'}/100`;
  const reliabilityNote = isOffGrid ? `Belirsizlik bandı ${L2?.accuracyAssessment?.expectedUncertaintyPct ? `±${Number(L2.accuracyAssessment.expectedUncertaintyPct.lowPct || 0).toFixed(0)}-${Number(L2.accuracyAssessment.expectedUncertaintyPct.highPct || 0).toFixed(0)}%` : '—'} seviyesinde.` : `Teklif güven skoru ${confidence.score ?? '—'}/100 seviyesinde.`;
  const annualLoad = Math.round(r.hourlySummary?.annualLoad || state.dailyConsumption * 365).toLocaleString(localeTag());
  const rawWarningsHtml = warnings.length
    ? `<ul class="audit-warning-list">${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
    : `<div class="audit-summary-note">${escapeHtml(i18n.t('audit.noCriticalAnomalies'))}</div>`;
  const energyBalanceValue = L2
    ? `${i18n.t('offgridL2.pvBessCoverageLabel')}: ${formatOffgridCoverageValue(L2.pvBatteryLoadCoverage ?? L2.totalLoadCoverage, L2)} / ${i18n.t('offgridL2.accuracyScoreLabel')}: ${L2.accuracyScore ?? '—'}/100 / ${i18n.t('offgridL2.generatorLabel')}: ${Math.round(L2.generatorEnergyKwh || L2.generatorKwh || 0).toLocaleString(localeTag())} kWh / ${i18n.t('audit.unservedLoad')}: ${Math.round(L2.unmetLoadKwh || 0).toLocaleString(localeTag())} kWh / ${i18n.t('audit.curtailedPv')}: ${Math.round(L2.curtailedPvKwh || 0).toLocaleString(localeTag())} kWh`
    : state.netMeteringEnabled
    ? `${Math.round(r.nmMetrics?.directSelfConsumedEnergy || r.nmMetrics?.selfConsumedEnergy || 0).toLocaleString(localeTag())} kWh direct / offset ${Math.round(r.nmMetrics?.importOffsetEnergy || 0).toLocaleString(localeTag())} kWh / paid ${Math.round(r.nmMetrics?.paidGridExport || 0).toLocaleString(localeTag())} kWh / total ${Math.round(r.nmMetrics?.annualGridExport || 0).toLocaleString(localeTag())} kWh`
    : isOffGrid
      ? `${Math.round(r.nmMetrics?.selfConsumedEnergy || 0).toLocaleString(localeTag())} kWh / ${i18n.t('audit.unservedLoad')}: ${Math.round(r.bessMetrics?.unmetLoadKwh || 0).toLocaleString(localeTag())} kWh / ${i18n.t('audit.curtailedPv')}: ${Math.round(r.nmMetrics?.annualGridExport || 0).toLocaleString(localeTag())} kWh`
      : `${Math.round(r.nmMetrics?.selfConsumedEnergy || 0).toLocaleString(localeTag())} kWh / ${i18n.t('audit.exportRevenueDisabled')}`;

  const scrollHint = `<div class="ui-scroll-hint">${escapeHtml(i18n.t('common.scrollHint'))}</div>`;

  audit.innerHTML = `
    <details class="advanced-details">
      <summary class="advanced-details-summary">Uzman inceleme kayıtları (isteğe bağlı)</summary>
      <div class="audit-purpose-note">
        <strong>${escapeHtml(i18n.t('audit.purposeTitle'))}</strong>
        <span>${escapeHtml(i18n.t('audit.purposeBody'))}</span>
      </div>
      ${offGridAuditNote}
      <div class="audit-summary-grid">
        <article class="audit-summary-card">
          <div class="audit-summary-kicker">Hazırlık Seviyesi</div>
          <div class="audit-summary-value ${isOffGrid && (L2?.accuracyScore || 0) < 60 ? 'bad' : 'warn'}">${escapeHtml(readinessStatus)}</div>
          <div class="audit-summary-note">${escapeHtml(isOffGrid ? 'Bu sonuç saha verisi geldikçe güçlenecek bir ön değerlendirmedir.' : 'Bu sonuç hangi veri eksikleriyle üretildiğini gösterir.')}</div>
        </article>
        <article class="audit-summary-card">
          <div class="audit-summary-kicker">Güven Skoru</div>
          <div class="audit-summary-value ${isOffGrid && (L2?.accuracyScore || 0) < 60 ? 'bad' : 'warn'}">${escapeHtml(reliabilityScore)}</div>
          <div class="audit-summary-note">${escapeHtml(reliabilityNote)}</div>
        </article>
        <article class="audit-summary-card">
          <div class="audit-summary-kicker">Eksik Kanıt</div>
          <div class="audit-summary-value ${missingEvidenceCount > 5 ? 'bad' : 'warn'}">${missingEvidenceCount}</div>
          <div class="audit-summary-note">Doğrulanmamış evrak ve kayıt sayısı. Bu sayı düştükçe sonuç daha savunulabilir hale gelir.</div>
        </article>
      </div>
      <div class="audit-next-step">
        <strong>Bir sonraki mantıklı adım</strong>
        ${escapeHtml(state.scenarioContext?.nextAction || i18n.t('onGridResult.commercialNextAction'))}
      </div>
      <div class="audit-warning-wrap">
        <div class="audit-warning-head">
          <div class="audit-warning-title">Dikkat Gerektiren Noktalar</div>
          <span class="audit-pill">${visibleWarnings.length} madde</span>
        </div>
        ${visibleWarnings.length ? `<ul class="audit-warning-list">${visibleWarnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : `<div class="audit-summary-note">${escapeHtml(i18n.t('audit.noCriticalAnomalies'))}</div>`}
      </div>
      <div class="audit-section-grid">
        <article class="audit-data-card">
          <span class="audit-data-label">Konum ve senaryo</span>
          <span class="audit-data-value">${escapeHtml(state.cityName || '—')} · ${escapeHtml(state.scenarioContext?.label || state.scenarioKey || '—')}</span>
          <span class="audit-data-note">${Number(state.lat || 0).toFixed(4)}, ${Number(state.lon || 0).toFixed(4)} · ${escapeHtml(state.scenarioContext?.nextAction || '—')}</span>
        </article>
        <article class="audit-data-card">
          <span class="audit-data-label">Tüketim ve kapsama</span>
          <span class="audit-data-value">${annualLoad} kWh/yıl</span>
          <span class="audit-data-note">${escapeHtml(energyBalanceValue)}</span>
        </article>
        <article class="audit-data-card">
          <span class="audit-data-label">Üretim bandı</span>
          <span class="audit-data-value">${Math.round(r.annualEnergy * 0.90).toLocaleString(localeTag())} - ${Math.round(r.annualEnergy * 1.10).toLocaleString(localeTag())} kWh/yıl</span>
          <span class="audit-data-note">Baz tahmin: ${r.annualEnergy.toLocaleString(localeTag())} kWh/yıl</span>
        </article>
        <article class="audit-data-card">
          <span class="audit-data-label">Tarife ve kaynak</span>
          <span class="audit-data-value">${escapeHtml(r.tariffModel?.type || state.tariffType)} · ${escapeHtml(r.tariffModel?.effectiveRegime || '—')}</span>
          <span class="audit-data-note">${moneyRate(r.tariff, 'kWh')} · ${escapeHtml(tariffSource.sourceLabel || 'Kaynak girilmedi')}</span>
        </article>
      </div>
      <details class="advanced-details audit-raw-wrap">
        <summary class="advanced-details-summary">Ham kayıtlar ve teknik dökümler</summary>
        <div class="audit-raw-title">Ham uyarı metinleri</div>
        ${rawWarningsHtml}
        <div class="audit-raw-title">Teknik veri özeti</div>
        ${scrollHint}
        <table class="tech-table">
          <tbody>
            <tr><td>${escapeHtml(i18n.t('audit.location'))}</td><td>${escapeHtml(state.cityName || '—')} (${Number(state.lat || 0).toFixed(4)}, ${Number(state.lon || 0).toFixed(4)})</td></tr>
            <tr><td>${escapeHtml(i18n.t('audit.tariff'))}</td><td>${escapeHtml(r.tariffModel?.type || state.tariffType)} | ${escapeHtml(r.tariffModel?.effectiveRegime || '—')} | ${moneyRate(r.tariff, 'kWh')} | ${escapeHtml(i18n.t('audit.source'))}: ${escapeHtml(r.tariffModel?.sourceDate || '—')}</td></tr>
            <tr><td>${escapeHtml(i18n.t('audit.regulationEngine'))}</td><td>${escapeHtml(r.tariffModel?.regulation?.effectiveRegimeBasis || '—')} | SKTT activation: ${escapeHtml(r.tariffModel?.regulation?.activationDate || '—')} | eval: ${escapeHtml(r.tariffModel?.regulation?.evaluationDate || '—')}</td></tr>
            <tr><td>${escapeHtml(i18n.t('audit.consumption'))}</td><td>${annualLoad} kWh/${escapeHtml(i18n.t('units.year'))}</td></tr>
            <tr><td>${escapeHtml(energyBalanceLabel)}</td><td>${escapeHtml(energyBalanceValue)}</td></tr>
            <tr><td>${escapeHtml(i18n.t('audit.productionConfidenceRange'))}</td><td>${escapeHtml(i18n.t('audit.badYear'))}: ${Math.round(r.annualEnergy * 0.90).toLocaleString(localeTag())} kWh | ${escapeHtml(i18n.t('audit.baseYear'))}: ${r.annualEnergy.toLocaleString(localeTag())} kWh | ${escapeHtml(i18n.t('audit.goodYear'))}: ${Math.round(r.annualEnergy * 1.10).toLocaleString(localeTag())} kWh</td></tr>
            <tr><td>${escapeHtml(i18n.t('governance.confidenceLevel'))}</td><td>${escapeHtml(statusLabel(r.confidenceLevel))} (${escapeHtml(r.calculationMode)})</td></tr>
            <tr><td>${escapeHtml(i18n.t('scenario.label'))}</td><td>${escapeHtml(state.scenarioContext?.label || state.scenarioKey || 'On-Grid')} | ${escapeHtml(state.scenarioContext?.nextAction || '—')}</td></tr>
            <tr><td>${escapeHtml(i18n.t('engine.authoritative'))}</td><td>${escapeHtml(backendEngineText(r, state))} | ${escapeHtml(r.sourceQualityNote || '—')}</td></tr>
            <tr><td>${escapeHtml(i18n.t('engine.parity'))}</td><td>${escapeHtml(parityText)}</td></tr>
            <tr><td>${escapeHtml(i18n.t('engine.fallbackReason'))}</td><td>${escapeHtml(localizeKnownMessage(r.authoritativeEngineFallbackReason || '—'))}</td></tr>
            <tr><td>${escapeHtml(i18n.t('governance.quoteReadiness'))}</td><td>${escapeHtml(statusLabel(r.quoteReadiness?.status || '—'))}${quoteBlockers.length ? ' | ' + escapeHtml(quoteBlockers.join(' · ')) : ''}</td></tr>
            <tr><td>${escapeHtml(i18n.t('audit.regulationEngine'))}</td><td>${escapeHtml(r.quoteReadiness?.version || r.tariffModel?.exportCompensationPolicy?.version || '—')} | ${escapeHtml(r.tariffModel?.exportCompensationPolicy?.assumptionBasis || '—')}</td></tr>
            <tr><td>${escapeHtml(i18n.t('audit.tariffSourceGovernance'))}</td><td>${escapeHtml(tariffSource.sourceLabel || '—')} | ${escapeHtml(i18n.t('audit.sourceAge'))}: ${tariffSource.ageDays ?? '—'} ${escapeHtml(i18n.t('units.year')) === 'year' ? 'days' : 'gün'} | ${escapeHtml(tariffFreshness)}</td></tr>
            <tr><td>${escapeHtml(i18n.t('governance.proposalConfidence'))}</td><td>${confidence.score ?? '—'} / 100 · ${escapeHtml(statusLabel(confidence.level || '—'))}</td></tr>
            <tr><td>${escapeHtml(i18n.t('governance.approvalState'))}</td><td>${escapeHtml(statusLabel(approval.state || 'draft'))}${approval.approvalRecord ? ' | immutable: ' + escapeHtml(approval.approvalRecord.id) : ''}${approvalBlockers.length ? ' | ' + escapeHtml(approvalBlockers.join(' · ')) : ''}</td></tr>
            <tr><td>${escapeHtml(i18n.t('audit.financing'))}</td><td>${escapeHtml(i18n.t('audit.monthlyPayment'))}: ${financing.monthlyPayment ? money(financing.monthlyPayment) : '—'} | DSCR: ${financing.firstYearDebtServiceCoverage ?? '—'}</td></tr>
            <tr><td>${escapeHtml(i18n.t('audit.maintenanceContract'))}</td><td>${money(maintenance.annualBase || 0)}/${escapeHtml(i18n.t('units.year'))} | 10 ${escapeHtml(i18n.t('units.year'))}: ${money(maintenance.tenYearNominal || 0)} | ${escapeHtml(statusLabel(maintenance.contractStatus || '—'))}</td></tr>
            <tr><td>${escapeHtml(i18n.t('audit.gridApplication'))}</td><td>${escapeHtml(gridStatus)}</td></tr>
            <tr><td>${escapeHtml(i18n.t('audit.dataPrivacy'))}</td><td>${escapeHtml(i18n.t('audit.privacyLocalOnly'))}</td></tr>
          </tbody>
        </table>
        <div class="audit-raw-title">${escapeHtml(i18n.t('audit.assumptionLedger'))}</div>
        ${scrollHint}
        <table class="tech-table"><thead><tr><th>${escapeHtml(i18n.t('audit.assumption'))}</th><th>${escapeHtml(i18n.t('audit.value'))}</th><th>${escapeHtml(i18n.t('audit.confidence'))}</th><th>${escapeHtml(i18n.t('audit.source'))}</th></tr></thead><tbody>${ledgerRows || '<tr><td colspan="4">—</td></tr>'}</tbody></table>
        <div class="audit-raw-title">${escapeHtml(i18n.t('audit.evidenceRecords'))}</div>
        ${scrollHint}
        <table class="tech-table"><thead><tr><th>${escapeHtml(i18n.t('audit.evidence'))}</th><th>${escapeHtml(i18n.t('audit.status'))}</th><th>Ref</th><th>${escapeHtml(i18n.t('audit.checkedDate'))}</th><th>${escapeHtml(i18n.t('audit.validity'))}</th><th>File / SHA-256</th></tr></thead><tbody>${evidenceRows || '<tr><td colspan="6">—</td></tr>'}</tbody></table>
        <div class="audit-raw-title">${escapeHtml(i18n.t('audit.revisionDiff'))}</div>
        <table class="tech-table"><thead><tr><th>${escapeHtml(i18n.t('audit.field'))}</th><th>${escapeHtml(i18n.t('audit.before'))}</th><th>${escapeHtml(i18n.t('audit.after'))}</th></tr></thead><tbody>${revisionRows || `<tr><td colspan="3">${escapeHtml(i18n.t('audit.noRevisionDiff'))}</td></tr>`}</tbody></table>
        <div class="audit-raw-title">${escapeHtml(i18n.t('audit.auditLog'))}</div>
        <table class="tech-table"><thead><tr><th>${escapeHtml(i18n.t('audit.time'))}</th><th>${escapeHtml(i18n.t('audit.action'))}</th><th>${escapeHtml(i18n.t('audit.user'))}</th></tr></thead><tbody>${auditRows || `<tr><td colspan="3">${escapeHtml(i18n.t('audit.noAuditRecords'))}</td></tr>`}</tbody></table>
      </details>
    </details>
  `;

  // Türkiye SVG haritasında şehir noktasını güncelle
  updateTurkeyMapDot(state.lat, state.lon, state.cityName);
}

function updateTurkeyMapDot(lat, lon, cityName) {
  // SVG viewBox: 0 0 800 360 — Türkiye coğrafi sınırları: lon 26–45, lat 36–42
  const svgW = 800, svgH = 360;
  const lonMin = 26, lonMax = 45, latMin = 36, latMax = 42;
  if (!lat || !lon) return;

  const rawX = ((lon - lonMin) / (lonMax - lonMin)) * svgW;
  const rawY = svgH - ((lat - latMin) / (latMax - latMin)) * svgH;
  const x = Math.max(28, Math.min(svgW - 28, rawX));
  const y = Math.max(28, Math.min(svgH - 24, rawY));

  const pulse = document.getElementById('city-pulse-dot');
  const inner = document.getElementById('city-dot-inner');
  const label = document.getElementById('city-dot-label');

  if (pulse) { pulse.setAttribute('cx', x.toFixed(0)); pulse.setAttribute('cy', y.toFixed(0)); pulse.setAttribute('opacity', '0.9'); }
  if (inner) { inner.setAttribute('cx', x.toFixed(0)); inner.setAttribute('cy', y.toFixed(0)); inner.setAttribute('opacity', '1'); }
  if (label) {
    const isNearLeft = rawX < 70;
    const isNearRight = rawX > (svgW - 70);
    const placeBelow = rawY < 58;
    const labelX = isNearLeft ? x + 10 : isNearRight ? x - 10 : x;
    const labelY = placeBelow ? Math.max(42, y + 18) : y - 16;
    const anchor = isNearLeft ? 'start' : isNearRight ? 'end' : 'middle';
    label.setAttribute('x', x.toFixed(0));
    label.setAttribute('x', labelX.toFixed(0));
    label.setAttribute('y', labelY.toFixed(0));
    label.setAttribute('text-anchor', anchor);
    label.setAttribute('opacity', '1');
    label.textContent = cityName || '';
  }
}


export function renderMonthlyChart(data, avgConsumption) {
  const canvas = document.getElementById('monthly-chart-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (monthlyChart) monthlyChart.destroy();

  // NaN/null guard — Chart.js sıfır beklediğinde null/NaN çizim bozar
  const safeData = Array.isArray(data)
    ? data.map(v => (v == null || isNaN(v) || !isFinite(v)) ? 0 : v)
    : Array(12).fill(0);

  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, 'rgba(245,158,11,0.88)');
  grad.addColorStop(0.55, 'rgba(245,158,11,0.4)');
  grad.addColorStop(1, 'rgba(245,158,11,0.05)');

  monthlyChart = new Chart(ctx, {
    data: {
      labels: MONTHS,
      datasets: [
        {
          type: 'bar',
          label: i18n.t('charts.monthlyProduction'),
          data: safeData,
          backgroundColor: grad,
          borderColor: 'rgba(245,158,11,0.9)',
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
          order: 2
        },
        (() => {
          const billMonths = window.state?.monthlyConsumption;
          const hasBill = Array.isArray(billMonths) && billMonths.length === 12 && billMonths.some(v => v > 0);
          const consumptionData = hasBill
            ? billMonths.map(v => (v == null || isNaN(v) ? 0 : v))
            : new Array(12).fill(avgConsumption || 250);
          const consumptionLabel = hasBill
            ? 'Fatura Tüketimi (kWh)'
            : `Ortalama Tüketim (~${Math.round(avgConsumption || 250).toLocaleString(localeTag())} kWh/ay)`;
          return {
            type: 'line',
            label: consumptionLabel,
            data: consumptionData,
            borderColor: '#06B6D4',
            borderDash: hasBill ? [] : [5, 5],
            borderWidth: hasBill ? 2.5 : 2,
            pointRadius: hasBill ? 4 : 0,
            pointBackgroundColor: '#06B6D4',
            fill: false,
            order: 1
          };
        })()
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#94A3B8', font: { family: 'Space Grotesk, Inter', size: 11 } } },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)',
          borderColor: 'rgba(71,85,105,0.5)',
          borderWidth: 1,
          titleColor: '#F1F5F9',
          bodyColor: '#94A3B8',
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: c => ' ' + (c.raw || 0).toLocaleString(localeTag()) + ' kWh'
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94A3B8', font: { family: 'Space Grotesk, Inter' } },
          grid: { color: 'rgba(71,85,105,0.18)', drawBorder: false }
        },
        y: {
          ticks: { color: '#94A3B8', font: { family: 'Space Grotesk, Inter' } },
          grid: { color: 'rgba(71,85,105,0.18)', drawBorder: false }
        }
      }
    }
  });
}

// ── Faz C: EV Sonuçları ─────────────────────────────────────────────────────
function renderEVResults(ev) {
  const card = document.getElementById('ev-result-card');
  if (!card) return;
  if (!ev) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  card.innerHTML = `
    <div class="result-card-header">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><circle cx="7" cy="14" r="1"/><circle cx="17" cy="14" r="1"/></svg>
      <span>EV Şarj Analizi</span>
    </div>
    <div class="result-metrics-grid">
      <div class="result-metric"><div class="result-metric-val">${ev.annual_kWh.toLocaleString('tr-TR')}</div><div class="result-metric-label">kWh/yıl EV ihtiyacı</div></div>
      <div class="result-metric"><div class="result-metric-val">${ev.solarChargeRatio}%</div><div class="result-metric-label">Güneşle şarj oranı</div></div>
      <div class="result-metric"><div class="result-metric-val">${money(ev.fuelCostSaved)}</div><div class="result-metric-label">Yıllık yakıt tasarrufu</div></div>
      <div class="result-metric"><div class="result-metric-val">${money(ev.netSaving)}</div><div class="result-metric-label">Net yıllık tasarruf</div></div>
    </div>
    <p class="text-helper-78-mt-2">Ek panel ihtiyacı: ${ev.additionalPanels} adet | Güneşten şarj: ${ev.solarChargeKwh.toLocaleString('tr-TR')} kWh/yıl</p>
  `;
}

// ── Faz C: Isı Pompası Sonuçları ────────────────────────────────────────────
function renderHeatPumpResults(hp) {
  const card = document.getElementById('heatpump-result-card');
  if (!card) return;
  if (!hp) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  card.innerHTML = `
    <div class="result-card-header">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2"><path d="M12 2v6M12 22v-6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"/></svg>
      <span>Isı Pompası Analizi</span>
    </div>
    <div class="result-metrics-grid">
      <div class="result-metric"><div class="result-metric-val">${hp.annual_heat_demand.toLocaleString('tr-TR')}</div><div class="result-metric-label">kWh/yıl ısıtma talebi</div></div>
      <div class="result-metric"><div class="result-metric-val">COP ${hp.cop}</div><div class="result-metric-label">Verimlilik katsayısı</div></div>
      <div class="result-metric"><div class="result-metric-val">${money(hp.gas_cost)}</div><div class="result-metric-label">Mevcut doğalgaz maliyeti</div></div>
      <div class="result-metric"><div class="result-metric-val">${money(hp.savings)}</div><div class="result-metric-label">Yıllık tasarruf</div></div>
    </div>
    <p class="text-helper-78-mt-2">Isı pompası elektrik tüketimi: ${hp.hp_electricity.toLocaleString('tr-TR')} kWh/yıl</p>
  `;
}

// ── Faz C: Yapısal Kontrol Sonuçları ────────────────────────────────────────
function renderStructuralResults(sc) {
  const card = document.getElementById('structural-result-card');
  if (!card) return;
  if (!sc) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  const snowStatus = sc.snowLoad <= 0.5 ? 'ok' : sc.snowLoad <= 1.0 ? 'warn' : 'danger';
  const windStatus = sc.windPressure <= 0.5 ? 'ok' : sc.windPressure <= 1.0 ? 'warn' : 'danger';
  const statusColors = { ok: '#10B981', warn: '#F59E0B', danger: '#EF4444' };
  const statusLabels = { ok: 'OK', warn: 'Dikkat', danger: 'Kritik' };
  const overallStatus = snowStatus === 'danger' || windStatus === 'danger'
    ? { label: 'Detaylı statik inceleme gerekli', color: 'danger', note: 'Yükler yüksek göründüğü için mühendislik onayı olmadan uygulama önerilmez.' }
    : snowStatus === 'warn' || windStatus === 'warn'
      ? { label: 'Saha ve taşıyıcı kontrol önerilir', color: 'warn', note: 'Kurulum öncesi taşıyıcı yüzey, konstrüksiyon ve bağlantı detayları yerinde doğrulanmalıdır.' }
      : { label: 'İlk bakışta uygulanabilir görünüyor', color: 'good', note: 'Yine de nihai taşıyıcı kararını statik proje ve saha kontrolü vermelidir.' };

  card.innerHTML = `
    <div class="result-card-header">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
      <span>Yapısal Kontrol</span>
    </div>
    <div class="structural-insight-grid">
      <article class="structural-insight-card">
        <div class="structural-insight-value structural-insight--${snowStatus}">${sc.snowLoad.toFixed(2)} kN/m²</div>
        <div class="structural-insight-label">Kar yükü · ${sc.snowZone}</div>
        <div class="structural-insight-note">Kış koşullarında taşıyıcı yüzeyin veya konstrüksiyonun taşıması beklenen ek yük. Bölge ağırlaştıkça bağlantı detayları daha kritik hale gelir.</div>
      </article>
      <article class="structural-insight-card">
        <div class="structural-insight-value structural-insight--${windStatus}">${sc.windPressure.toFixed(2)} kN/m²</div>
        <div class="structural-insight-label">Rüzgar basıncı · ${sc.windZone}</div>
        <div class="structural-insight-note">Rüzgarın panel ve taşıyıcı sistem üzerinde oluşturabileceği emme ve baskı etkisini temsil eder.</div>
      </article>
      <article class="structural-insight-card">
        <div class="structural-insight-value ${overallStatus.color}">${overallStatus.label}</div>
        <div class="structural-insight-label">Genel yorum</div>
        <div class="structural-insight-note">${overallStatus.note}</div>
      </article>
    </div>
    <div class="structural-recommendation">
      <strong>Nasıl yorumlanmalı?</strong>
      ${sc.recommendation}
    </div>
  `;
}

// ── Faz D: Vergi Sonuçları ────────────────────────────────────────────────
function renderTaxResults(tax) {
  const card = document.getElementById('tax-result-card');
  if (!card) return;
  if (!tax) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  card.innerHTML = `
    <div class="result-card-header">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
      <span>Vergi Avantajı Özeti</span>
    </div>
    <div class="result-metrics-grid">
      <div class="result-metric"><div class="result-metric-val">${money(tax.taxShieldNPV)}</div><div class="result-metric-label">Amortisman vergi kalkanı (NPV)</div></div>
      <div class="result-metric"><div class="result-metric-val">${money(tax.kdv_recovery)}</div><div class="result-metric-label">KDV iadesi</div></div>
      <div class="result-metric"><div class="result-metric-val">${money(tax.totalTaxBenefit)}</div><div class="result-metric-label">Toplam vergi avantajı</div></div>
      <div class="result-metric"><div class="result-metric-val">${money(tax.effectiveCost)}</div><div class="result-metric-label">Efektif yatırım maliyeti</div></div>
    </div>
  `;
}

// ── Faz B: Fatura Analizi Sonuçları (placeholder) ────────────────────────
function renderBillAnalysisResults(ba) {
  const chartWrap = document.querySelector('.chart-wrap');
  if (!chartWrap || !ba) return;
  let card = document.getElementById('bill-result-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'bill-result-card';
    card.className = 'card';
    card.style.marginTop = '16px';
    chartWrap.insertAdjacentElement('afterend', card);
  }
  const best = ba.rows.reduce((acc, row) => Number(row.coveragePct) > Number(acc.coveragePct) ? row : acc, ba.rows[0]);
  const worst = ba.rows.reduce((acc, row) => Number(row.coveragePct) < Number(acc.coveragePct) ? row : acc, ba.rows[0]);
  card.innerHTML = `
    <div class="card-title">Fatura Analizi</div>
    <div class="result-metrics-grid">
      <div class="result-metric"><div class="result-metric-val">${ba.annualConsumption.toLocaleString('tr-TR')}</div><div class="result-metric-label">kWh/yıl tüketim</div></div>
      <div class="result-metric"><div class="result-metric-val">${ba.avgCoveragePct.toFixed(1)}%</div><div class="result-metric-label">Ortalama aylık karşılama</div></div>
      <div class="result-metric"><div class="result-metric-val">${money(ba.annualSaving)}</div><div class="result-metric-label">Yıllık eşleşme tasarrufu</div></div>
      <div class="result-metric"><div class="result-metric-val">${MONTHS[best.month]} / ${MONTHS[worst.month]}</div><div class="result-metric-label">En iyi / en zayıf ay</div></div>
    </div>
  `;
}

// ── PDF ─────────────────────────────────────────────────────────────────────
function normalizeTR(str) {
  if (!str) return '';
  return String(str)
    .replace(/ş/g,'s').replace(/Ş/g,'S')
    .replace(/ı/g,'i').replace(/İ/g,'I')
    .replace(/ğ/g,'g').replace(/Ğ/g,'G')
    .replace(/ç/g,'c').replace(/Ç/g,'C')
    .replace(/ö/g,'o').replace(/Ö/g,'O')
    .replace(/ü/g,'u').replace(/Ü/g,'U');
}

function pdfSafeText(value) {
  const text = String(value ?? '');
  // jsPDF's built-in Helvetica path is not reliably Unicode-complete for
  // Turkish glyphs. Preserve normal Latin text, and transliterate only glyphs
  // known to render poorly until a bundled Unicode font is added.
  return /[şŞıİğĞçÇöÖüÜ]/.test(text) ? normalizeTR(text) : text;
}

export function downloadPDF() {
  const state = window.state;
  if (!state.results) return;
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    window.showToast?.(i18n.t('report.pdfLibraryMissing'), 'error');
    return;
  }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const r = state.results;
  const p = PANEL_TYPES[state.panelType];
  const dateLocale = localeTag();
  const yearUnit = i18n.t('units.year');
  const prDisplayText = r.usedFallback ? i18n.t('onGridResult.prUnavailableShort') : `${r.pr}%`;

  // Kapak Sayfası
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setTextColor(245, 158, 11);
  doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text(pdfSafeText('Solar Rota'), 20, 25);
  doc.setFontSize(12); doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(pdfSafeText(i18n.t('report.proposalTitle')), 20, 33);
  doc.setFontSize(10);
  doc.text(`${pdfSafeText(state.cityName || '—')} — ${new Date().toLocaleDateString(dateLocale)}`, 20, 41);
  doc.setFontSize(8); doc.setTextColor(245, 158, 11);
  doc.text(pdfSafeText(`${i18n.t('report.methodology')}: ${r.methodologyVersion || '—'} | ${i18n.t('report.calculationMode')}: ${r.calculationMode || '—'} | ${i18n.t('report.sourceDate')}: ${r.tariffModel?.sourceDate || '—'}`), 20, 48);
  doc.setTextColor(148, 163, 184);
  doc.text(pdfSafeText(i18n.t('report.preFeasibilityDisclaimer')), 20, 53);
  doc.text(pdfSafeText(i18n.t('report.pdfFontNote')), 20, 57);

  // Ayırıcı çizgi
  doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.5);
  doc.line(20, 62, 190, 62);

  // KPI özet
  doc.setTextColor(241, 245, 249); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  const kpis = [
    [pdfSafeText(i18n.t('report.annualProduction')), r.annualEnergy.toLocaleString(dateLocale) + ' kWh'],
    [pdfSafeText(i18n.t('report.annualSavings')), money(r.annualSavings)],
    [pdfSafeText(i18n.t('onGridResult.firstYearNetCashFlow')), money(r.firstYearNetCashFlow ?? 0)],
    [pdfSafeText(i18n.t('report.systemPower')), r.systemPower.toFixed(2) + ' kWp'],
    [pdfSafeText(i18n.t('report.totalCost')), money(r.totalCost)],
    [pdfSafeText(i18n.t('finance.grossSimplePayback')), formatPaybackYears(r.grossSimplePaybackYear, yearUnit)],
    [pdfSafeText(i18n.t('report.discountedPayback')), formatPaybackYears(r.discountedPaybackYear, yearUnit)],
    [pdfSafeText(`NPV (25 ${yearUnit})`), money(r.npvTotal)],
    [pdfSafeText(i18n.t('onGridResult.averageAnnualReturn')), r.irr + '%'],
    [pdfSafeText(i18n.t(r.compensatedLcoe ? 'onGridResult.compensatedLcoeLabel' : 'onGridResult.lcoeLabel')), moneyRate(r.compensatedLcoe || r.lcoe, 'kWh')],
    [pdfSafeText(i18n.t('onGridResult.roiLabel')), `${r.nominalTotalReturnPct ?? r.roi}%`],
    [pdfSafeText(i18n.t('report.co2Savings')), r.co2Savings + ` ${i18n.t('units.tonsCo2PerYear')}`],
  ];
  if (state.scenarioKey === 'off-grid' && r.offgridL2Results) {
    const L = r.offgridL2Results;
    kpis.push(
      [pdfSafeText(i18n.t('offgridL2.pvBessCoverageLabel')), formatOffgridCoverageValue(L.pvBatteryLoadCoverage ?? L.totalLoadCoverage, L)],
      [pdfSafeText(i18n.t('offgridL2.totalCoverageWithGeneratorLabel')), formatOffgridCoverageValue(L.totalLoadCoverage, L)],
      [pdfSafeText(i18n.t('offgridL2.accuracyScoreLabel')), `${L.accuracyScore ?? '—'} / 100${L.expectedUncertaintyPct ? ` (${Number(L.expectedUncertaintyPct.lowPct || 0).toFixed(0)}-${Number(L.expectedUncertaintyPct.highPct || 0).toFixed(0)}%)` : ''}`],
      [pdfSafeText(i18n.t('offgridL2.resultAutonomousDays')), `${L.autonomousDays ?? '—'} ${yearUnit}`],
      ...(L.generatorEnabled ? [[pdfSafeText(i18n.t('offgridL2.resultAutonomousDaysWithGenerator')), `${L.autonomousDaysWithGenerator ?? '—'} ${yearUnit}`]] : []),
      [pdfSafeText(i18n.t('offgridL2.generatorLabel')), `${Math.round(L.generatorEnergyKwh || L.generatorKwh || 0).toLocaleString(dateLocale)} kWh`],
      [pdfSafeText(i18n.t('offgridL2.unmetLabel')), `${Math.round(L.unmetLoadKwh || 0).toLocaleString(dateLocale)} kWh`]
    );
  } else {
    kpis.push([pdfSafeText(i18n.t('onGridResult.settlementBasisLabel')), pdfSafeText(r.settlementProvisional ? i18n.t('onGridResult.settlementProvisional') : (r.tariffModel?.exportCompensationPolicy?.assumptionBasis || '—'))]);
  }

  let y = 72;
  doc.setFontSize(9);
  kpis.forEach(([lbl, val]) => {
    doc.setTextColor(148, 163, 184); doc.setFont('helvetica', 'normal');
    doc.text(lbl, 25, y);
    doc.setTextColor(241, 245, 249); doc.setFont('helvetica', 'bold');
    doc.text(val, 100, y);
    y += 8;
  });

  // Sayfa 2 — Sistem Tasarımı
  doc.addPage();
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 297, 'F');
  doc.setTextColor(245, 158, 11); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(pdfSafeText(i18n.t('report.systemDesign')), 20, 20);
  doc.setTextColor(241, 245, 249); doc.setFontSize(9); doc.setFont('helvetica', 'normal');

  const techRows = [
    [i18n.t('report.panelType'), p.name], [i18n.t('report.panelCount'), r.panelCount + ` ${i18n.t('report.panelCountUnit')}`],
    [i18n.t('report.systemPower'), r.systemPower.toFixed(2) + ' kWp'],
    [i18n.t('report.roofTilt'), state.tilt + '°'],
    [i18n.t('report.roofAzimuth'), state.azimuthName],
    ['PR', prDisplayText], ['PSH', r.psh + ` ${i18n.t('report.hoursPerDay')}`],
    [i18n.t('report.specificYield'), r.ysp + ' kWh/kWp'],
  ];
  y = 35;
  techRows.forEach(([k, v]) => {
    doc.setTextColor(148, 163, 184); doc.text(pdfSafeText(k), 25, y);
    doc.setTextColor(241, 245, 249); doc.text(pdfSafeText(v), 100, y);
    y += 7;
  });

  // Maliyet kırılımı
  y += 5;
  doc.setTextColor(245, 158, 11); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(pdfSafeText(i18n.t('report.costBreakdown')), 20, y); y += 8;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  const cb = r.costBreakdown;
  const costDenominator = cb.totalWithBatteryAndGenerator || cb.totalWithBattery || cb.total || 1;
  const costRows = [
    ['Panel', cb.panel], ['Inverter', cb.inverter],
    [i18n.t('report.mounting'), cb.mounting], ['DC Cable', cb.dcCable],
    ['AC Electrical', cb.acElec], [i18n.t('report.labor'), cb.labor],
    ['TEDAŞ + Permit', cb.permits], [`VAT/KDV (%${Math.round((cb.kdvRate ?? 0.20) * 100)})`, cb.kdv],
    ...(cb.battery ? [[i18n.t('offgridL2.batteryLabel'), cb.battery]] : []),
    ...(cb.generatorCapex ? [[i18n.t('offgridL2.generatorCapex'), cb.generatorCapex]] : []),
    [i18n.t('report.grandTotal'), costDenominator]
  ];
  costRows.forEach(([lbl, val]) => {
    doc.setTextColor(148, 163, 184);
    doc.text(pdfSafeText(lbl), 25, y);
    const w = 40;
    const barW = Math.min((val / costDenominator) * w, w);
    doc.setFillColor(245, 158, 11); doc.rect(75, y - 3, barW * 1.2, 4, 'F');
    doc.setTextColor(241, 245, 249);
    doc.text(money(Math.round(val)), 165, y);
    y += 7;
  });

  // Sayfa 3 — 25 Yıl Tablo
  doc.addPage();
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 297, 'F');
  doc.setTextColor(245, 158, 11); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(pdfSafeText(i18n.t('report.yearProjection')), 20, 15);

  doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.setTextColor(148, 163, 184);
  const headers7 = [i18n.t('report.year'), i18n.t('report.production'), i18n.t('report.tariff'), i18n.t('report.savings'), i18n.t('report.expenses'), 'Net', i18n.t('report.cumulative')];
  const xCols = [15, 30, 55, 75, 100, 125, 150, 178];
  headers7.forEach((h, i) => doc.text(pdfSafeText(h), xCols[i], 25));
  doc.setLineWidth(0.2); doc.setDrawColor(71, 85, 105);
  doc.line(15, 27, 195, 27);

  let row = 32;
  doc.setFont('helvetica', 'normal');
  r.yearlyTable.slice(0, 25).forEach(yr => {
    if (row > 275) { doc.addPage(); doc.setFillColor(15,23,42); doc.rect(0,0,210,297,'F'); row = 15; }
    if (yr.year === Math.round(Number(r.grossSimplePaybackYear || r.paybackYear))) { doc.setFillColor(16,185,129,50); doc.rect(13, row-4, 182, 6, 'F'); }
    doc.setTextColor(241, 245, 249);
    const vals = [yr.year+'', yr.energy.toLocaleString(dateLocale), moneyRate(yr.effectiveImportRate || yr.rate, 'kWh'),
      money(yr.savings), money(yr.expenses),
      money(yr.netCashFlow), money(yr.cumulative)];
    vals.forEach((v, i) => doc.text(v, xCols[i], row));
    row += 6;
  });

  doc.save(`solar-rota-${pdfSafeText(state.cityName || 'rapor')}-${new Date().getFullYear()}.pdf`);
  window.showToast(i18n.t('report.pdfDownloaded'), 'success');
}

export function downloadTechnicalPDF() {
  const state = window.state;
  if (!state.results) return;
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    window.showToast?.(i18n.t('report.pdfLibraryMissing'), 'error');
    return;
  }

  if (window.renderEngReport) window.renderEngReport();
  const body = document.getElementById('eng-report-body');
  const reportText = (body?.innerText || body?.textContent || '').trim();
  if (!reportText) {
    window.showToast?.(i18n.t('report.technicalContentMissing'), 'error');
    return;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const r = state.results;
  let y = 18;
  const marginX = 16;
  const lineHeight = 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(pdfSafeText(i18n.t('report.technicalTitle')), marginX, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(pdfSafeText(`${i18n.t('report.methodology')}: ${r.methodologyVersion || '—'} | ${i18n.t('report.calculationMode')}: ${r.calculationMode || '—'} | Engine=${r.authoritativeEngineSource?.source || r.engineSource?.source || '—'}`), marginX, y);
  y += 8;
  doc.text(pdfSafeText(i18n.t('report.pdfFontNote')), marginX, y);
  y += 6;

  const lines = reportText
    .split('\n')
    .map(line => pdfSafeText(line.trim()))
    .filter(Boolean)
    .flatMap(line => doc.splitTextToSize ? doc.splitTextToSize(line, 178) : [line]);

  doc.setFontSize(7);
  lines.forEach(line => {
    if (y > 285) {
      doc.addPage();
      y = 16;
    }
    doc.text(line, marginX, y);
    y += lineHeight;
  });

  doc.save(`solar-rota-teknik-${pdfSafeText(state.cityName || 'rapor')}-${new Date().getFullYear()}.pdf`);
  window.showToast(i18n.t('report.technicalPdfDownloaded'), 'success');
}

export function shareResults() {
  const state = window.state;
  const params = { v: 3, state: createShareStateSnapshot(state) };
  const encoded = btoa(encodeURIComponent(JSON.stringify(params)));
  const url = window.location.origin + window.location.pathname + '#' + encoded;
  navigator.clipboard.writeText(url).then(() => {
    window.showToast(i18n.t('export.shareCopied'), 'success');
  }).catch(() => {
    prompt(i18n.t('export.copyLinkPrompt'), url);
  });
}

export function loadFromHash() {
  const state = window.state;
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  try {
    if (hash.length > 200000) throw new Error('Shared state is too large');
    const params = JSON.parse(decodeURIComponent(atob(hash)));
    if (params.v >= 2 && params.state) {
      const safeState = sanitizeSharedState(params.state);
      Object.assign(state, safeState, { results: null, step: 1 });
      const multiRoofToggle = document.getElementById('multi-roof-toggle');
      if (multiRoofToggle) multiRoofToggle.checked = !!safeState.multiRoof;
      const roofSectionsExtra = document.getElementById('roof-sections-extra');
      if (roofSectionsExtra) roofSectionsExtra.style.display = safeState.multiRoof ? 'block' : 'none';
      window.renderRoofSections?.();
      window.syncMultiRoofUi?.();
      if (safeState.cityName) document.getElementById('city-search').value = safeState.cityName;
      if (safeState.roofArea) document.getElementById('roof-area').value = safeState.roofArea;
      if (safeState.tilt !== undefined) { document.getElementById('tilt-slider').value = safeState.tilt; window.updateTilt(safeState.tilt); }
      if (safeState.shadingFactor !== undefined) { document.getElementById('shading-slider').value = safeState.shadingFactor; window.updateShading(safeState.shadingFactor); }
      if (safeState.soilingFactor !== undefined) { document.getElementById('soiling-slider').value = safeState.soilingFactor; window.updateSoiling(safeState.soilingFactor); }
      if (safeState.tariff !== undefined) document.getElementById('tariff-input').value = safeState.tariff;
      if (safeState.exportTariff !== undefined && document.getElementById('export-tariff-input')) document.getElementById('export-tariff-input').value = safeState.exportTariff;
      if (safeState.tariffRegime !== undefined && document.getElementById('tariff-regime')) document.getElementById('tariff-regime').value = safeState.tariffRegime;
      if (safeState.exportSettlementMode !== undefined && document.getElementById('export-settlement-mode')) document.getElementById('export-settlement-mode').value = safeState.exportSettlementMode;
      if (safeState.skttTariff !== undefined && document.getElementById('sktt-tariff-input')) document.getElementById('sktt-tariff-input').value = safeState.skttTariff;
      if (safeState.contractedTariff !== undefined && document.getElementById('contracted-tariff-input')) document.getElementById('contracted-tariff-input').value = safeState.contractedTariff;
      if (safeState.contractedPowerKw !== undefined && document.getElementById('contracted-power-input')) document.getElementById('contracted-power-input').value = safeState.contractedPowerKw;
      if (safeState.previousYearConsumptionKwh !== undefined && document.getElementById('previous-year-consumption-input')) document.getElementById('previous-year-consumption-input').value = safeState.previousYearConsumptionKwh;
      if (safeState.currentYearConsumptionKwh !== undefined && document.getElementById('current-year-consumption-input')) document.getElementById('current-year-consumption-input').value = safeState.currentYearConsumptionKwh;
      if (safeState.sellableExportCapKwh !== undefined && document.getElementById('sellable-export-cap-input')) document.getElementById('sellable-export-cap-input').value = safeState.sellableExportCapKwh;
      if (safeState.usdToTry !== undefined && document.getElementById('usd-try-input')) document.getElementById('usd-try-input').value = safeState.usdToTry;
      if (safeState.displayCurrency && document.getElementById('display-currency')) document.getElementById('display-currency').value = safeState.displayCurrency;
      if (safeState.annualPriceIncrease !== undefined && document.getElementById('price-increase-input')) document.getElementById('price-increase-input').value = (safeState.annualPriceIncrease * 100).toFixed(0);
      if (safeState.discountRate !== undefined && document.getElementById('discount-rate-input')) document.getElementById('discount-rate-input').value = (safeState.discountRate * 100).toFixed(0);
      if (safeState.expenseEscalationRate !== undefined && document.getElementById('expense-escalation-input')) document.getElementById('expense-escalation-input').value = (safeState.expenseEscalationRate * 100).toFixed(0);
      if (document.getElementById('quote-bill-verified')) document.getElementById('quote-bill-verified').checked = !!safeState.hasSignedCustomerBillData;
      if (document.getElementById('quote-inputs-verified')) document.getElementById('quote-inputs-verified').checked = !!safeState.quoteInputsVerified;
      if (document.getElementById('quote-ready-approved')) document.getElementById('quote-ready-approved').checked = !!safeState.quoteReadyApproved;
      if (safeState.tariffType && document.getElementById('tariff-type')) document.getElementById('tariff-type').value = safeState.tariffType;
      if (window.map && state.lat && state.lon) window.map.setView([state.lat, state.lon], 9);
      if (window.marker && state.lat && state.lon) window.marker.setLatLng([state.lat, state.lon]);
      if (state.cityName) {
        document.getElementById('selected-loc-text').textContent =
          `${state.cityName} — ${parseFloat(state.lat).toFixed(4)}°K, ${parseFloat(state.lon).toFixed(4)}°D (GHI: ${state.ghi})`;
      }
      window.buildPanelCards();
      window.buildInverterCards();
      window.showToast(i18n.t('export.sharedLoaded'), 'info');
      return;
    }
    if (params.lat) {
      const legacy = sanitizeSharedState({ lat: params.lat, lon: params.lon, cityName: params.city, ghi: params.ghi });
      state.lat = legacy.lat; state.lon = legacy.lon;
      state.cityName = legacy.cityName; state.ghi = legacy.ghi;
      if (legacy.cityName) document.getElementById('city-search').value = legacy.cityName;
      document.getElementById('selected-loc-text').textContent =
        `${legacy.cityName} — ${parseFloat(legacy.lat).toFixed(4)}°K`;
      if (window.map) window.map.setView([legacy.lat, legacy.lon], 9);
      if (window.marker) window.marker.setLatLng([legacy.lat, legacy.lon]);
    }
    const legacy = sanitizeSharedState({ roofArea: params.area, tilt: params.tilt, shadingFactor: params.sh, panelType: params.pt });
    if (legacy.roofArea) { state.roofArea = legacy.roofArea; document.getElementById('roof-area').value = legacy.roofArea; }
    if (legacy.tilt !== undefined) { state.tilt = legacy.tilt; document.getElementById('tilt-slider').value = legacy.tilt; window.updateTilt(legacy.tilt); }
    if (params.az !== undefined) {
      const dir = COMPASS_DIRS.find(d => d.azimuth === params.az);
      if (dir) window.selectDirection(dir);
    }
    if (legacy.shadingFactor !== undefined) { state.shadingFactor = legacy.shadingFactor; document.getElementById('shading-slider').value = legacy.shadingFactor; window.updateShading(legacy.shadingFactor); }
    if (legacy.panelType) { state.panelType = legacy.panelType; window.buildPanelCards(); }
    window.showToast(i18n.t('export.sharedLegacyLoaded'), 'info');
  } catch (e) {
    // Geçersiz hash'i URL'den temizle → sayfa yenilense bile hata tekrarlanmaz
    try {
      if (typeof history !== 'undefined' && history.replaceState) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch { /* replaceState desteklenmiyor */ }

    // Kısa/rastgele fragment'lar için sessiz geç; uzun hash paylaşım girişimidir
    if (hash.length > 20) {
      window.showToast?.(i18n.t('export.sharedInvalid'), 'error');
    }
  }
}

export function exportProposalHandoff() {
  const state = window.state;
  if (!state?.results) {
    window.showToast?.(i18n.t('export.calculateFirst'), 'error');
    return;
  }
  const payload = buildStructuredProposalExport(state, state.results);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `solar-rota-proposal-handoff-${(state.cityName || 'site').toString().replace(/[^a-z0-9_-]+/gi, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  window.showToast?.(i18n.t('export.proposalDownloaded'), 'success');
}

export function exportCrmLead() {
  const state = window.state;
  if (!state?.results) {
    window.showToast?.(i18n.t('export.calculateFirst'), 'error');
    return;
  }
  const payload = buildCrmLeadExport(state, state.results);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `solar-rota-crm-lead-${(state.cityName || 'site').toString().replace(/[^a-z0-9_-]+/gi, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  window.showToast?.(i18n.t('export.crmDownloaded'), 'success');
}

// window'a expose et
window.renderResults = renderResults;
window.renderMonthlyChart = renderMonthlyChart;

// Döviz kuru güncellendiğinde sonuçlar render'a hazırsa yeniden çiz.
// (exchange-rate.js artık doğrudan window.renderResults referansına dokunmuyor.)
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('exchange-rate-refreshed', () => {
    if (window.state?.results) renderResults();
  });
}
window.downloadPDF = downloadPDF;
window.downloadTechnicalPDF = downloadTechnicalPDF;
window.shareResults = shareResults;
window.exportProposalHandoff = exportProposalHandoff;
window.exportCrmLead = exportCrmLead;
window.loadFromHash = loadFromHash;
