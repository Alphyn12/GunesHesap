import assert from 'node:assert/strict';
import {
  CITY_SUMMER_TEMPS,
  resolveCitySummerTemp,
  resolveSummerTempDefault
} from '../js/data.js';

// Audit Bug #26: Bilinmeyen şehir + lat verisi varsa düz 32 yerine bölgesel default kullan.

// Bilinen şehir → tablodaki kesin değer (lat verilse bile)
assert.equal(resolveCitySummerTemp('Antalya', 36.9), 35);
assert.equal(resolveCitySummerTemp('Şanlıurfa', 37.2), 38);
assert.equal(resolveCitySummerTemp('Trabzon', 41.0), 24);

// Bilinmeyen şehir + lat verisi → bölgesel default
assert.equal(resolveCitySummerTemp('Yeni Şehir', 41.5), 26, 'Karadeniz kuzey');
assert.equal(resolveCitySummerTemp('Yeni Şehir', 39.5), 30, 'İç/Kuzey Anadolu');
assert.equal(resolveCitySummerTemp('Yeni Şehir', 37.5), 33, 'Ege/Akdeniz geçiş');
assert.equal(resolveCitySummerTemp('Yeni Şehir', 36.8), 36, 'Akdeniz/GD Anadolu');

// Bilinmeyen şehir + lat yok → mevcut flat default korunur (geri uyumluluk)
assert.equal(resolveCitySummerTemp('Yeni Şehir', null), CITY_SUMMER_TEMPS.default);
assert.equal(resolveCitySummerTemp('Yeni Şehir', undefined), CITY_SUMMER_TEMPS.default);
assert.equal(resolveCitySummerTemp('Yeni Şehir', NaN), CITY_SUMMER_TEMPS.default);

// resolveSummerTempDefault eşik kontrolleri
assert.equal(resolveSummerTempDefault(40.5), 26, '40.5 sınırı dahil');
assert.equal(resolveSummerTempDefault(38.5), 30, '38.5 sınırı dahil');
assert.equal(resolveSummerTempDefault(37.0), 33, '37.0 sınırı dahil');
assert.equal(resolveSummerTempDefault(36.9), 36, '37.0 altı');

console.log('city summer temp tests passed');
