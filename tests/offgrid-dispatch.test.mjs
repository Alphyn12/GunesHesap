// ═══════════════════════════════════════════════════════════
// OFFGRID DISPATCH TESTS — Solar Rota Off-Grid Level 2
// ═══════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOffgridLoadProfile,
  buildOffgridPvDispatchProfile,
  buildOffgridAccuracyAssessment,
  buildOffgridFieldModelMaturityGate,
  evaluateOffgridFieldGuaranteeReadiness,
  runOffgridDispatch,
  runOffgridStressScenarios,
  runBadWeatherScenario,
  buildOffgridResults,
  BAD_WEATHER_PV_FACTORS,
  OFFGRID_DISPATCH_VERSION,
  OFFGRID_STRESS_SCENARIOS,
  DEVICE_LOAD_TEMPLATES
} from '../js/offgrid-dispatch.js';

// Yaklaşık eşitlik yardımcısı
function nearly(actual, expected, tol = 0.5, msg = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tol, `${msg || 'nearly'}: expected ${expected} ± ${tol}, got ${actual} (diff=${diff.toFixed(4)})`);
}

// ── Sabit test yardımcıları ──────────────────────────────────────────────────

function makeFlatPvHourly(annualKwh) {
  // Düz PV üretimi — tüm saatlerde eşit
  const hourly = new Array(8760).fill(annualKwh / 8760);
  return hourly;
}

function makeLoadHourly(dailyKwh) {
  // Düz yük profili
  return new Array(8760).fill(dailyKwh / 24);
}

function makeDaytimePvHourly(dailyKwh) {
  // PV sadece 08-17 saatleri arası (10 saat/gün)
  const hourlys = [];
  for (let d = 0; d < 365; d++) {
    for (let h = 0; h < 24; h++) {
      hourlys.push(h >= 8 && h < 18 ? (dailyKwh / 10) : 0);
    }
  }
  return hourlys;
}

const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

function monthlyTotals(hourly8760) {
  const monthly = [];
  let cursor = 0;
  for (const days of MONTH_DAYS) {
    const hours = days * 24;
    monthly.push(hourly8760.slice(cursor, cursor + hours).reduce((sum, value) => sum + value, 0));
    cursor += hours;
  }
  return monthly;
}

function dailyTotals(hourly8760) {
  return Array.from({ length: 365 }, (_, day) => {
    const start = day * 24;
    return hourly8760.slice(start, start + 24).reduce((sum, value) => sum + value, 0);
  });
}

const DEFAULT_BATTERY = {
  usableCapacityKwh: 10,
  efficiency: 0.92,
  socReserveKwh: 1.0,
  initialSocKwh: 1.0
};

const NO_GENERATOR = { enabled: false, capacityKw: 0, fuelCostPerKwh: 0 };
const WITH_GENERATOR = { enabled: true, capacityKw: 5, fuelCostPerKwh: 8 };

// ── 1. buildOffgridLoadProfile: Basit Mod ───────────────────────────────────
describe('buildOffgridLoadProfile — simple fallback', () => {
  it('boş cihaz listesiyle basit moda geçer', () => {
    const result = buildOffgridLoadProfile([], { fallbackDailyKwh: 10, criticalFraction: 0.5 });
    assert.equal(result.mode, 'simple-fallback');
    assert.equal(result.totalHourly8760.length, 8760);
    assert.equal(result.criticalHourly8760.length, 8760);
  });

  it('toplam yıllık kWh doğru', () => {
    const result = buildOffgridLoadProfile([], { fallbackDailyKwh: 12, criticalFraction: 0.6 });
    nearly(result.annualTotalKwh, 12 * 365, 1, 'annualTotalKwh');
  });

  it('kritik oranı doğru uygulanır', () => {
    const result = buildOffgridLoadProfile([], { fallbackDailyKwh: 10, criticalFraction: 0.4 });
    nearly(result.annualCriticalKwh, result.annualTotalKwh * 0.4, 0.5, 'criticalFraction');
  });

  it('saatlik toplamlar yıllık toplamla eşleşir', () => {
    const result = buildOffgridLoadProfile([], { fallbackDailyKwh: 8, criticalFraction: 0.7 });
    const sumTotal = result.totalHourly8760.reduce((a, b) => a + b, 0);
    const sumCritical = result.criticalHourly8760.reduce((a, b) => a + b, 0);
    nearly(sumTotal, result.annualTotalKwh, 0.1, 'hourly total sum');
    nearly(sumCritical, result.annualCriticalKwh, 0.1, 'hourly critical sum');
  });

  it('kritik her saat <= toplam yük', () => {
    const result = buildOffgridLoadProfile([], { fallbackDailyKwh: 10, criticalFraction: 0.6 });
    for (let i = 0; i < 8760; i++) {
      assert.ok(result.criticalHourly8760[i] <= result.totalHourly8760[i] + 1e-9,
        `saat ${i}: critical > total`);
    }
  });
});

// ── 2. buildOffgridLoadProfile: Cihaz Listesi Modu ──────────────────────────
describe('buildOffgridLoadProfile — device list', () => {
  it('cihaz listesi modunu seçer', () => {
    const devices = [{ name: 'Buzdolabı', category: 'refrigerator', powerW: 150, hoursPerDay: 8, isCritical: true }];
    const result = buildOffgridLoadProfile(devices, {});
    assert.equal(result.mode, 'device-list');
  });

  it('cihaz günlük kWh math doğruluğu', () => {
    const devices = [{ name: 'Pompa', category: 'pump', powerW: 1000, hoursPerDay: 4, isCritical: false }];
    // 1kW × 4h = 4 kWh/gün → 365 × 4 = 1460 kWh/yıl
    const result = buildOffgridLoadProfile(devices, {});
    nearly(result.annualTotalKwh, 4 * 365, 5, 'pump annual kWh');
  });

  it('kritik cihaz kritik profile girer', () => {
    const devices = [
      { name: 'Kritik', category: 'generic', powerW: 200, hoursPerDay: 6, isCritical: true },
      { name: 'Normal', category: 'generic', powerW: 200, hoursPerDay: 6, isCritical: false }
    ];
    const result = buildOffgridLoadProfile(devices, {});
    // Kritik kWh toplam kWh'ın yaklaşık yarısı olmalı
    nearly(result.annualCriticalKwh, result.annualTotalKwh / 2, 10, 'critical vs total');
  });

  it('kritik asla toplam yükten büyük olamaz', () => {
    const devices = [
      { name: 'A', category: 'lighting', powerW: 100, hoursPerDay: 8, isCritical: true },
      { name: 'B', category: 'pump', powerW: 500, hoursPerDay: 4, isCritical: false }
    ];
    const result = buildOffgridLoadProfile(devices, {});
    for (let i = 0; i < 8760; i++) {
      assert.ok(result.criticalHourly8760[i] <= result.totalHourly8760[i] + 1e-9,
        `saat ${i}: critical > total`);
    }
  });

  it('deviceSummary alanları doğru', () => {
    const devices = [{ name: 'Lamba', category: 'lighting', powerW: 60, hoursPerDay: 5, isCritical: true }];
    const result = buildOffgridLoadProfile(devices, {});
    assert.equal(result.deviceSummary.length, 1);
    assert.equal(result.deviceSummary[0].name, 'Lamba');
    assert.ok(result.deviceSummary[0].isCritical);
    nearly(result.deviceSummary[0].dailyKwh, 0.3, 0.01);
  });
});

// ── 2b. buildOffgridLoadProfile: gerçek 8760 önceliği ──────────────────────
describe('buildOffgridLoadProfile — real 8760 source priority', () => {
  it('gerçek 8760 yük varsa cihaz listesiyle karıştırmadan onu kullanır', () => {
    const hourly = Array.from({ length: 8760 }, (_, i) => (i % 24 >= 18 ? 1.2 : 0.3));
    const devices = [{ name: 'Pompa', category: 'pump', powerW: 2000, hoursPerDay: 6, isCritical: false }];
    const result = buildOffgridLoadProfile(devices, {
      hourlyLoad8760: hourly,
      hourlyLoadSource: 'hourly-uploaded',
      criticalFraction: 0.4
    });
    assert.equal(result.mode, 'hourly-8760');
    assert.equal(result.loadSource, 'hourly-uploaded');
    assert.equal(result.deviceCount, 1, 'cihazlar inventory olarak korunmalı');
    nearly(result.annualTotalKwh, hourly.reduce((a, b) => a + b, 0), 0.01, 'real 8760 sum');
    nearly(result.annualCriticalKwh, result.annualTotalKwh * 0.4, 0.01, 'critical fallback fraction');
  });

  it('sıfır 8760 yük serisini gerçek saha yükü saymaz', () => {
    const devices = [{ name: 'Pompa', category: 'pump', powerW: 2000, hoursPerDay: 6, isCritical: false }];
    const result = buildOffgridLoadProfile(devices, {
      hourlyLoad8760: new Array(8760).fill(0),
      criticalHourly8760: new Array(8760).fill(0),
      hourlyLoadSource: 'hourly-uploaded',
      criticalFraction: 0.4
    });
    assert.notEqual(result.mode, 'hourly-8760');
    assert.equal(result.hasRealHourlyLoad, false);
    assert.notEqual(result.criticalLoadBasis, 'real-hourly-critical-load');
  });
});

describe('buildOffgridPvDispatchProfile — üretim source-of-truth', () => {
  it('gerçek 8760 PV üretimini sentetik fallback yerine kullanır', () => {
    const realPv = makeLoadHourly(24);
    const fallbackRows = makeLoadHourly(1).map(production => ({ production }));
    const result = buildOffgridPvDispatchProfile({
      realHourlyPv8760: realPv,
      fallbackHourlyRows: fallbackRows,
      source: 'field-meter-pv'
    });

    assert.equal(result.hasRealHourlyProduction, true);
    assert.equal(result.productionDispatchProfile, 'real-hourly-pv-8760');
    assert.equal(result.productionSeriesSource, 'field-meter-pv');
    nearly(result.annualKwh, 24 * 365, 0.01, 'real pv annual');
  });

  it('gerçek PV yoksa aylık üretimden türetilmiş sentetik 8760 olarak işaretler', () => {
    const fallbackRows = makeLoadHourly(12).map(production => ({ production }));
    const result = buildOffgridPvDispatchProfile({ fallbackHourlyRows: fallbackRows });

    assert.equal(result.hasRealHourlyProduction, false);
    assert.equal(result.synthetic, true);
    assert.equal(result.productionDispatchProfile, 'monthly-production-derived-synthetic-8760');
    nearly(result.annualKwh, 12 * 365, 0.01, 'fallback pv annual');
  });

  it('sıfır 8760 PV serisini gerçek üretim kanıtı saymaz', () => {
    const fallbackRows = makeLoadHourly(12).map(production => ({ production }));
    const result = buildOffgridPvDispatchProfile({
      realHourlyPv8760: new Array(8760).fill(0),
      fallbackHourlyRows: fallbackRows
    });

    assert.equal(result.hasRealHourlyProduction, false);
    assert.equal(result.productionDispatchProfile, 'monthly-production-derived-synthetic-8760');
  });

  it('sentetik fallback PV aylık toplamı koruyup günler arası kümeli oynaklık üretir', () => {
    const fallbackHourly = makeLoadHourly(12);
    const result = buildOffgridPvDispatchProfile({
      fallbackHourlyRows: fallbackHourly.map(production => ({ production }))
    });

    const sourceMonthly = monthlyTotals(fallbackHourly);
    const clusteredMonthly = monthlyTotals(result.pvHourly8760);
    sourceMonthly.forEach((value, idx) => nearly(clusteredMonthly[idx], value, 0.5, `month ${idx + 1} total preserved`));

    const daily = dailyTotals(result.pvHourly8760);
    assert.ok(Math.min(...daily) < (Math.max(...daily) * 0.2), 'daily PV variability yeterince sert değil');
    assert.equal(result.syntheticWeatherModel, 'clustered-seasonal-regime-v1');
    assert.ok((result.syntheticWeatherMetadata?.longestLowPvClusterDays || 0) >= 2, 'low PV cluster bekleniyor');
  });

  it('sentetik PV sıcaklık şekillendirmesi sıcak şehirde yaz öğle pikini bastırır ama yıllık enerjiyi korur', () => {
    const fallbackHourly = makeLoadHourly(12);
    const hot = buildOffgridPvDispatchProfile({
      fallbackHourlyRows: fallbackHourly.map(production => ({ production })),
      cityName: 'Antalya',
      panelTempCoeffPerC: -0.0034
    });
    const cool = buildOffgridPvDispatchProfile({
      fallbackHourlyRows: fallbackHourly.map(production => ({ production })),
      cityName: 'Erzurum',
      panelTempCoeffPerC: -0.0034
    });

    nearly(hot.annualKwh, cool.annualKwh, 0.01, 'temperature shaping annual energy preservation');
    assert.equal(hot.syntheticWeatherMetadata?.syntheticTemperatureModel, 'city-seasonal-cell-derate-v1');
    assert.ok((hot.syntheticWeatherMetadata?.peakSummerNoonTempFactor || 1) < (cool.syntheticWeatherMetadata?.peakSummerNoonTempFactor || 1),
      'sıcak şehirde öğle temperature factor daha düşük olmalı');
    assert.ok((hot.syntheticWeatherMetadata?.peakSummerCellTempC || 0) > (cool.syntheticWeatherMetadata?.peakSummerCellTempC || 0),
      'sıcak şehirde hücre sıcaklığı daha yüksek olmalı');
  });
});

describe('buildOffgridResults — field-driven design corrections', () => {
  it('saha piki ve inverter olayları varsa tasarım düzeltmesi üretir', () => {
    const fieldImportSummary = {
      highResolutionLoad: {
        sampleCount: 1440,
        observedPeakKw: 7.8,
        p95Kw: 4.6,
        intervalMinutes: 1,
        durationDays: 1
      },
      inverterEventLog: {
        eventCount: 3,
        tripCount: 1,
        overloadCount: 2
      }
    };
    const devices = [
      { name: 'Pompa', category: 'pump', powerW: 1200, hoursPerDay: 2.5, isCritical: true, usageType: 'scheduled' },
      { name: 'Kettle', category: 'kitchen', powerW: 2200, hoursPerDay: 0.4, isCritical: false, usageType: 'manual' },
      { name: 'Washer', category: 'laundry', powerW: 1800, hoursPerDay: 1.0, isCritical: false, usageType: 'cyclic' }
    ];
    const loadProfile = buildOffgridLoadProfile(devices, { fieldImportSummary });
    const dispatch = runOffgridDispatch(
      makeDaytimePvHourly(10),
      loadProfile.totalHourly8760,
      loadProfile.criticalHourly8760,
      {
        usableCapacityKwh: 10,
        efficiency: 0.92,
        socReserveKwh: 1,
        initialSocKwh: 4,
        maxChargePowerKw: 3,
        maxDischargePowerKw: 3
      },
      NO_GENERATOR,
      {
        loadPeakKw8760: loadProfile.hourlyPeakKw8760,
        criticalPeakKw8760: loadProfile.criticalPeakKw8760,
        inverterAcLimitKw: 3.5,
        inverterSurgeMultiplier: 1.2
      }
    );
    const result = buildOffgridResults(
      dispatch,
      null,
      loadProfile,
      NO_GENERATOR,
      { fieldImportSummary }
    );

    assert.ok(result.designCorrections, 'design corrections bekleniyor');
    assert.equal(result.designCorrections.fieldCalibrationApplied, true);
    assert.equal(result.designCorrections.severity, 'high');
    assert.ok(result.designCorrections.reasons.includes('inverter-trip-events'));
    assert.ok(result.designCorrections.recommended.inverterAcKw > result.designCorrections.current.inverterAcKw);
    assert.ok(result.designCorrections.recommended.inverterSurgeMultiplier >= result.designCorrections.current.inverterSurgeMultiplier);
    assert.ok(result.designCorrections.recommended.batteryMaxDischargeKw >= result.designCorrections.current.batteryMaxDischargeKw);
  });
});

describe('evaluateOffgridFieldGuaranteeReadiness — Faz 1 gate', () => {
  it('sentetik üretim ve sentetik yük ile saha garantisini kapalı tutar', () => {
    const productionProfile = buildOffgridPvDispatchProfile({
      fallbackHourlyRows: makeLoadHourly(8).map(production => ({ production }))
    });
    const loadProfile = buildOffgridLoadProfile([], { fallbackDailyKwh: 8, criticalFraction: 0.5 });
    const readiness = evaluateOffgridFieldGuaranteeReadiness({
      productionProfile,
      loadProfile,
      battery: { maxChargePowerKw: 5, maxDischargePowerKw: 5 },
      dispatchOptions: { inverterAcLimitKw: 5 }
    });

    assert.equal(readiness.phase1Ready, false);
    assert.equal(readiness.fieldGuaranteeReady, false);
    assert.ok(readiness.blockers.length >= 2);
  });

  it('gerçek PV, gerçek yük ve gerçek kritik yük varsa Faz 1 input-ready olur ama garanti vermez', () => {
    const productionProfile = buildOffgridPvDispatchProfile({ realHourlyPv8760: makeLoadHourly(10) });
    const total = makeLoadHourly(8);
    const critical = makeLoadHourly(3);
    const loadProfile = buildOffgridLoadProfile([], {
      hourlyLoad8760: total,
      criticalHourly8760: critical,
      hourlyLoadSource: 'field-meter-load'
    });
    const readiness = evaluateOffgridFieldGuaranteeReadiness({
      productionProfile,
      loadProfile,
      battery: { maxChargePowerKw: 5, maxDischargePowerKw: 5 },
      dispatchOptions: { inverterAcLimitKw: 5 }
    });

    assert.equal(readiness.phase1Ready, true);
    assert.equal(readiness.status, 'phase-1-input-ready');
    assert.equal(readiness.fieldGuaranteeReady, false);
  });

  it('tam uzunlukta ama sıfır 8760 serileri Faz 1 input-ready yapmaz', () => {
    const zeros = new Array(8760).fill(0);
    const productionProfile = buildOffgridPvDispatchProfile({ realHourlyPv8760: zeros });
    const loadProfile = buildOffgridLoadProfile([], {
      hourlyLoad8760: zeros,
      criticalHourly8760: zeros,
      fallbackDailyKwh: 8,
      criticalFraction: 0.5
    });
    const readiness = evaluateOffgridFieldGuaranteeReadiness({
      productionProfile,
      loadProfile,
      battery: { maxChargePowerKw: 5, maxDischargePowerKw: 5 },
      dispatchOptions: { inverterAcLimitKw: 5 }
    });

    assert.equal(productionProfile.hasRealHourlyProduction, false);
    assert.equal(loadProfile.hasRealHourlyLoad, false);
    assert.equal(readiness.phase1Ready, false);
    assert.ok(readiness.blockers.some(item => item.includes('anlamlı 8760')));
  });
});

// ── 3. runOffgridDispatch: SOC / Rezerv Davranışı ───────────────────────────
describe('runOffgridDispatch — SOC ve rezerv', () => {
  it('SOC hiçbir zaman rezerv altına düşmez', () => {
    const pv = makeLoadHourly(0); // PV yok
    const load = makeLoadHourly(10); // Sürekli yük
    const critical = makeLoadHourly(5);
    const result = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    for (const h of result.hourly8760) {
      assert.ok(h.soc >= DEFAULT_BATTERY.socReserveKwh - 1e-6,
        `SOC ${h.soc} < reserve ${DEFAULT_BATTERY.socReserveKwh}`);
    }
  });

  it('PV fazlası bataryayı doldurur, dolu batarya PV kırpar', () => {
    const smallBattery = { usableCapacityKwh: 5, efficiency: 1.0, socReserveKwh: 0.5, initialSocKwh: 4.5 };
    const pv = makeLoadHourly(50); // Çok fazla PV
    const load = makeLoadHourly(5);
    const critical = makeLoadHourly(2);
    const result = runOffgridDispatch(pv, load, critical, smallBattery, NO_GENERATOR, {});
    // Kesilen PV > 0 olmalı
    assert.ok(result.curtailedPvKwh > 0, 'curtailed PV > 0 bekleniyor');
  });

  it('PV yok, büyük batarya — unmet az olmalı', () => {
    const largeBattery = { usableCapacityKwh: 10000, efficiency: 0.95, socReserveKwh: 0, initialSocKwh: 9000 };
    const pv = makeLoadHourly(0);
    const load = makeLoadHourly(5);
    const critical = makeLoadHourly(2);
    const result = runOffgridDispatch(pv, load, critical, largeBattery, NO_GENERATOR, {});
    // Büyük batarya ile unmet çok küçük olmalı
    assert.ok(result.totalLoadCoverage > 0.9, 'büyük batarya ile yüksek kapsama bekleniyor');
  });
});

// ── 3b. runOffgridDispatch: batarya ve inverter güç limitleri ───────────────
describe('runOffgridDispatch — battery and inverter power limits', () => {
  it('kWh yeterli olsa bile maxDischargePowerKw unmet load üretir', () => {
    const largeBattery = { usableCapacityKwh: 20000, efficiency: 1.0, socReserveKwh: 0, initialSocKwh: 20000, maxDischargePowerKw: 0.5 };
    const unlimitedBattery = { ...largeBattery, maxDischargePowerKw: 10 };
    const pv = makeLoadHourly(0);
    const load = makeLoadHourly(48); // 2 kWh/h
    const critical = makeLoadHourly(24);
    const limited = runOffgridDispatch(pv, load, critical, largeBattery, NO_GENERATOR, {});
    const unlimited = runOffgridDispatch(pv, load, critical, unlimitedBattery, NO_GENERATOR, {});
    assert.ok(limited.unmetLoadKwh > unlimited.unmetLoadKwh, 'deşarj kW limiti unmet load artırmalı');
    assert.ok(limited.batteryDischargeLimitedKwh > 0, 'deşarj kW limit metriği dolmalı');
  });

  it('maxChargePowerKw PV kırpılmasını artırır', () => {
    const batterySlow = { usableCapacityKwh: 20, efficiency: 1.0, socReserveKwh: 0, initialSocKwh: 0, maxChargePowerKw: 0.2 };
    const batteryFast = { ...batterySlow, maxChargePowerKw: 20 };
    const pv = makeDaytimePvHourly(40);
    const load = makeLoadHourly(2);
    const critical = makeLoadHourly(1);
    const slow = runOffgridDispatch(pv, load, critical, batterySlow, NO_GENERATOR, {});
    const fast = runOffgridDispatch(pv, load, critical, batteryFast, NO_GENERATOR, {});
    assert.ok(slow.batteryChargeLimitedKwh > fast.batteryChargeLimitedKwh, 'şarj kW limiti charge-limited enerjiyi artırmalı');
    assert.ok(slow.batteryChargeLimitedKwh > 0, 'şarj kW limit metriği dolmalı');
  });

  it('inverter AC limiti enerji yeterliyken bile kapsama düşürür', () => {
    const battery = { usableCapacityKwh: 1000, efficiency: 1.0, socReserveKwh: 0, initialSocKwh: 1000, maxDischargePowerKw: 20 };
    const pv = makeLoadHourly(240); // 10 kWh/h
    const load = makeLoadHourly(240);
    const critical = makeLoadHourly(120);
    const limited = runOffgridDispatch(pv, load, critical, battery, NO_GENERATOR, { inverterAcLimitKw: 2, inverterSurgeMultiplier: 1 });
    const unlimited = runOffgridDispatch(pv, load, critical, battery, NO_GENERATOR, {});
    assert.ok(limited.totalLoadCoverage < unlimited.totalLoadCoverage, 'inverter limiti kapsamayı düşürmeli');
    assert.ok(limited.inverterPowerLimitedLoadKwh > 0, 'inverter limit metriği dolmalı');
  });

  it('sentetik cihaz peak envelope inverter limitini daha erken tetikleyebilir', () => {
    const devices = [
      { name: 'Kettle', category: 'kitchen', powerW: 2000, hoursPerDay: 0.2, isCritical: false, usageType: 'manual' },
      { name: 'Çamaşır', category: 'laundry', powerW: 1800, hoursPerDay: 1.5, isCritical: false, usageType: 'cyclic' }
    ];
    const profile = buildOffgridLoadProfile(devices, {});
    const annualLoad = profile.annualTotalKwh;
    const pvHourly = new Array(8760).fill(annualLoad / 8760);
    const battery = { usableCapacityKwh: 500, efficiency: 1, socReserveKwh: 0, initialSocKwh: 500, maxDischargePowerKw: 10, maxChargePowerKw: 10 };
    const result = runOffgridDispatch(
      pvHourly,
      profile.totalHourly8760,
      profile.criticalHourly8760,
      battery,
      NO_GENERATOR,
      {
        loadPeakKw8760: profile.hourlyPeakKw8760,
        criticalPeakKw8760: profile.criticalPeakKw8760,
        inverterAcLimitKw: 3.5,
        inverterSurgeMultiplier: 1
      }
    );
    assert.ok(result.inverterPowerLimitedLoadKwh > 0, 'sentetik peak envelope inverter limitini tetiklemeli');
  });

  it('jeneratör dahil kapsama PV+BESS kapsamasından ayrı raporlanır', () => {
    const tinyBattery = { usableCapacityKwh: 1, efficiency: 0.9, socReserveKwh: 0.1, initialSocKwh: 1, maxDischargePowerKw: 1 };
    const pv = makeLoadHourly(1);
    const load = makeLoadHourly(10);
    const critical = makeLoadHourly(5);
    const result = runOffgridDispatch(pv, load, critical, tinyBattery, WITH_GENERATOR, {});
    assert.ok(result.totalLoadCoverage > result.solarBatteryLoadCoverage, 'jeneratör dahil kapsama ayrı artmalı');
    assert.ok(result.criticalLoadCoverage >= result.solarBatteryCriticalCoverage, 'kritik kapsamada jeneratör katkısı ayrı görünmeli');
  });
});

// ── 4. runOffgridDispatch: Kritik Yük Önceliği ──────────────────────────────
describe('runOffgridDispatch — kritik yük önceliği', () => {
  it('küçük batarya ile kritik kapsama > toplam kapsama', () => {
    const smallBattery = { usableCapacityKwh: 2, efficiency: 0.95, socReserveKwh: 0.2, initialSocKwh: 2 };
    const pv = makeDaytimePvHourly(5);    // Gündüz PV
    const load = makeLoadHourly(15);       // Gece dahil sürekli yük
    const critical = makeLoadHourly(3);   // Kritik = az

    const result = runOffgridDispatch(pv, load, critical, smallBattery, NO_GENERATOR, {});
    // Kritik kapsama >= toplam kapsama (kısıt varken kritik önce karşılanır)
    assert.ok(result.criticalLoadCoverage >= result.totalLoadCoverage - 1e-6,
      `critical ${result.criticalLoadCoverage.toFixed(3)} >= total ${result.totalLoadCoverage.toFixed(3)}`);
  });

  it('sıfır kritik yük ile unmetCritical = 0', () => {
    const pv = makeLoadHourly(5);
    const load = makeLoadHourly(10);
    const critical = new Array(8760).fill(0); // Kritik yük yok
    const result = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    assert.equal(result.unmetCriticalLoadKwh, 0);
    assert.equal(result.criticalLoadCoverage, 1);
  });

  it('kritik yük girdisi toplam yükten büyükse kapsama paydasını saatlik clamp ile hesaplar', () => {
    const pv = makeFlatPvHourly(8760 * 2);
    const load = makeLoadHourly(1);
    const impossibleCritical = makeLoadHourly(3);
    const result = runOffgridDispatch(pv, load, impossibleCritical, DEFAULT_BATTERY, NO_GENERATOR, {});
    assert.equal(result.hourly8760[0].criticalKwh, load[0]);
    assert.equal(result.unmetCriticalLoadKwh, 0);
    assert.equal(result.criticalLoadCoverage, 1);
  });
});

// ── 5. runOffgridDispatch: Unmet Load Birikmesi ──────────────────────────────
describe('runOffgridDispatch — unmet load', () => {
  it('PV ve batarya yetersizse unmet load oluşur', () => {
    const tinyBattery = { usableCapacityKwh: 0.5, efficiency: 0.9, socReserveKwh: 0.05, initialSocKwh: 0.5 };
    const pv = makeLoadHourly(1);   // Az PV
    const load = makeLoadHourly(20); // Çok yük
    const critical = makeLoadHourly(10);
    const result = runOffgridDispatch(pv, load, critical, tinyBattery, NO_GENERATOR, {});
    assert.ok(result.unmetLoadKwh > 0, 'unmet load > 0 bekleniyor');
    assert.ok(result.totalLoadCoverage < 1, 'kapsama < 1 bekleniyor');
  });

  it('yeterli PV ile unmet = 0 ve kapsama = 1', () => {
    const pv = makeLoadHourly(50); // Çok fazla PV
    const load = makeLoadHourly(5);
    const critical = makeLoadHourly(2);
    const result = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    nearly(result.unmetLoadKwh, 0, 0.01, 'unmet = 0');
    nearly(result.totalLoadCoverage, 1, 0.001, 'kapsama = 1');
  });
});

// ── 6. runOffgridDispatch: Jeneratör Desteği ────────────────────────────────
describe('runOffgridDispatch — jeneratör', () => {
  it('jeneratör ile unmet load azalır', () => {
    const tinyBattery = { usableCapacityKwh: 1, efficiency: 0.9, socReserveKwh: 0.1, initialSocKwh: 1 };
    const pv = makeLoadHourly(2);
    const load = makeLoadHourly(15);
    const critical = makeLoadHourly(7);

    const withoutGen = runOffgridDispatch(pv, load, critical, tinyBattery, NO_GENERATOR, {});
    const withGen = runOffgridDispatch(pv, load, critical, tinyBattery, WITH_GENERATOR, {});

    assert.ok(withGen.unmetLoadKwh < withoutGen.unmetLoadKwh,
      'jeneratör ile unmet < jeneratörsüz unmet');
    assert.ok(withGen.generatorToLoadKwh > 0, 'jeneratör enerji üretmeli');
    assert.ok(withGen.generatorRunHours > 0, 'jeneratör çalışma saati > 0');
    assert.ok(withGen.generatorFuelCostAnnual > 0, 'yakıt maliyeti > 0');
  });

  it('jeneratör devre dışıyken generatorToLoadKwh = 0', () => {
    const pv = makeLoadHourly(5);
    const load = makeLoadHourly(10);
    const critical = makeLoadHourly(5);
    const result = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    assert.equal(result.generatorToLoadKwh, 0);
    assert.equal(result.generatorRunHours, 0);
    assert.equal(result.generatorFuelCostAnnual, 0);
  });

  it('yakıt maliyeti = çalışma kWh × birim maliyet', () => {
    const pv = makeLoadHourly(2);
    const load = makeLoadHourly(10);
    const critical = makeLoadHourly(5);
    const tinyBat = { usableCapacityKwh: 1, efficiency: 0.9, socReserveKwh: 0.1, initialSocKwh: 1 };
    const gen = { enabled: true, capacityKw: 3, fuelCostPerKwh: 10 };
    const result = runOffgridDispatch(pv, load, critical, tinyBat, gen, {});
    const expected = result.generatorToLoadKwh * 10;
    nearly(result.generatorFuelCostAnnual, expected, 0.01, 'fuel cost math');
  });

  it('jeneratör PV+BESS otonom gün sayısını şişirmez', () => {
    const tinyBat = { usableCapacityKwh: 1, efficiency: 0.9, socReserveKwh: 0.1, initialSocKwh: 0.1 };
    const pv = makeLoadHourly(0);
    const load = makeLoadHourly(10);
    const critical = makeLoadHourly(5);
    const gen = { enabled: true, capacityKw: 20, fuelCostPerKwh: 8 };

    const withoutGen = runOffgridDispatch(pv, load, critical, tinyBat, NO_GENERATOR, {});
    const withGen = runOffgridDispatch(pv, load, critical, tinyBat, gen, { generatorStrategy: 'full-backup' });

    assert.equal(withGen.autonomousDays, withoutGen.autonomousDays,
      'PV+BESS otonom gün jeneratörden etkilenmemeli');
    assert.ok(withGen.autonomousDaysWithGenerator > withGen.autonomousDays,
      'jeneratör dahil kapsama ayrı metrikte artmalı');
    assert.equal(withGen.autonomousDaysWithGenerator, 365,
      'yeterli jeneratör final unmet yükü kapatmalı');
  });

  it('günlük jeneratör saat limitini uygular', () => {
    const noBattery = {
      usableCapacityKwh: 0,
      efficiency: 1.0,
      socReserveKwh: 0,
      initialSocKwh: 0,
      maxChargePowerKw: 0,
      maxDischargePowerKw: 0
    };
    const pv = makeLoadHourly(0);
    const load = makeLoadHourly(24); // 1 kWh/h
    const critical = makeLoadHourly(24);
    const gen = { enabled: true, capacityKw: 1, fuelCostPerKwh: 5 };
    const result = runOffgridDispatch(pv, load, critical, noBattery, gen, { generatorMaxHoursPerDay: 4 });

    nearly(result.generatorRunHours, 4 * 365, 0.01, 'generatorRunHours daily cap');
    nearly(result.generatorToLoadKwh, 4 * 365, 0.01, 'generator kWh daily cap');
    assert.ok(result.unmetLoadKwh > 0, 'günlük limit unmet load üretmeli');
  });

  it('generatorStartSocPct eşiği yükseldikçe jeneratör daha erken devreye girer', () => {
    const constrainedBattery = {
      usableCapacityKwh: 20,
      efficiency: 1.0,
      socReserveKwh: 0,
      initialSocKwh: 20,
      maxChargePowerKw: 0,
      maxDischargePowerKw: 1
    };
    const pv = makeLoadHourly(0);
    const load = makeLoadHourly(48); // 2 kWh/h
    const critical = makeLoadHourly(48);
    const gen = { enabled: true, capacityKw: 2, fuelCostPerKwh: 5 };

    const lowThreshold = runOffgridDispatch(pv, load, critical, constrainedBattery, gen, { generatorStartSocPct: 0 });
    const highThreshold = runOffgridDispatch(pv, load, critical, constrainedBattery, gen, { generatorStartSocPct: 50 });

    assert.ok(highThreshold.generatorRunHours > lowThreshold.generatorRunHours, 'yüksek SOC eşiği jeneratör saatini artırmalı');
    assert.ok(highThreshold.unmetLoadKwh < lowThreshold.unmetLoadKwh, 'yüksek SOC eşiği unmet load azaltmalı');
  });

  it('generator min load ve battery-charge-from-generator etkinse yakıt çıkışı yükten büyük olabilir', () => {
    const battery = {
      usableCapacityKwh: 10,
      efficiency: 1.0,
      socReserveKwh: 0,
      initialSocKwh: 0,
      maxChargePowerKw: 2,
      maxDischargePowerKw: 2
    };
    const pv = makeLoadHourly(0);
    const load = makeLoadHourly(6); // 0.25 kWh/h
    const critical = makeLoadHourly(6);
    const gen = { enabled: true, capacityKw: 2, fuelCostPerKwh: 5 };
    const result = runOffgridDispatch(pv, load, critical, battery, gen, {
      generatorStartSocPct: 20,
      generatorStopSocPct: 60,
      generatorMinLoadRatePct: 50,
      generatorChargeBatteryEnabled: true
    });

    assert.ok(result.generatorOutputKwh > result.generatorToLoadKwh, 'min load nedeniyle toplam çıkış yüke giden enerjiden büyük olmalı');
    assert.ok(result.generatorToBatteryKwh > 0, 'jeneratör bataryayı da şarj etmeli');
    nearly(result.generatorFuelCostAnnual, result.generatorOutputKwh * 5, 0.05, 'yakıt maliyeti çıkış enerjisinden hesaplanmalı');
  });

  it('critical-backup ile full-backup farklı dispatch davranışı üretir', () => {
    const battery = {
      usableCapacityKwh: 0,
      efficiency: 1,
      socReserveKwh: 0,
      initialSocKwh: 0,
      maxChargePowerKw: 0,
      maxDischargePowerKw: 0
    };
    const pv = makeLoadHourly(0);
    const load = makeLoadHourly(12);
    const critical = makeLoadHourly(4);
    const gen = { enabled: true, capacityKw: 1, fuelCostPerKwh: 5 };
    const criticalBackup = runOffgridDispatch(pv, load, critical, battery, gen, { generatorStrategy: 'critical-backup' });
    const fullBackup = runOffgridDispatch(pv, load, critical, battery, gen, { generatorStrategy: 'full-backup' });

    assert.ok(fullBackup.generatorToLoadKwh > criticalBackup.generatorToLoadKwh, 'full-backup toplam yükte daha fazla enerji taşımalı');
    assert.ok(fullBackup.unmetLoadKwh < criticalBackup.unmetLoadKwh, 'full-backup unmet load azaltmalı');
    nearly(criticalBackup.generatorToCriticalKwh, criticalBackup.generatorToLoadKwh, 0.01, 'critical-backup kritik dışına taşmamalı');
  });
});

// ── 7. runOffgridDispatch: On-Grid Kavram Sızıntısı Yok ─────────────────────
describe('runOffgridDispatch — on-grid kavram sızıntısı yok', () => {
  it('çıktı nesnesi paidGridExport içermez', () => {
    const pv = makeLoadHourly(10);
    const load = makeLoadHourly(5);
    const critical = makeLoadHourly(2);
    const result = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    assert.equal(result.paidGridExport, undefined, 'paidGridExport off-grid çıktısında olmamalı');
    assert.equal(result.gridImport, undefined, 'gridImport off-grid çıktısında olmamalı');
    assert.equal(result.netMetering, undefined, 'netMetering off-grid çıktısında olmamalı');
  });

  it('saatlik iz nesnesi gridImport içermez', () => {
    const pv = makeLoadHourly(10);
    const load = makeLoadHourly(5);
    const critical = makeLoadHourly(2);
    const result = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    if (result.hourly8760.length > 0) {
      const h0 = result.hourly8760[0];
      assert.equal(h0.gridImport, undefined, 'gridImport hourly nesnesinde olmamalı');
    }
  });
});

// ── 8. runBadWeatherScenario ─────────────────────────────────────────────────
describe('runBadWeatherScenario', () => {
  it('kötü hava ile toplam kapsama düşer veya eşit kalır', () => {
    const pv = makeDaytimePvHourly(8);
    const load = makeLoadHourly(10);
    const critical = makeLoadHourly(4);
    const normal = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    const bad = runBadWeatherScenario(normal, pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, 'moderate');
    assert.ok(bad.dispatch.totalLoadCoverage <= normal.totalLoadCoverage + 1e-6,
      'kötü hava kapsama <= normal kapsama');
  });

  it('hafif/orta/şiddetli PV faktörleri doğru (ardışık-gün modeli)', () => {
    // BAD_WEATHER_CONFIG ardışık-gün + pencere içi pvFactor
    assert.equal(BAD_WEATHER_PV_FACTORS.light,    0.15);
    assert.equal(BAD_WEATHER_PV_FACTORS.moderate,  0.05);
    assert.equal(BAD_WEATHER_PV_FACTORS.severe,    0.00);
  });

  it('delta metrikleri pozitif veya sıfır', () => {
    const pv = makeDaytimePvHourly(8);
    const load = makeLoadHourly(10);
    const critical = makeLoadHourly(4);
    const normal = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    const bad = runBadWeatherScenario(normal, pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, 'severe');
    assert.ok(bad.criticalCoverageDropPct >= 0, 'criticalCoverageDropPct >= 0');
    assert.ok(bad.totalCoverageDropPct >= 0, 'totalCoverageDropPct >= 0');
  });

  it('weatherLevel ve pvScaleFactor çıktıda doğru', () => {
    const pv = makeLoadHourly(10);
    const load = makeLoadHourly(8);
    const critical = makeLoadHourly(3);
    const normal = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    const bad = runBadWeatherScenario(normal, pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, 'light');
    assert.equal(bad.weatherLevel, 'light');
    assert.equal(bad.pvScaleFactor, 0.15);
    assert.ok(bad.consecutiveDays > 0, 'consecutiveDays > 0');
  });
});

// ── 9. buildOffgridResults ───────────────────────────────────────────────────
describe('buildOffgridResults', () => {
  it('lifecycle maliyet formülü doğru', () => {
    const pv = makeDaytimePvHourly(10);
    const load = makeLoadHourly(8);
    const critical = makeLoadHourly(3);
    const normal = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    const loadProfile = buildOffgridLoadProfile([], { fallbackDailyKwh: 8 * 365 / 365, criticalFraction: 0.375 });
    const result = buildOffgridResults(normal, null, loadProfile, { enabled: false }, {
      systemCapexTry: 100000,
      generatorCapexTry: 0,
      alternativeEnergyCostPerKwh: 17
    });
    const expected = (100000 / 25) + normal.generatorFuelCostAnnual;
    nearly(result.lifecycleCostAnnual, expected, 1, 'lifecycle cost');
  });

  it('methodologyNote ve dispatchVersion mevcut', () => {
    const pv = makeLoadHourly(10);
    const load = makeLoadHourly(8);
    const critical = makeLoadHourly(3);
    const normal = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    const loadProfile = buildOffgridLoadProfile([
      { name: 'Kettle', category: 'kitchen', powerW: 2000, hoursPerDay: 0.2, isCritical: false, usageType: 'manual' }
    ], {});
    const result = buildOffgridResults(normal, null, loadProfile, { enabled: false }, { systemCapexTry: 50000, alternativeEnergyCostPerKwh: 15 });
    assert.equal(result.methodologyNote, 'synthetic-dispatch-pre-feasibility');
    assert.ok(result.dispatchVersion.startsWith('OGD-'), 'dispatchVersion başlangıcı');
    assert.equal(typeof result.pvBatteryLoadCoverage, 'number');
    assert.equal(typeof result.minimumSoc, 'number');
    assert.equal(typeof result.accuracyScore, 'number');
    assert.equal(result.accuracyAssessment.tier, 'device-library');
    assert.equal(result.criticalCoverageWithGenerator, result.criticalLoadCoverage);
    assert.equal(result.criticalCoverageWithoutGenerator, result.criticalLoadCoverage);
    assert.equal(result.syntheticPeakModel?.peakEnvelopeApplied, true);
  });

  it('badWeatherScenario null olabilir', () => {
    const pv = makeLoadHourly(10);
    const load = makeLoadHourly(8);
    const critical = makeLoadHourly(3);
    const normal = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});
    const loadProfile = buildOffgridLoadProfile([], { fallbackDailyKwh: 8, criticalFraction: 0.4 });
    const result = buildOffgridResults(normal, null, loadProfile, { enabled: false }, { systemCapexTry: 50000, alternativeEnergyCostPerKwh: 15 });
    assert.equal(result.badWeatherScenario, null);
  });

  it('generator overhaul ve replacement fraction lifecycle maliyetine eklenir', () => {
    const pv = makeLoadHourly(0);
    const load = makeLoadHourly(12);
    const critical = makeLoadHourly(6);
    const battery = { usableCapacityKwh: 0, efficiency: 1.0, socReserveKwh: 0, initialSocKwh: 0 };
    const normal = runOffgridDispatch(pv, load, critical, battery, { enabled: true, capacityKw: 1, fuelCostPerKwh: 4 }, { generatorMaxHoursPerDay: 12 });
    const loadProfile = buildOffgridLoadProfile([], { fallbackDailyKwh: 12, criticalFraction: 0.5 });
    const result = buildOffgridResults(normal, null, loadProfile, { enabled: true, capacityKw: 1, fuelCostPerKwh: 4 }, {
      systemCapexTry: 100000,
      generatorCapexTry: 20000,
      generatorMaintenanceCostTry: 3000,
      generatorOverhaulHours: 2000,
      generatorOverhaulCostTry: 50000,
      batteryCapexTry: 40000,
      batteryLifetimeYears: 10,
      batteryReplacementFractionPct: 50,
      alternativeEnergyCostPerKwh: 17
    });
    assert.ok(result.generatorOverhaulAnnual > 0, 'generator overhaul annual > 0');
    assert.ok(result.lifecycleCostAnnual > ((120000 / 25) + normal.generatorFuelCostAnnual + 3000), 'lifecycle overhaul ve battery replacement içermeli');
    nearly(result.batteryReplacementFractionPct, 50, 0.01, 'replacement fraction stored');
  });
});

describe('runOffgridDispatch — Faz 3 parametreleri', () => {
  it('autonomyThresholdPct yükseldikçe otonom gün sayısı artar', () => {
    const pv = makeLoadHourly(9.8);
    const load = makeLoadHourly(10);
    const critical = makeLoadHourly(4);
    const strict = runOffgridDispatch(pv, load, critical, { usableCapacityKwh: 0, efficiency: 1, socReserveKwh: 0, initialSocKwh: 0 }, NO_GENERATOR, { autonomyThresholdPct: 0.5 });
    const loose = runOffgridDispatch(pv, load, critical, { usableCapacityKwh: 0, efficiency: 1, socReserveKwh: 0, initialSocKwh: 0 }, NO_GENERATOR, { autonomyThresholdPct: 5 });
    assert.ok(loose.autonomousDays >= strict.autonomousDays, 'daha gevşek eşik daha az değil daha çok otonom gün saymalı');
  });

  it('ayrı charge/discharge efficiency alanları dispatch çıktısına yansır', () => {
    const pv = makeDaytimePvHourly(20);
    const load = makeLoadHourly(10);
    const critical = makeLoadHourly(4);
    const battery = {
      usableCapacityKwh: 5,
      efficiency: 0.81,
      chargeEfficiency: 0.95,
      dischargeEfficiency: 0.85,
      socReserveKwh: 0,
      initialSocKwh: 0,
      maxChargePowerKw: 5,
      maxDischargePowerKw: 5
    };
    const result = runOffgridDispatch(pv, load, critical, battery, NO_GENERATOR, {});
    nearly(result.chargeEfficiency, 0.95, 0.0001, 'charge eff');
    nearly(result.dischargeEfficiency, 0.85, 0.0001, 'discharge eff');
  });

  it('dinamik battery efficiency yüksek C-rate ve düşük SOC altında efektif verimi düşürür', () => {
    const battery = {
      usableCapacityKwh: 6,
      efficiency: 0.95,
      chemistry: 'NMC',
      socReserveKwh: 0.6,
      initialSocKwh: 1.5,
      maxChargePowerKw: 6,
      maxDischargePowerKw: 6,
      dynamicEfficiencyModelEnabled: true
    };
    const pv = makeLoadHourly(0);
    const load = makeLoadHourly(36); // 1.5 kWh/h
    const critical = makeLoadHourly(18);
    const dynamicOn = runOffgridDispatch(pv, load, critical, battery, NO_GENERATOR, {});
    const dynamicOff = runOffgridDispatch(pv, load, critical, { ...battery, dynamicEfficiencyModelEnabled: false }, NO_GENERATOR, {});

    assert.equal(dynamicOn.dynamicBatteryEfficiencyModel, 'c-rate-soc-v1');
    assert.ok(dynamicOn.effectiveDischargeEfficiencyAvg < dynamicOff.effectiveDischargeEfficiencyAvg,
      'dinamik model efektif deşarj verimini düşürmeli');
    assert.ok(dynamicOn.unmetLoadKwh >= dynamicOff.unmetLoadKwh,
      'daha düşük efektif verim unmet load azaltmamalı');
  });
});

describe('buildOffgridAccuracyAssessment', () => {
  it('basit sentetik mod düşük puan ve geniş belirsizlik bandı üretir', () => {
    const productionProfile = buildOffgridPvDispatchProfile({
      fallbackHourlyRows: makeLoadHourly(8).map(production => ({ production })),
      fallbackUsed: true
    });
    const loadProfile = buildOffgridLoadProfile([], { fallbackDailyKwh: 8, criticalFraction: 0.5 });
    const assessment = buildOffgridAccuracyAssessment({
      productionProfile,
      loadProfile,
      battery: {},
      dispatchOptions: {},
      calculationMode: 'basic'
    });
    assert.equal(assessment.tier, 'basic-synthetic');
    assert.ok(assessment.accuracyScore < 60);
    assert.ok(assessment.expectedUncertaintyPct.highPct >= 40);
    assert.equal(assessment.errorIsNotBounded, true);
  });

  it('gerçek PV, gerçek yük, gerçek kritik yük ve güç limitleri puanı yükseltir', () => {
    const productionProfile = buildOffgridPvDispatchProfile({ realHourlyPv8760: makeLoadHourly(10) });
    const loadProfile = buildOffgridLoadProfile([], {
      hourlyLoad8760: makeLoadHourly(8),
      criticalHourly8760: makeLoadHourly(3),
      hourlyLoadSource: 'field-meter-load'
    });
    const assessment = buildOffgridAccuracyAssessment({
      productionProfile,
      loadProfile,
      battery: { maxChargePowerKw: 5, maxDischargePowerKw: 5 },
      dispatchOptions: { inverterAcLimitKw: 5 },
      calculationMode: 'advanced',
      badWeatherEnabled: true
    });
    assert.equal(assessment.tier, 'field-input-ready');
    assert.ok(assessment.accuracyScore >= 85);
    assert.ok(assessment.expectedUncertaintyPct.highPct <= 12);
  });
});

// ── 9b. Faz 3 saha model olgunluğu ───────────────────────────────────────────
describe('runOffgridStressScenarios / buildOffgridFieldModelMaturityGate', () => {
  const passingStressAnalysis = () => ({
    version: 'test',
    scenarios: OFFGRID_STRESS_SCENARIOS.map(row => ({
      key: row.key,
      label: row.label,
      totalLoadCoverage: 1,
      criticalLoadCoverage: 1,
      pvBatteryLoadCoverage: 1,
      pvBatteryCriticalCoverage: 1,
      unmetLoadKwh: 0,
      unmetCriticalKwh: 0,
      generatorKwh: 0,
      generatorRunHours: 0,
      batteryChargeLimitedKwh: 0,
      batteryDischargeLimitedKwh: 0,
      inverterPowerLimitedKwh: 0,
      peakCriticalKw: 4
    })),
    generatorCriticalPeakReservePct: null
  });

  it('dört zorunlu stres senaryosunu üretir', () => {
    const pv = makeFlatPvHourly(8760 * 3);
    const load = makeLoadHourly(12);
    const critical = makeLoadHourly(4);
    const stress = runOffgridStressScenarios({
      pvHourly8760: pv,
      loadHourly8760: load,
      criticalHourly8760: critical,
      battery: { usableCapacityKwh: 20, efficiency: 0.92, socReserveKwh: 2, initialSocKwh: 10, maxChargePowerKw: 10, maxDischargePowerKw: 10 },
      generator: NO_GENERATOR,
      dispatchOptions: {}
    });
    assert.equal(stress.scenarios.length, 4);
    assert.deepEqual(stress.scenarioCoverage.missingKeys, []);
    assert.ok(stress.scenarios.some(row => row.key === 'combined-design-stress'));
    assert.ok(stress.worstCriticalScenario);
  });

  it('Faz 3 kapısı stres altında kritik yük karşılanmazsa bloklar', () => {
    const pv = makeDaytimePvHourly(2);
    const load = makeLoadHourly(20);
    const critical = makeLoadHourly(10);
    const stress = runOffgridStressScenarios({
      pvHourly8760: pv,
      loadHourly8760: load,
      criticalHourly8760: critical,
      battery: { usableCapacityKwh: 2, efficiency: 0.9, socReserveKwh: 0.2, initialSocKwh: 0.2, maxChargePowerKw: 1, maxDischargePowerKw: 1 },
      generator: NO_GENERATOR,
      dispatchOptions: {}
    });
    const gate = buildOffgridFieldModelMaturityGate(stress, { phase1Ready: true, phase2Ready: true, generator: NO_GENERATOR });
    assert.equal(gate.phase3Ready, false);
    assert.ok(gate.blockers.some(item => item.includes('kritik yük')));
  });

  it('zorunlu stres senaryosu eksikse Faz 3 kapısı bloklar', () => {
    const stress = passingStressAnalysis();
    stress.scenarios = stress.scenarios.filter(row => row.key !== 'combined-design-stress');
    const gate = buildOffgridFieldModelMaturityGate(stress, { phase1Ready: true, phase2Ready: true, generator: NO_GENERATOR });
    assert.equal(gate.phase3Ready, false);
    assert.ok(gate.scenarioCoverage.missingKeys.includes('combined-design-stress'));
    assert.ok(gate.blockers.some(item => item.includes('zorunlu stres senaryoları eksik')));
  });

  it('kötü hava pencere testi zorunluysa yokluğunu Faz 3 kapısında bloklar', () => {
    const gate = buildOffgridFieldModelMaturityGate(passingStressAnalysis(), {
      phase1Ready: true,
      phase2Ready: true,
      generator: NO_GENERATOR,
      requireBadWeatherScenario: true
    });
    assert.equal(gate.phase3Ready, false);
    assert.equal(gate.badWeatherStress.required, true);
    assert.equal(gate.badWeatherStress.evaluated, false);
    assert.ok(gate.blockers.some(item => item.includes('kötü hava')));
  });

  it('kötü hava pencere kapsaması eşik altındaysa Faz 3 kapısı bloklar', () => {
    const badWeatherScenario = {
      weatherLevel: 'severe',
      consecutiveDays: 15,
      worstWindowDayOfYear: 42,
      windowCoverage: 0.95,
      windowCriticalCoverage: 0.998,
      windowMinSocKwh: 0,
      dispatch: { unmetCriticalLoadKwh: 2 }
    };
    const gate = buildOffgridFieldModelMaturityGate(passingStressAnalysis(), {
      phase1Ready: true,
      phase2Ready: true,
      generator: NO_GENERATOR,
      badWeatherScenario,
      requireBadWeatherScenario: true
    });
    assert.equal(gate.phase3Ready, false);
    assert.equal(gate.badWeatherStress.evaluated, true);
    assert.equal(gate.badWeatherStress.ready, false);
    assert.ok(gate.blockers.some(item => item.includes('Kötü hava penceresi')));
  });

  it('faz 1+2 ve stres eşikleri sağlanırsa faz 3 ready olur ama saha garantisi vermez', () => {
    const pv = makeFlatPvHourly(8760 * 6);
    const load = makeLoadHourly(12);
    const critical = makeLoadHourly(4);
    const stress = runOffgridStressScenarios({
      pvHourly8760: pv,
      loadHourly8760: load,
      criticalHourly8760: critical,
      battery: { usableCapacityKwh: 50, efficiency: 0.94, socReserveKwh: 5, initialSocKwh: 25, maxChargePowerKw: 20, maxDischargePowerKw: 20 },
      generator: NO_GENERATOR,
      dispatchOptions: {}
    });
    const gate = buildOffgridFieldModelMaturityGate(stress, { phase1Ready: true, phase2Ready: true, generator: NO_GENERATOR });
    assert.equal(gate.phase3Ready, true);
    assert.equal(gate.fieldGuaranteeReady, false);
  });
});

// ── 10. Enerji Korunumu ───────────────────────────────────────────────────────
describe('runOffgridDispatch — enerji korunumu', () => {
  it('directPv + battery + gen + unmet = total load (tolerans ile)', () => {
    const pv = makeDaytimePvHourly(10);
    const load = makeLoadHourly(10);
    const critical = makeLoadHourly(4);
    const result = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, WITH_GENERATOR, {});

    const annualLoad = load.reduce((a, b) => a + b, 0);
    const totalServed = result.directPvToLoadKwh + result.batteryToLoadKwh + result.generatorToLoadKwh;
    const accountedFor = totalServed + result.unmetLoadKwh;

    nearly(accountedFor, annualLoad, 5, 'enerji korunumu: served + unmet = load');
  });

  it('PV = directPV + chargedFromPv + curtailed (tolerans ile)', () => {
    const pv = makeDaytimePvHourly(12);
    const load = makeLoadHourly(6);
    const critical = makeLoadHourly(2);
    const result = runOffgridDispatch(pv, load, critical, DEFAULT_BATTERY, NO_GENERATOR, {});

    const totalPv = pv.reduce((a, b) => a + b, 0);
    const pvAccount = result.directPvToLoadKwh + result.chargedFromPvKwh + result.curtailedPvKwh;
    // chargedFromPv ve curtailed kayıpları içerebilir (verim kayıpları nedeniyle)
    nearly(pvAccount, totalPv, totalPv * 0.1, 'PV balance: direct + charged + curtailed ≈ total');
  });
});

// ── 11. OFFGRID_DISPATCH_VERSION sabit ───────────────────────────────────────
describe('sabitler', () => {
  it('OFFGRID_DISPATCH_VERSION tanımlı ve string', () => {
    assert.equal(typeof OFFGRID_DISPATCH_VERSION, 'string');
    assert.ok(OFFGRID_DISPATCH_VERSION.length > 0);
  });

  it('DEVICE_LOAD_TEMPLATES 5 kategori içerir', () => {
    const keys = Object.keys(DEVICE_LOAD_TEMPLATES);
    assert.ok(keys.includes('lighting'));
    assert.ok(keys.includes('refrigerator'));
    assert.ok(keys.includes('pump'));
    assert.ok(keys.includes('entertainment'));
    assert.ok(keys.includes('generic'));
  });

  it('her şablon 24 eleman içerir', () => {
    for (const [cat, tpl] of Object.entries(DEVICE_LOAD_TEMPLATES)) {
      assert.equal(tpl.length, 24, `${cat} şablonu 24 saat olmalı`);
    }
  });
});
