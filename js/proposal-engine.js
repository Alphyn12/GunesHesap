import { nonNegativeNumber, roundNumber, safeNumber } from './proposal-formatters.js';

const ANALYSIS_YEARS = 25;
const DEFAULT_VAT_RATE = 0.20;

function firstPositive(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

function sum(values = []) {
  return values.reduce((total, value) => total + nonNegativeNumber(value), 0);
}

function splitAmount(total, ratios = []) {
  const amount = nonNegativeNumber(total);
  const ratioSum = ratios.reduce((acc, value) => acc + nonNegativeNumber(value), 0) || 1;
  let used = 0;
  return ratios.map((ratio, index) => {
    if (index === ratios.length - 1) return Math.max(0, amount - used);
    const part = Math.round(amount * nonNegativeNumber(ratio) / ratioSum);
    used += part;
    return part;
  });
}

function makeCostItem({
  id,
  category = 'Ana Sistem',
  name,
  description,
  quantity = 1,
  unit = 'adet',
  subtotal = 0,
  vatRate = DEFAULT_VAT_RATE,
  currency = 'TRY',
  visibleToCustomer = true,
  note = ''
}) {
  const safeSubtotal = Math.round(nonNegativeNumber(subtotal));
  const safeQuantity = nonNegativeNumber(quantity, 1) || 1;
  const safeVatRate = Math.max(0, safeNumber(vatRate, 0));
  const vatAmount = Math.round(safeSubtotal * safeVatRate);
  return {
    id,
    category,
    name,
    description,
    quantity: roundNumber(safeQuantity, safeQuantity >= 10 ? 0 : 2),
    unit,
    unitPrice: safeQuantity > 0 ? Math.round(safeSubtotal / safeQuantity) : safeSubtotal,
    currency,
    subtotal: safeSubtotal,
    vatRate: safeVatRate,
    vatAmount,
    total: safeSubtotal + vatAmount,
    vatIncluded: false,
    visibleToCustomer,
    note
  };
}

export function calculateCostTotals(items = [], { discountTotal = 0 } = {}) {
  const visible = Array.isArray(items) ? items.filter(item => item && item.visibleToCustomer !== false) : [];
  const subtotal = sum(visible.map(item => item.subtotal));
  const vatTotal = sum(visible.map(item => item.vatAmount));
  const addonTotal = sum(visible.filter(item => item.category === 'Ek Opsiyon').map(item => item.total));
  const discount = nonNegativeNumber(discountTotal);
  return {
    subtotal: Math.round(subtotal),
    vatTotal: Math.round(vatTotal),
    addonTotal: Math.round(addonTotal),
    discountTotal: Math.round(discount),
    grandTotal: Math.max(0, Math.round(subtotal + vatTotal - discount))
  };
}

function buildCostItems(state = {}, results = {}) {
  const cb = results.costBreakdown || {};
  const systemPower = nonNegativeNumber(results.systemPower);
  const panelCount = nonNegativeNumber(results.panelCount);
  const panelVat = safeNumber(cb.panelKdvRate, cb.kdvRate || DEFAULT_VAT_RATE);
  const nonPanelVat = safeNumber(cb.nonPanelKdvRate, DEFAULT_VAT_RATE);
  const [dcCable, mc4, dcProtection] = splitAmount(cb.dcCable, [0.70, 0.10, 0.20]);
  const [acCable, acProtection] = splitAmount(cb.acElec, [0.50, 0.50]);
  const knownSubtotal = sum([
    cb.panel, cb.inverter, cb.mounting, dcCable, mc4, dcProtection,
    acCable, acProtection, cb.engineering, cb.labor, cb.logistics, cb.permits
  ]);
  const remainingOther = Math.max(0, Math.round(nonNegativeNumber(cb.subtotal) - knownSubtotal));
  const commonKwpQty = systemPower || 1;
  const items = [
    makeCostItem({
      id: 'solar-panel',
      name: 'Güneş paneli',
      description: 'Seçilen panel gücü ve panel adedine göre hesaplanan modül maliyeti',
      quantity: panelCount || 1,
      unit: 'adet',
      subtotal: cb.panel,
      vatRate: panelVat
    }),
    makeCostItem({
      id: 'inverter',
      name: 'İnverter',
      description: 'Seçilen inverter mimarisi ve sistem gücüne göre tahmini inverter maliyeti',
      quantity: commonKwpQty,
      unit: 'kW',
      subtotal: cb.inverter,
      vatRate: nonPanelVat
    }),
    makeCostItem({
      id: 'mounting',
      name: 'Montaj konstrüksiyonu',
      description: 'Çatı/zemin taşıyıcı konstrüksiyon ve bağlantı elemanları',
      quantity: commonKwpQty,
      unit: 'kWp',
      subtotal: cb.mounting,
      vatRate: nonPanelVat
    }),
    makeCostItem({
      id: 'dc-cable',
      name: 'DC kablo',
      description: 'DC kablo maliyet kovasından ayrıştırılmış tahmini kablolama payı',
      quantity: commonKwpQty,
      unit: 'kWp',
      subtotal: dcCable,
      vatRate: nonPanelVat,
      note: 'DC kablo, MC4 ve DC koruma kalemleri mevcut DC maliyet kovasından oranlanmıştır.'
    }),
    makeCostItem({
      id: 'ac-cable',
      name: 'AC kablo / pano',
      description: 'AC elektrik maliyet kovasından ayrıştırılmış kablo ve pano altyapısı',
      quantity: commonKwpQty,
      unit: 'kWp',
      subtotal: acCable,
      vatRate: nonPanelVat,
      note: 'AC kablo ve pano kalemleri mevcut AC elektrik maliyet kovasından oranlanmıştır.'
    }),
    makeCostItem({
      id: 'mc4-connectors',
      name: 'MC4 konnektör / konnektör seti',
      description: 'String bağlantıları için konnektör seti tahmini',
      quantity: panelCount || 1,
      unit: 'panel',
      subtotal: mc4,
      vatRate: nonPanelVat,
      note: 'Ayrı konnektör fiyatı yoksa DC maliyet kovasından ayrıştırılır.'
    }),
    makeCostItem({
      id: 'dc-protection',
      name: 'DC koruma / sigorta / parafudr',
      description: 'DC taraf koruma ve parafudr ekipmanı tahmini',
      quantity: commonKwpQty,
      unit: 'kWp',
      subtotal: dcProtection,
      vatRate: nonPanelVat,
      note: 'Ayrı DC koruma fiyatı yoksa DC maliyet kovasından ayrıştırılır.'
    }),
    makeCostItem({
      id: 'ac-protection',
      name: 'AC pano / koruma ekipmanı',
      description: 'AC pano, kesici ve koruma ekipmanı tahmini',
      quantity: commonKwpQty,
      unit: 'kWp',
      subtotal: acProtection,
      vatRate: nonPanelVat,
      note: 'Ayrı AC koruma fiyatı yoksa AC elektrik maliyet kovasından ayrıştırılır.'
    }),
    makeCostItem({
      id: 'engineering',
      name: 'Proje / mühendislik',
      description: 'Proje, mühendislik ve başvuru hazırlık çalışmaları',
      quantity: commonKwpQty,
      unit: 'kWp',
      subtotal: cb.engineering,
      vatRate: nonPanelVat
    }),
    makeCostItem({
      id: 'labor',
      name: 'İşçilik / montaj',
      description: 'Saha montaj ve devreye alma işçilikleri',
      quantity: commonKwpQty,
      unit: 'kWp',
      subtotal: cb.labor,
      vatRate: nonPanelVat
    }),
    makeCostItem({
      id: 'logistics',
      name: 'Nakliye / lojistik',
      description: 'Nakliye, saha sevkiyat ve lojistik giderleri',
      quantity: commonKwpQty,
      unit: 'kWp',
      subtotal: cb.logistics,
      vatRate: nonPanelVat
    }),
    makeCostItem({
      id: 'other-contingency',
      name: 'Diğer / beklenmeyen gider',
      description: remainingOther > 0
        ? 'Mevcut manuel/BOM toplamından ayrıştırılamayan kalan maliyet'
        : 'Ayrı veri yok; mevcut kalemlerin içinde kabul edildi',
      quantity: 1,
      unit: 'kalem',
      subtotal: remainingOther,
      vatRate: nonPanelVat
    })
  ];

  const permitCost = nonNegativeNumber(cb.permits);
  if (permitCost > 0) {
    items.splice(items.length - 1, 0, makeCostItem({
      id: 'permit',
      name: 'İzin / başvuru',
      description: 'Dağıtım başvuru, izin ve resmi süreç tahmini',
      quantity: 1,
      unit: 'kalem',
      subtotal: permitCost,
      vatRate: nonPanelVat
    }));
  }

  const batteryCost = nonNegativeNumber(cb.battery);
  if (state.batteryEnabled && batteryCost > 0) {
    items.push(makeCostItem({
      id: 'battery',
      category: 'Ek Opsiyon',
      name: 'Batarya sistemi',
      description: 'Seçilen batarya kapasitesi/modeline göre yatırım maliyeti',
      quantity: nonNegativeNumber(state.battery?.capacity) || 1,
      unit: state.battery?.capacity ? 'kWh' : 'adet',
      subtotal: batteryCost,
      vatRate: 0,
      note: 'Batarya fiyatında KDV ayrımı mevcut veri modelinde ayrıca gelmiyor.'
    }));
  }

  const generatorCost = nonNegativeNumber(cb.generatorCapex || cb.generator);
  if (state.scenarioKey === 'off-grid' && state.offgridGeneratorEnabled && generatorCost > 0) {
    items.push(makeCostItem({
      id: 'generator',
      category: 'Ek Opsiyon',
      name: 'Jeneratör yedek güç',
      description: 'Off-grid yedek güç yatırım maliyeti',
      quantity: 1,
      unit: 'adet',
      subtotal: generatorCost,
      vatRate: 0,
      note: 'Jeneratör KDV ayrımı mevcut veri modelinde ayrıca gelmiyor.'
    }));
  }

  const evChargerCost = firstPositive(
    state.evChargerCostTry,
    state.evChargerCost,
    state.ev?.chargerCostTry,
    state.ev?.chargerCost,
    state.ev?.evChargerCostTry
  );
  if (evChargerCost > 0) {
    items.push(makeCostItem({
      id: 'ev-charger',
      category: 'Ek Opsiyon',
      name: 'EV charger',
      description: 'Elektrikli araç şarj altyapısı yatırım maliyeti',
      quantity: 1,
      unit: 'adet',
      subtotal: evChargerCost,
      vatRate: nonPanelVat
    }));
  }

  return items;
}

function buildConsumptionAddons(state = {}, results = {}) {
  const tariff = nonNegativeNumber(results.tariffModel?.effectiveImportRate ?? ((results.tariffModel?.importRate || 0) + (results.tariffModel?.distributionFee || 0)));
  const addons = [];
  const evAnnual = nonNegativeNumber(results.evLoad?.annualKwh);
  if (state.evEnabled && evAnnual > 0) {
    addons.push({
      id: 'ev-consumption',
      name: 'Elektrikli araç',
      type: 'consumption',
      monthlyKwh: Math.round(evAnnual / 12),
      annualKwh: Math.round(evAnnual),
      annualBillImpact: Math.round(evAnnual * tariff),
      sizingImpactKwh: Math.round(evAnnual),
      note: 'Elektrikli araç kullanım senaryosu yıllık tüketim hesabına eklendi.'
    });
  }
  const heatPumpAnnual = nonNegativeNumber(results.heatPumpLoad?.annualKwh);
  if (state.heatPumpEnabled && heatPumpAnnual > 0) {
    addons.push({
      id: 'heatpump-consumption',
      name: 'Isı pompası / ısıtma-soğutma',
      type: 'consumption',
      monthlyKwh: Math.round(heatPumpAnnual / 12),
      annualKwh: Math.round(heatPumpAnnual),
      annualBillImpact: Math.round(heatPumpAnnual * tariff),
      sizingImpactKwh: Math.round(heatPumpAnnual),
      note: 'Isıtma/soğutma yükü yıllık tüketim ve boyutlandırma hesabına eklendi.'
    });
  }
  return addons;
}

function buildConsumptionAnalysis(state = {}, results = {}, consumptionItems = []) {
  const tariff = nonNegativeNumber(results.tariffModel?.effectiveImportRate ?? ((results.tariffModel?.importRate || 0) + (results.tariffModel?.distributionFee || 0)));
  const addonAnnualKwh = sum(consumptionItems.map(item => item.annualKwh));
  const addonMonthlyKwh = sum(consumptionItems.map(item => item.monthlyKwh));
  const monthlyFromState = Array.isArray(state.monthlyConsumption)
    ? sum(state.monthlyConsumption)
    : 0;
  let baseAnnualKwh = firstPositive(state.annualConsumptionKwh, monthlyFromState, nonNegativeNumber(state.dailyConsumption) * 365);
  let baseSource = baseAnnualKwh > 0 ? 'user-consumption-input' : 'missing';
  if (baseAnnualKwh <= 0 && state.onGridMonthlyBillEstimate && tariff > 0) {
    baseAnnualKwh = nonNegativeNumber(state.onGridMonthlyBillEstimate) * 12 / tariff;
    baseSource = 'estimated-from-monthly-bill';
  }
  const totalAnnualKwh = firstPositive(
    results.hourlySummary?.annualLoad,
    Array.isArray(results.monthlyLoad) ? sum(results.monthlyLoad) : 0,
    baseAnnualKwh + addonAnnualKwh
  );
  if (baseAnnualKwh <= 0 && totalAnnualKwh > addonAnnualKwh) {
    baseAnnualKwh = totalAnnualKwh - addonAnnualKwh;
    baseSource = 'derived-from-total-load-minus-addons';
  }
  const firstYearSavings = nonNegativeNumber(results.firstYearGrossSavings ?? results.annualSavings);
  const baseAnnualBill = Math.round(baseAnnualKwh * tariff);
  const totalAnnualBill = Math.round(totalAnnualKwh * tariff);
  const billAfterSolar = Math.max(0, Math.round(totalAnnualBill - firstYearSavings));
  const compensatedKwh = nonNegativeNumber(results.compensationSummary?.compensatedConsumptionKwh ?? results.nmMetrics?.selfConsumedEnergy);
  return {
    baseMonthlyKwh: Math.round(baseAnnualKwh / 12),
    baseAnnualKwh: Math.round(baseAnnualKwh),
    baseMonthlyBill: Math.round(baseAnnualBill / 12),
    baseAnnualBill,
    addonMonthlyKwh: Math.round(addonMonthlyKwh),
    addonAnnualKwh: Math.round(addonAnnualKwh),
    addonAnnualBillImpact: Math.round(addonAnnualKwh * tariff),
    totalAnnualKwh: Math.round(totalAnnualKwh),
    estimatedGridConsumptionAfterSolarKwh: Math.max(0, Math.round(totalAnnualKwh - compensatedKwh)),
    billAfterSolar,
    firstYearSavings: Math.round(firstYearSavings),
    unitRate: tariff,
    baseSource
  };
}

function buildBillProjection25Years(state = {}, results = {}, consumptionAnalysis = {}) {
  const rows = Array.isArray(results.yearlyTable) ? results.yearlyTable.slice(0, ANALYSIS_YEARS) : [];
  const baseConsumption = nonNegativeNumber(consumptionAnalysis.totalAnnualKwh);
  const loadGrowth = Math.max(0, safeNumber(state.annualLoadGrowth, 0));
  const expenseEscalation = Math.max(0, safeNumber(results.tariffModel?.expenseEscalationRate, 0));
  const annualMaintenanceBase = nonNegativeNumber(results.annualOMCost) + nonNegativeNumber(results.annualInsurance);
  const inverterLifetime = Math.round(nonNegativeNumber(results.inverterLifetime));
  const inverterReplaceCost = nonNegativeNumber(results.inverterReplaceCost);

  return rows.map(row => {
    const year = Math.max(1, Math.round(nonNegativeNumber(row.year, 1)));
    const unitRate = firstPositive(row.effectiveImportRate, row.rate, consumptionAnalysis.unitRate);
    const annualConsumptionKwh = Math.round(baseConsumption * Math.pow(1 + loadGrowth, year - 1));
    const billWithoutSolar = Math.round(annualConsumptionKwh * unitRate);
    const savings = nonNegativeNumber(row.savings);
    const billAfterSolar = Math.max(0, Math.round(billWithoutSolar - savings));
    const maintenanceCost = Math.round(annualMaintenanceBase * Math.pow(1 + expenseEscalation, year - 1));
    const inverterReplacementCost = inverterLifetime > 0 && year % inverterLifetime === 0
      ? Math.round(inverterReplaceCost * Math.pow(1 + expenseEscalation, year - 1))
      : 0;
    return {
      year,
      annualProductionKwh: Math.round(nonNegativeNumber(row.energy)),
      annualConsumptionKwh,
      unitRate,
      billWithoutSolar,
      billAfterSolar,
      annualSavings: Math.round(savings),
      maintenanceCost,
      inverterReplacementCost,
      netAnnualGain: Math.round(safeNumber(row.netCashFlow, 0)),
      cumulativeNetGain: Math.round(safeNumber(row.cumulative, 0))
    };
  });
}

function buildNetMetering(state = {}, results = {}, consumptionAnalysis = {}) {
  const enabled = !!state.netMeteringEnabled && state.scenarioKey !== 'off-grid';
  const comp = results.compensationSummary || {};
  const nm = results.nmMetrics || {};
  const production = nonNegativeNumber(results.annualEnergy);
  const consumption = nonNegativeNumber(consumptionAnalysis.totalAnnualKwh);
  const exported = enabled ? nonNegativeNumber(comp.annualPhysicalExportKwh ?? nm.annualGridExport) : 0;
  const imported = enabled ? nonNegativeNumber(results.hourlySummary?.gridImport) : 0;
  const importOffset = enabled ? nonNegativeNumber(comp.importOffsetKwh) : 0;
  const economicContribution = enabled
    ? Math.round(nonNegativeNumber(results.importOffsetValue) + nonNegativeNumber(results.exportRevenueValue))
    : 0;
  const unitValue = enabled ? firstPositive(results.tariffModel?.exportRate, results.tariffModel?.effectiveImportRate, results.tariff) : 0;
  return {
    enabled,
    annualProductionKwh: Math.round(production),
    annualConsumptionKwh: Math.round(consumption),
    selfConsumptionRate: production > 0 ? roundNumber(nonNegativeNumber(nm.selfConsumptionPct, (nonNegativeNumber(nm.selfConsumedEnergy) / production) * 100), 1) : 0,
    exportedKwh: Math.round(exported),
    importedKwh: Math.round(imported),
    netKwh: Math.round(importOffset),
    unitValue,
    annualEconomicContribution: economicContribution,
    note: enabled
      ? 'Mahsuplaşma ekonomik katkısı abone tipi, mevzuat, dağıtım şirketi uygulaması ve güncel tarife koşullarına göre değişebilir.'
      : 'Mahsuplaşma bu senaryoda aktif değildir; ek ekonomik katkı hesaplanmamıştır.'
  };
}

function buildFinancialSummary(results = {}, billProjection25Years = [], totals = {}) {
  const grossSavings25Years = sum(billProjection25Years.map(row => row.annualSavings));
  const maintenanceCost25Years = sum(billProjection25Years.map(row => row.maintenanceCost));
  const inverterReplacementCost25Years = sum(billProjection25Years.map(row => row.inverterReplacementCost));
  const investment = firstPositive(totals.grandTotal, results.totalCost);
  const breakEven = billProjection25Years.find(row => nonNegativeNumber(row.cumulativeNetGain) >= investment);
  return {
    totalInvestment: Math.round(investment),
    firstYearGrossSavings: Math.round(nonNegativeNumber(results.firstYearGrossSavings ?? results.annualSavings)),
    firstYearNetSavings: Math.round(safeNumber(results.firstYearNetCashFlow, 0)),
    paybackYears: safeNumber(results.grossSimplePaybackYear, 0),
    grossSavings25Years: Math.round(grossSavings25Years),
    maintenanceCost25Years: Math.round(maintenanceCost25Years),
    inverterReplacementCost25Years: Math.round(inverterReplacementCost25Years),
    netBenefit25Years: Math.round(safeNumber(results.nominalNetCashFlow25y ?? results.npvTotal, 0)),
    roiPercent: safeNumber(results.nominalTotalReturnPct ?? results.roi, 0),
    breakEvenYear: breakEven?.year || null
  };
}

function buildProposalScenarios(results = {}, totals = {}) {
  const basePower = nonNegativeNumber(results.systemPower);
  const basePanels = nonNegativeNumber(results.panelCount);
  const baseCost = firstPositive(totals.grandTotal, results.totalCost);
  const baseSavings = nonNegativeNumber(results.firstYearGrossSavings ?? results.annualSavings);
  const baseBenefit = safeNumber(results.nominalNetCashFlow25y ?? results.npvTotal, 0);
  const build = ({ id, name, description, sizeFactor, costFactor, savingsFactor, recommended, note }) => {
    const totalCost = baseCost > 0 ? Math.round(baseCost * costFactor) : 0;
    const firstYearSavings = baseSavings > 0 ? Math.round(baseSavings * savingsFactor) : 0;
    return {
      id,
      name,
      description,
      systemSizeKwp: basePower > 0 ? roundNumber(basePower * sizeFactor, 2) : null,
      panelCount: basePanels > 0 ? Math.max(1, Math.round(basePanels * sizeFactor)) : null,
      inverterKw: basePower > 0 ? roundNumber(basePower * sizeFactor, 1) : null,
      batteryIncluded: false,
      totalCost: totalCost || null,
      firstYearSavings: firstYearSavings || null,
      paybackYears: totalCost > 0 && firstYearSavings > 0 ? roundNumber(totalCost / firstYearSavings, 1) : null,
      netBenefit25Years: (() => {
        if (!baseBenefit || totalCost <= 0) return null;
        const benefit = Math.round(baseBenefit * savingsFactor - (totalCost - baseCost));
        return benefit > 0 ? benefit : null;
      })(),
      recommended,
      suitabilityNote: note
    };
  };
  return [
    build({
      id: 'economic',
      name: 'Ekonomik',
      description: 'En düşük yatırım maliyetine odaklı sistem',
      sizeFactor: 0.85,
      costFactor: 0.84,
      savingsFactor: 0.86,
      recommended: false,
      note: 'Bütçe hassasiyeti yüksek projeler için; üretim/tasarruf dengesi daha sınırlıdır.'
    }),
    build({
      id: 'balanced',
      name: 'Dengeli',
      description: 'Geri ödeme ve yatırım maliyeti dengelenmiş önerilen paket',
      sizeFactor: 1,
      costFactor: 1,
      savingsFactor: 1,
      recommended: true,
      note: 'Mevcut hesap sonucundan türetilen ana öneri.'
    }),
    build({
      id: 'premium',
      name: 'Premium',
      description: 'Daha yüksek kapasite ve gelişmiş ekipman seçeneği',
      sizeFactor: 1.15,
      costFactor: 1.22,
      savingsFactor: 1.08,
      recommended: false,
      note: 'Daha yüksek üretim ve ekipman kalitesi hedefleyen projeler için.'
    })
  ];
}

function buildProposalWarnings(state = {}, results = {}, proposal = {}) {
  const warnings = [];
  const push = (level, title, message) => warnings.push({ level, title, message });
  if (state.batteryEnabled) {
    push('warning', 'Batarya geri ödeme süresini artırabilir', 'Batarya dahil edildiğinde yatırım maliyeti yükseldiği için geri ödeme süresi uzayabilir.');
  }
  if (proposal.addons?.consumptionItems?.length) {
    push('info', 'Ek tüketim hesabı dahil edildi', 'EV, ısı pompası veya benzer ek yükler yıllık tüketim ve fatura projeksiyonuna eklenmiştir.');
  }
  if (state.netMeteringEnabled) {
    push('warning', 'Mahsuplaşma değeri değişebilir', 'Nihai mahsuplaşma değeri abone tipi, mevzuat, dağıtım şirketi uygulaması ve güncel tarife koşullarına göre değişebilir.');
  }
  push('info', 'Panel üretim kaybı dikkate alındı', '25 yıllık analizde yıllık panel degradasyonu ve ilk yıl üretim kaybı dikkate alınmıştır.');
  push('info', 'Ön fizibilite notu', 'Bu teklif nihai keşif, proje onayı ve dağıtım şirketi süreçlerine göre değişebilir.');
  if (proposal.costBreakdown?.legacyTotalDifferenceAbs > 100) {
    push('warning', 'Maliyet toplamı kontrol edilmeli', 'Kalem bazlı teklif toplamı ile mevcut legacy toplam maliyet arasında fark oluştu; mevcut hesaplama akışı korunmuştur.');
  }
  if (state.evEnabled && !firstPositive(state.evChargerCostTry, state.evChargerCost, state.ev?.chargerCostTry, state.ev?.chargerCost)) {
    push('info', 'EV charger ekipman fiyatı yok', 'Elektrikli araç tüketimi hesaba eklendi; EV charger ekipman maliyeti mevcut veri modelinde olmadığı için yatırım maliyetine eklenmedi.');
  }
  if (results.costBreakdown?.manualBomCompleteness === 'incomplete') {
    push('warning', 'Manuel BOM eksik', 'Tam manuel BOM seçili ancak bazı maliyet kalemleri eksik; sonuç eksik kullanıcı girdilerine göre hesaplanmıştır.');
  }
  (Array.isArray(results.calculationWarnings) ? results.calculationWarnings : []).slice(0, 4).forEach(message => {
    push('warning', 'Hesaplama uyarısı', String(message));
  });
  return warnings;
}

function buildProposalAssumptions(state = {}, results = {}, costItems = []) {
  const panel = results.authoritativeProduction || {};
  return {
    analysisYears: ANALYSIS_YEARS,
    annualElectricityIncreaseRate: safeNumber(results.annualPriceIncrease, 0),
    annualConsumptionIncreaseRate: safeNumber(state.annualLoadGrowth, 0),
    panelDegradationRate: safeNumber(panel.panelDegradationRate ?? results.panelDegradationRate ?? 0.005, 0.005),
    maintenanceRate: state.omEnabled ? safeNumber(state.omRate, 0) / 100 : 0,
    inverterReplacementYear: nonNegativeNumber(results.inverterLifetime) || 12,
    vatRate: safeNumber(results.costBreakdown?.kdvRate, DEFAULT_VAT_RATE),
    exchangeRate: safeNumber(results.usdToTry ?? state.usdToTry, 38.5),
    systemLossRate: safeNumber(results.pvgisLossParam, 0),
    costAssumptionVersion: results.costBreakdown?.costAssumptionVersion || null,
    financialAssumptionVersion: results.financialAssumptionVersion || null,
    notes: [
      'DC kablo, MC4 ve DC koruma kalemleri mevcut DC maliyet kovasından oranlanmıştır.',
      'AC kablo/pano ve AC koruma kalemleri mevcut AC elektrik maliyet kovasından oranlanmıştır.',
      ...costItems.filter(item => item.note).map(item => item.note)
    ].filter(Boolean)
  };
}

export function buildProposalResult(state = {}, results = {}) {
  const costItems = buildCostItems(state, results);
  const totals = calculateCostTotals(costItems);
  const capitalCostItems = costItems.filter(item => item.category === 'Ek Opsiyon');
  const consumptionItems = buildConsumptionAddons(state, results);
  const consumptionAnalysis = buildConsumptionAnalysis(state, results, consumptionItems);
  const billProjection25Years = buildBillProjection25Years(state, results, consumptionAnalysis);
  const financialSummary = buildFinancialSummary(results, billProjection25Years, totals);
  const netMetering = buildNetMetering(state, results, consumptionAnalysis);
  const legacyTotal = nonNegativeNumber(results.totalCost);
  const proposal = {
    meta: {
      proposalNo: state.proposalNo || `SR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      createdAt: new Date().toISOString(),
      validUntil: null,
      currency: 'TRY',
      locale: 'tr-TR'
    },
    customer: {
      name: state.customerName || null,
      phone: state.customerPhone || null,
      email: state.customerEmail || null,
      location: state.cityName || null
    },
    company: {
      name: state.companyName || 'Solar Rota',
      logoUrl: null,
      phone: null,
      email: null,
      address: null
    },
    summary: {
      systemSizeKwp: results.systemPower ?? null,
      panelCount: results.panelCount ?? null,
      inverterKw: firstPositive(results.offgridL2Results?.inverterAcLimitKw, state.inverterAcKw, results.systemPower) || null,
      annualProductionKwh: results.annualEnergy ?? null,
      monthlyAverageProductionKwh: results.annualEnergy ? Math.round(results.annualEnergy / 12) : null,
      totalInvestment: totals.grandTotal || legacyTotal || null,
      totalInvestmentLegacy: legacyTotal || null,
      firstYearSavings: results.firstYearGrossSavings ?? results.annualSavings ?? null,
      paybackYears: results.grossSimplePaybackYear ?? null,
      netBenefit25Years: financialSummary.netBenefit25Years,
      co2ReductionTonPerYear: results.co2Savings ?? null,
      co2ReductionTon25Years: results.co2Savings ? roundNumber(safeNumber(results.co2Savings) * ANALYSIS_YEARS, 2) : null
    },
    costBreakdown: {
      items: costItems,
      ...totals,
      legacyTotal,
      legacyTotalDifference: Math.round((totals.grandTotal || 0) - legacyTotal),
      legacyTotalDifferenceAbs: Math.abs(Math.round((totals.grandTotal || 0) - legacyTotal))
    },
    addons: {
      capitalCostItems,
      consumptionItems
    },
    consumptionAnalysis,
    productionProjection: [],
    billProjection25Years,
    netMetering,
    financialSummary,
    scenarios: buildProposalScenarios(results, totals),
    warnings: [],
    assumptions: {}
  };
  proposal.assumptions = buildProposalAssumptions(state, results, costItems);
  proposal.warnings = buildProposalWarnings(state, results, proposal);
  return proposal;
}
