import assert from 'node:assert/strict';
import {
  resolveAmortYears,
  taxShieldAnnuityFactor,
  TAX_SHIELD_DEFAULT_DISCOUNT_RATE,
} from '../js/tax.js';

// Audit Bug #9: tax.js eskiden `tax.amortizationYears || 10` ve
// `parseInt(...) || 10` kullanıyordu — kullanıcı 0 girince 10'a sapıyordu.
// Yeni resolveAmortYears: 0/negatif/NaN → default; pozitif tamsayı korunur.

assert.equal(resolveAmortYears(undefined), 10, 'undefined → default');
assert.equal(resolveAmortYears(null), 10, 'null → default');
assert.equal(resolveAmortYears(NaN), 10, 'NaN → default');
assert.equal(resolveAmortYears(''), 10, 'boş string → default (Number("")===0)');
assert.equal(resolveAmortYears(0), 10, '0 → default (sıfırla bölme önlendi)');
assert.equal(resolveAmortYears(-5), 10, 'negatif → default');
assert.equal(resolveAmortYears('abc'), 10, 'parse fail → default');

assert.equal(resolveAmortYears(1), 1, 'minimum kabul edilen değer');
assert.equal(resolveAmortYears(5), 5, 'tipik 5 yıl');
assert.equal(resolveAmortYears(10), 10, 'default seviyesi');
assert.equal(resolveAmortYears(15), 15, 'üst aralık');
assert.equal(resolveAmortYears('7'), 7, 'string sayı');
assert.equal(resolveAmortYears(7.9), 7, 'ondalık → floor');

assert.equal(resolveAmortYears(undefined, 5), 5, 'özel default geçerli');
assert.equal(resolveAmortYears(0, 7), 7, 'özel default geçerli (0 girişinde)');

// ── ALG-07: Vergi Kalkanı NPV Anüite Faktörü Testleri ────────────────────────

function nearly(actual, expected, tol = 1e-3, label = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label ? label + ': ' : ''}beklenen ${expected}, alınan ${actual}`
  );
}

// Sabit değeri
assert.equal(TAX_SHIELD_DEFAULT_DISCOUNT_RATE, 0.18, 'Default iskonto oranı %18');

// Anüite faktörü doğruluğu: (1-(1+r)^-N)/r
// r=18%, N=10: 4.4941 (5 basamak hassasiyette)
nearly(taxShieldAnnuityFactor(10, 0.18), 4.494, 0.001, 'r=18%, N=10 → ≈4.494');
nearly(taxShieldAnnuityFactor(5,  0.18), 3.127, 0.001, 'r=18%, N=5  → ≈3.127');
nearly(taxShieldAnnuityFactor(10, 0.10), 6.145, 0.001, 'r=10%, N=10 → ≈6.145');
nearly(taxShieldAnnuityFactor(10, 0.30), 3.092, 0.001, 'r=30%, N=10 → ≈3.092');

// r=0 limiti → N
nearly(taxShieldAnnuityFactor(10, 0), 10, 1e-9, 'r=0, N=10 → 10 (nominal)');
nearly(taxShieldAnnuityFactor(5,  0),  5, 1e-9, 'r=0, N=5  → 5  (nominal)');
nearly(taxShieldAnnuityFactor(1,  0),  1, 1e-9, 'r=0, N=1  → 1  (nominal)');

// NPV her zaman nominalden küçük (r>0 için)
assert.ok(taxShieldAnnuityFactor(10, 0.18) < 10, 'ALG-07: NPV faktörü < N (zaman değeri)');
assert.ok(taxShieldAnnuityFactor(10, 0.01) < 10, 'ALG-07: çok düşük r için bile NPV < N');

// Monoton özellikler
assert.ok(
  taxShieldAnnuityFactor(10, 0.10) > taxShieldAnnuityFactor(10, 0.18),
  'ALG-07: r düşükse faktör büyük (daha az indirgeme)'
);
assert.ok(
  taxShieldAnnuityFactor(5, 0.18) < taxShieldAnnuityFactor(10, 0.18),
  'ALG-07: N büyükse faktör büyük'
);

// Pratik doğrulama: 1000 TRY/yıl × 10 yıl × %18 NPV
const annualShield = 1000;
const npvShield = annualShield * taxShieldAnnuityFactor(10, 0.18);
const nomShield = annualShield * 10;
assert.ok(npvShield < nomShield, 'ALG-07: NPV kalkanı < nominal kalkan');
nearly(npvShield, 4494, 1, 'ALG-07: 1000 × 10 yıl × %18 → ≈4494 TRY NPV');

// Fayda: eski yanlış hesap ~%123 abartıyordu
const overestimationPct = (nomShield - npvShield) / npvShield * 100;
assert.ok(overestimationPct > 100 && overestimationPct < 130,
  `ALG-07: Düzeltme öncesi abartma oranı ≈%${Math.round(overestimationPct)} (beklenen >%100)`
);

console.log('tax amort resolution tests passed');
