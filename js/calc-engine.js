// ═══════════════════════════════════════════════════════════
// CALC ENGINE — Hesaplama motoru
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════
import {
  PANEL_TYPES, BATTERY_MODELS, PSH_FALLBACK, CITY_SUMMER_TEMPS,
  MONTH_WEIGHTS, INVERTER_TYPES, HEAT_PUMP_DATA, HOURLY_SOLAR_PROFILE,
  DEFAULT_TARIFFS
} from './data.js';
import {
  METHODOLOGY_VERSION, PVGIS_LOSS_PARAM, buildTariffModel,
  buildHourlySimulationOptions,
  calculateEVLoad, calculateHeatPumpLoad, calculateSystemLayout,
  combineHourlyLoads, detectCalculationWarnings,
  estimateSolarCapex, evaluateProjectEconomics,
  getMonthlyLoadKwh, buildBaseHourlyLoad8760, simulateBatteryOnHourlySummary,
  simulateHourlyEnergy, resolveAnnualOperatingCosts,
  resolveTaxTreatment, resolveProductionTemperatureAdjustment,
  sumMonthlyArrays, normalizeMonthlyProductionToAnnual
} from './calc-core.js';
import { buildQuoteReadiness } from './turkey-regulation.js';
import { buildProposalGovernance } from './proposal-governance.js';
import {
  buildEvidenceRegistry,
  buildOffgridFieldAcceptanceGate,
  buildOffgridFieldEvidenceGate,
  buildOffgridFieldImportGate,
  buildOffgridFieldOperationGate,
  buildOffgridFieldRevalidationGate,
  buildTariffSourceGovernance
} from './evidence-governance.js';
import { hasCompleteHourlyProfile8760, hasMeaningfulHourlyProfile8760, hasMeaningfulMonthlyConsumption } from './consumption-evidence.js';
import { buildPvEngineRequest } from './pv-engine-contracts.js';
import { sourceMetaForCurrentCalculation } from './solar-engine-adapter.js';
import { scenarioSourceQualityNote } from './scenario-workflows.js';
import {
  buildOffgridLoadProfile,
  buildOffgridPvDispatchProfile,
  buildOffgridFieldModelMaturityGate,
  evaluateOffgridFieldGuaranteeReadiness,
  runOffgridDispatch,
  runOffgridStressScenarios,
  runBadWeatherScenario,
  buildOffgridResults
} from './offgrid-dispatch.js';
import { fetchPVGISLive, PVGIS_FETCH_STATUS, getPvgisSourceLabel, CALC_TOTAL_TIMEOUT_MS } from './pvgis-fetch.js';
import { buildBackendUrl, BACKEND_CONFIG } from './backend-config.js';

const LOADING_MSGS = [
  "PVGIS'ten güneş ışınım verisi alınıyor...",
  "Hava durumu verileri işleniyor...",
  "Enerji üretimi hesaplanıyor...",
  "Finansal analiz yapılıyor..."
];

const CALC_SCENARIO_LABELS = {
  'on-grid': 'On-Grid',
  'off-grid': 'Off-Grid',
  'agricultural-irrigation': 'Sulama',
  'heat-pump': 'Isı Pompası',
  'ev-charging': 'EV Şarj',
  'mobile-offgrid': 'Mobil Sistem'
};

const CALC_SCENARIO_SUMMARIES = {
  'on-grid': 'Şebeke bağlantılı tasarım için üretim, öz tüketim ve geri ödeme dengesi birlikte çözülüyor.',
  'off-grid': 'Bağımsız sistem için üretim, kritik yük, batarya ve yedekleme davranışı birlikte değerlendiriliyor.',
  'agricultural-irrigation': 'Sulama senaryosunda mevsimsel yük, üretim penceresi ve saha uygunluğu birlikte analiz ediliyor.',
  'heat-pump': 'Isı pompası yükü mevsimsel tüketim profiliyle eşleştirilerek sistem boyutu netleştiriliyor.',
  'ev-charging': 'Araç şarj yükü ile çatı üretim profili eşleştirilip sistem kapasitesi dengeleniyor.',
  'mobile-offgrid': 'Mobil bağımsız sistem için kompakt üretim ve depolama mimarisi değerlendiriliyor.'
};

const CALC_FOCUS_BY_STEP = {
  'on-grid': [
    'Çatı ve ışınım verisi çekiliyor; saha potansiyeli doğrulanıyor.',
    'Saatlik üretim davranışı ve hava etkileri modele ekleniyor.',
    'Üretim, öz tüketim ve şebeke etkileşimi dengeleniyor.',
    'Tasarruf, nakit akışı ve geri ödeme hesapları tamamlanıyor.'
  ],
  'off-grid': [
    'Çatı ve ışınım verisi çekiliyor; bağımsız çalışma potansiyeli doğrulanıyor.',
    'Kritik yük ve saatlik davranış modeli kuruluyor.',
    'Üretim, batarya ve yedek güç dengesi simüle ediliyor.',
    'Toplam yatırım ve işletme maliyetleri tamamlanıyor.'
  ],
  default: [
    'Kaynak verileri toplanıyor ve model başlatılıyor.',
    'Saatlik iklim ve üretim davranışı işleniyor.',
    'Enerji performansı ve sistem dengesi hesaplanıyor.',
    'Ekonomik değerlendirme tamamlanıyor.'
  ]
};

const COMMON_YEAR_MONTH_DAYS_LOCAL = [31,28,31,30,31,30,31,31,30,31,30,31];

function completeHourlyArray(value) {
  return hasCompleteHourlyProfile8760(value)
    ? value.slice(0, 8760).map(v => Math.max(0, Number(v) || 0))
    : null;
}

function monthlyFromHourly8760(hourly) {
  const monthly = [];
  let cursor = 0;
  for (const days of COMMON_YEAR_MONTH_DAYS_LOCAL) {
    const hours = days * 24;
    monthly.push(hourly.slice(cursor, cursor + hours).reduce((sum, value) => sum + value, 0));
    cursor += hours;
  }
  return normalizeMonthlyProductionToAnnual(monthly, monthly.reduce((sum, value) => sum + value, 0));
}

function normalizeHourlyProductionToAnnual(hourly, annualTarget) {
  const complete = completeHourlyArray(hourly);
  if (!complete) return null;
  const total = complete.reduce((sum, value) => sum + value, 0);
  const target = Math.max(0, Number(annualTarget) || 0);
  if (total <= 0 || target <= 0) return null;
  const scale = target / total;
  return complete.map(value => value * scale);
}

// ── Merkezi loading state yönetimi ──────────────────────────────────────────
let _activeMsgInterval = null;
let _calcFinalized = false;

function finalizeCalculationUI({ success = false, targetStep = null, errorMsg = null } = {}) {
  _calcFinalized = true;
  if (_activeMsgInterval) { clearInterval(_activeMsgInterval); _activeMsgInterval = null; }
  const lp = document.getElementById('loading-particles');
  if (lp) lp.innerHTML = '';
  setLoadingProgress(success ? 100 : 0, success ? 3 : 0);
  if (window.state) window.state.isCalculating = false;
  if (targetStep !== null) window.goToStep(targetStep);
  if (errorMsg) window.showToast?.(errorMsg, 'error');
}

if (typeof window !== 'undefined') {
  window.finalizeCalculationUI = finalizeCalculationUI;
}

// FIX-2: Tilt factor lookup for PSH fallback path.
// Matches the TILT_COEFFS table in app.js and the backend simple_engine.py _tilt_factor().
// Optimum is 30–35° (coeff = 1.00); flat roof (0°) loses ~22%, vertical (90°) loses ~38%.
const _TILT_COEFFS = {0:0.78,10:0.90,15:0.94,20:0.97,25:0.99,30:1.00,33:1.00,35:1.00,40:0.99,45:0.97,50:0.94,60:0.87,75:0.75,90:0.62};
function _getTiltCoeff(deg) {
  const keys = Object.keys(_TILT_COEFFS).map(Number).sort((a, b) => a - b);
  let lo = keys[0], hi = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (deg >= keys[i] && deg <= keys[i + 1]) { lo = keys[i]; hi = keys[i + 1]; break; }
  }
  if (lo === hi) return _TILT_COEFFS[lo];
  const t = (deg - lo) / (hi - lo);
  return _TILT_COEFFS[lo] + t * (_TILT_COEFFS[hi] - _TILT_COEFFS[lo]);
}

function spawnLoadingParticles() {
  const container = document.getElementById('loading-particles');
  if (!container) return;
  container.innerHTML = '';
  const colors = ['#F59E0B', '#FCD34D', '#F97316', '#FB923C', '#FBBF24'];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('div');
    el.className = 'lp';
    const size = 4 + Math.random() * 7;
    el.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;bottom:0;background:${colors[Math.floor(Math.random()*colors.length)]};animation-duration:${3+Math.random()*4}s;animation-delay:${Math.random()*4}s;`;
    container.appendChild(el);
  }
}

function formatStageArea(value) {
  const n = Math.max(0, Number(value) || 0);
  return `${n.toFixed(n >= 100 ? 0 : 1)} m²`;
}

function formatStageEnergy(state) {
  const annual = Math.max(0, Number(state.annualConsumptionKwh) || Math.max(0, Number(state.dailyConsumption) || 0) * 365 || 0);
  if (state.scenarioKey === 'off-grid' || state.scenarioKey === 'mobile-offgrid') {
    return `${(annual / 365).toFixed(1)} kWh/gün`;
  }
  return `${Math.round(annual).toLocaleString('tr-TR')} kWh/yıl`;
}

function formatStageTarget(state) {
  if (state.designTarget === 'bill-offset') return 'Tüketime göre boyutlandırma';
  return 'Maksimum çatı kapasitesi';
}

export function refreshCalculationStageMeta(msgIdx = 0) {
  if (typeof document === 'undefined') return;
  const state = window.state || {};
  const scenarioKey = state.scenarioKey || 'on-grid';
  const layout = calculateSystemLayout(state);
  const scenarioLabel = CALC_SCENARIO_LABELS[scenarioKey] || 'Solar Senaryo';
  const focusMessages = CALC_FOCUS_BY_STEP[scenarioKey] || CALC_FOCUS_BY_STEP.default;
  const focusText = focusMessages[Math.max(0, Math.min(focusMessages.length - 1, msgIdx))];
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText('calc-stage-scenario', scenarioLabel);
  setText('calc-stage-roof', formatStageArea(state.roofArea));
  setText('calc-stage-power', `${(Number(layout.systemPower) || 0).toFixed(2)} kWp`);
  setText('calc-stage-summary', CALC_SCENARIO_SUMMARIES[scenarioKey] || CALC_SCENARIO_SUMMARIES['on-grid']);
  setText('calc-stage-focus', focusText);
  setText('calc-stage-source', scenarioKey === 'off-grid' ? 'PVGIS + dispatch modeli' : 'PVGIS + yerel model');
  setText('calc-stage-load', formatStageEnergy(state));
  setText('calc-stage-target', formatStageTarget(state));
  setText('calc-stage-footnote-text', `${scenarioLabel} senaryosu için sonuç ekranına otomatik geçiş yapılacak.`);
}

function setLoadingProgress(pct, msgIdx) {
  const arc = document.getElementById('ring-fill-arc');
  const txt = document.getElementById('ring-pct-text');
  const bar = document.getElementById('loading-progress-fill');
  if (arc) arc.style.strokeDashoffset = 326.7 - (326.7 * pct / 100);
  if (txt) txt.textContent = Math.round(pct) + '%';
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`lstep-${i}`);
    if (!el) continue;
    const threshold = i * 25;
    el.classList.remove('active','done');
    if (pct >= threshold) el.classList.add('done');
    else if (pct >= threshold - 25) el.classList.add('active');
  }
  const msgEl = document.getElementById('loading-msg');
  if (msgEl && LOADING_MSGS[msgIdx]) msgEl.textContent = LOADING_MSGS[msgIdx];
  refreshCalculationStageMeta(msgIdx);
}

function modelBatteryCost(battery) {
  const model = BATTERY_MODELS[battery?.model];
  const modelPrice = Number(model?.price_try);
  if (Number.isFinite(modelPrice) && modelPrice > 0) return Math.round(modelPrice);
  const capacity = Math.max(0, Number(battery?.capacity ?? model?.capacity) || 0);
  return Math.round(capacity * 8000);
}

function offgridBatteryChemistryDefaults(chemistry = '') {
  const key = String(chemistry || '').trim().toUpperCase();
  if (key === 'NMC') {
    return { reservePct: 15, eolCapacityPct: 75, eolEfficiencyLossPct: 5, replacementFractionPct: 85 };
  }
  if (key === 'AGM' || key === 'GEL' || key === 'LEAD_ACID' || key === 'LEAD-ACID') {
    return { reservePct: 20, eolCapacityPct: 70, eolEfficiencyLossPct: 8, replacementFractionPct: 95 };
  }
  return { reservePct: 10, eolCapacityPct: 80, eolEfficiencyLossPct: 3, replacementFractionPct: 80 };
}

function classifyOutputConfidence({ usedFallback, warnings = [], state }) {
  const blocking = [];
  if (usedFallback) blocking.push('PVGIS yerine PSH fallback kullanıldı.');
  if (!state?.roofGeometry) blocking.push('Çatı geometrisi saha keşfiyle doğrulanmadı.');
  if (state?.osmShadowEnabled && !state?.osmShadow?.buildings) blocking.push('OSM gölge analizi doğrulanmış bina verisi içermiyor.');
  if (warnings.length) blocking.push(...warnings.slice(0, 5));
  if (state?.quoteReadyApproved === true && state?.quoteInputsVerified === true && !usedFallback && blocking.length === 0) {
    return { level: 'quote-ready', label: 'quote-ready', blockers: [] };
  }
  if (!usedFallback && blocking.length <= 2) {
    return { level: 'engineering estimate', label: 'engineering estimate', blockers: blocking };
  }
  return { level: 'rough estimate', label: 'rough estimate', blockers: blocking };
}

// Monthly season index: 0=Dec-Feb (winter), 1=Mar-May (spring), 2=Jun-Aug (summer), 3=Sep-Nov (autumn)
const _MONTH_SEASON = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0];
const _SEASON_KEYS  = ['winter', 'spring', 'summer', 'autumn'];

// Derive daytime fraction from HOURLY_SOLAR_PROFILE for a given season.
// "Daytime" = hours where normalized solar output > 0.
function _dayRatioForSeason(season) {
  const profile = HOURLY_SOLAR_PROFILE[season] || HOURLY_SOLAR_PROFILE.spring;
  // Day hours are those with solar output; weight by output fraction (proxy for load during solar hours)
  const dayHours = profile.reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
  return Math.max(0.2, Math.min(0.8, dayHours / 24));
}

export function calculateBatteryMetrics(annualEnergy, dailyConsumption, battery) {
  // Monthly production distributed by MONTH_WEIGHTS
  const usableCapacity = battery.capacity * battery.dod;
  const SOC_MIN_RESERVE = usableCapacity * 0.10; // 10% emergency reserve
  const batteryCost = modelBatteryCost(battery);

  let totalSelfConsumed = 0;
  let totalNightConsumption = 0;
  let totalNightCovered = 0;
  let totalBatteryStored = 0;

  for (let m = 0; m < 12; m++) {
    const monthlyProduction = annualEnergy * MONTH_WEIGHTS[m];
    // Approximate days per month (use 30.44 average)
    const daysInMonth = [31,28,31,30,31,30,31,31,30,31,30,31][m];
    const dailyProd = monthlyProduction / daysInMonth;

    const season = _SEASON_KEYS[_MONTH_SEASON[m]];
    const dayRatio = _dayRatioForSeason(season);
    const dayConsumption   = dailyConsumption * dayRatio;
    const nightConsumption = dailyConsumption * (1 - dayRatio);

    // Direct self-consumption during solar hours
    const directSC = Math.min(dailyProd, dayConsumption);
    const excessToBattery = Math.max(0, dailyProd - dayConsumption);

    // Battery charges during day; minimum reserve preserved
    const chargeableCapacity = usableCapacity - SOC_MIN_RESERVE;
    const batteryStored = Math.min(excessToBattery * battery.efficiency, chargeableCapacity);
    const nightCovered  = Math.min(batteryStored, nightConsumption);

    totalSelfConsumed    += (directSC + nightCovered) * daysInMonth;
    totalNightConsumption += nightConsumption * daysInMonth;
    totalNightCovered    += nightCovered * daysInMonth;
    totalBatteryStored   += batteryStored * daysInMonth;
  }

  const annualConsumption = dailyConsumption * 365;
  const gridIndependence  = Math.min(totalSelfConsumed / annualConsumption, 1.0);
  const nightCoverage     = totalNightConsumption > 0
    ? Math.min(totalNightCovered / totalNightConsumption, 1.0)
    : 0;

  return {
    gridIndependence: (gridIndependence * 100).toFixed(1),
    nightCoverage:    (nightCoverage * 100).toFixed(1),
    usableCapacity:   usableCapacity.toFixed(1),
    batteryCost,
    dailyProduction:  (annualEnergy / 365).toFixed(1),
    batteryStored:    (totalBatteryStored / 365).toFixed(1), // avg daily stored
    modelName:        BATTERY_MODELS[battery.model]?.name || 'Batarya'
  };
}

// Faz-1 D2: scenario-keyed self-consumption ratios used ONLY when neither a
// battery-dispatch result nor an hourly simulation summary is available. The
// previous behaviour silently assumed 100 % self-consumption (Math.min(load,
// production)), which is physically impossible for a battery-less on-grid system
// and inflated savings by tariff arbitrage when import/export rates differ.
// Targets mirror backend/services/financial_service.py self_consumption_target
// so frontend and backend heuristic fallbacks tell the same story.
const HEURISTIC_SELF_CONSUMPTION_RATIO = {
  'off-grid': 0.90,
  'flexible-mobile': 0.88,
  'agricultural-irrigation': 0.72,
  'ev-charging': 0.68,
  'heat-pump': 0.62,
  'on-grid': 0.40
};

export function calculateNMMetrics(annualEnergy, systemPower, dailyConsumption, tariffModelOrRate, annualPriceIncrease, usdToTry, hourlySummary = null, batterySummary = null, scenarioKey = 'on-grid') {
  const tariffModel = typeof tariffModelOrRate === 'object' ? tariffModelOrRate : null;
  const tariff = tariffModel ? tariffModel.exportRate : tariffModelOrRate;
  const annualConsumption = hourlySummary?.annualLoad ?? dailyConsumption * 365;
  const heuristicSelfConsumptionRatio = HEURISTIC_SELF_CONSUMPTION_RATIO[scenarioKey] ?? 0.40;
  const heuristicSelfConsumed = Math.min(annualConsumption, annualEnergy * heuristicSelfConsumptionRatio);
  const directSelfConsumedEnergy = batterySummary?.totalSelfConsumption ?? hourlySummary?.selfConsumption ?? heuristicSelfConsumed;
  const importOffsetEnergy = batterySummary?.importOffsetEnergy ?? hourlySummary?.importOffsetEnergy ?? 0;
  const selfConsumedEnergy = directSelfConsumedEnergy;
  const compensatedConsumptionEnergy = directSelfConsumedEnergy + importOffsetEnergy;
  const selfConsumptionRatio = annualEnergy > 0 ? Math.min(directSelfConsumedEnergy / annualEnergy, 1.0) : 0;
  const compensatedConsumptionRatio = annualEnergy > 0 ? Math.min(compensatedConsumptionEnergy / annualEnergy, 1.0) : 0;
  const annualGridExport = Math.round(batterySummary?.remainingExport ?? hourlySummary?.gridExport ?? annualEnergy * (1 - selfConsumptionRatio));
  const paidGridExport = Math.round(batterySummary?.paidGridExport ?? hourlySummary?.paidGridExport ?? annualGridExport);
  const unpaidGridExport = Math.round(batterySummary?.unpaidGridExport ?? hourlySummary?.unpaidGridExport ?? Math.max(0, annualGridExport - paidGridExport));
  const compensableSurplus = Math.round(batterySummary?.compensableSurplus ?? hourlySummary?.compensableSurplus ?? paidGridExport + unpaidGridExport);

  const annualExportRevenue = Math.round(paidGridExport * Math.max(0, tariff));

  return {
    annualGridExport,
    paidGridExport,
    unpaidGridExport,
    importOffsetEnergy: Math.round(importOffsetEnergy),
    compensableSurplus,
    annualExportRevenue,
    selfConsumptionRatio,
    compensatedConsumptionRatio,
    annualConsumption: Math.round(annualConsumption),
    directSelfConsumedEnergy: Math.round(directSelfConsumedEnergy),
    selfConsumedEnergy: Math.round(selfConsumedEnergy),
    compensatedConsumptionEnergy: Math.round(compensatedConsumptionEnergy),
    selfConsumptionPct: (selfConsumptionRatio * 100).toFixed(1),
    compensatedConsumptionPct: (compensatedConsumptionRatio * 100).toFixed(1),
    isLicenseFree: true,
    systemType: (batterySummary?.exportPolicy || hourlySummary?.exportPolicy || tariffModel?.exportCompensationPolicy)?.interval === 'hourly'
      ? 'Lisanssız Üretim — Saatlik mahsuplaşma + yıllık tüketim ihracat sınırı'
      : (batterySummary?.exportPolicy || hourlySummary?.exportPolicy || tariffModel?.exportCompensationPolicy)?.interval === 'monthly-aggregate-no-hourly-settlement'
      ? 'Lisanssız Üretim — Saatlik profil yok; ödeme hesabı ihtiyatlı olarak aylık toplama düşürüldü'
      : 'Lisanssız Üretim — Aylık mahsuplaşma + tüketim ihracat sınırı',
    settlementMode: (batterySummary?.exportPolicy || hourlySummary?.exportPolicy || tariffModel?.exportCompensationPolicy)?.interval || (hourlySummary ? 'hourly-profile' : 'annual-fallback'),
    exportPolicy: batterySummary?.exportPolicy || hourlySummary?.exportPolicy || tariffModel?.exportCompensationPolicy || null
  };
}

function suppressGridExportRevenue(nmMetrics, reason = 'Off-grid senaryoda fazla PV finansal gelire dönüşmez.') {
  if (!nmMetrics) return nmMetrics;
  return {
    ...nmMetrics,
    paidGridExport: 0,
    unpaidGridExport: Math.round(nmMetrics.annualGridExport || 0),
    annualExportRevenue: 0,
    systemType: reason,
    settlementMode: 'off-grid-no-export-revenue',
    exportPolicy: {
      ...(nmMetrics.exportPolicy || {}),
      interval: 'off-grid-disabled',
      requestedInterval: 'off-grid-disabled',
      annualSellableExportCapKwh: 0,
      paidBatteryExportAllowed: false
    }
  };
}

export async function runCalculation() {
  const state = window.state;
  if (state.scenarioKey === 'off-grid') {
    state.netMeteringEnabled = false;
  }
  const fallbackBanner = document.getElementById('fallback-banner');
  if (fallbackBanner) fallbackBanner.style.display = 'none';
  spawnLoadingParticles();
  setLoadingProgress(10, 0);
  _calcFinalized = false;

  let msgIdx = 0;
  _activeMsgInterval = setInterval(() => {
    msgIdx = Math.min(msgIdx + 1, 3);
    setLoadingProgress(10 + msgIdx * 23, msgIdx);
  }, 1200);

  const _calcHardTimeout = setTimeout(() => {
    finalizeCalculationUI({ targetStep: 5, errorMsg: 'Hesaplama zaman aşımına uğradı. Lütfen tekrar deneyin.' });
  }, CALC_TOTAL_TIMEOUT_MS);

  try {

  const layout = calculateSystemLayout(state);
  const panel = layout.panel;
  const panelArea = layout.panelArea;
  const allSections = layout.sections;

  const totalPCCheck = layout.panelCount;
  if (totalPCCheck === 0) {
    finalizeCalculationUI({ targetStep: 3, errorMsg: 'Panel sayısı sıfır. Lütfen çatı alanını artırın (min ~5 m² gerekli).' });
    return;
  }

  let avgSummerTemp = CITY_SUMMER_TEMPS[state.cityName] || CITY_SUMMER_TEMPS['default'];
  const currentMonth = new Date().getMonth();
  const isSummerSeason = currentMonth >= 4 && currentMonth <= 8;
  if (isSummerSeason) {
    try {
      const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${state.lat}&longitude=${state.lon}&daily=temperature_2m_max&timezone=Europe%2FIstanbul&past_days=92`;
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 8000);
      const res2 = await fetch(meteoUrl, { signal: ctrl2.signal });
      clearTimeout(t2);
      if (res2.ok) {
        const d2 = await res2.json();
        if (d2.daily?.temperature_2m_max?.length) {
          const temps = d2.daily.temperature_2m_max.filter(t => t !== null);
          if (temps.length > 0) avgSummerTemp = temps.reduce((a,b)=>a+b,0)/temps.length;
        }
      }
    } catch(e) {
      window.showToast?.('Anlık hava verisi alınamadı, sabit ortalama kullanılıyor.', 'info');
    }
  }

  // İnverter tipi entegrasyonu
  const inverterData = INVERTER_TYPES[state.inverterType || 'string'];
  // Static efficiency kept for reference; weighted version computed per-section (Faz-3 Fix-11).
  const weightedInverterEfficiency = inverterData.efficiency < 1
    ? inverterData.efficiency * (0.18 * (0.94 / 0.97) + 0.52 * (0.965 / 0.97) + 0.30 * 1.0)
    : inverterData.efficiency;

  // Faz-3 Fix-10: Bifacial gain is shading-dependent and albedo-scaled.
  // Rear-side irradiance drops when the array is shaded (less ground reflection reaches rear).
  // Standard IEC TS 60904-1-2 bifacial gain assumes albedo ≈ 0.20 (sand/grass).
  // Adjustment: gain × (1 − effectiveShading/200) × (albedo/0.20).
  // effectiveShading is not yet computed here; we use a forward reference approach:
  // shading-based correction is applied in the section loop below (per-section).
  // Albedo scaling is pre-computed once here.
  const groundAlbedo = Math.max(0.05, Math.min(0.50, Number(state.groundAlbedo) || 0.20));
  const albedoScale  = groundAlbedo / 0.20;  // normalised to IEC reference albedo
  const bifacialBaseGain = ((state.panelType === 'bifacial' || state.panelType === 'bifacial_topcon') && panel.bifacialGain > 0)
    ? panel.bifacialGain * albedoScale
    : 0;
  const fallbackTempAdjustment = resolveProductionTemperatureAdjustment({
    source: 'fallback-psh',
    panelTempCoeff: panel.tempCoeff,
    avgSummerTemp
  });
  const pvgisTempAdjustment = resolveProductionTemperatureAdjustment({
    source: 'pvgis-live',
    panelTempCoeff: panel.tempCoeff,
    avgSummerTemp
  });
  const tempLoss = fallbackTempAdjustment.lossRate;

  const cableLossPct = state.cableLossEnabled
    ? Math.max(0, Math.min(50, Number(state.cableLoss?.totalLossPct ?? state.cableLossPct ?? state.cableLoss) || 0))
    : 0;
  const cableLossFactor = 1 - cableLossPct / 100;
  // Faz-3 Fix-12: OSM shadow seasonal weighting.
  // OSM-derived shadowFactorPct is computed without solar geometry (no sun elevation angle).
  // In winter the sun is low (~25°) → shadows are 3-4× longer than in summer (~60°).
  // We apply monthly multipliers and weight by production share (MONTH_WEIGHTS) to get
  // an annual-production-weighted shadow factor instead of a flat year-round estimate.
  // Seasonal multipliers: winter ×2.0, spring ×1.0, summer ×0.5, autumn ×1.2.
  const _OSM_SHADOW_SEASONAL_MULT = [2.0,2.0,1.0,1.0,1.0,0.5,0.5,0.5,1.2,1.2,1.2,2.0]; // Jan–Dec
  const baseOsmFactor = state.osmShadowEnabled
    ? Math.max(0, Number(state.osmShadow?.shadowFactorPct) || 0)
    : 0;
  const osmShadowFactor = baseOsmFactor > 0
    ? Math.min(35, MONTH_WEIGHTS.reduce((sum, w, m) => sum + w * baseOsmFactor * _OSM_SHADOW_SEASONAL_MULT[m], 0))
    : 0;
  const combineManualAndOsmShading = (manual, osm) => {
    const manualShade = Math.max(0, Number(manual) || 0);
    const osmShade = Math.max(0, Number(osm) || 0);
    if (manualShade > 0 && osmShade > 0) {
      return Math.min(80, Math.max(manualShade, osmShade));
    }
    return Math.min(80, manualShade + osmShade);
  };

  const sectionResults = await Promise.all(allSections.map(async sec => {
    try {
    const secPC = Math.max(0, Number(sec.panelCount) || 0);
    const secPower = Number(sec.systemPower) || secPC * panel.wattPeak / 1000;
    if (secPower <= 0) return null;

    let rawEnergy = null, rawMonthly = null, rawPoa = null, rawHourly = null, usedFallback = false;
    let pvgisFetchStatus = PVGIS_FETCH_STATUS.FALLBACK_USED;
    let pvgisUserMessage = null;

    {
      const pvgisAzimut = sec.azimuth - 180;
      const backendProxyUrl = buildBackendUrl(BACKEND_CONFIG.pvgisProxyPath);
      const fetchResult = await fetchPVGISLive(
        { lat: state.lat, lon: state.lon, peakpower: secPower, loss: PVGIS_LOSS_PARAM, angle: sec.tilt, aspect: pvgisAzimut },
        {
          retries: 3,
          lang: (typeof window !== 'undefined' && window._currentLang) || 'tr',
          backendProxyUrl,
          proxyFirst: true,
          includeHourly: state.scenarioKey === 'on-grid' || state.scenarioKey === 'off-grid'
        }
      );
      pvgisFetchStatus = fetchResult.fetchStatus;
      pvgisUserMessage = fetchResult.userMessage;
      if (fetchResult.rawEnergy) {
        rawEnergy  = fetchResult.rawEnergy;
        rawPoa     = fetchResult.rawPoa;
        rawMonthly = fetchResult.rawMonthly;
        rawHourly  = completeHourlyArray(fetchResult.rawHourly);
      }
    }

    if (!rawEnergy) {
      usedFallback = true;
      const psh = PSH_FALLBACK[state.cityName] || PSH_FALLBACK['default'];
      // Faz-2 D4: pre-loss PR cleaned up to remove double-counting against the
      // explicit loss stack below. The previous 0.80 value bundled module
      // mismatch, wiring tolerance, dust, and a generic engineering margin —
      // but the explicit stack ALSO subtracts cable loss, soiling, and inverter
      // efficiency, producing ~3-5% double-counting and an unrealistically low
      // final PR (~0.70-0.74). 0.92 keeps only the residuals the explicit stack
      // does not model: module mismatch (~1%), nameplate tolerance (~2%), and a
      // small uncertainty margin (~5%) for the data-poor fallback path. After
      // the explicit shading/soiling/inverter/cable losses, final effective PR
      // ≈ 0.82-0.85 — IEA PVPS typical range for Turkish climates. PVGIS-live
      // path is unaffected.
      rawEnergy = secPower * psh * 365 * 0.92;
      rawPoa = psh * 365;
    }

    // Kayıp sıralaması (doğru fiziksel sıra):
    // 1. Sıcaklık: fallback yolunda yıllıklaştırılmış sıcaklık derate'i kullanılır;
    //    PVGIS yolunda sıcaklık PVGIS tarafından modellendiği için ek düzeltme uygulanmaz.
    // 2. Azimut/eğim (fallback için; PVGIS kendi geometri modelini kullanıyor)
    // 3. Gölgelenme (yer-spesifik, PVGIS bilmiyor)
    // 4. Kirlenme (yer-spesifik)
    // 5. Bifaciyal kazanım (arka yüzeyden ek enerji)
    // 6. İnverter verimi (AC dönüşümü)
    // 7. Kablo kaybı (iletim)
    const effectiveShadingFactor = combineManualAndOsmShading(sec.shadingFactor, osmShadowFactor);
    // Faz-3 Fix-10: Bifacial gain reduced by shading (rear-side sees less ground reflection
    // when shading blocks diffuse component). Factor: (1 − shadingFactor/200) approximates
    // the partial loss of rear-irradiance at high shading levels.
    const bifacialBonus = bifacialBaseGain > 0
      ? (1 + bifacialBaseGain * (1 - effectiveShadingFactor / 200))
      : 1;
    // Faz-3 Fix-11: Weighted annual inverter efficiency based on CEC 3-point curve.
    // Early-morning / late-evening hours run at low load → lower efficiency.
    // Weights from HOURLY_SOLAR_PROFILE summer profile distribution:
    //   ~18% of energy at <30% load (eff≈94%), ~52% at 30-70% (eff≈96.5%), ~30% at >70% (eff≈97%).
    const adjustedE = rawEnergy
      * (usedFallback ? fallbackTempAdjustment.factor : pvgisTempAdjustment.factor)
      * (usedFallback ? sec.azimuthCoeff : 1.0)
      * (usedFallback ? _getTiltCoeff(sec.tilt) : 1.0)   // FIX-2: tilt factor was missing from fallback path
      * (1 - effectiveShadingFactor / 100)
      * (1 - state.soilingFactor / 100)
      * bifacialBonus
      * weightedInverterEfficiency  // Faz-3 Fix-11: part-load weighted (replaces static efficiency)
      * cableLossFactor;

    let monthly;
    if (!rawMonthly) {
      monthly = MONTH_WEIGHTS.map(w => Math.round(adjustedE * w));
    } else {
      const monthlySum = rawMonthly.reduce((a,b)=>a+b,0);
      const factor = monthlySum > 0 ? adjustedE / monthlySum : 0;
      monthly = monthlySum > 0 ? rawMonthly.map(v => Math.round(v * factor)) : MONTH_WEIGHTS.map(w => Math.round(adjustedE * w));
    }

    return {
      panelCount: secPC, systemPower: secPower,
      annualEnergy: adjustedE, monthlyData: monthly,
      hourlyProduction8760: rawHourly ? normalizeHourlyProductionToAnnual(rawHourly, adjustedE) : null,
      pvgisRawEnergy: rawEnergy, pvgisPoa: rawPoa, usedFallback,
      pvgisFetchStatus, pvgisUserMessage,
      shadingLoss:    rawEnergy * (effectiveShadingFactor / 100),
      effectiveShadingFactor,
      osmShadowFactor,
      tempLossEnergy: usedFallback ? rawEnergy * Math.abs(Math.min(tempLoss, 0)) : 0,
      temperatureAdjustment: usedFallback ? fallbackTempAdjustment : pvgisTempAdjustment,
      azimuthLossEnergy: usedFallback ? rawEnergy * (1 - sec.azimuthCoeff) : 0,
      bifacialGainEnergy: rawEnergy * (bifacialBonus - 1),
      soilingLoss: rawEnergy * (state.soilingFactor / 100),
      cableLoss: rawEnergy * cableLossPct / 100,
      sectionArea: sec.area, sectionTilt: sec.tilt, sectionAzimuthName: sec.azimuthName
    };
    } catch (secErr) {
      console.error('[calc-engine] Section calculation failed:', secErr);
      return null;
    }
  }));

  const validSections = sectionResults.filter(r => r !== null);
  if (validSections.length === 0) {
    finalizeCalculationUI({ targetStep: 5, errorMsg: 'Hesaplama başarısız. Lütfen panel ve çatı ayarlarını kontrol edin.' });
    return;
  }

  let panelCount    = validSections.reduce((s, r) => s + r.panelCount, 0);
  let systemPower   = validSections.reduce((s, r) => s + r.systemPower, 0);
  let adjustedEnergy= validSections.reduce((s, r) => s + r.annualEnergy, 0);
  let monthlyData   = validSections.reduce((agg, r) => agg.map((v,i) => v + r.monthlyData[i]), new Array(12).fill(0));
  let usedFallback  = validSections.some(r => r.usedFallback);
  // Aggregate PVGIS fetch status: if any section got live data, report live; else fallback
  const aggregateFetchStatus = validSections.every(r => r.pvgisFetchStatus === PVGIS_FETCH_STATUS.LIVE_SUCCESS)
    ? PVGIS_FETCH_STATUS.LIVE_SUCCESS
    : validSections.some(r => r.pvgisFetchStatus === PVGIS_FETCH_STATUS.PROXY_SUCCESS)
      ? PVGIS_FETCH_STATUS.PROXY_SUCCESS
      : PVGIS_FETCH_STATUS.FALLBACK_USED;
  let pvgisRawEnergy= validSections.reduce((s, r) => s + r.pvgisRawEnergy, 0);
  const pvgisPoaWeighted = validSections.reduce((s, r) => s + (Number(r.pvgisPoa) || 0) * r.systemPower, 0);
  let pvgisPoa = systemPower > 0 ? pvgisPoaWeighted / systemPower : 0;
  const pvgisHourlySections = validSections.map(r => r.hourlyProduction8760).filter(h => Array.isArray(h) && h.length === 8760);
  let pvgisHourlyProduction8760 = pvgisHourlySections.length === validSections.length
    ? new Array(8760).fill(0).map((_, hour) => pvgisHourlySections.reduce((sum, hourly) => sum + (Number(hourly[hour]) || 0), 0))
    : null;
  let shadingLoss   = validSections.reduce((s, r) => s + r.shadingLoss, 0);
  let tempLossEnergy= validSections.reduce((s, r) => s + r.tempLossEnergy, 0);
  let azimuthLossEnergy   = validSections.reduce((s, r) => s + r.azimuthLossEnergy, 0);
  let bifacialGainEnergy  = validSections.reduce((s, r) => s + r.bifacialGainEnergy, 0);
  let soilingLoss         = validSections.reduce((s, r) => s + r.soilingLoss, 0);
  let totalCableLoss      = validSections.reduce((s, r) => s + (r.cableLoss || 0), 0);
  let effectiveShadingFactor = systemPower > 0
    ? validSections.reduce((s, r) => s + (Number(r.effectiveShadingFactor) || 0) * r.systemPower, 0) / systemPower
    : Number(state.shadingFactor) || 0;
  const currentLang = (typeof window !== 'undefined' && window._currentLang) || 'tr';
  const localProductionSnapshot = {
    annualEnergy: Math.round(adjustedEnergy),
    monthlyData: normalizeMonthlyProductionToAnnual(monthlyData, adjustedEnergy),
    systemPower,
    panelCount,
    usedFallback,
    pvgisRawEnergy,
    pvgisPoa,
    pvgisFetchStatus: aggregateFetchStatus,
    pvgisSourceLabel: getPvgisSourceLabel(aggregateFetchStatus, currentLang),
    source: usedFallback ? 'local-fallback' : 'browser-pvgis'
  };
  const authoritativeOverride = state.authoritativeEngineOverride;
  // Faz-1 D1: Backend pvlib must NOT override real PVGIS production while it still
  // synthesises irradiance from a clear-sky model. Only authorise the backend when
  // it reports a real meteorology source (TMY, hourly PVGIS, ERA5, measured TMY).
  // The `weatherSource` label is set by `engine_source()` / pvlib_engine.py.
  const REAL_BACKEND_WEATHER_SOURCES = new Set([
    'pvgis-tmy', 'pvgis-hourly', 'pvgis-live',
    'era5-hourly', 'measured-tmy', 'real-meteorology'
  ]);
  const backendWeatherSource =
    authoritativeOverride?.engineSource?.weatherSource
    || authoritativeOverride?.production?.weatherSource
    || authoritativeOverride?.production?.assumption_flags?.weatherSource
    || authoritativeOverride?.losses?.weatherSource
    || null;
  const backendUsesRealWeather = backendWeatherSource && REAL_BACKEND_WEATHER_SOURCES.has(backendWeatherSource);
  const authoritativeBackend = (
    authoritativeOverride?.engineSource?.pvlibBacked
    && !authoritativeOverride?.fallbackUsed
    && !authoritativeOverride?.engineSource?.fallbackUsed
    && backendUsesRealWeather
  ) ? authoritativeOverride : null;
  if (authoritativeOverride?.engineSource?.pvlibBacked && !authoritativeBackend && backendWeatherSource && !backendUsesRealWeather) {
    console.warn('[calc-engine] Backend pvlib result not authoritative: weatherSource=' + backendWeatherSource + ' is synthetic. Browser PVGIS retained as authority.');
  }
  let ongridHourlyProduction8760 = null;
  let ongridProductionProfileSource = 'monthly-derived-synthetic-pv';
  if (authoritativeBackend) {
    const bp = authoritativeBackend.production || {};
    const bl = authoritativeBackend.losses || {};
    adjustedEnergy = Math.round(Number(bp.annualEnergyKwh || bp.annual_kwh || adjustedEnergy));
    const backendMonthly = Array.isArray(bp.monthlyEnergyKwh) ? bp.monthlyEnergyKwh : bp.monthly_kwh;
    if (Array.isArray(backendMonthly) && backendMonthly.length === 12) monthlyData = backendMonthly.map(v => Math.round(Number(v) || 0));
    monthlyData = normalizeMonthlyProductionToAnnual(monthlyData, adjustedEnergy);
    systemPower = Number(bp.systemPowerKwp || systemPower);
    panelCount = Number(bp.panelCount || panelCount);
    usedFallback = false;
    pvgisRawEnergy = Math.round(Number(bl.dcAnnualKwh || bl.acAnnualKwh || bp.annualEnergyKwh || adjustedEnergy));
    pvgisPoa = Number(bl.poaAnnualKwhM2 || pvgisPoa || state.ghi || 0);
    shadingLoss = Math.round(pvgisRawEnergy * ((Number(bl.shadingPct ?? state.shadingFactor) || 0) / 100));
    soilingLoss = Math.round(pvgisRawEnergy * ((Number(bl.soilingPct ?? state.soilingFactor) || 0) / 100));
    tempLossEnergy = Math.max(0, Math.round((Number(bl.dcAnnualKwh || adjustedEnergy) || adjustedEnergy) - adjustedEnergy));
    azimuthLossEnergy = 0;
    // Faz-1 D3: prefer backend-computed bifacial gain over a hard-coded 5% fallback.
    // pvlib_engine.py emits losses.bifacialGainKwh from `bifacial_factor` resolved
    // through the shared request contract.
    const backendBifacialKwh = Number(bl.bifacialGainKwh);
    bifacialGainEnergy = Number.isFinite(backendBifacialKwh) && backendBifacialKwh >= 0
      ? Math.round(backendBifacialKwh)
      : ((state.panelType === 'bifacial' || state.panelType === 'bifacial_topcon')
          ? Math.max(0, Math.round(adjustedEnergy * 0.05))
          : 0);
    const backendCableLossPct = Math.max(0, Number(bl.wiringLossPct ?? bl.wiringMismatchPct ?? cableLossPct) || 0);
    totalCableLoss = Math.max(0, Math.round(pvgisRawEnergy * backendCableLossPct / 100));
    effectiveShadingFactor = Number(bl.shadingPct ?? state.shadingFactor ?? effectiveShadingFactor);
    const backendHourly = completeHourlyArray(bp.hourlyEnergyKwh || bp.hourly_kwh || bp.hourlyProduction8760);
    if (backendHourly) {
      ongridHourlyProduction8760 = normalizeHourlyProductionToAnnual(backendHourly, adjustedEnergy);
      ongridProductionProfileSource = 'backend-pvlib-hourly';
    }
    const banner = document.getElementById('fallback-banner');
    if (banner) banner.style.display = 'none';
  }
  monthlyData = normalizeMonthlyProductionToAnnual(monthlyData, adjustedEnergy);
  const userOffgridPvHourly = state.scenarioKey === 'off-grid'
    ? (completeHourlyArray(state.offgridPvHourly8760) || completeHourlyArray(state.hourlyProduction8760))
    : null;
  const derivedOffgridPvHourly = state.scenarioKey === 'off-grid' && pvgisHourlyProduction8760
    ? normalizeHourlyProductionToAnnual(pvgisHourlyProduction8760, adjustedEnergy)
    : null;
  const offgridRealPvHourly = state.scenarioKey === 'off-grid'
    ? (userOffgridPvHourly || derivedOffgridPvHourly)
    : null;
  const offgridRealPvSource = offgridRealPvHourly
    ? (userOffgridPvHourly
        ? (state.offgridPvHourlySource || state.hourlyProductionSource || 'user-supplied-real-hourly-pv')
        : 'pvgis-seriescalc-hourly')
    : null;
  const offgridRealPvSourceLabel = offgridRealPvHourly
    ? (userOffgridPvHourly
        ? (state.offgridPvHourlySourceLabel || state.hourlyProductionSourceLabel || 'Real hourly PV 8760')
        : 'PVGIS seriescalc hourly 8760')
    : null;
  if (offgridRealPvHourly) {
    adjustedEnergy = offgridRealPvHourly.reduce((sum, value) => sum + value, 0);
    monthlyData = monthlyFromHourly8760(offgridRealPvHourly);
    usedFallback = false;
    pvgisRawEnergy = Math.round(adjustedEnergy);
  }
  if (state.scenarioKey === 'on-grid' && !ongridHourlyProduction8760 && pvgisHourlyProduction8760) {
    ongridHourlyProduction8760 = normalizeHourlyProductionToAnnual(pvgisHourlyProduction8760, adjustedEnergy);
    if (ongridHourlyProduction8760) ongridProductionProfileSource = 'pvgis-seriescalc-hourly';
  }
  const userOngridPvHourly = state.scenarioKey === 'on-grid'
    ? (completeHourlyArray(state.onGridPvHourly8760) || completeHourlyArray(state.hourlyProduction8760))
    : null;
  if (state.scenarioKey === 'on-grid' && !ongridHourlyProduction8760 && userOngridPvHourly) {
    ongridHourlyProduction8760 = normalizeHourlyProductionToAnnual(userOngridPvHourly, adjustedEnergy);
    if (ongridHourlyProduction8760) ongridProductionProfileSource = 'user-hourly-pv-normalized-to-authoritative-annual';
  }

  // PVGIS JRC 1σ uncertainty ≈ ±7.6% (interannual variability + model uncertainty).
  // PSH fallback uncertainty is significantly larger (±18%) because it relies on
  // city-level irradiance averages without site-specific weather data.
  //   P90 = P50 × (1 − 1.28 × σ)  → energy exceeded 90% of years
  //   P10 = P50 × (1 + 1.28 × σ)  → energy exceeded only 10% of years
  const _PVGIS_SIGMA = 0.076;
  const _FALLBACK_SIGMA = 0.18;
  const _activeSigma = usedFallback ? _FALLBACK_SIGMA : _PVGIS_SIGMA;
  const energyP90 = Math.round(adjustedEnergy * (1 - 1.28 * _activeSigma));
  const energyP10 = Math.round(adjustedEnergy * (1 + 1.28 * _activeSigma));

  const authoritativeSourceMeta = offgridRealPvHourly
    ? {
        provider: 'user-supplied-hourly-pv',
        source: offgridRealPvSource,
        engine: 'real-hourly-pv-8760',
        engineQuality: 'field-data-candidate',
        pvlibBacked: false
      }
    : (authoritativeBackend?.engineSource || sourceMetaForCurrentCalculation({ usedFallback }));
  const authoritativeProduction = {
    annualEnergyKwh: Math.round(adjustedEnergy),
    monthlyEnergyKwh: monthlyData.slice(),
    systemPowerKwp: Number(systemPower.toFixed(3)),
    panelCount,
    source: authoritativeSourceMeta.source,
    engine: authoritativeSourceMeta.engine,
    engineQuality: authoritativeSourceMeta.engineQuality,
    pvlibBacked: !!authoritativeSourceMeta.pvlibBacked
  };
  const engineParity = {
    authoritativeSource: authoritativeSourceMeta.source,
    comparisonSource: localProductionSnapshot.source,
    localAnnualEnergyKwh: localProductionSnapshot.annualEnergy,
    authoritativeAnnualEnergyKwh: authoritativeProduction.annualEnergyKwh,
    deltaKwh: authoritativeProduction.annualEnergyKwh - localProductionSnapshot.annualEnergy,
    deltaPct: localProductionSnapshot.annualEnergy > 0
      ? Number((((authoritativeProduction.annualEnergyKwh - localProductionSnapshot.annualEnergy) / localProductionSnapshot.annualEnergy) * 100).toFixed(2))
      : 0,
    intentionalDifference: !!authoritativeBackend,
    notes: authoritativeBackend
      ? [
          'Backend pvlib is authoritative for this run.',
          'Backend production is the authoritative energy basis; financials, proposal governance, reports, and exports are still calculated by the frontend 8760 financial model.',
          'Backend financial payload, if present, is estimate-only and not used as the commercial quote source.',
          'Browser PVGIS/JS production is retained only as a comparison snapshot.'
        ]
      : [
          'Browser PVGIS/JS is authoritative for this run.',
          'Backend output was unavailable, non-authoritative, or fallback-only and is not mixed into downstream financials.'
      ]
  };
  const authoritativeTempAdjustment = usedFallback
    ? fallbackTempAdjustment
    : resolveProductionTemperatureAdjustment({
        source: authoritativeBackend ? 'pvlib-backed' : 'pvgis-live',
        panelTempCoeff: panel.tempCoeff,
        avgSummerTemp
      });

  finalizeCalculationUI({ success: true });
  if (usedFallback) {
    const banner = document.getElementById('fallback-banner');
    if (banner) {
      // Prioritize user-friendly message from pvgis-fetch module over raw error
      const lastSection = validSections.find(r => r.pvgisFetchStatus === PVGIS_FETCH_STATUS.FALLBACK_USED);
      const friendlyMsg = lastSection?.pvgisUserMessage || 'Canlı güneş verisi alınamadı — yerel tahmini model kullanıldı.';
      banner.textContent = friendlyMsg;
      banner.style.display = 'block';
    }
  }

  // ── 2026 Maliyet Kırılımı ───────────────────────────────────────────────────
  // İnverter tipi maliyeti
  const invTypeKey = state.inverterType || 'string';
  const invType = INVERTER_TYPES[invTypeKey];
  const costBreakdownBase = estimateSolarCapex({
    systemPowerKwp: systemPower,
    panel,
    inverterTypeKey: invTypeKey,
    panelKdvRate: 0,
    nonPanelKdvRate: 0.20
  });
  const invUnit = costBreakdownBase.invUnit;
  const invUnitEffective = invUnit;
  const panelCost = costBreakdownBase.panelCost;
  const inverterCost = costBreakdownBase.inverterCost;
  const mountingCost = costBreakdownBase.mountingCost;
  const dcCableCost = costBreakdownBase.dcCableCost;
  const acElecCost = costBreakdownBase.acElecCost;
  const laborCost = costBreakdownBase.laborCost;
  const permitCost = costBreakdownBase.permitCost;
  const subtotal = costBreakdownBase.subtotal;
  const nonPanelSubtotal = costBreakdownBase.nonPanelSubtotal;
  const kdv = costBreakdownBase.solarKdv;
  const kdvRate = costBreakdownBase.kdvRate;
  let solarCost = costBreakdownBase.solarCost;

  let tariffModel = buildTariffModel(state);
  let tariff = tariffModel.importRate || DEFAULT_TARIFFS.residential;

  // ── EV / Isı pompası ek yükleri ana tüketim profiline bağlanır ──────────────
  let evMetrics = null;
  const evLoad = state.evEnabled && state.ev ? calculateEVLoad(state.ev) : { annualKwh: 0, dailyKwh: 0 };

  let heatPumpMetrics = null;
  const heatPumpLoad = state.heatPumpEnabled && state.heatPump
    ? calculateHeatPumpLoad(state.heatPump, HEAT_PUMP_DATA)
    : { annualKwh: 0, heatDemand: 0, cop: 0 };

  const extraMonthlyLoad = sumMonthlyArrays(evLoad.monthlyKwh, heatPumpLoad.monthlyKwh);
  let monthlyLoad = getMonthlyLoadKwh(state, extraMonthlyLoad);
  let baseMonthlyLoad = getMonthlyLoadKwh(state, 0);

  // Faz-4 Fix-16: Agricultural irrigation — override monthly load with seasonal pump model.
  // When pump kW and hours/day are provided, compute actual kWh per active month instead of
  // extrapolating daily consumption × 365. This prevents 3× system oversizing.
  if (state.scenarioKey === 'agricultural-irrigation' && state.irrigPumpKw > 0 && state.irrigHoursPerDay > 0) {
    const _IRRIG_MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
    const startM = Math.max(1, Math.min(12, state.irrigSeasonStart || 4));
    const endM   = Math.max(1, Math.min(12, state.irrigSeasonEnd   || 9));
    const irrigMonthlyLoad = new Array(12).fill(0);
    for (let m = 1; m <= 12; m++) {
      const inSeason = endM >= startM ? (m >= startM && m <= endM) : (m >= startM || m <= endM);
      if (inSeason) {
        irrigMonthlyLoad[m - 1] = state.irrigPumpKw * state.irrigHoursPerDay * _IRRIG_MONTH_DAYS[m - 1];
      }
    }
    monthlyLoad = irrigMonthlyLoad;
    baseMonthlyLoad = irrigMonthlyLoad;
  }
  const baseHourlyLoad = hasCompleteHourlyProfile8760(state.hourlyConsumption8760)
    ? state.hourlyConsumption8760.slice(0, 8760).map(v => Math.max(0, Number(v) || 0))
    : buildBaseHourlyLoad8760(baseMonthlyLoad, state.tariffType, state.usageProfile || state.onGridUsageProfile);
  const hourlyLoad8760 = combineHourlyLoads(baseHourlyLoad, evLoad.hourly8760, heatPumpLoad.hourly8760);

  tariffModel = buildTariffModel({
    ...state,
    annualConsumptionKwh: monthlyLoad.reduce((a, b) => a + b, 0),
    annualProductionKwh: adjustedEnergy
  });
  tariff = tariffModel.importRate || tariffModel.pstRate || DEFAULT_TARIFFS.residential;
  const annualPriceIncrease = tariffModel.annualPriceIncrease;
  const discountRate = tariffModel.discountRate;
  const effectiveSavingsTariff = (state.scenarioKey === 'off-grid')
    ? (Number(state.offGridCostPerKwh) > 0 ? Number(state.offGridCostPerKwh) : tariff * 2.5)
    : (tariffModel.effectiveImportRate ?? tariff);
  const financialTariffModel = state.scenarioKey === 'off-grid'
    ? {
        ...tariffModel,
        importRate: effectiveSavingsTariff,
        distributionFee: 0,
        exportRate: 0,
        financialBasis: Number(state.offGridCostPerKwh) > 0
          ? 'off-grid-user-alternative-energy-cost'
          : 'off-grid-grid-tariff-times-2_5-proxy'
      }
    : tariffModel;

  if (state.evEnabled && state.ev) {
    evMetrics = calculateEVMetrics(adjustedEnergy, state.dailyConsumption, state.ev, tariff);
  }
  if (state.heatPumpEnabled && state.heatPump) {
    heatPumpMetrics = calculateHeatPumpMetrics(state.heatPump, tariff, heatPumpLoad);
  }

  const hourlySummaryRaw = simulateHourlyEnergy(monthlyData, monthlyLoad, buildHourlySimulationOptions({
    state,
    tariffModel,
    hourlyLoad8760,
    hourlyProduction8760: state.scenarioKey === 'off-grid' ? offgridRealPvHourly : ongridHourlyProduction8760
  }));

  let bessMetrics = null;
  let batterySummary = null;
  let batteryCostVal = 0;
  let offgridL2Results = null;

  if (state.scenarioKey === 'off-grid') {
    // ── Off-Grid Level 2 Dispatch ─────────────────────────────────────────────
    const offgridPvProfile = buildOffgridPvDispatchProfile({
      realHourlyPv8760: offgridRealPvHourly,
      source: offgridRealPvSource,
      sourceLabel: offgridRealPvHourly ? offgridRealPvSourceLabel : null,
      fallbackHourlyRows: hourlySummaryRaw.hourly8760,
      cityName: state.cityName,
      panelTempCoeffPerC: panel.tempCoeff,
      fallbackSource: 'monthly-production-derived-synthetic-8760',
      fallbackSourceLabel: authoritativeBackend ? authoritativeSourceMeta.source : getPvgisSourceLabel(aggregateFetchStatus, currentLang),
      fallbackUsed: usedFallback || !!authoritativeSourceMeta.fallbackUsed
    });
    const pvHourly = offgridPvProfile.pvHourly8760;

    const offgridBatteryEnabled = !!state.batteryEnabled;
    const batt = state.battery || {};
    const chemistryDefaults = offgridBatteryChemistryDefaults(batt.chemistry);
    const battCap = offgridBatteryEnabled ? Math.max(0, Number(batt.capacity) || 0) : 0;
    const battDod = Math.max(0, Math.min(1, Number(batt.dod) || 0.9));
    const battEff = Math.max(0.5, Math.min(1, Number(batt.efficiency) || 0.92));
    const usableCapKwh = battCap * battDod;
    const batteryReservePct = offgridBatteryEnabled
      ? Math.max(0, Math.min(50, Number(state.offgridBatteryReservePct ?? batt.socReservePct ?? chemistryDefaults.reservePct) || chemistryDefaults.reservePct))
      : 0;
    const batteryChargeEfficiencyPct = Number(state.offgridBatteryChargeEfficiencyPct ?? batt.chargeEfficiencyPct ?? batt.chargeEfficiency);
    const batteryDischargeEfficiencyPct = Number(state.offgridBatteryDischargeEfficiencyPct ?? batt.dischargeEfficiencyPct ?? batt.dischargeEfficiency);
    const batteryChargeEfficiency = Number.isFinite(batteryChargeEfficiencyPct)
      ? Math.max(0.5, Math.min(1, batteryChargeEfficiencyPct > 1 ? batteryChargeEfficiencyPct / 100 : batteryChargeEfficiencyPct))
      : null;
    const batteryDischargeEfficiency = Number.isFinite(batteryDischargeEfficiencyPct)
      ? Math.max(0.5, Math.min(1, batteryDischargeEfficiencyPct > 1 ? batteryDischargeEfficiencyPct / 100 : batteryDischargeEfficiencyPct))
      : null;
    const batteryEolCapacityPct = Math.max(50, Math.min(100, Number(state.offgridBatteryEolCapacityPct ?? batt.eolCapacityPct ?? chemistryDefaults.eolCapacityPct) || chemistryDefaults.eolCapacityPct));
    const batteryEolEfficiencyLossPct = Math.max(0, Math.min(30, Number(state.offgridBatteryEolEfficiencyLossPct ?? batt.eolEfficiencyLossPct ?? chemistryDefaults.eolEfficiencyLossPct) || chemistryDefaults.eolEfficiencyLossPct));
    const batteryReplacementFractionPct = Math.max(0, Math.min(150, Number(state.offgridBatteryReplacementFractionPct ?? batt.replacementFractionPct ?? chemistryDefaults.replacementFractionPct) || chemistryDefaults.replacementFractionPct));
    const defaultBatteryPowerKw = usableCapKwh > 0 ? Math.max(0.5, usableCapKwh * 0.5) : 0;
    const batteryMaxChargeKw = usableCapKwh > 0
      ? Math.max(0.1, Number(batt.maxChargePowerKw ?? batt.maxChargeKw ?? state.offgridBatteryMaxChargeKw ?? defaultBatteryPowerKw) || defaultBatteryPowerKw)
      : 0;
    const batteryMaxDischargeKw = usableCapKwh > 0
      ? Math.max(0.1, Number(batt.maxDischargePowerKw ?? batt.maxDischargeKw ?? state.offgridBatteryMaxDischargeKw ?? defaultBatteryPowerKw) || defaultBatteryPowerKw)
      : 0;
    const inverterAcLimitKw = Math.max(
      0.5,
      Number(state.offgridInverterAcKw ?? state.inverterAcKw)
        || Math.max(systemPower || 0, batteryMaxDischargeKw, 1)
    );
    const inverterSurgeMultiplier = Math.max(1, Math.min(3, Number(state.offgridInverterSurgeMultiplier) || 1.25));

    const batteryConfig = {
      usableCapacityKwh: usableCapKwh,
      efficiency: battEff,
      chargeEfficiency: batteryChargeEfficiency,
      dischargeEfficiency: batteryDischargeEfficiency,
      socReserveKwh: usableCapKwh * (batteryReservePct / 100),
      initialSocKwh: usableCapKwh * (batteryReservePct / 100),
      maxChargePowerKw: batteryMaxChargeKw,
      maxDischargePowerKw: batteryMaxDischargeKw,
      chemistry: batt.chemistry || null,
      eolCapacityPct: batteryEolCapacityPct,
      eolEfficiencyLossPct: batteryEolEfficiencyLossPct
    };

    const generatorConfig = {
      enabled: !!(state.offgridGeneratorEnabled),
      capacityKw: Math.max(0, Number(state.offgridGeneratorKw) || 0),
      fuelCostPerKwh: Math.max(0, Number(state.offgridGeneratorFuelCostPerKwh) || 0),
      minLoadRatePct: Math.max(0, Math.min(100, Number(state.offgridGeneratorMinLoadRatePct) || 30)),
      chargeBatteryEnabled: !!state.offgridGeneratorChargeBatteryEnabled
    };

    // Yük profili oluştur. Basit mod profil/günlük kWh kullanır; ileri modda gerçek 8760 yük cihaz listesinin önüne geçer.
    const useAdvancedOffgridInputs = state.offgridCalculationMode === 'advanced';
    const hasRealHourlyLoad = useAdvancedOffgridInputs
      && hasMeaningfulHourlyProfile8760(state.hourlyConsumption8760, { minAnnualKwh: 12, minPositiveHours: 24 });
    const realCriticalHourly = completeHourlyArray(state.offgridCriticalLoad8760)
      || completeHourlyArray(state.criticalLoad8760);
    const offgridLoadProfile = buildOffgridLoadProfile(
      useAdvancedOffgridInputs && Array.isArray(state.offgridDevices) ? state.offgridDevices : [],
      {
        hourlyLoad8760: hasRealHourlyLoad ? hourlyLoad8760 : null,
        hourlyLoadSource: hasRealHourlyLoad ? (state.hourlyProfileSource || 'hourly-uploaded') : null,
        criticalHourly8760: useAdvancedOffgridInputs ? realCriticalHourly : null,
        fallbackDailyKwh: hourlySummaryRaw.annualLoad / 365,
        criticalFraction: Math.max(0.1, Math.min(1, Number(state.offgridCriticalFraction) || 0.45)),
        tariffType: state.tariffType,
        fieldImportSummary: state.offgridFieldImports || null
      }
    );
    const dispatchOptions = {
      loadPeakKw8760: offgridLoadProfile.hourlyPeakKw8760,
      criticalPeakKw8760: offgridLoadProfile.criticalPeakKw8760,
      inverterAcLimitKw,
      inverterSurgeMultiplier,
      autonomyThresholdPct: Math.max(0, Math.min(25, Number(state.offgridAutonomyThresholdPct) || 1)),
      generatorStartSocPct: Math.max(0, Number(state.offgridGeneratorStartSocPct) || 0),
      generatorStopSocPct: Math.max(0, Number(state.offgridGeneratorStopSocPct) || 0),
      generatorMaxHoursPerDay: Number.isFinite(Number(state.offgridGeneratorMaxHoursPerDay))
        ? Math.max(0, Number(state.offgridGeneratorMaxHoursPerDay) || 0)
        : null,
      generatorMinLoadRatePct: Math.max(0, Math.min(100, Number(state.offgridGeneratorMinLoadRatePct) || 30)),
      generatorChargeBatteryEnabled: !!state.offgridGeneratorChargeBatteryEnabled,
      generatorStrategy: state.offgridGeneratorStrategy || 'critical-backup'
    };

    // R1: 2-geçişli SOC başlangıcı — ısınma geçişi Ocak artefaktını giderir
    const warmupDispatch = runOffgridDispatch(
      pvHourly,
      offgridLoadProfile.totalHourly8760,
      offgridLoadProfile.criticalHourly8760,
      batteryConfig,
      generatorConfig,
      dispatchOptions
    );
    const steadyStateSoc = warmupDispatch.hourly8760.at?.(-1)?.soc ?? batteryConfig.socReserveKwh;
    const batteryConfigSteady = { ...batteryConfig, initialSocKwh: Math.max(batteryConfig.socReserveKwh, Math.min(usableCapKwh, steadyStateSoc)) };

    // Normal dispatch (yetkili)
    const normalDispatch = runOffgridDispatch(
      pvHourly,
      offgridLoadProfile.totalHourly8760,
      offgridLoadProfile.criticalHourly8760,
      batteryConfigSteady,
      generatorConfig,
      dispatchOptions
    );

    // Jeneratörsüz karşılaştırma dispatch (jeneratör etkinse)
    const noGenConfig = { ...generatorConfig, enabled: false };
    const withoutGeneratorDispatch = generatorConfig.enabled
      ? runOffgridDispatch(
          pvHourly,
          offgridLoadProfile.totalHourly8760,
          offgridLoadProfile.criticalHourly8760,
          batteryConfigSteady,
          noGenConfig,
          dispatchOptions
        )
      : null;

    // Kötü hava senaryosu (kullanıcı seçtiyse)
    const weatherLevel = state.offgridBadWeatherLevel || '';
    const badWeatherDispatch = weatherLevel
      ? runBadWeatherScenario(
          normalDispatch,
          pvHourly,
          offgridLoadProfile.totalHourly8760,
          offgridLoadProfile.criticalHourly8760,
          batteryConfigSteady,
          generatorConfig,
          weatherLevel,
          dispatchOptions
        )
      : null;

    const batteryModel = BATTERY_MODELS[batt.model];
    const battLifetimeYears = offgridBatteryEnabled ? (Number(batt.warranty || batteryModel?.warranty) || 10) : 0;
    const battCapexForLifecycle = offgridBatteryEnabled ? modelBatteryCost(batt) : 0;

    // L2 sonuç nesnesi oluştur
    offgridL2Results = buildOffgridResults(
      normalDispatch,
      badWeatherDispatch,
      offgridLoadProfile,
      generatorConfig,
      {
        alternativeEnergyCostPerKwh: effectiveSavingsTariff,
        systemCapexTry: solarCost + battCapexForLifecycle,
        generatorCapexTry: Math.max(0, Number(state.offgridGeneratorCapexTry) || 0),
        generatorMaintenanceCostTry: Math.max(0, Number(state.offgridGeneratorMaintenanceCostTry) || 0),
        generatorStrategy: state.offgridGeneratorStrategy || 'critical-backup',
        generatorFuelType: state.offgridGeneratorFuelType || 'diesel',
        generatorSizePreset: state.offgridGeneratorSizePreset || 'auto',
        generatorReservePct: Math.max(0, Number(state.offgridGeneratorReservePct) || 0),
        generatorStartSocPct: Math.max(0, Number(state.offgridGeneratorStartSocPct) || 0),
        generatorStopSocPct: Math.max(0, Number(state.offgridGeneratorStopSocPct) || 0),
        generatorMaxHoursPerDay: Math.max(0, Number(state.offgridGeneratorMaxHoursPerDay) || 0),
        generatorMinLoadRatePct: Math.max(0, Math.min(100, Number(state.offgridGeneratorMinLoadRatePct) || 30)),
        generatorChargeBatteryEnabled: !!state.offgridGeneratorChargeBatteryEnabled,
        generatorOverhaulHours: Math.max(0, Number(state.offgridGeneratorOverhaulHours) || 0),
        generatorOverhaulCostTry: Math.max(0, Number(state.offgridGeneratorOverhaulCostTry) || 0),
        batteryCapexTry: battCapexForLifecycle,
        batteryLifetimeYears: battLifetimeYears,
        batteryReplacementFractionPct: batteryReplacementFractionPct,
        weatherScenario: weatherLevel,
        productionProfile: offgridPvProfile,
        batteryConfig: batteryConfig,
        dispatchOptions,
        calculationMode: state.offgridCalculationMode || 'basic',
        fieldImportSummary: state.offgridFieldImports || null
      },
      withoutGeneratorDispatch,
      offgridPvProfile
    );
    // Üretim kaynağı şeffaflığını off-grid sonucuna ekle
    offgridL2Results.productionSource = authoritativeSourceMeta.source || aggregateFetchStatus;
    offgridL2Results.productionSourceLabel = offgridPvProfile.productionSourceLabel
      || (authoritativeBackend ? authoritativeSourceMeta.source : getPvgisSourceLabel(aggregateFetchStatus, currentLang));
    offgridL2Results.productionFallback = offgridPvProfile.productionFallback;
    offgridL2Results.productionDispatchProfile = offgridPvProfile.productionDispatchProfile;
    offgridL2Results.productionDispatchMetadata = {
      productionSeriesSource: offgridPvProfile.productionSeriesSource,
      annualKwh: Math.round(offgridPvProfile.annualKwh),
      hasRealHourlyProduction: offgridPvProfile.hasRealHourlyProduction,
      dispatchBus: offgridPvProfile.dispatchBus,
      resolution: offgridPvProfile.resolution,
      missingHours: offgridPvProfile.missingHours,
      synthetic: offgridPvProfile.synthetic,
      syntheticWeatherModel: offgridPvProfile.syntheticWeatherModel || null,
      syntheticWeatherMetadata: offgridPvProfile.syntheticWeatherMetadata || null
    };
    offgridL2Results.loadSource = offgridLoadProfile.loadSource || offgridLoadProfile.mode;
    offgridL2Results.loadMode = offgridLoadProfile.mode;
    offgridL2Results.fieldImportSummary = state.offgridFieldImports || {
      highResolutionLoad: null,
      criticalHighResolutionLoad: null,
      inverterEventLog: null
    };
    offgridL2Results.synthetic = !!(offgridL2Results.synthetic || offgridPvProfile.synthetic);
    offgridL2Results.methodologyNote = offgridPvProfile.hasRealHourlyProduction && offgridLoadProfile.hasRealHourlyLoad
      ? 'real-pv-and-real-load-hourly-dispatch-pre-feasibility'
      : offgridL2Results.methodologyNote;
    offgridL2Results.parityAvailable = engineParity?.intentionalDifference === true;
    offgridL2Results.fieldGuaranteeReadiness = evaluateOffgridFieldGuaranteeReadiness({
      productionProfile: offgridPvProfile,
      loadProfile: offgridLoadProfile,
      battery: batteryConfig,
      generator: generatorConfig,
      dispatchOptions
    });
    offgridL2Results.fieldStressAnalysis = runOffgridStressScenarios({
      pvHourly8760: pvHourly,
      loadHourly8760: offgridLoadProfile.totalHourly8760,
      criticalHourly8760: offgridLoadProfile.criticalHourly8760,
      battery: batteryConfigSteady,
      generator: generatorConfig,
      dispatchOptions
    });
    offgridL2Results.fieldGuaranteeCandidate = offgridL2Results.fieldGuaranteeReadiness.phase1Ready;
    offgridL2Results.fieldGuaranteeReady = false;

    // batterySummary köprüsü — mevcut finansal tablo + BESS renderer'ı çalışmaya devam etsin
    batterySummary = {
      usableCapacity: usableCapKwh,
      batteryDischarge: normalDispatch.batteryToLoadKwh,
      chargedFromPv: normalDispatch.chargedFromPvKwh,
      remainingExport: normalDispatch.curtailedPvKwh,
      remainingImport: normalDispatch.unmetLoadKwh,
      totalSelfConsumption: normalDispatch.directPvToLoadKwh + normalDispatch.batteryToLoadKwh,
      selfConsumptionRatio: normalDispatch.totalPvGeneratedKwh > 0
        ? Math.min(1, (normalDispatch.directPvToLoadKwh + normalDispatch.batteryToLoadKwh) / normalDispatch.totalPvGeneratedKwh)
        : 0,
      gridIndependence: normalDispatch.solarBatteryLoadCoverage,
      paidGridExport: 0,
      unpaidGridExport: normalDispatch.curtailedPvKwh,
      batteryExportPaid: 0,
      cyclesPerYear: normalDispatch.cyclesPerYear,
      unmetLoadKwh: normalDispatch.unmetLoadKwh,
      autonomousDays: normalDispatch.autonomousDays,
      autonomousDaysPct: normalDispatch.autonomousDaysPct,
      socReserveKwh: batteryConfig.socReserveKwh,
      monthly: [],
      exportPolicy: { interval: 'off-grid-disabled' },
      hourly8760: normalDispatch.hourly8760
    };

    bessMetrics = calculateBatteryMetrics(adjustedEnergy, hourlySummaryRaw.annualLoad / 365, {
      ...batt,
      capacity: battCap,
      dod: battCap > 0 ? battDod : 0,
      efficiency: battEff
    });
    bessMetrics.gridIndependence = (normalDispatch.solarBatteryLoadCoverage * 100).toFixed(1);
    bessMetrics.totalLoadCoverageWithGenerator = (normalDispatch.totalLoadCoverage * 100).toFixed(1);
    bessMetrics.pvBatteryCriticalCoverage = (normalDispatch.solarBatteryCriticalCoverage * 100).toFixed(1);
    bessMetrics.criticalLoadCoverage = (normalDispatch.solarBatteryCriticalCoverage * 100).toFixed(1);
    bessMetrics.criticalCoverageWithGenerator = (normalDispatch.criticalLoadCoverage * 100).toFixed(1);
    bessMetrics.criticalLoadCoverageWithGenerator = (normalDispatch.criticalLoadCoverage * 100).toFixed(1);
    // H1: Gerçek gece kapsama hesabı — gece saatlerindeki yükün batarya ile karşılanma oranı
    (function () {
      const NIGHT_H = new Set([18,19,20,21,22,23,0,1,2,3,4,5]);
      let nightLoad = 0, nightBatt = 0;
      (normalDispatch.hourly8760 || []).forEach((row, i) => {
        if (NIGHT_H.has(i % 24)) {
          nightLoad += row.loadKwh     || 0;
          nightBatt += row.batteryDischarge || 0;
        }
      });
      bessMetrics.nightCoverage = nightLoad > 0
        ? (Math.min(1, nightBatt / nightLoad) * 100).toFixed(1)
        : bessMetrics.gridIndependence;
    })();
    bessMetrics.batteryStored = normalDispatch.batteryToLoadKwh.toFixed(1);
    bessMetrics.cyclesPerYear = normalDispatch.cyclesPerYear.toFixed(0);
    bessMetrics.autonomousDaysPct = normalDispatch.autonomousDaysPct;
    bessMetrics.autonomousDays = normalDispatch.autonomousDays;
    bessMetrics.unmetLoadKwh = Math.round(normalDispatch.unmetLoadKwh);
    bessMetrics.minimumSoc = normalDispatch.minimumSocPct;
    bessMetrics.averageSoc = normalDispatch.averageSocPct;
    bessMetrics.batteryMaxChargeKw = batteryMaxChargeKw;
    bessMetrics.batteryMaxDischargeKw = batteryMaxDischargeKw;
    bessMetrics.inverterAcLimitKw = inverterAcLimitKw;
    batteryCostVal = offgridBatteryEnabled ? bessMetrics.batteryCost : 0;

  } else if (state.batteryEnabled) {
    // ── On-grid / Hibrit Batarya — DEĞİŞMEDİ ─────────────────────────────────
    // Faz-4 Fix-14: Off-grid systems use 10% SOC reserve so the BMS always has
    // an emergency buffer; on-grid systems leave the full capacity available.
    batterySummary = simulateBatteryOnHourlySummary(hourlySummaryRaw, state.battery, {
      paidBatteryExportAllowed: false,
      exportPolicy: tariffModel.exportCompensationPolicy,
      socReservePct: 0
    });
    bessMetrics = calculateBatteryMetrics(adjustedEnergy, hourlySummaryRaw.annualLoad / 365, state.battery);
    if (batterySummary) {
      bessMetrics.gridIndependence = (batterySummary.gridIndependence * 100).toFixed(1);
      bessMetrics.nightCoverage = (Math.min(1, batterySummary.batteryDischarge / Math.max(hourlySummaryRaw.gridImport, 1)) * 100).toFixed(1);
      bessMetrics.batteryStored = batterySummary.batteryDischarge.toFixed(1);
      bessMetrics.cyclesPerYear = batterySummary.cyclesPerYear.toFixed(0);
      bessMetrics.autonomousDaysPct = batterySummary.autonomousDaysPct;
      bessMetrics.autonomousDays = batterySummary.autonomousDays;
      bessMetrics.unmetLoadKwh = batterySummary.unmetLoadKwh;
    }
    batteryCostVal = bessMetrics.batteryCost;
  }
  const generatorCapexVal = state.scenarioKey === 'off-grid' && state.offgridGeneratorEnabled
    ? Math.max(0, Number(state.offgridGeneratorCapexTry) || 0)
    : 0;
  const grossTotalCost = solarCost + batteryCostVal + generatorCapexVal;
  const taxTreatment = resolveTaxTreatment({
    grossTotalCost,
    solarKdv: kdv,
    taxEnabled: state.taxEnabled,
    tax: state.tax
  });
  const totalCost = grossTotalCost;
  const financialCostBasis = taxTreatment.financialCostBasis;
  const solarFinancialCostBasis = Math.max(0, solarCost - (taxTreatment.recoverableKdv || 0));

  let nmMetrics = calculateNMMetrics(
    adjustedEnergy, systemPower, hourlySummaryRaw.annualLoad / 365,
    tariffModel, annualPriceIncrease, state.usdToTry, hourlySummaryRaw, batterySummary,
    state.scenarioKey
  );
  if (state.scenarioKey === 'off-grid') {
    nmMetrics = suppressGridExportRevenue(nmMetrics);
  } else if (!state.netMeteringEnabled) {
    nmMetrics = { ...nmMetrics, annualExportRevenue: 0, systemType: 'Şebeke satışı kapalı — fazla üretim geliri 0 TL' };
  }

  const selfConsumptionRatio = nmMetrics.selfConsumptionRatio;
  const exportRate = state.netMeteringEnabled
    ? tariffModel.exportRate
    : 0;

  const offgridServedEnergyPreDegradation = state.scenarioKey === 'off-grid'
    ? (batterySummary?.totalSelfConsumption ?? nmMetrics.selfConsumedEnergy)
    : null;
  const compensatedValueEnergy = state.scenarioKey === 'off-grid'
    ? offgridServedEnergyPreDegradation
    : state.netMeteringEnabled
      ? (nmMetrics.compensatedConsumptionEnergy ?? nmMetrics.selfConsumedEnergy)
      : nmMetrics.selfConsumedEnergy;
  const grossAnnualSavingsPreDegradation = compensatedValueEnergy * effectiveSavingsTariff
    + (state.netMeteringEnabled ? nmMetrics.paidGridExport * exportRate : 0);
  const annualSavings = grossAnnualSavingsPreDegradation;
  const co2Savings = adjustedEnergy * 0.442 / 1000;
  const trees = Math.round(co2Savings * 1000 / 21);

  const operatingCosts = resolveAnnualOperatingCosts({
    costBasis: solarFinancialCostBasis,
    omEnabled: state.omEnabled,
    omRate: state.omRate,
    insuranceRate: state.insuranceRate
  });
  const annualOMCost = operatingCosts.annualOMCost;
  const annualInsurance = operatingCosts.annualInsurance;
  const inverterLifetime = invType.lifetime || 12;
  const inverterReplaceCost = state.omEnabled ? Math.round(inverterCost * 1.1) : 0;
  const batteryModel = BATTERY_MODELS[state.battery?.model];
  const batteryLifetime = state.batteryEnabled ? (Number(state.battery?.warranty || batteryModel?.warranty) || 10) : 0;
  const batteryReplaceCost = state.batteryEnabled ? Math.round(batteryCostVal * 0.85) : 0;

  const lidFactor = panel.firstYearDeg || 0;
  const annualGeneratorCost = offgridL2Results ? (offgridL2Results.generatorFuelCostAnnual || 0) : 0;
  const annualGeneratorKwh  = offgridL2Results ? (offgridL2Results.generatorKwh || 0) : 0;
  const generatorFuelCostPerKwh = state.offgridGeneratorEnabled
    ? Math.max(0, Number(state.offgridGeneratorFuelCostPerKwh) || 0) : 0;
  const economicSummary = evaluateProjectEconomics({
    annualEnergy: adjustedEnergy,
    hourlySummary: hourlySummaryRaw,
    batterySummary,
    totalCost: financialCostBasis,
    tariffModel: financialTariffModel,
    panel,
    annualOMCost,
    annualInsurance,
    inverterLifetime,
    inverterReplaceCost,
    netMeteringEnabled: state.netMeteringEnabled,
    exportRateOverride: exportRate,
    batteryLifetime,
    batteryReplaceCost,
    annualLoadGrowth: Number(state.annualLoadGrowth) || 0,
    annualGeneratorCost,
    // Off-grid jeneratör, PV+BESS tasarrufu değil yedek enerji maliyetidir.
    // Yakıt gideri expenses içinde kalır; jeneratör kWh ayrıca tasarruf olarak kredilendirilmez.
    annualGeneratorKwh,
    generatorAlternativeCostPerKwh: 0,
    generatorFuelCostPerKwh,
    scenarioKey: state.scenarioKey
  });
  const yearlyTable = economicSummary.yearlyTable;
  const displayAnnualSavings = yearlyTable[0]?.savings || annualSavings;
  const firstYearGrossSavings = yearlyTable[0]?.savings ?? Math.round(annualSavings);
  const firstYearNetCashFlow = yearlyTable[0]?.netCashFlow ?? Math.round(annualSavings - annualOMCost - annualInsurance);
  const paybackYear = economicSummary.paybackYear;
  const discountedPaybackYear = economicSummary.discountedPaybackYear;
  const grossSimplePaybackYear = economicSummary.grossSimplePaybackYear || 0;
  const netSimplePaybackYear = economicSummary.netSimplePaybackYear || 0;
  const totalExpenses25y = economicSummary.totalExpenses25y;
  const npvTotal = economicSummary.projectNPV;
  const roi = economicSummary.roi;
  const irr = economicSummary.irr;
  const lcoe = economicSummary.lcoe;
  const compensatedLcoe = economicSummary.compensatedLcoe;

  const ysp  = systemPower > 0 ? (adjustedEnergy / systemPower).toFixed(0) : 0;
  const cf   = systemPower > 0 ? ((adjustedEnergy / (systemPower * 8760)) * 100).toFixed(1) : 0;
  const psh  = systemPower > 0 ? adjustedEnergy / (systemPower * 365) : 0;
  // PR = E_AC / (G_POA × P_STC). pvgisPoa öncelikli; yoksa pvgisRawEnergy (kayıpsız PVGIS çıkışı)
  // kullan. state.ghi (yatay GHI) POA'dan farklı olduğu için son çare olarak kullanılır.
  const pr = (systemPower > 0 && pvgisPoa > 0)
    ? (adjustedEnergy / (systemPower * pvgisPoa))
    : pvgisRawEnergy > 0
      ? (adjustedEnergy / pvgisRawEnergy)
      : (systemPower > 0 && state.ghi > 0 ? adjustedEnergy / (systemPower * state.ghi) : 0);

  // ── Yapısal Kontrol ──────────────────────────────────────────────────────────
  let structuralCheck = null;
  if (window.calculateStructural) {
    structuralCheck = window.calculateStructural(state.cityName, state.tilt, systemPower, panelArea * panelCount);
  }

  // ── Vergi Avantajı ───────────────────────────────────────────────────────────
  let taxMetrics = null;
  if (state.taxEnabled && state.tax) {
    taxMetrics = calculateTaxBenefits(totalCost, npvTotal, state.tax, discountRate, kdv, taxTreatment);
  }
  const billAnalysis = state.billAnalysisEnabled && hasMeaningfulMonthlyConsumption(state.monthlyConsumption)
    ? calculateBillAnalysis(state.monthlyConsumption, monthlyData, tariffModel.importRate + (tariffModel.distributionFee ?? 0))
    : null;

  const results = {
    panelCount, systemPower, annualEnergy: Math.round(adjustedEnergy),
    annualSavings: Math.round(displayAnnualSavings), totalCost: Math.round(totalCost),
    grossAnnualSavingsPreDegradation: Math.round(grossAnnualSavingsPreDegradation),
    grossAnnualSavingsEnergyKwh: Math.round(compensatedValueEnergy || 0),
    firstYearGrossSavings: Math.round(firstYearGrossSavings),
    firstYearNetCashFlow: Math.round(firstYearNetCashFlow),
    paybackYear, simplePaybackYear: economicSummary.simplePaybackYear,
    cumulativeNetPaybackYear: economicSummary.cumulativeNetPaybackYear,
    grossSimplePaybackYear: grossSimplePaybackYear ? Number(grossSimplePaybackYear.toFixed(2)) : 0,
    netSimplePaybackYear: netSimplePaybackYear ? Number(netSimplePaybackYear.toFixed(2)) : 0,
    discountedPaybackYear,
    npvTotal: Math.round(npvTotal), discountedCashFlow: Math.round(economicSummary.discountedCashFlow), roi: roi.toFixed(1),
    co2Savings: co2Savings.toFixed(2), trees, monthlyData,
    tempLoss: (tempLoss * 100).toFixed(2), pr: (pr * 100).toFixed(1),
    temperatureAdjustment: authoritativeTempAdjustment,
    psh: psh.toFixed(2), avgSummerTemp: avgSummerTemp.toFixed(1),
    usedFallback,
    pvgisFetchStatus: aggregateFetchStatus,
    pvgisSourceLabel: getPvgisSourceLabel(aggregateFetchStatus, currentLang),
    pvgisRawEnergy: Math.round(pvgisRawEnergy), pvgisPoa: Math.round(pvgisPoa),
    energyP90, energyP10,
    shadingLoss: Math.round(shadingLoss),
    effectiveShadingFactor: Number(effectiveShadingFactor.toFixed(1)),
    tempLossEnergy: Math.round(tempLossEnergy),
    azimuthLossEnergy: Math.round(azimuthLossEnergy),
    bifacialGainEnergy: Math.round(bifacialGainEnergy),
    soilingLoss: Math.round(soilingLoss),
    cableLoss: Math.round(totalCableLoss),
    cableLossPct,
    osmShadowFactor,
    ysp, cf, irr, lcoe, compensatedLcoe,
    tariff, annualPriceIncrease, discountRate, tariffModel,
    financialSavingsRate: effectiveSavingsTariff,
    financialSavingsBasis: financialTariffModel.financialBasis || 'grid-import-tariff',
    financialTariffModel,
    settlementProvisional: !!tariffModel.exportCompensationPolicy?.provisional,
    settlementAssumptionBasis: tariffModel.exportCompensationPolicy?.assumptionBasis || null,
    compensationSummary: {
      directSelfConsumptionKwh: nmMetrics.directSelfConsumedEnergy,
      importOffsetKwh: nmMetrics.importOffsetEnergy,
      compensatedConsumptionKwh: nmMetrics.compensatedConsumptionEnergy,
      paidExportKwh: nmMetrics.paidGridExport,
      unpaidSurplusKwh: nmMetrics.unpaidGridExport,
      compensableSurplusKwh: nmMetrics.compensableSurplus,
      annualPhysicalExportKwh: nmMetrics.annualGridExport,
      settlementInterval: tariffModel.exportCompensationPolicy?.interval || null,
      annualExportCapKwh: tariffModel.exportCompensationPolicy?.annualSellableExportCapKwh ?? null,
      annualProductionKwh: Math.round(adjustedEnergy),
      productionToConsumptionLimitKwh: tariffModel.exportCompensationPolicy?.productionToConsumptionLimitKwh ?? null,
      productionLimitExceeded: !!tariffModel.exportCompensationPolicy?.productionLimitExceeded,
      provisional: !!tariffModel.exportCompensationPolicy?.provisional
    },
    yearlyTable,
    annualOMCost, annualInsurance, inverterReplaceCost, inverterLifetime, batteryReplaceCost, batteryLifetime, totalExpenses25y,
    omCostBasis: Math.round(operatingCosts.costBasis),
    lidFactor: (lidFactor * 100).toFixed(1),
    inverterType: invTypeKey,
    inverterEfficiency: (weightedInverterEfficiency * 100).toFixed(1),
    costBreakdown: {
      panel: Math.round(panelCost), inverter: Math.round(inverterCost),
      mounting: Math.round(mountingCost), dcCable: Math.round(dcCableCost),
      acElec: Math.round(acElecCost), labor: Math.round(laborCost),
      permits: Math.round(permitCost), subtotal: Math.round(subtotal),
      kdv: Math.round(kdv), kdvRate, total: Math.round(solarCost), invUnit: invUnitEffective,
      battery: batteryCostVal,
      generator: generatorCapexVal,
      generatorCapex: generatorCapexVal,
      totalWithBattery: Math.round(solarCost + batteryCostVal),
      totalWithBatteryAndGenerator: Math.round(totalCost)
    },
    generatorCapex: Math.round(generatorCapexVal),
    financialCostBasis: Math.round(financialCostBasis),
    taxTreatment,
    methodologyVersion: METHODOLOGY_VERSION,
    pvgisLossParam: PVGIS_LOSS_PARAM,
    displayCurrency: state.displayCurrency || 'TRY',
    usdToTry: state.usdToTry || 38.5,
    netMeteringEnabled: !!state.netMeteringEnabled,
    calculationMode: authoritativeBackend ? 'python-pvlib-backed' : usedFallback ? 'fallback-psh' : 'pvgis-live',
    engineSource: authoritativeSourceMeta,
    engineRequest: buildPvEngineRequest(state),
    sourceQualityNote: authoritativeBackend
      ? scenarioSourceQualityNote(state.scenarioKey, 'python-backend')
      : scenarioSourceQualityNote(state.scenarioKey, usedFallback ? 'fallback-psh' : 'pvgis-live'),
    pvgisFailReason: usedFallback && !authoritativeBackend ? (window._pvgisLastError || 'unknown') : null,
    authoritativeEngineSource: authoritativeSourceMeta,
    authoritativeEngineResponse: authoritativeBackend || null,
    authoritativeFinancialBasis: 'frontend-8760-financial-model',
    backendFinancialEstimateWarning: authoritativeBackend?.financial?.warning || authoritativeBackend?.proposal?.warning || null,
    authoritativeEngineMode: authoritativeBackend ? 'python-pvlib-backed' : usedFallback ? 'local-fallback' : 'browser-pvgis',
    authoritativeEngineFallbackReason: authoritativeBackend ? null : state.authoritativeEngineFallbackReason || (usedFallback ? (window._pvgisLastError || 'PVGIS unavailable; local fallback used.') : null),
    authoritativeProduction,
    engineParity,
    localProductionSnapshot,
    backendEngineSource: authoritativeBackend ? null : undefined,
    backendEngineResponse: authoritativeBackend ? null : undefined,
    backendCalculationMode: authoritativeBackend ? null : undefined,
    hourlySummary: hourlySummaryRaw,
    productionProfileSource: state.scenarioKey === 'off-grid'
      ? (offgridRealPvHourly ? offgridRealPvSource : 'monthly-derived-synthetic-pv')
      : ongridProductionProfileSource,
    batterySummary,
    monthlyLoad,
    evLoad,
    heatPumpLoad,
    bessMetrics, nmMetrics,
    offgridL2Results,
    evMetrics, heatPumpMetrics, structuralCheck, taxMetrics, billAnalysis,
    sectionResults: validSections.length > 1 ? validSections : null,
    hourlyProfileSource: state.hourlyProfileSource || (Array.isArray(state.hourlyConsumption8760) && state.hourlyConsumption8760.length >= 8760 ? 'hourly-uploaded' : 'synthetic'),
    tariffInputMode: tariffModel.tariffInputMode || state.tariffInputMode || 'net-plus-fee',
    tariffSourceType: tariffModel.tariffSourceType || state.tariffSourceType || 'manual',
    costSourceType: state.costSourceType || 'catalog',
    shadowQuality: state.shadingQuality || 'user-estimate'
  };
  results.calculationWarnings = detectCalculationWarnings(results);
  if (results.offgridL2Results?.generatorCapexMissing) {
    results.calculationWarnings.push('Off-grid jeneratör etkin ancak jeneratör CAPEX girilmemiş; finansal sonuçlar jeneratör yatırımını eksik gösterebilir.');
  }
  if (results.offgridL2Results?.accuracyScore != null && results.offgridL2Results.accuracyScore < 60) {
    const band = results.offgridL2Results.expectedUncertaintyPct;
    const bandText = band ? ` Beklenen belirsizlik bandı yaklaşık ±${Math.round(band.lowPct)}-${Math.round(band.highPct)}%.` : '';
    results.calculationWarnings.push(`Off-grid doğruluk puanı düşük: ${results.offgridL2Results.accuracyScore}/100.${bandText}`);
  }
  if (results.offgridL2Results?.fieldGuaranteeReadiness?.status === 'blocked') {
    const firstBlocker = results.offgridL2Results.fieldGuaranteeReadiness.blockers?.[0] || 'Faz 1 saha garanti girdileri eksik.';
    results.calculationWarnings.push(`Off-grid saha garantisi kapalı: ${firstBlocker}`);
  }
  results.evidenceGovernance = buildEvidenceRegistry(state, results);
  if (results.offgridL2Results) {
    results.offgridL2Results.fieldEvidenceGate = buildOffgridFieldEvidenceGate(results.evidenceGovernance, results);
    results.offgridL2Results.fieldModelMaturityGate = buildOffgridFieldModelMaturityGate(results.offgridL2Results.fieldStressAnalysis, {
      phase1Ready: !!results.offgridL2Results.fieldGuaranteeReadiness?.phase1Ready,
      phase2Ready: !!results.offgridL2Results.fieldEvidenceGate.phase2Ready,
      generator: {
        enabled: !!results.offgridL2Results.generatorEnabled,
        capacityKw: results.offgridL2Results.generatorCapacityKw
      },
      badWeatherScenario: results.offgridL2Results.badWeatherScenario || null,
      requireBadWeatherScenario: true
    });
    results.offgridL2Results.fieldGuaranteeCandidate = !!(
      results.offgridL2Results.fieldGuaranteeReadiness?.phase1Ready
      && results.offgridL2Results.fieldEvidenceGate.phase2Ready
      && results.offgridL2Results.fieldModelMaturityGate.phase3Ready
    );
    results.offgridL2Results.fieldAcceptanceGate = buildOffgridFieldAcceptanceGate(results.evidenceGovernance, results);
    results.offgridL2Results.fieldOperationGate = buildOffgridFieldOperationGate(results.evidenceGovernance, results);
    results.offgridL2Results.fieldRevalidationGate = buildOffgridFieldRevalidationGate(results.evidenceGovernance, results);
    results.offgridL2Results.fieldImportGate = buildOffgridFieldImportGate(results.evidenceGovernance, results);
    results.offgridL2Results.fieldGuaranteeReady = !!(
      results.offgridL2Results.fieldGuaranteeCandidate
      && results.offgridL2Results.fieldAcceptanceGate.phase4Ready
      && results.offgridL2Results.fieldOperationGate.phase5Ready
      && results.offgridL2Results.fieldRevalidationGate.phase6Ready
    );
    if (results.offgridL2Results.fieldGuaranteeReady && results.offgridL2Results.accuracyAssessment) {
      results.offgridL2Results.accuracyAssessment = {
        ...results.offgridL2Results.accuracyAssessment,
        tier: 'field-validated',
        accuracyScore: Math.max(results.offgridL2Results.accuracyAssessment.accuracyScore || 0, 95),
        confidenceLevel: 'high',
        expectedUncertaintyPct: { lowPct: 3, highPct: 8 },
        interpretation: 'Saha girdileri, kabul, operasyon ve revalidasyon kapıları tamamlandı; bu bant yine de performans garantisinin sözleşme koşullarına bağlı olduğunu varsayar.'
      };
      results.offgridL2Results.accuracyScore = results.offgridL2Results.accuracyAssessment.accuracyScore;
      results.offgridL2Results.accuracyTier = results.offgridL2Results.accuracyAssessment.tier;
      results.offgridL2Results.expectedUncertaintyPct = results.offgridL2Results.accuracyAssessment.expectedUncertaintyPct;
    }
    if (results.offgridL2Results.fieldEvidenceGate.status === 'blocked') {
      const firstEvidenceBlocker = results.offgridL2Results.fieldEvidenceGate.blockers?.[0]
        || 'Faz 2 saha kanıt girdileri eksik.';
      results.calculationWarnings.push(`Off-grid saha kanıt kapısı kapalı: ${firstEvidenceBlocker}`);
    }
    if (results.offgridL2Results.fieldModelMaturityGate.status === 'blocked') {
      const firstModelBlocker = results.offgridL2Results.fieldModelMaturityGate.blockers?.[0]
        || 'Faz 3 stres/model olgunluğu eksik.';
      results.calculationWarnings.push(`Off-grid saha model olgunluğu kapalı: ${firstModelBlocker}`);
    }
    if (results.offgridL2Results.fieldAcceptanceGate.status === 'blocked') {
      const firstAcceptanceBlocker = results.offgridL2Results.fieldAcceptanceGate.blockers?.[0]
        || 'Faz 4 saha kabul kanıtları eksik.';
      results.calculationWarnings.push(`Off-grid saha kabul kapısı kapalı: ${firstAcceptanceBlocker}`);
    }
    if (results.offgridL2Results.fieldOperationGate.status === 'blocked') {
      const firstOperationBlocker = results.offgridL2Results.fieldOperationGate.blockers?.[0]
        || 'Faz 5 operasyon/izleme kanıtları eksik.';
      results.calculationWarnings.push(`Off-grid garanti operasyon kapısı kapalı: ${firstOperationBlocker}`);
    }
    if (results.offgridL2Results.fieldRevalidationGate.status === 'blocked') {
      const firstRevalidationBlocker = results.offgridL2Results.fieldRevalidationGate.blockers?.[0]
        || 'Faz 6 periyodik revalidasyon kanıtları eksik.';
      results.calculationWarnings.push(`Off-grid garanti revalidasyon kapısı kapalı: ${firstRevalidationBlocker}`);
    }
    if (results.offgridL2Results.fieldImportGate?.status === 'blocked') {
      const firstImportBlocker = results.offgridL2Results.fieldImportGate.blockers?.[0]
        || 'Faz 7 yüksek çözünürlüklü saha importu eksik.';
      results.calculationWarnings.push(`Off-grid saha dakika-profili/log importu eksik: ${firstImportBlocker}`);
    }
    const hasRealPvHourly = !!results.offgridL2Results.productionDispatchMetadata?.hasRealHourlyProduction;
    const hasRealLoadHourly = !!results.offgridL2Results.hasRealHourlyLoad || (Array.isArray(state.hourlyConsumption8760) && state.hourlyConsumption8760.length >= 8760);
    const hasRealCriticalLoadHourly = (Array.isArray(state.offgridCriticalLoad8760) && state.offgridCriticalLoad8760.length >= 8760)
      || (Array.isArray(state.criticalLoad8760) && state.criticalLoad8760.length >= 8760);
    const phase1Ready = !!results.offgridL2Results.fieldGuaranteeReadiness?.phase1Ready;
    const phase2Ready = !!results.offgridL2Results.fieldEvidenceGate?.phase2Ready;
    const phase3Ready = !!results.offgridL2Results.fieldModelMaturityGate?.phase3Ready;
    const phase4Ready = !!results.offgridL2Results.fieldAcceptanceGate?.phase4Ready;
    const phase6Ready = !!results.offgridL2Results.fieldGuaranteeReady;
    let fieldDataState = 'synthetic';
    if (phase6Ready) fieldDataState = 'field-guarantee-ready';
    else if (phase1Ready && phase2Ready && phase3Ready && phase4Ready) fieldDataState = 'accepted-hourly-evidence';
    else if (phase1Ready) fieldDataState = 'field-input-ready';
    else if (hasRealPvHourly || hasRealLoadHourly || hasRealCriticalLoadHourly) fieldDataState = 'hybrid-hourly';
    results.offgridL2Results.fieldDataState = fieldDataState;
    results.offgridL2Results.dataLineage = {
      version: 'GH-OFFGRID-LINEAGE-2026.04-v1',
      fieldDataState,
      production: {
        source: results.offgridL2Results.productionSource || null,
        sourceLabel: results.offgridL2Results.productionSourceLabel || null,
        dispatchProfile: results.offgridL2Results.productionDispatchProfile || null,
        realHourly: hasRealPvHourly,
        fallback: !!results.offgridL2Results.productionFallback
      },
      load: {
        source: results.offgridL2Results.loadSource || null,
        mode: results.offgridL2Results.loadMode || null,
        realHourly: hasRealLoadHourly
      },
      criticalLoad: {
        realHourly: hasRealCriticalLoadHourly
      },
      economics: {
        financialSavingsBasis: results.financialSavingsBasis || null,
        authoritativeFinancialBasis: results.authoritativeFinancialBasis || null
      },
      gates: {
        phase1Ready,
        phase2Ready,
        phase3Ready,
        phase4Ready,
        phase5Ready: !!results.offgridL2Results.fieldOperationGate?.phase5Ready,
        phase6Ready
      }
    };
  }
  results.tariffSourceGovernance = buildTariffSourceGovernance(tariffModel, results.evidenceGovernance);
  if (results.tariffSourceGovernance.warning) results.calculationWarnings.push(results.tariffSourceGovernance.warning);
  results.quoteReadiness = buildQuoteReadiness({ state, results, tariffModel, evidenceGovernance: results.evidenceGovernance });
  results.proposalGovernance = buildProposalGovernance(state, results);
  if (results.proposalGovernance?.approval?.invalidatedApproval) {
    state.proposalApproval = {
      ...(state.proposalApproval || {}),
      state: 'finance-review',
      approvedAt: null,
      approvalRecord: null,
      invalidatedAt: new Date().toISOString(),
      invalidationReason: 'material-proposal-basis-changed'
    };
    results.proposalGovernance = buildProposalGovernance(state, results);
    results.quoteReadiness = buildQuoteReadiness({ state, results, tariffModel, evidenceGovernance: results.evidenceGovernance });
  }
  const confidence = classifyOutputConfidence({ usedFallback, warnings: results.calculationWarnings, state });
  const proposalLevel = results.proposalGovernance?.confidence?.level;
  results.confidenceLevel = results.quoteReadiness.status === 'quote-ready' && proposalLevel === 'quote-ready proposal'
    ? 'quote-ready proposal'
    : proposalLevel || confidence.level;
  results.confidence = {
    ...confidence,
    score: results.proposalGovernance?.confidence?.score,
    factors: results.proposalGovernance?.confidence?.factors || confidence.blockers || []
  };
  state.proposalRevisions = [results.proposalGovernance.revision, ...(state.proposalRevisions || [])].slice(0, 20);
  window.state.results = results;
  window.persistProposalState?.();

  // Calculation is complete; hand the user to the results step.
  if (window.renderEngCalcPanel) window.renderEngCalcPanel();

  setTimeout(() => {
    const shouldNavigateToResults = window.state?.step === 6;
    if (shouldNavigateToResults) window.goToStep(7);
    window.renderResults();
    if (shouldNavigateToResults) window.launchConfetti();
    // Saatlik profili güncelle
    if (window.renderHourlyProfile) window.renderHourlyProfile();
    // Senaryo analizini güncelle
    if (window.renderScenarioAnalysis) window.renderScenarioAnalysis();
    // Güneş yolu diyagramını güncelle
    if (window.renderSunPath) window.renderSunPath();
  }, 500);

  } finally {
    clearTimeout(_calcHardTimeout);
    if (_activeMsgInterval) { clearInterval(_activeMsgInterval); _activeMsgInterval = null; }
  }
}

// ── EV Şarj Hesabı ─────────────────────────────────────────────────────────
function calculateEVMetrics(annualEnergy, dailyConsumption, ev, tariff) {
  const daily_kWh = ev.dailyKm * ev.consumptionPer100km / 100;
  const annual_kWh = daily_kWh * 365;
  const total_consumption = dailyConsumption + daily_kWh;

  // Gündüz şarj → self-consumption
  let solarChargeRatio = 0;
  if (ev.chargeTime === 'day' && daily_kWh > 0) {
    const dailySolarPeak = annualEnergy / 365;
    const practicalDaytimeEnergy = Math.max(0, dailySolarPeak) * 0.45;
    solarChargeRatio = Math.min(practicalDaytimeEnergy / daily_kWh, 0.8);
  }

  const solarChargeKwh = annual_kWh * solarChargeRatio;
  const gridChargeKwh = annual_kWh * (1 - solarChargeRatio);

  const fuelCostSaved = ev.dailyKm * 365 * (ev.fuelPricePerLiter || 45) * (ev.fuelConsumptionL100km || 8) / 100;
  const electricityCost = annual_kWh * tariff;
  const netSaving = fuelCostSaved - electricityCost;

  const _evPanel = PANEL_TYPES[window.state?.panelType || 'mono_perc'];
  const panelArea = (_evPanel?.width || 1.134) * (_evPanel?.height || 1.762);
  const productionPerPanel = annualEnergy / Math.max(1, Math.floor(window.state.roofArea * 0.75 / panelArea));
  const additionalPanels = productionPerPanel > 0 ? Math.ceil(annual_kWh / productionPerPanel) : 0;

  return {
    daily_kWh: daily_kWh.toFixed(2),
    annual_kWh: Math.round(annual_kWh),
    solarChargeKwh: Math.round(solarChargeKwh),
    gridChargeKwh: Math.round(gridChargeKwh),
    solarChargeRatio: (solarChargeRatio * 100).toFixed(1),
    fuelCostSaved: Math.round(fuelCostSaved),
    electricityCost: Math.round(electricityCost),
    netSaving: Math.round(netSaving),
    additionalPanels
  };
}

// ── Isı Pompası Hesabı ──────────────────────────────────────────────────────
function calculateHeatPumpMetrics(hp, tariff, load = null) {
  const hpData = HEAT_PUMP_DATA;
  const insulation = hp.insulation === 'low' ? 'poor' : hp.insulation;
  const cop = load?.cop || hpData.spf_heating?.[insulation] || hpData.cop_heating?.[insulation] || 3.5;
  const annual_heat_demand = load?.heatDemand ?? (Math.max(0, Number(hp.area) || 0) * (hpData.heat_load[insulation] || 80) * 8 * hpData.heating_season_months * 30 / 1000);
  const hp_electricity = load?.annualKwh ?? annual_heat_demand / cop;
  let gas_cost = 0;
  if (hp.currentHeating === 'fueloil') gas_cost = (annual_heat_demand / hpData.fuel_oil_kwh_per_liter) * hpData.fuel_oil_price;
  else if (hp.currentHeating === 'electric') gas_cost = annual_heat_demand * tariff;
  else gas_cost = (annual_heat_demand / hpData.gas_kwh_per_m3) * hpData.gas_price;
  const electricity_cost = hp_electricity * tariff;
  const savings = gas_cost - electricity_cost;

  return {
    annual_heat_demand: Math.round(annual_heat_demand),
    hp_electricity: Math.round(hp_electricity),
    gas_cost: Math.round(gas_cost),
    electricity_cost: Math.round(electricity_cost),
    savings: Math.round(savings),
    cop: cop.toFixed(1),
    coverageRatio: 0
  };
}

function calculateBillAnalysis(monthlyConsumption, monthlyProduction, tariff) {
  const rows = monthlyProduction.map((production, i) => {
    const consumption = Math.max(0, Number(monthlyConsumption[i]) || 0);
    const selfCovered = Math.min(consumption, production);
    return {
      month: i,
      consumption: Math.round(consumption),
      production: Math.round(production),
      coveragePct: consumption > 0 ? ((selfCovered / consumption) * 100).toFixed(1) : '0.0',
      surplus: Math.round(Math.max(0, production - consumption)),
      deficit: Math.round(Math.max(0, consumption - production)),
      estimatedSaving: Math.round(selfCovered * tariff)
    };
  });
  return {
    annualConsumption: rows.reduce((s, r) => s + r.consumption, 0),
    annualProduction: rows.reduce((s, r) => s + r.production, 0),
    annualSaving: rows.reduce((s, r) => s + r.estimatedSaving, 0),
    avgCoveragePct: rows.reduce((s, r) => s + Number(r.coveragePct), 0) / 12,
    rows
  };
}

// ── Vergi Avantajı Hesabı ────────────────────────────────────────────────────
function calculateTaxBenefits(totalCost, npvBase, tax, discountRate, kdvAmount = 0, taxTreatment = null) {
  const depreciableBase = Math.max(0, Number(taxTreatment?.depreciableBase ?? totalCost) || 0);
  const annual_dep = depreciableBase / tax.amortizationYears;
  let taxShieldNPV = 0;
  for (let y = 1; y <= tax.amortizationYears; y++) {
    taxShieldNPV += (annual_dep * tax.corporateTaxRate / 100) / Math.pow(1 + discountRate, y);
  }
  const kdv_recovery = Math.max(0, Number(taxTreatment?.recoverableKdv ?? (tax.kdvRecovery ? kdvAmount : 0)) || 0);
  const incentiveRate = Math.max(0, Number(tax.investmentContribution) || 0) / 100;
  const hasIncentive = !!(tax.investmentDeduction || tax.hasIncentiveCert || incentiveRate > 0);
  const investment_deduction = hasIncentive ? depreciableBase * incentiveRate * (tax.corporateTaxRate / 100) : 0;

  const totalTaxBenefit = taxShieldNPV + kdv_recovery + investment_deduction;
  const effectiveCost = totalCost - totalTaxBenefit;
  const nonVatTaxBenefit = taxShieldNPV + investment_deduction;

  return {
    annual_dep: Math.round(annual_dep),
    depreciableBase: Math.round(depreciableBase),
    taxShieldNPV: Math.round(taxShieldNPV),
    kdv_recovery: Math.round(kdv_recovery),
    investment_deduction: Math.round(investment_deduction),
    totalTaxBenefit: Math.round(totalTaxBenefit),
    effectiveCost: Math.round(effectiveCost),
    adjustedNPV: Math.round(npvBase + nonVatTaxBenefit),
    vatTreatment: taxTreatment?.vatTreatment || 'kdv-included-in-financial-cost-basis'
  };
}

// BUG-13 fix: Do NOT expose runCalculation directly on window — app.js imports it from
// calculation-service.js which wraps this function with the Python backend adapter.
// A bare window.runCalculation would bypass the adapter, silently skipping pvlib/backend.
// Use window.runCalculationService (set in calculation-service.js) for console/debug calls.
window.calculateBatteryMetrics = calculateBatteryMetrics;
window.calculateNMMetrics = calculateNMMetrics;
