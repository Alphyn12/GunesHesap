// ═══════════════════════════════════════════════════════════
// INVERTER — Çoklu İnverter Seçimi (Faz B3)
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════
import { INVERTER_TYPES } from './data.js';
import { COST_ASSUMPTIONS, DEFAULT_COST_PROFILE, normalizeCostProfile } from './assumptions/index.js';

const inverterDescriptions = {
  string:    'Merkezi mimari. Tek yönlü ve düzenli kurulum yüzeylerinde yatırım/performans dengesi güçlüdür.',
  micro:     'Panel bazlı mimari. Karma yönlü veya kısmi gölgeli yüzeylerde performans avantajı sağlar.',
  optimizer: 'Panel bazında optimizasyon ile merkezi inverteri birleştirir. Karma yüzeyli projelerde kontrollü orta yol sunar.'
};

const COST_PROFILE_LABELS = {
  economy: 'Ekonomik',
  standard: 'Standart',
  premium: 'Premium'
};

function formatTry(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('tr-TR')} ₺`;
}

function inverterAssumptionPriceCopy(key, profileKey) {
  const profile = normalizeCostProfile(profileKey || DEFAULT_COST_PROFILE);
  const assumption = COST_ASSUMPTIONS.inverterAssumptions?.[key] || COST_ASSUMPTIONS.inverterAssumptions?.string;
  const values = assumption?.profiles?.[profile] || assumption?.profiles?.standard || {};
  const label = COST_PROFILE_LABELS[profile] || 'Standart';
  if (assumption?.pricingModel === 'perPanelPlusFixed') {
    const fixed = Number(values.fixedGateway || 0) + Number(values.monitoring || 0);
    return {
      text: `${label} profil: ${formatTry(values.perPanel)}/panel + ${formatTry(fixed)} sabit`,
      meta: `${COST_ASSUMPTIONS.version} · ${assumption.sourceDate || COST_ASSUMPTIONS.sourceDate || '—'}`
    };
  }
  return {
    text: `${label} profil: ${formatTry(values.base)}/kWp`,
    meta: `${COST_ASSUMPTIONS.version} · ${assumption?.sourceDate || COST_ASSUMPTIONS.sourceDate || '—'}`
  };
}

export function buildInverterCards() {
  const wrap = document.getElementById('inverter-cards-wrap');
  if (!wrap) return;

  const state = window.state;
  const selected = state.inverterType || 'string';

  wrap.innerHTML = Object.entries(INVERTER_TYPES).map(([key, inv]) => {
    const assumptionPrice = inverterAssumptionPriceCopy(key, state.costProfile);
    const shadeClass = inv.shadeTolerance >= 0.85 ? 'inverter-shade-good'
      : inv.shadeTolerance >= 0.70 ? 'inverter-shade-warn'
      : 'inverter-shade-bad';
    return `
    <div class="inverter-card${selected === key ? ' selected' : ''}" id="inv-card-${key}" data-testid="inverter-card-${key}" data-inverter-key="${key}" role="button" tabindex="0" aria-pressed="${selected === key ? 'true' : 'false'}" data-click-action="selectInverter" data-arg="${key}">
      <div class="inverter-check">✓</div>
      <div class="equipment-card-topline">
        <span class="equipment-card-badge">${inv.badge || 'İnverter tipi'}</span>
        <span class="equipment-card-example">${inv.exampleModel || ''}</span>
      </div>
      <div class="inverter-card-title">${inv.name}</div>
      <div class="equipment-card-copy">${inv.summary || inverterDescriptions[key]}</div>
      <div class="inverter-card-eff">${(inv.efficiency * 100).toFixed(1)}%</div>
      <div class="equipment-card-metric-label">Örnek cihaz verimi</div>
      <div class="equipment-chip-row equipment-chip-row-tight">
        <span class="equipment-chip">${inv.structure || 'Mimari bilgisi'}</span>
        <span class="equipment-chip">${inv.monitoring || 'İzleme bilgisi'}</span>
        <span class="equipment-chip">${inv.batteryPath || 'Batarya entegrasyonu'}</span>
      </div>
      <div class="inverter-card-stats">
        <div class="inverter-stat">
          <span class="inverter-stat-label">Gölge Toleransı</span>
          <span class="${shadeClass}">${(inv.shadeTolerance * 100).toFixed(0)}%</span>
        </div>
        <div class="inverter-stat">
          <span class="inverter-stat-label">Ömür</span>
          <span>${inv.lifetime} yıl</span>
        </div>
        <div class="inverter-stat">
          <span class="inverter-stat-label">Garanti</span>
          <span>${inv.warranty || inv.lifetime} yıl</span>
        </div>
        <div class="inverter-stat">
          <span class="inverter-stat-label">Varsayım maliyeti</span>
          <span>${assumptionPrice.text}</span>
        </div>
      </div>
      <div class="equipment-card-note"><strong>Fiyat kaynağı:</strong> ${assumptionPrice.meta}</div>
      <div class="equipment-card-note"><strong>En uygun:</strong> ${inv.bestFor || inverterDescriptions[key]}</div>
      <div class="equipment-card-note equipment-card-note-muted"><strong>Teknik vurgu:</strong> ${(inv.technicalHighlights || []).join(' • ')}</div>
      <div class="inverter-card-pros">
        ${inv.advantages.map(a => `<div class="inv-pro">✓ ${a}</div>`).join('')}
      </div>
      <div class="inverter-card-cons">
        ${inv.disadvantages.map(d => `<div class="inv-con">✗ ${d}</div>`).join('')}
      </div>
    </div>
  `;
  }).join('');
  // Wrap önceden DOM'da yoksa init listener'ı bağlanamamış olabilir; her render sonrası
  // güvenli şekilde tekrar dene (idempotent guard `dataset.kbdBound`).
  _bindInverterKeyboardOnce();
  window.updateEquipmentSelectionSummary?.();
}

export function selectInverter(key) {
  const state = window.state;
  state.inverterType = key;

  document.querySelectorAll('.inverter-card').forEach(card => {
    const isSelected = card.dataset.inverterKey === key;
    card.classList.toggle('selected', isSelected);
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  });

  const inv = INVERTER_TYPES[key];
  const infoEl = document.getElementById('inverter-info');
  if (infoEl) {
    infoEl.innerHTML = `
      <div class="inverter-selected-info">
        <div class="battery-summary-head">
          <div>
            <strong>${inv.name}</strong>
            <span>${inv.summary || inverterDescriptions[key]}</span>
          </div>
          <span class="equipment-card-badge">${inv.badge || 'İnverter'}</span>
        </div>
        <div class="battery-summary-grid">
          <div class="battery-summary-stat"><span>Verim</span><strong>${(inv.efficiency * 100).toFixed(1)}%</strong></div>
          <div class="battery-summary-stat"><span>Gölge toleransı</span><strong>${(inv.shadeTolerance * 100).toFixed(0)}%</strong></div>
          <div class="battery-summary-stat"><span>Garanti</span><strong>${inv.warranty || inv.lifetime} yıl</strong></div>
          <div class="battery-summary-stat"><span>Mimari</span><strong>${inv.structure || '—'}</strong></div>
        </div>
        <div class="equipment-card-note"><strong>Batarya yolu:</strong> ${inv.batteryPath || 'Teklif aşamasında üretici uyumluluğu doğrulanmalıdır.'}</div>
      </div>`;
  }
  window.updatePanelPreview?.();
  window.updateEquipmentSelectionSummary?.();
}

// Klavye seçimi (Enter/Space) için listener doğrudan inverter-cards-wrap container'ına
// bağlanır; document seviyesinde her keydown'ı dinleyip filtrelemekten daha verimli ve
// diğer modüllerle çakışma riski yok.
function _bindInverterKeyboardOnce() {
  const wrap = document.getElementById('inverter-cards-wrap');
  if (!wrap || wrap.dataset.kbdBound === '1') return;
  wrap.dataset.kbdBound = '1';
  wrap.addEventListener('keydown', event => {
    const card = event.target?.closest?.('.inverter-card[role="button"]');
    if (!card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const key = card.dataset.inverterKey;
      if (key) selectInverter(key);
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bindInverterKeyboardOnce, { once: true });
  } else {
    _bindInverterKeyboardOnce();
  }
}

// window'a expose et
window.buildInverterCards = buildInverterCards;
window.selectInverter = selectInverter;
