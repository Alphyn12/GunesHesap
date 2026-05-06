// ═══════════════════════════════════════════════════════════
// i18n — Çok Dil Desteği (Faz F)
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY = 'guneshesap_lang';
const SUPPORTED = ['tr', 'en', 'de'];

const STATIC_BINDINGS = [
  ['.logo-tagline', 'app.tagline'],
  ['.step-dot[data-step="1"] .step-dot-label', 'nav.step1'],
  ['.step-dot[data-step="2"] .step-dot-label', 'nav.step2'],
  ['.step-dot[data-step="3"] .step-dot-label', 'nav.step3'],
  ['.step-dot[data-step="4"] .step-dot-label', 'nav.step4'],
  ['.step-dot[data-step="5"] .step-dot-label', 'nav.step5'],
  ['.step-dot[data-step="6"] .step-dot-label', 'nav.step6'],
  ['.step-dot[data-step="7"] .step-dot-label', 'nav.step7'],
  ['.hero-eyebrow', 'hero.eyebrow'],
  ['.hero-sub', 'hero.subtitle'],
  ['.scenario-grid-label', 'scenario.gridLabel'],
  ['#step1-continue-btn', 'common.continue'],
  ['#city-search', 'step2.search', 'placeholder'],
  ['#geolocation-btn .step2-geo-label', 'step2.geoBtn'],
  ['#step2-back-btn', 'common.back'],
  ['#step2-continue-btn .step2-continue-label', 'scenario.defaultContinue'],
  ['#location-warning', 'step2.outOfTurkey'],
  ['#map-layer-label', 'step2.satellite'],
  ['#step-4 .step-heading-eyebrow', 'step4.eyebrow'],
  ['#step-4 .step-heading-title', 'step4.title'],
  ['#step-4 .step-heading-sub', 'step4.subtitle'],
  ['#step-5 .step-heading-eyebrow', 'step5.eyebrow'],
  ['#step-5 .step-heading-title', 'step5.title'],
  ['#step-5 .step-heading-sub', 'step5.subtitle'],
  ['#step-6 .loading-headline', 'step6.title'],
  ['#step-6 .loading-msg', 'step6.subtitle'],
  ['#step-7 .step-heading-eyebrow', 'step7.eyebrow'],
  ['#step-7 .step-heading-title', 'step7.title'],
  ['#step-7 .step-heading-sub', 'step7.subtitle'],
  ['#step-7 .kpi-card:nth-child(1) .kpi-unit', 'units.kwhPerYear'],
  ['#step-7 .kpi-card:nth-child(1) .kpi-label', 'step7.annualEnergy'],
  ['#step-7 .kpi-card:nth-child(2) .kpi-label', 'step7.annualSavings'],
  ['#step-7 .kpi-card:nth-child(3) .kpi-unit', 'units.kwpInstalled'],
  ['#step-7 .kpi-card:nth-child(3) .kpi-label', 'step7.systemPower'],
  ['#step-7 .kpi-card:nth-child(4) .kpi-unit', 'units.tonsCo2PerYear'],
  ['#step-7 .kpi-card:nth-child(4) .kpi-label', 'step7.co2'],
  ['#step-7 .fin-box .card-title', 'finance.analysis'],
  ['#dashboard-btn', 'dashboard.saved'],
  ['#tariff-desc', 'finance.tariffDesc'],
  ['#exchange-rate-status', 'finance.exchangeLoading'],
  ['#nm-license-badge', 'finance.settlementBadge'],
  ['.chart-wrap .chart-title', 'results.monthlyChart'],
  ['#scenario-card .card-title', 'results.scenarios'],
  ['#hourly-profile-card .card-title', 'results.hourlyProfile'],
  ['#sun-path-card .card-title', 'results.sunPath'],
  ['#heatmap-card .card-title', 'results.heatmap']
];

export function readSavedLanguage(storage = globalThis.localStorage) {
  try {
    const saved = storage?.getItem?.(STORAGE_KEY);
    return SUPPORTED.includes(saved) ? saved : 'tr';
  } catch { return 'tr'; }
}

export function persistLanguage(lang, storage = globalThis.localStorage) {
  const safe = SUPPORTED.includes(lang) ? lang : 'tr';
  try { storage?.setItem?.(STORAGE_KEY, safe); } catch { /* ignore */ }
  return safe;
}

function setTranslatedText(el, value) {
  const targetSelector = el.getAttribute?.('data-i18n-target');
  const target = targetSelector ? el.querySelector?.(targetSelector) : null;
  if (target) {
    target.textContent = value;
    return;
  }

  const explicit = el.querySelector?.('[data-i18n-text]');
  if (explicit) {
    explicit.textContent = value;
    return;
  }

  const childNodes = Array.from(el.childNodes || []);
  const textNode = childNodes.find(node => node.nodeType === 3 && String(node.nodeValue || '').trim());
  if (textNode) {
    const leading = /^\s/.test(textNode.nodeValue || '') ? ' ' : '';
    const trailing = /\s$/.test(textNode.nodeValue || '') ? ' ' : '';
    textNode.nodeValue = `${leading}${value}${trailing}`;
    return;
  }

  el.textContent = value;
}

export function applyTextTranslations(elements, translate) {
  elements.forEach(item => {
    const val = translate(item.key);
    if (!val || val === item.key) return;
    if (item.attr === 'placeholder') item.el.placeholder = val;
    else if (item.attr === 'title') item.el.title = val;
    else setTranslatedText(item.el, val);
  });
}

export const i18n = {
  locale: 'tr',
  translations: {},

  async loadLocale(lang) {
    const safeLang = SUPPORTED.includes(lang) ? lang : 'tr';
    try {
      const res = await fetch(`./locales/${safeLang}.json`);
      if (!res.ok) throw new Error('Locale not found');
      this.translations = await res.json();
      this.locale = safeLang;
      persistLanguage(safeLang);
      if (typeof window !== 'undefined') window._currentLang = safeLang;
      this.applyTranslations();
      this.updateLangButtons();
      this.afterLanguageChange();
    } catch(e) {
      console.warn('Locale yüklenemedi:', lang, e);
    }
  },

  t(key) {
    const result = key.split('.').reduce((obj, k) => obj?.[k], this.translations);
    return result || key;
  },

  applyTranslations() {
    const selectorItems = [];
    STATIC_BINDINGS.forEach(([selector, key, attr]) => {
      document.querySelectorAll(selector).forEach(el => selectorItems.push({ el, key, attr }));
    });
    applyTextTranslations(selectorItems, key => this.t(key));

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = this.t(key);
      if (val !== key) setTranslatedText(el, val);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = this.t(key);
      if (val !== key) el.placeholder = val;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const val = this.t(key);
      if (val !== key) el.title = val;
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria-label');
      const val = this.t(key);
      if (val !== key) el.setAttribute('aria-label', val);
    });
    document.querySelectorAll('.step-dot[data-step]').forEach(el => {
      const step = el.getAttribute('data-step');
      const label = this.t(`nav.step${step}`);
      const prefix = this.t('nav.stepPrefix');
      if (label !== `nav.step${step}` && prefix !== 'nav.stepPrefix') {
        el.setAttribute('aria-label', `${step}. ${prefix}: ${label}`);
      }
    });
    document.documentElement.lang = this.locale;
    const titleEl = document.querySelector('title');
    if (titleEl) titleEl.textContent = this.t('app.title') + ' — ' + this.t('app.subtitle');
  },

  updateLangButtons() {
    document.querySelectorAll('[data-lang]').forEach(btn => {
      const isActive = btn.dataset.lang === this.locale;
      const languageLabel = this.t(`language.${btn.dataset.lang}`);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      if (languageLabel !== `language.${btn.dataset.lang}`) {
        btn.setAttribute('aria-label', `${this.t('language.switchTo')} ${languageLabel}`);
      }
    });
  },

  afterLanguageChange() {
    window.renderExchangeRateStatus?.();
    window.updateDashboard?.();
    window.renderScenarioCards?.();
    window.updateScenarioUI?.();
    window.renderEvidenceFileStatus?.();
    window.enhanceTooltipAccessibility?.();
    window.syncRoofAreaValidationUi?.();
    window.syncHeaderHeightVar?.();
    window.syncMapLayerButton?.();
    window.syncRoofDrawToolbarLabels?.();
    if (window.state?.results) {
      window.renderResults?.();
      window.renderEngReport?.();
      window.renderHourlyProfile?.();
      window.renderScenarioAnalysis?.();
    }
  },

  async init() {
    const saved = readSavedLanguage();
    await this.loadLocale(saved);
  }
};

export async function switchLanguage(lang) {
  await i18n.loadLocale(lang);
}

// window'a expose et
if (typeof window !== 'undefined') {
  window.i18n = i18n;
  window.switchLanguage = switchLanguage;
}
