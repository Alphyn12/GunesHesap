// ═══════════════════════════════════════════════════════════
// ENG REPORT — Engineering calculation report
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════
import { i18n } from './i18n.js';
import { localeTag, localizeKnownMessage, statusLabel, tx } from './output-i18n.js';
import { escapeHtml } from './security.js';
import { calculateSystemLayout, resolvePanelSpec } from './calc-core.js';

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

export function toggleEngReport() {
  const body    = document.getElementById('eng-report-body');
  const header  = document.getElementById('eng-report-toggle');
  const chevron = document.getElementById('eng-chevron');
  const isOpen  = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  header.classList.toggle('open', !isOpen);
  chevron.classList.toggle('open', !isOpen);
  if (!isOpen && body.innerHTML.trim() === '') renderEngReport();
}

export function renderEngReport() {
  const state = window.state;
  const r = state.results;
  if (!r) return;
  const p = resolvePanelSpec(state, state.panelType);
  const layout = calculateSystemLayout(state, state.panelType);
  const body = document.getElementById('eng-report-body');
  const lcoeValue = r.lcoe != null ? Number.parseFloat(r.lcoe) : null;
  const activeLocale = localeTag();
  const fmt  = v => Math.round(v).toLocaleString(activeLocale);
  const money = v => {
    const currency = state.displayCurrency || 'TRY';
    const usdToTry = Math.max(0.0001, Number(state.usdToTry) || 38.5);
    const converted = currency === 'USD' ? (Number(v) || 0) / usdToTry : (Number(v) || 0);
    return converted.toLocaleString(currency === 'USD' ? 'en-US' : activeLocale, { maximumFractionDigits: 0 }) + ' ' + currency;
  };
  const moneyRate = (v, unit = 'kWh') => {
    const currency = state.displayCurrency || 'TRY';
    const usdToTry = Math.max(0.0001, Number(state.usdToTry) || 38.5);
    const converted = currency === 'USD' ? (Number(v) || 0) / usdToTry : (Number(v) || 0);
    return converted.toLocaleString(currency === 'USD' ? 'en-US' : activeLocale, { maximumFractionDigits: currency === 'USD' ? 3 : 2 }) + ` ${currency}/${unit}`;
  };

  const panelArea   = p.areaM2;
  const roofAreaTotal = (Number(state.roofArea) || 0) + (state.multiRoof ? (state.roofSections || []).reduce((sum, sec) => sum + (Number(sec.area) || 0), 0) : 0);
  const usableRatio = Math.max(0.1, Math.min(0.95, Number(state.usableRoofRatio) || 0.75));
  const usableArea  = layout.usableArea;
  const pvgisAzimut = state.azimuth - 180;
  const netEnergy   = r.annualEnergy;
  const authoritativeSource = r.authoritativeEngineSource || r.engineSource || {};
  const authoritativeTitle = authoritativeSource.pvlibBacked ? 'Python pvlib-backed production engine' : authoritativeSource.source || r.calculationMode || 'Browser PVGIS/JS engine';
  const fallbackReason = r.authoritativeEngineFallbackReason ? localizeKnownMessage(r.authoritativeEngineFallbackReason) : null;
  const maxRef      = r.pvgisRawEnergy || netEnergy;
  const shadingPct  = (r.shadingLoss / maxRef * 100).toFixed(1);
  const tempPct     = (r.tempLossEnergy / maxRef * 100).toFixed(1);
  const azimuthPct  = (r.azimuthLossEnergy / maxRef * 100).toFixed(1);
  const bifacialPct = (r.bifacialGainEnergy / maxRef * 100).toFixed(1);
  const soilingPct  = (r.soilingLoss / maxRef * 100).toFixed(1);
  const cb          = r.costBreakdown;
  const totalEnergy25y = r.yearlyTable.reduce((s, y) => s + y.energy, 0);
  const gov = r.proposalGovernance || {};
  const report = key => i18n.t(`report.${key}`);
  const yearUnit = i18n.t('units.year');
  const dayUnit = report('days');
  const panelUnit = report('panelCountUnit');
  const statusText = value => statusLabel(value);
  const financialRate = Number(r.financialSavingsRate || r.tariff || 0);
  const comp = r.compensationSummary || {};
  const prDisplayText = r.usedFallback ? i18n.t('onGridResult.prUnavailableShort') : `${r.pr}%`;
  const prLongText = r.usedFallback ? i18n.t('onGridResult.prUnavailableLong') : `${r.pr}%`;
  const offgridFinancialBasisText = (() => {
    switch (r.financialSavingsBasis) {
      case 'off-grid-user-alternative-energy-cost':
        return i18n.t('offgridL2.financialBasisUserAlternative');
      case 'off-grid-grid-tariff-times-2_5-proxy':
        return i18n.t('offgridL2.financialBasisGridProxy');
      default:
        return r.financialSavingsBasis || '—';
    }
  })();
  const offgridFinancialBasisWarning = r.financialSavingsBasis === 'off-grid-grid-tariff-times-2_5-proxy'
    ? i18n.t('offgridL2.financialBasisProxyWarning')
    : '';

  let html = `
  <div class="eng-report-intro">
    <section class="eng-intro-card">
      <div class="eng-intro-kicker">Uzman görünümü</div>
      <div class="eng-intro-title">Bu bölüm proje ekibi ve ileri kontrol için hazırlanır</div>
      <div class="eng-intro-copy">Aşağıda üretim hesabının dayanağı, yerleşim varsayımları, kayıp zinciri, yatırım hesapları ve uzun dönem projeksiyonlar daha ayrıntılı biçimde gösterilir. İlk görüşmede tamamını okumak gerekmez.</div>
    </section>
    <section class="eng-intro-card">
      <div class="eng-intro-kicker">Hızlı okuma</div>
      <ul class="eng-intro-list">
        <li>Önce üretim motoru ve veri kaynağına bakın.</li>
        <li>Sonra panel yerleşimi ve kayıp zincirini kontrol edin.</li>
        <li>En son maliyet ve 25 yıl projeksiyonuna geçin.</li>
      </ul>
    </section>
  </div>
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
    ${escapeHtml(i18n.t('report.authoritativeProductionEngine'))}
  </div>
  <div class="formula-card">
    <div class="formula-title">${escapeHtml(authoritativeTitle)}</div>
    <div class="formula-body">${escapeHtml(i18n.t('report.engineProvider'))}: ${escapeHtml(authoritativeSource.provider || '—')}
${escapeHtml(i18n.t('report.engineQuality'))}: ${escapeHtml(statusLabel(authoritativeSource.engineQuality || authoritativeSource.confidence || '—'))}
${escapeHtml(i18n.t('report.calculationMode'))}: ${escapeHtml(r.authoritativeEngineMode || r.calculationMode || '—')}
${escapeHtml(i18n.t('report.annualProductionUsed'))}: ${fmt(r.annualEnergy)} kWh/${escapeHtml(yearUnit)}
${fallbackReason ? `${escapeHtml(i18n.t('engine.fallbackReason'))}: ${escapeHtml(fallbackReason)}` : `${escapeHtml(i18n.t('engine.fallbackReason'))}: —`}</div>
    <div class="formula-note">${escapeHtml(i18n.t('report.sameAuthoritativeSource'))}</div>
  </div>
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
    1. ${escapeHtml(i18n.t('report.panelSystemDesign'))}
  </div>
  <div class="formula-card">
    <div class="formula-title">${escapeHtml(i18n.t('report.panelLayout'))}</div>
    <div class="formula-body">${escapeHtml(report('areaFormula'))}
= ${p.width} m × ${p.height} m = ${panelArea.toFixed(4)} m²

${escapeHtml(report('usableRoofArea'))} = ${escapeHtml(report('totalRoofArea'))} × ${usableRatio.toFixed(2)}
= ${roofAreaTotal.toFixed(1)} m² × ${usableRatio.toFixed(2)} = ${usableArea.toFixed(1)} m²

${escapeHtml(report('panelCountFormula'))}
= floor(${usableArea.toFixed(1)} ÷ ${panelArea.toFixed(4)}) = ${r.panelCount} ${escapeHtml(panelUnit)}</div>
    <div class="formula-result">✓ ${r.panelCount} ${escapeHtml(panelUnit)} ${escapeHtml(p.name)}</div>
    <div class="formula-note">${escapeHtml(report('layoutNote'))}</div>
  </div>
  <div class="formula-card">
    <div class="formula-title">${escapeHtml(i18n.t('report.installedPower'))} (DC — STC)</div>
    <div class="formula-body">P_dc = ${escapeHtml(i18n.t('report.panelCount'))} × P_peak
= ${r.panelCount} × ${p.wattPeak} Wp = ${(r.panelCount * p.wattPeak).toLocaleString(activeLocale)} Wp = ${r.systemPower.toFixed(2)} kWp</div>
    <div class="formula-result">✓ ${escapeHtml(report('installedPowerResult'))}: ${r.systemPower.toFixed(2)} kWp</div>
    <div class="formula-note">${escapeHtml(report('stcNote'))}: ${escapeHtml(p.standard)}</div>
  </div>

  <!-- 2. Inverter -->
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
    2. ${escapeHtml(i18n.t('report.inverterSelection'))}
  </div>
  <div class="formula-card">
    <div class="formula-title">${escapeHtml(report('inverterTitle'))}: ${escapeHtml(r.inverterType ? r.inverterType.charAt(0).toUpperCase() + r.inverterType.slice(1) : 'String')} — ${escapeHtml(report('inverterEfficiency'))} %${r.inverterEfficiency || '97'}</div>
    <div class="formula-body">${escapeHtml(report('inverterEfficiency'))} = %${r.inverterEfficiency || '97'}
E_AC = E_DC × η_inv = ${fmt(r.annualEnergy / (r.inverterEfficiency/100 || 0.97) * (r.inverterEfficiency/100 || 0.97))} kWh × ${r.inverterEfficiency || '97'}% = ${fmt(r.annualEnergy)} kWh/${escapeHtml(yearUnit)}</div>
    <div class="formula-note">${escapeHtml(report('inverterNote'))}</div>
  </div>

  <!-- 3. PVGIS -->
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
    3. ${authoritativeSource.pvlibBacked ? 'pvlib Model Chain' : escapeHtml(i18n.t('report.productionInput'))}
  </div>
  <div class="formula-card">
    <div class="formula-title">${authoritativeSource.pvlibBacked ? 'pvlib solar position / POA / temperature / PVWatts MVP' : 'PVGIS API v5.2 — JRC / EC'}</div>
    <div class="formula-body">${escapeHtml(authoritativeSource.pvlibBacked ? report('backendEngine') : report('pvgisEndpoint'))}
lat=${state.lat?.toFixed(4)}  lon=${state.lon?.toFixed(4)}
peakpower=${r.systemPower.toFixed(2)} kWp   loss=${r.pvgisLossParam ?? 0}%
angle=${state.tilt}°   aspect=${pvgisAzimut}°  (${escapeHtml(report('aspectNote'))})

${authoritativeSource.pvlibBacked ? 'pvlib DC/POA reference' : escapeHtml(report('pvgisGrossProduction'))}: ${fmt(r.pvgisRawEnergy)} kWh/${escapeHtml(yearUnit)}
GHI: ${state.ghi} kWh/m²/${escapeHtml(yearUnit)}${r.usedFallback ? `\n⚠ ${escapeHtml(report('pvgisFallbackUsed'))}` : ''}</div>
    <div class="formula-note">${escapeHtml(authoritativeSource.pvlibBacked ? report('pvlibNote') : tx('report.pvgisNote', { loss: r.pvgisLossParam ?? 0, version: r.methodologyVersion || '—' }))}</div>
  </div>

  <!-- 4. Loss Waterfall -->
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    4. ${escapeHtml(i18n.t('report.lossWaterfall'))}
  </div>
  <div class="formula-card">
    <div class="formula-title">${escapeHtml(report('lossEquationTitle'))}: E_net = E_gross × (1−shading) × (1−soiling) × k_bifacial × η_inv${r.usedFallback ? ' × (1+α×ΔT) × k_azimuth' : ''}</div>
    <div class="loss-waterfall">
      <div class="loss-row">
        <div class="loss-label">${escapeHtml(report('pvgisGrossProduction'))}${r.usedFallback ? ' (Fallback)' : ''}</div>
        <div class="loss-bar-wrap"><div class="loss-bar-fill neutral loss-bar-fill-100"></div></div>
        <div class="loss-val neutral">${fmt(r.pvgisRawEnergy)} kWh</div>
      </div>
      <div class="loss-row">
    <div class="loss-label">− ${escapeHtml(report('shadingLoss'))} (%${r.effectiveShadingFactor ?? state.shadingFactor})</div>
        <div class="loss-bar-wrap"><div class="loss-bar-fill negative loss-bar-fill-dyn" data-bar-w="${shadingPct}"></div></div>
        <div class="loss-val negative">−${fmt(r.shadingLoss)} kWh</div>
      </div>
      <div class="loss-row">
        <div class="loss-label">− ${escapeHtml(report('soilingLoss'))} (%${state.soilingFactor})</div>
        <div class="loss-bar-wrap"><div class="loss-bar-fill negative loss-bar-fill-dyn" data-bar-w="${soilingPct}"></div></div>
        <div class="loss-val negative">−${fmt(r.soilingLoss)} kWh</div>
      </div>
      ${r.usedFallback ? `<div class="loss-row">
        <div class="loss-label">− ${escapeHtml(report('temperatureLoss'))} (${r.avgSummerTemp}°C, α=${(p.tempCoeff*100).toFixed(3)}%/°C)</div>
        <div class="loss-bar-wrap"><div class="loss-bar-fill negative loss-bar-fill-dyn" data-bar-w="${tempPct}"></div></div>
        <div class="loss-val negative">−${fmt(r.tempLossEnergy)} kWh</div>
      </div>
      <div class="loss-row">
        <div class="loss-label">− ${escapeHtml(report('azimuthLoss'))} (${escapeHtml(state.azimuthName)}, k=${state.azimuthCoeff.toFixed(2)})</div>
        <div class="loss-bar-wrap"><div class="loss-bar-fill negative loss-bar-fill-dyn" data-bar-w="${azimuthPct}"></div></div>
        <div class="loss-val negative">−${fmt(r.azimuthLossEnergy)} kWh</div>
      </div>` : `<div class="loss-row opacity-60">
        <div class="loss-label">✔ ${escapeHtml(report('pvgisIncludesTempAzimuth'))}</div>
        <div class="loss-bar-wrap"></div>
        <div class="loss-val text-muted">—</div>
      </div>`}
      ${r.bifacialGainEnergy > 0 ? `
      <div class="loss-row">
        <div class="loss-label">+ ${escapeHtml(report('bifacialGain'))} (+${(p.bifacialGain*100).toFixed(0)}% ${escapeHtml(report('rearSide'))})</div>
        <div class="loss-bar-wrap"><div class="loss-bar-fill positive loss-bar-fill-dyn" data-bar-w="${bifacialPct}"></div></div>
        <div class="loss-val positive">+${fmt(r.bifacialGainEnergy)} kWh</div>
      </div>` : ''}
      <div class="loss-row loss-row-net">
        <div class="loss-label text-strong-default">= ${escapeHtml(report('netAnnualProduction'))}</div>
        <div class="loss-bar-wrap"><div class="loss-bar-fill positive loss-bar-fill-dyn" data-bar-w="${Math.min(netEnergy/maxRef*100,100).toFixed(1)}"></div></div>
        <div class="loss-val positive">${fmt(netEnergy)} kWh</div>
      </div>
    </div>
  </div>

  <!-- 5. Performance -->
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
    5. ${escapeHtml(i18n.t('report.performanceMetrics'))}
  </div>
  <div class="perf-badges">
    <div class="perf-badge"><div class="perf-badge-val">${escapeHtml(prDisplayText)}</div><div class="perf-badge-label">${escapeHtml(report('performanceRatio'))} (PR)</div></div>
    <div class="perf-badge"><div class="perf-badge-val">${r.psh}</div><div class="perf-badge-label">${escapeHtml(report('psh'))} (${escapeHtml(report('hoursPerDay'))})</div></div>
    <div class="perf-badge"><div class="perf-badge-val">${r.ysp}</div><div class="perf-badge-label">${escapeHtml(i18n.t('report.specificYield'))} (kWh/kWp)</div></div>
    <div class="perf-badge"><div class="perf-badge-val">${r.cf}%</div><div class="perf-badge-label">${escapeHtml(report('capacityFactor'))} (CF)</div></div>
    <div class="perf-badge"><div class="perf-badge-val">${r.irr}%</div><div class="perf-badge-label">IRR</div></div>
    <div class="perf-badge"><div class="perf-badge-val">${Number.isFinite(lcoeValue) ? lcoeValue.toFixed(2) : '—'}</div><div class="perf-badge-label">LCOE (TL/kWh)</div></div>
  </div>
  <div class="formula-card">
    <div class="formula-title">PR — ${escapeHtml(report('performanceRatio'))} (IEC 61724)</div>
    <div class="formula-body">PR = E_net ÷ (P_stc × POA)
= ${fmt(netEnergy)} kWh ÷ (${r.systemPower.toFixed(2)} kWp × ${r.pvgisPoa || state.ghi || 'N/A'} kWh/m²) = ${escapeHtml(prLongText)}

P_stc: kWp, POA: kWh/m²/${escapeHtml(yearUnit)} → ${escapeHtml(report('dimensionlessResult'))}</div>
    <div class="formula-note">${escapeHtml(report('prFormulaNote'))}</div>
  </div>
  <div class="formula-card">
    <div class="formula-title">LCOE — ${escapeHtml(report('lcoeTitle'))}</div>
    <div class="formula-body">LCOE = Σ(Cost_t/(1+d)ᵗ) ÷ Σ(E_t/(1+d)ᵗ)

${escapeHtml(i18n.t('report.totalCost'))} (${escapeHtml(report('year'))} 0): ${money(r.totalCost)}
${escapeHtml(i18n.t('onGridResult.financialBasis'))}: ${money(r.financialCostBasis || r.totalCost)}
${escapeHtml(report('totalLifetimeExpenses'))}: ${money(r.totalExpenses25y)}
${escapeHtml(report('discountRate'))}: %${(r.discountRate*100).toFixed(0)}

LCOE = ${r.compensatedLcoe != null ? moneyRate(r.compensatedLcoe, 'kWh') + ' (ekonomik)' : r.lcoe != null ? moneyRate(r.lcoe, 'kWh') : '—'}</div>
    <div class="formula-note">${escapeHtml(report('userTariff'))}: ${moneyRate(r.tariff, 'kWh')} (${escapeHtml(state.tariffType)}). ${escapeHtml(report('lcoeNote'))} ${escapeHtml(i18n.t('onGridResult.lcoeLabel'))}.${r.compensatedLcoe ? ` Tüm üretim bazlı LCOE: ${moneyRate(r.lcoe, 'kWh')}` : ''}</div>
  </div>
  <div class="formula-card">
    <div class="formula-title">IRR — ${escapeHtml(report('irrTitle'))} (${escapeHtml(report('rootSearch'))})</div>
    <div class="formula-body">NPV(r) = −C₀ + Σₜ [NCFₜ ÷ (1+r)ᵗ] = 0
C₀ = ${money(r.financialCostBasis || r.totalCost)}   (${escapeHtml(report('initialInvestment'))})
NCFₜ = ${escapeHtml(report('savingsMinusExpenses'))}
Eₜ = E₁ × (1−LID) × (1−δ)ⁿ⁻¹   LID=${r.lidFactor}%, δ=${(p.degradation*100).toFixed(2)}%/${escapeHtml(yearUnit)}
Pₜ = P₀ × (1+g)ᵗ⁻¹   g=${(r.annualPriceIncrease*100).toFixed(0)}%/${escapeHtml(yearUnit)}
IRR = ${r.irr === 'N/A' ? escapeHtml(report('unableToCalculate')) : r.irr + '%'}</div>
    <div class="formula-note">${escapeHtml(report('irrNote'))} (${escapeHtml(report('discountRate'))}: %${(r.discountRate*100).toFixed(0)}).</div>
  </div>

  <!-- 6. Maliyet -->
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
    6. 2026 ${escapeHtml(i18n.t('report.costBreakdown'))}
  </div>
  <div class="formula-card">
    <div class="formula-title">${escapeHtml(i18n.t('report.costAnalysis'))} — ${escapeHtml(report('marketScope'))}</div>
    <table class="cost-breakdown-table">
      <thead><tr><th>${escapeHtml(i18n.t('report.tableItem'))}</th><th>${escapeHtml(i18n.t('report.unitPrice'))}</th><th>${escapeHtml(i18n.t('report.quantity'))}</th><th>${escapeHtml(i18n.t('report.amount'))}</th></tr></thead>
      <tbody>
        <tr><td>Panel (${p.name})</td><td>${moneyRate(p.pricePerWatt, 'Wp')}</td><td>${fmt(r.systemPower * 1000)} Wp</td><td>${money(cb.panel)}</td></tr>
        <tr><td>${escapeHtml(report('inverterTitle'))} (${escapeHtml(r.inverterType || 'String')})</td><td>${moneyRate(cb.invUnit, 'kWp')}</td><td>${r.systemPower.toFixed(2)} kWp</td><td>${money(cb.inverter)}</td></tr>
        <tr><td>${escapeHtml(report('mountingSystem'))}</td><td>${moneyRate(2200, 'kWp')}</td><td>${r.systemPower.toFixed(2)} kWp</td><td>${money(cb.mounting)}</td></tr>
        <tr><td>DC Kablo + MC4</td><td>${moneyRate(600, 'kWp')}</td><td>${r.systemPower.toFixed(2)} kWp</td><td>${money(cb.dcCable)}</td></tr>
        <tr><td>${escapeHtml(report('acElectrical'))}</td><td>${moneyRate(900, 'kWp')}</td><td>${r.systemPower.toFixed(2)} kWp</td><td>${money(cb.acElec)}</td></tr>
        <tr><td>${escapeHtml(i18n.t('report.labor'))}</td><td>${moneyRate(1800, 'kWp')}</td><td>${r.systemPower.toFixed(2)} kWp</td><td>${money(cb.labor)}</td></tr>
        <tr><td>${escapeHtml(report('gridConnection'))}</td><td>${escapeHtml(report('fixed'))}</td><td>1</td><td>${money(cb.permits)}</td></tr>
        <tr><td colspan="3">${escapeHtml(i18n.t('report.subtotalExVat'))}</td><td>${money(cb.subtotal)}</td></tr>
        <tr><td colspan="3">${escapeHtml(i18n.t('kdv.note'))}</td><td>${money(cb.kdv)}</td></tr>
        <tr class="total-row"><td colspan="3"><strong>${escapeHtml(i18n.t('report.grandTotal'))}</strong></td><td><strong>${money(cb.total)}</strong></td></tr>
        ${r.annualOMCost > 0 ? `<tr class="tr-border-top-2"><td colspan="3">${escapeHtml(report('annualMaintenance'))} (O&M) — %${state.omRate}</td><td>${money(r.annualOMCost)}/${escapeHtml(yearUnit)}</td></tr>` : ''}
        ${r.annualInsurance > 0 ? `<tr><td colspan="3">${escapeHtml(report('annualInsurance'))} — %${state.insuranceRate}</td><td>${money(r.annualInsurance)}/${escapeHtml(yearUnit)}</td></tr>` : ''}
        ${r.inverterReplaceCost > 0 ? `<tr><td colspan="3">${escapeHtml(report('inverterReplacement'))} (${escapeHtml(report('year'))} ${r.inverterLifetime || 12})</td><td>${money(r.inverterReplaceCost)}</td></tr>` : ''}
      </tbody>
    </table>
  </div>

  <!-- 7. 25-year table -->
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    7. ${escapeHtml(i18n.t('report.yearProjectionTable'))}
  </div>
  <div class="formula-card">
    <div class="formula-title">${escapeHtml(report('annualFormulaProduction'))}</div>
    <div class="formula-body">Eₜ = E₁ × (1−LID) × (1−δ)ⁿ⁻¹    LID=${r.lidFactor}%, δ=${(p.degradation*100).toFixed(2)}%/${escapeHtml(yearUnit)}
Pₜ = P₀ × (1 + g)ᵗ⁻¹   g=${(r.annualPriceIncrease*100).toFixed(0)}%/${escapeHtml(yearUnit)}, P₀=${financialRate} TL/kWh
${escapeHtml(report(state.scenarioKey === 'off-grid' ? 'incomeFormulaOffGrid' : 'incomeFormula'))}
${escapeHtml(i18n.t('onGridResult.directSelfConsumption'))}: ${fmt(comp.directSelfConsumptionKwh || 0)} kWh; ${escapeHtml(i18n.t('onGridResult.monthlyOffset'))}: ${fmt(comp.importOffsetKwh || 0)} kWh; ${escapeHtml(i18n.t('onGridResult.paidSurplus'))}: ${fmt(comp.paidExportKwh || 0)} kWh
${escapeHtml(report('expenseFormula'))}
NCFₜ = ${escapeHtml(report('netCashFlow'))}
NPVₜ = NCFₜ ÷ (1+d)ᵗ    d=${(r.discountRate*100).toFixed(0)}%
${escapeHtml(report('totalProduction25y'))}: ${fmt(totalEnergy25y)} kWh</div>
    <div class="year-table-wrap">
      <table class="year-table">
        <thead><tr><th>${escapeHtml(report('year'))}</th><th>${escapeHtml(report('production'))} (kWh)</th><th>${escapeHtml(report('tariff'))}</th><th>${escapeHtml(report('savings'))}</th><th>${escapeHtml(report('expenses'))}</th><th>Net</th><th>${escapeHtml(report('cumulative'))}</th><th>NPV</th></tr></thead>
        <tbody>
          ${r.yearlyTable.map(y => `
          <tr ${y.year === Math.round(Number(r.grossSimplePaybackYear || r.paybackYear)) ? 'class="payback-row"' : ''}>
            <td>${y.year}${y.year === Math.round(Number(r.grossSimplePaybackYear || r.paybackYear)) ? ' ✓' : ''}</td>
            <td>${fmt(y.energy)}</td>
            <td>${y.effectiveImportRate || y.rate}</td>
            <td>${money(y.savings)}</td>
            <td class="text-danger">${y.expenses > 0 ? '-' + money(y.expenses) : '0'}</td>
            <td>${money(y.netCashFlow)}</td>
            <td>${money(y.cumulative)}</td>
            <td>${money(y.npv)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="formula-note">${escapeHtml(report('paybackRowNote'))}: O&M ${money(r.annualOMCost)} + ${escapeHtml(report('annualInsurance'))} ${money(r.annualInsurance)} = ${money(r.annualOMCost + r.annualInsurance)}/${escapeHtml(yearUnit)}. ${escapeHtml(i18n.t('onGridResult.financialBasis'))}: ${money(r.omCostBasis || r.financialCostBasis || r.totalCost)}.</div>
  </div>`;

  if (gov.confidence) {
    const evidence = r.evidenceGovernance || {};
    const tariffSource = r.tariffSourceGovernance || {};
    const evidenceFileCount = Object.values(evidence.registry || {}).reduce((sum, record) => sum + ((record.files || []).length), 0);
    html += `
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
    ${escapeHtml(i18n.t('report.proposalGovernance'))}
  </div>
  <div class="formula-card">
    <div class="formula-title">${escapeHtml(i18n.t('report.proposalTraceability'))}</div>
    <div class="formula-body">${escapeHtml(i18n.t('governance.proposalConfidence'))}: ${gov.confidence.score}/100
${escapeHtml(i18n.t('governance.confidenceLevel'))}: ${escapeHtml(statusText(gov.confidence.level))}
${escapeHtml(i18n.t('governance.approvalState'))}: ${escapeHtml(statusText(gov.approval?.state || 'draft'))}
${escapeHtml(report('approvalRecord'))}: ${gov.approval?.approvalRecord?.id || '—'}
${escapeHtml(report('gridChecklist'))}: ${gov.gridChecklistComplete ? escapeHtml(statusText('complete')) : escapeHtml(statusText('incomplete'))}
${escapeHtml(report('regulationVersion'))}: ${r.quoteReadiness?.version || r.tariffModel?.exportCompensationPolicy?.version || '—'}
${escapeHtml(report('revision'))}: ${gov.revision?.id || '—'}
${escapeHtml(report('evidenceStatus'))}: ${escapeHtml(statusText(evidence.validation?.status || '—'))}
${escapeHtml(report('evidenceFileCount'))}: ${evidenceFileCount}
${escapeHtml(report('auditLogCount'))}: ${(state.auditLog || []).length}
${escapeHtml(report('tariffSourceAge'))}: ${tariffSource.ageDays ?? '—'} ${escapeHtml(dayUnit)}${tariffSource.stale ? ' (STALE)' : ''}</div>
    <div class="formula-note">${escapeHtml(i18n.t('report.quoteReadyNote'))}</div>
  </div>`;
  }

  // ── 8. BESS ────────────────────────────────────────────────────────────────
  if (r.bessMetrics) {
    const bm = r.bessMetrics;
    const offGridMetricNote = state.scenarioKey === 'off-grid'
      ? `\n\n${escapeHtml(report('offGridMetricNote'))}`
      : '';
    html += `
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-4 0v2"/></svg>
    8. ${escapeHtml(report('bessAnalysis'))}
  </div>
  <div class="formula-card">
    <div class="formula-title">${escapeHtml(bm.modelName)} — ${escapeHtml(report('dailyEnergyBalance'))}</div>
    <div class="formula-body">${escapeHtml(report('dailyProduction'))} = ${fmt(r.annualEnergy)} ÷ 365 = ${bm.dailyProduction} kWh/day
${escapeHtml(report('dailyConsumption'))} = ${state.dailyConsumption} kWh/day
${escapeHtml(report('usableCapacity'))} = ${state.battery.capacity} kWh × ${(state.battery.dod*100).toFixed(0)}% DoD = ${bm.usableCapacity} kWh

${escapeHtml(report('gridIndependence'))} = ${bm.gridIndependence}%
${escapeHtml(report('nightCoverage'))} = ${bm.nightCoverage}%
${escapeHtml(report('batteryInstalledCost'))}: ${money(bm.batteryCost)}${offGridMetricNote}</div>
    <div class="formula-result">✓ ${escapeHtml(tx('report.batteryResult', { grid: bm.gridIndependence, night: bm.nightCoverage }))}</div>
  </div>`;
  }

  // ── 8b. Off-grid L2 dispatch source of truth ──────────────────────────────
  if (state.scenarioKey === 'off-grid' && r.offgridL2Results) {
    const L = r.offgridL2Results;
    const dispatchProfileText = L.productionDispatchProfile === 'real-hourly-pv-8760'
      ? i18n.t('offgridL2.productionDispatchReal')
      : i18n.t('offgridL2.productionDispatchSynthetic');
    const criticalCoverageWithGenerator = L.criticalCoverageWithGenerator ?? L.criticalLoadCoverage;
    const criticalCoverageWithoutGenerator = L.criticalCoverageWithoutGenerator ?? L.criticalLoadCoverageWithoutGenerator ?? L.pvBatteryCriticalCoverage;
    const pvBessCoverageText = formatOffgridCoverageValue(L.pvBatteryLoadCoverage ?? L.totalLoadCoverage, L);
    const totalCoverageText = formatOffgridCoverageValue(L.totalLoadCoverage, L);
    const pvBessCriticalCoverageText = formatOffgridCoverageValue(criticalCoverageWithoutGenerator ?? L.criticalLoadCoverage, L);
    const criticalCoverageWithGeneratorText = formatOffgridCoverageValue(criticalCoverageWithGenerator, L);
    const syntheticPeakModel = L.syntheticPeakModel || null;
    const syntheticWeatherMeta = L.productionDispatchMetadata?.syntheticWeatherMetadata || null;
    const stress = L.fieldStressAnalysis || null;
    html += `
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/><path d="M12 4v16"/><path d="M7 7l10 10"/><path d="M17 7L7 17"/></svg>
    9. ${escapeHtml(i18n.t('offgridL2.dispatchLabel'))}
  </div>
  <div class="formula-card">
    <div class="formula-title">${escapeHtml(i18n.t('offGrid.preFeasibilityOnly'))}</div>
    <div class="formula-body">${escapeHtml(i18n.t('offgridL2.productionSource'))}: ${escapeHtml(L.productionSourceLabel || L.productionSource || '—')}
${escapeHtml(dispatchProfileText)} (${escapeHtml(L.productionDispatchProfile || 'monthly-production-derived-synthetic-8760')})
${escapeHtml(i18n.t('offgridL2.loadSourceLabel'))}: ${escapeHtml(L.loadSource || L.loadMode || '—')}
${escapeHtml(i18n.t('offgridL2.dispatchLabel'))}: ${escapeHtml(L.dispatchType || 'synthetic-8760-dispatch')}
${escapeHtml(i18n.t('offgridL2.pvBessCoverageLabel'))}: ${pvBessCoverageText}
${escapeHtml(i18n.t('offgridL2.totalCoverageWithGeneratorLabel'))}: ${totalCoverageText}
${escapeHtml(i18n.t('offgridL2.pvBessCriticalCoverageLabel'))}: ${pvBessCriticalCoverageText}
${escapeHtml(i18n.t('offgridL2.criticalCoverageWithGeneratorLabel'))}: ${criticalCoverageWithGeneratorText}
${syntheticWeatherMeta ? `${escapeHtml(i18n.t('offgridL2.syntheticPvWeatherModelLabel'))}: ${escapeHtml(i18n.t('offgridL2.syntheticPvWeatherModelClustered'))}
${escapeHtml(i18n.t('offgridL2.syntheticPvLongestClusterLabel'))}: ${Math.round(Number(syntheticWeatherMeta.longestLowPvClusterDays) || 0)} ${escapeHtml(dayUnit)}
${escapeHtml(i18n.t('offgridL2.syntheticPvDailyRangeLabel'))}: %${Number(((syntheticWeatherMeta.minimumDailyFractionOfAverage || 0) * 100)).toFixed(0)} - %${Number(((syntheticWeatherMeta.maximumDailyFractionOfAverage || 0) * 100)).toFixed(0)}
` : ''}${escapeHtml(i18n.t('offgridL2.resultAutonomousDays'))}: ${L.autonomousDays ?? '—'} ${escapeHtml(dayUnit)}; ${escapeHtml(i18n.t('offgridL2.resultAutonomousDaysWithGenerator'))}: ${L.autonomousDaysWithGenerator ?? '—'} ${escapeHtml(dayUnit)}
${escapeHtml(i18n.t('offgridL2.autonomyThresholdLabel'))}: %${Number(L.autonomyThresholdPct || 1).toFixed(1)}
${escapeHtml(i18n.t('offgridL2.unmetLabel'))}: ${fmt(L.unmetLoadKwh || 0)} kWh/${escapeHtml(yearUnit)}
${escapeHtml(i18n.t('offgridL2.curtailedLabel'))}: ${fmt(L.curtailedPvKwh || 0)} kWh/${escapeHtml(yearUnit)}
${escapeHtml(i18n.t('offgridL2.generatorLabel'))}: ${fmt(L.generatorEnergyKwh || L.generatorKwh || 0)} kWh/${escapeHtml(yearUnit)}; ${escapeHtml(i18n.t('offgridL2.generatorCapex'))}: ${money(L.generatorCapex || 0)}
${escapeHtml(i18n.t('offgridL2.generatorMinLoadLabel'))}: %${Math.round(Number(L.generatorMinLoadRatePct) || 0)}; ${escapeHtml(i18n.t('offgridL2.generatorStopSocLabel'))}: %${Math.round(Number(L.generatorStartSocPct) || 0)} → %${Math.round(Number(L.generatorStopSocPct) || 0)}
${escapeHtml(i18n.t('offgridL2.generatorChargeBatteryLabel'))}: ${escapeHtml(i18n.t(L.generatorChargeBatteryEnabled ? 'yes' : 'no'))}
${escapeHtml(i18n.t('offgridL2.financialBasisLabel'))}: ${escapeHtml(offgridFinancialBasisText)}
${escapeHtml(i18n.t('offgridL2.minSocLabel'))}: ${L.minimumSoc != null ? (L.minimumSoc * 100).toFixed(1) + '%' : '—'}; ${escapeHtml(i18n.t('offgridL2.avgSocLabel'))}: ${L.averageSoc != null ? (L.averageSoc * 100).toFixed(1) + '%' : '—'}
${escapeHtml(i18n.t('offgridL2.batteryReserveLabel'))}: %${Number(L.batteryReservePct || 0).toFixed(0)}; ${escapeHtml(i18n.t('offgridL2.batteryChargeEfficiencyLabel'))}: %${Number(L.batteryChargeEfficiencyPct || 0).toFixed(1)}; ${escapeHtml(i18n.t('offgridL2.batteryDischargeEfficiencyLabel'))}: %${Number(L.batteryDischargeEfficiencyPct || 0).toFixed(1)}
${escapeHtml(i18n.t('offgridL2.inverterLimitLabel'))}: ${L.inverterAcLimitKw || '—'} kW; ${escapeHtml(i18n.t('offgridL2.batteryPowerLimitLabel'))}: ${L.batteryMaxChargeKw || '—'} / ${L.batteryMaxDischargeKw || '—'} kW
${escapeHtml(i18n.t('offgridL2.powerLimitedLabel'))}: ${fmt(L.inverterPowerLimitedKwh || 0)} kWh (${L.inverterPowerLimitHours || 0} h)
${syntheticPeakModel?.peakEnvelopeApplied ? `${escapeHtml(i18n.t('offgridL2.syntheticPeakModelLabel'))}: ${escapeHtml(i18n.t('offgridL2.syntheticPeakModelConservative'))}
${escapeHtml(i18n.t('offgridL2.syntheticPeakMaxLabel'))}: ${Number(syntheticPeakModel.maxSyntheticPeakKw || 0).toFixed(1)} kW; ${escapeHtml(i18n.t('offgridL2.syntheticPeakCriticalMaxLabel'))}: ${Number(syntheticPeakModel.maxCriticalPeakKw || 0).toFixed(1)} kW
${escapeHtml(i18n.t('offgridL2.syntheticPeakFactorLabel'))}: ×${Number(syntheticPeakModel.peakEnvelopeMaxFactor || 1).toFixed(2)}; ${escapeHtml(i18n.t('offgridL2.syntheticPeakSeverityLabel'))}: ${escapeHtml(i18n.t(`offgridL2.syntheticPeakSeverity_${syntheticPeakModel.severity || 'medium'}`))}
` : ''}${escapeHtml(i18n.t('offgridL2.lifecycleAnnual'))}: ${money(L.lifecycleCostAnnual || 0)}; ${escapeHtml(i18n.t('offgridL2.lifecycleGeneratorOverhaulLabel'))}: ${money(L.generatorOverhaulAnnual || 0)}
${escapeHtml(i18n.t('offgridL2.fieldGuaranteeStatus'))}: ${escapeHtml(i18n.t(L.fieldGuaranteeReadiness?.phase1Ready ? 'offgridL2.fieldGuaranteePhase1Ready' : 'offgridL2.fieldGuaranteeBlocked'))}
${(L.fieldGuaranteeReadiness?.blockers || []).slice(0, 3).map(item => `- ${escapeHtml(item)}`).join('\n')}
${escapeHtml(i18n.t('offgridL2.fieldEvidenceStatus'))}: ${escapeHtml(i18n.t(L.fieldEvidenceGate?.phase2Ready ? 'offgridL2.fieldEvidenceReady' : 'offgridL2.fieldEvidenceBlocked'))}
${(L.fieldEvidenceGate?.blockers || []).slice(0, 3).map(item => `- ${escapeHtml(item)}`).join('\n')}
${escapeHtml(i18n.t('offgridL2.fieldModelStatus'))}: ${escapeHtml(i18n.t(L.fieldModelMaturityGate?.phase3Ready ? 'offgridL2.fieldModelReady' : 'offgridL2.fieldModelBlocked'))}
${(L.fieldModelMaturityGate?.blockers || []).slice(0, 3).map(item => `- ${escapeHtml(item)}`).join('\n')}
${escapeHtml(i18n.t('offgridL2.fieldAcceptanceStatus'))}: ${escapeHtml(i18n.t(L.fieldAcceptanceGate?.phase4Ready ? 'offgridL2.fieldAcceptanceReady' : 'offgridL2.fieldAcceptanceBlocked'))}
${(L.fieldAcceptanceGate?.blockers || []).slice(0, 3).map(item => `- ${escapeHtml(item)}`).join('\n')}
${escapeHtml(i18n.t('offgridL2.fieldOperationStatus'))}: ${escapeHtml(i18n.t(L.fieldOperationGate?.phase5Ready ? 'offgridL2.fieldOperationReady' : 'offgridL2.fieldOperationBlocked'))}
${(L.fieldOperationGate?.blockers || []).slice(0, 3).map(item => `- ${escapeHtml(item)}`).join('\n')}
${escapeHtml(i18n.t('offgridL2.fieldRevalidationStatus'))}: ${escapeHtml(i18n.t(L.fieldRevalidationGate?.phase6Ready ? 'offgridL2.fieldRevalidationReady' : 'offgridL2.fieldRevalidationBlocked'))}
${(L.fieldRevalidationGate?.blockers || []).slice(0, 3).map(item => `- ${escapeHtml(item)}`).join('\n')}
${stress?.worstCriticalScenario ? `\n${escapeHtml(i18n.t('offgridL2.stressWorstCriticalLabel'))}: ${escapeHtml(stress.worstCriticalScenario.label || stress.worstCriticalScenario.key || '—')} — ${formatOffgridCoverageValue(stress.worstCriticalScenario.criticalLoadCoverage, L)}` : ''}
${stress?.worstTotalScenario ? `\n${escapeHtml(i18n.t('offgridL2.stressWorstTotalLabel'))}: ${escapeHtml(stress.worstTotalScenario.label || stress.worstTotalScenario.key || '—')} — ${formatOffgridCoverageValue(stress.worstTotalScenario.totalLoadCoverage, L)}` : ''}
${stress?.maxUnmetCriticalScenario ? `\n${escapeHtml(i18n.t('offgridL2.stressMaxUnmetCriticalLabel'))}: ${escapeHtml(stress.maxUnmetCriticalScenario.label || stress.maxUnmetCriticalScenario.key || '—')} — ${fmt(stress.maxUnmetCriticalScenario.unmetCriticalKwh || 0)} kWh` : ''}

${escapeHtml(i18n.t('offGrid.notFeasibilityAnalysis'))}</div>
    <div class="formula-note">${escapeHtml(i18n.t('offGrid.syntheticDispatchNote'))}${offgridFinancialBasisWarning ? ` ${escapeHtml(offgridFinancialBasisWarning)}` : ''}</div>
  </div>`;
  }

  // ── 9. Grid export / settlement ────────────────────────────────────────────
  if (r.nmMetrics && state.netMeteringEnabled) {
    const nm = r.nmMetrics;
    const sectionNum = r.bessMetrics ? 9 : 8;
    html += `
  <div class="eng-section-header">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/></svg>
    ${sectionNum}. ${escapeHtml(report('gridExportSettlement'))}
  </div>
  <div class="formula-card">
    <div class="formula-title">${escapeHtml(nm.systemType)}</div>
    <div class="formula-body">${escapeHtml(report('annualProduction'))}: ${fmt(r.annualEnergy)} kWh
${escapeHtml(report('annualConsumption'))}: ${fmt(r.hourlySummary?.annualLoad || state.dailyConsumption * 365)} kWh
${escapeHtml(report('selfConsumptionRatio'))} = ${nm.selfConsumptionPct}%
${escapeHtml(i18n.t('onGridResult.directSelfConsumption'))} = ${fmt(comp.directSelfConsumptionKwh || nm.directSelfConsumedEnergy || nm.selfConsumedEnergy || 0)} kWh
${escapeHtml(i18n.t('onGridResult.monthlyOffset'))} = ${fmt(comp.importOffsetKwh || nm.importOffsetEnergy || 0)} kWh
${escapeHtml(report('annualExport'))} = ${fmt(nm.annualGridExport)} kWh
${escapeHtml(report('paidExport'))} = ${fmt(nm.paidGridExport || 0)} kWh
${escapeHtml(report('unpaidExport'))} = ${fmt(nm.unpaidGridExport || 0)} kWh

${escapeHtml(report('settlementBasis'))}: ${escapeHtml(nm.systemType)}${r.settlementProvisional ? `\n${escapeHtml(i18n.t('onGridResult.settlementProvisional'))}` : ''}
${escapeHtml(report('exportRevenue'))} = ${money(nm.annualExportRevenue)}/${escapeHtml(yearUnit)}</div>
    <div class="formula-result">✓ ${escapeHtml(tx('report.exportRevenueResult', { value: money(nm.annualExportRevenue) }))}</div>
  </div>`;
  }

  body.innerHTML = html;
  // F1.C.7: data-bar-w attribute'larını CSS var'a aktar (CSP-safe direct property)
  if (typeof body.querySelectorAll === 'function') {
    body.querySelectorAll('[data-bar-w]').forEach(el =>
      el.style.setProperty('--bar-w', el.dataset.barW + '%'));
  }
}

// Eski Step-6 mühendislik paneli çağrılarıyla uyumluluk için tutulur.
export function renderEngCalcPanel() {
  const panel = document.getElementById('eng-calc-panel');
  if (panel) panel.innerHTML = '';
}

// window'a expose et
window.toggleEngReport = toggleEngReport;
window.renderEngReport = renderEngReport;
window.renderEngCalcPanel = renderEngCalcPanel;
