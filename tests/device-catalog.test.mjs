// ═══════════════════════════════════════════════════════════
// DEVICE CATALOG TESTS — Off-Grid Cihaz Kütüphanesi
// ═══════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEVICE_CATALOG,
  DEVICE_CATEGORIES,
  DEVICE_CATEGORY_LABELS,
  findCatalogDevice,
  getDevicesByCategory,
  catalogItemToDevice,
  deviceDailyWhd
} from '../js/device-catalog.js';
import {
  buildOffgridLoadProfile,
  runOffgridDispatch,
  DEVICE_LOAD_TEMPLATES
} from '../js/offgrid-dispatch.js';

// ── Yaklaşık eşitlik yardımcısı ────────────────────────────────────────────
function nearly(actual, expected, tol, msg = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tol, `${msg}: expected ${expected} ± ${tol}, got ${actual} (diff=${diff.toFixed(4)})`);
}

// ── 1. Katalog bütünlüğü ─────────────────────────────────────────────────────
describe('DEVICE_CATALOG — bütünlük', () => {
  it('en az 30 cihaz var', () => {
    assert.ok(DEVICE_CATALOG.length >= 30, `Katalog boyutu ${DEVICE_CATALOG.length} < 30`);
  });

  it('tüm ID\'ler benzersiz', () => {
    const ids = DEVICE_CATALOG.map(d => d.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'Tekrar eden ID var');
  });

  it('her cihazda zorunlu alanlar mevcut', () => {
    for (const d of DEVICE_CATALOG) {
      assert.ok(d.id, `id eksik: ${JSON.stringify(d)}`);
      assert.ok(d.name, `name eksik: ${d.id}`);
      assert.ok(d.category, `category eksik: ${d.id}`);
      assert.ok(Number(d.powerW) > 0, `powerW ≤ 0: ${d.id}`);
      assert.ok(Number(d.defaultHoursPerDay) >= 0, `defaultHoursPerDay < 0: ${d.id}`);
    }
  });

  it('tüm kategoriler DEVICE_CATEGORIES içinde', () => {
    for (const d of DEVICE_CATALOG) {
      assert.ok(DEVICE_CATEGORIES.includes(d.category), `Bilinmeyen kategori: ${d.category} (${d.id})`);
    }
  });

  it('nightHours <= hoursPerDay', () => {
    for (const d of DEVICE_CATALOG) {
      const night = Number(d.defaultNightHours);
      const day   = Number(d.defaultHoursPerDay);
      assert.ok(night <= day, `nightHours (${night}) > hoursPerDay (${day}): ${d.id}`);
    }
  });
});

// ── 2. Kategori etiketleri ────────────────────────────────────────────────────
describe('DEVICE_CATEGORY_LABELS', () => {
  it('tr, en, de dil anahtarları mevcut', () => {
    assert.ok(DEVICE_CATEGORY_LABELS.tr, 'tr eksik');
    assert.ok(DEVICE_CATEGORY_LABELS.en, 'en eksik');
    assert.ok(DEVICE_CATEGORY_LABELS.de, 'de eksik');
  });

  it('tüm kategoriler tr\'de çevrilmiş', () => {
    for (const cat of DEVICE_CATEGORIES) {
      assert.ok(DEVICE_CATEGORY_LABELS.tr[cat], `tr etiketi yok: ${cat}`);
    }
  });
});

// ── 3. findCatalogDevice ──────────────────────────────────────────────────────
describe('findCatalogDevice', () => {
  it('var olan ID bulunur', () => {
    const found = findCatalogDevice('fridge-150l');
    assert.ok(found, 'fridge-150l bulunamadı');
    assert.equal(found.id, 'fridge-150l');
  });

  it('olmayan ID → null döner', () => {
    assert.equal(findCatalogDevice('does-not-exist'), null);
  });
});

// ── 4. getDevicesByCategory ───────────────────────────────────────────────────
describe('getDevicesByCategory', () => {
  it('refrigerator kategorisinde en az 2 cihaz var', () => {
    const list = getDevicesByCategory('refrigerator');
    assert.ok(list.length >= 2, `Buzdolabı kategorisi boyutu: ${list.length}`);
  });

  it('olmayan kategori için boş liste döner', () => {
    const list = getDevicesByCategory('nonexistent');
    assert.equal(list.length, 0);
  });
});

// ── 5. catalogItemToDevice ────────────────────────────────────────────────────
describe('catalogItemToDevice', () => {
  it('adet=1 için doğru powerW', () => {
    const item = findCatalogDevice('fridge-150l');
    const d = catalogItemToDevice(item, 1);
    assert.equal(d.powerW, item.powerW);
  });

  it('adet=3 için powerW 3x olur', () => {
    const item = findCatalogDevice('led-9w');
    const d = catalogItemToDevice(item, 3);
    assert.equal(d.powerW, item.powerW * 3);
  });

  it('catalogId, usageType aktarılır', () => {
    const item = findCatalogDevice('modem');
    const d = catalogItemToDevice(item, 1);
    assert.equal(d.catalogId, 'modem');
    assert.equal(d.usageType, 'continuous');
  });

  it('override ile isCritical değiştirilebilir', () => {
    const item = findCatalogDevice('led-9w');
    const d = catalogItemToDevice(item, 1, { isCritical: true });
    assert.equal(d.isCritical, true);
  });

  it('adet > 1 için isim ×N içerir', () => {
    const item = findCatalogDevice('ip-camera');
    const d = catalogItemToDevice(item, 4);
    assert.ok(d.name.includes('×4'), `İsim ×4 içermiyor: ${d.name}`);
  });
});

// ── 6. deviceDailyWhd ────────────────────────────────────────────────────────
describe('deviceDailyWhd', () => {
  it('100W × 4h = 400 Wh/gün', () => {
    assert.equal(deviceDailyWhd({ powerW: 100, hoursPerDay: 4 }), 400);
  });

  it('1200W × 8h = 9600 Wh/gün', () => {
    assert.equal(deviceDailyWhd({ powerW: 1200, hoursPerDay: 8 }), 9600);
  });
});

// ── 7. Yeni kategoriler dispatch şablonlarında mevcut ─────────────────────────
describe('DEVICE_LOAD_TEMPLATES — yeni kategoriler', () => {
  const NEW_CATS = ['hvac', 'security', 'kitchen', 'laundry', 'workshop', 'gaming'];
  for (const cat of NEW_CATS) {
    it(`${cat} şablonu mevcut ve 24 elemanlı`, () => {
      const tmpl = DEVICE_LOAD_TEMPLATES[cat];
      assert.ok(tmpl, `${cat} şablonu yok`);
      assert.equal(tmpl.length, 24, `${cat} şablonu 24 elemanlı değil`);
    });

    it(`${cat} şablonu toplamı ≈ 1.0 (norm24 normalize eder, ±0.1 tolerans)`, () => {
      const tmpl = DEVICE_LOAD_TEMPLATES[cat];
      const sum = tmpl.reduce((a, b) => a + b, 0);
      nearly(sum, 1.0, 0.1, `${cat} şablonu toplamı`);
    });
  }
});

// ── 8. Cihaz listesi → dispatch entegrasyon testi ────────────────────────────
describe('Cihaz listesi → dispatch entegrasyonu', () => {
  const DEFAULT_BATTERY = {
    usableCapacityKwh: 15,
    efficiency: 0.92,
    socReserveKwh: 1.5,
    initialSocKwh: 1.5
  };
  const NO_GEN = { enabled: false, capacityKw: 0, fuelCostPerKwh: 0 };

  it('buzdolabı (kritik) ve TV (kritik olmayan) → kritik yük < toplam yük', () => {
    const devices = [
      { name: 'Buzdolabı', category: 'refrigerator', powerW: 70, hoursPerDay: 24, isCritical: true },
      { name: 'TV', category: 'entertainment', powerW: 45, hoursPerDay: 4, isCritical: false }
    ];
    const profile = buildOffgridLoadProfile(devices, {});
    assert.equal(profile.mode, 'device-list');
    assert.ok(profile.annualCriticalKwh < profile.annualTotalKwh, 'Kritik yük toplam yükten küçük olmalı');
    assert.ok(profile.deviceCount === 2);
    assert.ok(profile.criticalDeviceCount === 1);
  });

  it('tüm kritik cihazlar → kritik = toplam', () => {
    const devices = [
      { name: 'Kamera', category: 'security', powerW: 12, hoursPerDay: 24, isCritical: true },
      { name: 'Modem', category: 'entertainment', powerW: 15, hoursPerDay: 24, isCritical: true }
    ];
    const profile = buildOffgridLoadProfile(devices, {});
    nearly(profile.annualCriticalKwh, profile.annualTotalKwh, 0.5, 'Tümü kritik → eşit');
  });

  it('dispatch motoru cihaz profili alır ve anlamlı sonuç verir', () => {
    const devices = [
      { name: 'Buzdolabı', category: 'refrigerator', powerW: 100, hoursPerDay: 24, isCritical: true },
      { name: 'Aydınlatma', category: 'lighting', powerW: 50, hoursPerDay: 6, isCritical: false }
    ];
    const profile = buildOffgridLoadProfile(devices, {});

    // Yüke eşit PV üretimi (düz)
    const annualLoad = profile.annualTotalKwh;
    const pvHourly = new Array(8760).fill(annualLoad / 8760);

    const dispatch = runOffgridDispatch(
      pvHourly,
      profile.totalHourly8760,
      profile.criticalHourly8760,
      DEFAULT_BATTERY,
      NO_GEN
    );

    assert.ok(dispatch.totalLoadCoverage > 0.5, `Toplam kapsama düşük: ${dispatch.totalLoadCoverage}`);
    assert.ok(dispatch.criticalLoadCoverage >= dispatch.totalLoadCoverage * 0.9, 'Kritik kapsama toplam kapsama kadar olmalı');
  });

  it('kritik işaretlemesi criticalLoadCoverage\'a etki eder', () => {
    const devicesWithCritical = [
      { name: 'Pompa', category: 'pump', powerW: 550, hoursPerDay: 4, isCritical: true },
      { name: 'Klima', category: 'hvac', powerW: 900, hoursPerDay: 6, isCritical: false }
    ];
    const devicesWithoutCritical = [
      { name: 'Pompa', category: 'pump', powerW: 550, hoursPerDay: 4, isCritical: false },
      { name: 'Klima', category: 'hvac', powerW: 900, hoursPerDay: 6, isCritical: false }
    ];

    const profileWith = buildOffgridLoadProfile(devicesWithCritical, {});
    const profileWithout = buildOffgridLoadProfile(devicesWithoutCritical, {});

    // Kritikli profilde kritik enerji > 0
    assert.ok(profileWith.annualCriticalKwh > 0, 'Kritik enerji > 0 bekleniyor');
    assert.equal(profileWithout.annualCriticalKwh, 0, 'Kritik olmayan profilde 0 bekleniyor');
  });

  it('nightHoursPerDay destekleniyor — profil toplamı hâlâ doğru', () => {
    const devices = [
      { name: 'Klima', category: 'hvac', powerW: 1000, hoursPerDay: 8, nightHoursPerDay: 5, isCritical: false }
    ];
    const profile = buildOffgridLoadProfile(devices, {});
    const expectedAnnualKwh = 1.0 * 8 * 365;  // 1 kW × 8h × 365
    nearly(profile.annualTotalKwh, expectedAnnualKwh, 5, 'nightHoursPerDay → yıllık kWh doğru');
  });

  it('katalogdan oluşturulan cihaz dispatch motorunu besler', () => {
    const item = findCatalogDevice('fridge-150l');
    const device = catalogItemToDevice(item, 1);

    const profile = buildOffgridLoadProfile([device], {});
    assert.equal(profile.mode, 'device-list');
    assert.ok(profile.annualTotalKwh > 0);
    assert.ok(profile.annualCriticalKwh > 0); // buzdolabı kritik
  });

  it('sentetik cihaz profili peak envelope ile nominal surge toplamından daha konservatif davranır', () => {
    const devices = [
      { name: 'Kettle', category: 'kitchen', powerW: 2000, hoursPerDay: 0.2, isCritical: false, usageType: 'manual' },
      { name: 'Çamaşır', category: 'laundry', powerW: 1800, hoursPerDay: 1.5, isCritical: false, usageType: 'cyclic' }
    ];
    const profile = buildOffgridLoadProfile(devices, {});
    const naiveNominalPeakKw = (2.0 * 1.2) + (1.8 * 1.4);
    const maxPeakKw = Math.max(...profile.hourlyPeakKw8760);
    assert.equal(profile.syntheticPeakModel?.peakEnvelopeApplied, true);
    assert.ok(profile.syntheticPeakModel?.peakEnvelopeHours > 0, 'peak envelope hour count > 0 olmalı');
    assert.ok(maxPeakKw > naiveNominalPeakKw, `peak envelope beklenenden sert değil: ${maxPeakKw} <= ${naiveNominalPeakKw}`);
  });
});

// ── 9. Manuel cihaz + katalog cihaz birlikte ─────────────────────────────────
describe('Manuel + katalog cihaz birleşik yük', () => {
  it('katalog + manuel toplam yük doğru toplanır', () => {
    const fridge = catalogItemToDevice(findCatalogDevice('fridge-150l'), 1);
    const manual = { name: 'Özel Cihaz', category: 'generic', powerW: 200, hoursPerDay: 5, isCritical: false };

    const profile = buildOffgridLoadProfile([fridge, manual], {});
    const expectedFridgeKwh = (fridge.powerW / 1000) * fridge.hoursPerDay * 365;
    const expectedManualKwh = (manual.powerW / 1000) * manual.hoursPerDay * 365;

    nearly(profile.annualTotalKwh, expectedFridgeKwh + expectedManualKwh, 5, 'Manuel + katalog toplam');
  });
});

// ── 10. Jeneratör aktif/pasif farkı ──────────────────────────────────────────
describe('Jeneratör aktif/pasif — kritik kapsama farkı', () => {
  it('jeneratörlü dispatch daha iyi kritik kapsama sağlar', () => {
    const devices = [
      { name: 'Büyük Pompa', category: 'pump', powerW: 1500, hoursPerDay: 8, isCritical: true }
    ];
    const profile = buildOffgridLoadProfile(devices, {});
    // Az PV (yetersiz)
    const pvHourly = new Array(8760).fill(profile.annualTotalKwh * 0.3 / 8760);

    const battery = { usableCapacityKwh: 5, efficiency: 0.90, socReserveKwh: 0.5, initialSocKwh: 0.5 };
    const withGen  = { enabled: true,  capacityKw: 3, fuelCostPerKwh: 10 };
    const withoutGen = { enabled: false, capacityKw: 0, fuelCostPerKwh: 0 };

    const dispatchWith    = runOffgridDispatch(pvHourly, profile.totalHourly8760, profile.criticalHourly8760, battery, withGen);
    const dispatchWithout = runOffgridDispatch(pvHourly, profile.totalHourly8760, profile.criticalHourly8760, battery, withoutGen);

    assert.ok(dispatchWith.criticalLoadCoverage >= dispatchWithout.criticalLoadCoverage,
      'Jeneratörlü kritik kapsama ≥ jeneratörsüz');
    assert.ok(dispatchWith.generatorToLoadKwh > 0, 'Jeneratör enerji üretiyor olmalı');
  });
});
