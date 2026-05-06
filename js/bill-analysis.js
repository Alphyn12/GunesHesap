// ═══════════════════════════════════════════════════════════
// BILL ANALYSIS — Elektrik Fatura Analizi (Faz B2)
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════
import { MONTHS } from './data.js';
import { COMMON_YEAR_MONTH_DAYS } from './calc-core.js';

function setVisible(el, visible, display = '') {
  if (window.setElementVisible) return window.setElementVisible(el, visible, display);
  if (!el) return;
  el.classList.toggle('is-hidden', !visible);
  el.style.display = visible ? display : 'none';
}

const bt = key => window.i18n?.t?.(key) || key;

const SEASON_WEIGHTS = [0.7, 0.75, 0.9, 1.0, 1.1, 1.2, 1.25, 1.2, 1.0, 0.9, 0.75, 0.65];

export function initBillAnalysis() {
  const state = window.state;
  const wrap = document.getElementById('bill-inputs-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="bill-grid">
      ${MONTHS.map((m, i) => `
        <div class="bill-month-input">
          <label>${m}</label>
          <input type="number" id="bill-${i}" min="0" max="5000" placeholder="kWh"
            value="${state.monthlyConsumption ? state.monthlyConsumption[i] : ''}"
            data-input-action="onBillInput"
            class="input-form-row-85-tight"/>
        </div>
      `).join('')}
    </div>
    <div class="flex-row-mt-3-gap-10">
      <label class="text-muted-85">${bt('billAnalysis.quickFillLabel')}</label>
      <input type="number" id="bill-avg-input" placeholder="Aylık ort. kWh" min="0" max="5000"
        class="input-form-row-85-tight-130"/>
      <button data-click-action="billQuickFill" class="btn-primary-md">${bt('billAnalysis.quickFillBtn')}</button>
      <button data-click-action="billClear" class="btn-surface-light-md">${bt('billAnalysis.clearBtn')}</button>
    </div>
    <div id="bill-summary" class="text-base-82-muted-mt-2-5"></div>
    <div class="section-divider-mt-3">
      <label class="text-muted-85-block-mb-1-5">${bt('billAnalysis.csv8760Label')}</label>
      <input type="file" id="load-8760-input" accept=".csv,.txt" data-change-action="import8760Csv"
        class="text-sm-muted-fullwidth"/>
    </div>
  `;

  onBillInput();
}

export function import8760Csv(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    const allValues = text
      .split(/[\s,;]+/)
      .map(v => Number(String(v).replace(',', '.')))
      .filter(v => Number.isFinite(v) && v >= 0);
    if (allValues.length !== 8760 && allValues.length !== 8784) {
      window.showToast?.(bt('billAnalysis.csv8760WrongCount').replace('{n}', allValues.length.toLocaleString('tr-TR')), 'error');
      return;
    }
    // Artık yıl (8784 saat): ilk 8760'ı kullan, kalanı yok say.
    const values = allValues.length === 8784 ? allValues.slice(0, 8760) : allValues;
    const rawAnnualKwh = values.reduce((a, b) => a + b, 0);
    if (rawAnnualKwh <= 0) {
      window.showToast?.(bt('billAnalysis.csv8760ZeroTotal'), 'error');
      return;
    }
    let cursor = 0;
    const monthly = COMMON_YEAR_MONTH_DAYS.map(days => {
      const hours = days * 24;
      const sum = values.slice(cursor, cursor + hours).reduce((a, b) => a + b, 0);
      cursor += hours;
      return Math.round(sum);
    });
    window.state.monthlyConsumption = monthly;
    window.state.hourlyConsumption8760 = values;
    window.state.dailyConsumption = rawAnnualKwh / 365;
    MONTHS.forEach((_, i) => {
      const el = document.getElementById(`bill-${i}`);
      if (el) el.value = monthly[i] || 0;
    });
    onBillInput({ preserveHourly: true });
    window.showToast?.(bt('billAnalysis.csv8760Imported'), 'success');
  };
  reader.readAsText(file);
}

export function onBillInput({ preserveHourly = false } = {}) {
  const state = window.state;
  let hasAnyInput = false;
  const values = MONTHS.map((_, i) => {
    const el = document.getElementById(`bill-${i}`);
    if (el && String(el.value).trim() !== '') hasAnyInput = true;
    return el ? (parseFloat(el.value) || 0) : 0;
  });
  const total = values.reduce((a, b) => a + b, 0);
  state.monthlyConsumption = hasAnyInput && total > 0 ? values : null;
  if (!preserveHourly) state.hourlyConsumption8760 = null;

  const daily = total > 0 ? (total / 365).toFixed(2) : 0;

  const summaryEl = document.getElementById('bill-summary');
  if (summaryEl && total > 0) {
    summaryEl.textContent = bt('billAnalysis.summaryText')
      .replace('{total}', total.toLocaleString('tr-TR'))
      .replace('{daily}', daily);
    // Günlük tüketimi güncelle
    if (daily > 0) {
      state.dailyConsumption = parseFloat(daily);
      const consEl = document.getElementById('consumption-val');
      if (consEl) consEl.textContent = daily + ' kWh/gün';
    }
  } else if (summaryEl) {
    summaryEl.textContent = '';
  }
}

export function billQuickFill() {
  const avg = parseFloat(document.getElementById('bill-avg-input')?.value) || 0;
  if (avg <= 0) return;

  MONTHS.forEach((_, i) => {
    const el = document.getElementById(`bill-${i}`);
    if (el) el.value = Math.round(avg * SEASON_WEIGHTS[i]);
  });
  onBillInput();
}

export function billClear() {
  MONTHS.forEach((_, i) => {
    const el = document.getElementById(`bill-${i}`);
    if (el) el.value = '';
  });
  const state = window.state;
  state.monthlyConsumption = null;
  state.hourlyConsumption8760 = null;
  const summaryEl = document.getElementById('bill-summary');
  if (summaryEl) summaryEl.textContent = '';
}

export function toggleBillBlock() {
  const tog = document.getElementById('bill-toggle');
  if (tog) { tog.checked = !tog.checked; onBillToggle(tog.checked); }
}

export function onBillToggle(checked) {
  const state = window.state;
  state.billAnalysisEnabled = checked;
  const block = document.getElementById('bill-inputs-block');
  setVisible(block, checked, 'block');
  if (checked) initBillAnalysis();
}

// window'a expose et
window.toggleBillBlock = toggleBillBlock;
window.onBillToggle = onBillToggle;
window.onBillInput = onBillInput;
window.billQuickFill = billQuickFill;
window.billClear = billClear;
window.import8760Csv = import8760Csv;
