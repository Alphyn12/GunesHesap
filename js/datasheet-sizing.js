// ═══════════════════════════════════════════════════════════
// DATASHEET & İNVERTER BOYUTLANDIRMA — Adım 4
// Panel datasheet'inden ekstrem sıcaklık düzeltmesi (-10/+25/+60 °C)
// + invertör için math.floor güvenli max seri panel sayısı
// + en sıcak senaryoda gerçekçi tepe güç.
//
// Backend: POST /api/panel/thermal-check (panel_thermal_engine.py).
// ═══════════════════════════════════════════════════════════
import { INVERTER_TYPES, PANEL_TYPES, normalizePanelTypeKey } from './data.js';
import { getPanelCatalogById } from './panel-catalog.js';
import { callPanelThermalCheck } from './pvlib-bridge.js';

const FALLBACK_PANEL = {
  vocStcV: 49.5,
  vmpStcV: 41.8,
  vocCoeffPctPerC: -0.27,
  modeledWattPeak: 435,
  modeledTempCoeffPerC: -0.0034
};

const FALLBACK_INVERTER = {
  maxInputDcV: 600,
  mpptOptimalV: 360
};

const PANEL_TYPE_ELECTRICAL_DEFAULTS = {
  mono_perc: { vocStcV: 49.5, vmpStcV: 41.8, vocCoeffPctPerC: -0.27 },
  n_type_topcon: { vocStcV: 51.5, vmpStcV: 42.4, vocCoeffPctPerC: -0.25 },
  bifacial_topcon: { vocStcV: 51.4, vmpStcV: 42.4, vocCoeffPctPerC: -0.24 },
  hjt: { vocStcV: 47.7, vmpStcV: 39.4, vocCoeffPctPerC: -0.24 }
};

function t(key, fallback) {
  if (typeof window === 'undefined' || typeof window.t !== 'function') return fallback;
  const value = window.t(key);
  return (typeof value === 'string' && value && value !== key) ? value : fallback;
}

function fmtV(v) {
  return Number.isFinite(v) ? `${Number(v).toFixed(1)} V` : '—';
}

function fmtW(w) {
  return Number.isFinite(w) ? `${Number(w).toFixed(0)} W` : '—';
}

function fmtKw(k) {
  return Number.isFinite(k) ? `${Number(k).toFixed(2)} kW` : '—';
}

function fmtPct(p) {
  return Number.isFinite(p) ? `${Number(p).toFixed(2)} %/°C` : '—';
}

function roundNumber(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  return Number(n.toFixed(digits));
}

function formatInputNumber(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (digits <= 0) return n.toFixed(0);
  return n.toFixed(digits).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

export function getPanelDatasheetDefaults() {
  const state = window.state || {};
  const useCatalog = state.panelSelectionMode === 'advanced' && state.panelCatalogId;
  const fromCatalog = useCatalog ? getPanelCatalogById(state.panelCatalogId) : null;
  const typeKey = normalizePanelTypeKey(state.panelType);
  const typeProfile = PANEL_TYPES[typeKey] || PANEL_TYPES.mono_perc || {};
  const typeElectrical = PANEL_TYPE_ELECTRICAL_DEFAULTS[typeKey] || FALLBACK_PANEL;
  const fallback = fromCatalog || {
    ...FALLBACK_PANEL,
    ...typeElectrical,
    modeledWattPeak: Number(typeProfile.wattPeak) || FALLBACK_PANEL.modeledWattPeak,
    modeledTempCoeffPerC: Number(typeProfile.tempCoeff) || FALLBACK_PANEL.modeledTempCoeffPerC,
    displayName: `${typeProfile.name || 'Panel tipi'} ortalama profil`
  };
  return {
    vocStcV: Number.isFinite(fallback.vocStcV) ? fallback.vocStcV : FALLBACK_PANEL.vocStcV,
    vmpStcV: Number.isFinite(fallback.vmpStcV) ? fallback.vmpStcV : FALLBACK_PANEL.vmpStcV,
    vocCoeffPctPerC: Number.isFinite(fallback.vocCoeffPctPerC) ? fallback.vocCoeffPctPerC : FALLBACK_PANEL.vocCoeffPctPerC,
    pmaxStcW: Number.isFinite(fallback.modeledWattPeak) ? fallback.modeledWattPeak : FALLBACK_PANEL.modeledWattPeak,
    // modeledTempCoeffPerC oran cinsinden (-0.0034) → backend %/°C bekliyor (-0.34)
    pmaxCoeffPctPerC: Number.isFinite(fallback.modeledTempCoeffPerC)
      ? roundNumber(fallback.modeledTempCoeffPerC * 100)
      : roundNumber(FALLBACK_PANEL.modeledTempCoeffPerC * 100),
    sourceLabel: fallback.displayName || fallback.brand || ''
  };
}

export function getInverterDatasheetDefaults() {
  const state = window.state || {};
  const key = state.inverterType || 'string';
  const inv = INVERTER_TYPES[key] || INVERTER_TYPES.string || FALLBACK_INVERTER;
  return {
    inverterMaxInputV: Number.isFinite(inv.maxInputDcV) ? inv.maxInputDcV : FALLBACK_INVERTER.maxInputDcV,
    inverterMpptOptimalV: Number.isFinite(inv.mpptOptimalV) ? inv.mpptOptimalV : FALLBACK_INVERTER.mpptOptimalV,
    inverterLabel: inv.name || ''
  };
}

export function buildThermalRequest(override = null) {
  const panel = getPanelDatasheetDefaults();
  const inverter = getInverterDatasheetDefaults();
  const merged = {
    vocStcV: panel.vocStcV,
    vocCoeffPctPerC: panel.vocCoeffPctPerC,
    vmpStcV: panel.vmpStcV,
    pmaxStcW: panel.pmaxStcW,
    pmaxCoeffPctPerC: panel.pmaxCoeffPctPerC,
    inverterMaxInputV: inverter.inverterMaxInputV,
    inverterMpptOptimalV: inverter.inverterMpptOptimalV
  };
  if (override && typeof override === 'object') {
    Object.keys(merged).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(override, key)) {
        const num = Number(override[key]);
        if (Number.isFinite(num)) merged[key] = num;
      }
    });
  }
  return { request: merged, panelLabel: panel.sourceLabel, inverterLabel: inverter.inverterLabel };
}

function validateThermalRequest(request) {
  const checks = [
    ['vocStcV', 'Voc STC'],
    ['vmpStcV', 'Vmp STC'],
    ['pmaxStcW', 'Pmax STC'],
    ['inverterMaxInputV', 'İnverter max DC giriş'],
    ['inverterMpptOptimalV', 'İnverter MPPT optimal']
  ];
  checks.forEach(([key, label]) => {
    const value = Number(request[key]);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} pozitif olmalıdır.`);
  });
  if (Number(request.inverterMpptOptimalV) > Number(request.inverterMaxInputV)) {
    throw new Error('İnverter MPPT optimal gerilimi max DC giriş geriliminden büyük olamaz.');
  }
}

function temperatureCorrected(stcValue, coeffPctPerC, targetTempC) {
  const deltaT = targetTempC - 25;
  return stcValue * (1 + (coeffPctPerC / 100) * deltaT);
}

function localThermalScenario(request, targetTempC) {
  const vmpCoeff = Number.isFinite(Number(request.vmpCoeffPctPerC))
    ? Number(request.vmpCoeffPctPerC)
    : Number(request.vocCoeffPctPerC);
  return {
    ambientTempC: roundNumber(targetTempC, 2),
    deltaTC: roundNumber(targetTempC - 25, 2),
    vocV: roundNumber(temperatureCorrected(Number(request.vocStcV), Number(request.vocCoeffPctPerC), targetTempC), 3),
    vmpV: roundNumber(temperatureCorrected(Number(request.vmpStcV), vmpCoeff, targetTempC), 3),
    pmaxW: roundNumber(temperatureCorrected(Number(request.pmaxStcW), Number(request.pmaxCoeffPctPerC), targetTempC), 3),
    vocCoeffUsedPctPerC: Number(request.vocCoeffPctPerC),
    vmpCoeffUsedPctPerC: vmpCoeff,
    pmaxCoeffUsedPctPerC: Number(request.pmaxCoeffPctPerC)
  };
}

export function calculatePanelThermalSizingLocal(request) {
  validateThermalRequest(request);
  const scenarios = [-10, 25, 60].map(temp => localThermalScenario(request, temp));
  const coldest = scenarios.reduce((min, item) => item.ambientTempC < min.ambientTempC ? item : min, scenarios[0]);
  const hottest = scenarios.reduce((max, item) => item.ambientTempC > max.ambientTempC ? item : max, scenarios[0]);
  const coldestVoc = Number(coldest.vocV);
  const safeMaxSeriesPanels = Math.floor(Number(request.inverterMaxInputV) / coldestVoc);
  const realisticPeakPowerW = safeMaxSeriesPanels * Number(hottest.pmaxW);
  const stringVmpCold = safeMaxSeriesPanels * Number(coldest.vmpV);
  const stringVmpHot = safeMaxSeriesPanels * Number(hottest.vmpV);
  return {
    inputs: {
      ...request,
      vmpCoeffPctPerC: Number(request.vocCoeffPctPerC),
      vmpCoeffSource: 'fallback-voc-coeff',
      temperaturesC: [-10, 25, 60],
      referenceTempC: 25
    },
    scenarios,
    coldestScenario: coldest,
    hottestScenario: hottest,
    stringSizing: {
      rawMaxSeriesPanels: roundNumber(Number(request.inverterMaxInputV) / coldestVoc, 4),
      safeMaxSeriesPanels,
      roundingRule: 'math.floor',
      limitingScenario: {
        ambientTempC: coldest.ambientTempC,
        vocV: coldestVoc,
        inverterMaxInputV: Number(request.inverterMaxInputV)
      },
      stringVmpAtColdestV: roundNumber(stringVmpCold, 3),
      stringVmpAtHottestV: roundNumber(stringVmpHot, 3),
      mpptOptimalDeltaColdV: roundNumber(stringVmpCold - Number(request.inverterMpptOptimalV), 3),
      mpptOptimalDeltaHotV: roundNumber(stringVmpHot - Number(request.inverterMpptOptimalV), 3)
    },
    realisticPeakPower: {
      panelCount: safeMaxSeriesPanels,
      perPanelWattAtHottestC: hottest.pmaxW,
      totalWatt: roundNumber(realisticPeakPowerW, 2),
      totalKw: roundNumber(realisticPeakPowerW / 1000, 4),
      method: 'safe_max_series_panels * P_max(hottestScenarioC)'
    }
  };
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function findScenario(scenarios, tempC) {
  if (!Array.isArray(scenarios)) return null;
  return scenarios.find(s => Math.round(Number(s.ambientTempC)) === tempC) || null;
}

export function renderDatasheetSizingCard(result, meta = {}) {
  const card = document.getElementById('datasheet-sizing-card');
  if (!card) return;

  if (!result) {
    setText('datasheet-sizing-cold-voc', '—');
    setText('datasheet-sizing-hot-pmax', '—');
    setText('datasheet-sizing-safe-strings', '—');
    setText('datasheet-sizing-peak-power', '—');
    return;
  }

  const cold = findScenario(result.scenarios, -10) || result.coldestScenario || {};
  const stc = findScenario(result.scenarios, 25) || {};
  const hot = findScenario(result.scenarios, 60) || result.hottestScenario || {};
  const sizing = result.stringSizing || {};
  const peak = result.realisticPeakPower || {};

  setText('datasheet-sizing-cold-voc', fmtV(cold.vocV));
  setText('datasheet-sizing-hot-pmax', fmtW(hot.pmaxW));
  setText('datasheet-sizing-safe-strings', `${Number(sizing.safeMaxSeriesPanels ?? 0)} ${t('step4.datasheetSizing.panelsSuffix', 'panel')}`);
  setText('datasheet-sizing-peak-power', fmtKw(peak.totalKw));

  const tableBody = document.getElementById('datasheet-sizing-scenario-tbody');
  if (tableBody) {
    const rows = [
      { temp: cold, label: '−10 °C' },
      { temp: stc, label: '+25 °C (STC)' },
      { temp: hot, label: '+60 °C' }
    ];
    tableBody.innerHTML = rows.map(({ temp, label }) => `
      <tr>
        <td>${label}</td>
        <td>${fmtV(temp.vocV)}</td>
        <td>${fmtV(temp.vmpV)}</td>
        <td>${fmtW(temp.pmaxW)}</td>
      </tr>
    `).join('');
  }

  const note = document.getElementById('datasheet-sizing-note');
  if (note) {
    const lines = [];
    if (meta.source === 'local') {
      lines.push(t('step4.datasheetSizing.localFallbackNote',
        'Tarayıcı ön kontrolü aktif: backend kapalı olsa bile aynı sıcaklık katsayısı formülüyle hesaplandı.'));
    } else if (meta.source === 'backend') {
      lines.push(t('step4.datasheetSizing.backendNote', 'Python backend doğrulaması tamamlandı.'));
    }
    const limiting = sizing.limitingScenario || cold;
    if (Number.isFinite(limiting.vocV) && Number.isFinite(meta.inverterMaxInputV)) {
      lines.push(t('step4.datasheetSizing.limitingNote',
        `Güvenlik kuralı: ${meta.inverterMaxInputV} V inverter sınırı, en soğuk senaryodaki ${fmtV(limiting.vocV)} panel Voc değerine bölünür ve güvenli tarafta kalmak için aşağı yuvarlanır.`));
    }
    if (meta.panelLabel || meta.inverterLabel) {
      const panelPart = meta.panelLabel ? `${meta.panelLabel}` : '';
      const invPart = meta.inverterLabel ? `${meta.inverterLabel}` : '';
      const sep = panelPart && invPart ? ' + ' : '';
      lines.push(`${panelPart}${sep}${invPart}`);
    }
    if (meta.fallbackReason) {
      lines.push(`Backend notu: ${meta.fallbackReason}`);
    }
    note.textContent = lines.join(' • ');
  }

  card.dataset.thermalState = 'ready';
}

function showError(message) {
  const errEl = document.getElementById('datasheet-sizing-error');
  if (!errEl) return;
  errEl.textContent = message;
  errEl.hidden = !message;
}

function readFormOverride() {
  const form = document.getElementById('datasheet-sizing-form');
  if (!form || form.hidden) return null;
  const fields = ['vocStcV', 'vocCoeffPctPerC', 'vmpStcV', 'pmaxStcW', 'pmaxCoeffPctPerC', 'inverterMaxInputV', 'inverterMpptOptimalV'];
  const out = {};
  for (const name of fields) {
    const input = form.querySelector(`[name="${name}"]`);
    if (input && input.value !== '') {
      const num = Number(input.value);
      if (!Number.isFinite(num)) {
        return { error: t('step4.datasheetSizing.errorInvalidNumber', `Geçersiz sayı: ${name}`) };
      }
      out[name] = num;
    }
  }
  return out;
}

function fillFormWithDefaults() {
  const form = document.getElementById('datasheet-sizing-form');
  if (!form) return;
  const { request } = buildThermalRequest(null);
  Object.entries(request).forEach(([key, value]) => {
    const input = form.querySelector(`[name="${key}"]`);
    if (!input) return;
    const digits = key.includes('Coeff') ? 3 : key === 'pmaxStcW' || key.includes('inverter') ? 0 : 2;
    input.value = formatInputNumber(value, digits);
  });
}

function renderLocalThermalFallback(request, meta = {}, reason = '') {
  const result = calculatePanelThermalSizingLocal(request);
  if (window.state) window.state.datasheetSizing = result;
  renderDatasheetSizingCard(result, {
    ...meta,
    inverterMaxInputV: request.inverterMaxInputV,
    source: 'local',
    fallbackReason: reason
  });
  return result;
}

export async function runDatasheetSizing(options = {}) {
  const card = document.getElementById('datasheet-sizing-card');
  if (!card) return;

  let override = options.override || null;
  if (override === 'fromForm') {
    const parsed = readFormOverride();
    if (parsed && parsed.error) { showError(parsed.error); return; }
    override = parsed;
  }

  showError('');
  const { request, panelLabel, inverterLabel } = buildThermalRequest(override);
  const renderMeta = { panelLabel, inverterLabel };
  let localResult;
  try {
    localResult = renderLocalThermalFallback(request, renderMeta);
  } catch (localErr) {
    showError(localErr?.message || t('step4.datasheetSizing.errorIncompatible', 'Datasheet doğrulaması reddedildi.'));
    card.dataset.thermalState = 'error';
    return;
  }

  let result;
  try {
    const resp = await callPanelThermalCheck(request);
    if (!resp.ok) {
      renderDatasheetSizingCard(localResult, {
        ...renderMeta,
        inverterMaxInputV: request.inverterMaxInputV,
        source: 'local',
        fallbackReason: resp.error || 'Backend doğrulaması tamamlanamadı.'
      });
      return;
    }
    result = resp.data;
  } catch (err) {
    renderDatasheetSizingCard(localResult, {
      ...renderMeta,
      inverterMaxInputV: request.inverterMaxInputV,
      source: 'local',
      fallbackReason: err?.message || 'Backend çevrimdışı.'
    });
    return;
  }

  if (window.state) window.state.datasheetSizing = result;
  renderDatasheetSizingCard(result, {
    inverterMaxInputV: request.inverterMaxInputV,
    panelLabel,
    inverterLabel,
    source: 'backend'
  });
}

export function attachDatasheetSizingHandlers() {
  const toggle = document.getElementById('datasheet-sizing-edit-toggle');
  const form = document.getElementById('datasheet-sizing-form');
  const reset = document.getElementById('datasheet-sizing-reset');

  if (toggle && form && !toggle.dataset.bound) {
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', () => {
      const willOpen = form.hidden;
      if (willOpen) fillFormWithDefaults();
      form.hidden = !willOpen;
      toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      toggle.textContent = willOpen ? t('common.close', 'Kapat') : t('step4.datasheetSizing.edit', 'Düzenle');
    });
  }

  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', event => {
      event.preventDefault();
      runDatasheetSizing({ override: 'fromForm' });
    });
  }

  if (reset && !reset.dataset.bound) {
    reset.dataset.bound = '1';
    reset.addEventListener('click', () => {
      fillFormWithDefaults();
      showError('');
      runDatasheetSizing();
    });
  }
}

if (typeof window !== 'undefined') {
  window.runDatasheetSizing = runDatasheetSizing;
  window.attachDatasheetSizingHandlers = attachDatasheetSizingHandlers;
}
