// ═══════════════════════════════════════════════════════════
// DASHBOARD — Karşılaştırmalı Dashboard (Faz E2)
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════

import { clampNumber, escapeHtml } from './security.js';

const MAX_SAVED = 20;
const STORAGE_KEY = 'guneshesap_saved';
const MAX_IMPORT_RECORDS = 50;

// Monotonic fallback ID generator — Date.now() * 1000 + counter ensures uniqueness
// across rapid sanitization passes that fall within the same millisecond.
let _fallbackIdCounter = 0;
function nextFallbackId() {
  _fallbackIdCounter = (_fallbackIdCounter + 1) % 1000;
  return Date.now() * 1000 + _fallbackIdCounter;
}

function money(value) {
  const state = window.state || {};
  const currency = state.displayCurrency || 'TRY';
  const usdToTry = Math.max(0.0001, Number(state.usdToTry) || 38.5);
  const converted = currency === 'USD' ? (Number(value) || 0) / usdToTry : (Number(value) || 0);
  return converted.toLocaleString(currency === 'USD' ? 'en-US' : 'tr-TR', { maximumFractionDigits: 0 }) + ' ' + currency;
}

function moneyRate(value, unit = 'kWh') {
  const state = window.state || {};
  const currency = state.displayCurrency || 'TRY';
  const usdToTry = Math.max(0.0001, Number(state.usdToTry) || 38.5);
  const converted = currency === 'USD' ? (Number(value) || 0) / usdToTry : (Number(value) || 0);
  return converted.toLocaleString(currency === 'USD' ? 'en-US' : 'tr-TR', { maximumFractionDigits: currency === 'USD' ? 3 : 2 }) + ` ${currency}/${unit}`;
}

function setVisible(el, visible, display = '') {
  if (window.setElementVisible) return window.setElementVisible(el, visible, display);
  if (!el) return;
  el.classList.toggle('is-hidden', !visible);
  el.style.display = visible ? display : 'none';
}

function getSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(record => sanitizeDashboardRecord(record, nextFallbackId())).filter(Boolean).slice(0, MAX_SAVED) : [];
  } catch { return []; }
}

function setSaved(list) {
  const sanitized = Array.isArray(list)
    ? list.map(record => sanitizeDashboardRecord(record, nextFallbackId())).filter(Boolean).slice(0, MAX_SAVED)
    : [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
}

function cleanString(value, maxLen = 120) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLen);
}

function cleanNumber(value, min = 0, max = 1_000_000_000, fallback = 0) {
  return clampNumber(value, min, max, fallback);
}

export function sanitizeDashboardRecord(record, fallbackId = nextFallbackId()) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const id = Number.isSafeInteger(Number(record.id)) && Number(record.id) > 0
    ? Number(record.id)
    : fallbackId;
  const displayCurrency = record.displayCurrency === 'USD' ? 'USD' : 'TRY';
  return {
    id,
    timestamp: cleanString(record.timestamp || new Date().toLocaleString('tr-TR'), 80),
    cityName: cleanString(record.cityName || '', 80),
    systemPower: cleanNumber(record.systemPower, 0, 100000),
    panelType: cleanString(record.panelType || '', 40),
    annualEnergy: cleanNumber(record.annualEnergy, 0, 1_000_000_000),
    totalCost: cleanNumber(record.totalCost, 0, 1_000_000_000_000),
    paybackYear: cleanNumber(record.paybackYear, 0, 100, 0),
    roi: cleanNumber(record.roi, -1000, 10000, 0),
    lcoe: cleanNumber(record.lcoe, 0, 100000, 0),
    npv: cleanNumber(record.npv, -1_000_000_000_000, 1_000_000_000_000, 0),
    usdToTry: cleanNumber(record.usdToTry, 0.0001, 10000, 38.5),
    displayCurrency,
    tilt: cleanNumber(record.tilt, 0, 90, 0),
    azimuthName: cleanString(record.azimuthName || '', 40),
    scenarioKey: cleanString(record.scenarioKey || '', 40),
    batteryEnabled: !!record.batteryEnabled,
    netMeteringEnabled: !!record.netMeteringEnabled,
    engineSource: cleanString(record.engineSource || '', 40)
  };
}

function wireDashboardEvents(body) {
  body.querySelector('[data-dashboard-action="compare"]')?.addEventListener('click', compareDashboardSelected);
  body.querySelector('[data-dashboard-action="export"]')?.addEventListener('click', exportSavedRecords);
  body.querySelector('[data-dashboard-action="clear"]')?.addEventListener('click', clearAllSaved);
  body.querySelector('[data-dashboard-import]')?.addEventListener('change', event => importSavedRecords(event.target.files?.[0]));
  body.querySelectorAll('[data-delete-record]').forEach(btn => {
    btn.addEventListener('click', () => deleteSavedRecord(Number(btn.dataset.deleteRecord)));
  });
}

export function saveCurrentCalculation() {
  const state = window.state;
  const r = state.results;
  const i18n = window.i18n;
  if (!r) {
    window.showToast(i18n?.t?.('dashboard.calculateFirst') || 'Önce hesaplama yapın.', 'error');
    return;
  }

  const saved = getSaved();
  const record = {
    id: Date.now(),
    timestamp: new Date().toLocaleString('tr-TR'),
    cityName: state.cityName,
    systemPower: r.systemPower,
    panelType: state.panelType,
    annualEnergy: r.annualEnergy,
    totalCost: r.totalCost,
    paybackYear: Number.isFinite(Number(r.grossSimplePaybackYear))
      ? Number(Number(r.grossSimplePaybackYear).toFixed(1))
      : (Number.isFinite(Number(r.paybackYear)) ? Number(r.paybackYear) : 0),
    roi: r.roi,
    lcoe: r.lcoe,
    npv: r.npvTotal ?? r.npv ?? 0,
    usdToTry: state.usdToTry,
    displayCurrency: state.displayCurrency,
    tilt: state.tilt,
    azimuthName: state.azimuthName,
    scenarioKey: state.scenarioKey,
    batteryEnabled: state.batteryEnabled,
    netMeteringEnabled: state.netMeteringEnabled,
    engineSource: r?.engineSource?.engine ?? r?.backendEngineSource?.engine ?? null
  };

  // FIFO — max 20
  saved.unshift(record);
  if (saved.length > MAX_SAVED) saved.pop();
  setSaved(saved);

  window.showToast(i18n?.t?.('dashboard.saved_success') || 'Hesap kaydedildi!', 'success');
  renderDashboard();
}

export function openDashboard() {
  const modal = document.getElementById('dashboard-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  renderDashboard();
}

export function closeDashboard() {
  const modal = document.getElementById('dashboard-modal');
  if (modal) modal.style.display = 'none';
  if (!document.querySelector('.modal-active, [data-modal-open="true"]')) {
    document.body.classList.remove('modal-open');
  }
}

export function updateDashboard() {
  const saved = getSaved();
  const btn = document.getElementById('dashboard-btn');
  if (btn) {
    const label = window.i18n?.t?.('dashboard.saved') || 'Kayıtlı Hesaplar';
    btn.textContent = `${label} (${saved.length})`;
    setVisible(btn, saved.length > 0);
  }
}

function renderDashboard() {
  const saved = getSaved();
  const body = document.getElementById('dashboard-body');
  const i18n = window.i18n;
  const dt = key => i18n?.t?.(key) || key;
  if (!body) return;

  if (saved.length === 0) {
    body.innerHTML = `<p class="dashboard-empty">${dt('dashboard.noSaved')}</p>`;
    return;
  }

  let selectedIds = [];

  body.innerHTML = `
    <div class="dashboard-header-row">
      <span class="text-muted-85">${dt('dashboard.selectHint')}</span>
      <button data-dashboard-action="compare" class="btn-primary-md">${dt('dashboard.compare')}</button>
      <button data-dashboard-action="export" class="btn-surface-light-md">${dt('dashboard.export')}</button>
      <label class="btn-surface-light-md">
        ${dt('dashboard.import')} <input type="file" accept=".json" data-dashboard-import class="is-hidden"/>
      </label>
      <button data-dashboard-action="clear" class="btn-surface-light-md">${dt('dashboard.clearAll')}</button>
    </div>
    <div class="dashboard-list">
      ${saved.map(rec => `
        <div class="dashboard-card" id="dash-card-${rec.id}">
          <div class="dashboard-record-row">
            <div>
              <input type="checkbox" id="dash-chk-${rec.id}" value="${rec.id}" class="dashboard-record-checkbox"/>
              <strong class="text-primary">${escapeHtml(rec.cityName || '—')}</strong>
              <span class="dashboard-record-timestamp">${escapeHtml(rec.timestamp)}</span>
            </div>
            <button data-delete-record="${rec.id}" class="btn-icon-record-delete">✕</button>
          </div>
          <div class="dashboard-card-metrics">
            <span>${escapeHtml(rec.systemPower.toFixed(1))} kWp</span>
            <span>${escapeHtml(rec.annualEnergy.toLocaleString('tr-TR'))} kWh/yıl</span>
            <span>${escapeHtml(money(rec.totalCost))}</span>
            <span>${dt('dashboard.paybackLabel')} ${escapeHtml(String(rec.paybackYear || '>25'))} yıl</span>
            <span>LCOE: ${escapeHtml(moneyRate(rec.lcoe, 'kWh'))}</span>
            <span>ROI: ${escapeHtml(String(rec.roi))}%</span>
          </div>
        </div>
      `).join('')}
    </div>
    <div id="dashboard-compare-result" class="mt-5"></div>
  `;
  wireDashboardEvents(body);

  updateDashboard();
}

export function compareDashboardSelected() {
  const checkboxes = document.querySelectorAll('[id^="dash-chk-"]:checked');
  const i18n = window.i18n;
  const dt = key => i18n?.t?.(key) || key;
  if (checkboxes.length < 2) {
    window.showToast(dt('dashboard.selectAtLeast2'), 'error');
    return;
  }

  const saved = getSaved();
  const selectedIds = Array.from(checkboxes).map(c => parseInt(c.value));
  const selected = saved.filter(r => selectedIds.includes(r.id)).slice(0, 3);

  const resultEl = document.getElementById('dashboard-compare-result');
  if (!resultEl) return;

  const metrics = [
    [dt('dashboard.metricCity'), r => r.cityName],
    [dt('dashboard.metricSystem'), r => r.systemPower?.toFixed(2)],
    [dt('dashboard.metricAnnualEnergy'), r => r.annualEnergy?.toLocaleString('tr-TR')],
    [dt('dashboard.metricTotalCost'), r => money(r.totalCost)],
    [dt('dashboard.metricPayback'), r => r.paybackYear || '>25'],
    [dt('dashboard.metricLcoe'), r => moneyRate(r.lcoe, 'kWh')],
    [dt('dashboard.metricRoi'), r => r.roi],
    [dt('dashboard.metricNpv'), r => money(r.npv)],
    [dt('dashboard.metricTilt'), r => r.tilt + '°'],
    [dt('dashboard.metricAzimuth'), r => r.azimuthName],
  ];

  resultEl.innerHTML = `
    <h4 class="text-primary mb-3">${dt('dashboard.compareTitle')}</h4>
    <table class="comp-table">
      <thead>
        <tr>
          <th>${dt('dashboard.metricCity')}</th>
          ${selected.map((r, i) => `<th>${escapeHtml(r.cityName || 'Hesap ' + (i+1))}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${metrics.map(([label, fn]) => `
          <tr>
            <td>${escapeHtml(label)}</td>
            ${selected.map(r => `<td>${escapeHtml(String(fn(r) ?? '—'))}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

export function deleteSavedRecord(id) {
  const saved = getSaved().filter(r => r.id !== id);
  setSaved(saved);
  renderDashboard();
}

export function clearAllSaved() {
  localStorage.removeItem(STORAGE_KEY);
  renderDashboard();
}

export function exportSavedRecords() {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), records: getSaved() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'solar-rota-kayitlar.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function importSavedRecords(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || '{}'));
      const incoming = Array.isArray(parsed.records)
        ? parsed.records.slice(0, MAX_IMPORT_RECORDS).map((record, index) => sanitizeDashboardRecord(record, Date.now() + index)).filter(Boolean)
        : [];
      const i18n = window.i18n;
      const dt = key => i18n?.t?.(key) || key;
      if (!incoming.length) {
        window.showToast?.(dt('dashboard.importError'), 'error');
        return;
      }
      const merged = [...incoming, ...getSaved()].slice(0, MAX_SAVED);
      setSaved(merged);
      renderDashboard();
      window.showToast?.(dt('dashboard.importedN').replace('{n}', incoming.length), 'success');
    } catch {
      const i18n = window.i18n;
      window.showToast?.(i18n?.t?.('dashboard.importError') || 'Kayıt dosyası okunamadı.', 'error');
    }
  };
  reader.readAsText(file);
}

// window'a expose et
if (typeof window !== 'undefined') {
  window.saveCurrentCalculation = saveCurrentCalculation;
  window.openDashboard = openDashboard;
  window.closeDashboard = closeDashboard;
  window.updateDashboard = updateDashboard;
  window.compareDashboardSelected = compareDashboardSelected;
  window.deleteSavedRecord = deleteSavedRecord;
  window.clearAllSaved = clearAllSaved;
  window.exportSavedRecords = exportSavedRecords;
  window.importSavedRecords = importSavedRecords;
}
