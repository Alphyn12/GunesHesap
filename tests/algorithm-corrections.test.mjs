// ═══════════════════════════════════════════════════════════
// ALGORİTMA DÜZELTMELERİ — Faz 3 Regresyon Testi
// ALG-01, ALG-02, ALG-03, ALG-05, ALG-07, ALG-08 doğrulaması
// ═══════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import {
  taxShieldAnnuityFactor,
  TAX_SHIELD_DEFAULT_DISCOUNT_RATE,
  resolveAmortYears,
} from '../js/tax.js';
import {
  HEATING_DEGREE_DAY_WEIGHTS,
  COOLING_DEGREE_DAY_WEIGHTS,
  HEATING_DAILY_BASE_HOURS,
  COOLING_DAILY_BASE_HOURS,
  HP_DAYS_PER_MONTH,
  COOLING_LOAD_RATIO,
} from '../js/heat-pump.js';

function nearly(actual, expected, tol = 1e-4, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label ? label + ': ' : ''}expected ${expected}, got ${actual} (tol=${tol})`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ALG-01: Bifacial Kazanç Formülü — BIFACIAL_BACK_SHADE_FACTOR = 0.50
// Yeni formül: 1 + gain * max(0, 1 - shading * 0.5 / 100)
// Eski formül: 1 + gain * (1 - clamp(shading, 0, 80) / 200)   ← /200 = 0.5/100, clamp 80 kaldırıldı
// ─────────────────────────────────────────────────────────────────────────────
const BIFACIAL_BACK_SHADE_FACTOR = 0.50;
function bifacialFactor(gain, shadingPct) {
  const clamped = Math.max(0, Math.min(100, shadingPct));
  return 1.0 + gain * Math.max(0.0, 1.0 - clamped * BIFACIAL_BACK_SHADE_FACTOR / 100.0);
}

// Mono panel (gain=0) → her zaman 1.0
assert.equal(bifacialFactor(0, 0),   1.0, 'ALG-01: mono, 0% gölge → 1.0');
assert.equal(bifacialFactor(0, 50),  1.0, 'ALG-01: mono, 50% gölge → 1.0');
assert.equal(bifacialFactor(0, 100), 1.0, 'ALG-01: mono, 100% gölge → 1.0');

// Bifacial (gain=0.10)
nearly(bifacialFactor(0.10, 0),   1.10, 1e-9, 'ALG-01: bifacial 0% gölge = 1.10');
// 1 + 0.10 * (1 - 40*0.50/100) = 1 + 0.10*0.80 = 1.08
nearly(bifacialFactor(0.10, 40),  1.08, 1e-9, 'ALG-01: bifacial 40% gölge = 1.08');
nearly(bifacialFactor(0.10, 80),  1.06, 1e-9, 'ALG-01: bifacial 80% gölge = 1.06');
nearly(bifacialFactor(0.10, 100), 1.05, 1e-9, 'ALG-01: bifacial 100% gölge = 1.05');

// Guard: bifacial faktör hiçbir zaman 1.0'ın altına inmez (max(0,...) koruması)
assert.ok(bifacialFactor(0.10, 100) >= 1.0, 'ALG-01: gain>0 → her zaman ≥ 1.0');
assert.ok(bifacialFactor(0.10, 150) >= 1.0, 'ALG-01: aşırı gölge girdisi guard ile engellenir');

// ─────────────────────────────────────────────────────────────────────────────
// ALG-02: PSH Meteorolojik Sınırlar
// GHI_ANNUAL_MIN=900, GHI_ANNUAL_MAX=2100, PSH_MIN=2.5, PSH_MAX=5.8
// ─────────────────────────────────────────────────────────────────────────────
const GHI_MIN = 900, GHI_MAX = 2100, PSH_MIN = 2.5, PSH_MAX = 5.8;
function pshFromGhi(ghi) {
  const ghiC = Math.max(GHI_MIN, Math.min(GHI_MAX, ghi));
  return Math.max(PSH_MIN, Math.min(PSH_MAX, ghiC / 365.0));
}

// Üst GHI sınırı koruması: GHI_MAX=2100 → PSH=2100/365≈5.75 (PSH_MAX=5.8 altında)
// PSH_MAX ancak ham PSH değeri > 5.8 girildiğinde (0<v≤20 path) devreye girer.
assert.equal(pshFromGhi(9999), pshFromGhi(2100), 'ALG-02: GHI=9999 = GHI=2100 (GHI_MAX\'e clamped)');
assert.equal(pshFromGhi(2500), pshFromGhi(2100), 'ALG-02: GHI=2500 = GHI=2100 (GHI_MAX\'e clamped)');
nearly(pshFromGhi(2100), 2100/365, 1e-4, 'ALG-02: GHI=2100 → PSH≈5.75 h/gün');

// Alt sınır koruması
assert.equal(pshFromGhi(100), PSH_MIN, 'ALG-02: GHI=100 → PSH_MIN');
assert.equal(pshFromGhi(0),   PSH_MIN, 'ALG-02: GHI=0 → PSH_MIN');

// Normal aralık
nearly(pshFromGhi(1600), 1600/365, 1e-4, 'ALG-02: İstanbul tipik GHI=1600 → ~4.38 h/gün');
nearly(pshFromGhi(1800), 1800/365, 1e-4, 'ALG-02: Antalya tipik GHI=1800 → ~4.93 h/gün');

// Çıktı her zaman sınır içinde
for (const ghi of [0, 500, 900, 1200, 1600, 2000, 2100, 3000]) {
  const psh = pshFromGhi(ghi);
  assert.ok(psh >= PSH_MIN && psh <= PSH_MAX, `ALG-02: GHI=${ghi} → PSH=${psh.toFixed(2)} [${PSH_MIN},${PSH_MAX}] içinde`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ALG-03: Azimuth Faktörü Simetri ve Gradient
// AZIMUTH_PENALTY_DEG=0.00183, AZIMUTH_MIN_FACTOR=0.50
// ─────────────────────────────────────────────────────────────────────────────
const AZIMUTH_PENALTY = 0.00183;
const AZIMUTH_MIN    = 0.50;
function azimuthFactor(azimuth) {
  const normalized = ((azimuth % 360) + 360) % 360;
  const delta = Math.abs(normalized - 180);
  return Math.max(AZIMUTH_MIN, Math.min(1.0, 1.0 - delta * AZIMUTH_PENALTY));
}

// Güney referans
assert.equal(azimuthFactor(180), 1.0, 'ALG-03: Güney (180°) = 1.0');

// Doğu/Batı simetrisi
nearly(azimuthFactor(90),  azimuthFactor(270), 1e-9, 'ALG-03: Doğu(90°) = Batı(270°)');
nearly(azimuthFactor(135), azimuthFactor(225), 1e-9, 'ALG-03: GB=GD simetrik');
nearly(azimuthFactor(45),  azimuthFactor(315), 1e-9, 'ALG-03: KB=KD simetrik');

// Kuzey: delta=180 → 1 - 180*0.00183 = 0.6706. AZIMUTH_MIN=0.50 klabı alt emniyet,
// 0.00183 cezasıyla delta≤180 aralığında hiç devreye girmez (0.6706 > 0.50).
const northFactor = 1.0 - 180 * AZIMUTH_PENALTY;
nearly(azimuthFactor(0),   northFactor, 1e-9, 'ALG-03: Kuzey (0°) = 1 - 180×penalty');
nearly(azimuthFactor(360), northFactor, 1e-9, 'ALG-03: Kuzey (360°) = Kuzey (0°) ile aynı');
// AZIMUTH_MIN asla devreye girmez, ancak minimum koruma olarak var
assert.ok(azimuthFactor(0) >= AZIMUTH_MIN, 'ALG-03: Kuzey >= AZIMUTH_MIN (güvenlik ağı)');

// Doğu/Batı değeri tutarlı
nearly(azimuthFactor(90), 1.0 - 90 * AZIMUTH_PENALTY, 1e-9, 'ALG-03: Doğu faktörü formülle tutarlı');

// Gradient yönü: Güney'den uzaklaştıkça azalır
assert.ok(azimuthFactor(180) > azimuthFactor(135), 'ALG-03: Güney > Güneybatı');
assert.ok(azimuthFactor(135) > azimuthFactor(90),  'ALG-03: Güneybatı > Batı');
assert.ok(azimuthFactor(90)  > azimuthFactor(45),  'ALG-03: Batı > Kuzeybatı');

// ─────────────────────────────────────────────────────────────────────────────
// ALG-05: Batarya Verimliliği — Çarpımsal Model
// Eski: base * (1 - ratePenalty - socPenalty) — toplamsal
// Yeni: base * (1 - ratePenalty) * (1 - socPenalty) — çarpımsal
// ─────────────────────────────────────────────────────────────────────────────
function batteryEffMultiplicative(base, ratePenalty, socPenalty) {
  return Math.max(0.5, Math.min(1.0, base * (1 - ratePenalty) * (1 - socPenalty)));
}
function batteryEffAdditive(base, ratePenalty, socPenalty) {
  return Math.max(0.5, Math.min(1.0, base * (1 - ratePenalty - socPenalty)));
}

// Tipik LFP parametreleri (yüksek C-rate + yüksek SoC stres)
const base = 0.95, rate = 0.12, soc = 0.08;
const multResult = batteryEffMultiplicative(base, rate, soc);
const addResult  = batteryEffAdditive(base, rate, soc);

// Çarpımsal her zaman toplamsal'dan büyük (penaltılar küçük için)
assert.ok(multResult > addResult, 'ALG-05: çarpımsal > toplamsal (penaltılar bağımsız, küçük)');

// Her iki model de [0.5, 1.0] içinde
assert.ok(multResult >= 0.5 && multResult <= 1.0, 'ALG-05: çarpımsal [0.5, 1.0] içinde');
assert.ok(addResult  >= 0.5 && addResult  <= 1.0, 'ALG-05: toplamsal [0.5, 1.0] içinde');

// Stres yok → base döner
nearly(batteryEffMultiplicative(0.95, 0, 0), 0.95, 1e-9, 'ALG-05: stres=0 → base');

// Çok yüksek penaltı → clamp 0.5
assert.equal(batteryEffMultiplicative(0.95, 0.9, 0.9), 0.5, 'ALG-05: max penaltı → 0.5 clamp');

// Simetri kırılması: çarpımsal modelde sıra önemsiz
const multAB = batteryEffMultiplicative(0.95, rate, soc);
const multBA = batteryEffMultiplicative(0.95, soc, rate);
nearly(multAB, multBA, 1e-9, 'ALG-05: çarpımsal sıra bağımsız (a×b = b×a)');

// ─────────────────────────────────────────────────────────────────────────────
// ALG-07: Vergi Kalkanı NPV Anüite Faktörü
// taxShieldAnnuityFactor(years, rate) = (1-(1+r)^-N)/r
// ─────────────────────────────────────────────────────────────────────────────

// Default sabit
assert.equal(TAX_SHIELD_DEFAULT_DISCOUNT_RATE, 0.18, 'ALG-07: default iskonto %18');

// r=18%, N=10: anüite faktörü ≈ 4.494
const f10_18 = taxShieldAnnuityFactor(10, 0.18);
nearly(f10_18, 4.494, 0.001, 'ALG-07: r=18%, N=10 → ≈4.494');

// r=0 → N (L'Hôpital limiti)
nearly(taxShieldAnnuityFactor(10, 0), 10, 1e-9, 'ALG-07: r=0 → N=10 (nominal)');
nearly(taxShieldAnnuityFactor(5, 0),   5, 1e-9, 'ALG-07: r=0, N=5 → 5');

// NPV < Nominal her zaman (pozitif r ile)
const shieldNPV = 1000 * taxShieldAnnuityFactor(10, 0.18);
const shieldNom = 1000 * 10;
assert.ok(shieldNPV < shieldNom, 'ALG-07: NPV shield < nominal shield (zaman değeri)');
nearly(shieldNPV, 4494, 1, 'ALG-07: 1000 TRY × 10 yıl × %18 NPV ≈ 4494 TRY');

// Monoton azalış: r arttıkça faktör azalır
assert.ok(taxShieldAnnuityFactor(10, 0.10) > taxShieldAnnuityFactor(10, 0.18), 'ALG-07: r düşükse faktör büyük');
assert.ok(taxShieldAnnuityFactor(10, 0.18) > taxShieldAnnuityFactor(10, 0.30), 'ALG-07: r yüksekse faktör küçük');

// N arttıkça faktör artar (pozitif r için)
assert.ok(taxShieldAnnuityFactor(5, 0.18) < taxShieldAnnuityFactor(10, 0.18), 'ALG-07: N büyükse faktör büyük');

// resolveAmortYears uyumu
assert.equal(resolveAmortYears(0), 10, 'ALG-07: resolveAmortYears(0) → default 10');

// ─────────────────────────────────────────────────────────────────────────────
// ALG-08: Isı Pompası Derece-Gün Ağırlıkları
// ─────────────────────────────────────────────────────────────────────────────

// 12 eleman
assert.equal(HEATING_DEGREE_DAY_WEIGHTS.length, 12, 'ALG-08: ısıtma DD 12 eleman');
assert.equal(COOLING_DEGREE_DAY_WEIGHTS.length, 12, 'ALG-08: soğutma DD 12 eleman');

// Negatif değer yok
assert.ok(HEATING_DEGREE_DAY_WEIGHTS.every(v => v >= 0), 'ALG-08: ısıtma ağırlıkları ≥ 0');
assert.ok(COOLING_DEGREE_DAY_WEIGHTS.every(v => v >= 0), 'ALG-08: soğutma ağırlıkları ≥ 0');

// Toplam fiziksel aralıkta
const heatingSum = HEATING_DEGREE_DAY_WEIGHTS.reduce((s, v) => s + v, 0);
const coolingSum = COOLING_DEGREE_DAY_WEIGHTS.reduce((s, v) => s + v, 0);
assert.ok(heatingSum > 5 && heatingSum < 9, `ALG-08: ısıtma DD toplam ${heatingSum.toFixed(2)} ∈ [5,9]`);
assert.ok(coolingSum > 3 && coolingSum < 7, `ALG-08: soğutma DD toplam ${coolingSum.toFixed(2)} ∈ [3,7]`);

// Mevsimsel tutarlılık: yaz ısıtma = 0, kış soğutma = 0
assert.equal(HEATING_DEGREE_DAY_WEIGHTS[5], 0, 'ALG-08: Haziran ısıtma = 0');
assert.equal(HEATING_DEGREE_DAY_WEIGHTS[6], 0, 'ALG-08: Temmuz ısıtma = 0');
assert.equal(HEATING_DEGREE_DAY_WEIGHTS[7], 0, 'ALG-08: Ağustos ısıtma = 0');
assert.equal(COOLING_DEGREE_DAY_WEIGHTS[0],  0, 'ALG-08: Ocak soğutma = 0');
assert.equal(COOLING_DEGREE_DAY_WEIGHTS[1],  0, 'ALG-08: Şubat soğutma = 0');
assert.equal(COOLING_DEGREE_DAY_WEIGHTS[11], 0, 'ALG-08: Aralık soğutma = 0');

// Zirve aylar fiziksel olarak doğru: Ocak ısıtma pik, Temmuz soğutma pik
assert.equal(HEATING_DEGREE_DAY_WEIGHTS[0], Math.max(...HEATING_DEGREE_DAY_WEIGHTS), 'ALG-08: Ocak = ısıtma pik');
assert.equal(COOLING_DEGREE_DAY_WEIGHTS[6], Math.max(...COOLING_DEGREE_DAY_WEIGHTS), 'ALG-08: Temmuz = soğutma pik');

// Operasyon sabitleri tutarlı
assert.equal(HEATING_DAILY_BASE_HOURS, 8.0, 'ALG-08: Isıtma baz saati = 8');
assert.equal(COOLING_DAILY_BASE_HOURS, 8.0, 'ALG-08: Soğutma baz saati = 8');
assert.equal(HP_DAYS_PER_MONTH, 30.0,       'ALG-08: Ay uzunluğu = 30');
assert.ok(COOLING_LOAD_RATIO > 0.5 && COOLING_LOAD_RATIO < 0.8, 'ALG-08: soğutma yük oranı 0.5-0.8');

// Örnek üretim doğruluğu: 100m² × 70W/m² × 8h × heatingSum × 30 / 1000
const exampleArea = 100, exampleLoad = 70;
const heatDemand = exampleArea * exampleLoad * HEATING_DAILY_BASE_HOURS * heatingSum * HP_DAYS_PER_MONTH / 1000;
assert.ok(heatDemand > 1000 && heatDemand < 15000, `ALG-08: Örnek ısı talebi ${Math.round(heatDemand)} kWh/yıl fiziksel aralıkta`);

const coolDemand = exampleArea * exampleLoad * COOLING_LOAD_RATIO * COOLING_DAILY_BASE_HOURS * coolingSum * HP_DAYS_PER_MONTH / 1000;
assert.ok(coolDemand > 500 && coolDemand < 10000, `ALG-08: Örnek soğutma talebi ${Math.round(coolDemand)} kWh/yıl fiziksel aralıkta`);
assert.ok(coolDemand < heatDemand, 'ALG-08: soğutma talebi < ısıtma talebi (COOLING_LOAD_RATIO < 1)');

console.log('algorithm corrections tests passed');
