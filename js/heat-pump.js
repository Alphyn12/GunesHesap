// ═══════════════════════════════════════════════════════════
// HEAT PUMP — Isı Pompası Entegrasyonu (Faz C3)
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════
import { HEAT_PUMP_DATA } from './data.js';
import { localeTag } from './output-i18n.js';

function setVisible(el, visible, display = '') {
  if (window.setElementVisible) return window.setElementVisible(el, visible, display);
  if (!el) return;
  el.classList.toggle('is-hidden', !visible);
  el.style.display = visible ? display : 'none';
}

export function toggleHeatPumpBlock() {
  const tog = document.getElementById('hp-toggle');
  if (tog) { tog.checked = !tog.checked; onHeatPumpToggle(tog.checked); }
}

export function onHeatPumpToggle(checked) {
  const state = window.state;
  state.heatPumpEnabled = checked;
  const block = document.getElementById('hp-block');
  setVisible(block, checked, 'block');
  if (checked && !state.heatPump) {
    state.heatPump = {
      area: 120,
      insulation: 'avg',
      heatingType: 'both',
      currentHeating: 'gas'
    };
    updateHeatPumpPreview();
  }
}

export function updateHeatPumpInput() {
  const state = window.state;
  if (!state.heatPump) state.heatPump = {};

  state.heatPump.area = parseFloat(document.getElementById('hp-area')?.value) || 120;
  state.heatPump.insulation = document.getElementById('hp-insulation')?.value || 'avg';
  state.heatPump.heatingType = document.getElementById('hp-type')?.value || 'both';
  state.heatPump.currentHeating = document.getElementById('hp-current')?.value || 'gas';

  updateHeatPumpPreview();
}

function updateHeatPumpPreview() {
  const state = window.state;
  const hp = state.heatPump;
  if (!hp) return;

  const ins = hp.insulation || 'avg';
  const heatLoad = HEAT_PUMP_DATA.heat_load[ins] || 70;          // W/m²
  const spfH = HEAT_PUMP_DATA.spf_heating[ins] || 3.2;           // Seasonal PF heating
  const spfC = HEAT_PUMP_DATA.spf_cooling[ins] || 3.5;           // Seasonal PF cooling
  const heatingMonths = HEAT_PUMP_DATA.heating_season_months;
  const coolingMonths = HEAT_PUMP_DATA.cooling_season_months;

  // Yıllık ısıtma talebi (kWh) = alan × yük × günlük_saat × ay_sayısı × gün
  const annualHeatDemand = hp.area * heatLoad * 8 * heatingMonths * 30 / 1000; // kWh
  const annualCoolDemand = hp.area * (heatLoad * 0.7) * 8 * coolingMonths * 30 / 1000;

  const doHeating = hp.heatingType === 'heat' || hp.heatingType === 'both';
  const doCooling = hp.heatingType === 'cool' || hp.heatingType === 'both';

  const elecHeating = doHeating ? Math.round(annualHeatDemand / spfH) : 0;
  const elecCooling = doCooling ? Math.round(annualCoolDemand / spfC) : 0;
  const totalElec = elecHeating + elecCooling;

  // Mevcut yakıt maliyeti
  let currentCost = 0;
  const elecPrice = HEAT_PUMP_DATA.electric_price;
  if (hp.currentHeating === 'gas' && doHeating) {
    const gasM3 = annualHeatDemand / HEAT_PUMP_DATA.gas_kwh_per_m3;
    currentCost = gasM3 * HEAT_PUMP_DATA.gas_price;
  } else if (hp.currentHeating === 'fueloil' && doHeating) {
    const liters = annualHeatDemand / HEAT_PUMP_DATA.fuel_oil_kwh_per_liter;
    currentCost = liters * HEAT_PUMP_DATA.fuel_oil_price;
  } else if (hp.currentHeating === 'electric') {
    // Mevcut sistem doğrudan rezistans/klima ile elektrik tüketiyor (COP≈1).
    // Isı pompası karşılaştırması için soğutma da aynı baz üzerinden dahil edilir.
    const heatingElecBefore = doHeating ? annualHeatDemand : 0;
    const coolingElecBefore = doCooling ? annualCoolDemand : 0;
    currentCost = (heatingElecBefore + coolingElecBefore) * elecPrice;
  }

  const hpElecCost = totalElec * elecPrice;
  const annualSaving = Math.round(currentCost - hpElecCost);

  const gridCo2 = Number(HEAT_PUMP_DATA.gridCo2KgPerKwh) || 0.420;
  const gasCo2 = Number(HEAT_PUMP_DATA.gasCo2KgPerKwh) || 0.202;
  const co2Before = doHeating ? (annualHeatDemand * gasCo2) / 1000 : 0; // ton
  const co2After = (totalElec * gridCo2) / 1000; // ton
  const co2Saved = Math.max(0, co2Before - co2After).toFixed(1);

  const prevEl = document.getElementById('hp-preview');
  if (prevEl) {
    const savingClass = annualSaving >= 0 ? 'hp-stat-value--success' : 'hp-stat-value--danger';
    const lc = localeTag();
    prevEl.innerHTML = `
      <div class="hp-stat-grid">
        <div class="hp-stat-card">
          <div class="hp-stat-value hp-stat-value--accent">${totalElec.toLocaleString(lc)} kWh</div>
          <div class="text-muted-72">Yıllık elektrik ihtiyacı</div>
        </div>
        <div class="hp-stat-card">
          <div class="hp-stat-value">SPF ${spfH.toFixed(1)} / ${spfC.toFixed(1)}</div>
          <div class="text-muted-72">Isıtma / soğutma SPF</div>
        </div>
        <div class="hp-stat-card">
          <div class="hp-stat-value ${savingClass}">${annualSaving >= 0 ? '+' : ''}${annualSaving.toLocaleString(lc)} ₺</div>
          <div class="text-muted-72">Yıllık yakıt tasarrufu</div>
        </div>
        <div class="hp-stat-card">
          <div class="hp-stat-value hp-stat-value--success">${co2Saved} t</div>
          <div class="text-muted-72">CO₂ azaltımı (yıllık)</div>
        </div>
      </div>
      <div class="hp-footnote">
        Isıtma talebi: <strong>${Math.round(annualHeatDemand).toLocaleString(lc)} kWh/yıl</strong>
        ${doCooling ? ` | Soğutma: <strong>${Math.round(annualCoolDemand).toLocaleString(lc)} kWh/yıl</strong>` : ''}
        | Mevcut yakıt maliyeti: <strong>${Math.round(currentCost).toLocaleString(lc)} ₺/yıl</strong>
      </div>`;
  }
}

// window'a expose et
window.toggleHeatPumpBlock = toggleHeatPumpBlock;
window.onHeatPumpToggle = onHeatPumpToggle;
window.updateHeatPumpInput = updateHeatPumpInput;
