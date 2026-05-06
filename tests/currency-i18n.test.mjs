import assert from 'node:assert/strict';
import {
  convertTry,
  FALLBACK_USD_TRY,
  EXCHANGE_RATE_CACHE_KEY,
  readCachedUsdTryRate,
  resolveUsdTryRate,
  setManualUsdTryRate
} from '../js/exchange-rate.js';
import { applyTextTranslations, persistLanguage, readSavedLanguage } from '../js/i18n.js';

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

assert.equal(convertTry(4000, 'TRY', 40), 4000);
assert.equal(convertTry(4000, 'USD', 40), 100);
assert.equal(convertTry(4000, 'USD', 0), 4000 / FALLBACK_USD_TRY);

const cachedStorage = memoryStorage({
  [EXCHANGE_RATE_CACHE_KEY]: JSON.stringify({ rate: 41.5, source: 'unit', timestamp: '2026-04-12T00:00:00.000Z' })
});
const cached = await resolveUsdTryRate({
  fetchImpl: async () => { throw new Error('network down'); },
  storage: cachedStorage
});
assert.equal(cached.rate, 41.5);
assert.match(cached.source, /cached/);

const fallback = await resolveUsdTryRate({
  fetchImpl: async () => { throw new Error('network down'); },
  storage: memoryStorage()
});
assert.equal(fallback.rate, FALLBACK_USD_TRY);
assert.equal(fallback.fallback, true);

globalThis.window = { state: {}, renderExchangeRateStatus: () => {} };
globalThis.document = { getElementById: () => null };
const manualStorage = memoryStorage();
const manual = setManualUsdTryRate(39.25, manualStorage);
assert.equal(manual.rate, 39.25);
assert.equal(readCachedUsdTryRate(manualStorage).source, 'manual');
delete globalThis.window;
delete globalThis.document;

const langStorage = memoryStorage();
assert.equal(readSavedLanguage(langStorage), 'tr');
assert.equal(persistLanguage('de', langStorage), 'de');
assert.equal(readSavedLanguage(langStorage), 'de');
assert.equal(persistLanguage('fr', langStorage), 'tr');

const titleEl = { textContent: '' };
const placeholderEl = { placeholder: '' };
const iconPreservingButton = {
  childNodes: [
    { nodeType: 1, tagName: 'svg' },
    { nodeType: 3, nodeValue: ' Use My Location ' }
  ],
  querySelector: () => null,
  getAttribute: () => null,
  textContent: ''
};
applyTextTranslations([
  { el: titleEl, key: 'step1.title' },
  { el: placeholderEl, key: 'step1.search', attr: 'placeholder' },
  { el: iconPreservingButton, key: 'step2.geoBtn' }
], key => ({
  'step1.title': 'Select Your Location',
  'step1.search': 'Search for a city...',
  'step2.geoBtn': 'Use My Location'
}[key] || key));
assert.equal(titleEl.textContent, 'Select Your Location');
assert.equal(placeholderEl.placeholder, 'Search for a city...');
assert.equal(iconPreservingButton.childNodes[0].tagName, 'svg');
assert.equal(iconPreservingButton.childNodes[1].nodeValue, ' Use My Location ');

console.log('currency and i18n tests passed');
