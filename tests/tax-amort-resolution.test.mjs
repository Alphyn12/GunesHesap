import assert from 'node:assert/strict';
import { resolveAmortYears } from '../js/tax.js';

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

console.log('tax amort resolution tests passed');
