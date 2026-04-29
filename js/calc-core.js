// ═══════════════════════════════════════════════════════════
// CALC CORE — Saf hesap yardımcıları
// Solar Rota v2.1
// ═══════════════════════════════════════════════════════════
import {
  PANEL_TYPES, HOURLY_SOLAR_PROFILE, RESIDENTIAL_LOAD, COMMERCIAL_LOAD,
  INDUSTRIAL_LOAD, MONTH_WEIGHTS, TARIFF_META, normalizePanelTypeKey, INVERTER_TYPES
} from './data.js';
import {
  applyExportCompensation, buildExportCompensationPolicy, determineSkttRegime, TARIFF_DATA_LIFECYCLE
} from './turkey-regulation.js';
import { hasMeaningfulMonthlyConsumption } from './consumption-evidence.js';
import { getPanelCatalogById } from './panel-catalog.js';

export const METHODOLOGY_VERSION = 'GH-CALC-2026.04-v2.1';
export const PVGIS_LOSS_PARAM = 0;
export const COMMON_YEAR_MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
export const HEAT_PUMP_HEATING_WEIGHTS = [0.18,0.16,0.12,0.06,0.02,0,0,0,0.02,0.06,0.14,0.24];
export const HEAT_PUMP_COOLING_WEIGHTS = [0,0,0,0.05,0.15,0.25,0.30,0.20,0.05,0,0,0];

export function normalizeProfile(profile) {
  const values = Array.isArray(profile) && profile.length ? profile : new Array(24).fill(1);
  const sum = values.reduce((a, b) => a + (Number(b) || 0), 0);
  if (sum <= 0) return values.map(() => 1 / values.length);
  return values.map(v => (Number(v) || 0) / sum);
}

export function getLoadProfile(tariffType = 'residential') {
  if (tariffType === 'daytime-heavy') return normalizeProfile([0.01,0.01,0.01,0.01,0.01,0.02,0.03,0.05,0.07,0.08,0.09,0.10,0.10,0.09,0.08,0.07,0.06,0.04,0.03,0.02,0.01,0.01,0.01,0.01]);
  if (tariffType === 'balanced') return normalizeProfile([0.03,0.025,0.02,0.02,0.025,0.035,0.045,0.055,0.055,0.05,0.045,0.045,0.045,0.045,0.045,0.05,0.055,0.06,0.06,0.055,0.045,0.04,0.035,0.03]);
  if (tariffType === 'evening-heavy') return normalizeProfile([0.02,0.015,0.015,0.015,0.02,0.025,0.035,0.04,0.035,0.03,0.03,0.03,0.035,0.035,0.04,0.05,0.065,0.085,0.095,0.09,0.075,0.06,0.045,0.03]);
  if (tariffType === 'business-hours') return normalizeProfile([0.005,0.005,0.005,0.005,0.005,0.01,0.025,0.055,0.085,0.095,0.10,0.10,0.095,0.095,0.09,0.08,0.06,0.035,0.015,0.01,0.005,0.005,0.005,0.005]);
  if (tariffType === 'commercial') return normalizeProfile(COMMERCIAL_LOAD);
  if (tariffType === 'industrial') return normalizeProfile(INDUSTRIAL_LOAD);
  return normalizeProfile(RESIDENTIAL_LOAD);
}

export function getSeasonForMonth(monthIdx) {
  if (monthIdx === 11 || monthIdx <= 1) return 'winter';
  if (monthIdx >= 5 && monthIdx <= 7) return 'summer';
  return 'spring';
}

export function getMonthlyLoadKwh(state, extraAnnualLoad = 0) {
  const base = hasMeaningfulMonthlyConsumption(state.monthlyConsumption)
    ? state.monthlyConsumption.map(v => Math.max(0, Number(v) || 0))
    : new Array(12).fill(Math.max(0, Number(state.dailyConsumption) || 0) * 365 / 12);

  if (Array.isArray(extraAnnualLoad)) {
    return base.map((v, i) => v + Math.max(0, Number(extraAnnualLoad[i]) || 0));
  }

  const extra = Math.max(0, Number(extraAnnualLoad) || 0);
  return base.map((v, i) => v + extra * (MONTH_WEIGHTS[i] || 1 / 12));
}

export function calculateEVLoad(ev) {
  if (!ev) return { annualKwh: 0, dailyKwh: 0, monthlyKwh: new Array(12).fill(0), hourly8760: new Array(8760).fill(0) };
  const dailyKwh = Math.max(0, Number(ev.dailyKm) || 0) * Math.max(0, Number(ev.consumptionPer100km) || 0) / 100;
  const annualKwh = dailyKwh * 365;
  const monthDays = COMMON_YEAR_MONTH_DAYS;
  const chargeProfile = ev.chargeTime === 'night'
    ? normalizeProfile([0.16,0.16,0.16,0.14,0.12,0.10,0.06,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.03,0.04,0.03])
    : normalizeProfile([0,0,0,0,0,0,0,0,0,0.08,0.12,0.16,0.18,0.18,0.14,0.10,0.04,0,0,0,0,0,0,0]);
  const monthlyKwh = monthDays.map(days => dailyKwh * days);
  const hourly8760 = [];
  monthDays.forEach(days => {
    for (let d = 0; d < days; d++) {
      for (let h = 0; h < 24; h++) hourly8760.push(dailyKwh * chargeProfile[h]);
    }
  });
  return { dailyKwh, annualKwh, monthlyKwh, hourly8760 };
}

export function calculateHeatPumpLoad(hp, heatPumpData) {
  if (!hp) return { annualKwh: 0, heatDemand: 0, cop: 0, monthlyKwh: new Array(12).fill(0), hourly8760: new Array(8760).fill(0) };
  const insulation = hp.insulation === 'low' ? 'poor' : hp.insulation;
  const heatLoad = heatPumpData?.heat_load?.[insulation] || 80;
  const cop = heatPumpData?.spf_heating?.[insulation] || heatPumpData?.cop_heating?.[insulation] || 3.5;
  const coolingCop = heatPumpData?.spf_cooling?.[insulation] || heatPumpData?.cop_cooling?.[insulation] || 4.0;
  const area = Math.max(0, Number(hp.area) || 0);
  const heatingMonths = Math.max(1, Number(heatPumpData?.heating_season_months) || 5);
  const coolingMonths = Math.max(1, Number(heatPumpData?.cooling_season_months) || 4);
  const heatDemand = area * heatLoad * 8 * heatingMonths * 30 / 1000;
  const coolDemand = area * heatLoad * 0.7 * 8 * coolingMonths * 30 / 1000;
  const mode = hp.heatingType || 'both';
  const doHeating = mode === 'heat' || mode === 'heating' || mode === 'both';
  const doCooling = mode === 'cool' || mode === 'cooling' || mode === 'both';
  const heatingKwh = doHeating ? heatDemand / cop : 0;
  const coolingKwh = doCooling ? coolDemand / coolingCop : 0;
  const annualKwh = heatingKwh + coolingKwh;
  const monthlyKwh = HEAT_PUMP_HEATING_WEIGHTS.map((w, i) =>
    heatingKwh * w + coolingKwh * (HEAT_PUMP_COOLING_WEIGHTS[i] || 0)
  );
  const hourly8760 = [];
  monthlyKwh.forEach((monthKwh, monthIdx) => {
    const days = COMMON_YEAR_MONTH_DAYS[monthIdx];
    const daily = days > 0 ? monthKwh / days : 0;
    const season = getSeasonForMonth(monthIdx);
    const hourlyShape = season === 'winter'
      ? normalizeProfile([0.055,0.055,0.055,0.055,0.055,0.055,0.055,0.045,0.035,0.03,0.03,0.03,0.03,0.03,0.03,0.035,0.04,0.05,0.055,0.06,0.06,0.055,0.055,0.055])
      : normalizeProfile([0.02,0.02,0.02,0.02,0.02,0.025,0.03,0.035,0.04,0.045,0.05,0.055,0.06,0.065,0.07,0.075,0.075,0.07,0.06,0.05,0.04,0.035,0.03,0.025]);
    for (let d = 0; d < days; d++) {
      for (let h = 0; h < 24; h++) hourly8760.push(daily * hourlyShape[h]);
    }
  });
  return { annualKwh, heatDemand, cop, coolingKwh, heatingKwh, monthlyKwh, hourly8760 };
}

export function sumMonthlyArrays(...arrays) {
  return new Array(12).fill(0).map((_, i) =>
    arrays.reduce((sum, arr) => sum + (Array.isArray(arr) ? Math.max(0, Number(arr[i]) || 0) : 0), 0)
  );
}

export function normalizeMonthlyProductionToAnnual(monthlyProduction, annualEnergy) {
  const annual = Math.max(0, Number(annualEnergy) || 0);
  const source = Array.isArray(monthlyProduction) && monthlyProduction.length === 12
    ? monthlyProduction.map(v => Math.max(0, Number(v) || 0))
    : MONTH_WEIGHTS.map(weight => annual * weight);
  const sourceSum = source.reduce((sum, value) => sum + value, 0);
  const scaled = sourceSum > 0
    ? source.map(value => value * annual / sourceSum)
    : MONTH_WEIGHTS.map(weight => annual * weight);
  const rounded = scaled.map(value => Math.round(value));
  const delta = Math.round(annual) - rounded.reduce((sum, value) => sum + value, 0);
  if (rounded.length === 12 && delta !== 0) {
    const maxIndex = rounded.reduce((best, value, index) => value > rounded[best] ? index : best, 0);
    rounded[maxIndex] += delta;
  }
  return rounded;
}

export function normalizeHourlyProfileToAnnual(hourly, annualTarget) {
  if (!Array.isArray(hourly) || hourly.length < 8760) return null;
  const base = hourly.slice(0, 8760).map(v => Math.max(0, Number(v) || 0));
  const total = base.reduce((sum, value) => sum + value, 0);
  const target = Math.max(0, Number(annualTarget) || 0);
  if (total <= 0 || target <= 0) return null;
  const scale = target / total;
  return base.map(value => value * scale);
}

export function resolveProductionTemperatureAdjustment({ source = 'fallback-psh', panelTempCoeff = -0.0037, avgSummerTemp = 25 } = {}) {
  const coeff = Number.isFinite(Number(panelTempCoeff)) ? Number(panelTempCoeff) : -0.0037;
  const summerTemp = Number.isFinite(Number(avgSummerTemp)) ? Number(avgSummerTemp) : 25;
  if (source === 'pvgis-live' || source === 'pvlib-backed') {
    return {
      factor: 1,
      lossRate: 0,
      applied: false,
      basis: `${source}-temperature-already-modeled`
    };
  }
  // Fallback PSH has no hourly cell-temperature model. A summer peak temperature
  // derate applied to all 8760 hours overstates annual losses, so use an
  // annualized delta that represents roughly the production-weighted year.
  const annualizedDeltaC = (summerTemp - 25) * 0.45;
  const lossRate = coeff * annualizedDeltaC;
  return {
    factor: Math.max(0.85, Math.min(1.08, 1 + lossRate)),
    lossRate,
    applied: true,
    basis: 'fallback-annualized-temperature-derate',
    annualizedDeltaC,
    summerReferenceTempC: summerTemp
  };
}

export function buildBaseHourlyLoad8760(monthlyLoad, tariffType = 'residential', loadProfileKey = null) {
  const loadProfile = getLoadProfile(loadProfileKey || tariffType);
  const out = [];
  COMMON_YEAR_MONTH_DAYS.forEach((days, monthIdx) => {
    const dayLoad = Math.max(0, Number(monthlyLoad[monthIdx]) || 0) / days;
    for (let d = 0; d < days; d++) {
      for (let h = 0; h < 24; h++) out.push(dayLoad * loadProfile[h]);
    }
  });
  return out;
}

function parsePanelDimensionsMeters(rawDimensions) {
  if (typeof rawDimensions !== 'string') return null;
  const match = rawDimensions.match(/(\d{3,4}(?:[.,]\d+)?)\s*[×x]\s*(\d{3,4}(?:[.,]\d+)?)/i);
  if (!match) return null;
  const widthMm = Number(String(match[1]).replace(',', '.'));
  const heightMm = Number(String(match[2]).replace(',', '.'));
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) return null;
  return {
    width: widthMm / 1000,
    height: heightMm / 1000
  };
}

export function resolvePanelSpec(state = {}, panelType = state.panelType) {
  const normalizedType = normalizePanelTypeKey(panelType);
  const basePanel = PANEL_TYPES[normalizedType] || PANEL_TYPES.mono_perc;
  const selectedCatalog = getPanelCatalogById(state.panelCatalogId);
  const panel = { ...basePanel, key: normalizedType };

  if (selectedCatalog && normalizePanelTypeKey(selectedCatalog.technologyProfileId) === normalizedType) {
    const parsedDimensions = parsePanelDimensionsMeters(selectedCatalog.dimensions);
    const modeledWattPeak = Number(selectedCatalog.modeledWattPeak);
    const modeledTempCoeffPerC = Number(selectedCatalog.modeledTempCoeffPerC);
    if (parsedDimensions) {
      panel.width = parsedDimensions.width;
      panel.height = parsedDimensions.height;
      panel.dimensionsSource = 'catalog';
    }
    if (Number.isFinite(modeledWattPeak) && modeledWattPeak > 0) {
      panel.wattPeak = modeledWattPeak;
      panel.wattSource = 'catalog';
    }
    if (Number.isFinite(modeledTempCoeffPerC) && modeledTempCoeffPerC < 0) {
      panel.tempCoeff = modeledTempCoeffPerC;
      panel.tempCoeffSource = 'catalog';
    }
    panel.catalogId = selectedCatalog.id;
    panel.catalogDisplayName = selectedCatalog.displayName;
  }

  panel.areaM2 = (Number(panel.width) || 0) * (Number(panel.height) || 0);
  return panel;
}

export function combineHourlyLoads(...loads) {
  const out = new Array(8760).fill(0);
  loads.forEach(load => {
    if (!Array.isArray(load)) return;
    for (let i = 0; i < Math.min(8760, load.length); i++) out[i] += Math.max(0, Number(load[i]) || 0);
  });
  return out;
}

export function resolvePermitCost(systemPowerKwp = 0) {
  const systemPower = Math.max(0, Number(systemPowerKwp) || 0);
  if (systemPower < 5) return 8000;
  if (systemPower < 10) return 6000;
  if (systemPower < 20) return 5000;
  return 4000;
}

export function estimateSolarCapex({
  systemPowerKwp = 0,
  panel = null,
  panelPricePerWatt = null,
  inverterTypeKey = 'string',
  mountingPerKwp = 2200,
  dcCablePerKwp = 600,
  acElecPerKwp = 900,
  laborPerKwp = 1800,
  panelKdvRate = 0,
  nonPanelKdvRate = 0.20
} = {}) {
  const systemPower = Math.max(0, Number(systemPowerKwp) || 0);
  const inverterType = INVERTER_TYPES[inverterTypeKey] || INVERTER_TYPES.string;
  const inverterPrices = inverterType?.pricePerKWp || {};
  const invUnit = systemPower < 10
    ? Number(inverterPrices.lt10) || 0
    : systemPower < 50
      ? Number(inverterPrices.lt50) || 0
      : Number(inverterPrices.gt50) || 0;
  const panelUnitPrice = Math.max(0, Number(panelPricePerWatt ?? panel?.pricePerWatt) || 0);
  const permitCost = resolvePermitCost(systemPower);
  const panelCost = systemPower * 1000 * panelUnitPrice;
  const inverterCost = systemPower * invUnit;
  const mountingCost = systemPower * (Number(mountingPerKwp) || 0);
  const dcCableCost = systemPower * (Number(dcCablePerKwp) || 0);
  const acElecCost = systemPower * (Number(acElecPerKwp) || 0);
  const laborCost = systemPower * (Number(laborPerKwp) || 0);
  const subtotal = panelCost + inverterCost + mountingCost + dcCableCost + acElecCost + laborCost + permitCost;
  const nonPanelSubtotal = subtotal - panelCost;
  const solarKdv = panelCost * (Number(panelKdvRate) || 0) + nonPanelSubtotal * (Number(nonPanelKdvRate) || 0);
  const solarCost = subtotal + solarKdv;
  const kdvRate = subtotal > 0 ? solarKdv / subtotal : 0;

  return {
    inverterTypeKey,
    invUnit,
    panelPricePerWatt: panelUnitPrice,
    permitCost,
    panelCost,
    inverterCost,
    mountingCost,
    dcCableCost,
    acElecCost,
    laborCost,
    subtotal,
    nonPanelSubtotal,
    solarKdv,
    solarCost,
    kdvRate,
    panelKdvRate: Number(panelKdvRate) || 0,
    nonPanelKdvRate: Number(nonPanelKdvRate) || 0
  };
}

export function calculateSystemLayout(state, panelType = state.panelType) {
  const panel = resolvePanelSpec(state, panelType);
  const panelArea = panel.areaM2;
  const primarySection = {
    area: Number(state.roofArea) || 0,
    tilt: Number(state.tilt) || 0,
    azimuth: Number(state.azimuth) || 180,
    azimuthCoeff: Number(state.azimuthCoeff) || 1,
    azimuthName: state.azimuthName || 'Güney',
    shadingFactor: Number(state.shadingFactor) || 0
  };
  const sections = (state.multiRoof && Array.isArray(state.roofSections) && state.roofSections.length > 0)
    ? [primarySection, ...state.roofSections.map(sec => ({
        area: Number(sec.area) || 0,
        tilt: Number(sec.tilt) || 0,
        azimuth: Number(sec.azimuth) || 180,
        azimuthCoeff: Number(sec.azimuthCoeff) || 1,
        azimuthName: sec.azimuthName || 'Yüzey',
        shadingFactor: Number(sec.shadingFactor) || 0
      }))]
    : [primarySection];

  const usableRatio = Math.max(0.1, Math.min(0.95, Number(state.usableRoofRatio) || 0.75));
  let sectionLayouts = sections.map(sec => {
    const panelCount = Math.floor(sec.area * usableRatio / panelArea);
    return {
      ...sec,
      panelCount,
      systemPower: panelCount * panel.wattPeak / 1000,
      panelArea
    };
  });
  const maxPanelCount = sectionLayouts.reduce((sum, sec) => sum + sec.panelCount, 0);
  const annualTargetKwh = Math.max(0, Number(state.annualConsumptionKwh) || (Number(state.dailyConsumption) || 0) * 365);
  const targetSpecificYield = Math.max(900, Math.min(1800, (Number(state.ghi) || 1600) * 0.85));
  const targetPanelCount = Math.max(1, Math.ceil((annualTargetKwh / targetSpecificYield) * 1000 / panel.wattPeak));
  const canCapToLoadTarget = state.scenarioKey === 'on-grid' || state.scenarioKey === 'off-grid';
  const shouldCapToBillTarget = canCapToLoadTarget
    && state.designTarget === 'bill-offset'
    && annualTargetKwh > 0
    && maxPanelCount > 0
    && targetPanelCount < maxPanelCount;

  if (shouldCapToBillTarget) {
    const target = Math.min(maxPanelCount, targetPanelCount);
    const allocations = sectionLayouts.map(sec => Math.min(sec.panelCount, Math.floor(target * sec.panelCount / maxPanelCount)));
    let allocated = allocations.reduce((sum, value) => sum + value, 0);
    const order = sectionLayouts
      .map((sec, idx) => ({
        idx,
        fraction: (target * sec.panelCount / maxPanelCount) - allocations[idx]
      }))
      .sort((a, b) => b.fraction - a.fraction);

    while (allocated < target) {
      const next = order.find(item => allocations[item.idx] < sectionLayouts[item.idx].panelCount);
      if (!next) break;
      allocations[next.idx] += 1;
      allocated += 1;
    }

    sectionLayouts = sectionLayouts.map((sec, idx) => ({
      ...sec,
      panelCount: allocations[idx],
      systemPower: allocations[idx] * panel.wattPeak / 1000
    }));
  }

  return {
    panel,
    panelArea,
    sections: sectionLayouts,
    panelCount: sectionLayouts.reduce((s, sec) => s + sec.panelCount, 0),
    systemPower: sectionLayouts.reduce((s, sec) => s + sec.systemPower, 0),
    usableArea: sections.reduce((s, sec) => s + sec.area * usableRatio, 0),
    designTargetApplied: shouldCapToBillTarget ? 'bill-offset' : 'fill-roof',
    targetSystemPowerKwp: shouldCapToBillTarget ? targetPanelCount * panel.wattPeak / 1000 : null
  };
}

export function simulateHourlyEnergy(monthlyProduction, monthlyLoad, options = {}) {
  const hourlyLoad8760 = Array.isArray(options.hourlyLoad8760) && options.hourlyLoad8760.length >= 8760
    ? options.hourlyLoad8760.slice(0, 8760).map(v => Math.max(0, Number(v) || 0))
    : null;
  const hourlyProduction8760 = Array.isArray(options.hourlyProduction8760) && options.hourlyProduction8760.length >= 8760
    ? options.hourlyProduction8760.slice(0, 8760).map(v => Math.max(0, Number(v) || 0))
    : null;
  let hourlyCursor = 0;
  let annualProduction = 0;
  let annualLoad = 0;
  let directSelfConsumption = 0;
  let gridExport = 0;
  let gridImport = 0;
  const hourly8760 = [];

  const monthly = monthlyProduction.map((production, monthIdx) => {
    const days = COMMON_YEAR_MONTH_DAYS[monthIdx];
    const season = getSeasonForMonth(monthIdx);
    const solarProfile = normalizeProfile(HOURLY_SOLAR_PROFILE[season]);
    const hourlySlice = hourlyLoad8760
      ? hourlyLoad8760.slice(hourlyCursor, hourlyCursor + days * 24)
      : null;
    const productionSlice = hourlyProduction8760
      ? hourlyProduction8760.slice(hourlyCursor, hourlyCursor + days * 24)
      : null;
    hourlyCursor += days * 24;
    const monthLoad = hourlySlice
      ? hourlySlice.reduce((a, b) => a + b, 0)
      : Math.max(0, Number(monthlyLoad[monthIdx]) || 0);
    const monthProduction = productionSlice
      ? productionSlice.reduce((a, b) => a + b, 0)
      : Math.max(0, Number(production) || 0);
    const dayProduction = monthProduction / days;
    const dayLoad = monthLoad / days;

    let monthSelf = 0;
    let monthExport = 0;
    let monthImport = 0;

    for (let d = 0; d < days; d++) {
      for (let h = 0; h < 24; h++) {
        const p = productionSlice
          ? (productionSlice[d * 24 + h] || 0)
          : dayProduction * solarProfile[h];
        const l = hourlySlice
          ? (hourlySlice[d * 24 + h] || 0)
          : dayLoad * getLoadProfile(options.loadProfileKey || options.tariffType)[h];
        const self = Math.min(p, l);
        const exported = Math.max(0, p - l);
        const imported = Math.max(0, l - p);
        monthSelf += self;
        monthExport += exported;
        monthImport += imported;
        hourly8760.push({
          month: monthIdx,
          hour: h,
          production: p,
          load: l,
          selfConsumption: self,
          gridExport: exported,
          gridImport: imported,
          batteryDischarge: 0,
          batteryChargeFromPv: 0,
          batteryExport: 0
        });
      }
    }

    annualProduction += monthProduction;
    annualLoad += monthLoad;
    directSelfConsumption += monthSelf;
    gridExport += monthExport;
    gridImport += monthImport;

    return {
      production: Math.round(monthProduction),
      load: Math.round(monthLoad),
      selfConsumption: Math.round(monthSelf),
      gridExport: Math.round(monthExport),
      gridImport: Math.round(monthImport)
    };
  });

  const exportPolicy = options.exportPolicy || buildExportCompensationPolicy({
    tariffType: options.tariffType,
    annualConsumptionKwh: annualLoad,
    dailyConsumption: annualLoad / 365,
    exportSettlementMode: options.exportSettlementMode,
    netMeteringSettlement: options.netMeteringSettlement,
    settlementDate: options.settlementDate,
    previousYearConsumptionKwh: options.previousYearConsumptionKwh,
    currentYearConsumptionKwh: options.currentYearConsumptionKwh,
    sellableExportCapKwh: options.sellableExportCapKwh
  });
  const capped = applyExportCompensation(monthly, { ...exportPolicy, hourlyRows: hourly8760 });

  return {
    annualProduction,
    annualLoad,
    selfConsumption: directSelfConsumption,
    gridExport,
    gridImport,
    importOffsetEnergy: capped.importOffsetEnergy,
    compensableSurplus: capped.compensableSurplus,
    paidGridExport: capped.paidGridExport,
    unpaidGridExport: capped.unpaidGridExport,
    selfConsumptionRatio: annualProduction > 0 ? Math.min(1, directSelfConsumption / annualProduction) : 0,
    hourly8760,
    monthly: monthly.map((m, i) => ({
      ...m,
      importOffsetEnergy: capped.monthly[i].importOffsetEnergy || 0,
      compensableSurplus: capped.monthly[i].compensableSurplus || 0,
      paidGridExport: capped.monthly[i].paidGridExport,
      unpaidGridExport: capped.monthly[i].unpaidGridExport
    })),
    exportPolicy: capped.policy
  };
}

export function buildHourlySimulationOptions({
  state = {},
  tariffModel = null,
  hourlyLoad8760 = null,
  hourlyProduction8760 = null
} = {}) {
  return {
    tariffType: state.tariffType,
    loadProfileKey: state.usageProfile || state.onGridUsageProfile,
    hourlyLoad8760,
    hourlyProduction8760,
    exportPolicy: tariffModel?.exportCompensationPolicy,
    previousYearConsumptionKwh: state.previousYearConsumptionKwh,
    currentYearConsumptionKwh: state.currentYearConsumptionKwh,
    sellableExportCapKwh: state.sellableExportCapKwh,
    settlementDate: state.settlementDate
  };
}

export function capPaidExportByMonth(monthly) {
  return applyExportCompensation(monthly, { interval: 'monthly' });
}

export function simulateBatteryOnHourlySummary(hourlySummary, battery, options = {}) {
  if (!battery || !hourlySummary) return null;
  const usableCapacity = Math.max(0, Number(battery.capacity) || 0) * Math.max(0, Number(battery.dod) || 0);
  const efficiency = Math.max(0, Math.min(1, Number(battery.efficiency) || 0.9));
  const chargeEff = Math.sqrt(Math.max(efficiency, 0.01));
  const dischargeEff = chargeEff;
  // Faz-4 Fix-14: Off-grid minimum SOC reserve (10% of usable capacity by default).
  // Prevents full depletion — a real battery management system always keeps a reserve
  // for unexpected loads and protects cell longevity.
  const socReservePct = Math.max(0, Math.min(0.5, Number(options.socReservePct) || 0));
  const socReserveKwh = usableCapacity * socReservePct;
  const dispatchableCapacity = usableCapacity - socReserveKwh;
  const hourly = Array.isArray(hourlySummary.hourly8760) ? hourlySummary.hourly8760 : [];
  let soc = Math.max(socReserveKwh, Math.min(usableCapacity, Number(options.initialSocKwh) || socReserveKwh));
  let batteryDischarge = 0;
  let chargedFromPv = 0;
  let remainingExport = 0;
  let remainingImport = 0;
  // Faz-4 Fix-14: Track unmet load and autonomy days
  let unmetLoadKwh = 0;
  let dailyGridImport = 0;
  let autonomousDays = 0;
  let dayOfYear = 0;
  const monthly = new Array(12).fill(0).map(() => ({ load: 0, production: 0, selfConsumption: 0, gridExport: 0, gridImport: 0 }));
  const hourly8760 = [];

  if (usableCapacity <= 0 || hourly.length < 8760) {
    return {
      usableCapacity,
      batteryDischarge: 0,
      chargedFromPv: 0,
      remainingExport: hourlySummary.gridExport,
      remainingImport: hourlySummary.gridImport,
      totalSelfConsumption: hourlySummary.selfConsumption,
      gridIndependence: hourlySummary.annualLoad > 0 ? Math.min(1, hourlySummary.selfConsumption / hourlySummary.annualLoad) : 0,
      selfConsumptionRatio: hourlySummary.annualProduction > 0 ? Math.min(1, hourlySummary.selfConsumption / hourlySummary.annualProduction) : 0,
      cyclesPerYear: 0,
      importOffsetEnergy: hourlySummary.importOffsetEnergy ?? 0,
      compensableSurplus: hourlySummary.compensableSurplus ?? hourlySummary.gridExport ?? 0,
      paidGridExport: hourlySummary.paidGridExport ?? hourlySummary.gridExport,
      unpaidGridExport: hourlySummary.unpaidGridExport ?? 0,
      batteryExportPaid: 0,
      monthly: hourlySummary.monthly,
      hourly8760: hourly
    };
  }

  hourly.forEach((row, idx) => {
    const production = Math.max(0, Number(row.production) || 0);
    const load = Math.max(0, Number(row.load) || 0);
    const directSelf = Math.min(production, load);
    const pvSurplus = Math.max(0, production - directSelf);
    const deficit = Math.max(0, load - directSelf);
    // Faz-4 Fix-14: Charge only up to usableCapacity; discharge only above reserve.
    const chargeFromPv = Math.min(pvSurplus, Math.max(0, usableCapacity - soc) / chargeEff);
    soc += chargeFromPv * chargeEff;
    const availableForDischarge = Math.max(0, soc - socReserveKwh);
    const dischargeToLoad = Math.min(deficit, availableForDischarge * dischargeEff);
    soc -= dischargeToLoad / dischargeEff;
    const exportAfterBattery = Math.max(0, pvSurplus - chargeFromPv);
    const importAfterBattery = Math.max(0, deficit - dischargeToLoad);
    const monthIdx = row.month ?? 0;

    chargedFromPv += chargeFromPv;
    batteryDischarge += dischargeToLoad;
    remainingExport += exportAfterBattery;
    remainingImport += importAfterBattery;
    unmetLoadKwh += importAfterBattery;  // any remaining import = unmet by solar+battery

    // Autonomy day tracking: at end of each day (hour 23), check if grid import was 0
    dailyGridImport += importAfterBattery;
    if (row.hour === 23 || idx === hourly.length - 1) {
      if (dailyGridImport < 0.001) autonomousDays++;
      dailyGridImport = 0;
      dayOfYear++;
    }

    monthly[monthIdx].load += load;
    monthly[monthIdx].production += production;
    monthly[monthIdx].selfConsumption += directSelf + dischargeToLoad;
    monthly[monthIdx].gridExport += exportAfterBattery;
    monthly[monthIdx].gridImport += importAfterBattery;
    hourly8760.push({
      ...row,
      selfConsumption: directSelf + dischargeToLoad,
      gridExport: exportAfterBattery,
      gridImport: importAfterBattery,
      batteryDischarge: dischargeToLoad,
      batteryChargeFromPv: chargeFromPv,
      batteryExport: 0,
      soc
    });
  });

  const totalSelf = hourlySummary.selfConsumption + batteryDischarge;
  const capped = applyExportCompensation(monthly, { ...(options.exportPolicy || { interval: 'monthly' }), hourlyRows: hourly8760 });
  const cyclesPerYear = usableCapacity > 0 ? batteryDischarge / usableCapacity : 0;

  return {
    usableCapacity,
    batteryDischarge,
    chargedFromPv,
    remainingExport,
    remainingImport,
    totalSelfConsumption: totalSelf,
    gridIndependence: hourlySummary.annualLoad > 0 ? Math.min(1, totalSelf / hourlySummary.annualLoad) : 0,
    selfConsumptionRatio: hourlySummary.annualProduction > 0 ? Math.min(1, totalSelf / hourlySummary.annualProduction) : 0,
    cyclesPerYear,
    // Faz-4 Fix-14: Off-grid quality metrics
    unmetLoadKwh: Math.round(unmetLoadKwh),
    autonomousDays,
    autonomousDaysPct: dayOfYear > 0 ? Math.round(autonomousDays / dayOfYear * 100) : 0,
    socReserveKwh,
    importOffsetEnergy: capped.importOffsetEnergy,
    compensableSurplus: capped.compensableSurplus,
    paidGridExport: capped.paidGridExport,
    unpaidGridExport: capped.unpaidGridExport,
    batteryExportPaid: 0,
    monthly: monthly.map((m, i) => ({
      production: Math.round(m.production),
      load: Math.round(m.load),
      selfConsumption: Math.round(m.selfConsumption),
      gridExport: Math.round(m.gridExport),
      gridImport: Math.round(m.gridImport),
      importOffsetEnergy: capped.monthly[i].importOffsetEnergy || 0,
      compensableSurplus: capped.monthly[i].compensableSurplus || 0,
      paidGridExport: capped.monthly[i].paidGridExport,
      unpaidGridExport: capped.monthly[i].unpaidGridExport
    })),
    exportPolicy: capped.policy,
    hourly8760
  };
}

export function resolveTaxTreatment({ grossTotalCost = 0, solarKdv = 0, taxEnabled = false, tax = null } = {}) {
  const gross = Math.max(0, Number(grossTotalCost) || 0);
  const recoverableKdv = taxEnabled && tax?.kdvRecovery
    ? Math.min(gross, Math.max(0, Number(solarKdv) || 0))
    : 0;
  const financialCostBasis = Math.max(0, gross - recoverableKdv);
  return {
    grossTotalCost: gross,
    recoverableKdv,
    financialCostBasis,
    depreciableBase: financialCostBasis,
    vatTreatment: recoverableKdv > 0
      ? 'recoverable-kdv-excluded-from-financial-cost-basis'
      : 'kdv-included-in-financial-cost-basis'
  };
}

export function resolveAnnualOperatingCosts({ costBasis = 0, omEnabled = false, omRate = 0, insuranceRate = 0 } = {}) {
  const basis = Math.max(0, Number(costBasis) || 0);
  const omPct = Math.max(0, Number(omRate) || 0) / 100;
  const insurancePct = Math.max(0, Number(insuranceRate) || 0) / 100;
  return {
    costBasis: basis,
    annualOMCost: omEnabled ? Math.round(basis * omPct) : 0,
    annualInsurance: omEnabled ? Math.round(basis * insurancePct) : 0
  };
}

export function buildTariffModel(state) {
  const tariffType = state.tariffType || 'residential';
  const meta = TARIFF_META[tariffType] || TARIFF_META.residential;
  const tariffSourceType = state.tariffSourceType || 'estimate';
  const tariffSourceDate = tariffSourceType === 'official'
    ? (state.tariffSourceDate || meta.sourceDate)
    : (state.tariffSourceCheckedAt ? (state.tariffSourceDate || state.tariffSourceCheckedAt) : null);
  const tariffSourceLabels = {
    official: meta.sourceLabel,
    manual: 'Kullanıcı tanımlı manuel tarife girdisi; fatura veya resmi kaynakla doğrulanmalı',
    estimate: 'Varsayılan tarife varsayımı; resmi kaynakla doğrulanmadı'
  };
  const annualConsumptionKwh = Math.max(0, Number(state.annualConsumptionKwh) || Number(state.dailyConsumption || 0) * 365);
  const skttRate = Math.max(0, Number(state.skttTariff) || Number(state.tariff) || 0);
  const contractedRate = Math.max(0, Number(state.contractedTariff) || Number(state.tariff) || 0);
  const tariffRegime = state.tariffRegime || 'auto';
  const regulation = determineSkttRegime({ ...state, annualConsumptionKwh });
  const effectiveRegime = regulation.effectiveRegime;
  const importRateByRegime = effectiveRegime === 'sktt'
    ? skttRate
    : effectiveRegime === 'contract'
      ? contractedRate
      : Math.max(0, Number(state.tariff) || 0);
  const annualPriceIncrease = Math.max(-0.5, Number(state.annualPriceIncrease ?? 0.12));
  const exportCompensationPolicy = buildExportCompensationPolicy({ ...state, annualConsumptionKwh });

  return {
    type: tariffType,
    mode: state.tariffMode || tariffRegime,
    tariffRegime,
    effectiveRegime,
    annualConsumptionKwh,
    contractedPowerKw: Math.max(0, Number(state.contractedPowerKw) || 0),
    importRate: importRateByRegime,
    pstRate: Math.max(0, Number(state.tariff) || 0),
    skttRate,
    contractedRate,
    exportRate: Math.max(0, Number(state.exportTariff) || 0),
    annualPriceIncrease,
    discountRate: Math.max(0, Number(state.discountRate ?? 0.18)),
    expenseEscalationRate: Math.max(-0.5, Number(state.expenseEscalationRate ?? Math.min(0.25, annualPriceIncrease))),
    sourceDate: tariffSourceDate,
    sourceLabel: tariffSourceLabels[tariffSourceType] || tariffSourceLabels.estimate,
    sourceUrl: state.evidence?.tariffSource?.sourceUrl || '',
    sourceLifecycle: TARIFF_DATA_LIFECYCLE,
    skttLimitKwh: meta.skttLimitKwh,
    includesTax: state.tariffIncludesTax ?? true,
    tariffInputMode: state.tariffInputMode || 'net-plus-fee',
    distributionFee: state.tariffInputMode === 'gross' ? 0 : Math.max(0, Number(state.distributionFee) || 0),
    effectiveImportRate: importRateByRegime + (state.tariffInputMode === 'gross' ? 0 : Math.max(0, Number(state.distributionFee) || 0)),
    tariffSourceType,
    regulation,
    exportCompensationPolicy
  };
}

export function computeFinancialTable({
  annualEnergy, hourlySummary, batterySummary, totalCost, tariffModel,
  panel, annualOMCost, annualInsurance, inverterLifetime, inverterReplaceCost,
  netMeteringEnabled, exportRateOverride, batteryLifetime = 0, batteryReplaceCost = 0,
  batteryPriceEscalationRate = 0,
  annualLoadGrowth = 0, annualGeneratorCost = 0,
  annualGeneratorKwh = 0, generatorAlternativeCostPerKwh = 0, generatorFuelCostPerKwh = 0
}) {
  const rows = [];
  let cumulativeNet = 0;
  let totalExpenses25y = 0;
  let paybackYear = 0;
  const lidFactor = panel.firstYearDeg || 0;
  const annualBaseSelf = batterySummary?.totalSelfConsumption ?? hourlySummary.selfConsumption;
  const annualBaseOffset = batterySummary?.importOffsetEnergy ?? hourlySummary.importOffsetEnergy ?? 0;
  const annualBaseExport = batterySummary?.paidGridExport ?? hourlySummary.paidGridExport ?? batterySummary?.remainingExport ?? hourlySummary.gridExport;
  const selfRatio = annualEnergy > 0 ? annualBaseSelf / annualEnergy : 0;
  const offsetRatio = annualEnergy > 0 ? annualBaseOffset / annualEnergy : 0;
  const exportRatio = annualEnergy > 0 ? annualBaseExport / annualEnergy : 0;
  const exportRate = exportRateOverride ?? tariffModel.exportRate;
  let cumulativeDiscounted = 0;
  let discountedPaybackYear = 0;

  for (let year = 1; year <= 25; year++) {
    const degradedEnergy = annualEnergy * (1 - lidFactor) * Math.pow(1 - panel.degradation, year - 1);
    const electricityPriceDisplay = tariffModel.importRate * Math.pow(1 + tariffModel.annualPriceIncrease, year - 1);
    // Distribution fee is included in savings (net-plus-fee mode). Off-grid sets distributionFee: 0.
    const effectiveImportRate = tariffModel.importRate + (tariffModel.distributionFee ?? 0);
    const electricityPrice = effectiveImportRate * Math.pow(1 + tariffModel.annualPriceIncrease, year - 1);
    const escalatedExportRate = exportRate * Math.pow(1 + tariffModel.annualPriceIncrease, year - 1);
    // Faz-3 Fix-13: Load growth shifts more solar output into self-consumption each year.
    // As load grows, the system covers a larger fraction of a larger consumption → selfRatio grows.
    // Capped at 1.0 (cannot self-consume more than is produced).
    const loadGrowthFactor = Math.pow(1 + (annualLoadGrowth || 0), year - 1);
    const yearSelfRatio  = Math.min(1.0, selfRatio  * loadGrowthFactor);
    const yearOffsetRatio = Math.min(Math.max(0, 1 - yearSelfRatio), offsetRatio * loadGrowthFactor);
    const yearExportRatio = Math.min(Math.max(0, 1 - yearSelfRatio - yearOffsetRatio), Math.max(0, exportRatio / loadGrowthFactor)); // exports shrink as load absorbs more
    const selfE  = degradedEnergy * yearSelfRatio;
    const offsetE = netMeteringEnabled ? degradedEnergy * yearOffsetRatio : 0;
    const exportE = degradedEnergy * yearExportRatio;
    const paidExportE = netMeteringEnabled ? exportE : 0;
    const compensatedConsumptionE = selfE + offsetE;
    // Optional avoided-cost credit for externally modeled generator displacement.
    // Main off-grid PV+BESS flow passes 0 here; generator fuel remains an expense.
    const netGenSavingsPerKwh = Math.max(0, generatorAlternativeCostPerKwh - generatorFuelCostPerKwh);
    const yearGeneratorSavings = annualGeneratorKwh * netGenSavingsPerKwh
      * Math.pow(1 + tariffModel.annualPriceIncrease, year - 1);
    const yearSavings = compensatedConsumptionE * electricityPrice + paidExportE * escalatedExportRate + yearGeneratorSavings;
    let yearExpenses = (annualOMCost + annualInsurance + annualGeneratorCost) * Math.pow(1 + (tariffModel.expenseEscalationRate || 0), year - 1);
    const invLife = Math.round(Number(inverterLifetime) || 0);
    if (invLife > 0 && year % invLife === 0) yearExpenses += inverterReplaceCost * Math.pow(1 + (tariffModel.expenseEscalationRate || 0), year - 1);
    const batLife = Math.round(Number(batteryLifetime) || 0);
    if (batLife > 0 && year % batLife === 0) yearExpenses += batteryReplaceCost * Math.pow(1 + batteryPriceEscalationRate, year - 1);
    totalExpenses25y += yearExpenses;
    const netCashFlow = yearSavings - yearExpenses;
    const npv = netCashFlow / Math.pow(1 + tariffModel.discountRate, year);
    cumulativeNet += netCashFlow;
    cumulativeDiscounted += npv;
    if (cumulativeNet >= totalCost && paybackYear === 0) paybackYear = year;
    if (cumulativeDiscounted >= totalCost && discountedPaybackYear === 0) discountedPaybackYear = year;
    rows.push({
      year,
      energy: Math.round(degradedEnergy),
      rate: electricityPriceDisplay.toFixed(2),
      effectiveImportRate: electricityPrice.toFixed(2),
      rateBasis: (tariffModel.distributionFee ?? 0) > 0 ? 'import-plus-distribution-fee' : 'import-rate',
      exportRate: escalatedExportRate.toFixed(2),
      selfConsumptionKwh: Math.round(selfE),
      importOffsetKwh: Math.round(offsetE),
      compensatedConsumptionKwh: Math.round(compensatedConsumptionE),
      paidExportKwh: Math.round(paidExportE),
      savings: Math.round(yearSavings),
      expenses: Math.round(yearExpenses),
      netCashFlow: Math.round(netCashFlow),
      cumulative: Math.round(cumulativeNet),
      npv: Math.round(npv),
      discountedCumulative: Math.round(cumulativeDiscounted)
    });
  }

  const discountedCashFlow = rows.reduce((s, row) => s + row.netCashFlow / Math.pow(1 + tariffModel.discountRate, row.year), 0);
  const projectNPV = discountedCashFlow - totalCost;
  const cumulativeSavings = rows.reduce((s, row) => s + row.savings, 0);
  const totalNetCashFlow = rows.reduce((s, row) => s + row.netCashFlow, 0);
  const firstYearGrossSavings = rows[0]?.savings || 0;
  const firstYearNetCashFlow = rows[0]?.netCashFlow || 0;
  const grossSimplePaybackYear = totalCost > 0 && firstYearGrossSavings > 0 ? totalCost / firstYearGrossSavings : 0;
  const netSimplePaybackYear = totalCost > 0 && firstYearNetCashFlow > 0 ? totalCost / firstYearNetCashFlow : 0;
  const roi = totalCost > 0 ? ((totalNetCashFlow - totalCost) / totalCost) * 100 : 0;

  return {
    rows,
    paybackYear,
    simplePaybackYear: paybackYear,
    cumulativeNetPaybackYear: paybackYear,
    grossSimplePaybackYear,
    netSimplePaybackYear,
    discountedPaybackYear,
    totalExpenses25y,
    discountedCashFlow,
    projectNPV,
    cumulativeSavings,
    roi
  };
}

export function calculateDiscountedLcoe({
  initialCostBasis = 0,
  yearlyTable = [],
  discountRate = 0,
  scenarioKey = 'on-grid'
} = {}) {
  let lcoeCostSum = Math.max(0, Number(initialCostBasis) || 0);
  let lcoeEnergySum = 0;
  let compensatedLcoeEnergySum = 0;

  yearlyTable.forEach(row => {
    const year = Math.max(1, Number(row?.year) || 1);
    const df = Math.pow(1 + Math.max(0, Number(discountRate) || 0), year);
    lcoeCostSum += (Number(row?.expenses) || 0) / df;
    const deliveredEnergyForLcoe = scenarioKey === 'off-grid'
      ? (Number(row?.selfConsumptionKwh) || Number(row?.compensatedConsumptionKwh) || 0)
      : (Number(row?.energy) || 0);
    lcoeEnergySum += deliveredEnergyForLcoe / df;
    const compensatedEnergyForLcoe = scenarioKey === 'off-grid'
      ? deliveredEnergyForLcoe
      : (Number(row?.compensatedConsumptionKwh) || 0) + (Number(row?.paidExportKwh) || 0);
    compensatedLcoeEnergySum += compensatedEnergyForLcoe / df;
  });

  return {
    lcoe: lcoeEnergySum > 0 ? Number((lcoeCostSum / lcoeEnergySum).toFixed(2)) : null,
    compensatedLcoe: compensatedLcoeEnergySum > 0 ? Number((lcoeCostSum / compensatedLcoeEnergySum).toFixed(2)) : null
  };
}

export function calcIRR(cfs) {
  const cashFlows = Array.isArray(cfs) ? cfs.map(v => Number(v) || 0) : [];
  let signChanges = 0;
  for (let i = 1; i < cashFlows.length; i++) {
    if ((cashFlows[i] >= 0) !== (cashFlows[i - 1] >= 0)) signChanges++;
  }
  if (signChanges !== 1) return 'N/A';
  const npv = rate => cashFlows.reduce((s, c, t) => s + c / Math.pow(1 + rate, t), 0);
  const min = -0.95;
  const max = 5.0;
  let lo = min;
  let hi = max;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return 'N/A';
  for (let i = 0; i < 160; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (!isFinite(fMid)) return 'N/A';
    if (Math.abs(fMid) < 1e-7 || Math.abs(hi - lo) < 1e-8) return (mid * 100).toFixed(1);
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  const r = (lo + hi) / 2;
  return isFinite(r) ? (r * 100).toFixed(1) : 'N/A';
}

export function evaluateProjectEconomics({
  annualEnergy,
  hourlySummary,
  batterySummary,
  totalCost,
  tariffModel,
  panel,
  annualOMCost,
  annualInsurance,
  inverterLifetime,
  inverterReplaceCost,
  netMeteringEnabled,
  exportRateOverride,
  batteryLifetime = 0,
  batteryReplaceCost = 0,
  batteryPriceEscalationRate = 0,
  annualLoadGrowth = 0,
  annualGeneratorCost = 0,
  annualGeneratorKwh = 0,
  generatorAlternativeCostPerKwh = 0,
  generatorFuelCostPerKwh = 0,
  scenarioKey = 'on-grid'
} = {}) {
  const financial = computeFinancialTable({
    annualEnergy,
    hourlySummary,
    batterySummary,
    totalCost,
    tariffModel,
    panel,
    annualOMCost,
    annualInsurance,
    inverterLifetime,
    inverterReplaceCost,
    netMeteringEnabled,
    exportRateOverride,
    batteryLifetime,
    batteryReplaceCost,
    batteryPriceEscalationRate,
    annualLoadGrowth,
    annualGeneratorCost,
    annualGeneratorKwh,
    generatorAlternativeCostPerKwh,
    generatorFuelCostPerKwh
  });
  const yearlyTable = financial.rows;
  const irr = calcIRR([-(Number(totalCost) || 0), ...yearlyTable.map(y => y.netCashFlow)]);
  const lcoeMetrics = calculateDiscountedLcoe({
    initialCostBasis: totalCost,
    yearlyTable,
    discountRate: tariffModel?.discountRate || 0,
    scenarioKey
  });
  return {
    ...financial,
    yearlyTable,
    irr,
    ...lcoeMetrics
  };
}

export function detectCalculationWarnings(results) {
  const warnings = [];
  if (!isFinite(results.annualEnergy) || results.annualEnergy < 0) warnings.push('Yıllık üretim geçersiz.');
  if (!isFinite(results.totalCost) || results.totalCost <= 0) warnings.push('Toplam maliyet geçersiz.');
  if (Number(results.pr) > 95) warnings.push('PR %95 üzerinde; ışınım/kayıp varsayımlarını kontrol edin.');
  if (Number(results.cf) > 30) warnings.push('Kapasite faktörü PV için olağan dışı yüksek.');
  if (results.usedFallback) warnings.push('PVGIS verisi alınamadı; fallback PSH hesabı düşük güven seviyesidir.');
  if (results.netMeteringEnabled && results.nmMetrics?.unpaidGridExport > 0) warnings.push('Üretim fazlasının bir kısmı ödeme hesabına alınmadı; ihracat sınırı uygulanıyor.');
  if (results.tariffModel?.effectiveRegime === 'sktt' && !results.tariffModel?.skttRate) warnings.push('SKTT seçili ancak SKTT birim fiyatı tanımlı değil.');
  if (results.tariffModel?.exportRate <= 0 && results.netMeteringEnabled) warnings.push('Şebeke ihracatı açık ancak ihracat birim fiyatı 0 TL/kWh.');
  if (results.netMeteringEnabled && (results.tariffModel?.exportRate || 0) > (results.tariffModel?.effectiveImportRate || results.tariffModel?.importRate || 0)) warnings.push('İhracat birim fiyatı import tarifesinden yüksek; tarife girişlerini kontrol edin.');
  if (results.tariffModel?.regulation?.warnings?.length) warnings.push(...results.tariffModel.regulation.warnings);
  if (results.tariffModel?.exportCompensationPolicy?.provisional) {
    warnings.push('Mahsuplaşma tarihi eksik; ekonomik sonuç aylık mahsuplaşma varsayımıyla ön fizibilite olarak hesaplandı.');
  }
  if (Number(results.tariffModel?.contractedPowerKw) > 0 && Number(results.systemPower) > Number(results.tariffModel.contractedPowerKw)) {
    warnings.push('Kurulu güç sözleşme gücünü aşıyor; bağlantı görüşü ve mahsuplaşma sınırları proje bazında kontrol edilmeli.');
  }
  return warnings;
}
