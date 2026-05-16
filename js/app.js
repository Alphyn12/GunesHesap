// ═══════════════════════════════════════════════════════════
// APP.JS — Ana Orkestratör
// Solar Rota v2.0 — Modüler Mimari
// ═══════════════════════════════════════════════════════════
import {
  TURKISH_CITIES, PANEL_TYPES, BATTERY_MODELS, COMPASS_DIRS,
  PSH_FALLBACK, CITY_SUMMER_TEMPS, MONTHS, MONTH_WEIGHTS,
  DEFAULT_TARIFFS, INVERTER_TYPES, HEAT_PUMP_DATA, EV_MODELS, TARIFF_META,
  PANEL_TYPE_OPTIONS, normalizePanelTypeKey, APRIL_2026_TARIFF_PROFILES,
  APRIL_2026_TARIFF_SOURCE
} from './data.js';
import {
  PANEL_CATALOG,
  PANEL_CATALOG_SEGMENT_FILTERS,
  PANEL_CATALOG_TECH_FILTERS,
  filterPanelCatalog,
  getPanelCatalogById,
  getPanelCatalogForType
} from './panel-catalog.js';
import { showToast, animateCounter, launchConfetti, resetConfetti, renderPRGauge } from './ui-charts.js';
import { renderResults, renderMonthlyChart, downloadPDF, downloadTechnicalPDF, shareResults, loadFromHash, exportCrmLead } from './ui-render.js';
import { toggleEngReport, renderEngReport } from './eng-report.js';
import { runCalculation, isCalculationInProgress } from './calculation-service.js';
import { calculateBatteryMetrics, calculateNMMetrics, refreshCalculationStageMeta, getTiltCoeff, finalizeCalculationUI } from './calc-engine.js';
import { calculateSystemLayout, estimateSolarCapex, resolvePanelSpec } from './calc-core.js';
import { renderHourlyProfile, setHourlySeason } from './hourly-profile.js';
import { toggleBillBlock, onBillToggle, onBillInput, billQuickFill, billClear, import8760Csv } from './bill-analysis.js';
import { buildInverterCards, selectInverter } from './inverter.js';
import { calculateStructural } from './structural.js';
import { toggleEVBlock, onEVToggle, updateEVInput, onEVModelChange } from './ev-charging.js';
import { toggleHeatPumpBlock, onHeatPumpToggle, updateHeatPumpInput } from './heat-pump.js';
import { renderSunPath } from './sun-path.js';
import { renderScenarioAnalysis, onScenarioCustomChange } from './scenarios.js';
import { toggleTaxBlock, onTaxToggle, updateTaxInput } from './tax.js';
import { openComparison, closeComparison, runComparison } from './comparison.js';
import { openQuoteModal, closeQuoteModal, openLegalModal, closeLegalModal, submitQuoteForm } from './quote-modal.js';
import { saveCurrentCalculation, openDashboard, closeDashboard, updateDashboard, compareDashboardSelected, deleteSavedRecord, clearAllSaved } from './dashboard.js';
import { showHeatmapCard, toggleHeatmapAnimation, setHeatmapMonth } from './heatmap.js';
import { i18n, switchLanguage } from './i18n.js';
import { initRoofDrawing, syncRoofPolygonsToState } from './roof-geometry.js';
import { toggleOSMShadow, refreshOSMShadowAnalysis } from './osm-shadow.js';
import { initExchangeRateService, refreshExchangeRate, setManualUsdTryRate, convertTry } from './exchange-rate.js';
import { appendAuditEntry } from './audit-log.js';
import { attachEvidenceFile } from './evidence-files.js';
import { SCENARIO_ICONS } from './scenario-icons.js';
import { normalizeUserIdentity } from './identity.js';
import { buildApprovalWorkflow } from './proposal-governance.js';
import { buildOffgridFieldAcceptanceSnapshot, buildOffgridFieldOperationSnapshot } from './evidence-governance.js';
import { TARIFF_DATA_LIFECYCLE, TURKEY_REGULATORY_VERSION } from './turkey-regulation.js';
import { isLocationInTurkey } from './location-validation.js';
import { applyScenarioDefaults, getScenarioDefinition, listScenarioDefinitions, localizeScenarioDefinition, DEFAULT_SCENARIO_KEY } from './scenario-workflows.js';
import { createSolarProposalMark } from './solar-art.js';
import { loadProposalState, saveProposalState } from './storage.js';
import { DEVICE_CATALOG, DEVICE_CATEGORIES, DEVICE_CATEGORY_LABELS, catalogItemToDevice, getDevicesByCategory } from './device-catalog.js';
import { escapeHtml } from './security.js';
import { buildBackendUrl } from './backend-config.js';
import { isSpreadsheetFilename, parseHighResolutionLoadText, parseInverterEventLogText } from './offgrid-field-import.js';
import { runDatasheetSizing, attachDatasheetSizingHandlers } from './datasheet-sizing.js';
import { buildHourlyProfileEvidence, validateHourlyProfile8760 } from './consumption-evidence.js';
import { initStorageCrypto, isEncryptionAvailable } from './storage-crypto.js';
import { preloadEncryptedState } from './storage.js';
import { getDefaultMapProvider, getGoogleMapsApiKey, getGoogleMapsMapId, MAP_PROVIDER_CONFIG } from './map-provider-config.js';
import { GoogleMapAdapter, createGoogleMarkerFacade, getGhiMarkerColor, loadGoogleMaps, resolveGoogleMapsClasses } from './google-maps-provider.js';
import {
  DEFAULT_COST_PROFILE,
  DEFAULT_FINANCIAL_PROFILE,
  DEFAULT_PANEL_FORM_FACTOR,
  DEFAULT_VAT_PROFILE,
  COST_ASSUMPTIONS,
  getPanelPriceBand,
  resolveFinancialAssumptions
} from './assumptions/index.js';
import {
  ASSUMPTION_UI_DEFAULTS,
  compactManualCostOverrides,
  flatTariffIncreaseCurveFromPercent,
  manualVatRatesFromUi,
  normalizeAssumptionUiState
} from './assumption-ui-state.js';

// ── Global data referansı ────────────────────────────────────────────────────
window._appData = { PANEL_TYPES, PANEL_CATALOG, BATTERY_MODELS, COMPASS_DIRS, INVERTER_TYPES, MONTHS, HEAT_PUMP_DATA, EV_MODELS };


// ── Faz 1 / data-action delegation framework ──────────────────────────────
// Replaces inline onclick/onchange/oninput attributes so the CSP can drop
// 'unsafe-inline' from script-src. Markup pattern:
//   <button data-click-action="goToStep" data-arg="2">İlerle</button>
//   <input  data-input-action="updateConsumption" data-arg-prop="value">
//   <input  data-change-action="onNMToggle" data-arg-prop="checked">
// Handlers are registered via registerActions({...}); F1.B.2 fills the map
// group-by-group as inline attributes are migrated.
const ACTION_HANDLERS = Object.create(null);
function registerActions(map) { Object.assign(ACTION_HANDLERS, map); }
window.registerActions = registerActions;

function dispatchAction(eventType, e) {
  const attr = `data-${eventType}-action`;
  const el = e.target.closest(`[${attr}]`);
  if (!el) return;
  const action = el.getAttribute(attr);
  const handler = ACTION_HANDLERS[action];
  if (!handler) {
    if (!dispatchAction._warned) dispatchAction._warned = new Set();
    if (!dispatchAction._warned.has(action)) {
      console.warn('[data-action] unknown handler:', action, el);
      dispatchAction._warned.add(action);
    }
    return;
  }
  const argProp = el.dataset.argProp;
  const argType = el.dataset.argType;
  const rawArg = argProp === 'value' ? el.value
    : argProp === 'checked' ? el.checked
    : el.dataset.arg !== undefined ? el.dataset.arg
    : undefined;
  let arg;
  if (argType === 'number' && rawArg !== undefined && rawArg !== null) {
    arg = Number(rawArg);
  } else if (argType === 'bool' && rawArg !== undefined && rawArg !== null) {
    arg = (rawArg === true || rawArg === 'true');
  } else if (argType === 'json' && typeof rawArg === 'string') {
    try {
      arg = JSON.parse(rawArg);
    } catch (parseErr) {
      console.warn('[data-action] data-arg JSON parse failed:', action, rawArg, parseErr);
      return;
    }
  } else {
    arg = rawArg;
  }
  handler(arg, el, e);
}

['click', 'change', 'input'].forEach(t =>
  document.addEventListener(t, e => dispatchAction(t, e), false));

function setElementVisible(el, visible, display = '') {
  if (!el) return;
  el.classList.toggle('is-hidden', !visible);
  el.dataset.displayWhenVisible = display || '';
  if (visible) {
    el.removeAttribute('hidden');
  } else {
    el.setAttribute('hidden', '');
  }
}

function isElementVisible(el) {
  return !!el && !el.hidden && !el.classList.contains('is-hidden') && getComputedStyle(el).display !== 'none';
}

window.setElementVisible = setElementVisible;

function installThirdPartyConsoleNoiseGuard() {
  if (window.__solarRotaConsoleNoiseGuardInstalled) return;
  window.__solarRotaConsoleNoiseGuardInstalled = true;
  const isAutofillOverlayNoise = value => {
    const text = String(value?.filename || value?.message || value?.stack || value || '');
    return text.includes('bootstrap-autofill-overlay.js')
      || (text.includes("Failed to execute 'insertBefore'") && text.includes('AutofillInlineMenuContentService'));
  };
  window.addEventListener('error', event => {
    if (isAutofillOverlayNoise(event)) event.preventDefault();
  }, true);
  window.addEventListener('unhandledrejection', event => {
    if (isAutofillOverlayNoise(event.reason)) event.preventDefault();
  }, true);
}

installThirdPartyConsoleNoiseGuard();

// BUG-12 fix: Never fall back to currentDateIso() — a missing sourceDate should be null so
// the governance blocker ("Tarife kaynak kontrol tarihi eksik") fires correctly instead of
// being silently masked by today's date.
const DEFAULT_TARIFF_SOURCE_DATE = TARIFF_META.residential?.sourceDate || null;
const DEFAULT_TARIFF_SOURCE_CHECKED_AT = TARIFF_DATA_LIFECYCLE.sources?.[0]?.checkedDate || DEFAULT_TARIFF_SOURCE_DATE || null;
const DEFAULT_REGULATION_SOURCE_CHECKED_AT = TARIFF_DATA_LIFECYCLE.sources?.[1]?.checkedDate || DEFAULT_TARIFF_SOURCE_CHECKED_AT || null;
const DEFAULT_RESIDENTIAL_TARIFF = DEFAULT_TARIFFS.residential;

function currentLocalDateIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── Para birimi seçici ───────────────────────────────────────────────────────
const CURRENCY_STORAGE_KEY = 'guneshesap_display_currency_v1';

function switchCurrency(currency) {
  if (!['TRY', 'USD'].includes(currency)) return;
  window.state.displayCurrency = currency;
  const selectEl = document.getElementById('display-currency');
  if (selectEl) selectEl.value = currency;
  try { localStorage.setItem(CURRENCY_STORAGE_KEY, currency); } catch { /* ignore */ }
  document.querySelectorAll('[data-currency]').forEach(btn => {
    const isActive = btn.dataset.currency === currency;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  buildPanelCards();
  buildInverterCards();
  updatePanelPreview();
  window.updateTariffAssumptions?.();
  if (window.state.results) window.renderResults?.();
  window.renderExchangeRateStatus?.();
}
window.switchCurrency = switchCurrency;

// ── Ayarlar Paneli & Tema ────────────────────────────────────
let settingsReturnFocus = null;

function openSettings() {
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  if (!panel) return;
  settingsReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setElementVisible(panel, true, 'block');
  setElementVisible(overlay, true, 'block');
  panel.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; });
  syncSettingsPanel();
  setTimeout(() => document.getElementById('settings-close-btn')?.focus(), 120);
}

function closeSettings() {
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  if (!panel) return;
  panel.style.transform = 'translateX(100%)';
  panel.setAttribute('aria-hidden', 'true');
  setElementVisible(overlay, false);
  setTimeout(() => { setElementVisible(panel, false); }, 300);
  if (settingsReturnFocus?.isConnected) settingsReturnFocus.focus();
  settingsReturnFocus = null;
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('guneshesap_theme_v1', theme); } catch {}
  syncSettingsPanel();
}

function initTheme() {
  try {
    const saved = localStorage.getItem('guneshesap_theme_v1');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch {}
}

function syncSettingsPanel() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const darkBtn = document.getElementById('theme-dark-btn');
  const lightBtn = document.getElementById('theme-light-btn');
  if (darkBtn) {
    darkBtn.classList.toggle('active', theme === 'dark');
    darkBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
  if (lightBtn) {
    lightBtn.classList.toggle('active', theme === 'light');
    lightBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
  }
  const lang = window._currentLang || 'tr';
  document.querySelectorAll('#settings-panel .lang-btn').forEach(btn => {
    const isActive = btn.dataset.lang === lang;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  const cur = window.state?.displayCurrency || 'TRY';
  document.querySelectorAll('#settings-panel .currency-btn').forEach(btn => {
    const isActive = btn.dataset.currency === cur;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.setTheme = setTheme;

// ── Etap 4: Step 3 fullscreen draw mode (mobil) ─────────────
function toggleStep3Fullscreen() {
  const next = !document.body.classList.contains('step3-fullscreen');
  document.body.classList.toggle('step3-fullscreen', next);
  // Leaflet harita boyutu yeniden hesaplansın (animasyon bittikten sonra)
  setTimeout(() => { try { window.map?.invalidateSize(); } catch {} }, 360);
  // Android donanım geri tuşu ile çıkış için history state
  try {
    if (next) {
      history.pushState({ step3Fullscreen: true }, '');
    } else if (history.state?.step3Fullscreen) {
      history.back();
    }
  } catch {}
}
window.toggleStep3Fullscreen = toggleStep3Fullscreen;

// popstate listener — Android geri tuşu fullscreen'i kapatır
window.addEventListener('popstate', () => {
  if (document.body.classList.contains('step3-fullscreen')) {
    document.body.classList.remove('step3-fullscreen');
    setTimeout(() => { try { window.map?.invalidateSize(); } catch {} }, 200);
  }
});

// ── Etap 2: Mobil klavye davranışı ───────────────────────────
// Telefon klavyesi açıldığında odaklanan input'un altta kalmamasını sağlar.
// Yalnız dokunmatik cihazlarda çalışır; fareli laptop bozulmaz.
function initMobileKeyboardScroll() {
  if (typeof window.matchMedia !== 'function') return;
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  let scrollTimer = null;
  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const tag = target.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
    // Klavyenin tamamen açılmasını bekle (~280 ms iOS, ~200 ms Android)
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
    }, 320);
  });
}

// İlk yüklemede body[data-step] ve has-bottom-bar set et
function initMobileBottomBarBaseline() {
  document.body.dataset.step = String(window.state?.step || 1);
  document.body.classList.add('has-bottom-bar');
}

// Etap 6: Rotasyon / viewport resize — Leaflet harita boyutunu yeniden hesapla
function initOrientationChangeHandler() {
  let resizeTimer = null;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      try { window.map?.invalidateSize(); } catch {}
      try { window.heatmapMap?.invalidateSize(); } catch {}
    }, 150);
  };
  window.addEventListener('orientationchange', onResize);
  window.addEventListener('resize', onResize);
}

// Etap 6: <img> elemanlarına lazy-load + decoding=async (zaten yoksa)
function initImageLazyLoad() {
  document.querySelectorAll('img').forEach((img) => {
    if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initMobileKeyboardScroll();
    initMobileBottomBarBaseline();
    initOrientationChangeHandler();
    initImageLazyLoad();
  });
} else {
  initMobileKeyboardScroll();
  initMobileBottomBarBaseline();
  initOrientationChangeHandler();
  initImageLazyLoad();
}

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
window.state = {
  step: 1,
  maxUnlockedStep: 1,
  scenarioKey: DEFAULT_SCENARIO_KEY,
  scenarioContext: getScenarioDefinition(DEFAULT_SCENARIO_KEY),
  lat: null, lon: null, cityName: null, ghi: null,
  roofArea: null, tilt: 33, azimuth: 180, azimuthCoeff: 1.00,
  azimuthName: "Güney", shadingFactor: 10,
  panelType: 'mono_perc',
  panelSelectionMode: 'basic',
  panelCatalogId: null,
  panelCatalogTechFilter: 'all',
  panelCatalogSegmentFilter: 'all',
  inverterType: 'string',
  costProfile: DEFAULT_COST_PROFILE,
  panelFormFactor: DEFAULT_PANEL_FORM_FACTOR,
  financialProfile: DEFAULT_FINANCIAL_PROFILE,
  vatProfile: DEFAULT_VAT_PROFILE,
  manualCostMode: 'none',
  manualCostOverrides: null,
  manualVatRates: null,
  results: null,
  enginePreference: 'pvgis-hybrid-js',
  backendEngineAvailable: null,
  backendEngineLastError: null,
  // Çoklu kurulum yüzeyi
  multiRoof: false,
  roofSections: [],
  roofGeometry: null,
  osmShadowEnabled: false,
  osmShadow: null,
  satelliteEnhancementEnabled: false,
  satelliteEnhancement: null,
  glareTargets: [],
  glareAnalysis: null,
  // Tüketim & BESS
  dailyConsumption: 10,
  batteryEnabled: false,
  battery: { model: 'huawei_luna15', capacity: 15.0, dod: 1.00, efficiency: 0.95, chemistry: 'LFP', warranty: 10, cycles: 5000 },
  // Saatlik mahsuplaşma / şebeke ihracatı
  netMeteringEnabled: false,
  usdToTry: 38.5,
  displayCurrency: 'TRY',
  exchangeRate: null,
  // Tarife
  tariff: DEFAULT_RESIDENTIAL_TARIFF,
  importTariffBase: DEFAULT_RESIDENTIAL_TARIFF,
  tariffType: 'residential',
  subscriberType: 'residential',
  connectionType: 'trifaze',
  usageProfile: 'balanced',
  annualConsumptionKwh: null,
  onGridMonthlyConsumptionKwh: null,
  onGridMonthlyBillEstimate: null,
  onGridInputMode: 'basic',
  designTarget: 'fill-roof',
  roofType: 'flat-concrete',
  usableRoofRatio: 0.75,
  shadingQuality: 'user-estimate',
  distributionFee: 0,
  tariffInputMode: 'net-plus-fee',
  tariffSourceType: 'official',
  costSourceType: 'catalog',
  hourlyProfileSource: 'synthetic',
  tariffMode: 'auto',
  tariffRegime: 'auto',
  exportSettlementMode: 'auto',
  settlementDate: currentLocalDateIso(),
  previousYearConsumptionKwh: null,
  currentYearConsumptionKwh: null,
  sellableExportCapKwh: null,
  expenseEscalationRate: 0.15,
  contractedPowerKw: 10,
  contractedTariff: DEFAULT_RESIDENTIAL_TARIFF,
  skttTariff: DEFAULT_RESIDENTIAL_TARIFF,
  exportTariff: 2.27,
  customTariffIncreaseCurve: null,
  customDiscountRate: null,
  tariffIncludesTax: true,
  tariffSourceDate: DEFAULT_TARIFF_SOURCE_DATE,
  tariffSourceCheckedAt: currentLocalDateIso(),
  // Kirlenme
  soilingFactor: 3,
  // Bakım & İşletme
  omEnabled: true,
  omRate: 1.2,
  insuranceRate: 0.5,
  evidence: {
    customerBill: { type: 'customerBill', status: 'missing', ref: '', checkedAt: null },
    supplierQuote: { type: 'supplierQuote', status: 'missing', ref: '', issuedAt: null, validUntil: null },
    tariffSource: { type: 'tariffSource', status: 'verified', ref: APRIL_2026_TARIFF_SOURCE.evidenceRef, checkedAt: currentLocalDateIso(), sourceUrl: APRIL_2026_TARIFF_SOURCE.sourceUrl },
    regulationSource: { type: 'regulationSource', status: 'verified', ref: TURKEY_REGULATORY_VERSION, checkedAt: DEFAULT_REGULATION_SOURCE_CHECKED_AT, sourceUrl: 'https://www.epdk.gov.tr/detay/icerik/3-0-0-1160/elektrik-piyasasinda-lisanssiz-elektrik-uretimi-' },
    gridApplication: { type: 'gridApplication', status: 'missing', ref: '', checkedAt: null },
    offgridPvProduction: { type: 'offgridPvProduction', status: 'missing', ref: '', checkedAt: null },
    offgridLoadProfile: { type: 'offgridLoadProfile', status: 'missing', ref: '', checkedAt: null },
    offgridCriticalLoadProfile: { type: 'offgridCriticalLoadProfile', status: 'missing', ref: '', checkedAt: null },
    offgridHighResLoadProfile: { type: 'offgridHighResLoadProfile', status: 'missing', ref: '', checkedAt: null },
    offgridInverterEventLog: { type: 'offgridInverterEventLog', status: 'missing', ref: '', checkedAt: null },
    offgridSiteShading: { type: 'offgridSiteShading', status: 'missing', ref: '', checkedAt: null },
    offgridEquipmentDatasheets: { type: 'offgridEquipmentDatasheets', status: 'missing', ref: '', checkedAt: null },
    offgridCommissioningReport: { type: 'offgridCommissioningReport', status: 'missing', ref: '', checkedAt: null },
    offgridAcceptanceTest: { type: 'offgridAcceptanceTest', status: 'missing', ref: '', checkedAt: null },
    offgridMonitoringCalibration: { type: 'offgridMonitoringCalibration', status: 'missing', ref: '', checkedAt: null },
    offgridAsBuiltDocs: { type: 'offgridAsBuiltDocs', status: 'missing', ref: '', checkedAt: null },
    offgridWarrantyOandM: { type: 'offgridWarrantyOandM', status: 'missing', ref: '', checkedAt: null },
    offgridTelemetry30Day: { type: 'offgridTelemetry30Day', status: 'missing', ref: '', checkedAt: null },
    offgridPerformanceBaseline: { type: 'offgridPerformanceBaseline', status: 'missing', ref: '', checkedAt: null },
    offgridMaintenanceLog: { type: 'offgridMaintenanceLog', status: 'missing', ref: '', checkedAt: null },
    offgridIncidentLog: { type: 'offgridIncidentLog', status: 'missing', ref: '', checkedAt: null },
    offgridRemoteMonitoringSla: { type: 'offgridRemoteMonitoringSla', status: 'missing', ref: '', checkedAt: null },
    offgridAnnualRevalidation: { type: 'offgridAnnualRevalidation', status: 'missing', ref: '', checkedAt: null },
    offgridBatteryHealthReport: { type: 'offgridBatteryHealthReport', status: 'missing', ref: '', checkedAt: null },
    offgridGeneratorServiceRecord: { type: 'offgridGeneratorServiceRecord', status: 'missing', ref: '', checkedAt: null },
    offgridFirmwareSettingsBackup: { type: 'offgridFirmwareSettingsBackup', status: 'missing', ref: '', checkedAt: null },
    offgridCustomerSignoff: { type: 'offgridCustomerSignoff', status: 'missing', ref: '', checkedAt: null }
  },
  financing: {
    principal: null,
    downPayment: 0,
    annualRate: 0.35,
    termYears: 5
  },
  maintenanceContract: {
    baseRate: 0.015,
    escalationRate: 0.10,
    includeMonitoring: true,
    includeCleaning: true,
    contractStatus: 'not-offered'
  },
  gridApplicationChecklist: null,
  proposalApproval: {
    state: 'draft',
    approvedBy: '',
    approvedAt: null,
    updatedBy: 'local-user',
    approvalRecord: null,
    history: []
  },
  proposalRevisions: [],
  userIdentity: {
    id: 'local-sales',
    name: 'local-user',
    role: 'sales'
  },
  auditLog: [],
  // Faz B
  billAnalysisEnabled: false,
  monthlyConsumption: null,
  // Faz C
  evEnabled: false,
  ev: null,
  heatPumpEnabled: false,
  heatPump: null,
  // Faz D
  taxEnabled: false,
  tax: null,
  // Off-grid: effective cost per kWh replaced by solar (diesel/generator proxy).
  // When null, calc-engine.js uses tariff × 2.5 as a conservative default.
  offGridCostPerKwh: null,
  // Faz-3: Ground albedo for bifacial rear-side gain correction (0.20 = default sand/grass).
  groundAlbedo: 0.20,
  // Faz-3: Annual load growth rate for self-consumption projection (default 0 = static load).
  annualLoadGrowth: 0,
  hasSignedCustomerBillData: false,
  quoteInputsVerified: false,
  quoteReadyApproved: false,
  // Off-Grid Level 2 ayarları
  offgridDevices: [],
  offgridCalculationMode: 'basic',
  offgridLoadProfileKey: 'family-home',
  offgridCriticalFraction: 0.45,
  offgridAutonomyGoal: 'reliability',
  offgridGeneratorEnabled: false,
  offgridGeneratorKw: 5,
  offgridGeneratorFuelCostPerKwh: 8,
  offgridGeneratorCapexTry: 0,
  offgridGeneratorStrategy: 'critical-backup',
  offgridGeneratorFuelType: 'diesel',
  offgridGeneratorSizePreset: 'auto',
  offgridGeneratorReservePct: 20,
  offgridGeneratorStartSocPct: 25,
  offgridGeneratorStopSocPct: 40,
  offgridGeneratorMaxHoursPerDay: 8,
  offgridGeneratorMinLoadRatePct: 30,
  offgridGeneratorChargeBatteryEnabled: false,
  offgridGeneratorMaintenanceCostTry: 0,
  offgridGeneratorOverhaulHours: 18000,
  offgridGeneratorOverhaulCostTry: 0,
  offgridBadWeatherLevel: '',
  offgridPvHourly8760: null,
  offgridPvHourlySource: '',
  offgridCriticalLoad8760: null,
  offgridFieldImports: {
    highResolutionLoad: null,
    criticalHighResolutionLoad: null,
    inverterEventLog: null
  },
  offgridFieldGuaranteeMode: false,
  offgridBatteryMaxChargeKw: null,
  offgridBatteryMaxDischargeKw: null,
  offgridBatteryReservePct: null,
  offgridBatteryChargeEfficiencyPct: null,
  offgridBatteryDischargeEfficiencyPct: null,
  offgridBatteryEolCapacityPct: null,
  offgridBatteryEolEfficiencyLossPct: null,
  offgridBatteryReplacementFractionPct: null,
  offgridAutonomyThresholdPct: 1,
  offgridInverterAcKw: null,
  offgridInverterSurgeMultiplier: 1.25
};

function getApril2026TariffProfile(type = 'residential') {
  return APRIL_2026_TARIFF_PROFILES[type] || APRIL_2026_TARIFF_PROFILES.residential;
}

function applyApril2026TariffProfile(targetState = window.state, type = targetState?.tariffType || 'residential') {
  if (!targetState || type === 'custom') return null;
  const profile = getApril2026TariffProfile(type);
  const today = currentLocalDateIso();
  targetState.tariffType = type;
  targetState.tariff = profile.pst;
  targetState.importTariffBase = profile.pst;
  targetState.skttTariff = profile.sktt;
  targetState.contractedTariff = profile.contracted;
  targetState.exportTariff = profile.export;
  targetState.distributionFee = profile.distributionFee;
  targetState.tariffInputMode = 'net-plus-fee';
  targetState.tariffSourceType = 'official';
  targetState.tariffSourceDate = APRIL_2026_TARIFF_SOURCE.sourceDate;
  targetState.tariffSourceCheckedAt = today;
  targetState.tariffIncludesTax = true;
  targetState.settlementDate = targetState.settlementDate || today;
  targetState.evidence = {
    ...(targetState.evidence || {}),
    tariffSource: {
      ...(targetState.evidence?.tariffSource || {}),
      type: 'tariffSource',
      status: 'verified',
      ref: APRIL_2026_TARIFF_SOURCE.evidenceRef,
      checkedAt: today,
      sourceUrl: APRIL_2026_TARIFF_SOURCE.sourceUrl
    }
  };
  return profile;
}

const persistedProposal = !window.location.hash ? loadProposalState() : null;
let assumptionMigrationNoticePending = false;
function migrateLegacyAssumptions(state = {}, persistedState = {}) {
  const legacyAnnual = persistedState.annualPriceIncrease;
  const legacyDiscount = persistedState.discountRate;
  const hasLegacyAnnual = legacyAnnual !== undefined && legacyAnnual !== null && legacyAnnual !== '';
  const hasLegacyDiscount = legacyDiscount !== undefined && legacyDiscount !== null && legacyDiscount !== '';
  if (!hasLegacyAnnual && !hasLegacyDiscount) return false;
  state.financialProfile = 'custom';
  if (hasLegacyAnnual && !Array.isArray(state.customTariffIncreaseCurve)) {
    const rate = Math.max(-0.5, Math.min(2, Number(legacyAnnual) || 0));
    state.customTariffIncreaseCurve = [{ fromYear: 1, toYear: 25, rate }];
  }
  if (hasLegacyDiscount && state.customDiscountRate == null) {
    state.customDiscountRate = Math.max(0, Number(legacyDiscount) || 0);
  }
  delete state.annualPriceIncrease;
  delete state.discountRate;
  return true;
}
if (persistedProposal?.state) {
  Object.assign(window.state, persistedProposal.state, { results: null, step: 1 });
  assumptionMigrationNoticePending = migrateLegacyAssumptions(window.state, persistedProposal.state);
  Object.assign(window.state, normalizeAssumptionUiState(window.state));
  if (window.state.enginePreference === 'auto' && window.GUNESHESAP_ENABLE_BACKEND_AUTO !== true) {
    window.state.enginePreference = 'pvgis-hybrid-js';
  }
}
Object.assign(window.state, normalizeAssumptionUiState(window.state));
applyApril2026TariffProfile(window.state, window.state.tariffType || 'residential');

function persistState() {
  saveProposalState(window.state);
}

function currentUser() {
  window.state.userIdentity = normalizeUserIdentity(window.state.userIdentity || {});
  return window.state.userIdentity;
}

function auditAndPersist(action, details = {}) {
  appendAuditEntry(window.state, action, details, currentUser());
  persistState();
}

// ═══════════════════════════════════════════════════════════
// MAP INIT
// ═══════════════════════════════════════════════════════════
let map, marker;
window.map = null;
window.marker = null;
window._drawingMode = false;
window._glarePickMode = false;
window._mapProvider = null;
window._mapFallbackMode = null;
window._activeTileLayer = 'google-roadmap';
window._cartoTilesDisabled = false;

function syncHeaderHeightVar() {
  const header = document.getElementById('app-header');
  if (!header) return;
  document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
}
window.syncHeaderHeightVar = syncHeaderHeightVar;

function setMapProviderNotice(message = '', tone = 'warning') {
  const container = document.getElementById('map');
  if (!container) return;
  let notice = document.getElementById('map-provider-notice');
  if (!message) {
    if (notice) notice.remove();
    return;
  }
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'map-provider-notice';
    notice.className = 'map-provider-notice';
    container.appendChild(notice);
  }
  notice.dataset.tone = tone;
  notice.textContent = message;
}

function clearMapFallbackUi(container = document.getElementById('map')) {
  if (!container) return;
  container.querySelectorAll('.map-manual-fallback').forEach(el => el.remove());
  container.classList.remove('map-error', 'map-unavailable', 'fallback-active', 'manual-coordinate-fallback');
  document.getElementById('map-card')?.classList.remove('map-error', 'map-unavailable', 'fallback-active', 'manual-coordinate-fallback');
  setMapProviderNotice('', 'info');
}

function applyGoogleMapSuccessState(container = document.getElementById('map')) {
  clearMapFallbackUi(container);
  container?.classList.add('map-provider-google');
  window._mapFallbackMode = null;
  console.debug?.('[map-provider] Google map success state applied');
}

function isMapContainerReady(container) {
  if (!container?.getBoundingClientRect) return false;
  const rect = container.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function googleMapFailureMessage(err) {
  const message = String(err?.message || err || '');
  if (message.includes('missing-api-key')) {
    return 'Google Maps API anahtarı yapılandırılmamış. Manuel koordinat girişiyle devam edebilirsiniz.';
  }
  if (message.includes('RefererNotAllowed') || message.includes('ApiNotActivated') || message.includes('InvalidKey') || message.includes('auth')) {
    return 'Google Maps bu ortamda yetkilendirilemedi. Lütfen domain ve API key ayarlarını kontrol edin.';
  }
  return 'Google Maps yüklenemedi. Koordinatı manuel girebilir veya basit harita moduyla devam edebilirsiniz.';
}

async function initGoogleMap() {
  const container = document.getElementById('map');
  if (!container) throw new Error('map-container-missing');
  if (window._googleMapAdapter) {
    applyGoogleMapSuccessState(container);
    setTimeout(() => window._googleMapAdapter?.invalidateSize?.(), 80);
    return window._googleMapAdapter;
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) throw new Error('missing-api-key');
  console.debug?.('[map-provider] Google key found');
  console.debug?.('[map-provider] loading Google Maps script');
  const maps = await loadGoogleMaps(apiKey);
  if (!maps) throw new Error('google-maps-unavailable');
  const { MapCtor, AdvancedMarkerCtor, MarkerCtor, PolygonCtor, PolylineCtor, SymbolPath, eventApi } = await resolveGoogleMapsClasses(window.google);
  console.debug?.('[map-provider] Google script loaded');
  console.debug?.('[map-provider] Google map container found');

  const center = (window.state?.lat && window.state?.lon)
    ? { lat: Number(window.state.lat), lng: Number(window.state.lon) }
    : { lat: 39.0, lng: 35.0 };
  const zoom = window.state?.lat && window.state?.lon ? 9 : 6;
  const safeGetGhiColor = typeof getGHIColor === 'function' ? getGHIColor : fallbackGHIColor;
  const mapId = getGoogleMapsMapId();
  const adapter = new GoogleMapAdapter({
    container,
    MapCtor,
    AdvancedMarkerCtor,
    MarkerCtor,
    PolygonCtor,
    PolylineCtor,
    SymbolPath,
    eventApi,
    center,
    zoom,
    mapId,
    cities: TURKISH_CITIES,
    getGhiColor: safeGetGhiColor,
    onRoofPolygonsChange: (polygons, reason) => {
      const summary = syncRoofPolygonsToState(polygons);
      if (summary && reason === 'complete') {
        showToast(`Kurulum alanı çizildi: ${summary.areaM2.toFixed(1)} m² · ${summary.azimuthName} (${Math.round(summary.azimuth)}°)`, 'success');
      } else if (summary && reason === 'edit') {
        showToast('Kurulum alanı düzenlendi, alan güncellendi.', 'info');
      } else if (!summary && reason === 'clear') {
        showToast('Kurulum alanı çizimleri temizlendi.', 'info');
      }
    },
    onLocationSelect: (lat, lng, checkBounds) => selectLocationFromLatLon(lat, lng, checkBounds)
  });

  window._googleMapAdapter = adapter;
  map = adapter;
  marker = createGoogleMarkerFacade(adapter);
  window.map = map;
  window.marker = marker;
  window._mapProvider = 'google';
  window._activeTileLayer = 'google-satellite';
  applyGoogleMapSuccessState(container);
  console.debug?.('[map-provider] Google map instance created');
  syncMapLayerButton();
  if (window.state?.lat && window.state?.lon) marker.setLatLng([window.state.lat, window.state.lon]);
  if (window.state?.roofGeometry) adapter.loadRoofGeometry(window.state.roofGeometry);
  setTimeout(() => map.invalidateSize(), 100);
  setTimeout(() => map.invalidateSize(), 600);
  return adapter;
}

function initManualCoordinateFallback(message) {
  window._mapProvider = MAP_PROVIDER_CONFIG.fallback;
  window._mapFallbackMode = 'manualCoordinate';
  const container = document.getElementById('map');
  if (container) {
    container.classList.remove('map-provider-google');
    container.classList.add('manual-coordinate-fallback', 'fallback-active');
    document.getElementById('map-card')?.classList.add('manual-coordinate-fallback', 'fallback-active');
  }
  const existingFallback = container?.querySelector('.map-manual-fallback');
  if (existingFallback) {
    const text = existingFallback.querySelector('span');
    if (text) text.textContent = message || 'Google Maps yüklenemedi. Koordinatı manuel girebilir veya basit harita moduyla devam edebilirsiniz.';
  } else if (container) {
    const fallback = document.createElement('div');
    fallback.className = 'map-manual-fallback';
    fallback.innerHTML = `
      <strong>Harita kullanılamıyor</strong>
      <span>${escapeHtml(message || 'Google Maps yüklenemedi. Koordinatı manuel girebilir veya basit harita moduyla devam edebilirsiniz.')}</span>
    `;
    container.appendChild(fallback);
  }
  setMapProviderNotice(message, 'warning');
  syncMapLayerButton();
}

async function initMap() {
  if (map) {
    if (window._mapProvider === 'google') applyGoogleMapSuccessState(document.getElementById('map'));
    return map;
  }
  const provider = getDefaultMapProvider();
  if (provider === 'google') {
    try {
      return await initGoogleMap();
    } catch (err) {
      const message = googleMapFailureMessage(err);
      console.warn('[map-provider] Google Maps fallback:', err);
      initManualCoordinateFallback(message);
      return null;
    }
  }
  return initLeafletMap();
}

function initLeafletMap() {
  // Etap 4: Mobil dokunmatik optimizasyon
  map = L.map('map', {
    zoomControl: true,
    tap: true,
    tapTolerance: 20,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    bounceAtZoomLimits: false
  }).setView([39.0, 35.0], 6);
  window.map = map;
  window._mapProvider = 'leaflet';

  // ── Tile katmanları ──────────────────────────────────────
  const darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd', maxZoom: 19, crossOrigin: 'anonymous'
  });

  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19, maxNativeZoom: 18
  });

  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19, crossOrigin: 'anonymous'
  });

  let baseLayerControl = null;

  darkLayer.on('tileerror', () => {
    if (window._cartoFallbackApplied || window._cartoTilesDisabled) return;
    window._cartoFallbackApplied = true;
    window._cartoTilesDisabled = true;
    clearTimeout(window._tileErrorToastTimer);
    window._tileErrorToastTimer = setTimeout(() => {
      try {
        if (map.hasLayer(darkLayer)) {
          map.removeLayer(darkLayer);
        }
        baseLayerControl?.removeLayer(darkLayer);
        window._darkLayer = null;
        if (!map.hasLayer(osmLayer)) osmLayer.addTo(map);
        window._activeTileLayer = 'osm';
        syncMapLayerButton();
      } catch { /* tile fallback is best-effort */ }
      window.showToast?.('Harita altlığı geçici olarak yüklenemedi; OpenStreetMap altlığına geçildi.', 'warning');
    }, 1200);
  });

  satelliteLayer.on('tileerror', () => {
    clearTimeout(window._tileErrorToastTimer);
    window._tileErrorToastTimer = setTimeout(() => {
      window.showToast?.('Bazı uydu karoları yüklenemedi. Zoom seviyesini düşürün.', 'warning');
    }, 1200);
  });

  // Leaflet fallback init sırasında OSM/Carto public tile istekleri başlatılmaz.
  // Uydu altlığı eski poligon çizimi için kullanılır; OSM/Carto sadece kullanıcı
  // layer seçerse devreye girer.
  satelliteLayer.addTo(map);
  window._darkLayer = darkLayer;
  window._satelliteLayer = satelliteLayer;
  window._osmLayer = osmLayer;
  window._activeTileLayer = 'satellite';

  // ── Layer control ────────────────────────────────────────
  baseLayerControl = L.control.layers({
    'OpenStreetMap': osmLayer,
    'Koyu (Genel)': darkLayer,
    'Uydu (Kurulum Alanı Çizimi İçin)': satelliteLayer
  }, {}, { position: 'bottomleft', collapsed: false }).addTo(map);
  window._baseLayerControl = baseLayerControl;

  // Layer değişimi izle
  map.on('baselayerchange', e => {
    const name = e.name;
    if (name.includes('Koyu') && window._cartoTilesDisabled) {
      try {
        map.removeLayer(darkLayer);
        if (!map.hasLayer(osmLayer)) osmLayer.addTo(map);
      } catch { /* layer fallback is best-effort */ }
      window._activeTileLayer = 'osm';
      syncMapLayerButton();
      return;
    }
    if (name.includes('Uydu')) {
      window._activeTileLayer = 'satellite';
    } else if (name.includes('OSM') || name.includes('Open')) {
      window._activeTileLayer = 'osm';
    } else {
      window._activeTileLayer = 'dark';
    }
    syncMapLayerButton();
  });

  // ── Şehir işaretçileri ──────────────────────────────────
  TURKISH_CITIES.forEach(city => {
    const color = getGHIColor(city.ghi);
    L.circleMarker([city.lat, city.lon], {
      radius: 5, fillColor: color, color: '#fff',
      weight: 0.5, opacity: 0.8, fillOpacity: 0.75
    }).addTo(map).bindTooltip(`${city.name} — GHI: ${city.ghi} kWh/m²/yıl`);
  });

  // ── Konum işaretçisi ────────────────────────────────────
  const markerIcon = L.divIcon({
    html: `<div class="city-marker-rozet"></div>`,
    className: '', iconSize: [22, 22], iconAnchor: [11, 11]
  });
  marker = L.marker([39.0, 35.0], { icon: markerIcon, draggable: true }).addTo(map);
  window.marker = marker;

  marker.on('dragend', e => {
    if (window._drawingMode || window._glarePickMode) return;
    const ll = e.target.getLatLng();
    selectLocationFromLatLon(ll.lat, ll.lng, true);
  });

  // ── Map click — çizim/glare modunda konum değiştirme ──
  map.on('click', e => {
    if (window._drawingMode || window._glarePickMode) return;
    selectLocationFromLatLon(e.latlng.lat, e.latlng.lng, true);
  });

  initRoofDrawing(map);
  syncMapLayerButton();

  // invalidateSize — birden fazla noktada
  setTimeout(() => map.invalidateSize(), 100);
  setTimeout(() => map.invalidateSize(), 600);
  setTimeout(() => map.invalidateSize(), 1500);
  return map;
}

// ── Harita katmanı toggle butonu ────────────────────────
function toggleMapLayer() {
  if (!window.map) return;
  if (window._mapProvider === 'google' && window._googleMapAdapter) {
    const isSatellite = window._googleMapAdapter.getMapType() === 'hybrid';
    window._googleMapAdapter.setMapType(isSatellite ? 'roadmap' : 'hybrid');
    window._activeTileLayer = isSatellite ? 'google-roadmap' : 'google-satellite';
    document.getElementById('map-satellite-btn')?.classList.toggle('active', !isSatellite);
    syncMapLayerButton();
    return;
  }
  const current = window._activeTileLayer;
  if (current === 'satellite') {
    window._satelliteLayer.remove();
    window._osmLayer.addTo(window.map);
    window._activeTileLayer = 'osm';
    document.getElementById('map-satellite-btn')?.classList.remove('active');
  } else {
    window._osmLayer.remove();
    window._satelliteLayer.addTo(window.map);
    window._activeTileLayer = 'satellite';
    document.getElementById('map-satellite-btn')?.classList.add('active');
  }
  syncMapLayerButton();
}
window.toggleMapLayer = toggleMapLayer;

function syncMapLayerButton() {
  const lbl = document.getElementById('map-layer-label');
  if (!lbl) return;
  if (window._mapFallbackMode === 'manualCoordinate') {
    lbl.textContent = 'Manuel koordinat';
    return;
  }
  if (window._mapProvider === 'google') {
    lbl.textContent = window._activeTileLayer === 'google-satellite'
      ? 'Harita'
      : 'Uydu';
    return;
  }
  lbl.textContent = window._activeTileLayer === 'satellite'
    ? i18n.t('step2.darkMapLabel')
    : i18n.t('step2.satelliteMapLabel');
}
window.syncMapLayerButton = syncMapLayerButton;

function getGHIColor(ghi) {
  return getGhiMarkerColor(ghi);
}

function fallbackGHIColor(ghi) {
  const value = Number(ghi);
  if (!Number.isFinite(value)) return '#F59E0B';
  return getGHIColor(value);
}

function stripInlineSvgStyles(svg = '') {
  return String(svg).replace(/<style[\s\S]*?<\/style>/gi, '');
}

function geolocationIconSvg() {
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
}

function ghiIconSvg() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
}

function setGeolocationButton(loading = false) {
  const btn = document.getElementById('geolocation-btn');
  if (!btn) return;
  btn.disabled = !!loading;
  const label = loading ? i18n.t('step2.geoLoading') : i18n.t('step2.geoBtn');
  btn.innerHTML = `${geolocationIconSvg()} <span class="step2-geo-label">${label}</span>`;
}

function setLocationBottomCard(cityName, lat, lon, ghi) {
  const card = document.getElementById('location-bottom-card');
  if (!card) return;
  const cityEl = document.getElementById('loc-bottom-city');
  const coordsEl = document.getElementById('loc-bottom-coords');
  const ghiEl = document.getElementById('loc-bottom-ghi');
  if (cityEl) cityEl.textContent = cityName || i18n.t('step2.locationSelected');
  if (coordsEl && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
    coordsEl.textContent = `${Number(lat).toFixed(4)}°K, ${Number(lon).toFixed(4)}°D`;
  }
  if (ghiEl && !document.getElementById('loc-bottom-ghi-val')) {
    ghiEl.innerHTML = `${ghiIconSvg()} <span id="loc-bottom-ghi-val">— kWh/m²/yıl</span>`;
  }
  const ghiVal = document.getElementById('loc-bottom-ghi-val');
  if (ghiVal) ghiVal.textContent = `${ghi ?? '—'} kWh/m²/yıl`;
  card.classList.add('visible');
}

function setLocationWarningVisible(visible) {
  const warnEl = document.getElementById('location-warning');
  if (warnEl) warnEl.classList.toggle('location-warning-visible', !!visible);
}

function selectLocationFromLatLon(lat, lon, checkBounds) {
  if (checkBounds && !isInTurkey(lat, lon)) {
    setLocationWarningVisible(true);
    if (marker && window.state.lat && window.state.lon) {
      marker.setLatLng([window.state.lat, window.state.lon]);
    }
    return;
  }
  setLocationWarningVisible(false);
  window.state.lat = lat; window.state.lon = lon;
  if (marker) marker.setLatLng([lat, lon]);
  let nearest = null, minDist = Infinity;
  TURKISH_CITIES.forEach(c => {
    const d = Math.hypot(c.lat - lat, c.lon - lon);
    if (d < minDist) { minDist = d; nearest = c; }
  });
  const locText = document.getElementById('selected-loc-text');
  if (nearest) {
    window.state.cityName = nearest.name;
    window.state.ghi = nearest.ghi;
    const cityInput = document.getElementById('city-search');
    if (cityInput) cityInput.value = nearest.name;
    if (locText) {
      locText.textContent = `${nearest.name} — ${lat.toFixed(4)}°K, ${lon.toFixed(4)}°D (GHI: ${nearest.ghi})`;
    }
    setLocationBottomCard(nearest.name, lat, lon, nearest.ghi);
  } else if (locText) {
    locText.textContent = `${lat.toFixed(4)}°K, ${lon.toFixed(4)}°D`;
  }
  if (window.state.osmShadowEnabled) refreshOSMShadowAnalysis();
}

function isInTurkey(lat, lon) {
  return isLocationInTurkey(lat, lon);
}

function setAutocompleteOpen(open) {
  const list = document.getElementById('autocomplete-list');
  const input = document.getElementById('city-search');
  if (list) list.classList.toggle('open', !!open);
  if (input) input.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function setStepInlineAlert(step, message = '') {
  const pane = document.getElementById(`step-${step}`);
  const heading = pane?.querySelector('.step-heading');
  if (!heading) return;
  let alert = document.getElementById(`step-${step}-inline-alert`);
  if (!message) {
    if (alert) alert.remove();
    return;
  }
  if (!alert) {
    alert = document.createElement('div');
    alert.id = `step-${step}-inline-alert`;
    alert.className = 'step-inline-alert';
    heading.appendChild(alert);
  }
  alert.innerHTML = `<strong>Bu adımdan devam edilemiyor</strong><span>${escapeHtml(message)}</span>`;
}

function clearStepInlineAlert(step) {
  setStepInlineAlert(step, '');
}

function createAutocompleteItem({ title, subtitle = '', meta = '', onSelect }) {
  const item = document.createElement('div');
  item.className = 'autocomplete-item';
  item.setAttribute('role', 'option');
  item.setAttribute('aria-selected', 'false');
  item.innerHTML = `
    <span class="autocomplete-copy">
      <strong>${escapeHtml(title)}</strong>
      ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}
    </span>
    ${meta ? `<span class="autocomplete-ghi">${escapeHtml(meta)}</span>` : ''}
  `;
  item.addEventListener('mousedown', event => {
    event.preventDefault();
    onSelect?.();
  });
  return item;
}

function formatNominatimResult(result) {
  const address = result?.address || {};
  const titleBase = address.road
    || address.pedestrian
    || address.footway
    || address.path
    || address.residential
    || address.neighbourhood
    || address.suburb
    || address.quarter
    || address.village
    || address.town
    || address.city
    || result?.namedetails?.name
    || String(result?.display_name || '').split(',')[0]?.trim()
    || 'Adres';
  const title = [titleBase, address.house_number].filter(Boolean).join(' ');
  const subtitleParts = [
    address.neighbourhood || address.suburb || address.quarter,
    address.city_district || address.town || address.county || address.state_district,
    address.city || address.state
  ].filter(Boolean);
  const subtitle = [...new Set(subtitleParts)].join(' · ')
    || String(result?.display_name || '').split(',').slice(1, 4).map(v => v.trim()).filter(Boolean).join(' · ');
  return { title, subtitle };
}

// ═══════════════════════════════════════════════════════════
// AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════
let acIndex = -1;
let lastTariffAuditSnapshot = null;
document.addEventListener('DOMContentLoaded', () => {
  // Faz 2 güvenlik: Şifreleme başlat ve önceki şifreli payload'ı önbelleğe al.
  // initStorageCrypto → CryptoKey türet; preloadEncryptedState → hassas alanları çöz.
  // Her ikisi de async fire-and-forget; UI akışını bloklamaz.
  (async () => {
    try {
      await initStorageCrypto(
        (typeof window !== 'undefined' && window.SOLARROTA_STORAGE_SALT) || ''
      );
      await preloadEncryptedState();
    } catch { /* crypto hatası → plain fallback aktif kalır */ }
  })();

  syncHeaderHeightVar();
  window.addEventListener('resize', syncHeaderHeightVar);
  // Harita sağlayıcısı step 2/3'e girildiğinde lazy-load edilir. İlk açılışta
  // OSM/Carto tile veya Google Maps script isteği başlatmayız.
  buildPanelCards();
  buildCompass();
  buildInverterCards();
  loadFromHash();
  syncMultiRoofUi();
  syncEnterpriseInputsFromState();
  syncAssumptionControlsFromState();
  initScenarioExperience();
  updateProgressBar();
  updateDashboard();

  // Wire up tariff visual tabs
  document.querySelectorAll('#tariff-tabs-visual .tariff-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tariff-tabs-visual .tariff-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tariffType = btn.dataset.tariff;
      const sel = document.getElementById('tariff-type');
      if (sel) sel.value = tariffType;
      updateTariffType(tariffType);
    });
  });

  const input = document.getElementById('city-search');
  const list = document.getElementById('autocomplete-list');

  let _nominatimTimer = null;

  if (input && list) {
    input.addEventListener('input', () => {
      const q = input.value.trim();
      const qLow = q.toLowerCase();
      list.innerHTML = '';
      acIndex = -1;
      if (q.length < 1) { setAutocompleteOpen(false); return; }
      const matches = TURKISH_CITIES.filter(c => c.name.toLowerCase().includes(qLow)).slice(0, 5);
      matches.forEach(c => {
        const item = createAutocompleteItem({
          title: c.name,
          subtitle: i18n.t('step2.quickPickLabel'),
          meta: `${c.ghi} kWh/m²`,
          onSelect: () => selectCity(c)
        });
        list.appendChild(item);
      });
      if (list.children.length) setAutocompleteOpen(true);
      // Nominatim geocoding for street/neighborhood search
      if (_nominatimTimer) clearTimeout(_nominatimTimer);
      if (q.length >= 3) {
        _nominatimTimer = setTimeout(() => _fetchNominatim(q, qLow, list), 320);
      }
    });

    input.addEventListener('keydown', e => {
      const items = list.querySelectorAll('.autocomplete-item');
      if (e.key === 'ArrowDown') { acIndex = Math.min(acIndex+1, items.length-1); highlightAC(items); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { acIndex = Math.max(acIndex-1, -1); highlightAC(items); e.preventDefault(); }
      else if (e.key === 'Enter' && items.length) {
        const targetIndex = acIndex >= 0 ? acIndex : 0;
        items[targetIndex].dispatchEvent(new Event('mousedown'));
        e.preventDefault();
      }
      else if (e.key === 'Escape') { setAutocompleteOpen(false); }
    });
  }
  document.addEventListener('click', e => {
    if (!e.target.closest('.input-wrap')) {
      setAutocompleteOpen(false);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (isElementVisible(document.getElementById('settings-panel'))) closeSettings();
    if (document.getElementById('comparison-modal')?.style.display !== 'none') closeComparison();
    if (document.getElementById('dashboard-modal')?.style.display !== 'none') closeDashboard();
  });

  document.querySelectorAll('#step-3 input[type=number]').forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); validateStep3(); }
    });
  });

  const roofAreaInput = document.getElementById('roof-area');
  if (roofAreaInput) {
    roofAreaInput.addEventListener('input', () => {
      const value = parseFloat(roofAreaInput.value);
      if (!roofAreaInput.value || (Number.isFinite(value) && value >= 10 && value <= 2000)) {
        syncRoofAreaValidationUi(false);
        clearStepInlineAlert(3);
      } else if (roofAreaInput.classList.contains('error')) {
        syncRoofAreaValidationUi(true);
      }
    });
  }

  enhanceTooltipAccessibility();
  if (assumptionMigrationNoticePending) {
    showToast('Maliyet ve finans varsayımları yeni 2026-Q2 modeline taşındı. Eski özel tarife/iskonto değerleriniz custom profil olarak korundu.', 'info');
  }

  // i18n başlat
  i18n.init().catch(() => {});
  initExchangeRateService().catch(() => {}).then(() => {
    // Para birimi tercihini localStorage'dan geri yükle
    try {
      const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (saved === 'TRY' || saved === 'USD') switchCurrency(saved);
    } catch { /* ignore */ }
  });
});

function highlightAC(items) {
  items.forEach((el, i) => {
    const isSelected = i === acIndex;
    el.classList.toggle('selected', isSelected);
    el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
  });
}

function selectCity(city) {
  window.state.lat = city.lat; window.state.lon = city.lon;
  window.state.cityName = city.name; window.state.ghi = city.ghi;
  clearStepInlineAlert(2);
  const cityInput = document.getElementById('city-search');
  if (cityInput) cityInput.value = city.name;
  setAutocompleteOpen(false);
  setLocationWarningVisible(false);
  const locText = document.getElementById('selected-loc-text');
  if (locText) {
    locText.textContent = `${city.name} — ${city.lat.toFixed(4)}°K, ${city.lon.toFixed(4)}°D (GHI: ${city.ghi})`;
  }
  if (map) map.setView([city.lat, city.lon], 9, { animate: true });
  if (marker) marker.setLatLng([city.lat, city.lon]);
  setLocationBottomCard(city.name, city.lat, city.lon, city.ghi);
}

async function _fetchNominatim(q, qLow, list) {
  try {
    const locale = (window._currentLang || 'tr');
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + ', Türkiye')}&countrycodes=tr&format=json&limit=8&addressdetails=1&namedetails=1&accept-language=${encodeURIComponent(locale)}`;
    const resp = await fetch(url);
    if (!resp.ok) return;
    const results = await resp.json();
    // Staleness check
    const currentQ = document.getElementById('city-search')?.value?.trim()?.toLowerCase();
    if (currentQ !== qLow) return;
    const added = [];
    const seen = new Set();
    for (const r of results) {
      if (added.length >= 6) break;
      const formatted = formatNominatimResult(r);
      const dedupeKey = String(r.display_name || `${formatted.title}|${formatted.subtitle}`).toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const item = createAutocompleteItem({
        title: formatted.title,
        subtitle: formatted.subtitle,
        meta: i18n.t('step2.addressResultLabel'),
        onSelect: () => _selectNominatimResult(r)
      });
      list.appendChild(item);
      added.push(r);
    }
    if (list.children.length > 0) {
      setAutocompleteOpen(true);
    }
  } catch { /* network errors silently ignored */ }
}

function _selectNominatimResult(result) {
  const lat = parseFloat(result.lat), lon = parseFloat(result.lon);
  const formatted = formatNominatimResult(result);
  const name = [formatted.title, formatted.subtitle].filter(Boolean).join(' · ');
  // Find nearest city for GHI lookup
  const nearest = TURKISH_CITIES.reduce((best, c) =>
    Math.hypot(c.lat - lat, c.lon - lon) < Math.hypot(best.lat - lat, best.lon - lon) ? c : best
  );
  window.state.lat = lat; window.state.lon = lon;
  window.state.cityName = name; window.state.ghi = nearest.ghi;
  clearStepInlineAlert(2);
  document.getElementById('city-search').value = name;
  setAutocompleteOpen(false);
  setLocationWarningVisible(false);
  if (map) map.setView([lat, lon], 15, { animate: true });
  if (marker) marker.setLatLng([lat, lon]);
  setLocationBottomCard(name, lat, lon, nearest.ghi);
}

function initScenarioExperience() {
  // Not: solar-art-mount yeni tasarımda kaldırıldı (proposal-hero section silindi)
  renderScenarioCards();
  updateScenarioUI();
  syncScenarioControls();
}

function renderScenarioCards() {
  const wrap = document.getElementById('scenario-card-grid');
  if (!wrap) return;
  const VISIBLE_SCENARIOS = ['on-grid', 'off-grid'];
  wrap.innerHTML = listScenarioDefinitions()
    .filter(s => VISIBLE_SCENARIOS.includes(s.key))
    .map(rawScenario => {
      const scenario = localizeScenarioDefinition(rawScenario, key => i18n.t(key));
      const icon = stripInlineSvgStyles(SCENARIO_ICONS?.[scenario.key] || '');
      const forWhom = i18n.t(`scenarios.${scenario.key === 'on-grid' ? 'onGrid' : 'offGrid'}.forWhom`);
      const forWhomHtml = forWhom && forWhom !== `scenarios.${scenario.key === 'on-grid' ? 'onGrid' : 'offGrid'}.forWhom`
        ? `<span class="scenario-card-for-whom"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="svg-shrink-mt-1"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>${forWhom}</span>`
        : '';
      return `
    <button type="button" class="scenario-choice-card scenario-color-${scenario.key}${window.state.scenarioKey === scenario.key ? ' selected' : ''}"
            data-scenario-key="${scenario.key}"
            data-testid="scenario-card-${scenario.key}"
            aria-pressed="${window.state.scenarioKey === scenario.key ? 'true' : 'false'}">
      <div class="scenario-card-icon">${icon}</div>
      <strong class="scenario-card-title">${scenario.label}</strong>
      <span class="scenario-card-desc">${scenario.description}</span>
      ${forWhomHtml}
    </button>`;
    }).join('');
  wrap.querySelectorAll('[data-scenario-key]').forEach(btn => {
    btn.addEventListener('click', () => selectScenario(btn.dataset.scenarioKey));
  });
}

function updateScenarioUI() {
  const scenario = localizeScenarioDefinition(getScenarioDefinition(window.state.scenarioKey), key => i18n.t(key));
  window.state.scenarioContext = {
    ...(window.state.scenarioContext || {}),
    key: scenario.key,
    label: scenario.label,
    workflowLabel: scenario.workflowLabel,
    resultFrame: scenario.resultFrame,
    nextAction: scenario.nextAction,
    confidenceHint: scenario.confidenceHint,
    decisionHint: scenario.decisionHint,
    resultCaution: scenario.resultCaution,
    primaryCta: scenario.primaryCta,
    proposalTone: scenario.proposalTone,
    visibleBlocks: scenario.visibleBlocks
  };
  document.querySelectorAll('.scenario-choice-card').forEach(card => {
    const isSelected = card.dataset.scenarioKey === scenario.key;
    card.classList.toggle('selected', isSelected);
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  });
  const selected = document.getElementById('scenario-selected-summary');
  if (selected) {
    selected.innerHTML = `
      <div class="scenario-summary-kicker">${i18n.t('scenario.selectedSummaryTitle')}</div>
      <strong>${scenario.label}</strong>
      <div class="scenario-summary-grid">
        <span>${i18n.t('scenario.summaryBestFor')}</span><em>${scenario.decisionHint || scenario.description}</em>
        <span>${i18n.t('scenario.summaryOutput')}</span><em>${scenario.resultFrame}</em>
        <span>${i18n.t('scenario.summaryNext')}</span><em>${scenario.nextAction}</em>
      </div>
    `;
  }
  const step1ContinueText = document.querySelector('#step1-continue-btn [data-i18n-text]');
  if (step1ContinueText) step1ContinueText.textContent = scenario.primaryCta || i18n.t('scenario.defaultContinue');
  const stepLabel = document.getElementById('scenario-step-label');
  if (stepLabel) stepLabel.textContent = scenario.workflowLabel;
  const resultFrame = document.getElementById('result-scenario-frame');
  if (resultFrame && window.state.results) {
    const authoritativeSource = window.state.results.authoritativeEngineSource || window.state.results.engineSource;
    resultFrame.textContent = `${scenario.resultFrame} · ${authoritativeSource?.source || window.state.results.calculationMode || 'PVGIS/JS'}`;
  }
  const hint = document.getElementById('scenario-guidance-panel');
  if (hint) {
    hint.innerHTML = `
      <strong>${scenario.shortLabel} workflow</strong>
      <span>${scenario.decisionHint || scenario.description}</span>
      <span>${scenario.confidenceHint}</span>
      <span>${scenario.nextAction}</span>
    `;
  }
  const visibility = scenario.visibleBlocks || {};
  const toggleBlock = (id, visible = true) => {
    const el = document.getElementById(id);
    setElementVisible(el, visible);
  };
  toggleBlock('nm-block', visibility.netMetering !== false);
  toggleBlock('battery-block', visibility.battery !== false);
  toggleBlock('heat-pump-block', visibility.heatPump !== false);
  toggleBlock('ev-block', visibility.ev !== false);
  toggleBlock('tax-block', visibility.tax !== false);
  const govBlock = document.getElementById('proposal-governance-block');
  if (govBlock) govBlock.classList.toggle('compact-governance', visibility.governance === false);
}

function ensureOffgridL2Placement() {
  const anchor = document.getElementById('offgrid-l2-anchor');
  const panel = document.getElementById('offgrid-l2-wrap');
  if (!anchor || !panel) return;
  if (panel.parentElement !== anchor) anchor.appendChild(panel);
}

function syncStep5AdvancedForScenario() {
  const isOffGrid = window.state?.scenarioKey === 'off-grid';
  const advancedCard = document.getElementById('step5-advanced-card');
  const body = advancedCard?.querySelector('.step5-advanced-body');
  if (!advancedCard || !body) return;
  const summaryCopy = advancedCard.querySelector('.step5-advanced-summary-copy');
  if (summaryCopy) {
    summaryCopy.textContent = isOffGrid
      ? 'Saha kanıtı, alternatif enerji maliyeti, batarya sağlığı ve off-grid işletme varsayımları'
      : 'Tarife rejimi, ihracat hesabı, kanıt dosyaları, bakım giderleri ve uzman seviyesi finansal ayarlar';
  }
  body.querySelectorAll(':scope > .step5-advanced-guide, :scope > details.step5-subdetails, :scope > .step5-module-section-head, :scope > .step5-module-grid')
    .forEach(el => {
      el.style.display = isOffGrid ? 'none' : '';
    });
  const offgridAdvanced = document.getElementById('offgrid-advanced-options');
  setElementVisible(offgridAdvanced, isOffGrid);
  const costWrap = document.getElementById('off-grid-cost-wrap');
  const offgridCostAnchor = document.getElementById('offgrid-cost-anchor');
  if (costWrap && offgridCostAnchor && isOffGrid && costWrap.parentElement !== offgridCostAnchor) {
    offgridCostAnchor.appendChild(costWrap);
  }
}

function syncScenarioControls() {
  const s = window.state;
  ensureOffgridL2Placement();
  syncStep5AdvancedForScenario();
  const onGridPanel = document.getElementById('on-grid-flow-panel');
  setElementVisible(onGridPanel, s.scenarioKey === 'on-grid');
  const advancedCard = document.getElementById('step5-advanced-card');
  setElementVisible(advancedCard, true);
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = value;
  };
  setVal('on-grid-subscriber-type', s.subscriberType || 'residential');
  setVal('on-grid-connection-type', s.connectionType || 'trifaze');
  setVal('on-grid-usage-profile', s.usageProfile || 'balanced');
  setVal('on-grid-annual-consumption', Math.round(Number(s.annualConsumptionKwh) || Number(s.dailyConsumption || 0) * 365 || 3650));
  setVal('on-grid-monthly-consumption-input', s.onGridMonthlyConsumptionKwh ? Math.round(Number(s.onGridMonthlyConsumptionKwh)) : '');
  setVal('on-grid-monthly-bill-estimate', s.onGridMonthlyBillEstimate ? formatMonthlyBillInputValue(Number(s.onGridMonthlyBillEstimate)) : '');
  setVal('on-grid-design-target', s.designTarget || 'fill-roof');
  setVal('on-grid-roof-type', s.roofType || 'flat-concrete');
  setVal('on-grid-usable-roof-ratio', Math.round((Number(s.usableRoofRatio) || 0.75) * 100));
  setVal('on-grid-shading-quality', s.shadingQuality || 'user-estimate');
  setVal('distribution-fee-input', s.distributionFee || 0);
  setVal('tariff-input-mode', s.tariffInputMode || 'net-plus-fee');
  setVal('tariff-source-type', s.tariffSourceType || 'official');
  setVal('cost-source-type', s.costSourceType || 'catalog');
  syncAssumptionControlsFromState();
  renderOnGridMonthlyInputs();
  setOnGridInputMode(s.onGridInputMode || 'basic');
  syncStep5AdvancedForScenario();
  updateOnGridFlowSummary();
  // Show off-grid cost input only when off-grid scenario is active
  const offGridWrap = document.getElementById('off-grid-cost-wrap');
  setElementVisible(offGridWrap, s.scenarioKey === 'off-grid');
  // Warn when off-grid cost is missing (calc will silently use tariff × 2.5)
  const offGridWarn = document.getElementById('off-grid-cost-warn');
  setElementVisible(offGridWarn, s.scenarioKey === 'off-grid' && !s.offGridCostPerKwh);
  const dailyConsumptionBlock = document.getElementById('step5-daily-consumption-block');
  setElementVisible(dailyConsumptionBlock, s.scenarioKey !== 'on-grid');
  // Off-Grid Level 2 panel göster/gizle
  const offgridL2Wrap = document.getElementById('offgrid-l2-wrap');
  setElementVisible(offgridL2Wrap, s.scenarioKey === 'off-grid');
  // Level 2 form alanlarını geri yükle
  if (s.scenarioKey === 'off-grid') {
    if (!['bill-offset', 'fill-roof'].includes(s.designTarget)) s.designTarget = 'fill-roof';
    if (!s.offgridLoadProfileKey) s.offgridLoadProfileKey = 'family-home';
    const fracEl = document.getElementById('offgrid-critical-fraction');
    const fracValEl = document.getElementById('offgrid-critical-fraction-val');
    if (fracEl) { fracEl.value = Math.round((Number(s.offgridCriticalFraction) || getOffgridResidentialProfile(s.offgridLoadProfileKey).criticalFraction) * 100); }
    if (fracValEl) fracValEl.textContent = (fracEl ? fracEl.value : 45) + '%';
    const calcModeEl = document.getElementById('offgrid-calculation-mode');
    if (calcModeEl) calcModeEl.value = s.offgridCalculationMode || 'basic';
    const goalEl = document.getElementById('offgrid-autonomy-goal');
    if (goalEl) goalEl.value = s.offgridAutonomyGoal || 'reliability';
    const genEnabledEl = document.getElementById('offgrid-generator-enabled');
    if (genEnabledEl) genEnabledEl.checked = !!s.offgridGeneratorEnabled;
    const genKwEl = document.getElementById('offgrid-generator-kw');
    if (genKwEl) genKwEl.value = s.offgridGeneratorKw || 5;
    const genFuelEl = document.getElementById('offgrid-generator-fuel-cost');
    if (genFuelEl) genFuelEl.value = s.offgridGeneratorFuelCostPerKwh || 8;
    const genCapexEl = document.getElementById('offgrid-generator-capex');
    if (genCapexEl) genCapexEl.value = s.offgridGeneratorCapexTry || 0;
    const genStrategyEl = document.getElementById('offgrid-generator-strategy');
    if (genStrategyEl) genStrategyEl.value = s.offgridGeneratorStrategy || 'critical-backup';
    const genFuelTypeEl = document.getElementById('offgrid-generator-fuel-type');
    if (genFuelTypeEl) genFuelTypeEl.value = s.offgridGeneratorFuelType || 'diesel';
    const genSizePresetEl = document.getElementById('offgrid-generator-size-preset');
    if (genSizePresetEl) genSizePresetEl.value = s.offgridGeneratorSizePreset || 'auto';
    const genReserveEl = document.getElementById('offgrid-generator-reserve-pct');
    if (genReserveEl) genReserveEl.value = s.offgridGeneratorReservePct ?? 20;
    const genStartSocEl = document.getElementById('offgrid-generator-start-soc-pct');
    if (genStartSocEl) genStartSocEl.value = s.offgridGeneratorStartSocPct ?? 25;
    const genMaxHoursEl = document.getElementById('offgrid-generator-max-hours-day');
    if (genMaxHoursEl) genMaxHoursEl.value = s.offgridGeneratorMaxHoursPerDay ?? 8;
    const genMaintenanceEl = document.getElementById('offgrid-generator-maintenance-cost');
    if (genMaintenanceEl) genMaintenanceEl.value = s.offgridGeneratorMaintenanceCostTry || 0;
    const genDetails = document.getElementById('offgrid-generator-details');
    setElementVisible(genDetails, !!s.offgridGeneratorEnabled, 'grid');
    const bwEl = document.getElementById('offgrid-bad-weather-level');
    if (bwEl) bwEl.value = s.offgridBadWeatherLevel || '';
    syncOffgridDesignTargetCards();
    syncOffgridL2ModeUI();
    if (typeof renderOffgridDeviceTable === 'function' && s.offgridCalculationMode === 'advanced') renderOffgridDeviceTable();
    // Katalog açılır listesini yenile (ilk yüklemede boşsa doldur)
    updateOffgridCatalogOptions();
  }
  // Faz-4 Fix-16: Show irrigation pump block for agricultural-irrigation; hide 365-day warning when pump data is entered
  const irrigWrap = document.getElementById('irrigation-pump-wrap');
  const irrigWarn = document.getElementById('irrigation-season-warn');
  const isIrrig = s.scenarioKey === 'agricultural-irrigation';
  if (irrigWrap) irrigWrap.style.display = isIrrig ? '' : 'none';
  if (irrigWarn) {
    const pumpDataEntered = isIrrig && s.irrigPumpKw > 0 && s.irrigHoursPerDay > 0;
    irrigWarn.style.display = (isIrrig && !pumpDataEntered) ? '' : 'none';
  }
  const batteryToggle = document.getElementById('battery-toggle');
  if (batteryToggle) batteryToggle.checked = !!s.batteryEnabled;
  const nmToggle = document.getElementById('nm-toggle');
  if (nmToggle) nmToggle.checked = !!s.netMeteringEnabled;
  const hpToggle = document.getElementById('hp-toggle');
  if (hpToggle) hpToggle.checked = !!s.heatPumpEnabled;
  const evToggle = document.getElementById('ev-toggle');
  if (evToggle) evToggle.checked = !!s.evEnabled;
  const taxToggle = document.getElementById('tax-toggle');
  if (taxToggle) taxToggle.checked = !!s.taxEnabled;
  const consumptionSlider = document.getElementById('consumption-slider');
  if (consumptionSlider) consumptionSlider.value = s.dailyConsumption || 10;
  updateConsumption(s.dailyConsumption || 10);
  if (batteryToggle) onBatteryToggle(!!s.batteryEnabled);
  if (nmToggle) onNMToggle(!!s.netMeteringEnabled);
  if (hpToggle) onHeatPumpToggle(!!s.heatPumpEnabled);
  if (evToggle) onEVToggle(!!s.evEnabled);
  if (taxToggle) onTaxToggle(!!s.taxEnabled);
  updateTariffType(s.tariffType || 'residential');
  syncEnterpriseInputsFromState();
}

function selectScenario(key) {
  const next = applyScenarioDefaults(window.state, key);
  Object.assign(window.state, next);
  applyApril2026TariffProfile(window.state, window.state.tariffType || 'residential');
  // Senaryo seçilmesi adım 1'in tamamlandığını gösterir; adım 2'yi unlock et.
  // (scenario değişimi sonrası downstream state'i sıfırlama; daha ileride
  //  kullanıcı varsa tekrar her stepte validation yapar.)
  window.state.maxUnlockedStep = 2;
  clearStepInlineAlert(1);
  appendAuditEntry(window.state, 'scenario.selected', {
    scenarioKey: window.state.scenarioKey,
    label: window.state.scenarioContext?.label
  }, currentUser());
  updateScenarioUI();
  syncScenarioControls();
  updateProgressBar();
  persistState();
  showToast(`${window.state.scenarioContext?.label || i18n.t('scenario.fallbackLabel')} ${i18n.t('scenario.selectedToast')}`, 'success');
}

function useGeolocation() {
  if (!navigator.geolocation) { showToast(i18n.t('step2.geoUnsupported'), 'error'); return; }
  setGeolocationButton(true);
  navigator.geolocation.getCurrentPosition(pos => {
    setGeolocationButton(false);
    const { latitude, longitude } = pos.coords;
    if (!isInTurkey(latitude, longitude)) {
      showToast(i18n.t('step2.geoOutside'), 'error');
      setLocationWarningVisible(true);
      return;
    }
    selectLocationFromLatLon(latitude, longitude, false);
    if (map) map.setView([latitude, longitude], 10, { animate: true });
  }, err => {
    setGeolocationButton(false);
    showToast(i18n.t('step2.geoDenied'), 'error');
  });
}

// ═══════════════════════════════════════════════════════════
// STEP 2 — TILT & SHADING & SOILING
// ═══════════════════════════════════════════════════════════
// Eğim katsayısı tablosu/fonksiyonu calc-engine.js'den tek kaynak olarak import edilir.

function updateTilt(val) {
  val = Math.max(0, Math.min(90, parseInt(val, 10) || 0));
  window.state.tilt = val;
  document.getElementById('tilt-val').textContent = val + '°';
  const summaryAngleEl = document.getElementById('tilt-summary-angle');
  if (summaryAngleEl) summaryAngleEl.textContent = val + '°';
  positionRangeThumb('tilt-slider', 'tilt-val', 0, 90);

  // Pivot point: (155, 145) — panel dayanak noktası
  const pivotX = 155, pivotY = 145;
  const panelGroup = document.getElementById('panel-group');
  if (panelGroup) panelGroup.setAttribute('transform', `rotate(-${val}, ${pivotX}, ${pivotY})`);

  // Açı yayı
  const arcEl = document.getElementById('tilt-arc');
  if (arcEl) {
    const arcR = 28;
    const radEnd = (val * Math.PI) / 180;
    const arcEndX = pivotX + arcR * Math.cos(Math.PI - radEnd);
    const arcEndY = pivotY - arcR * Math.sin(radEnd);
    const largeArc = val > 90 ? 1 : 0;
    arcEl.setAttribute('d', `M${pivotX + arcR},${pivotY} A${arcR},${arcR} 0 ${largeArc},0 ${arcEndX.toFixed(1)},${arcEndY.toFixed(1)}`);
  }

  // Açı text
  const angleText = document.getElementById('tilt-angle-text');
  if (angleText) {
    const textR = 42;
    const midRad = (val / 2 * Math.PI) / 180;
    angleText.setAttribute('x', (pivotX + textR * Math.cos(Math.PI - midRad)).toFixed(1));
    angleText.setAttribute('y', (pivotY - textR * Math.sin(midRad) + 5).toFixed(1));
    angleText.textContent = val + '°';
  }

  // Verim katsayısı
  const coeff = getTiltCoeff(val);
  const coeffEl = document.getElementById('tilt-coeff-text');
  if (coeffEl) coeffEl.textContent = `Verim: ×${coeff.toFixed(2)}`;
  const summaryCoeffEl = document.getElementById('tilt-summary-coeff');
  if (summaryCoeffEl) summaryCoeffEl.textContent = `×${coeff.toFixed(2)}`;

  // Optimal badge
  const badge = document.getElementById('opt-badge');
  const badgeText = document.getElementById('opt-badge-text');
  const info = document.getElementById('tilt-info');
  if (val >= 25 && val <= 40) {
    if (badge) { badge.setAttribute('fill', 'rgba(16,185,129,0.15)'); badge.setAttribute('stroke', 'rgba(16,185,129,0.4)'); }
    if (badgeText) { badgeText.setAttribute('fill', '#10B981'); badgeText.textContent = 'Optimal aralık (25°–40°) ✓'; }
    if (info) { info.className = 'tilt-status-pill is-good'; info.textContent = 'Optimal açı aralığı ✓'; }
  } else if ((val >= 15 && val < 25) || (val > 40 && val <= 55)) {
    if (badge) { badge.setAttribute('fill', 'rgba(245,158,11,0.12)'); badge.setAttribute('stroke', 'rgba(245,158,11,0.35)'); }
    if (badgeText) { badgeText.setAttribute('fill', '#F59E0B'); badgeText.textContent = `Kabul edilebilir (${val < 25 ? '15°–25°' : '40°–55°'})`; }
    if (info) { info.className = 'tilt-status-pill is-warn'; info.textContent = 'Kabul edilebilir açı aralığı'; }
  } else {
    if (badge) { badge.setAttribute('fill', 'rgba(239,68,68,0.1)'); badge.setAttribute('stroke', 'rgba(239,68,68,0.35)'); }
    if (badgeText) { badgeText.setAttribute('fill', '#EF4444'); badgeText.textContent = 'Verimsiz açı — düzeltme önerilir'; }
    if (info) { info.className = 'tilt-status-pill is-bad'; info.textContent = 'Verimsiz açı — düzeltme önerilir'; }
  }
}

function updateShading(val) {
  val = Math.max(0, Math.min(80, parseInt(val, 10) || 0));
  window.state.shadingFactor = val;
  document.getElementById('shading-val').textContent = val + '%';
  positionRangeThumb('shading-slider', 'shading-val', 0, 80);
  const desc = ['Gölge yok', 'Az gölge', 'Orta gölge', 'Ciddi gölge'];
  const idx = val == 0 ? 0 : val <= 15 ? 1 : val <= 35 ? 2 : 3;
  document.getElementById('shading-desc').textContent = desc[idx];
  syncOsmShadowDoubleCountWarning();
}

function syncOsmShadowDoubleCountWarning() {
  const warningEl = document.getElementById('osm-double-count-warning');
  if (!warningEl) return;
  const osmEnabled = !!window.state?.osmShadowEnabled;
  const userShade = Math.max(0, Number(window.state?.shadingFactor) || 0);
  if (osmEnabled && userShade > 0) {
    warningEl.style.display = '';
    warningEl.textContent = window.i18n?.t?.('onGridResult.osmDoubleCountWarning')
      || 'OSM gölge etkinken kullanıcı gölge faktörünü 0% yapın; aksi halde gölge kaybı iki kez sayılabilir.';
    return;
  }
  warningEl.style.display = 'none';
  warningEl.textContent = '';
}
window.syncOsmShadowDoubleCountWarning = syncOsmShadowDoubleCountWarning;

function updateGroundAlbedo(val) {
  window.state.groundAlbedo = parseFloat(val) || 0.20;
}
window.updateGroundAlbedo = updateGroundAlbedo;

function updateSoiling(val) {
  val = Math.max(0, Math.min(50, parseInt(val, 10) || 0));
  window.state.soilingFactor = val;
  document.getElementById('soiling-val').textContent = val + '%';
  positionRangeThumb('soiling-slider', 'soiling-val', 0, 50);
  const descs = ['Temiz panel', 'Minimal kirlenme', 'Az kirlenme', 'Orta düzey kirlenme', 'Yüksek kirlenme'];
  const idx = val == 0 ? 0 : val <= 2 ? 1 : val <= 4 ? 2 : val <= 7 ? 3 : 4;
  document.getElementById('soiling-desc').textContent = descs[idx];
}

function updateTariffType(type) {
  window.state.tariffType = type;
  if (!window.state.subscriberType) window.state.subscriberType = type === 'custom' ? 'other' : type;
  window.state.tariffMode = type === 'custom' ? 'custom' : 'auto';
  const descs = {
    residential: '2026 tarife seçimi: yıllık tüketim 4.000 kWh üstündeyse SKTT seçilebilir. Birim fiyatları faturanızdan doğrulayın.',
    commercial: '2026 tarife seçimi: mesken dışı yıllık tüketim 15.000 kWh üstündeyse SKTT seçilebilir. Sözleşmeli tarife varsa girin.',
    industrial: '2026 tarife seçimi: mesken dışı yıllık tüketim 15.000 kWh üstündeyse SKTT seçilebilir. Sözleşmeli tarife varsa girin.',
    agriculture: 'Tarımsal sulama senaryosu: pompa gücü, sezon ve gündüz çalışma profili doğrulanmalı. Birim fiyatı faturanızdan girin.',
    custom: 'Kullanıcı tanımlı tarife'
  };
  if (type !== 'custom') {
    applyApril2026TariffProfile(window.state, type);
    document.getElementById('tariff-input').value = window.state.tariff;
    const skttEl = document.getElementById('sktt-tariff-input');
    const contractEl = document.getElementById('contracted-tariff-input');
    const distributionEl = document.getElementById('distribution-fee-input');
    const tariffInputModeEl = document.getElementById('tariff-input-mode');
    const tariffSourceTypeEl = document.getElementById('tariff-source-type');
    const tariffSourceDateEl = document.getElementById('tariff-source-date');
    const tariffSourceCheckedEl = document.getElementById('tariff-source-checked-at');
    const tariffEvidenceStatusEl = document.getElementById('tariff-evidence-status');
    const tariffEvidenceRefEl = document.getElementById('tariff-evidence-ref');
    const tariffEvidenceUrlEl = document.getElementById('tariff-evidence-url');
    const settlementDateEl = document.getElementById('settlement-date');
    if (skttEl) skttEl.value = window.state.skttTariff;
    if (contractEl) contractEl.value = window.state.contractedTariff;
    if (distributionEl) distributionEl.value = window.state.distributionFee;
    if (tariffInputModeEl) tariffInputModeEl.value = window.state.tariffInputMode;
    if (tariffSourceTypeEl) tariffSourceTypeEl.value = window.state.tariffSourceType;
    if (tariffSourceDateEl) tariffSourceDateEl.value = window.state.tariffSourceDate;
    if (tariffSourceCheckedEl) tariffSourceCheckedEl.value = window.state.tariffSourceCheckedAt;
    if (tariffEvidenceStatusEl) tariffEvidenceStatusEl.value = window.state.evidence?.tariffSource?.status || 'verified';
    if (tariffEvidenceRefEl) tariffEvidenceRefEl.value = window.state.evidence?.tariffSource?.ref || APRIL_2026_TARIFF_SOURCE.evidenceRef;
    if (tariffEvidenceUrlEl) tariffEvidenceUrlEl.value = window.state.evidence?.tariffSource?.sourceUrl || APRIL_2026_TARIFF_SOURCE.sourceUrl;
    if (settlementDateEl) settlementDateEl.value = window.state.settlementDate;
    const exportEl = document.getElementById('export-tariff-input');
    if (exportEl) exportEl.value = window.state.exportTariff;
  }
  document.getElementById('tariff-desc').textContent = descs[type] || '';
}

const ONGRID_SUBSCRIBER_TO_TARIFF = {
  residential: 'residential',
  commercial: 'commercial',
  industrial: 'industrial',
  osb: 'industrial',
  public: 'commercial',
  other: 'custom'
};

function normalizedMonthWeights() {
  const sum = MONTH_WEIGHTS.reduce((a, b) => a + (Number(b) || 0), 0) || 1;
  return MONTH_WEIGHTS.map(v => (Number(v) || 0) / sum);
}

function getCurrentMonthIndex() {
  const now = new Date();
  const month = Number(now.getMonth());
  return Number.isInteger(month) && month >= 0 && month <= 11 ? month : 0;
}

function getCurrentMonthWeight() {
  const weights = normalizedMonthWeights();
  return Math.max(0.01, Number(weights[getCurrentMonthIndex()]) || (1 / 12));
}

function getCurrentMonthLabel() {
  const locale = window._currentLang || 'tr';
  const now = new Date();
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(now);
  } catch {
    return `${MONTHS[getCurrentMonthIndex()] || 'Bu ay'} ${now.getFullYear()}`;
  }
}

function deriveAnnualFromCurrentMonthKwh(monthlyKwh) {
  return Math.max(0, Math.round(Math.max(0, Number(monthlyKwh) || 0) / getCurrentMonthWeight()));
}

function handleHourlyCsvUpload(event) {
  const file = event?.target?.files?.[0];
  const statusEl = document.getElementById('hourly-csv-status');
  const clearBtn = document.getElementById('hourly-csv-clear');
  if (!file) return;

  // Show loading state immediately
  if (statusEl) {
    statusEl.style.display = '';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.textContent = '⏳ Dosya okunuyor...';
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    // Use setTimeout to allow the browser to paint the loading state first
    setTimeout(async () => {
      try {
        if (statusEl) statusEl.textContent = '⏳ CSV parse ediliyor...';
        const text = e.target.result || '';
        if (!text.trim()) throw new Error('Dosya boş veya okunamadı.');
        const rows = text.trim().split(/\r?\n/);
        // Accept single-column CSV or TSV; skip header row if non-numeric
        const values = [];
        let skippedHeader = false;
        let firstBadRow = null;
        for (let i = 0; i < rows.length; i++) {
          const cell = rows[i].split(/[,;\t]/)[0].trim();
          if (!cell) continue;
          const n = Number(cell);
          if (!Number.isFinite(n)) {
            if (!skippedHeader && values.length === 0) { skippedHeader = true; continue; } // skip one header
            if (firstBadRow === null) firstBadRow = { row: i + 1, value: cell };
            continue;
          }
          if (n < 0) throw new Error(`Satır ${i + 1}: negatif değer kabul edilmez (${cell}).`);
          values.push(n);
        }
        if (firstBadRow && values.length < 8760) {
          throw new Error(`Satır ${firstBadRow.row}: sayısal olmayan değer "${firstBadRow.value}". Format: tek kolon, 8760 sayı satırı.`);
        }
        if (values.length < 8760) {
          throw new Error(`Yetersiz veri: 8760 satır gerekli, ${values.length} geçerli satır bulundu.${values.length === 0 ? ' Dosya formatını kontrol edin (tek kolon, virgül/noktalı virgül/tab ayrımlı).' : ''}`);
        }
        const profile = values.slice(0, 8760);
        if (window.state.scenarioKey === 'off-grid') {
          const validation = validateHourlyProfile8760(profile, {
            label: 'Toplam yük 8760 profili',
            minAnnualKwh: 12,
            minPositiveHours: 24
          });
          if (!validation.ok) throw new Error(validation.errors.join(' '));
        }
        window.state.hourlyConsumption8760 = profile;
        window.state.hourlyProfileSource = 'hourly-uploaded';
        const annual = Math.round(profile.reduce((a, b) => a + b, 0));
        const peak = Math.max(...profile).toFixed(2);
        let evidenceNote = '';
        if (window.state.scenarioKey === 'off-grid') {
          const evidenceResult = await attachEvidenceFile(
            window.state,
            'offgridLoadProfile',
            file,
            currentUser(),
            buildHourlyProfileEvidence(profile) || {}
          );
          evidenceNote = evidenceResult.ok
            ? ` | Kanıt SHA: ${evidenceResult.metadata.sha256.slice(0, 12)}`
            : ` | Kanıt kaydedilemedi: ${evidenceResult.errors.join(' ')}`;
        }
        if (statusEl) {
          statusEl.style.display = '';
          statusEl.style.color = 'var(--accent, #22c55e)';
          statusEl.textContent = `✓ ${i18n.t('onGridFlow.hourlyUploadSuccess')} | Yıllık: ${annual.toLocaleString()} kWh | Pik: ${peak} kWh/h${evidenceNote}`;
        }
        if (clearBtn) clearBtn.style.display = '';
        updateOnGridAssumptions();
        renderEvidenceFileStatus();
        persistState();
      } catch (err) {
        // On error: clear uploaded data, fall back to synthetic
        window.state.hourlyConsumption8760 = null;
        window.state.hourlyProfileSource = 'synthetic';
        if (statusEl) {
          statusEl.style.display = '';
          statusEl.style.color = 'var(--danger, #ef4444)';
          statusEl.textContent = `✗ ${err.message} — Sentetik profile geri dönüldü.`;
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateOnGridAssumptions();
      }
    }, 0);
  };
  reader.onerror = () => {
    if (statusEl) {
      statusEl.style.display = '';
      statusEl.style.color = 'var(--danger, #ef4444)';
      statusEl.textContent = '✗ Dosya okunamadı. Lütfen tekrar deneyin.';
    }
  };
  reader.readAsText(file);
}

function clearHourlyCsvUpload() {
  window.state.hourlyConsumption8760 = null;
  window.state.hourlyProfileSource = 'synthetic';
  const fileInput = document.getElementById('hourly-csv-upload');
  if (fileInput) fileInput.value = '';
  const statusEl = document.getElementById('hourly-csv-status');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
  const clearBtn = document.getElementById('hourly-csv-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  updateOnGridAssumptions();
  persistState();
}

function parseSingleColumn8760Csv(text, validationOptions = {}) {
  if (!String(text || '').trim()) throw new Error('Dosya boş veya okunamadı.');
  const rows = String(text).trim().split(/\r?\n/);
  const values = [];
  let skippedHeader = false;
  let firstBadRow = null;
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i].split(/[,;\t]/)[0].trim();
    if (!cell) continue;
    const n = Number(cell);
    if (!Number.isFinite(n)) {
      if (!skippedHeader && values.length === 0) { skippedHeader = true; continue; }
      if (firstBadRow === null) firstBadRow = { row: i + 1, value: cell };
      continue;
    }
    if (n < 0) throw new Error(`Satır ${i + 1}: negatif değer kabul edilmez (${cell}).`);
    values.push(n);
  }
  if (firstBadRow && values.length < 8760) {
    throw new Error(`Satır ${firstBadRow.row}: sayısal olmayan değer "${firstBadRow.value}". Format: tek kolon, 8760 sayı satırı.`);
  }
  if (values.length < 8760) throw new Error(`Yetersiz veri: 8760 satır gerekli, ${values.length} geçerli satır bulundu.`);
  const profile = values.slice(0, 8760);
  const validation = validateHourlyProfile8760(profile, validationOptions);
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  return profile;
}

function offgrid8760ValidationForKind(kind) {
  if (kind === 'pv') return { minAnnualKwh: 1, minPositiveHours: 24 };
  if (kind === 'critical-load') return { minAnnualKwh: 0.1, minPositiveHours: 1 };
  return { minAnnualKwh: 12, minPositiveHours: 24 };
}

async function analyzeOffgridFieldImport(file, kind) {
  if (!file) throw new Error('Dosya seçilmedi.');
  if (isSpreadsheetFilename(file.name || '')) {
    if (!window.state.backendEngineAvailable) {
      throw new Error('XLSX saha importu için backend gerekli. CSV/TXT kullanın veya backend modunu açın.');
    }
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(buildBackendUrl('/api/offgrid/field-import') + `?kind=${encodeURIComponent(kind)}`, {
      method: 'POST',
      body: form
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload?.summary) {
      throw new Error(payload?.detail || payload?.error || 'Saha importu çözümlenemedi.');
    }
    return payload.summary;
  }
  const text = await file.text();
  if (kind === 'inverter-log') return parseInverterEventLogText(text);
  return parseHighResolutionLoadText(text, { kind });
}

function setFieldImportSummary(kind, summary) {
  window.state.offgridFieldImports = window.state.offgridFieldImports || {};
  if (kind === 'load') window.state.offgridFieldImports.highResolutionLoad = summary;
  else if (kind === 'critical-load') window.state.offgridFieldImports.criticalHighResolutionLoad = summary;
  else if (kind === 'inverter-log') window.state.offgridFieldImports.inverterEventLog = summary;
}

function clearFieldImportSummary(kind) {
  if (!window.state.offgridFieldImports) return;
  if (kind === 'load') window.state.offgridFieldImports.highResolutionLoad = null;
  else if (kind === 'critical-load') window.state.offgridFieldImports.criticalHighResolutionLoad = null;
  else if (kind === 'inverter-log') window.state.offgridFieldImports.inverterEventLog = null;
}

function fieldImportSummaryText(summary) {
  if (!summary) return '';
  if (summary.kind === 'inverter-event-log') {
    return `Olay: ${Number(summary.eventCount || 0).toLocaleString()} | Trip: ${Number(summary.tripCount || 0).toLocaleString()} | Overload: ${Number(summary.overloadCount || 0).toLocaleString()}`;
  }
  return `Pik: ${Number(summary.observedPeakKw || 0).toFixed(2)} kW | P95: ${Number(summary.p95Kw || 0).toFixed(2)} kW | Aralık: ${Number(summary.intervalMinutes || 0).toFixed(0)} dk`;
}

function setCsvStatus(statusId, clearId, ok, message) {
  const statusEl = document.getElementById(statusId);
  if (statusEl) {
    statusEl.style.display = '';
    statusEl.style.color = ok ? 'var(--accent, #22c55e)' : 'var(--danger, #ef4444)';
    statusEl.textContent = message;
  }
  const clearBtn = document.getElementById(clearId);
  if (clearBtn) clearBtn.style.display = ok ? '' : 'none';
}

async function loadOffgridFieldImport(event, {
  kind,
  evidenceType,
  inputId,
  statusId,
  clearId,
  successLabel,
  applyDerived8760ToStateKey = null
}) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  setCsvStatus(statusId, clearId, true, '⏳ Saha dosyası analiz ediliyor...');
  try {
    const summary = await analyzeOffgridFieldImport(file, kind);
    setFieldImportSummary(kind, summary);
    let derivedApplied = false;
    let derivedRejectReason = '';
    if (applyDerived8760ToStateKey && Array.isArray(summary.derivedHourly8760) && summary.derivedHourly8760.length === 8760) {
      const validation = validateHourlyProfile8760(summary.derivedHourly8760, {
        label: successLabel,
        ...offgrid8760ValidationForKind(kind)
      });
      if (validation.ok) {
        window.state[applyDerived8760ToStateKey] = summary.derivedHourly8760.slice();
        if (applyDerived8760ToStateKey === 'hourlyConsumption8760') window.state.hourlyProfileSource = 'hourly-uploaded';
        if (applyDerived8760ToStateKey === 'offgridCriticalLoad8760') window.state.offgridCriticalLoad8760 = summary.derivedHourly8760.slice();
        derivedApplied = true;
      } else {
        window.state[applyDerived8760ToStateKey] = null;
        derivedRejectReason = validation.errors.join(' ');
      }
    }
    const evidenceResult = evidenceType
      ? await attachEvidenceFile(
          window.state,
          evidenceType,
          file,
          currentUser(),
          derivedApplied ? buildHourlyProfileEvidence(summary.derivedHourly8760) : {}
        )
      : { ok: true, metadata: null };
    const evidenceNote = evidenceResult.ok && evidenceResult.metadata?.sha256
      ? ` | Kanıt SHA: ${evidenceResult.metadata.sha256.slice(0, 12)}`
      : evidenceResult.ok ? '' : ` | Kanıt kaydedilemedi: ${evidenceResult.errors.join(' ')}`;
    const derivedNote = derivedApplied
      ? ' | 8760 türetildi ve dispatch girdisine yazıldı'
      : derivedRejectReason
        ? ` | 8760 türetildi ama dispatch için reddedildi: ${derivedRejectReason}`
      : ` | ${Number(summary.durationDays || 0).toFixed(1)} gün saha profili`;
    setCsvStatus(statusId, clearId, true, `✓ ${successLabel} | ${fieldImportSummaryText(summary)}${derivedNote}${evidenceNote}`);
    renderEvidenceFileStatus();
    persistState();
  } catch (error) {
    clearFieldImportSummary(kind);
    if (applyDerived8760ToStateKey) window.state[applyDerived8760ToStateKey] = null;
    const input = document.getElementById(inputId);
    if (input) input.value = '';
    setCsvStatus(statusId, clearId, false, `✗ ${error.message}`);
  }
}

function loadOffgrid8760Csv(event, { stateKey, sourceKey, evidenceType, inputId, statusId, clearId, successLabel, validation = {} }) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  setCsvStatus(statusId, clearId, true, '⏳ Dosya okunuyor...');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const values = parseSingleColumn8760Csv(e.target.result || '', { label: successLabel, ...validation });
      window.state[stateKey] = values;
      if (stateKey === 'hourlyConsumption8760') window.state.hourlyProfileSource = 'hourly-uploaded';
      if (sourceKey) window.state[sourceKey] = file.name || successLabel;
      const annual = Math.round(values.reduce((a, b) => a + b, 0));
      const peak = Math.max(...values).toFixed(2);
      const positiveHours = values.filter(value => value > 1e-9).length;
      let evidenceNote = '';
      if (evidenceType) {
        const evidenceResult = await attachEvidenceFile(
          window.state,
          evidenceType,
          file,
          currentUser(),
          buildHourlyProfileEvidence(values) || {}
        );
        evidenceNote = evidenceResult.ok
          ? ` | Kanıt SHA: ${evidenceResult.metadata.sha256.slice(0, 12)}`
          : ` | Kanıt kaydedilemedi: ${evidenceResult.errors.join(' ')}`;
      }
      setCsvStatus(statusId, clearId, true, `✓ ${successLabel} | Yıllık: ${annual.toLocaleString()} kWh | Pik: ${peak} kWh/h | Pozitif saat: ${positiveHours.toLocaleString()}${evidenceNote}`);
      renderEvidenceFileStatus();
      persistState();
    } catch (err) {
      window.state[stateKey] = null;
      if (sourceKey) window.state[sourceKey] = '';
      const input = document.getElementById(inputId);
      if (input) input.value = '';
      setCsvStatus(statusId, clearId, false, `✗ ${err.message}`);
    }
  };
  reader.onerror = () => setCsvStatus(statusId, clearId, false, '✗ Dosya okunamadı. Lütfen tekrar deneyin.');
  reader.readAsText(file);
}

function handleOffgridPvCsvUpload(event) {
  loadOffgrid8760Csv(event, {
    stateKey: 'offgridPvHourly8760',
    sourceKey: 'offgridPvHourlySource',
    evidenceType: 'offgridPvProduction',
    inputId: 'offgrid-pv-csv-upload',
    statusId: 'offgrid-pv-csv-status',
    clearId: 'offgrid-pv-csv-clear',
    successLabel: 'PV 8760 profili yüklendi',
    validation: offgrid8760ValidationForKind('pv')
  });
}

function handleOffgridLoadCsvUpload(event) {
  loadOffgrid8760Csv(event, {
    stateKey: 'hourlyConsumption8760',
    evidenceType: 'offgridLoadProfile',
    inputId: 'offgrid-load-csv-upload',
    statusId: 'offgrid-load-csv-status',
    clearId: 'offgrid-load-csv-clear',
    successLabel: 'Toplam yük 8760 profili yüklendi',
    validation: offgrid8760ValidationForKind('load')
  });
}

function clearOffgridLoadCsvUpload() {
  window.state.hourlyConsumption8760 = null;
  window.state.hourlyProfileSource = 'synthetic';
  const input = document.getElementById('offgrid-load-csv-upload');
  if (input) input.value = '';
  const statusEl = document.getElementById('offgrid-load-csv-status');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
  const clearBtn = document.getElementById('offgrid-load-csv-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  persistState();
}

function clearOffgridPvCsvUpload() {
  window.state.offgridPvHourly8760 = null;
  window.state.offgridPvHourlySource = '';
  const input = document.getElementById('offgrid-pv-csv-upload');
  if (input) input.value = '';
  const statusEl = document.getElementById('offgrid-pv-csv-status');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
  const clearBtn = document.getElementById('offgrid-pv-csv-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  persistState();
}

function handleOffgridCriticalCsvUpload(event) {
  loadOffgrid8760Csv(event, {
    stateKey: 'offgridCriticalLoad8760',
    evidenceType: 'offgridCriticalLoadProfile',
    inputId: 'offgrid-critical-csv-upload',
    statusId: 'offgrid-critical-csv-status',
    clearId: 'offgrid-critical-csv-clear',
    successLabel: 'Kritik yük 8760 profili yüklendi',
    validation: offgrid8760ValidationForKind('critical-load')
  });
}

function clearOffgridCriticalCsvUpload() {
  window.state.offgridCriticalLoad8760 = null;
  const input = document.getElementById('offgrid-critical-csv-upload');
  if (input) input.value = '';
  const statusEl = document.getElementById('offgrid-critical-csv-status');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
  const clearBtn = document.getElementById('offgrid-critical-csv-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  persistState();
}

function handleOffgridHighResLoadUpload(event) {
  loadOffgridFieldImport(event, {
    kind: 'load',
    evidenceType: 'offgridHighResLoadProfile',
    inputId: 'offgrid-highres-load-upload',
    statusId: 'offgrid-highres-load-status',
    clearId: 'offgrid-highres-load-clear',
    successLabel: 'Yüksek çözünürlüklü saha yükü içe aktarıldı',
    applyDerived8760ToStateKey: 'hourlyConsumption8760'
  });
}

function clearOffgridHighResLoadUpload() {
  clearFieldImportSummary('load');
  const input = document.getElementById('offgrid-highres-load-upload');
  if (input) input.value = '';
  const statusEl = document.getElementById('offgrid-highres-load-status');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
  const clearBtn = document.getElementById('offgrid-highres-load-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  persistState();
}

function handleOffgridInverterLogUpload(event) {
  loadOffgridFieldImport(event, {
    kind: 'inverter-log',
    evidenceType: 'offgridInverterEventLog',
    inputId: 'offgrid-inverter-log-upload',
    statusId: 'offgrid-inverter-log-status',
    clearId: 'offgrid-inverter-log-clear',
    successLabel: 'Inverter olay logu içe aktarıldı'
  });
}

function clearOffgridInverterLogUpload() {
  clearFieldImportSummary('inverter-log');
  const input = document.getElementById('offgrid-inverter-log-upload');
  if (input) input.value = '';
  const statusEl = document.getElementById('offgrid-inverter-log-status');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
  const clearBtn = document.getElementById('offgrid-inverter-log-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  persistState();
}

async function handleOffgridEvidenceFileUpload(event, evidenceType, statusId) {
  const input = event?.target;
  const file = input?.files?.[0];
  const statusEl = document.getElementById(statusId);
  if (!file) return;
  if (statusEl) {
    statusEl.style.display = '';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.textContent = 'Kanıt dosyası parmak izi alınıyor...';
  }
  try {
    const acceptanceSnapshotTypes = new Set(['offgridCommissioningReport', 'offgridAcceptanceTest']);
    const operationSnapshotTypes = new Set([
      'offgridTelemetry30Day',
      'offgridPerformanceBaseline',
      'offgridMaintenanceLog',
      'offgridIncidentLog',
      'offgridRemoteMonitoringSla'
    ]);
    const acceptanceSnapshot = acceptanceSnapshotTypes.has(evidenceType) && window.state.results?.offgridL2Results
      ? buildOffgridFieldAcceptanceSnapshot(window.state.results)
      : null;
    const operationSnapshot = operationSnapshotTypes.has(evidenceType) && window.state.results?.offgridL2Results
      ? buildOffgridFieldOperationSnapshot(window.state.results, { evidenceType })
      : null;
    const result = await attachEvidenceFile(
      window.state,
      evidenceType,
      file,
      currentUser(),
      {
        ...(acceptanceSnapshot ? { acceptanceSnapshot } : {}),
        ...(operationSnapshot ? { operationSnapshot } : {})
      }
    );
    if (!result.ok) {
      if (statusEl) {
        statusEl.style.color = 'var(--danger, #ef4444)';
        statusEl.textContent = `Kanıt kaydedilemedi: ${result.errors.join(' ')}`;
      }
      return;
    }
    renderEvidenceFileStatus();
    persistState();
    if (statusEl) {
      statusEl.style.color = 'var(--accent, #22c55e)';
      const snapshotNote = result.metadata.acceptanceSnapshot
        ? ' | Kabul snapshot bağlandı'
        : result.metadata.operationSnapshot ? ' | Operasyon snapshot bağlandı' : '';
      statusEl.textContent = `Kanıt eklendi: ${result.metadata.name} | SHA: ${result.metadata.sha256.slice(0, 12)}${snapshotNote}`;
    }
  } catch (error) {
    if (statusEl) {
      statusEl.style.color = 'var(--danger, #ef4444)';
      statusEl.textContent = `Kanıt dosyası kaydedilemedi: ${error.message}`;
    }
  } finally {
    if (input) input.value = '';
  }
}

function fillOnGridMonthlyFromAnnual(annualKwh) {
  const annual = Math.max(0, Number(annualKwh) || 0);
  if (!annual) return;
  const weights = normalizedMonthWeights();
  const monthly = weights.map(w => Math.round(annual * w));
  const diff = Math.round(annual) - monthly.reduce((a, b) => a + b, 0);
  monthly[11] += diff;
  window.state.monthlyConsumption = monthly;
  window.state.annualConsumptionKwh = monthly.reduce((a, b) => a + b, 0);
  window.state.dailyConsumption = window.state.annualConsumptionKwh / 365;
  renderOnGridMonthlyInputs();
}

function renderOnGridMonthlyInputs() {
  const wrap = document.getElementById('on-grid-monthly-grid');
  if (!wrap) return;
  const monthly = Array.isArray(window.state.monthlyConsumption) && window.state.monthlyConsumption.length === 12
    ? window.state.monthlyConsumption
    : normalizedMonthWeights().map(w => Math.round((Number(window.state.annualConsumptionKwh) || Number(window.state.dailyConsumption || 0) * 365 || 3650) * w));
  wrap.innerHTML = MONTHS.map((month, idx) => `
    <label class="on-grid-month-input">
      <span>${month.slice(0, 3)}</span>
      <input type="number" min="0" step="1" value="${Math.round(monthly[idx] || 0)}" data-on-grid-month="${idx}" data-input-action="updateOnGridMonthlyConsumption">
    </label>
  `).join('');
}

function updateOnGridMonthlyConsumption() {
  const values = Array.from(document.querySelectorAll('[data-on-grid-month]'))
    .sort((a, b) => Number(a.dataset.onGridMonth) - Number(b.dataset.onGridMonth))
    .map(input => Math.max(0, Number(input.value) || 0));
  if (values.length === 12) {
    window.state.monthlyConsumption = values;
    window.state.annualConsumptionKwh = Math.round(values.reduce((a, b) => a + b, 0));
    window.state.dailyConsumption = window.state.annualConsumptionKwh / 365;
    const annualEl = document.getElementById('on-grid-annual-consumption');
    if (annualEl) annualEl.value = window.state.annualConsumptionKwh;
    const slider = document.getElementById('consumption-slider');
    if (slider) slider.value = Math.max(2, Math.min(100, Math.round(window.state.dailyConsumption)));
    const val = document.getElementById('consumption-val');
    if (val) val.textContent = `${window.state.dailyConsumption.toFixed(1)} kWh/gün`;
  }
  updateOnGridFlowSummary();
  persistState();
}

function getOnGridEffectiveImportRate() {
  const s = window.state;
  const baseRate = Math.max(0, Number(document.getElementById('tariff-input')?.value) || Number(s.importTariffBase) || Number(s.tariff) || DEFAULT_RESIDENTIAL_TARIFF);
  const tariffInputMode = document.getElementById('tariff-input-mode')?.value || s.tariffInputMode || 'net-plus-fee';
  const distributionFee = tariffInputMode === 'gross'
    ? 0
    : Math.max(0, Number(document.getElementById('distribution-fee-input')?.value) || Number(s.distributionFee) || 0);
  return baseRate + distributionFee;
}

function roundMonthlyBillTry(value) {
  return Math.round(Math.max(0, Number(value) || 0) * 10) / 10;
}

function formatMonthlyBillInputValue(value) {
  const rounded = roundMonthlyBillTry(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatMonthlyBillTry(value) {
  const rounded = roundMonthlyBillTry(value);
  const hasFraction = !Number.isInteger(rounded);
  return rounded.toLocaleString('tr-TR', {
    minimumFractionDigits: hasFraction ? 1 : 0,
    maximumFractionDigits: 1
  });
}

function syncOnGridDesignTargetCards() {
  const target = window.state.designTarget || document.getElementById('on-grid-design-target')?.value || 'fill-roof';
  document.querySelectorAll('[data-design-target-card]').forEach(card => {
    const active = card.dataset.designTargetCard === target;
    card.classList.toggle('active', active);
    card.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function setOnGridDesignTarget(target = 'bill-offset') {
  const nextTarget = target === 'fill-roof' ? 'fill-roof' : 'bill-offset';
  const input = document.getElementById('on-grid-design-target');
  if (input) input.value = nextTarget;
  window.state.designTarget = nextTarget;
  syncOnGridDesignTargetCards();
  updateOnGridAssumptions();
}

function syncOffgridDesignTargetCards() {
  const target = window.state.designTarget === 'bill-offset' ? 'bill-offset' : 'fill-roof';
  document.querySelectorAll('[data-offgrid-design-target-card]').forEach(card => {
    const active = card.dataset.offgridDesignTargetCard === target;
    card.classList.toggle('active', active);
    card.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const note = document.getElementById('offgrid-design-target-note');
  if (note) {
    note.textContent = target === 'bill-offset'
      ? 'Elektrik ihtiyacına göre sistem seçili: panel sayısı, seçilen profil veya cihaz listesinden türeyen yıllık yüke göre sınırlandırılır.'
      : 'Maksimum alan kapasitesi seçili: panel sayısı net kullanılabilir alana göre sınırlandırılır; fazla üretim ve otonomi potansiyeli ayrıca değerlendirilir.';
  }
  const hideLoadProfiles = target === 'fill-roof';
  const simpleProfileElements = [
    ...document.querySelectorAll('#offgrid-simple-mode-wrap > .offgrid-simple-intro:not(#offgrid-fill-roof-simple-note)'),
    ...document.querySelectorAll('#offgrid-simple-mode-wrap > .offgrid-explain-grid'),
    document.getElementById('offgrid-residential-profile-grid'),
    document.getElementById('offgrid-simple-profile-summary'),
    document.getElementById('offgrid-critical-fraction-row'),
    document.getElementById('offgrid-critical-fraction'),
    document.getElementById('offgrid-critical-fraction-hint')
  ].filter(Boolean);
  simpleProfileElements.forEach(el => {
    el.style.display = hideLoadProfiles ? 'none' : '';
  });
  const fillRoofNote = document.getElementById('offgrid-fill-roof-simple-note');
  if (fillRoofNote) fillRoofNote.style.display = hideLoadProfiles ? '' : 'none';
}

function setOffgridDesignTarget(target = 'fill-roof') {
  window.state.designTarget = target === 'bill-offset' ? 'bill-offset' : 'fill-roof';
  syncOffgridDesignTargetCards();
  updatePanelPreview();
  updateOffgridGeneratorPreview();
  persistState();
}
window.setOffgridDesignTarget = setOffgridDesignTarget;

function syncOnGridMonthlyBillEstimate() {
  const billInput = document.getElementById('on-grid-monthly-bill-estimate');
  if (!billInput || document.activeElement === billInput) return;
  const explicitMonthlyKwh = Math.max(0, Number(window.state.onGridMonthlyConsumptionKwh) || 0);
  const annual = Math.max(0, Number(window.state.annualConsumptionKwh) || Number(window.state.dailyConsumption || 0) * 365 || 0);
  if (!annual && !explicitMonthlyKwh) {
    billInput.value = '';
    window.state.onGridMonthlyBillEstimate = null;
    return;
  }
  const estimate = roundMonthlyBillTry((explicitMonthlyKwh || (annual / 12)) * getOnGridEffectiveImportRate());
  billInput.value = formatMonthlyBillInputValue(estimate);
  window.state.onGridMonthlyBillEstimate = estimate;
}

function syncOnGridMonthlyConsumptionInput() {
  const monthlyInput = document.getElementById('on-grid-monthly-consumption-input');
  if (!monthlyInput || document.activeElement === monthlyInput) return;
  if (!Number.isFinite(Number(window.state.onGridMonthlyConsumptionKwh)) || Number(window.state.onGridMonthlyConsumptionKwh) <= 0) {
    monthlyInput.value = '';
    return;
  }
  monthlyInput.value = Math.round(Number(window.state.onGridMonthlyConsumptionKwh));
}

function setOnGridInputMode(mode = 'basic') {
  window.state.onGridInputMode = mode === 'advanced' ? 'advanced' : 'basic';
  document.querySelectorAll('[data-on-grid-mode-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.onGridModeBtn === window.state.onGridInputMode);
  });
  const advanced = document.getElementById('on-grid-advanced-fields');
  setElementVisible(advanced, window.state.onGridInputMode === 'advanced');
  const advancedCard = document.getElementById('step5-advanced-card');
  if (advancedCard) advancedCard.open = window.state.onGridInputMode === 'advanced';
  if (window.state.onGridInputMode === 'advanced') {
    document.querySelectorAll('#step5-advanced-card > .step5-advanced-body > details.step5-subdetails').forEach((detail, index) => {
      if (index < 2) detail.open = true;
    });
  }
  syncOnGridDesignTargetCards();
  updateOnGridFlowSummary();
  persistState();
}

function updateOnGridFlowSummary() {
  const s = window.state;
  const summary = document.getElementById('on-grid-flow-summary');
  if (!summary) return;
  const annual = Math.round(Number(s.annualConsumptionKwh) || Number(s.dailyConsumption || 0) * 365 || 0);
  const currentMonthLabel = getCurrentMonthLabel();
  const profileLabels = {
    'daytime-heavy': i18n.t('onGridFlow.profileDaytime'),
    balanced: i18n.t('onGridFlow.profileBalanced'),
    'evening-heavy': i18n.t('onGridFlow.profileEvening'),
    'business-hours': i18n.t('onGridFlow.profileBusiness')
  };
  const targetLabel = s.designTarget === 'fill-roof'
    ? 'Maksimum teknik performans'
    : 'Elektrik faturasını dengele';
  const targetCopy = s.designTarget === 'fill-roof'
    ? 'Kurulum alanı izin verdiği sürece panel sayısı artırılır.'
    : 'Sistem yıllık tüketimi karşılayacak seviyede sınırlandırılır.';
  const settlement = s.exportSettlementMode === 'auto'
    ? (s.settlementDate ? `${i18n.t('onGridFlow.settlementAuto')} (${s.settlementDate})` : i18n.t('onGridFlow.settlementAutoMissing'))
    : s.exportSettlementMode === 'hourly' ? i18n.t('onGridFlow.settlementHourly') : i18n.t('onGridFlow.settlementMonthly');
  const monthlyKwh = Math.round(Number(s.onGridMonthlyConsumptionKwh) || (annual / 12) || 0);
  const monthlyBill = roundMonthlyBillTry(Number(s.onGridMonthlyBillEstimate) || (monthlyKwh * getOnGridEffectiveImportRate()) || 0);
  const profileSource = s.hourlyProfileSource === 'hourly-uploaded'
    ? 'Gerçek 8760 veri'
    : s.hourlyProfileSource === 'monthly-derived'
      ? 'Aylık veriden türetildi'
      : 'Varsayılan sentetik profil';
  const defaultsSummary = `${profileLabels[s.usageProfile] || profileLabels.balanced} · ${Math.round((Number(s.usableRoofRatio) || 0.75) * 100)}% net alan`;
  summary.innerHTML = `
    <div><strong>${targetLabel}</strong><span>${targetCopy}</span></div>
    <div><strong>${annual.toLocaleString('tr-TR')} kWh/yıl</strong><span>Hesapta kullanılan tüketim hedefi</span></div>
    <div><strong>${monthlyKwh > 0 ? `${monthlyKwh.toLocaleString('tr-TR')} kWh/${currentMonthLabel}` : 'Otomatik'}</strong><span>Girilen fatura ayı tüketimi; yıllık değer bu aydan ölçeklenir</span></div>
    <div><strong>${monthlyBill > 0 ? `${formatMonthlyBillTry(monthlyBill)} ₺/${currentMonthLabel}` : 'Otomatik'}</strong><span>Seçili tarife varsayımına göre aynı ay için yaklaşık fatura karşılığı</span></div>
    <div><strong>${defaultsSummary}</strong><span>Basit modun otomatik profili ve alan kabulü</span></div>
    <div><strong>${settlement}</strong><span>${i18n.t('onGridFlow.summarySettlement')}</span></div>
    <div><strong>${profileSource}</strong><span>Tüketim eğrisinin hesapta üretildiği kaynak</span></div>
  `;
  const basicNarrative = document.getElementById('on-grid-basic-target-copy');
  if (basicNarrative) {
    basicNarrative.textContent = s.designTarget === 'fill-roof'
      ? 'Bu seçimde sistem, net kullanılabilir alan ve panel ölçülerine göre teknik olarak sığabilecek en yüksek kurulu güce çıkarılır. Tüketiminiz daha düşük olsa bile sonuç sayfasında olası fazla üretim ayrıca gösterilir.'
      : `Bu seçimde sistem, yıllık yaklaşık ${annual.toLocaleString('tr-TR')} kWh tüketimi karşılamaya odaklanır. Kullanıcı ek veri vermezse dengeli tüketim profili, ${Math.round((Number(s.usableRoofRatio) || 0.75) * 100)}% net alan kullanımı ve otomatik mahsuplaşma varsayımı uygulanır.`;
  }
  const quickBillNote = document.getElementById('on-grid-bill-estimate-note');
  if (quickBillNote) {
    quickBillNote.textContent = s.onGridMonthlyConsumptionKwh
      ? `${currentMonthLabel} faturası için ${Math.round(s.onGridMonthlyConsumptionKwh).toLocaleString('tr-TR')} kWh ana tüketim girdisi olarak kullanılıyor. Yıllık ihtiyaç, mevsimsel aylık dağılım varsayımıyla bu aydan türetilir; TL tutarı girerseniz yalnızca yaklaşık karşılık ve kontrol amacıyla değerlendirilir.`
      : monthlyBill > 0
        ? `${currentMonthLabel} için yaklaşık fatura ${formatMonthlyBillTry(monthlyBill)} ₺ olarak hesaplandı. Mümkünse faturadaki gerçek kWh tüketimini girin; TL tutarı girilirse önce bu ayın kWh değeri, ardından yıllık ihtiyaç mevsimsel dağılımla türetilir.`
        : `Mümkünse ${currentMonthLabel} faturasındaki gerçek kWh tüketimini girin. TL tutarı sadece yaklaşık tahmin içindir; girilirse önce bu ayın kWh değeri, ardından yıllık ihtiyaç mevsimsel dağılımla türetilir.`;
  }
  syncOnGridDesignTargetCards();
}

function updateOnGridAssumptions(options = {}) {
  const s = window.state;
  s.subscriberType = document.getElementById('on-grid-subscriber-type')?.value || s.subscriberType || 'residential';
  s.connectionType = document.getElementById('on-grid-connection-type')?.value || s.connectionType || 'trifaze';
  s.usageProfile = document.getElementById('on-grid-usage-profile')?.value || s.usageProfile || 'balanced';
  s.designTarget = document.getElementById('on-grid-design-target')?.value || s.designTarget || 'fill-roof';
  s.roofType = document.getElementById('on-grid-roof-type')?.value || s.roofType || 'flat-concrete';
  s.shadingQuality = document.getElementById('on-grid-shading-quality')?.value || s.shadingQuality || 'user-estimate';
  s.usableRoofRatio = Math.max(0.1, Math.min(0.95, (Number(document.getElementById('on-grid-usable-roof-ratio')?.value) || (s.usableRoofRatio * 100) || 75) / 100));
  s.distributionFee = Math.max(0, Number(document.getElementById('distribution-fee-input')?.value) || 0);
  // Compute hourlyProfileSource from current state
  if (Array.isArray(s.hourlyConsumption8760) && s.hourlyConsumption8760.length >= 8760) {
    s.hourlyProfileSource = 'hourly-uploaded';
  } else if (Array.isArray(s.monthlyConsumption) && s.monthlyConsumption.some(v => v > 0)) {
    s.hourlyProfileSource = 'monthly-derived';
  } else {
    s.hourlyProfileSource = 'synthetic';
  }
  const mappedTariff = ONGRID_SUBSCRIBER_TO_TARIFF[s.subscriberType] || 'custom';
  if (s.scenarioKey === 'on-grid' && mappedTariff !== s.tariffType) {
    const tariffTypeEl = document.getElementById('tariff-type');
    if (tariffTypeEl) tariffTypeEl.value = mappedTariff;
    updateTariffType(mappedTariff);
  }
  const annualInput = Number(document.getElementById('on-grid-annual-consumption')?.value);
  const monthlyConsumptionInput = Number(document.getElementById('on-grid-monthly-consumption-input')?.value);
  const monthlyBillEstimateInput = Number(document.getElementById('on-grid-monthly-bill-estimate')?.value);
  s.onGridMonthlyConsumptionKwh = Number.isFinite(monthlyConsumptionInput) && monthlyConsumptionInput > 0
    ? Math.round(monthlyConsumptionInput)
    : null;
  s.onGridMonthlyBillEstimate = Number.isFinite(monthlyBillEstimateInput) && monthlyBillEstimateInput > 0
    ? roundMonthlyBillTry(monthlyBillEstimateInput)
    : null;
  if (options.source === 'monthly-kwh' && s.onGridMonthlyConsumptionKwh) {
    const derivedAnnual = deriveAnnualFromCurrentMonthKwh(s.onGridMonthlyConsumptionKwh);
    s.annualConsumptionKwh = derivedAnnual;
    s.dailyConsumption = derivedAnnual / 365;
    const annualField = document.getElementById('on-grid-annual-consumption');
    if (annualField) annualField.value = derivedAnnual;
    if (options.fillMonthly !== false) fillOnGridMonthlyFromAnnual(derivedAnnual);
  }
  if (options.source === 'monthly-bill' && s.onGridMonthlyBillEstimate) {
    const currentMonthKwh = Math.max(0, Math.round(s.onGridMonthlyBillEstimate / Math.max(0.01, getOnGridEffectiveImportRate())));
    const derivedAnnual = deriveAnnualFromCurrentMonthKwh(currentMonthKwh);
    s.onGridMonthlyConsumptionKwh = currentMonthKwh;
    s.annualConsumptionKwh = derivedAnnual;
    s.dailyConsumption = derivedAnnual / 365;
    const annualField = document.getElementById('on-grid-annual-consumption');
    if (annualField) annualField.value = derivedAnnual;
    if (options.fillMonthly !== false) fillOnGridMonthlyFromAnnual(derivedAnnual);
  }
  if (options.source !== 'monthly-bill' && options.source !== 'monthly-kwh' && Number.isFinite(annualInput) && annualInput > 0) {
    s.annualConsumptionKwh = Math.round(annualInput);
    s.dailyConsumption = s.annualConsumptionKwh / 365;
    if (options.fillMonthly || !Array.isArray(s.monthlyConsumption)) fillOnGridMonthlyFromAnnual(s.annualConsumptionKwh);
  }
  const dailySlider = document.getElementById('consumption-slider');
  if (dailySlider && s.dailyConsumption) dailySlider.value = Math.max(2, Math.min(100, Math.round(s.dailyConsumption)));
  const usableHint = document.getElementById('on-grid-usable-roof-hint');
  if (usableHint) usableHint.textContent = `${Math.round(s.usableRoofRatio * 100)}% net alan: servis boşluğu, parapet, yangın yolu ve bakım koridoru sonrası ön fizibilite varsayımı.`;
  updatePanelPreview();
  syncOnGridMonthlyConsumptionInput();
  syncOnGridMonthlyBillEstimate();
  updateOnGridFlowSummary();
  persistState();
}

function applyManualCoordinates() {
  const lat = Number(document.getElementById('manual-lat-input')?.value);
  const lon = Number(document.getElementById('manual-lon-input')?.value);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    showToast('Lütfen geçerli enlem ve boylam girin.', 'error');
    return;
  }
  selectLocationFromLatLon(lat, lon, true);
  if (window.state?.lat && window.state?.lon && map) {
    map.setView([window.state.lat, window.state.lon], 10, { animate: true });
  }
}

let assumptionRecalcTimer = null;
function scheduleAssumptionRecalculation() {
  if (!window.state?.results || isCalculationInProgress()) return;
  clearTimeout(assumptionRecalcTimer);
  assumptionRecalcTimer = setTimeout(() => {
    if (!window.state?.results || isCalculationInProgress()) return;
    runCalculation().catch(err => {
      console.warn('[assumptions] recalculation failed:', err);
      showToast('Varsayım değişikliği sonrası hesaplama yenilenemedi.', 'error');
    });
  }, 450);
}

function setAssumptionSectionVisible(id, visible) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('is-hidden', !visible);
}

function syncAssumptionControlsFromState() {
  const s = window.state;
  Object.assign(s, normalizeAssumptionUiState(s));
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = value;
  };
  setVal('cost-profile-select', s.costProfile || ASSUMPTION_UI_DEFAULTS.costProfile);
  setVal('panel-form-factor-select', s.panelFormFactor || ASSUMPTION_UI_DEFAULTS.panelFormFactor);
  setVal('financial-profile-select', s.financialProfile || ASSUMPTION_UI_DEFAULTS.financialProfile);
  setVal('vat-profile-select', s.vatProfile || ASSUMPTION_UI_DEFAULTS.vatProfile);
  setVal('manual-cost-mode-select', s.manualCostMode || ASSUMPTION_UI_DEFAULTS.manualCostMode);

  const financialAssumptions = resolveFinancialAssumptions(s);
  setVal('price-increase-input', Math.round((financialAssumptions.tariffIncreaseCurve?.[0]?.rate ?? 0) * 100));
  setVal('discount-rate-input', Math.round((financialAssumptions.discountRate ?? 0) * 100));
  setVal('custom-tariff-increase-rate', Math.round((financialAssumptions.tariffIncreaseCurve?.[0]?.rate ?? 0) * 100));
  setVal('custom-discount-rate', Math.round((financialAssumptions.discountRate ?? 0) * 100));

  setAssumptionSectionVisible('custom-finance-fields', s.financialProfile === 'custom');
  setAssumptionSectionVisible('manual-vat-fields', s.vatProfile === 'manual');
  setAssumptionSectionVisible('manual-cost-fields', s.manualCostMode !== 'none');
  setAssumptionSectionVisible('full-manual-bom-warning', s.manualCostMode === 'fullManualBom');

  const vat = s.manualVatRates || {};
  setVal('manual-panel-vat-rate', vat.panelVatRate != null ? Math.round(Number(vat.panelVatRate) * 100) : '');
  setVal('manual-inverter-vat-rate', vat.inverterVatRate != null ? Math.round(Number(vat.inverterVatRate) * 100) : '');
  setVal('manual-bos-vat-rate', vat.bosVatRate != null ? Math.round(Number(vat.bosVatRate) * 100) : '');
  setVal('manual-labor-vat-rate', vat.laborVatRate != null ? Math.round(Number(vat.laborVatRate) * 100) : '');

  const manual = s.manualCostOverrides || {};
  [
    ['manual-panel-cost', 'panelCost'],
    ['manual-inverter-cost', 'inverterCost'],
    ['manual-mounting-cost', 'mountingCost'],
    ['manual-dc-cable-cost', 'dcCableCost'],
    ['manual-ac-electrical-cost', 'acElecCost'],
    ['manual-labor-cost', 'laborCost'],
    ['manual-engineering-cost', 'engineeringCost'],
    ['manual-logistics-cost', 'logisticsCost'],
    ['manual-permit-cost', 'permitCost']
  ].forEach(([id, key]) => setVal(id, manual[key] ?? ''));
}

function readAssumptionControls() {
  const s = window.state;
  const enumState = normalizeAssumptionUiState({
    costProfile: document.getElementById('cost-profile-select')?.value || s.costProfile,
    panelFormFactor: document.getElementById('panel-form-factor-select')?.value || s.panelFormFactor,
    financialProfile: document.getElementById('financial-profile-select')?.value || s.financialProfile,
    vatProfile: document.getElementById('vat-profile-select')?.value || s.vatProfile,
    manualCostMode: document.getElementById('manual-cost-mode-select')?.value || s.manualCostMode
  });
  Object.assign(s, enumState);

  if (s.financialProfile === 'custom') {
    const discountPct = document.getElementById('custom-discount-rate')?.value || document.getElementById('discount-rate-input')?.value;
    const tariffPct = document.getElementById('custom-tariff-increase-rate')?.value || document.getElementById('price-increase-input')?.value;
    if (discountPct !== undefined && discountPct !== '') s.customDiscountRate = Math.max(0, Math.min(1, Number(discountPct) / 100 || 0));
    if (tariffPct !== undefined && tariffPct !== '') s.customTariffIncreaseCurve = flatTariffIncreaseCurveFromPercent(tariffPct);
    const priceEl = document.getElementById('price-increase-input');
    const discountEl = document.getElementById('discount-rate-input');
    if (priceEl && tariffPct !== undefined && tariffPct !== '') priceEl.value = String(Math.round(Number(tariffPct) || 0));
    if (discountEl && discountPct !== undefined && discountPct !== '') discountEl.value = String(Math.round(Number(discountPct) || 0));
  } else {
    s.customDiscountRate = null;
    s.customTariffIncreaseCurve = null;
    const resolved = resolveFinancialAssumptions(s);
    const priceEl = document.getElementById('price-increase-input');
    const discountEl = document.getElementById('discount-rate-input');
    if (priceEl) priceEl.value = Math.round((resolved.tariffIncreaseCurve?.[0]?.rate ?? 0) * 100);
    if (discountEl) discountEl.value = Math.round((resolved.discountRate ?? 0) * 100);
  }

  if (s.vatProfile === 'manual') {
    s.manualVatRates = manualVatRatesFromUi({
      panelVatRate: document.getElementById('manual-panel-vat-rate')?.value,
      inverterVatRate: document.getElementById('manual-inverter-vat-rate')?.value,
      bosVatRate: document.getElementById('manual-bos-vat-rate')?.value,
      laborVatRate: document.getElementById('manual-labor-vat-rate')?.value
    });
  } else {
    s.manualVatRates = null;
  }

  if (s.manualCostMode === 'none') {
    s.manualCostOverrides = null;
  } else {
    s.manualCostOverrides = compactManualCostOverrides({
      panelCost: document.getElementById('manual-panel-cost')?.value,
      inverterCost: document.getElementById('manual-inverter-cost')?.value,
      mountingCost: document.getElementById('manual-mounting-cost')?.value,
      dcCableCost: document.getElementById('manual-dc-cable-cost')?.value,
      acElecCost: document.getElementById('manual-ac-electrical-cost')?.value,
      laborCost: document.getElementById('manual-labor-cost')?.value,
      engineeringCost: document.getElementById('manual-engineering-cost')?.value,
      logisticsCost: document.getElementById('manual-logistics-cost')?.value,
      permitCost: document.getElementById('manual-permit-cost')?.value
    });
  }
}

function updateAssumptionControls() {
  const beforeCostProfile = window.state.costProfile;
  const beforePanelFormFactor = window.state.panelFormFactor;
  readAssumptionControls();
  syncAssumptionControlsFromState();
  if (beforeCostProfile !== window.state.costProfile || beforePanelFormFactor !== window.state.panelFormFactor) {
    buildPanelCards();
    buildInverterCards();
  }
  updatePanelPreview();
  persistState();
  scheduleAssumptionRecalculation();
}

function updateTariffAssumptions() {
  const s = window.state;
  const readNumber = (id, fallback) => {
    const raw = document.getElementById(id)?.value;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  let importTariffBase = readNumber('tariff-input', s.importTariffBase || s.tariff || DEFAULT_RESIDENTIAL_TARIFF);
  s.importTariffBase = importTariffBase;
  s.exportTariff = readNumber('export-tariff-input', s.exportTariff ?? 2.27);
  if (s.scenarioKey === 'on-grid') updateOnGridAssumptions();
  importTariffBase = readNumber('tariff-input', s.importTariffBase || importTariffBase);
  s.importTariffBase = importTariffBase;
  s.tariffInputMode = document.getElementById('tariff-input-mode')?.value || s.tariffInputMode || 'net-plus-fee';
  s.tariffSourceType = document.getElementById('tariff-source-type')?.value || s.tariffSourceType || 'official';
  s.costSourceType = document.getElementById('cost-source-type')?.value || s.costSourceType || 'catalog';
  // Keep state.tariff as the import tariff entered by the user. buildTariffModel
  // combines it with distributionFee for net-plus-fee mode.
  s.tariff = importTariffBase;
  // Disable distribution fee field when gross mode to prevent user confusion
  const distFeeInput = document.getElementById('distribution-fee-input');
  const distFeeLabel = document.getElementById('distribution-fee-label');
  if (distFeeInput) {
    distFeeInput.disabled = (s.tariffInputMode === 'gross');
    if (distFeeLabel) distFeeLabel.style.opacity = (s.tariffInputMode === 'gross') ? '0.4' : '';
  }
  if (s.scenarioKey === 'on-grid') {
    syncOnGridMonthlyBillEstimate();
    updateOnGridFlowSummary();
  }
  s.tariffRegime = document.getElementById('tariff-regime')?.value || s.tariffRegime || 'auto';
  s.tariffMode = s.tariffRegime;
  s.exportSettlementMode = document.getElementById('export-settlement-mode')?.value || s.exportSettlementMode || 'auto';
  s.settlementDate = document.getElementById('settlement-date')?.value || s.settlementDate || currentLocalDateIso();
  const settlementDateInput = document.getElementById('settlement-date');
  if (settlementDateInput && !settlementDateInput.value) settlementDateInput.value = s.settlementDate;
  s.offGridCostPerKwh = parseFloat(document.getElementById('off-grid-cost-per-kwh')?.value) || null;
  // Sync off-grid cost warning live as user types
  const offGridCostWarn = document.getElementById('off-grid-cost-warn');
  if (offGridCostWarn) offGridCostWarn.style.display = (s.scenarioKey === 'off-grid' && !s.offGridCostPerKwh) ? '' : 'none';
  // Faz-4 Fix-16: Read irrigation pump inputs
  if (s.scenarioKey === 'agricultural-irrigation') {
    s.irrigPumpKw = parseFloat(document.getElementById('irrig-pump-kw')?.value) || 0;
    s.irrigHoursPerDay = parseFloat(document.getElementById('irrig-hours-per-day')?.value) || 0;
    s.irrigSeasonStart = parseInt(document.getElementById('irrig-season-start')?.value) || 4;
    s.irrigSeasonEnd = parseInt(document.getElementById('irrig-season-end')?.value) || 9;
    // Clamp season months to valid range
    s.irrigSeasonStart = Math.max(1, Math.min(12, s.irrigSeasonStart));
    s.irrigSeasonEnd = Math.max(1, Math.min(12, s.irrigSeasonEnd));
    // Live preview of computed annual load
    if (s.irrigPumpKw > 0 && s.irrigHoursPerDay > 0) {
      const endM = s.irrigSeasonEnd >= s.irrigSeasonStart ? s.irrigSeasonEnd : s.irrigSeasonEnd + 12;
      const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
      let seasonDays = 0;
      for (let m = s.irrigSeasonStart; m <= endM; m++) seasonDays += MONTH_DAYS[(m - 1) % 12];
      const annualKwh = Math.round(s.irrigPumpKw * s.irrigHoursPerDay * seasonDays);
      const el = document.getElementById('irrig-load-preview');
      if (el) el.textContent = `Hesaplanan yıllık yük: ${annualKwh.toLocaleString('tr-TR')} kWh (${seasonDays} gün × ${s.irrigHoursPerDay} saat/gün × ${s.irrigPumpKw} kW)`;
      // Update irrigation-season warn based on pump data completeness
      const irrigWarn2 = document.getElementById('irrigation-season-warn');
      if (irrigWarn2) irrigWarn2.style.display = 'none';
    }
  }
  s.annualLoadGrowth = (parseFloat(document.getElementById('annual-load-growth')?.value) || 0) / 100;
  s.contractedPowerKw = readNumber('contracted-power-input', s.contractedPowerKw || 0);
  s.contractedTariff = readNumber('contracted-tariff-input', s.contractedTariff ?? s.tariff);
  s.skttTariff = readNumber('sktt-tariff-input', s.skttTariff ?? s.tariff);
  s.previousYearConsumptionKwh = readNumber('previous-year-consumption-input', s.previousYearConsumptionKwh ?? 0);
  s.currentYearConsumptionKwh = readNumber('current-year-consumption-input', s.currentYearConsumptionKwh ?? 0);
  s.sellableExportCapKwh = readNumber('sellable-export-cap-input', s.sellableExportCapKwh ?? 0);
  s.usdToTry = readNumber('usd-try-input', s.usdToTry || 38.5);
  s.displayCurrency = document.getElementById('display-currency')?.value || s.displayCurrency || 'TRY';
  readAssumptionControls();
  const financialDefaults = resolveFinancialAssumptions(s);
  const priceIncreaseEl = document.getElementById('price-increase-input');
  const discountRateEl = document.getElementById('discount-rate-input');
  if (priceIncreaseEl && priceIncreaseEl.value !== '') {
    const fallbackPct = (financialDefaults.tariffIncreaseCurve?.[0]?.rate ?? 0) * 100;
    const enteredPct = readNumber('price-increase-input', fallbackPct);
    if (s.financialProfile === 'custom' || Math.round(enteredPct) !== Math.round(fallbackPct)) {
      s.financialProfile = 'custom';
      s.customTariffIncreaseCurve = [{ fromYear: 1, toYear: 25, rate: enteredPct / 100 }];
    }
  }
  if (discountRateEl && discountRateEl.value !== '') {
    const fallbackPct = financialDefaults.discountRate * 100;
    const enteredPct = readNumber('discount-rate-input', fallbackPct);
    if (s.financialProfile === 'custom' || Math.round(enteredPct) !== Math.round(fallbackPct)) {
      s.financialProfile = 'custom';
      s.customDiscountRate = enteredPct / 100;
    }
  }
  s.expenseEscalationRate = readNumber('expense-escalation-input', 15) / 100;
  s.tariffIncludesTax = document.getElementById('tariff-tax-included')?.checked ?? true;
  s.hasSignedCustomerBillData = document.getElementById('quote-bill-verified')?.checked ?? false;
  s.quoteInputsVerified = document.getElementById('quote-inputs-verified')?.checked ?? false;
  s.quoteReadyApproved = document.getElementById('quote-ready-approved')?.checked ?? false;
  const tariffSourceDateInput = document.getElementById('tariff-source-date')?.value || '';
  const tariffSourceCheckedInput = document.getElementById('tariff-source-checked-at')?.value || '';
  s.tariffSourceDate = tariffSourceDateInput || (s.tariffSourceType === 'official' ? (s.tariffSourceDate || DEFAULT_TARIFF_SOURCE_DATE) : null);
  s.tariffSourceCheckedAt = tariffSourceCheckedInput || s.tariffSourceCheckedAt || (s.tariffSourceType === 'official' ? currentLocalDateIso() : null);
  if (s.tariffSourceType !== 'official' && !tariffSourceCheckedInput) {
    s.tariffSourceCheckedAt = null;
  }
  const tariffEvidenceStatus = s.tariffSourceType === 'official'
    ? (document.getElementById('tariff-evidence-status')?.value || s.evidence?.tariffSource?.status || 'verified')
    : 'missing';
  s.evidence = {
    ...(s.evidence || {}),
    customerBill: {
      ...(s.evidence?.customerBill || {}),
      status: document.getElementById('bill-evidence-status')?.value || (s.hasSignedCustomerBillData ? 'verified' : 'missing'),
      ref: document.getElementById('bill-evidence-ref')?.value || s.evidence?.customerBill?.ref || '',
      checkedAt: document.getElementById('bill-evidence-date')?.value || s.evidence?.customerBill?.checkedAt || null
    },
    tariffSource: {
      ...(s.evidence?.tariffSource || {}),
      status: tariffEvidenceStatus,
      ref: document.getElementById('tariff-evidence-ref')?.value || (s.tariffSourceType === 'official' ? (s.evidence?.tariffSource?.ref || APRIL_2026_TARIFF_SOURCE.evidenceRef) : '') || '',
      checkedAt: s.tariffSourceCheckedAt,
      sourceUrl: s.tariffSourceType === 'official'
        ? (document.getElementById('tariff-evidence-url')?.value || s.evidence?.tariffSource?.sourceUrl || APRIL_2026_TARIFF_SOURCE.sourceUrl)
        : ''
    }
  };
  const snapshot = JSON.stringify({
    tariff: s.tariff,
    tariffType: s.tariffType,
    tariffRegime: s.tariffRegime,
    exportTariff: s.exportTariff,
    sourceCheckedAt: s.tariffSourceCheckedAt,
    billEvidence: s.evidence.customerBill?.status,
    tariffEvidence: s.evidence.tariffSource?.status
  });
  if (lastTariffAuditSnapshot && lastTariffAuditSnapshot !== snapshot) {
    appendAuditEntry(s, 'assumptions.tariff_updated', {
      tariff: s.tariff,
      tariffType: s.tariffType,
      tariffRegime: s.tariffRegime,
      exportTariff: s.exportTariff,
      sourceCheckedAt: s.tariffSourceCheckedAt
    }, currentUser());
  }
  lastTariffAuditSnapshot = snapshot;
  syncAssumptionControlsFromState();
  persistState();
}

function updateProposalGovernanceInput() {
  const s = window.state;
  const numPct = (id, fallback) => {
    const n = Number(document.getElementById(id)?.value);
    return Number.isFinite(n) ? n / 100 : fallback;
  };
  updateUserIdentityInput();
  const requestedApprovalState = document.getElementById('proposal-approval-state')?.value || s.proposalApproval?.state || 'draft';
  const previousApprovalState = s.proposalApproval?.state || 'draft';
  const existingApprovalRecord = s.proposalApproval?.approvalRecord || null;
  s.bomCommercials = {
    ...(s.bomCommercials || {}),
    marginRate: numPct('bom-margin-rate', s.bomCommercials?.marginRate ?? 0.18),
    contingencyRate: numPct('bom-contingency-rate', s.bomCommercials?.contingencyRate ?? 0.05),
    supplierQuoteState: document.getElementById('supplier-quote-state')?.value || s.bomCommercials?.supplierQuoteState || 'not-requested',
    supplierQuoteRef: document.getElementById('supplier-quote-ref')?.value || s.bomCommercials?.supplierQuoteRef || '',
    supplierQuoteDate: document.getElementById('supplier-quote-date')?.value || s.bomCommercials?.supplierQuoteDate || null,
    supplierQuoteValidUntil: document.getElementById('supplier-quote-valid-until')?.value || s.bomCommercials?.supplierQuoteValidUntil || null
  };
  s.evidence = {
    ...(s.evidence || {}),
    supplierQuote: {
      ...(s.evidence?.supplierQuote || {}),
      status: s.bomCommercials.supplierQuoteState === 'received' ? 'verified' : s.bomCommercials.supplierQuoteState,
      ref: s.bomCommercials.supplierQuoteRef,
      issuedAt: s.bomCommercials.supplierQuoteDate,
      validUntil: s.bomCommercials.supplierQuoteValidUntil
    }
  };
  s.financing = {
    ...(s.financing || {}),
    annualRate: numPct('loan-annual-rate', s.financing?.annualRate ?? 0.35),
    termYears: Number(document.getElementById('loan-term-years')?.value) || s.financing?.termYears || 5
  };
  s.maintenanceContract = {
    ...(s.maintenanceContract || {}),
    contractStatus: document.getElementById('maintenance-contract-status')?.value || s.maintenanceContract?.contractStatus || 'not-offered'
  };
  if (document.getElementById('grid-checklist-complete')?.checked) {
    const labels = {
      bill: 'Son 12 aylık tüketim/fatura kanıtı',
      titleOrLease: 'Tapu/kira ve kullanım hakkı evrakı',
      connectionOpinion: 'Dağıtım şirketi bağlantı görüşü',
      singleLine: 'Tek hat şeması',
      staticReview: 'Statik uygunluk/taşıyıcı sistem kontrolü',
      layout: 'Kurulum alanı yerleşim planı',
      inverterDocs: 'İnverter/panel teknik dokümanları',
      metering: 'Sayaç/mahsuplaşma gereksinimleri'
    };
    s.gridApplicationChecklist = Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, { label, done: true, evidence: 'manual-confirmation' }]));
    s.evidence = {
      ...(s.evidence || {}),
      gridApplication: {
        ...(s.evidence?.gridApplication || {}),
        status: 'verified',
        ref: 'grid-checklist-manual',
        checkedAt: new Date().toISOString().slice(0, 10)
      }
    };
  }
  s.proposalApproval = {
    ...(s.proposalApproval || {}),
    state: requestedApprovalState,
    approvedBy: document.getElementById('proposal-approved-by')?.value || s.proposalApproval?.approvedBy || '',
    approvedAt: s.proposalApproval?.approvedAt || null,
    updatedBy: s.userIdentity?.name || s.proposalApproval?.updatedBy || 'local-user',
    approvalRecord: existingApprovalRecord
  };
  const workflow = buildApprovalWorkflow(s, s.results?.proposalGovernance?.confidence || s.results?.confidence || null);
  s.proposalApproval = {
    ...(s.proposalApproval || {}),
    state: workflow.state,
    approvedBy: workflow.approvedBy || (workflow.state === 'approved' ? s.proposalApproval?.approvedBy : ''),
    approvedAt: workflow.approvedAt || (workflow.state === 'approved' ? s.proposalApproval?.approvedAt : null),
    approvalRecord: workflow.approvalRecord,
    history: workflow.history
  };
  const approvalSelect = document.getElementById('proposal-approval-state');
  if (approvalSelect && approvalSelect.value !== workflow.state) approvalSelect.value = workflow.state;
  const approvedByInput = document.getElementById('proposal-approved-by');
  if (approvedByInput) approvedByInput.value = s.proposalApproval.approvedBy || '';

  if (requestedApprovalState === 'approved' && workflow.state !== 'approved') {
    window.showToast?.(`Onay bloke edildi: ${workflow.blockers.slice(0, 2).join(' ')}`, 'error');
    appendAuditEntry(s, 'approval.blocked_requirements', {
      requestedBy: s.userIdentity?.name,
      role: s.userIdentity?.role,
      blockers: workflow.blockers
    }, s.userIdentity);
  } else if (requestedApprovalState === 'approved' && workflow.state === 'approved' && !existingApprovalRecord) {
    appendAuditEntry(s, 'approval.created', {
      approvedBy: workflow.approvedBy,
      approvedAt: workflow.approvedAt
    }, s.userIdentity);
  } else if (requestedApprovalState === 'approved' && existingApprovalRecord && workflow.blockers.includes('Mevcut immutable onay kaydı sessizce değiştirilemez; yeni revizyon/onay süreci açılmalı.')) {
    appendAuditEntry(s, 'approval.immutable_edit_blocked', {
      retainedApprovedBy: existingApprovalRecord.approvedBy
    }, s.userIdentity);
  } else if (previousApprovalState !== workflow.state) {
    appendAuditEntry(s, 'approval.state_changed', { from: previousApprovalState, to: workflow.state }, s.userIdentity);
  }
  appendAuditEntry(s, 'proposal.governance_updated', {
    approvalState: s.proposalApproval.state,
    supplierQuoteState: s.bomCommercials.supplierQuoteState,
    maintenanceContract: s.maintenanceContract.contractStatus
  }, s.userIdentity);
  persistState();
  if (s.results) window.renderResults?.();
}

function updateUserIdentityInput() {
  const s = window.state;
  s.userIdentity = normalizeUserIdentity({
    ...(s.userIdentity || {}),
    name: document.getElementById('user-name-input')?.value || s.userIdentity?.name || 'local-user',
    role: document.getElementById('user-role-input')?.value || s.userIdentity?.role || 'sales'
  });
  persistState();
}

function syncEnterpriseInputsFromState() {
  const s = window.state;
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = value;
  };
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  };
  setVal('city-search', s.cityName || '');
  setVal('roof-area', s.roofArea || '');
  setVal('tariff-type', s.tariffType);
  setVal('tariff-regime', s.tariffRegime);
  setVal('tariff-input', s.tariff);
  setVal('sktt-tariff-input', s.skttTariff);
  setVal('contracted-tariff-input', s.contractedTariff);
  setVal('contracted-power-input', s.contractedPowerKw);
  setVal('export-tariff-input', s.exportTariff);
  setVal('export-settlement-mode', s.exportSettlementMode);
  setVal('settlement-date', s.settlementDate || currentLocalDateIso());
  setVal('previous-year-consumption-input', s.previousYearConsumptionKwh ?? 0);
  setVal('current-year-consumption-input', s.currentYearConsumptionKwh ?? 0);
  setVal('sellable-export-cap-input', s.sellableExportCapKwh ?? 0);
  const financialAssumptions = resolveFinancialAssumptions(s);
  setVal('price-increase-input', Math.round((financialAssumptions.tariffIncreaseCurve?.[0]?.rate ?? 0) * 100));
  setVal('discount-rate-input', Math.round((financialAssumptions.discountRate ?? 0) * 100));
  setVal('expense-escalation-input', Math.round((s.expenseEscalationRate ?? 0.15) * 100));
  setVal('tariff-source-date', s.tariffSourceDate);
  setVal('tariff-source-checked-at', s.tariffSourceCheckedAt);
  setVal('tariff-evidence-status', s.evidence?.tariffSource?.status);
  setVal('tariff-evidence-ref', s.evidence?.tariffSource?.ref);
  setVal('tariff-evidence-url', s.evidence?.tariffSource?.sourceUrl);
  setVal('display-currency', s.displayCurrency);
  setVal('usd-try-input', s.usdToTry);
  syncAssumptionControlsFromState();
  setChecked('tariff-tax-included', s.tariffIncludesTax);
  setChecked('quote-bill-verified', s.hasSignedCustomerBillData);
  setVal('bill-evidence-ref', s.evidence?.customerBill?.ref);
  setVal('bill-evidence-date', s.evidence?.customerBill?.checkedAt);
  setVal('bill-evidence-status', s.evidence?.customerBill?.status);
  setVal('user-name-input', s.userIdentity?.name);
  setVal('user-role-input', s.userIdentity?.role);
  setVal('proposal-approval-state', s.proposalApproval?.state);
  setVal('proposal-approved-by', s.proposalApproval?.approvedBy);
  setVal('bom-margin-rate', Math.round((s.bomCommercials?.marginRate ?? 0.18) * 100));
  setVal('bom-contingency-rate', Math.round((s.bomCommercials?.contingencyRate ?? 0.05) * 100));
  setVal('supplier-quote-state', s.bomCommercials?.supplierQuoteState);
  setVal('supplier-quote-ref', s.bomCommercials?.supplierQuoteRef);
  setVal('supplier-quote-date', s.bomCommercials?.supplierQuoteDate);
  setVal('supplier-quote-valid-until', s.bomCommercials?.supplierQuoteValidUntil);
  setVal('loan-annual-rate', Math.round((s.financing?.annualRate ?? 0.35) * 100));
  setVal('loan-term-years', s.financing?.termYears);
  setVal('maintenance-contract-status', s.maintenanceContract?.contractStatus);
  setChecked('quote-inputs-verified', s.quoteInputsVerified);
  setChecked('quote-ready-approved', s.quoteReadyApproved);
  if (window.map && s.lat && s.lon) window.map.setView([s.lat, s.lon], 9);
  if (window.marker && s.lat && s.lon) window.marker.setLatLng([s.lat, s.lon]);
  if (s.cityName && document.getElementById('selected-loc-text')) {
    document.getElementById('selected-loc-text').textContent =
      `${s.cityName} — ${Number(s.lat || 0).toFixed(4)}°K, ${Number(s.lon || 0).toFixed(4)}°D (GHI: ${s.ghi || '—'})`;
  }
  renderEvidenceFileStatus();
}

function renderEvidenceFileStatus() {
  const types = ['customerBill', 'supplierQuote', 'tariffSource'];
  if (window.state.scenarioKey === 'off-grid') {
    types.push(
      'offgridPvProduction',
      'offgridLoadProfile',
      'offgridCriticalLoadProfile',
      'offgridHighResLoadProfile',
      'offgridInverterEventLog',
      'offgridSiteShading',
      'offgridEquipmentDatasheets',
      'offgridCommissioningReport',
      'offgridAcceptanceTest',
      'offgridMonitoringCalibration',
      'offgridAsBuiltDocs',
      'offgridWarrantyOandM',
      'offgridTelemetry30Day',
      'offgridPerformanceBaseline',
      'offgridMaintenanceLog',
      'offgridIncidentLog',
      'offgridRemoteMonitoringSla',
      'offgridAnnualRevalidation',
      'offgridBatteryHealthReport',
      'offgridGeneratorServiceRecord',
      'offgridFirmwareSettingsBackup',
      'offgridCustomerSignoff'
    );
  }
  const missingLabel = i18n.t('common.noFile');
  const rows = types.map(type => {
    const files = window.state.evidence?.[type]?.files || [];
    const latest = files[files.length - 1];
    const localizedLabel = i18n.t(`evidenceItems.${type}`);
    const label = localizedLabel !== `evidenceItems.${type}` ? localizedLabel : type;
    const profileFingerprint = window.state.evidence?.[type]?.profileFingerprint || latest?.profileFingerprint || '';
    const profileNote = profileFingerprint ? ` · Profil ${String(profileFingerprint).slice(0, 14)}` : '';
    return `${label}: ${latest ? `${latest.name} · ${Math.round((latest.size || 0) / 1024)} KB · ${String(latest.sha256 || '').slice(0, 12)}${profileNote}` : missingLabel}`;
  });
  const el = document.getElementById('evidence-file-status');
  if (el) el.textContent = rows.join(' | ');
}
window.renderEvidenceFileStatus = renderEvidenceFileStatus;

async function attachEvidenceFromInput(type, input) {
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const result = await attachEvidenceFile(window.state, type, file, currentUser());
    if (!result.ok) {
      window.showToast?.(result.errors.join(' '), 'error');
      return;
    }
    if (type === 'customerBill') {
      const refEl = document.getElementById('bill-evidence-ref');
      const dateEl = document.getElementById('bill-evidence-date');
      const statusEl = document.getElementById('bill-evidence-status');
      if (refEl) refEl.value = result.metadata.name;
      if (dateEl) dateEl.value = result.metadata.attachedAt.slice(0, 10);
      if (statusEl) statusEl.value = 'verified';
      window.state.hasSignedCustomerBillData = true;
      const billVerified = document.getElementById('quote-bill-verified');
      if (billVerified) billVerified.checked = true;
    }
    if (type === 'supplierQuote') {
      const refEl = document.getElementById('supplier-quote-ref');
      const stateEl = document.getElementById('supplier-quote-state');
      if (refEl) refEl.value = result.metadata.name;
      if (stateEl) stateEl.value = 'received';
      window.state.bomCommercials = { ...(window.state.bomCommercials || {}), supplierQuoteState: 'received', supplierQuoteRef: result.metadata.name };
    }
    if (type === 'tariffSource') {
      const refEl = document.getElementById('tariff-evidence-ref');
      const statusEl = document.getElementById('tariff-evidence-status');
      if (refEl) refEl.value = result.metadata.name;
      if (statusEl) statusEl.value = 'verified';
    }
    updateTariffAssumptions();
    updateProposalGovernanceInput();
    renderEvidenceFileStatus();
    persistState();
    window.showToast?.('Kanıt dosyası eklendi ve parmak izi kaydedildi.', 'success');
  } catch (error) {
    window.showToast?.(`Kanıt dosyası kaydedilemedi: ${String(error.message || '').replace(/<[^>]*>/g, '')}`, 'error');
  } finally {
    if (input) input.value = '';
  }
}

function positionRangeThumb(sliderId, valId, min, max) {
  const slider = document.getElementById(sliderId);
  const valEl = document.getElementById(valId);
  if (!slider || !valEl) return;
  const pct = (slider.value - min) / (max - min);
  slider.classList.add('range-filled');
  slider.style.setProperty('--range-pct', (pct * 100).toFixed(1) + '%');
  const w = slider.offsetWidth || 200;
  const thumbW = 20;
  const pos = pct * (w - thumbW) + thumbW / 2;
  valEl.style.left = pos + 'px';
  valEl.style.transform = 'translateX(-50%)';
}

// ═══════════════════════════════════════════════════════════
// COMPASS
// ═══════════════════════════════════════════════════════════
function buildCompass() {
  const g = document.getElementById('compass-dirs');
  if (!g) return;
  g.innerHTML = '';
  const cx = 100, cy = 100, r = 85, innerR = 28;

  COMPASS_DIRS.forEach((dir) => {
    const startAngle = (dir.angle - 22.5) * Math.PI / 180;
    const endAngle = (dir.angle + 22.5) * Math.PI / 180;
    const x1 = cx + innerR * Math.cos(startAngle), y1 = cy + innerR * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(startAngle), y2 = cy + r * Math.sin(startAngle);
    const x3 = cx + r * Math.cos(endAngle), y3 = cy + r * Math.sin(endAngle);
    const x4 = cx + innerR * Math.cos(endAngle), y4 = cy + innerR * Math.sin(endAngle);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M${x1},${y1} L${x2},${y2} A${r},${r} 0 0,1 ${x3},${y3} L${x4},${y4} A${innerR},${innerR} 0 0,0 ${x1},${y1}Z`;
    path.setAttribute('d', d);
    path.setAttribute('fill', dir.azimuth === 180 ? 'rgba(245,158,11,0.34)' : 'rgba(58,58,60,0.82)');
    path.setAttribute('stroke', dir.azimuth === 180 ? '#F59E0B' : '#52525B');
    path.setAttribute('stroke-width', '1');
    path.setAttribute('data-az', dir.azimuth);
    path.classList.add('compass-dir-segment');
    path.addEventListener('click', () => selectDirection(dir));
    path.addEventListener('mouseenter', () => { if (window.state.azimuth !== dir.azimuth) path.setAttribute('fill', 'rgba(245,158,11,0.15)'); });
    path.addEventListener('mouseleave', () => syncRoofOrientationUI());
    path.id = `compass-seg-${dir.azimuth}`;
    g.appendChild(path);
  });
  syncRoofOrientationUI({
    azimuth: window.state.azimuth ?? 180,
    coeff: window.state.azimuthCoeff ?? 1,
    name: window.state.azimuthName || 'Güney'
  });
}

function nearestCompassDirection(azimuth) {
  const safeAz = ((Number(azimuth) % 360) + 360) % 360;
  return COMPASS_DIRS.reduce((best, dir) => {
    const bestDiff = Math.min(Math.abs(best.azimuth - safeAz), 360 - Math.abs(best.azimuth - safeAz));
    const dirDiff = Math.min(Math.abs(dir.azimuth - safeAz), 360 - Math.abs(dir.azimuth - safeAz));
    return dirDiff < bestDiff ? dir : best;
  }, COMPASS_DIRS[0]);
}

function syncRoofOrientationUI({ azimuth, coeff, name } = {}) {
  const safeAzimuth = ((Number(azimuth ?? window.state.azimuth ?? 180) % 360) + 360) % 360;
  const safeCoeff = Number(coeff ?? window.state.azimuthCoeff ?? 1);
  const safeName = String(name ?? window.state.azimuthName ?? 'Güney');
  const activeDir = nearestCompassDirection(safeAzimuth);

  COMPASS_DIRS.forEach(d => {
    const el = document.getElementById(`compass-seg-${d.azimuth}`);
    if (!el) return;
    const isActive = d.azimuth === activeDir.azimuth;
    el.setAttribute('fill', isActive ? 'rgba(245,158,11,0.34)' : 'rgba(58,58,60,0.82)');
    el.setAttribute('stroke', isActive ? '#F59E0B' : '#52525B');
    el.setAttribute('stroke-width', isActive ? '1.4' : '1');
  });

  const dirNameEl = document.getElementById('dir-name');
  const dirCoeffEl = document.getElementById('dir-coeff');
  if (dirNameEl) dirNameEl.textContent = safeName;
  if (dirCoeffEl) dirCoeffEl.textContent = safeCoeff.toFixed(2);

  const badge = document.querySelector('.optimal-badge');
  if (badge) badge.classList.toggle('is-hidden', activeDir.azimuth !== 180);

  const mapArrow = document.getElementById('roof-map-compass-arrow');
  const mapLabel = document.getElementById('roof-map-compass-label');
  const mapDegree = document.getElementById('roof-map-compass-degree');
  if (mapArrow) {
    mapArrow.classList.remove(...COMPASS_DIRS.map(dir => `compass-az-${dir.azimuth}`));
    mapArrow.classList.add(`compass-az-${activeDir.azimuth}`);
  }
  if (mapLabel) mapLabel.textContent = `Panel yönü: ${safeName}`;
  if (mapDegree) mapDegree.textContent = `${Math.round(safeAzimuth)}°`;
}

function selectDirection(dir) {
  window.state.azimuth = dir.azimuth;
  window.state.azimuthCoeff = dir.coeff;
  window.state.azimuthName = dir.name;
  syncRoofOrientationUI({ azimuth: dir.azimuth, coeff: dir.coeff, name: dir.name });
  updatePanelPreview();
}

function closeRoofToolLegend() {
  document.getElementById('roof-tool-legend')?.classList.add('is-hidden');
  const toggle = document.getElementById('roof-tool-legend-toggle');
  if (toggle) toggle.classList.remove('is-hidden');
}

function openRoofToolLegend() {
  document.getElementById('roof-tool-legend')?.classList.remove('is-hidden');
  const toggle = document.getElementById('roof-tool-legend-toggle');
  if (toggle) toggle.classList.add('is-hidden');
}

// ═══════════════════════════════════════════════════════════
// PANEL CARDS
// ═══════════════════════════════════════════════════════════
function getPanelSelectionMode() {
  return window.state.panelSelectionMode === 'advanced' ? 'advanced' : 'basic';
}

function syncPanelSelectionModeUI() {
  const mode = getPanelSelectionMode();
  window.state.panelSelectionMode = mode;
  document.querySelectorAll('[data-panel-mode-btn]').forEach(btn => {
    const isActive = btn.dataset.panelModeBtn === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  const toolbar = document.querySelector('.panel-catalog-toolbar');
  if (toolbar) toolbar.classList.toggle('is-hidden', mode !== 'advanced');

  const lead = document.getElementById('panel-mode-lead');
  const sub = document.getElementById('panel-mode-sub');
  const chip1 = document.getElementById('panel-mode-chip-1');
  const chip2 = document.getElementById('panel-mode-chip-2');
  const chip3 = document.getElementById('panel-mode-chip-3');
  if (mode === 'advanced') {
    if (lead) lead.textContent = 'İleri modda doğrulanmış ürün serilerini marka ve datasheet detaylarıyla karşılaştırın.';
    if (sub) sub.textContent = 'Her kartta üretici datasheet kaynağı, doğrulama tarihi, örnek ölçü, garanti yapısı ve fiyat bandı birlikte gösterilir. Hesap motoru seçilen seriyi uygun teknoloji profiline bağlar.';
    if (chip1) chip1.textContent = 'Resmi datasheet kaynağı';
    if (chip2) chip2.textContent = 'Örnek modül ölçüsü';
    if (chip3) chip3.textContent = 'Ürün / performans garantisi';
  } else {
    if (lead) lead.textContent = 'Basit modda yalnızca panel teknolojisini seçin.';
    if (sub) sub.textContent = 'Hesaplama, seçilen panel tipinin ortalama güç, ölçü, verim ve sıcaklık değerleriyle yapılır. Marka ve datasheet ayrıntılarına gerek kalmaz.';
    if (chip1) chip1.textContent = 'Ortalama güç';
    if (chip2) chip2.textContent = 'Tipik ölçü';
    if (chip3) chip3.textContent = 'Hızlı seçim';
  }
}

function setPanelSelectionMode(mode = 'basic') {
  const nextMode = mode === 'advanced' ? 'advanced' : 'basic';
  window.state.panelSelectionMode = nextMode;
  if (nextMode === 'basic') {
    window.state.panelCatalogId = null;
  } else {
    syncPanelCatalogSelection({ forceAdvanced: true });
  }
  buildPanelCards();
  updatePanelPreview();
  persistState();
}

function syncPanelCatalogSelection({ forceAdvanced = false } = {}) {
  if (!forceAdvanced && getPanelSelectionMode() !== 'advanced') {
    window.state.panelCatalogId = null;
    return null;
  }
  const desiredType = normalizePanelTypeKey(window.state.panelType);
  window.state.panelType = desiredType;
  const currentCatalog = getPanelCatalogById(window.state.panelCatalogId);
  if (currentCatalog && normalizePanelTypeKey(currentCatalog.technologyProfileId) === desiredType) {
    window.state.panelCatalogId = currentCatalog.id;
    window.state.panelType = normalizePanelTypeKey(currentCatalog.technologyProfileId);
    return currentCatalog;
  }
  const fallback = getPanelCatalogForType(desiredType)[0] || PANEL_CATALOG[0] || null;
  if (fallback) {
    window.state.panelCatalogId = fallback.id;
    window.state.panelType = normalizePanelTypeKey(fallback.technologyProfileId);
  }
  return fallback;
}

function buildPanelCatalogFilters() {
  const techSelect = document.getElementById('panel-tech-filter');
  const segmentSelect = document.getElementById('panel-segment-filter');
  if (techSelect && !techSelect.dataset.ready) {
    techSelect.innerHTML = PANEL_CATALOG_TECH_FILTERS.map(item => `<option value="${item.id}">${item.label}</option>`).join('');
    techSelect.dataset.ready = 'true';
    techSelect.addEventListener('change', () => {
      window.state.panelCatalogTechFilter = techSelect.value || 'all';
      buildPanelCards();
    });
  }
  if (segmentSelect && !segmentSelect.dataset.ready) {
    segmentSelect.innerHTML = PANEL_CATALOG_SEGMENT_FILTERS.map(item => `<option value="${item.id}">${item.label}</option>`).join('');
    segmentSelect.dataset.ready = 'true';
    segmentSelect.addEventListener('change', () => {
      window.state.panelCatalogSegmentFilter = segmentSelect.value || 'all';
      buildPanelCards();
    });
  }
  if (techSelect) techSelect.value = window.state.panelCatalogTechFilter || 'all';
  if (segmentSelect) segmentSelect.value = window.state.panelCatalogSegmentFilter || 'all';
}

function syncPanelSelectionUI() {
  const selectedType = normalizePanelTypeKey(window.state.panelType);
  const selectedCatalogId = window.state.panelCatalogId;
  document.querySelectorAll('.panel-card[data-panel-tech]').forEach(card => {
    const isSelected = card.dataset.panelId
      ? card.dataset.panelId === selectedCatalogId
      : normalizePanelTypeKey(card.dataset.panelTech) === selectedType;
    card.classList.toggle('selected', isSelected);
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  });
  const albedoWrap = document.getElementById('albedo-wrap');
  if (albedoWrap) albedoWrap.style.display = selectedType === 'bifacial_topcon' ? '' : 'none';
}

function collectPreviewRoofInputs() {
  const primaryArea = parseFloat(document.getElementById('roof-area')?.value) || window.state.roofArea || 80;
  const roofSections = Array.isArray(window.state.roofSections)
    ? window.state.roofSections.map(sec => {
        const areaEl = document.getElementById(`sec-area-${sec.id}`);
        return { ...sec, area: areaEl ? (parseFloat(areaEl.value) || sec.area) : sec.area };
      })
    : [];
  return { primaryArea, roofSections };
}

function buildPreviewSizingState(overrides = {}) {
  const { primaryArea, roofSections } = collectPreviewRoofInputs();
  return {
    ...window.state,
    roofArea: primaryArea,
    roofSections,
    ...overrides
  };
}

function describePanelTypeScenario(panelType) {
  const techKey = normalizePanelTypeKey(panelType);
  const cardState = buildPreviewSizingState({
    panelType: techKey,
    panelCatalogId: null
  });
  const panel = resolvePanelSpec(cardState, techKey);
  const layout = calculateSystemLayout(cardState, techKey);
  const usesLoadTarget = (cardState.scenarioKey === 'on-grid' || cardState.scenarioKey === 'off-grid') && cardState.designTarget === 'bill-offset';
  const roofCapacityLayout = usesLoadTarget
    ? calculateSystemLayout({ ...cardState, designTarget: 'fill-roof' }, techKey)
    : layout;
  const placedArea = layout.panelCount * panel.areaM2;
  const areaText = `${placedArea.toFixed(1)}/${roofCapacityLayout.usableArea.toFixed(1)} m²`;
  const panelText = usesLoadTarget
    ? `${layout.panelCount}/${roofCapacityLayout.panelCount} panel`
    : `${layout.panelCount} panel`;
  return `Bu alanda: ${panelText} · ${layout.systemPower.toFixed(2)} kWp · ${areaText}`;
}

function updateSimplePanelCardScenarioSummaries() {
  PANEL_TYPE_OPTIONS.forEach(panelType => {
    const el = document.getElementById(`panel-type-card-scenario-${panelType}`);
    if (!el) return;
    el.textContent = describePanelTypeScenario(panelType);
  });
}

function describePanelCardScenario(entry) {
  const techKey = normalizePanelTypeKey(entry.technologyProfileId);
  const cardState = buildPreviewSizingState({
    panelType: techKey,
    panelCatalogId: entry.id
  });
  const panel = resolvePanelSpec(cardState, techKey);
  const layout = calculateSystemLayout(cardState, techKey);
  const usesLoadTarget = (cardState.scenarioKey === 'on-grid' || cardState.scenarioKey === 'off-grid') && cardState.designTarget === 'bill-offset';
  const roofCapacityLayout = usesLoadTarget
    ? calculateSystemLayout({ ...cardState, designTarget: 'fill-roof' }, techKey)
    : layout;
  const placedArea = layout.panelCount * panel.areaM2;
  const areaText = `${placedArea.toFixed(1)}/${roofCapacityLayout.usableArea.toFixed(1)} m²`;
  const panelText = usesLoadTarget
    ? `${layout.panelCount}/${roofCapacityLayout.panelCount} panel`
    : `${layout.panelCount} panel`;
  const sizingNote = panel.dimensionsSource === 'catalog' ? '' : ' · ölçü varsayımı';
  return `Bu alanda: ${panelText} · ${layout.systemPower.toFixed(2)} kWp · ${areaText}${sizingNote}`;
}

function updatePanelCardScenarioSummaries(visibleCatalog = null) {
  const entries = Array.isArray(visibleCatalog) ? visibleCatalog : PANEL_CATALOG;
  entries.forEach(entry => {
    const el = document.getElementById(`panel-card-scenario-${entry.id}`);
    if (!el) return;
    el.textContent = describePanelCardScenario(entry);
  });
}

function renderSimplePanelCards(wrap) {
  window.state.panelCatalogId = null;
  window.state.panelType = normalizePanelTypeKey(window.state.panelType);
  wrap.innerHTML = '';

  PANEL_TYPE_OPTIONS.forEach(panelType => {
    const techKey = normalizePanelTypeKey(panelType);
    const p = PANEL_TYPES[techKey] || PANEL_TYPES.mono_perc;
    const isSelected = techKey === window.state.panelType;
    const efficiencyText = Number.isFinite(Number(p.efficiency)) ? `${(Number(p.efficiency) * 100).toFixed(1)}%` : '—';
    const tempCoeffText = Number.isFinite(Number(p.tempCoeff)) ? `${(Number(p.tempCoeff) * 100).toFixed(2)}%/°C` : '—';
    const warrantyText = `${Number(p.warranty) || 0} yıl ürün / ${Number(p.powerWarranty) || 0} yıl performans`;
    const priceAssumption = panelAssumptionPriceCopy(techKey);
    const card = document.createElement('div');
    card.className = 'panel-card panel-type-card' + (isSelected ? ' selected' : '');
    card.id = `panel-type-card-${techKey}`;
    card.dataset.panelTech = techKey;
    card.dataset.testid = `panel-type-card-${techKey}`;
    card.setAttribute('data-testid', `panel-type-card-${techKey}`);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    card.innerHTML = `
      <div class="panel-check">✓</div>
      <div class="panel-type-topline">
        <span class="equipment-card-badge">${escapeHtml(p.badge || 'Panel tipi')}</span>
        <span class="panel-type-mode">Ortalama profil</span>
      </div>
      <div class="panel-type-visual" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
      <div class="panel-card-title">${escapeHtml(p.name)}</div>
      <div class="equipment-card-copy">${escapeHtml(p.summary)}</div>
      <div class="panel-card-eff">${Number(p.wattPeak) || 0} Wp</div>
      <div class="equipment-card-metric-label">Bu panel tipine ait ortalama modül gücü</div>
      <div class="equipment-chip-row">
        <span class="equipment-chip">${escapeHtml(efficiencyText)} verim</span>
        <span class="equipment-chip">${escapeHtml(p.powerRange || '')}</span>
        <span class="equipment-chip">${escapeHtml(p.exampleSize || '')}</span>
      </div>
      <div class="panel-card-stats">
        <div class="panel-stat"><span class="panel-stat-label">Tipik kullanım</span><span>${escapeHtml(p.bestFor)}</span></div>
        <div class="panel-stat"><span class="panel-stat-label">Sıcaklık katsayısı</span><span>${escapeHtml(tempCoeffText)}</span></div>
        <div class="panel-stat"><span class="panel-stat-label">Varsayım fiyatı</span><span>${escapeHtml(priceAssumption.text)}</span></div>
        <div class="panel-stat"><span class="panel-stat-label">Garanti</span><span>${escapeHtml(warrantyText)}</span></div>
      </div>
      <div class="panel-card-scenario" id="panel-type-card-scenario-${techKey}"></div>
      <div class="equipment-card-note"><strong>Fiyat kaynağı:</strong> ${escapeHtml(priceAssumption.meta)}</div>
      <div class="equipment-card-note equipment-card-note-muted"><strong>Dikkat:</strong> ${escapeHtml(p.watchFor)}</div>`;

    const activateCard = () => {
      window.state.panelType = techKey;
      window.state.panelCatalogId = null;
      syncPanelSelectionUI();
      updatePanelPreview();
      persistState();
    };
    card.addEventListener('click', activateCard);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateCard();
      }
    });
    wrap.appendChild(card);
  });

  updateSimplePanelCardScenarioSummaries();
  updateEquipmentSelectionSummary();
}

function buildPanelCards() {
  const wrap = document.getElementById('panel-cards-wrap');
  if (!wrap) return;
  syncPanelSelectionModeUI();
  if (getPanelSelectionMode() !== 'advanced') {
    renderSimplePanelCards(wrap);
    return;
  }
  buildPanelCatalogFilters();
  const selectedCatalog = syncPanelCatalogSelection({ forceAdvanced: true });
  syncPanelSelectionUI();
  wrap.innerHTML = '';
  const filteredCatalog = filterPanelCatalog({
    technology: window.state.panelCatalogTechFilter || 'all',
    segment: window.state.panelCatalogSegmentFilter || 'all'
  });
  const visibleCatalog = filteredCatalog.length ? filteredCatalog : PANEL_CATALOG;
  const activeCatalog = visibleCatalog.find(item => item.id === selectedCatalog?.id) || selectedCatalog || visibleCatalog[0] || null;
  if (activeCatalog) {
    window.state.panelCatalogId = activeCatalog.id;
    window.state.panelType = normalizePanelTypeKey(activeCatalog.technologyProfileId);
  }
  visibleCatalog.forEach(entry => {
    const techKey = normalizePanelTypeKey(entry.technologyProfileId);
    const p = PANEL_TYPES[techKey];
    const priceAssumption = panelAssumptionPriceCopy(techKey);
    const card = document.createElement('div');
    card.className = 'panel-card panel-catalog-card' + (entry.id === window.state.panelCatalogId ? ' selected' : '');
    card.id = `panel-card-${entry.id}`;
    card.dataset.panelId = entry.id;
    card.dataset.panelTech = techKey;
    card.dataset.testid = `panel-card-${entry.id}`;
    card.setAttribute('data-testid', `panel-card-${entry.id}`);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', entry.id === window.state.panelCatalogId ? 'true' : 'false');
    card.innerHTML = `
      <div class="panel-check">✓</div>
      <div class="panel-catalog-topline">
        <span class="equipment-card-badge">${p.badge || 'Panel tipi'}</span>
        <span class="panel-catalog-verified">Doğrulama: ${entry.verifiedAt}</span>
      </div>
      <div class="panel-catalog-brandline">
        <div>
          <div class="panel-catalog-brand">${entry.brand}</div>
          <div class="panel-card-title">${entry.series}</div>
        </div>
        <div class="panel-catalog-tier">${entry.marketTier === 'premium' ? 'Premium' : 'Ana akım'}</div>
      </div>
      <div class="equipment-card-copy">${entry.displayName}</div>
      <div class="panel-card-eff">${entry.efficiencyText}</div>
      <div class="equipment-card-metric-label">Üretici verisine göre örnek modül verimi</div>
      <div class="equipment-chip-row">
        <span class="equipment-chip">${entry.powerRange}</span>
        <span class="equipment-chip">${entry.dimensions}</span>
        <span class="equipment-chip">${entry.cellTechnology}</span>
      </div>
      <div class="panel-card-stats">
        <div class="panel-stat"><span class="panel-stat-label">Teknoloji profili</span><span>${p.name}</span></div>
        <div class="panel-stat"><span class="panel-stat-label">Sıcaklık katsayısı</span><span>${entry.temperatureCoeffText}</span></div>
        <div class="panel-stat"><span class="panel-stat-label">Ağırlık / yapı</span><span>${entry.weight} · ${entry.construction}</span></div>
        <div class="panel-stat"><span class="panel-stat-label">Ürün / performans</span><span>${entry.warrantyText}</span></div>
        <div class="panel-stat"><span class="panel-stat-label">Kaynak tipi</span><span>${entry.sourceType}</span></div>
        <div class="panel-stat"><span class="panel-stat-label">Varsayım fiyatı</span><span>${escapeHtml(priceAssumption.text)}</span></div>
      </div>
      <div class="panel-card-scenario" id="panel-card-scenario-${entry.id}"></div>
      <div class="equipment-card-note"><strong>En uygun:</strong> ${entry.idealFor}</div>
      <div class="equipment-card-note"><strong>Fiyat kaynağı:</strong> ${escapeHtml(priceAssumption.meta)}</div>
      <div class="equipment-card-note equipment-card-note-muted"><strong>Dikkat:</strong> ${entry.watchFor}</div>
      <div class="panel-catalog-footer">
        <div class="panel-catalog-source">${entry.sourceLabel}</div>
        <a class="panel-catalog-link" href="${entry.datasheetUrl}" target="_blank" rel="noopener noreferrer">${i18n.t('common.datasheet')}</a>
      </div>`;
    const activateCard = () => {
      window.state.panelCatalogId = entry.id;
      window.state.panelType = techKey;
      window.state.panelSelectionMode = 'advanced';
      syncPanelSelectionUI();
      updatePanelPreview();
      persistState();
    };
    card.addEventListener('click', activateCard);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateCard();
      }
    });
    wrap.appendChild(card);
  });
  const meta = document.getElementById('panel-catalog-meta');
  if (meta) {
    meta.textContent = `${visibleCatalog.length} doğrulanmış seri gösteriliyor. Kartlarda üretici datasheet kaynağı, doğrulama tarihi ve fiyat bandı birlikte sunulur.`;
  }
  updatePanelCardScenarioSummaries(visibleCatalog);
  updateEquipmentSelectionSummary();
}

function estimateBatteryPreviewCostTry(battery) {
  const model = BATTERY_MODELS[battery?.model];
  const modelPrice = Number(model?.price_try);
  if (Number.isFinite(modelPrice) && modelPrice > 0) return Math.round(modelPrice);
  const capacity = Math.max(0, Number(battery?.capacity ?? model?.capacity) || 0);
  return Math.round(capacity * 8000);
}

function formatPreviewCurrency(tryAmount, withCurrency = true) {
  const cur = window.state.displayCurrency || 'TRY';
  const rate = window.state.usdToTry || 40;
  const formatted = cur === 'USD'
    ? convertTry(tryAmount, 'USD', rate).toLocaleString('en-US', { maximumFractionDigits: 0 })
    : Math.round(tryAmount).toLocaleString('tr-TR');
  if (!withCurrency) return formatted;
  return cur === 'USD' ? `$${formatted}` : `${formatted} ₺`;
}

const COST_PROFILE_LABELS = {
  economy: 'Ekonomik',
  standard: 'Standart',
  premium: 'Premium'
};

function formatTryPerWatt(value) {
  return `${Number(value || 0).toFixed(1)} TL/W`;
}

function panelAssumptionPriceCopy(panelKey) {
  const profile = window.state.costProfile || DEFAULT_COST_PROFILE;
  const band = getPanelPriceBand(panelKey, profile);
  const label = COST_PROFILE_LABELS[profile] || 'Standart';
  return {
    selected: band.selected,
    text: `${label} profil: ${formatTryPerWatt(band.low)}-${formatTryPerWatt(band.high)}, baz ${formatTryPerWatt(band.base)}`,
    meta: `${COST_ASSUMPTIONS.version} · ${band.sourceDate || COST_ASSUMPTIONS.sourceDate || '—'}`
  };
}

function computeEquipmentPreviewMetrics() {
  window.state.panelType = normalizePanelTypeKey(window.state.panelType);
  if (getPanelSelectionMode() !== 'advanced') window.state.panelCatalogId = null;
  const previewState = buildPreviewSizingState();
  const panel = resolvePanelSpec(previewState);
  const panelArea = panel.areaM2;
  const usableRatio = Math.max(0.1, Math.min(0.95, Number(window.state.usableRoofRatio) || 0.75));
  const { primaryArea, roofSections } = collectPreviewRoofInputs();
  const layout = calculateSystemLayout(previewState, panel.key);
  const usesLoadTarget = (window.state.scenarioKey === 'on-grid' || window.state.scenarioKey === 'off-grid') && window.state.designTarget === 'bill-offset';
  const roofCapacityLayout = usesLoadTarget
    ? calculateSystemLayout({ ...previewState, designTarget: 'fill-roof' }, panel.key)
    : layout;
  const totalPanelCount = layout.panelCount;
  const roofCapacityPanelCount = roofCapacityLayout.panelCount;
  const roofAreaTotal = (Number(primaryArea) || 0) + (window.state.multiRoof ? roofSections.reduce((sum, sec) => sum + (Number(sec.area) || 0), 0) : 0);
  const usableArea = roofCapacityLayout.usableArea;
  const placedArea = totalPanelCount * panelArea;
  const roofCapacityPlacedArea = roofCapacityPanelCount * panelArea;

  normalizeBatterySelection();
  const systemPower = layout.systemPower;
  const roofCapacitySystemPower = roofCapacityLayout.systemPower;
  const equipmentCapex = estimateSolarCapex({
    systemPowerKwp: systemPower,
    panel,
    panelCount: totalPanelCount,
    inverterTypeKey: window.state.inverterType || 'string',
    costProfile: window.state.costProfile || DEFAULT_COST_PROFILE,
    vatProfile: window.state.vatProfile || DEFAULT_VAT_PROFILE,
    manualCostMode: 'none'
  });
  const panelCostTry = Math.round(equipmentCapex.panelCost);
  const inverterCostTry = Math.round(equipmentCapex.inverterCost);
  const batteryCostTry = window.state.batteryEnabled ? estimateBatteryPreviewCostTry(window.state.battery) : 0;
  return {
    panel,
    panelArea,
    usableRatio,
    totalPanelCount,
    roofCapacityPanelCount,
    roofAreaTotal,
    usableArea,
    placedArea,
    roofCapacityPlacedArea,
    systemPower,
    roofCapacitySystemPower,
    panelCostTry,
    inverterCostTry,
    panelPricePerWatt: equipmentCapex.panelPricePerWatt,
    inverterPricingModel: equipmentCapex.inverterPricingModel,
    inverterUnitTry: equipmentCapex.invUnit,
    costAssumptionVersion: equipmentCapex.costAssumptionVersion,
    batteryCostTry,
    totalEquipmentCostTry: panelCostTry + inverterCostTry + batteryCostTry
  };
}

function updatePanelPreview() {
  const {
    panel,
    panelArea,
    usableRatio,
    totalPanelCount,
    roofCapacityPanelCount,
    roofAreaTotal,
    usableArea,
    placedArea,
    roofCapacityPlacedArea,
    systemPower,
    roofCapacitySystemPower,
    panelCostTry,
    inverterCostTry,
    panelPricePerWatt,
    inverterPricingModel,
    inverterUnitTry,
    costAssumptionVersion,
    batteryCostTry,
    totalEquipmentCostTry
  } = computeEquipmentPreviewMetrics();
  window.state.previewSystemPower = Number(systemPower.toFixed(2));
  const panelCostDisplay = formatPreviewCurrency(panelCostTry, false);

  document.getElementById('prev-count').textContent = totalPanelCount;
  document.getElementById('prev-power').textContent = systemPower.toFixed(2);
  document.getElementById('prev-area').textContent = `${placedArea.toFixed(1)} / ${usableArea.toFixed(1)}`;
  document.getElementById('prev-cost').textContent = panelCostDisplay;
  const costLabel = document.getElementById('prev-cost-label');
  if (costLabel) costLabel.textContent = (window.state.displayCurrency || 'TRY') === 'USD' ? 'Panel Maliyeti ($)' : 'Panel Maliyeti (₺)';
  const summaryPower = document.getElementById('equip-summary-power');
  const summaryPanels = document.getElementById('equip-summary-panels');
  const summaryArea = document.getElementById('equip-summary-area');
  if (summaryPower) summaryPower.textContent = `${systemPower.toFixed(2)} kWp`;
  if (summaryPanels) summaryPanels.textContent = `${totalPanelCount} adet`;
  if (summaryArea) summaryArea.textContent = `${placedArea.toFixed(1)} / ${usableArea.toFixed(1)} m² net`;

  const summaryCost = document.getElementById('equip-summary-cost');
  const summaryPanelCost = document.getElementById('equip-summary-panel-cost');
  const summaryInverterCost = document.getElementById('equip-summary-inverter-cost');
  const summaryBatteryCost = document.getElementById('equip-summary-battery-cost');
  const summaryCostNote = document.getElementById('equip-summary-cost-note');
  if (summaryCost) summaryCost.textContent = formatPreviewCurrency(totalEquipmentCostTry);
  if (summaryPanelCost) summaryPanelCost.textContent = formatPreviewCurrency(panelCostTry);
  if (summaryInverterCost) summaryInverterCost.textContent = formatPreviewCurrency(inverterCostTry);
  if (summaryBatteryCost) summaryBatteryCost.textContent = window.state.batteryEnabled ? formatPreviewCurrency(batteryCostTry) : 'Kapalı';
  if (summaryCostNote) {
    const inverterNote = inverterPricingModel === 'perPanelPlusFixed'
      ? 'panel başı + gateway/izleme'
      : `${Math.round(Number(inverterUnitTry || 0)).toLocaleString('tr-TR')} TL/kWp`;
    summaryCostNote.textContent = window.state.batteryEnabled
      ? `Toplam ekipman tahmini: panel (${formatTryPerWatt(panelPricePerWatt)}) + inverter (${inverterNote}) + batarya depolama · ${costAssumptionVersion}`
      : `Toplam ekipman tahmini: panel (${formatTryPerWatt(panelPricePerWatt)}) + inverter (${inverterNote}) · ${costAssumptionVersion}`;
  }

  const preview = document.getElementById('panel-count-preview');
  const isBillTarget = (window.state.scenarioKey === 'on-grid' || window.state.scenarioKey === 'off-grid') && window.state.designTarget === 'bill-offset';
  const loadTargetLabel = window.state.scenarioKey === 'off-grid' ? 'Elektrik ihtiyacı hedefi' : 'Fatura hedefi';
  if (preview) {
    const previewVerb = isBillTarget ? 'seçilir' : 'sığar';
    preview.textContent = totalPanelCount > 0
      ? (isBillTarget && roofCapacityPanelCount > totalPanelCount
        ? `${loadTargetLabel}ne göre ≈ ${totalPanelCount} panel seçilir (${systemPower.toFixed(2)} kWp). Bu alana teknik olarak ≈ ${roofCapacityPanelCount} panel sığar (${roofCapacitySystemPower.toFixed(2)} kWp, ${roofCapacityPlacedArea.toFixed(1)}/${usableArea.toFixed(1)} m² net).`
        : `≈ ${totalPanelCount} panel ${previewVerb} (${systemPower.toFixed(2)} kWp, brüt alan ${roofAreaTotal.toFixed(1)} m², net ${usableArea.toFixed(1)} m², yerleşen panel ${placedArea.toFixed(1)} m²)`)
      : '';
  }
  const roofMode = document.getElementById('on-grid-roof-mode-preview');
  if (roofMode) {
    const target = isBillTarget ? `${loadTargetLabel} kadar boyutlandır` : 'Alanı teknik sınıra kadar kullan';
    roofMode.textContent = `${target} · ${Math.round(usableRatio * 100)}% kullanılabilir alan · ${totalPanelCount}/${roofCapacityPanelCount} panel · ${placedArea.toFixed(1)}/${usableArea.toFixed(1)} m²`;
  }
  if (getPanelSelectionMode() === 'advanced') updatePanelCardScenarioSummaries();
  else updateSimplePanelCardScenarioSummaries();
  updateEquipmentSelectionSummary();
}

function normalizeBatterySelection() {
  const currentKey = window.state.battery?.model;
  if (currentKey === 'custom') {
    window.state.battery = { ...BATTERY_MODELS.custom, ...(window.state.battery || {}), model: 'custom' };
    return;
  }
  if (!BATTERY_MODELS[currentKey]) {
    window.state.battery = { ...BATTERY_MODELS.huawei_luna15, model: 'huawei_luna15' };
  }
}

function updateEquipmentSelectionSummary() {
  const panelEl = document.getElementById('equip-summary-panel-type');
  const inverterEl = document.getElementById('equip-summary-inverter');
  const batteryEl = document.getElementById('equip-summary-battery');
  window.state.panelType = normalizePanelTypeKey(window.state.panelType);
  const panelMode = getPanelSelectionMode();
  if (panelMode !== 'advanced') window.state.panelCatalogId = null;
  const panel = PANEL_TYPES[window.state.panelType] || PANEL_TYPES.mono_perc;
  const panelCatalog = panelMode === 'advanced' ? syncPanelCatalogSelection({ forceAdvanced: true }) : null;
  const inverter = INVERTER_TYPES[window.state.inverterType];
  normalizeBatterySelection();
  const battery = window.state.battery || BATTERY_MODELS.custom;
  const batteryLabel = !window.state.batteryEnabled
    ? 'Kapalı'
    : battery.model === 'custom'
      ? `Özel ${Number(battery.capacity || 0).toFixed(1)} kWh`
      : battery.name;
  if (panelEl) panelEl.textContent = panelCatalog?.displayName || panel?.name || '—';
  if (inverterEl) inverterEl.textContent = inverter?.name || '—';
  if (batteryEl) batteryEl.textContent = batteryLabel;
  // Panel veya invertör değiştiğinde datasheet kartını yenile (yalnızca Adım 4 görünürken).
  if (window.state?.step === 4 && document.getElementById('datasheet-sizing-card')) {
    runDatasheetSizing();
  }
}

// ═══════════════════════════════════════════════════════════
// STEP NAVIGATION
// ═══════════════════════════════════════════════════════════
// ── DOM-MOVE HARİTASI: tek harita instance'ı adımlar arasında taşınır ──
function repositionMap(n) {
  const mapCard = document.getElementById('map-card');
  if (!mapCard) return;
  const step2Slot = document.getElementById('step2-map-slot');
  const step3Slot = document.getElementById('step3-map-slot');
  if (n === 2 && step2Slot && !step2Slot.contains(mapCard)) {
    step2Slot.appendChild(mapCard);
    requestAnimationFrame(() => { try { map?.invalidateSize(); setTimeout(() => map?.invalidateSize(), 400); } catch {} });
  } else if (n === 3 && step3Slot && !step3Slot.contains(mapCard)) {
    step3Slot.appendChild(mapCard);
    requestAnimationFrame(() => { try { map?.invalidateSize(); setTimeout(() => map?.invalidateSize(), 400); } catch {} });
  }
}

function ensureMapForStep(n) {
  if (n !== 2 && n !== 3) return;
  repositionMap(n);
  console.debug?.('[map-provider] ensure map for step', n);
  if (getGoogleMapsApiKey()) {
    setTimeout(() => {
      const hasScript = !!document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
      if (!hasScript && !window.google?.maps && window._mapProvider !== MAP_PROVIDER_CONFIG.fallback) {
        console.warn('[map-provider] Google Maps loader was not triggered');
      }
    }, 700);
  }
  const run = () => initMap().then(() => {
    repositionMap(n);
    if (window._mapProvider === 'google') {
      const roofStartHint = document.getElementById('roof-draw-start-hint');
      if (roofStartHint) roofStartHint.classList.add('is-hidden');
    }
    if (n === 3 && window._mapProvider === 'google') {
      const out = document.getElementById('roof-geometry-summary');
      if (out && !window.state?.roofGeometry) {
        out.textContent = 'Poligon aracıyla kurulum alanı sınırlarını çizin. Bitir düğmesi veya çift tık alanı hesaplar.';
      }
    }
  }).catch(err => {
    const message = googleMapFailureMessage(err);
    console.warn('[map-provider] init failed:', err);
    initManualCoordinateFallback(message);
  });
  const attemptInit = (attempt = 0) => requestAnimationFrame(() => {
    const container = document.getElementById('map');
    if (!container) {
      console.warn('[map-provider] Google Maps loader was not triggered: map container missing');
      setTimeout(run, 120);
      return;
    }
    if (!isMapContainerReady(container) && attempt < 6) {
      setTimeout(() => attemptInit(attempt + 1), 120);
      return;
    }
    run();
  });
  attemptInit();
}

function getMaxUnlockedStep() {
  return Math.max(1, Number(window.state?.maxUnlockedStep) || 1);
}

function unlockStep(n) {
  if (!window.state) return;
  window.state.maxUnlockedStep = Math.max(getMaxUnlockedStep(), Number(n) || 1);
}

function requestStepChange(n) {
  if (n > getMaxUnlockedStep()) {
    showToast(i18n.t('nav.completeCurrentStepFirst'), 'warning');
    return;
  }
  goToStep(n);
}

function ensureAppRouteVisible() {
  document.body.classList.remove('landing-active');
  document.body.dataset.route = 'app';
  const appRoute = window.SolarRotaRoutes?.app || '#/app';
  if (location.hash !== appRoute) {
    history.replaceState(null, '', appRoute);
  }
}

function goToStep(n) {
  const state = window.state;
  if (n < 1 || n > 7) return;
  ensureAppRouteVisible();
  if (n === state.step) {
    requestAnimationFrame(() => ensureMapForStep(n));
    return;
  }
  unlockStep(n);
  const fromEl = document.getElementById(`step-${state.step}`);
  const toEl = document.getElementById(`step-${n}`);
  if (!fromEl || !toEl) return;
  const main = document.getElementById('main-content');
  fromEl.classList.remove('active');
  state.step = n;
  if (n === 1) {
    resetConfetti();
  }
  repositionMap(n);
  if (n === 7) {
    setTimeout(() => {
      if (window.renderHourlyProfile) window.renderHourlyProfile();
      if (window.renderSunPath) window.renderSunPath();
      if (window.showHeatmapCard) window.showHeatmapCard();
      if (window.renderScenarioAnalysis) window.renderScenarioAnalysis();
    }, 600);
  }
  if (n === 4) {
    attachDatasheetSizingHandlers();
    runDatasheetSizing();
  }
  toEl.classList.add('active');
  if (main) main.classList.toggle('immersive-flow', n === 2 || n === 3);
  if (main) main.classList.toggle('wide-flow', n === 4);
  document.body.classList.toggle('immersive-screen', n === 2 || n === 3);
  document.documentElement.classList.toggle('immersive-screen', n === 2 || n === 3);
  // Etap 2: mobil sticky bottom bar — body[data-step] ile içerik switch
  document.body.dataset.step = String(n);
  document.body.classList.toggle('has-bottom-bar', n !== 6);
  // Etap 4: Step 3 dışına çıkıldığında fullscreen mode kapatılır
  if (n !== 3 && document.body.classList.contains('step3-fullscreen')) {
    document.body.classList.remove('step3-fullscreen');
  }
  syncHeaderHeightVar();
  updateProgressBar();
  window.scrollTo({ top: 0, behavior: (n === 2 || n === 3) ? 'auto' : 'smooth' });
  // Show/hide roof start hint
  const roofStartHint = document.getElementById('roof-draw-start-hint');
  if (roofStartHint) {
    roofStartHint.classList.toggle('is-hidden', !(n === 2 && !window.roofDrawnItems?.getLayers().length));
  }
  requestAnimationFrame(() => ensureMapForStep(n));
}

function updateProgressBar() {
  const state = window.state;
  const maxUnlockedStep = getMaxUnlockedStep();
  document.querySelectorAll('.step-dot').forEach(el => {
    const s = parseInt(el.dataset.step);
    const isActive = s === state.step;
    const isLocked = s > maxUnlockedStep;
    el.classList.remove('active','done');
    el.classList.toggle('locked', isLocked);
    if (isActive) el.classList.add('active');
    else if (s < state.step) el.classList.add('done');
    if (isActive) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
    el.setAttribute('aria-disabled', isLocked ? 'true' : 'false');
  });
  for (let i = 1; i <= 6; i++) {
    const conn = document.getElementById(`conn-${i}-${i+1}`);
    if (conn) conn.classList.toggle('filled', i < state.step);
  }
}

// ADIM 1: Senaryo seçimi doğrula → Adım 2
function validateStep1() {
  if (!window.state.scenarioKey) {
    const message = 'Lütfen devam etmeden önce on-grid veya off-grid senaryosunu seçin.';
    setStepInlineAlert(1, message);
    showToast(message, 'error'); return;
  }
  clearStepInlineAlert(1);
  unlockStep(2);
  goToStep(2);
}

// ADIM 2: Konum doğrula → Adım 3
function validateStep2() {
  const state = window.state;
  if (!state.lat || !state.lon) {
    const message = 'Lütfen haritadan veya arama kutusundan bir konum seçin.';
    setStepInlineAlert(2, message);
    showToast(message, 'error'); return;
  }
  if (!isInTurkey(state.lat, state.lon)) {
    const message = 'Lütfen Türkiye sınırları içinde bir konum seçin.';
    setStepInlineAlert(2, message);
    showToast(message, 'error'); return;
  }
  clearStepInlineAlert(2);
  // Lokasyon bottom card'ı gizle (adım 2'den ayrılıyoruz)
  document.getElementById('location-bottom-card')?.classList.remove('visible');
  unlockStep(3);
  goToStep(3);
}

// ADIM 3: Kurulum alanı doğrula → Adım 4
function validateStep3() {
  const state = window.state;
  const area = parseFloat(document.getElementById('roof-area').value);
  if (!area || area < 10 || area > 2000) {
    syncRoofAreaValidationUi(true);
    setStepInlineAlert(3, 'Kurulum alanı 10 ile 2000 m² arasında olmalıdır.');
    return;
  }
  syncRoofAreaValidationUi(false);
  clearStepInlineAlert(3);
  state.roofArea = area;

  if (state.multiRoof) {
    for (let i = 0; i < state.roofSections.length; i++) {
      const sec = state.roofSections[i];
      const areaEl = document.getElementById(`sec-area-${sec.id}`);
      if (areaEl) {
        const secArea = parseFloat(areaEl.value);
        if (!secArea || secArea < 5 || secArea > 500) {
          setStepInlineAlert(3, `${i + 2}. yüzey alanı 5 ile 500 m² arasında olmalıdır.`);
          showToast(`${i + 2}. yüzey alanı geçersiz (5–500 m² olmalı).`, 'error'); return;
        }
        sec.area = secArea;
      }
    }
  }

  clearStepInlineAlert(3);
  unlockStep(4);
  goToStep(4);
  updatePanelPreview();
  buildInverterCards();
}

function syncRoofAreaValidationUi(forceInvalid = null) {
  const roofAreaInput = document.getElementById('roof-area');
  const roofAreaError = document.getElementById('roof-area-err');
  if (!roofAreaInput || !roofAreaError) return;
  const rawValue = String(roofAreaInput.value || '').trim();
  const value = parseFloat(rawValue);
  const invalid = forceInvalid === null
    ? !!rawValue && (!Number.isFinite(value) || value < 10 || value > 2000)
    : !!forceInvalid;
  roofAreaInput.classList.toggle('error', invalid);
  roofAreaInput.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  roofAreaError.style.display = invalid ? 'block' : 'none';
}
window.syncRoofAreaValidationUi = syncRoofAreaValidationUi;

function enhanceTooltipAccessibility() {
  const moreInfoLabel = i18n.t('common.moreInfo');
  document.querySelectorAll('.tooltip-wrap').forEach((wrap, index) => {
    const icon = wrap.querySelector('.tooltip-icon');
    const box = wrap.querySelector('.tooltip-box');
    if (!icon || !box) return;
    const tooltipId = box.id || `tooltip-box-${index + 1}`;
    box.id = tooltipId;
    box.setAttribute('role', 'tooltip');
    icon.setAttribute('tabindex', '0');
    icon.setAttribute('aria-describedby', tooltipId);
    icon.setAttribute('aria-label', moreInfoLabel);
  });
}
window.enhanceTooltipAccessibility = enhanceTooltipAccessibility;

// ADIM 4: Ekipman — passthrough → Adım 5
function validateStep4() {
  unlockStep(5);
  goToStep(5);
}

// ADIM 5: Finansal doğrula → Adım 6 + hesaplama
function validateStep5() {
  const tariffInput = document.getElementById('tariff-input');
  if (tariffInput) window.state.tariff = parseFloat(tariffInput.value) || DEFAULT_RESIDENTIAL_TARIFF;
  updateTariffAssumptions();
  unlockStep(6);
  goToStep(6);
  refreshCalculationStageMeta(0);
  const calcBtn = document.getElementById('calc-btn') || document.querySelector('[onclick*="validateStep5"]');
  if (calcBtn) { calcBtn.disabled = true; calcBtn.style.opacity = '0.6'; }
  runCalculation()
    .catch(e => {
      window.state.calculationError = e?.message || String(e);
      finalizeCalculationUI({
        targetStep: 5,
        errorMsg: 'Hesaplama sırasında bir hata oluştu. Lütfen tekrar deneyin.'
      });
    })
    .finally(() => {
      if (calcBtn) { calcBtn.disabled = false; calcBtn.style.opacity = ''; }
    });
}

// ═══════════════════════════════════════════════════════════
// ÇOKLU ÇATI
// ═══════════════════════════════════════════════════════════
function toggleMultiRoof(checked) {
  window.state.multiRoof = checked;
  const extra = document.getElementById('roof-sections-extra');
  if (extra) extra.style.display = checked ? 'block' : 'none';
  if (!checked) {
    window.state.roofSections = [];
    renderRoofSections();
  }
  syncMultiRoofUi();
  updatePanelPreview();
}

function addRoofSection() {
  if (window.state.roofSections.length >= 2) {
    showToast('Maksimum 3 kurulum yüzeyi eklenebilir (1 ana + 2 ek).', 'warning'); return;
  }
  const id = Date.now();
  window.state.roofSections.push({ id, area: 30, tilt: 20, azimuth: 90, azimuthCoeff: 0.85, azimuthName: 'Doğu', shadingFactor: 10 });
  renderRoofSections();
  updatePanelPreview();
}

function removeRoofSection(id) {
  window.state.roofSections = window.state.roofSections.filter(s => s.id !== id);
  renderRoofSections();
  updatePanelPreview();
}

function syncMultiRoofUi() {
  const isEnabled = !!window.state.multiRoof;
  const count = Array.isArray(window.state.roofSections) ? window.state.roofSections.length : 0;
  const badge = document.getElementById('multi-roof-count-badge');
  const addBtn = document.getElementById('add-roof-btn');
  const copy = document.getElementById('multi-roof-actions-copy');
  if (badge) {
    badge.textContent = !isEnabled ? 'Kapalı' : count === 0 ? '1 ana yüzey' : `${count + 1} yüzey aktif`;
  }
  if (addBtn) {
    const atMax = count >= 2;
    addBtn.style.display = isEnabled && !atMax ? '' : isEnabled && atMax ? 'none' : '';
  }
  if (copy) {
    if (!isEnabled) copy.textContent = 'Ek yüzeyler kapalı.';
    else if (count >= 2) copy.textContent = 'Maksimum ek yüzey sayısına ulaşıldı.';
    else copy.textContent = `Şu an ${count + 1} yüzey tanımlı. İsterseniz ${2 - count} ek yüzey daha ekleyebilirsiniz.`;
  }
}

function renderRoofSections() {
  const list = document.getElementById('roof-sections-list');
  if (!list) return;
  list.innerHTML = '';
  list.className = 'roof-sections-stack';
  window.state.roofSections.forEach((sec, idx) => {
    const secNum = idx + 2;
    const dirOpts = COMPASS_DIRS.map(d =>
      `<option value="${d.azimuth}" data-coeff="${d.coeff}" data-name="${d.name}"${sec.azimuth === d.azimuth ? ' selected' : ''}>${d.name}</option>`
    ).join('');
    const div = document.createElement('div');
    div.className = 'roof-section-form';
    div.id = `sec-form-${sec.id}`;
    div.innerHTML = `
      <div class="roof-section-header">
        <div class="roof-section-title-wrap">
          <div class="roof-section-title"><span class="roof-section-index">${secNum}</span> Ek Kurulum Yüzeyi</div>
          <div class="roof-section-subtitle">Bu yüzey ana alandan bağımsız yön, eğim ve gölge değerleriyle hesaplanır.</div>
        </div>
        <button class="remove-section-btn" data-click-action="removeRoofSection" data-arg="${sec.id}" data-arg-type="number">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          Kaldır
        </button>
      </div>
      <div class="roof-section-summary" id="sec-summary-${sec.id}">
        <span class="roof-section-chip">Alan<strong>${Number(sec.area || 0).toFixed(0)} m²</strong></span>
        <span class="roof-section-chip">Yön<strong>${sec.azimuthName}</strong></span>
        <span class="roof-section-chip">Eğim<strong>${Number(sec.tilt || 0)}°</strong></span>
        <span class="roof-section-chip">Gölge<strong>%${Number(sec.shadingFactor || 0)}</strong></span>
      </div>
      <div class="roof-section-grid">
        <div class="roof-section-field">
          <label>Alan (m²)</label>
          <input type="number" id="sec-area-${sec.id}" value="${sec.area}" min="5" max="500"
            class="roof-section-input"
            data-input-action="updateSecAreaFromInput" data-arg="${sec.id}" data-arg-type="number"/>
        </div>
        <div class="roof-section-field">
          <label>Yön</label>
          <select id="sec-dir-${sec.id}" data-change-action="updateSecDirFromSelect" data-arg="${sec.id}" data-arg-type="number"
            class="roof-section-select">
            ${dirOpts}
          </select>
        </div>
        <div class="roof-section-field">
          <label>Eğim (°)</label>
          <input type="number" id="sec-tilt-${sec.id}" value="${sec.tilt}" min="0" max="90"
            class="roof-section-input"
            data-input-action="updateSecTiltFromInput" data-arg="${sec.id}" data-arg-type="number"/>
        </div>
        <div class="roof-section-field">
          <label>Gölgelenme (%)</label>
          <input type="number" id="sec-shade-${sec.id}" value="${sec.shadingFactor}" min="0" max="80"
            class="roof-section-input"
            data-input-action="updateSecShadeFromInput" data-arg="${sec.id}" data-arg-type="number"/>
        </div>
      </div>
      <div class="roof-section-footer">Öneri: Ayrı yüzey eklemeyi sadece gerçekten farklı yön veya gölge koşulu varsa kullanın.</div>`;
    list.appendChild(div);
  });
  syncMultiRoofUi();
}

function updateRoofSectionSummary(id) {
  const sec = window.state.roofSections.find(s => s.id === id);
  const summary = document.getElementById(`sec-summary-${id}`);
  if (!sec || !summary) return;
  summary.innerHTML = `
    <span class="roof-section-chip">Alan<strong>${Number(sec.area || 0).toFixed(0)} m²</strong></span>
    <span class="roof-section-chip">Yön<strong>${sec.azimuthName}</strong></span>
    <span class="roof-section-chip">Eğim<strong>${Number(sec.tilt || 0)}°</strong></span>
    <span class="roof-section-chip">Gölge<strong>%${Number(sec.shadingFactor || 0)}</strong></span>
  `;
}

function updateSecArea(id, val) {
  const sec = window.state.roofSections.find(s => s.id === id);
  if (sec) {
    sec.area = parseFloat(val) || sec.area;
    updateRoofSectionSummary(id);
    updatePanelPreview();
  }
}
function updateSecDir(id, sel) {
  const sec = window.state.roofSections.find(s => s.id === id);
  if (sec) {
    const opt = sel.options[sel.selectedIndex];
    sec.azimuth = parseInt(sel.value);
    sec.azimuthCoeff = parseFloat(opt.dataset.coeff);
    sec.azimuthName = opt.dataset.name;
    updateRoofSectionSummary(id);
  }
}
function updateSecTilt(id, val) {
  const sec = window.state.roofSections.find(s => s.id === id);
  if (sec) {
    sec.tilt = parseInt(val) || 0;
    updateRoofSectionSummary(id);
  }
}
function updateSecShade(id, val) {
  const sec = window.state.roofSections.find(s => s.id === id);
  if (sec) {
    sec.shadingFactor = Math.max(0, Math.min(80, parseInt(val) || 0));
    updateRoofSectionSummary(id);
  }
}

// ═══════════════════════════════════════════════════════════
// GÜNLÜK TÜKETİM
// ═══════════════════════════════════════════════════════════
function updateConsumption(val) {
  window.state.dailyConsumption = parseInt(val) || 10;
  const el = document.getElementById('consumption-val');
  if (el) el.textContent = val + ' kWh/gün';
  const desc = document.getElementById('consumption-desc');
  if (desc) {
    const monthly = Math.round(val * 30);
    desc.textContent = `Yaklaşık ${monthly} kWh/ay`;
  }
  if (window.state?.scenarioKey === 'off-grid' && window.state?.offgridCalculationMode !== 'advanced') {
    renderOffgridSimpleProfileSummary();
    updateOffgridGeneratorPreview();
    updatePanelPreview();
  }
}

// ═══════════════════════════════════════════════════════════
// BATARYA (BESS)
// ═══════════════════════════════════════════════════════════
function toggleBatteryBlock() {
  const tog = document.getElementById('battery-toggle');
  if (tog) { tog.checked = !tog.checked; onBatteryToggle(tog.checked); }
}

function onBatteryToggle(checked) {
  window.state.batteryEnabled = checked;
  const inputs = document.getElementById('battery-inputs');
  setElementVisible(inputs, checked, 'block');
  normalizeBatterySelection();
  if (checked && !document.getElementById('bat-models-wrap').innerHTML) {
    renderBatteryModels();
  }
  if (checked) {
    syncBatteryCustomInputs();
    updateBatterySummary();
  } else {
    const summary = document.getElementById('battery-summary');
    if (summary) {
      setElementVisible(summary, false);
      summary.innerHTML = '';
    }
  }
  updatePanelPreview();
  updateEquipmentSelectionSummary();
}

function renderBatteryModels() {
  const wrap = document.getElementById('bat-models-wrap');
  if (!wrap) return;
  normalizeBatterySelection();
  wrap.innerHTML = Object.entries(BATTERY_MODELS).map(([key, m]) => `
    <button type="button" class="bat-model-btn${window.state.battery.model === key ? ' selected' : ''}" data-battery-model="${key}">
      <div class="battery-model-topline">
        <span class="equipment-card-badge">${m.brand}</span>
        <span class="battery-model-voltage">${key === 'custom' ? 'Manuel modelleme' : (m.voltageClass || '')}</span>
      </div>
      <div class="battery-model-title">${m.name}</div>
      <div class="battery-model-spec">${m.spec}</div>
      <div class="equipment-chip-row equipment-chip-row-tight">
        ${m.chemistry ? `<span class="equipment-chip">${m.chemistry}</span>` : ''}
        ${m.dimensions ? `<span class="equipment-chip">${m.dimensions}</span>` : ''}
        ${m.expandability ? `<span class="equipment-chip">${m.expandability}</span>` : ''}
      </div>
      <div class="battery-model-grid">
        <div class="battery-model-stat"><span>Kullanılabilir enerji</span><strong>${Number(m.usableCapacity ?? (m.capacity * (m.dod ?? 1))).toFixed(1)} kWh</strong></div>
        <div class="battery-model-stat"><span>Sürekli güç</span><strong>${m.maxOutputKw ? `${Number(m.maxOutputKw).toFixed(1)} kW` : 'Üreticiye bağlı'}</strong></div>
        <div class="battery-model-stat"><span>Garanti</span><strong>${m.warranty ? `${m.warranty} yıl` : 'Teklifte doğrula'}</strong></div>
        <div class="battery-model-stat"><span>Model verimi</span><strong>${Math.round((m.efficiency || 0.9) * 100)}%</strong></div>
      </div>
      <div class="battery-model-note">${m.useCase || 'Teknik veri sayfası ile proje özelinde doğrulanmalıdır.'}</div>
    </button>`).join('');
  wrap.querySelectorAll('[data-battery-model]').forEach(btn => {
    btn.addEventListener('click', () => selectBatteryModel(btn.dataset.batteryModel));
  });
  syncBatteryCustomInputs();
  updateBatterySummary();
}

function syncBatteryCustomInputs() {
  normalizeBatterySelection();
  const battery = window.state.battery || BATTERY_MODELS.custom;
  const isCustom = battery.model === 'custom';
  const customWrap = document.getElementById('bat-custom-inputs');
  setElementVisible(customWrap, isCustom, 'block');
  const capEl = document.getElementById('bat-capacity');
  const dodEl = document.getElementById('bat-dod');
  const effEl = document.getElementById('bat-eff');
  const effInputEl = document.getElementById('bat-eff-input');
  if (capEl) capEl.value = Number(battery.capacity ?? BATTERY_MODELS.custom.capacity).toFixed(1);
  if (dodEl) dodEl.value = Math.round(Number(battery.dod ?? BATTERY_MODELS.custom.dod) * 100);
  const effPct = Math.round(Number(battery.efficiency ?? BATTERY_MODELS.custom.efficiency) * 100);
  if (effEl) effEl.value = effPct;
  if (effInputEl) effInputEl.value = effPct;
  updateBatCapacity(capEl?.value ?? battery.capacity);
  updateBatDod(dodEl?.value ?? Math.round((battery.dod || 0.8) * 100));
  updateBatEff(effPct);
  updateBatterySummary();
}

function selectBatteryModel(key) {
  const m = BATTERY_MODELS[key];
  if (!m) return;
  window.state.battery = { ...m, model: key };
  document.querySelectorAll('.bat-model-btn').forEach(b => b.classList.remove('selected'));
  const btn = document.querySelector(`[data-battery-model="${key}"]`);
  if (btn) btn.classList.add('selected');
  syncBatteryCustomInputs();
  updateBatterySummary();
  updatePanelPreview();
  updateEquipmentSelectionSummary();
}

function updateBatCapacity(val) {
  window.state.battery = { ...(window.state.battery || BATTERY_MODELS.custom) };
  window.state.battery.capacity = Math.max(1, Math.min(50, parseFloat(val) || BATTERY_MODELS.custom.capacity));
  const el = document.getElementById('bat-cap-val');
  if (el) el.textContent = window.state.battery.capacity + ' kWh';
  updateBatterySummary();
  updatePanelPreview();
  updateEquipmentSelectionSummary();
}
function updateBatDod(val) {
  window.state.battery = { ...(window.state.battery || BATTERY_MODELS.custom) };
  window.state.battery.dod = Math.max(0.5, Math.min(1, (parseInt(val, 10) || 80) / 100));
  const el = document.getElementById('bat-dod-val');
  if (el) el.textContent = Math.round(window.state.battery.dod * 100) + '%';
  updateBatterySummary();
  updatePanelPreview();
}
function updateBatEff(val) {
  window.state.battery = { ...(window.state.battery || BATTERY_MODELS.custom) };
  window.state.battery.efficiency = Math.max(0.75, Math.min(0.97, (parseInt(val, 10) || 90) / 100));
  const effPct = Math.round(window.state.battery.efficiency * 100);
  const el = document.getElementById('bat-eff-val');
  if (el) el.textContent = effPct + '%';
  const effInput = document.getElementById('bat-eff-input');
  if (effInput) effInput.value = effPct;
  const effRange = document.getElementById('bat-eff');
  if (effRange) effRange.value = effPct;
  updateBatterySummary();
  updatePanelPreview();
}

function syncBatteryEfficiencyInputs(val, source = 'range') {
  const normalized = Math.max(75, Math.min(97, parseInt(val, 10) || 90));
  const rangeEl = document.getElementById('bat-eff');
  const inputEl = document.getElementById('bat-eff-input');
  if (rangeEl) rangeEl.value = normalized;
  if (inputEl) inputEl.value = normalized;
  updateBatteryCustom();
}

function resolveBatteryEfficiencyInput() {
  const rangeEl = document.getElementById('bat-eff');
  const inputEl = document.getElementById('bat-eff-input');
  const rangeValue = parseInt(rangeEl?.value, 10);
  const inputValue = parseInt(inputEl?.value, 10);
  const hasRange = Number.isFinite(rangeValue);
  const hasInput = Number.isFinite(inputValue);
  const currentPct = Math.round(Number(window.state.battery?.efficiency ?? BATTERY_MODELS.custom.efficiency) * 100);
  const activeId = document.activeElement?.id;

  if (hasRange && hasInput && rangeValue !== inputValue) {
    if (activeId === 'bat-eff') return rangeValue;
    if (activeId === 'bat-eff-input') return inputValue;
    if (rangeValue !== currentPct && inputValue === currentPct) return rangeValue;
    if (inputValue !== currentPct && rangeValue === currentPct) return inputValue;
  }
  if (hasInput) return inputValue;
  if (hasRange) return rangeValue;
  return currentPct;
}

function updateBatteryCustom() {
  const capValue = document.getElementById('bat-capacity')?.value;
  const dodValue = document.getElementById('bat-dod')?.value;
  const effValue = resolveBatteryEfficiencyInput();
  const base = { ...BATTERY_MODELS.custom, ...(window.state.battery || {}) };
  window.state.battery = { ...base, model: 'custom', name: BATTERY_MODELS.custom.name, spec: BATTERY_MODELS.custom.spec, price_try: 0 };
  document.querySelectorAll('.bat-model-btn').forEach(b => b.classList.toggle('selected', b.dataset.batteryModel === 'custom'));
  const customWrap = document.getElementById('bat-custom-inputs');
  setElementVisible(customWrap, true, 'block');
  updateBatCapacity(capValue ?? window.state.battery.capacity);
  updateBatDod(dodValue ?? Math.round(window.state.battery.dod * 100));
  updateBatEff(effValue ?? Math.round(window.state.battery.efficiency * 100));
  window.state.battery.usableCapacity = Number(window.state.battery.capacity) * Number(window.state.battery.dod);
  updateBatterySummary();
  updatePanelPreview();
  updateEquipmentSelectionSummary();
}

function updateBatterySummary() {
  const summary = document.getElementById('battery-summary');
  if (!summary) return;
  if (!window.state.batteryEnabled) {
    setElementVisible(summary, false);
    summary.innerHTML = '';
    return;
  }
  normalizeBatterySelection();
  const selected = window.state.battery || BATTERY_MODELS.custom;
  const base = BATTERY_MODELS[selected.model] || BATTERY_MODELS.custom;
  const merged = { ...base, ...selected };
  const usableCapacity = Math.max(0, Number(merged.usableCapacity ?? ((merged.capacity || 0) * (merged.dod ?? 1))));
  const modelEfficiency = Math.round(Number(merged.efficiency || 0.9) * 100);
  setElementVisible(summary, true, 'grid');
  summary.innerHTML = `
    <div class="battery-summary-head">
      <div>
        <strong>${merged.name}</strong>
        <span>${merged.spec}</span>
      </div>
      <span class="equipment-card-badge">${merged.brand}</span>
    </div>
    <div class="battery-summary-grid">
      <div class="battery-summary-stat"><span>Kullanılabilir enerji</span><strong>${usableCapacity.toFixed(1)} kWh</strong></div>
      <div class="battery-summary-stat"><span>Sürekli güç</span><strong>${merged.maxOutputKw ? `${Number(merged.maxOutputKw).toFixed(1)} kW` : 'Üreticiye göre'}</strong></div>
      <div class="battery-summary-stat"><span>Kimya</span><strong>${merged.chemistry || 'Belirtilmedi'}</strong></div>
      <div class="battery-summary-stat"><span>Model çevrim verimi</span><strong>${modelEfficiency}%</strong></div>
      <div class="battery-summary-stat"><span>Garanti</span><strong>${merged.warranty ? `${merged.warranty} yıl` : 'Teklifte doğrula'}</strong></div>
      <div class="battery-summary-stat"><span>Genişleme</span><strong>${merged.expandability || 'Üreticiye göre'}</strong></div>
    </div>
    <div class="equipment-card-note"><strong>Ne için uygun:</strong> ${merged.useCase || 'Akşam tüketimi ve yedekleme ihtiyaçları için değerlendirilir.'}</div>
    <div class="equipment-card-note equipment-card-note-muted"><strong>Teknik not:</strong> ${merged.details || 'Kesin değerler teklif ve veri sayfası ile doğrulanmalıdır.'}</div>`;
}

// ═══════════════════════════════════════════════════════════
// NET METERING
// ═══════════════════════════════════════════════════════════
function toggleNMBlock() {
  const tog = document.getElementById('nm-toggle');
  if (tog) { tog.checked = !tog.checked; onNMToggle(tog.checked); }
}

function onNMToggle(checked) {
  // Off-grid systems cannot export to the grid — block the combination
  if (checked && window.state.scenarioKey === 'off-grid') {
    showToast(i18n.t('offGrid.nmBlockedWarn'), 'warning');
    const tog = document.getElementById('nm-toggle');
    if (tog) tog.checked = false;
    return;
  }
  window.state.netMeteringEnabled = checked;
  const inputs = document.getElementById('nm-inputs');
  setElementVisible(inputs, checked, 'block');
}

function toggleOMBlock() {
  const tog = document.getElementById('om-toggle');
  if (tog) { tog.checked = !tog.checked; onOMToggle(tog.checked); }
}

function onOMToggle(checked) {
  window.state.omEnabled = checked;
  const inputs = document.getElementById('om-inputs');
  if (inputs) inputs.style.display = checked ? 'block' : 'none';
}


// ═══════════════════════════════════════════════════════════
// PWA
// ═══════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

window.addEventListener('load', () => {
  initTheme();
  syncSettingsPanel();
  updateTilt(window.state.tilt ?? 33);
  updateShading(window.state.shadingFactor ?? 10);
  setTimeout(() => {
    positionRangeThumb('tilt-slider','tilt-val',0,90);
    positionRangeThumb('shading-slider','shading-val',0,50);
  }, 100);
  // Off-grid katalog açılır listesini ilk yüklemede doldur
  updateOffgridCatalogOptions();
  // F1.C.6: HTML statik dinamik-pct utility'lerini CSS var'a aktar.
  // <div class="bar-segment" data-h="26"> → --h:26% (CSS-safe direct property).
  document.querySelectorAll('[data-h]').forEach(el => el.style.setProperty('--h', el.dataset.h + '%'));
  document.querySelectorAll('[data-w]').forEach(el => el.style.setProperty('--w', el.dataset.w + '%'));
  document.querySelectorAll('[data-l]').forEach(el => el.style.setProperty('--l', el.dataset.l + '%'));
});

// ═══════════════════════════════════════════════════════════
// WINDOW EXPOSE — HTML onclick için
// ═══════════════════════════════════════════════════════════
window.goToStep = goToStep;
window.requestStepChange = requestStepChange;
// F1.B.2 — step-nav grubu: 18 inline onclick'in yerine data-action delegation.
registerActions({ goToStep, requestStepChange, setExportTariffAuto });
window.validateStep1 = validateStep1;
window.validateStep2 = validateStep2;
window.validateStep3 = validateStep3;
window.validateStep4 = validateStep4;
window.validateStep5 = validateStep5;
window.repositionMap = repositionMap;
window.updateTilt = updateTilt;
window.updateShading = updateShading;
window.updateSoiling = updateSoiling;
window.updateTariffType = updateTariffType;
window.updateTariffAssumptions = updateTariffAssumptions;
window.updateAssumptionControls = updateAssumptionControls;
window.syncAssumptionControlsFromState = syncAssumptionControlsFromState;
window.updateOnGridAssumptions = updateOnGridAssumptions;
window.updateOnGridMonthlyConsumption = updateOnGridMonthlyConsumption;
window.setOnGridInputMode = setOnGridInputMode;
window.setOnGridDesignTarget = setOnGridDesignTarget;
window.fillOnGridMonthlyFromAnnual = fillOnGridMonthlyFromAnnual;
window.handleHourlyCsvUpload = handleHourlyCsvUpload;
window.clearHourlyCsvUpload = clearHourlyCsvUpload;
window.handleOffgridPvCsvUpload = handleOffgridPvCsvUpload;
window.handleOffgridLoadCsvUpload = handleOffgridLoadCsvUpload;
window.handleOffgridHighResLoadUpload = handleOffgridHighResLoadUpload;
window.handleOffgridInverterLogUpload = handleOffgridInverterLogUpload;
window.clearOffgridLoadCsvUpload = clearOffgridLoadCsvUpload;
window.clearOffgridPvCsvUpload = clearOffgridPvCsvUpload;
window.handleOffgridCriticalCsvUpload = handleOffgridCriticalCsvUpload;
window.clearOffgridCriticalCsvUpload = clearOffgridCriticalCsvUpload;
window.clearOffgridHighResLoadUpload = clearOffgridHighResLoadUpload;
window.clearOffgridInverterLogUpload = clearOffgridInverterLogUpload;
window.handleOffgridEvidenceFileUpload = handleOffgridEvidenceFileUpload;
window.updateProposalGovernanceInput = updateProposalGovernanceInput;
window.updateUserIdentityInput = updateUserIdentityInput;
window.attachEvidenceFromInput = attachEvidenceFromInput;
window.persistProposalState = persistState;
window.updateConsumption = updateConsumption;
window.positionRangeThumb = positionRangeThumb;
window.buildCompass = buildCompass;
window.selectDirection = selectDirection;
window.syncRoofOrientationUI = syncRoofOrientationUI;
window.closeRoofToolLegend = closeRoofToolLegend;
window.openRoofToolLegend = openRoofToolLegend;
window.setPanelSelectionMode = setPanelSelectionMode;
window.buildPanelCards = buildPanelCards;
window.updatePanelPreview = updatePanelPreview;
window.updateEquipmentSelectionSummary = updateEquipmentSelectionSummary;
window.toggleMultiRoof = toggleMultiRoof;
window.addRoofSection = addRoofSection;
window.removeRoofSection = removeRoofSection;
window.renderRoofSections = renderRoofSections;
window.syncMultiRoofUi = syncMultiRoofUi;
window.updateSecArea = updateSecArea;
window.updateSecDir = updateSecDir;
window.updateSecTilt = updateSecTilt;
window.updateSecShade = updateSecShade;
window.toggleBatteryBlock = toggleBatteryBlock;
window.onBatteryToggle = onBatteryToggle;
window.renderBatteryModels = renderBatteryModels;
window.selectBatteryModel = selectBatteryModel;
window.updateBatCapacity = updateBatCapacity;
window.updateBatDod = updateBatDod;
window.updateBatEff = updateBatEff;
window.syncBatteryEfficiencyInputs = syncBatteryEfficiencyInputs;
window.updateBatteryCustom = updateBatteryCustom;
window.toggleNMBlock = toggleNMBlock;
window.onNMToggle = onNMToggle;
window.toggleOMBlock = toggleOMBlock;
window.onOMToggle = onOMToggle;
window.selectScenario = selectScenario;
window.renderScenarioCards = renderScenarioCards;
window.updateScenarioUI = updateScenarioUI;
window.switchLanguage = async function switchSolarRotaLanguage(lang) {
  await switchLanguage(lang);
  renderScenarioCards();
  updateScenarioUI();
  syncScenarioControls();
  if (window.state?.results && document.getElementById('step-7')?.classList.contains('active')) {
    renderResults();
  }
};

// F1.B.2 settings grubu: 11 inline onclick (open/close, theme, lang, currency).
// switchLanguage'ın window'da yeniden tanımlanan wrapper'ı kullanılıyor.
function openDashboardFromSettings() { closeSettings(); openDashboard(); }
registerActions({
  openSettings,
  closeSettings,
  setTheme,
  switchCurrency,
  switchLanguage: (arg) => window.switchLanguage(arg),
  openDashboardFromSettings,
});

// F1.B.2 modals + heatmap grubu: 12 inline onclick.
// saveCurrentCalculation, openComparison/closeComparison, dashboard kontrolleri,
// heatmap month (number arg) + animasyon toggle.
registerActions({
  saveCurrentCalculation,
  openComparison,
  closeComparison,
  compareDashboardSelected,
  clearAllSaved,
  closeDashboard,
  toggleHeatmapAnimation,
  setHeatmapMonth,
  // Step 7 "Teklif Al" iletişim formu modal'ı + KVKK/Açık Rıza sub-modal
  openQuoteModal,
  closeQuoteModal,
  openLegalModal,
  closeLegalModal,
  submitQuoteForm,
});

// F1.B.2 tariff core grubu: 37 inline change/input.
// updateTariffAssumptions çoğu tarife alanında hem change hem input;
// updateTariffType select.value bekler (data-arg-prop="value").
registerActions({
  updateTariffAssumptions,
  updateAssumptionControls,
  updateTariffType,
});

// F1.B.2 on-grid panel grubu: 14 inline.
// 3 object-arg variants HTML'de data-arg-type="json" ile geçiyor —
// dispatcher otomatik JSON.parse eder, fonksiyon orijinal {fillMonthly:true}
// imzasını korur.
function updateOnGridAssumptionsAndTariff() {
  updateOnGridAssumptions();
  updateTariffAssumptions();
}
function fillOnGridMonthlyFromAnnualFromUI() {
  const v = document.getElementById('on-grid-annual-consumption')?.value;
  if (v !== undefined) fillOnGridMonthlyFromAnnual(v);
}
registerActions({
  updateOnGridAssumptions,
  setOnGridInputMode,
  setOnGridDesignTarget,
  updateOnGridAssumptionsAndTariff,
  fillOnGridMonthlyFromAnnualFromUI,
  updateOnGridMonthlyConsumption,
});

// F1.B.2 landing/FAQ/tour grubu: 24 inline.
// toggleFaq imzası (el) bekler — dispatcher handler(arg, el, e) geçiriyor,
// register'da el'i ikinci argüman olarak alıyoruz. Diğerleri landing-
// bootstrap.js'da window.X olarak expose; lazy-bind ile çağırıyoruz çünkü
// app.js önce yüklenir, landing-bootstrap'ın window'a yazması sonra olabilir.
function goToLandingTopFromBrandLink(_arg, _el, e) {
  if (e?.preventDefault) e.preventDefault();
  window.goToLandingTop?.();
}
registerActions({
  goToLandingTopFromBrandLink,
  startCalculator: () => window.startCalculator?.(),
  startCalculatorWithScenario: (arg) => window.startCalculatorWithScenario?.(arg),
  lpTourStep: (arg) => window.lpTourStep?.(arg),
  toggleFaq: (_arg, el) => window.toggleFaq?.(el),
});

// F1.B.2 equipment grubu: 24 inline (roof/map/battery/NM/OM + off-grid device).
// Slider/select this.value handler'ları içlerinde parseInt/coerce yapıyor —
// data-arg-prop="value" string geçirimi davranışı bozmaz.
registerActions({
  toggleMapLayer,
  closeRoofToolLegend,
  openRoofToolLegend,
  toggleStep3Fullscreen,
  updateTilt,
  updateShading,
  updateSoiling,
  updateGroundAlbedo,
  toggleMultiRoof,
  addRoofSection,
  updateSecAreaFromInput: (arg, el) => updateSecArea(arg, el?.value),
  updateSecDirFromSelect: (arg, el) => updateSecDir(arg, el),
  updateSecTiltFromInput: (arg, el) => updateSecTilt(arg, el?.value),
  updateSecShadeFromInput: (arg, el) => updateSecShade(arg, el?.value),
  setPanelSelectionMode,
  onBatteryToggle,
  updateBatteryCustom,
  toggleNMBlock,
  onNMToggle,
  toggleOMBlock,
  onOMToggle,
  setOffgridDesignTarget,
  updateOffgridCatalogOptions,
  updateOffgridDevicePreview,
  addOffgridDeviceFromCatalog,
  addOffgridDevice,
});

// F1.B.2 advanced-loads grubu: 36 inline (bill/EV/heatpump/tax + CSV upload).
// CSV upload handler'ları file input'tan event objesi bekler — register'da
// (_arg, _el, e) => handleX(e) ile dispatcher'ın 3. parametresini iletiyoruz.
// Quick-fill butonları slider DOM'unu da güncellemeli — wrapper.
function updateConsumptionQuickFill(arg) {
  const n = Number(arg);
  updateConsumption(n);
  const s = document.getElementById('consumption-slider');
  if (s) s.value = String(n);
}
registerActions({
  // Consumption
  updateConsumption,
  updateConsumptionQuickFill,
  // CSV upload (event-arg via 3rd dispatcher param)
  handleHourlyCsvUpload: (_arg, _el, e) => handleHourlyCsvUpload(e),
  handleOffgridPvCsvUpload: (_arg, _el, e) => handleOffgridPvCsvUpload(e),
  handleOffgridLoadCsvUpload: (_arg, _el, e) => handleOffgridLoadCsvUpload(e),
  handleOffgridCriticalCsvUpload: (_arg, _el, e) => handleOffgridCriticalCsvUpload(e),
  handleOffgridHighResLoadUpload: (_arg, _el, e) => handleOffgridHighResLoadUpload(e),
  handleOffgridInverterLogUpload: (_arg, _el, e) => handleOffgridInverterLogUpload(e),
  clearHourlyCsvUpload,
  clearOffgridPvCsvUpload,
  clearOffgridLoadCsvUpload,
  clearOffgridCriticalCsvUpload,
  clearOffgridHighResLoadUpload,
  clearOffgridInverterLogUpload,
  // Bill
  toggleBillBlock,
  onBillToggle,
  // EV
  toggleEVBlock,
  onEVToggle,
  updateEVInput,
  // Heat pump
  toggleHeatPumpBlock,
  onHeatPumpToggle,
  updateHeatPumpInput,
  // Tax
  toggleTaxBlock,
  onTaxToggle,
  updateTaxInput,
});

// F1.B.2 offgrid-evidence grubu: 51 inline.
// Çeşit-zengin grup — 17 evidence file input, 3 evidence document input,
// 14 L2 setting değişikliği, 12 governance input, 2 identity, 2 mode toggle,
// 1 slider DOM-update wrapper.
//
// File input handler'ları element-level data attributes kullanıyor:
//   <input data-change-action="handleOffgridEvidenceFileUpload"
//          data-evidence-field="offgridSiteShading"
//          data-evidence-status-id="offgrid-shading-evidence-status">
// Bu sözleşme, 17 ayrı wrapper yazmak yerine tek dispatcher satırıyla 17
// evidence alanını yönetir; yeni alan eklemek HTML değişikliği yetiyor.
function updateOffgridCriticalFractionFromSlider(_arg, el) {
  const valEl = document.getElementById('offgrid-critical-fraction-val');
  if (valEl && el) valEl.textContent = el.value + '%';
  updateOffgridL2Settings();
}
registerActions({
  handleOffgridEvidenceFileUpload: (_arg, el, e) =>
    handleOffgridEvidenceFileUpload(e, el?.dataset.evidenceField, el?.dataset.evidenceStatusId),
  attachEvidenceFromInput: (_arg, el) =>
    attachEvidenceFromInput(el?.dataset.evidenceField, el),
  setOffgridCalculationMode,
  updateOffgridL2Settings,
  updateOffgridCriticalFractionFromSlider,
  updateProposalGovernanceInput,
  updateUserIdentityInput,
});

// F1.B.2 misc grubu: 49 inline (validate*, export, exchange rate, scenario
// slider'lar, season toggle, vb.) Ayrıca event.stopPropagation kontrol-akışı
// kalıbı için "stopPropagation" virtual action.
//
// Multi-stmt wrapper'lar:
function updateOmRateFromInput(_arg, el) {
  if (el) window.state.omRate = parseFloat(el.value) || 1.2;
}
function updateInsuranceRateFromInput(_arg, el) {
  if (el) window.state.insuranceRate = parseFloat(el.value) || 0;
}
function setExportTariffAuto() {
  const tariffEl = document.getElementById('tariff-input');
  const exportEl = document.getElementById('export-tariff-input');
  if (!tariffEl || !exportEl) return;
  const pst = parseFloat(tariffEl.value) || 0;
  const autoVal = Math.round(pst * 0.70 * 100) / 100;
  exportEl.value = autoVal;
  updateTariffAssumptions();
  if (window.state?.results) renderResults();
}
function setManualUsdTryRateAndRefresh(_arg, el) {
  if (!el) return;
  setManualUsdTryRate(el.value);
  updateTariffAssumptions();
  if (window.state?.results) renderResults();
}
function setManualUsdTryRateAndSyncSlider(_arg, el) {
  if (!el) return;
  setManualUsdTryRate(el.value);
  const t = document.getElementById('usd-try-input');
  if (t) t.value = el.value;
}
function setManualUsdTryRateSyncAndRefresh(_arg, el) {
  if (!el) return;
  setManualUsdTryRate(el.value);
  const t = document.getElementById('usd-try-input');
  if (t) t.value = el.value;
  updateTariffAssumptions();
  if (window.state?.results) renderResults();
}
function updateScenarioCustomFromSlider(_arg, el) {
  if (!el) return;
  const lbl = document.getElementById('scenario-custom-label');
  if (lbl) lbl.textContent = '%' + el.value;
  onScenarioCustomChange();
}
function updateFxGrowthFromSlider(_arg, el) {
  if (!el) return;
  const lbl = document.getElementById('fx-growth-label');
  if (lbl) lbl.textContent = '%' + el.value;
  onScenarioCustomChange();
}
function updateTariffAssumptionsAndRefresh() {
  updateTariffAssumptions();
  if (window.state?.results) renderResults();
}

registerActions({
  // event control flow
  stopPropagation: (_arg, _el, e) => e?.stopPropagation(),
  // Step validation
  validateStep1, validateStep2, validateStep3, validateStep4, validateStep5,
  // Misc no-arg actions
  refreshExchangeRate,
  downloadPDF,
  downloadTechnicalPDF,
  useGeolocation,
  applyManualCoordinates,
  toggleEngReport,
  shareResults,
  refreshOSMShadowAnalysis,
  goToLanding: () => window.goToLanding?.(),
  lpTourPrev: () => window.lpTourPrev?.(),
  lpTourNext: () => window.lpTourNext?.(),
  // exportProposalHandoff — UI butonu artık openQuoteModal'a yönlendiriyor;
  // fonksiyon ui-render.js'te window.exportProposalHandoff olarak debug için kalır.
  exportCrmLead,
  clearRoofDrawing: () => window.clearRoofDrawing?.(),
  // Hourly profile season
  setHourlySeason,
  // EV
  onEVModelChange,
  // OSM shadow toggle
  toggleOSMShadow,
  // Panel preview
  updatePanelPreview,
  // Battery efficiency 2-arg via data-sync-source
  syncBatteryEfficiencyInputs: (arg, el) => syncBatteryEfficiencyInputs(arg, el?.dataset.syncSource),
  // State mutation wrappers
  updateOmRateFromInput,
  updateInsuranceRateFromInput,
  // setManualUsdTryRate variants
  setManualUsdTryRateAndRefresh,
  setManualUsdTryRateAndSyncSlider,
  setManualUsdTryRateSyncAndRefresh,
  // Scenario sliders
  updateScenarioCustomFromSlider,
  updateFxGrowthFromSlider,
  // Tariff refresh wrapper
  updateTariffAssumptionsAndRefresh,
});

// F1.C.7 batch 1: JS modüllerinde inline onclick → data-action.
// inverter card'ı buildInverterCards() ile dinamik üretiliyor; onclick
// inline'dan data-click-action'a alındı. selectInverter zaten import'lu.
registerActions({
  selectInverter,
  runComparison,
  // bill-analysis.js dynamic content events
  onBillInput,
  billQuickFill,
  billClear,
  // import8760Csv expects a File; dispatcher el is the input, files[0] is the file
  import8760Csv: (_arg, el) => import8760Csv(el?.files?.[0]),
  // F1.C.7 batch 5 — app.js dynamic content
  removeRoofSection,
  selectOffgridResidentialProfile,
  removeOffgridDevice,
  // Off-grid device table multi-arg — index + field from element dataset
  updateOffgridDeviceField: (arg, el) => {
    if (!el) return;
    updateOffgridDevice(+el.dataset.index, el.dataset.field, arg);
  },
});
window.selectCity = selectCity;
window.useGeolocation = useGeolocation;
window.applyManualCoordinates = applyManualCoordinates;
window.isInTurkey = isInTurkey;
window.clearRoofDrawing = function() {
  if (window._mapProvider === 'google' && window._googleMapAdapter?.clearRoofDrawing) {
    window._googleMapAdapter.clearRoofDrawing();
    const roofAreaInput = document.getElementById('roof-area');
    if (roofAreaInput) roofAreaInput.value = '';
    const startHint = document.getElementById('roof-draw-start-hint');
    if (startHint) startHint.classList.remove('is-hidden');
    return;
  }
  if (window.roofDrawnItems) {
    window.roofDrawnItems.clearLayers();
    if (window.syncRoofLayers) window.syncRoofLayers(window.roofDrawnItems);
    window.state.roofArea = 0;
    window.state.roofGeometry = null;
    const roofAreaInput = document.getElementById('roof-area');
    if (roofAreaInput) roofAreaInput.value = '';
    showToast('Kurulum alanı çizimleri temizlendi.', 'info');
    document.getElementById('clear-roof-btn').style.display = 'none';
    const startHint = document.getElementById('roof-draw-start-hint');
    if (startHint) startHint.style.display = 'flex';
    const badge = document.getElementById('roof-area-badge');
    if (badge) badge.style.display = 'none';
  }
};
window.toggleOSMShadow = toggleOSMShadow;
window.refreshOSMShadowAnalysis = refreshOSMShadowAnalysis;
window.refreshExchangeRate = refreshExchangeRate;
window.setManualUsdTryRate = setManualUsdTryRate;

// ═══════════════════════════════════════════════════════════
// OFF-GRID LEVEL 2 — Durum yönetimi ve cihaz listesi
// ═══════════════════════════════════════════════════════════

const _escHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const OFFGRID_RESIDENTIAL_PROFILES = [
  {
    key: 'studio',
    title: 'Stüdyo / tiny house',
    dailyKwh: 4,
    criticalFraction: 0.60,
    autonomyGoal: 'critical-safety',
    description: 'Tek kişi, küçük buzdolabı, modem, temel aydınlatma ve düşük güçlü elektronikler.',
    criticalLoads: 'Mini buzdolabı, modem, 2-4 LED, telefon/laptop şarjı',
    comfortLoads: 'Kısa süre TV, fan, kettle/kahve makinesi',
    caution: 'Elektrikli ısıtıcı, ocak veya klima varsa ileri moda geçin.'
  },
  {
    key: 'small-home',
    title: '1+1 küçük ev',
    dailyKwh: 7,
    criticalFraction: 0.52,
    autonomyGoal: 'reliability',
    description: 'Az kişi, buzdolabı, modem, TV, temel mutfak ve sınırlı çamaşır kullanımı.',
    criticalLoads: 'Buzdolabı, modem, temel aydınlatma, güvenlik/kamera',
    comfortLoads: 'TV, laptop, çamaşır makinesi, küçük mutfak cihazları',
    caution: 'Klima veya hidrofor düzenli çalışıyorsa tüketimi yukarı çekin.'
  },
  {
    key: 'family-home',
    title: '2+1 / 3+1 aile evi',
    dailyKwh: 12,
    criticalFraction: 0.45,
    autonomyGoal: 'reliability',
    description: 'Buzdolabı, aydınlatma, TV/medya, çamaşır-bulaşık ve orta seviye gündelik kullanım.',
    criticalLoads: 'Buzdolabı, modem, kritik aydınlatma, güvenlik ve zorunlu küçük cihazlar',
    comfortLoads: 'TV, çamaşır/bulaşık, küçük mutfak, fan ve günlük elektronikler',
    caution: 'Elektrikli sıcak su, ısı pompası veya klima yoğun kullanımı ayrıca modellenmeli.'
  },
  {
    key: 'comfort-home',
    title: 'Konforlu ev / klima',
    dailyKwh: 22,
    criticalFraction: 0.38,
    autonomyGoal: 'reliability',
    description: 'Klima/fan, daha fazla mutfak ve çamaşır yükü, yüksek gece tüketimi ihtimali.',
    criticalLoads: 'Buzdolabı, modem, güvenlik, temel aydınlatma, gerekiyorsa hidrofor',
    comfortLoads: 'Klima, TV, çamaşır/bulaşık, güçlü mutfak cihazları',
    caution: 'Klima saatleri sonucu çok değiştirir; teklif öncesi ileri cihaz listesi önerilir.'
  },
  {
    key: 'rural-pump',
    title: 'Kırsal ev + hidrofor',
    dailyKwh: 16,
    criticalFraction: 0.58,
    autonomyGoal: 'critical-safety',
    description: 'Konut yüküne ek olarak kuyu/hidrofor, güvenlik ve daha yüksek kritik yük oranı.',
    criticalLoads: 'Buzdolabı, modem, güvenlik, temel aydınlatma, hidrofor/pompa',
    comfortLoads: 'TV, atölye/el aleti, küçük mutfak ve ara sıra çamaşır',
    caution: 'Pompa gücü ve çalışma saati biliniyorsa ileri modda tek tek girilmeli.'
  }
];

function getOffgridResidentialProfile(key) {
  return OFFGRID_RESIDENTIAL_PROFILES.find(profile => profile.key === key) || OFFGRID_RESIDENTIAL_PROFILES[2];
}

function renderOffgridResidentialProfiles() {
  const grid = document.getElementById('offgrid-residential-profile-grid');
  if (!grid) return;
  const selectedKey = window.state.offgridLoadProfileKey || 'family-home';
  grid.innerHTML = OFFGRID_RESIDENTIAL_PROFILES.map(profile => `
    <button type="button" class="offgrid-profile-card${profile.key === selectedKey ? ' selected' : ''}" data-click-action="selectOffgridResidentialProfile" data-arg="${_escHtml(profile.key)}">
      <div class="offgrid-profile-card-title">
        <span>${_escHtml(profile.title)}</span>
        <small>${profile.dailyKwh} kWh/gün</small>
      </div>
      <p>${_escHtml(profile.description)}</p>
      <div class="offgrid-profile-chip-row">
        <span>Kritik ${Math.round(profile.criticalFraction * 100)}%</span>
        <span>${Math.round(profile.dailyKwh * 365).toLocaleString('tr-TR')} kWh/yıl</span>
      </div>
    </button>
  `).join('');
}

function renderOffgridSimpleProfileSummary() {
  const el = document.getElementById('offgrid-simple-profile-summary');
  if (!el) return;
  const profile = getOffgridResidentialProfile(window.state.offgridLoadProfileKey);
  const dailyKwh = Math.max(0, Number(window.state.dailyConsumption) || profile.dailyKwh);
  const criticalFraction = Math.max(0.1, Math.min(1, Number(window.state.offgridCriticalFraction) || profile.criticalFraction));
  const criticalDailyKwh = dailyKwh * criticalFraction;
  el.innerHTML = [
    ['Seçili profil', profile.title],
    ['Günlük ihtiyaç', `${dailyKwh.toFixed(dailyKwh >= 10 ? 0 : 1)} kWh/gün`],
    ['Yıllık karşılık', `${Math.round(dailyKwh * 365).toLocaleString('tr-TR')} kWh/yıl`],
    ['Kritik yük', `${criticalDailyKwh.toFixed(1)} kWh/gün (${Math.round(criticalFraction * 100)}%)`],
    ['Varsayılan kritikler', profile.criticalLoads],
    ['Konfor yükleri', profile.comfortLoads]
  ].map(([label, value]) => `
    <div class="offgrid-profile-summary-card">
      <span>${_escHtml(label)}</span>
      <strong>${_escHtml(value)}</strong>
    </div>
  `).join('') + `<div class="offgrid-profile-summary-card"><span>Not</span><strong>${_escHtml(profile.caution)}</strong></div>`;
}

function selectOffgridResidentialProfile(key) {
  const profile = getOffgridResidentialProfile(key);
  const s = window.state;
  s.offgridLoadProfileKey = profile.key;
  s.offgridCalculationMode = 'basic';
  s.dailyConsumption = profile.dailyKwh;
  s.offgridCriticalFraction = profile.criticalFraction;
  s.offgridAutonomyGoal = profile.autonomyGoal;

  const calcModeEl = document.getElementById('offgrid-calculation-mode');
  if (calcModeEl) calcModeEl.value = 'basic';
  const goalEl = document.getElementById('offgrid-autonomy-goal');
  if (goalEl) goalEl.value = profile.autonomyGoal;
  const slider = document.getElementById('consumption-slider');
  if (slider) slider.value = profile.dailyKwh;
  updateConsumption(profile.dailyKwh);

  const fracEl = document.getElementById('offgrid-critical-fraction');
  const fracValEl = document.getElementById('offgrid-critical-fraction-val');
  if (fracEl) fracEl.value = Math.round(profile.criticalFraction * 100);
  if (fracValEl) fracValEl.textContent = `${Math.round(profile.criticalFraction * 100)}%`;

  syncOffgridL2ModeUI();
  updatePanelPreview();
  updateOffgridL2Settings();
}
window.selectOffgridResidentialProfile = selectOffgridResidentialProfile;

function setOffgridCalculationMode(mode) {
  const nextMode = mode === 'advanced' ? 'advanced' : 'basic';
  const calcModeEl = document.getElementById('offgrid-calculation-mode');
  if (calcModeEl) calcModeEl.value = nextMode;
  window.state.offgridCalculationMode = nextMode;
  syncOffgridL2ModeUI();
  updateOffgridL2Settings();
}
window.setOffgridCalculationMode = setOffgridCalculationMode;

function syncOffgridL2ModeUI() {
  const s = window.state;
  const mode = s.offgridCalculationMode === 'advanced' ? 'advanced' : 'basic';
  s.offgridCalculationMode = mode;
  const simpleWrap = document.getElementById('offgrid-simple-mode-wrap');
  const fieldSection = document.getElementById('offgrid-field-data-section');
  const deviceSection = document.getElementById('offgrid-device-section');
  const liveSummary = document.getElementById('offgrid-live-summary');
  setElementVisible(simpleWrap, mode === 'basic');
  setElementVisible(fieldSection, mode === 'advanced');
  setElementVisible(deviceSection, mode === 'advanced');
  if (mode === 'advanced' && fieldSection && deviceSection && deviceSection.nextElementSibling !== fieldSection) {
    deviceSection.insertAdjacentElement('afterend', fieldSection);
  }
  if (liveSummary && mode !== 'advanced') setElementVisible(liveSummary, false);
  document.querySelectorAll('[data-offgrid-mode-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-offgrid-mode-btn') === mode);
  });
  renderOffgridResidentialProfiles();
  renderOffgridSimpleProfileSummary();
  syncOffgridDesignTargetCards();
  updateOffgridGeneratorPreview();
  if (mode === 'advanced') renderOffgridDeviceTable();
}

function estimateOffgridCriticalDailyKwh() {
  const s = window.state;
  const devices = Array.isArray(s.offgridDevices) ? s.offgridDevices : [];
  if (s.offgridCalculationMode === 'advanced' && devices.length > 0) {
    const criticalWh = devices
      .filter(device => device?.isCritical)
      .reduce((sum, device) => sum + Math.max(0, Number(device.powerW) || 0) * Math.max(0, Number(device.hoursPerDay) || 0), 0);
    if (criticalWh > 0) return criticalWh / 1000;
  }
  const dailyKwh = Math.max(0, Number(s.dailyConsumption) || getOffgridResidentialProfile(s.offgridLoadProfileKey).dailyKwh);
  const criticalFraction = Math.max(0.1, Math.min(1, Number(s.offgridCriticalFraction) || 0.45));
  return dailyKwh * criticalFraction;
}

function suggestOffgridGeneratorKw(strategy = 'critical-backup', preset = 'auto') {
  const s = window.state;
  const criticalDailyKwh = estimateOffgridCriticalDailyKwh();
  const totalDailyKwh = Math.max(criticalDailyKwh, Number(s.dailyConsumption) || getOffgridResidentialProfile(s.offgridLoadProfileKey).dailyKwh);
  const strategyBase = strategy === 'full-backup'
    ? Math.max(1.5, totalDailyKwh / 5 * 1.8)
    : strategy === 'bad-weather'
      ? Math.max(1.2, criticalDailyKwh / 4 * 2.1)
      : Math.max(1, criticalDailyKwh / 5 * 1.7);
  const presetFactor = preset === 'small' ? 0.75 : preset === 'large' ? 1.35 : 1;
  return Math.max(1, strategyBase * presetFactor);
}

function applyOffgridGeneratorPreset() {
  const s = window.state;
  const strategy = s.offgridGeneratorStrategy || 'critical-backup';
  const preset = s.offgridGeneratorSizePreset || 'auto';
  if (preset === 'custom') return;
  const suggestedKw = suggestOffgridGeneratorKw(strategy, preset);
  s.offgridGeneratorKw = Number(suggestedKw.toFixed(1));
  s.offgridGeneratorReservePct = strategy === 'full-backup' ? 35 : strategy === 'bad-weather' ? 25 : 15;
  s.offgridGeneratorStartSocPct = strategy === 'full-backup' ? 40 : strategy === 'bad-weather' ? 35 : 25;
  s.offgridGeneratorMaxHoursPerDay = strategy === 'full-backup' ? 12 : strategy === 'bad-weather' ? 8 : 5;
  const kwEl = document.getElementById('offgrid-generator-kw');
  if (kwEl && document.activeElement !== kwEl) kwEl.value = s.offgridGeneratorKw;
  const reserveEl = document.getElementById('offgrid-generator-reserve-pct');
  if (reserveEl) reserveEl.value = s.offgridGeneratorReservePct;
  const socEl = document.getElementById('offgrid-generator-start-soc-pct');
  if (socEl) socEl.value = s.offgridGeneratorStartSocPct;
  const hoursEl = document.getElementById('offgrid-generator-max-hours-day');
  if (hoursEl) hoursEl.value = s.offgridGeneratorMaxHoursPerDay;
}

function updateOffgridGeneratorPreview() {
  const el = document.getElementById('offgrid-generator-preview');
  if (!el) return;
  const s = window.state;
  const criticalDailyKwh = estimateOffgridCriticalDailyKwh();
  const suggestedKw = suggestOffgridGeneratorKw(s.offgridGeneratorStrategy, s.offgridGeneratorSizePreset);
  const configuredKw = Math.max(0, Number(s.offgridGeneratorKw) || 0);
  const maxHours = Math.max(0, Number(s.offgridGeneratorMaxHoursPerDay) || 0);
  const dailyGenKwh = configuredKw * maxHours;
  const strategyLabels = {
    'critical-backup': 'temel kritik yük desteği',
    'bad-weather': 'kötü hava dayanımı',
    'full-backup': 'tam yedekleme',
    manual: 'uzman saha kararı'
  };
  const presetLabels = { auto: 'otomatik öneri', small: 'küçük/ekonomik', large: 'büyük/konforlu', custom: 'elle girilen' };
  el.style.display = '';
  if (!s.offgridGeneratorEnabled) {
    el.innerHTML = `<strong>Jeneratör kapalı.</strong> Sistem sadece güneş + batarya ile değerlendirilir. Kritik yük yaklaşık ${criticalDailyKwh.toFixed(1)} kWh/gün. Uzun kapalı hava bekleniyorsa jeneratör seçeneği açılabilir.`;
    return;
  }
  const fitText = configuredKw + 0.05 >= suggestedKw ? 'Bu seçim mevcut varsayıma göre yeterli görünüyor.' : 'Bu seçim zayıf kalabilir; “Otomatik öner” veya “Büyük” seçimi daha güvenli olur.';
  el.innerHTML = `<strong>Jeneratör özeti:</strong> ${_escHtml(strategyLabels[s.offgridGeneratorStrategy] || strategyLabels['critical-backup'])} için ${_escHtml(presetLabels[s.offgridGeneratorSizePreset] || presetLabels.auto)} kullanılıyor. Yaklaşık ${configuredKw.toFixed(1)} kW jeneratör ve günde en fazla ${maxHours.toFixed(1)} saat çalışma varsayılır. ${fitText} Teorik günlük destek ≈ ${dailyGenKwh.toFixed(1)} kWh.`;
}

function updateOffgridL2Settings() {
  const s = window.state;
  const calcModeEl = document.getElementById('offgrid-calculation-mode');
  s.offgridCalculationMode = calcModeEl ? calcModeEl.value : 'basic';
  const fracEl = document.getElementById('offgrid-critical-fraction');
  s.offgridCriticalFraction = fracEl ? Number(fracEl.value) / 100 : 0.45;
  const goalEl = document.getElementById('offgrid-autonomy-goal');
  s.offgridAutonomyGoal = goalEl ? goalEl.value : 'reliability';
  const genEnabledEl = document.getElementById('offgrid-generator-enabled');
  s.offgridGeneratorEnabled = genEnabledEl ? genEnabledEl.checked : false;
  const genKwEl = document.getElementById('offgrid-generator-kw');
  s.offgridGeneratorKw = genKwEl ? parseFloat(genKwEl.value) || 5 : 5;
  const genFuelEl = document.getElementById('offgrid-generator-fuel-cost');
  s.offgridGeneratorFuelCostPerKwh = genFuelEl ? parseFloat(genFuelEl.value) || 8 : 8;
  const genCapexEl = document.getElementById('offgrid-generator-capex');
  s.offgridGeneratorCapexTry = genCapexEl ? (parseFloat(genCapexEl.value) || 0) : 0;
  const genStrategyEl = document.getElementById('offgrid-generator-strategy');
  s.offgridGeneratorStrategy = genStrategyEl ? genStrategyEl.value : 'critical-backup';
  const genFuelTypeEl = document.getElementById('offgrid-generator-fuel-type');
  s.offgridGeneratorFuelType = genFuelTypeEl ? genFuelTypeEl.value : 'diesel';
  const genSizePresetEl = document.getElementById('offgrid-generator-size-preset');
  s.offgridGeneratorSizePreset = genSizePresetEl ? genSizePresetEl.value : 'auto';
  const genReserveEl = document.getElementById('offgrid-generator-reserve-pct');
  s.offgridGeneratorReservePct = genReserveEl ? Math.max(0, parseFloat(genReserveEl.value) || 0) : 20;
  const genStartSocEl = document.getElementById('offgrid-generator-start-soc-pct');
  s.offgridGeneratorStartSocPct = genStartSocEl ? Math.max(0, parseFloat(genStartSocEl.value) || 0) : 25;
  const genMaxHoursEl = document.getElementById('offgrid-generator-max-hours-day');
  s.offgridGeneratorMaxHoursPerDay = genMaxHoursEl ? Math.max(0, parseFloat(genMaxHoursEl.value) || 0) : 8;
  const genMaintenanceEl = document.getElementById('offgrid-generator-maintenance-cost');
  s.offgridGeneratorMaintenanceCostTry = genMaintenanceEl ? (parseFloat(genMaintenanceEl.value) || 0) : 0;
  applyOffgridGeneratorPreset();
  const bwEl = document.getElementById('offgrid-bad-weather-level');
  s.offgridBadWeatherLevel = bwEl ? bwEl.value : '';
  // Jeneratör detay alanlarını göster/gizle
  const genDetails = document.getElementById('offgrid-generator-details');
  setElementVisible(genDetails, !!s.offgridGeneratorEnabled, 'grid');
  updateOffgridGeneratorPreview();
  syncOffgridL2ModeUI();
  persistState();
}
window.updateOffgridL2Settings = updateOffgridL2Settings;

function addOffgridDevice() {
  const s = window.state;
  if (!Array.isArray(s.offgridDevices)) s.offgridDevices = [];
  s.offgridDevices.push({ name: '', category: 'generic', powerW: 100, hoursPerDay: 4, nightHoursPerDay: 0, isCritical: false, usageType: 'manual' });
  renderOffgridDeviceTable();
  persistState();
}
window.addOffgridDevice = addOffgridDevice;

function addOffgridDeviceFromCatalog() {
  const catalogSelect = document.getElementById('offgrid-catalog-select');
  const qtyInput = document.getElementById('offgrid-catalog-qty');
  if (!catalogSelect) return;
  const catalogId = catalogSelect.value;
  if (!catalogId) return;
  const item = DEVICE_CATALOG.find(d => d.id === catalogId);
  if (!item) return;
  const qty = Math.max(1, parseInt(qtyInput?.value || '1') || 1);
  const s = window.state;
  if (!Array.isArray(s.offgridDevices)) s.offgridDevices = [];
  s.offgridDevices.push(catalogItemToDevice(item, qty));
  renderOffgridDeviceTable();
  persistState();
  // Seçimi sıfırla
  catalogSelect.value = '';
  if (qtyInput) qtyInput.value = '1';
}
window.addOffgridDeviceFromCatalog = addOffgridDeviceFromCatalog;

function _getCatLabels() {
  const lang = (typeof window !== 'undefined' && window._currentLang) || 'tr';
  return (DEVICE_CATEGORY_LABELS && DEVICE_CATEGORY_LABELS[lang]) || DEVICE_CATEGORY_LABELS.tr || {};
}

function updateOffgridCatalogOptions() {
  const catSelect = document.getElementById('offgrid-catalog-category');
  const devSelect = document.getElementById('offgrid-catalog-select');
  if (!catSelect || !devSelect) return;

  const catLabels = _getCatLabels();
  const allCatsLabel = i18n.t('offgridL2.catalogAllCategories') || '— Tüm Kategoriler —';

  // Populate category select if empty or stale (re-run on lang switch)
  catSelect.innerHTML = `<option value="">${_escHtml(allCatsLabel)}</option>` +
    DEVICE_CATEGORIES.map(c => `<option value="${c}"${catSelect.value===c?' selected':''}>${_escHtml(catLabels[c] || c)}</option>`).join('');

  const selectedCat = catSelect.value;
  const items = selectedCat ? getDevicesByCategory(selectedCat) : DEVICE_CATALOG;
  const selectPrompt = i18n.t('offgridL2.catalogSelectPrompt') || '— Cihaz seçin —';
  devSelect.innerHTML = `<option value="">${_escHtml(selectPrompt)}</option>` +
    items.map(d => `<option value="${_escHtml(d.id)}">${_escHtml(d.name)} (${d.powerW}W)</option>`).join('');

  updateOffgridDevicePreview();
}
window.updateOffgridCatalogOptions = updateOffgridCatalogOptions;

function updateOffgridDevicePreview() {
  const devSelect = document.getElementById('offgrid-catalog-select');
  const previewEl = document.getElementById('offgrid-device-preview');
  if (!previewEl) return;

  if (!devSelect || !devSelect.value) {
    previewEl.style.display = 'none';
    previewEl.innerHTML = '';
    return;
  }

  const catId = devSelect.value;
  const item = DEVICE_CATALOG.find(d => d.id === catId);
  if (!item) { previewEl.style.display = 'none'; return; }

  const catLabels = _getCatLabels();
  const usageMap = { continuous: '🔄 Sürekli', cyclic: '↩ Çevrimsel', scheduled: '⏰ Zamanlı', manual: '✋ Manuel' };
  const usageLabel = usageMap[item.usageType] || item.usageType;
  const critLabel = item.defaultCritical ? '✅ Evet' : '—';

  previewEl.style.display = '';
  previewEl.innerHTML = `
    <strong class="text-color-default">${_escHtml(item.name)}</strong>
    <span class="ml-2 opacity-60">${_escHtml(catLabels[item.category] || item.category)}</span>
    <div class="flex-wrap-row-mt-1">
      <span>${i18n.t('offgridL2.devicePreviewPower')}: <strong>${item.powerW}W</strong></span>
      <span>${i18n.t('offgridL2.devicePreviewDefaultHours')}: <strong>${item.defaultHoursPerDay}h/gün</strong></span>
      <span>${i18n.t('offgridL2.devicePreviewUsage')}: <strong>${_escHtml(usageLabel)}</strong></span>
      <span>${i18n.t('offgridL2.devicePreviewDefaultCritical')}: <strong>${critLabel}</strong></span>
    </div>`;
}
window.updateOffgridDevicePreview = updateOffgridDevicePreview;

function removeOffgridDevice(idx) {
  const s = window.state;
  if (!Array.isArray(s.offgridDevices)) return;
  s.offgridDevices.splice(idx, 1);
  renderOffgridDeviceTable();
  persistState();
}
window.removeOffgridDevice = removeOffgridDevice;

function updateOffgridDevice(idx, field, value) {
  const s = window.state;
  if (!Array.isArray(s.offgridDevices) || !s.offgridDevices[idx]) return;
  if (field === 'isCritical') {
    s.offgridDevices[idx][field] = !!value;
  } else if (field === 'powerW' || field === 'hoursPerDay' || field === 'nightHoursPerDay') {
    s.offgridDevices[idx][field] = Math.max(0, parseFloat(value) || 0);
  } else {
    s.offgridDevices[idx][field] = value;
  }
  renderOffgridDeviceTable();
  persistState();
}
window.updateOffgridDevice = updateOffgridDevice;

function _whLabel(wh) {
  return wh >= 1000 ? (wh / 1000).toFixed(2) + ' kWh' : Math.round(wh) + ' Wh';
}

function renderOffgridDeviceTable() {
  const s = window.state;
  const devices = Array.isArray(s.offgridDevices) ? s.offgridDevices : [];
  const tbody = document.getElementById('offgrid-device-tbody');
  const tableWrap = document.getElementById('offgrid-device-table-wrap');
  const emptyMsg = document.getElementById('offgrid-device-empty');
  const totalEl = document.getElementById('offgrid-device-total-kwh');
  const critEl  = document.getElementById('offgrid-device-critical-kwh');
  if (!tbody) return;

  if (devices.length === 0) {
    if (tableWrap) tableWrap.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = '';
    if (totalEl) totalEl.textContent = '—';
    if (critEl) critEl.textContent = '—';
    _renderOffgridLiveSummary(0, 0, 0, 0, 0);
    updateOffgridGeneratorPreview();
    return;
  }
  if (tableWrap) tableWrap.style.display = '';
  if (emptyMsg) emptyMsg.style.display = 'none';

  const catLabels = _getCatLabels();
  const nameLabel = i18n.t('offgridL2.deviceName');
  const powerLabel = i18n.t('offgridL2.devicePowerW');
  const hoursLabel = i18n.t('offgridL2.deviceHours');
  const nightLabel = i18n.t('offgridL2.deviceNightHours');
  const criticalLabel = i18n.t('offgridL2.deviceCritical');
  const categoryLabel = i18n.t('offgridL2.deviceCategory');
  const removeLabel = i18n.t('common.remove');
  const perDayLabel = i18n.t('units.perDay');
  let totalDailyWh = 0;
  let critDailyWh  = 0;
  let critCount    = 0;
  let estimatedNightWh = 0;

  tbody.innerHTML = devices.map((d, i) => {
    const powerW   = Math.max(0, Number(d.powerW) || 0);
    const hours    = Math.max(0, Number(d.hoursPerDay) || 0);
    const nightH   = Math.max(0, Math.min(hours, Number(d.nightHoursPerDay) || 0));
    const dailyWh  = powerW * hours;
    const nightWh  = powerW * nightH;
    totalDailyWh  += dailyWh;
    estimatedNightWh += nightWh;
    if (d.isCritical) { critDailyWh += dailyWh; critCount++; }

    return `<tr class="offgrid-device-row ogd-row">
      <td class="ogd-cell ogd-cell--name ogd-cell-pad" data-label="${_escHtml(nameLabel)}"><input type="text" value="${_escHtml(d.name || '')}" placeholder="${_escHtml(nameLabel)}" aria-label="${_escHtml(nameLabel)}"
        class="ogd-input ogd-input--name"
        data-input-action="updateOffgridDeviceField" data-arg-prop="value" data-index="${i}" data-field="name"/></td>
      <td class="ogd-cell ogd-cell--power ogd-cell-pad-right" data-label="${_escHtml(powerLabel)}"><input type="number" value="${powerW||100}" min="1" max="100000" aria-label="${_escHtml(powerLabel)}"
        class="ogd-input ogd-input--power"
        data-input-action="updateOffgridDeviceField" data-arg-prop="value" data-index="${i}" data-field="powerW"/></td>
      <td class="ogd-cell ogd-cell--hours ogd-cell-pad-right" data-label="${_escHtml(hoursLabel)}"><input type="number" value="${hours||4}" min="0.1" max="24" step="0.25" aria-label="${_escHtml(hoursLabel)}"
        class="ogd-input ogd-input--hours"
        data-input-action="updateOffgridDeviceField" data-arg-prop="value" data-index="${i}" data-field="hoursPerDay"/></td>
      <td class="ogd-cell ogd-cell--night ogd-cell-pad-right" data-label="${_escHtml(nightLabel)}"><input type="number" value="${nightH||0}" min="0" max="24" step="0.25" aria-label="${_escHtml(nightLabel)}"
        class="ogd-input ogd-input--night"
        data-input-action="updateOffgridDeviceField" data-arg-prop="value" data-index="${i}" data-field="nightHoursPerDay"/></td>
      <td class="ogd-cell ogd-cell--total ogd-total-cell" data-label="Wh/Gün">${_whLabel(dailyWh)}${_escHtml(perDayLabel)}</td>
      <td class="ogd-cell ogd-cell--critical ogd-cell-pad-center" data-label="${_escHtml(criticalLabel)}"><input type="checkbox" ${d.isCritical ? 'checked' : ''}
        aria-label="${_escHtml(criticalLabel)}"
        class="ogd-checkbox"
        data-change-action="updateOffgridDeviceField" data-arg-prop="checked" data-index="${i}" data-field="isCritical"/></td>
      <td class="ogd-cell ogd-cell--category ogd-cell-pad" data-label="${_escHtml(categoryLabel)}"><select aria-label="${_escHtml(categoryLabel)}"
        class="ogd-input ogd-input--cat"
        data-change-action="updateOffgridDeviceField" data-arg-prop="value" data-index="${i}" data-field="category">
        ${DEVICE_CATEGORIES.map(c => `<option value="${c}" ${(d.category||'generic')===c?'selected':''}>${_escHtml(catLabels[c]||c)}</option>`).join('')}
      </select></td>
      <td class="ogd-cell ogd-cell--remove ogd-cell-pad"><button data-click-action="removeOffgridDevice" data-arg="${i}" data-arg-type="number" aria-label="${_escHtml(removeLabel)}"
        class="ogd-remove-btn">✕</button></td>
    </tr>`;
  }).join('');

  if (totalEl) totalEl.textContent = _whLabel(totalDailyWh) + perDayLabel;
  if (critEl)  critEl.textContent  = critDailyWh > 0 ? _whLabel(critDailyWh) + perDayLabel + ` (${i18n.t('offgridL2.deviceCritical')})` : '—';

  _renderOffgridLiveSummary(devices.length, totalDailyWh, critDailyWh, critCount, estimatedNightWh);
  updateOffgridGeneratorPreview();
}
window.renderOffgridDeviceTable = renderOffgridDeviceTable;

function _renderOffgridLiveSummary(deviceCount, totalDailyWh, critDailyWh, critCount, nightWh) {
  const el = document.getElementById('offgrid-live-summary');
  const body = document.getElementById('offgrid-live-summary-body');
  if (!el || !body) return;

  if (deviceCount === 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';

  const stat = (label, val, color) =>
    `<span class="text-muted">${_escHtml(label)}: <strong class="dyn-color-strong" data-c="${color||'var(--text)'}">${_escHtml(val)}</strong></span>`;

  body.innerHTML = [
    stat(i18n.t('offgridL2.liveSummaryDevices'), String(deviceCount), '#8B5CF6'),
    stat(i18n.t('offgridL2.liveSummaryDaily'), _whLabel(totalDailyWh) + i18n.t('units.perDay'), 'var(--text)'),
    critDailyWh > 0 ? stat(i18n.t('offgridL2.liveSummaryCritical'), _whLabel(critDailyWh) + i18n.t('units.perDay'), '#EF4444') : '',
    critCount > 0   ? stat(i18n.t('offgridL2.liveSummaryCriticalDevices'), String(critCount), '#EF4444') : '',
    nightWh > 0     ? stat(i18n.t('offgridL2.liveSummaryNightLoad'), _whLabel(nightWh) + i18n.t('units.perDay'), '#8B5CF6') : '',
  ].filter(Boolean).join('');
  // F1.C.7: dynamic color setProperty
  if (typeof body.querySelectorAll === 'function') {
    body.querySelectorAll('[data-c]').forEach(node =>
      node.style.setProperty('--c', node.dataset.c));
  }
}
