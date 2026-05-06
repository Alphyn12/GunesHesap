// Turkey tariff and lisanssiz uretim regulation helpers.
// This module centralizes date-sensitive regulatory assumptions so quote output
// can expose exactly which rule set was used.
import { isEvidenceComplete } from './evidence-governance.js';
import { hasMeaningfulConsumptionEvidence } from './consumption-evidence.js';

export const TURKEY_REGULATORY_VERSION = 'TR-REG-2026.04.13';

export const TURKEY_REGULATORY_SOURCES = [
  {
    id: 'epdk-sktt-2026',
    version: '2026.04-local',
    label: 'EPDK SKTT 2026 bilgilendirme',
    url: 'https://www.epdk.gov.tr/Detay/Icerik/16-38/son-kaynak-tedarik-tarifesi-sktt-ile-ilgili-bil',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    checkedDate: '2026-04-13',
    validationStatus: 'locally-verified'
  },
  {
    id: 'epdk-lisanssiz-uretim',
    version: '2026.04-local',
    label: 'EPDK Elektrik Piyasasında Lisanssız Elektrik Üretimi',
    url: 'https://www.epdk.gov.tr/detay/icerik/3-0-0-1160/elektrik-piyasasinda-lisanssiz-elektrik-uretimi-',
    effectiveFrom: '2026-04-02',
    effectiveTo: null,
    checkedDate: '2026-04-13',
    validationStatus: 'locally-verified'
  },
  {
    id: 'rg-2026-33212',
    version: '2026.04-local',
    label: '02.04.2026 RG 33212 lisanssız üretim değişikliği',
    url: 'https://www.resmigazete.gov.tr/',
    effectiveFrom: '2026-04-02',
    effectiveTo: null,
    checkedDate: '2026-04-13',
    validationStatus: 'locally-verified'
  }
];

export const TARIFF_DATA_LIFECYCLE = {
  version: 'TR-TARIFF-SOURCE-GOV-2026.04-local',
  ingestionMode: 'source-governed-local',
  futureIngestionAdapter: 'epdk-live-ingestion-adapter',
  staleAfterDays: 45,
  sources: TURKEY_REGULATORY_SOURCES
};

export const SKTT_LIMITS_2026 = {
  residential: 4000,
  commercial: 15000,
  industrial: 15000,
  public_service: 15000,
  lighting: 15000,
  agriculture: 150000000,
  custom: null
};

export const SETTLEMENT_CHANGE_DATE = '2026-05-01';

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function startOfFollowingThirdMonth(exceededDate) {
  const date = new Date(`${exceededDate}T00:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 3, 1));
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function isOnOrAfter(date, threshold) {
  const d = dateOnly(date);
  const t = dateOnly(threshold);
  return !!(d && t && d >= t);
}

export function determineSkttRegime(state = {}) {
  const type = state.tariffType || 'residential';
  const limit = SKTT_LIMITS_2026[type] ?? null;
  const annualConsumptionKwh = Math.max(0, finiteNumber(state.annualConsumptionKwh, finiteNumber(state.dailyConsumption) * 365));
  const previousYearConsumptionKwh = Math.max(0, finiteNumber(state.previousYearConsumptionKwh, annualConsumptionKwh));
  const currentYearConsumptionKwh = Math.max(0, finiteNumber(state.currentYearConsumptionKwh, annualConsumptionKwh));
  const tariffRegime = state.tariffRegime || 'auto';
  const hasBilateralContract = !!state.hasBilateralContract || tariffRegime === 'contract';
  const exceeded = !!limit && Math.max(annualConsumptionKwh, previousYearConsumptionKwh, currentYearConsumptionKwh) >= limit;
  const warnings = [];

  const activationDate = state.skttActivationDate || (state.skttExceededDate ? startOfFollowingThirdMonth(state.skttExceededDate)?.toISOString().slice(0, 10) : null);
  const evaluationDate = dateOnly(state.tariffEvaluationDate || state.settlementDate || state.operationDate || new Date().toISOString().slice(0, 10));
  const activationReached = exceeded && (!activationDate || isOnOrAfter(evaluationDate, activationDate));
  const requested = tariffRegime === 'auto'
    ? (activationReached ? 'sktt' : 'pst')
    : tariffRegime;
  const forcedSkttBeforeActivation = tariffRegime === 'sktt' && exceeded && activationDate && !activationReached;
  const effectiveRegime = hasBilateralContract
    ? 'contract'
    : forcedSkttBeforeActivation
      ? 'pst'
      : requested;

  if (!limit && tariffRegime === 'sktt') warnings.push('Bu abone grubu için SKTT limiti tanımlı değil; manuel seçim doğrulanmalı.');
  if (effectiveRegime === 'sktt' && !exceeded && limit) warnings.push('SKTT seçili ancak yıllık tüketim limiti aşmıyor.');
  if (effectiveRegime === 'contract' && !state.contractedTariff) warnings.push('Sözleşmeli tarife seçili ancak sözleşmeli birim fiyat girilmedi.');
  if (forcedSkttBeforeActivation) warnings.push('SKTT limiti aşılmış görünüyor ancak aktivasyon tarihi henüz gelmediği için PST baz alınmıştır.');

  return {
    type,
    limitKwh: limit,
    annualConsumptionKwh,
    previousYearConsumptionKwh,
    currentYearConsumptionKwh,
    exceeded,
    hasBilateralContract,
    requestedRegime: requested,
    effectiveRegime,
    activationDate,
    activationReached,
    evaluationDate,
    effectiveRegimeBasis: hasBilateralContract
      ? 'bilateral-contract'
      : activationReached
        ? 'sktt-limit-exceeded-and-activation-reached'
        : exceeded
          ? 'sktt-limit-exceeded-activation-pending'
          : 'below-sktt-limit',
    warnings
  };
}

export function buildExportCompensationPolicy(state = {}) {
  const settlementMode = state.exportSettlementMode || state.netMeteringSettlement || 'auto';
  // FIX-7: Using new Date() here produced non-deterministic results — the same
  // state object would silently flip from 'monthly' to 'hourly' mahsuplaşma
  // depending on the calendar date. Null out when no explicit date is stored so
  // callers can detect the missing value and show a governance blocker instead.
  const settlementDate = state.settlementDate || null;
  const settlementDateMissing = settlementMode === 'auto' && !settlementDate;
  const interval = settlementMode === 'auto'
    ? (settlementDate && settlementDate >= SETTLEMENT_CHANGE_DATE ? 'hourly' : 'monthly')
    : settlementMode;
  const annualConsumptionKwh = Math.max(0, finiteNumber(state.annualConsumptionKwh, finiteNumber(state.dailyConsumption) * 365));
  const annualProductionKwh = Math.max(0, finiteNumber(state.annualProductionKwh, 0));
  const previousYearConsumptionKwh = Math.max(0, finiteNumber(state.previousYearConsumptionKwh, annualConsumptionKwh));
  const currentYearConsumptionKwh = Math.max(0, finiteNumber(state.currentYearConsumptionKwh, annualConsumptionKwh));
  const userCap = Number(state.sellableExportCapKwh);
  const hasManualCap = Number.isFinite(userCap) && userCap > 0;
  const annualSellableExportCapKwh = hasManualCap
    ? Math.max(0, userCap)
    : Math.max(annualConsumptionKwh, previousYearConsumptionKwh, currentYearConsumptionKwh);
  const productionToConsumptionLimitKwh = annualConsumptionKwh > 0 ? annualConsumptionKwh * 2 : null;
  const productionLimitExceeded = !!(productionToConsumptionLimitKwh && annualProductionKwh > productionToConsumptionLimitKwh);

  return {
    version: TURKEY_REGULATORY_VERSION,
    settlementMode,
    interval,
    settlementDate,
    settlementDateMissing,
    provisional: settlementDateMissing,
    assumptionBasis: settlementDateMissing
      ? 'auto-settlement-date-missing-assumed-monthly-for-preliminary-economics'
      : interval === 'hourly'
        ? 'hourly-net-export-compensation'
        : 'monthly-netting-import-offset-then-surplus-compensation',
    annualSellableExportCapKwh,
    capBasis: hasManualCap ? 'manual' : 'max(current/previous/annual consumption)',
    annualProductionKwh,
    productionToConsumptionLimitKwh,
    productionLimitExceeded,
    productionLimitBasis: productionToConsumptionLimitKwh ? 'annual-production-vs-2x-associated-consumption-check' : null,
    paidBatteryExportAllowed: false,
    sources: TURKEY_REGULATORY_SOURCES,
    lifecycle: TARIFF_DATA_LIFECYCLE
  };
}

function proratePaidExport(monthly, paidTotal) {
  const exports = monthly.map(m => Math.max(0, Number(m.compensableSurplus ?? m.gridExport) || 0));
  const totalExport = exports.reduce((s, v) => s + v, 0);
  if (totalExport <= 0) return monthly.map(() => ({ paidGridExport: 0, unpaidGridExport: 0 }));
  return exports.map(v => {
    const paidGridExport = paidTotal * (v / totalExport);
    return { paidGridExport, unpaidGridExport: Math.max(0, v - paidGridExport) };
  });
}

function aggregateHourlyCompensation(hourlyRows, annualCap) {
  const hourly = Array.isArray(hourlyRows) ? hourlyRows : [];
  const compensatedHourly = hourly.map(row => {
    const rawExport = Math.max(0, Number(row.gridExport) || 0);
    return {
      month: Math.max(0, Math.min(11, Number(row.month) || 0)),
      paidBeforeAnnualCap: rawExport,
      rawExport
    };
  });
  const paidBeforeCap = compensatedHourly.reduce((s, row) => s + row.paidBeforeAnnualCap, 0);
  const annualScale = paidBeforeCap > annualCap ? annualCap / paidBeforeCap : 1;
  const monthly = new Array(12).fill(0).map(() => ({ paidGridExport: 0, unpaidGridExport: 0 }));
  compensatedHourly.forEach(row => {
    const paidGridExport = row.paidBeforeAnnualCap * annualScale;
    monthly[row.month].paidGridExport += paidGridExport;
    monthly[row.month].unpaidGridExport += Math.max(0, row.rawExport - paidGridExport);
    monthly[row.month].compensableSurplus = (monthly[row.month].compensableSurplus || 0) + row.rawExport;
    monthly[row.month].importOffsetEnergy = (monthly[row.month].importOffsetEnergy || 0);
  });
  return monthly;
}

export function applyExportCompensation(monthly, policy = {}) {
  const rows = Array.isArray(monthly) ? monthly : [];
  const interval = policy.interval || 'monthly';
  const { hourlyRows: _hourlyRows, ...publicPolicy } = policy;
  const annualCap = Number.isFinite(Number(policy.annualSellableExportCapKwh))
    ? Math.max(0, Number(policy.annualSellableExportCapKwh))
    : Infinity;

  let compensated;
  if (interval === 'hourly') {
    if (Array.isArray(policy.hourlyRows) && policy.hourlyRows.length >= 8760) {
      compensated = aggregateHourlyCompensation(policy.hourlyRows.slice(0, 8760), annualCap);
    } else {
      compensated = rows.map(m => {
        const rawExport = Math.max(0, Number(m.gridExport) || 0);
        return { importOffsetEnergy: 0, compensableSurplus: rawExport, paidGridExport: 0, unpaidGridExport: rawExport };
      });
    }
  } else {
    compensated = rows.map(m => {
      const rawExport = Math.max(0, Number(m.gridExport) || 0);
      const gridImport = Math.max(0, Number(m.gridImport) || 0);
      const monthlyOffsetEnergy = Math.min(rawExport, gridImport);
      const compensableSurplus = Math.max(0, rawExport - monthlyOffsetEnergy);
      return {
        importOffsetEnergy: monthlyOffsetEnergy,
        compensableSurplus,
        paidGridExport: compensableSurplus,
        unpaidGridExport: 0
      };
    });
    const paidBeforeAnnualCap = compensated.reduce((s, m) => s + m.paidGridExport, 0);
    if (paidBeforeAnnualCap > annualCap) {
      const cappedPaid = proratePaidExport(compensated, annualCap);
      compensated = compensated.map((m, idx) => ({
        ...m,
        paidGridExport: cappedPaid[idx].paidGridExport,
        unpaidGridExport: Math.max(0, m.compensableSurplus - cappedPaid[idx].paidGridExport)
      }));
    }
  }

  return {
    importOffsetEnergy: compensated.reduce((s, m) => s + (Number(m.importOffsetEnergy) || 0), 0),
    compensableSurplus: compensated.reduce((s, m) => s + (Number(m.compensableSurplus ?? m.paidGridExport) || 0), 0),
    paidGridExport: compensated.reduce((s, m) => s + m.paidGridExport, 0),
    unpaidGridExport: compensated.reduce((s, m) => s + m.unpaidGridExport, 0),
    monthly: compensated,
    policy: {
      ...publicPolicy,
      interval: interval === 'hourly' && !(Array.isArray(policy.hourlyRows) && policy.hourlyRows.length >= 8760)
        ? 'monthly-aggregate-no-hourly-settlement'
        : interval,
      requestedInterval: interval,
      annualSellableExportCapKwh: Number.isFinite(annualCap) ? annualCap : null
    }
  };
}

// Faz-3 D6: production weather provenance allow-list. Anything else is synthetic
// (clear-sky scaled to GHI, deterministic PSH, monthly-derived synthetic profile)
// and may not be promoted to a binding commercial quote. Mirrors the frontend
// authoritative-backend gate in calc-engine.js so quote-readiness and engine
// authority share one definition of "real meteorology".
const SYNTHETIC_PRODUCTION_WEATHER_SOURCES = new Set([
  'clearsky-scaled-synthetic',
  'psh-deterministic-synthetic',
  'monthly-derived-synthetic-pv',
  'monthly-production-derived-synthetic-8760'
]);

function resolveProductionWeatherSource(results = {}) {
  return (
    results.authoritativeEngineSource?.weatherSource
    || results.engineSource?.weatherSource
    || results.authoritativeEngineResponse?.engineSource?.weatherSource
    || results.authoritativeEngineResponse?.production?.weatherSource
    || results.authoritativeEngineResponse?.production?.assumption_flags?.weatherSource
    || results.authoritativeEngineResponse?.losses?.weatherSource
    || null
  );
}

export function buildQuoteReadiness({ state = {}, results = {}, tariffModel = null, evidenceGovernance = null } = {}) {
  const blockers = [];
  const isOffGrid = state.scenarioKey === 'off-grid';
  const policy = tariffModel?.exportCompensationPolicy || {};
  const tariffSourceType = tariffModel?.tariffSourceType || state.tariffSourceType || 'manual';
  const evidenceRegistry = evidenceGovernance?.registry || {};
  const validationWarnings = evidenceGovernance?.validation?.warnings || [];
  const hasHourlyConsumptionProfile = Array.isArray(state.hourlyConsumption8760) && state.hourlyConsumption8760.length >= 8760;
  const offgrid = results.offgridL2Results || {};
  // Faz-3 D6: a synthetic production weather source (clear-sky scaled, deterministic
  // PSH, etc.) cannot back a binding quote even when other governance flags pass.
  const productionWeatherSource = resolveProductionWeatherSource(results);
  const productionWeatherIsSynthetic = !!productionWeatherSource
    && SYNTHETIC_PRODUCTION_WEATHER_SOURCES.has(productionWeatherSource);
  if (isOffGrid) {
    if (results.usedFallback) blockers.push('PVGIS canlı veri yok; fallback üretim off-grid teklif adayı için kabul edilmez.');
    if (productionWeatherIsSynthetic) {
      blockers.push(`Üretim verisi sentetik meteoroloji modelinden geliyor (${productionWeatherSource}); off-grid teklif için PVGIS canlı/TMY veya ölçülmüş hava verisi zorunlu.`);
    }
    if (!state.roofGeometry) blockers.push('Çatı geometrisi harita/saha çizimiyle doğrulanmadı.');
    if (!state.quoteInputsVerified) blockers.push('Teklif varsayımları yetkili kullanıcı tarafından doğrulanmadı.');
    if (!hasMeaningfulConsumptionEvidence(state) && !hasHourlyConsumptionProfile) blockers.push('Off-grid toplam yük kaynağı doğrulanmadı.');
    if (state.bomCommercials?.supplierQuoteState !== 'received') blockers.push('Tedarikçi BOM teklifi alınmadı.');
    if ((state.costSourceType || 'catalog') !== 'bom-verified') blockers.push('Tedarikçi BOM teklifi ile maliyet doğrulanmadı — katalog/manuel fiyat kullanılıyor.');
    if (offgrid.fieldGuaranteeReadiness?.phase1Ready !== true) {
      blockers.push(offgrid.fieldGuaranteeReadiness?.blockers?.[0] || 'Faz 1 saatlik saha dispatch girdileri eksik.');
    }
    if (offgrid.fieldEvidenceGate?.phase2Ready !== true) {
      blockers.push(offgrid.fieldEvidenceGate?.blockers?.[0] || 'Faz 2 doğrulanmış saha kanıtları eksik.');
    }
    if (offgrid.fieldModelMaturityGate?.phase3Ready !== true) {
      blockers.push(offgrid.fieldModelMaturityGate?.blockers?.[0] || 'Faz 3 stres/model olgunluğu eksik.');
    }
    if (offgrid.fieldAcceptanceGate?.phase4Ready !== true) {
      blockers.push(offgrid.fieldAcceptanceGate?.blockers?.[0] || 'Faz 4 saha kabul kanıtları eksik.');
    }
    if (!isEvidenceComplete(evidenceGovernance)) {
      blockers.push(...(evidenceGovernance?.validation?.blockers || ['Kanıt yönetimi kaydı tamamlanmadı.']));
    }
    if (Array.isArray(results.calculationWarnings) && results.calculationWarnings.length) blockers.push(...results.calculationWarnings);
    return {
      status: blockers.length ? 'not-quote-ready' : 'quote-ready',
      blockers: [...new Set(blockers)],
      warnings: [...new Set(evidenceGovernance?.validation?.warnings || [])],
      version: TURKEY_REGULATORY_VERSION
    };
  }
  if (state.exportSettlementMode === 'auto' && !state.settlementDate) {
    blockers.push('SETTLEMENT_DATE_MISSING: Mahsuplaşma modu Otomatik seçiliyken sistem devreye alma tarihi girilmesi zorunludur.');
  }
  if (results.usedFallback) blockers.push('PVGIS canlı veri yok; fallback üretim quote-ready kabul edilmez.');
  // Faz-3 D6: on-grid commercial quotes also require real meteorology, not a
  // synthetic clear-sky / PSH model. The frontend authoritative gate prevents
  // these sources from overriding PVGIS at calc time, but we still block here
  // in case a downstream caller injected a synthetic-only result set.
  if (productionWeatherIsSynthetic) {
    blockers.push(`Üretim verisi sentetik meteoroloji modelinden geliyor (${productionWeatherSource}); ticari teklif için PVGIS canlı/TMY veya ölçülmüş hava verisi zorunlu.`);
  }
  if (!state.roofGeometry) blockers.push('Çatı geometrisi harita/saha çizimiyle doğrulanmadı.');
  if (!state.quoteInputsVerified) blockers.push('Teklif varsayımları yetkili kullanıcı tarafından doğrulanmadı.');
  if (!hasMeaningfulConsumptionEvidence(state)) blockers.push('Müşteri fatura/tüketim verisi doğrulanmadı.');
  if (!tariffModel?.regulation?.effectiveRegime) blockers.push('Tarife rejimi belirlenemedi.');
  if (tariffModel?.regulation?.warnings?.length) blockers.push(...tariffModel.regulation.warnings);
  if (!policy.sources?.length) blockers.push('İhracat mahsuplaşma kaynağı kayıtlı değil.');
  if (policy.productionLimitExceeded) {
    blockers.push('Yıllık üretim ilişkili tüketimin 2 katı kontrolünü aşıyor; satılabilir fazla enerji için dağıtım şirketi/regülasyon uygunluğu doğrulanmalı.');
  }
  if (
    policy.interval === 'hourly' &&
    results.productionProfileSource !== 'backend-pvlib-hourly' &&
    results.productionProfileSource !== 'pvgis-seriescalc-hourly' &&
    results.productionProfileSource !== 'user-hourly-pv-normalized-to-authoritative-annual'
  ) {
    blockers.push('Saatlik mahsuplaşma seçili ancak PV üretim profili sentetik; ticari teklif için saatlik PV üretim kaynağı doğrulanmalı.');
  }
  if (policy.interval === 'hourly' && !hasHourlyConsumptionProfile) {
    blockers.push('Saatlik mahsuplaşma seçili ancak tüketim profili 8760 saatlik veri değil; ticari teklif için saatlik tüketim kaynağı doğrulanmalı.');
  }
  if (state.proposalApproval?.state !== 'approved') blockers.push('Proposal onay durumu approved değil.');
  if (!state.proposalApproval?.approvalRecord?.immutable) blockers.push('Immutable onay kaydı yok.');
  if (state.bomCommercials?.supplierQuoteState !== 'received') blockers.push('Tedarikçi BOM teklifi alınmadı.');
  if (state.gridApplicationChecklist) {
    const done = Object.values(state.gridApplicationChecklist).every(item => item?.done);
    if (!done) blockers.push('Şebeke başvuru kontrol listesi eksik.');
  } else {
    blockers.push('Şebeke başvuru kontrol listesi oluşturulmadı.');
  }
  if (!tariffModel?.sourceDate || !tariffModel?.sourceLabel) blockers.push('Tarife kaynak tarihi/etiketi eksik.');
  if (tariffSourceType !== 'official') blockers.push('Tarife resmi kaynakla doğrulanmadı — ticari teklif için official tariff source zorunlu.');
  if (evidenceRegistry.supplierQuote?.status === 'verified' && !evidenceRegistry.supplierQuote?.validUntil) {
    blockers.push('Tedarikçi BOM teklifinin geçerlilik tarihi yok; enterprise quote-ready için geçerli teklif tarihi zorunlu.');
  }
  if (validationWarnings.some(item => String(item).includes('regulationSource'))) {
    blockers.push('Regülasyon kaynak kontrol tarihi eski veya eksik; enterprise quote-ready için güncel regülasyon kaynağı zorunlu.');
  }
  // Shadow quality check
  const shadowQuality = state.shadingQuality || 'user-estimate';
  if (shadowQuality === 'unknown') blockers.push('Gölge veri kalitesi bilinmiyor — ticari teklif için mühendislik değerlendirmesi gerekli.');
  else if (shadowQuality === 'user-estimate') blockers.push('Gölge verisi kullanıcı beyanına dayanıyor — ampirik saha doğrulaması eksik.');
  // Cost source type check
  const costSourceType = state.costSourceType || 'catalog';
  if (costSourceType !== 'bom-verified') blockers.push('Tedarikçi BOM teklifi ile maliyet doğrulanmadı — katalog/manuel fiyat kullanılıyor.');
  if (!isEvidenceComplete(evidenceGovernance)) {
    blockers.push(...(evidenceGovernance?.validation?.blockers || ['Kanıt yönetimi kaydı tamamlanmadı.']));
  }
  if (Array.isArray(results.calculationWarnings) && results.calculationWarnings.length) blockers.push(...results.calculationWarnings);

  return {
    status: blockers.length ? 'not-quote-ready' : 'quote-ready',
    blockers: [...new Set(blockers)],
    warnings: [...new Set(evidenceGovernance?.validation?.warnings || [])],
    version: TURKEY_REGULATORY_VERSION
  };
}
