import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createShareStateSnapshot, escapeHtml, sanitizeLocalState, sanitizeSharedState } from '../js/security.js';

// ── F1 invariant: HTML/CSS/JS inline + CSP unsafe-inline ─────────────────
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const vercelJson = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');

assert.doesNotMatch(indexHtml, /\son(click|change|input|submit|focus|blur|keydown|toggle|load|mouseover|mouseenter|mouseleave)\s*=/,
  'F1 invariant: index.html must not contain inline event handlers');
assert.doesNotMatch(indexHtml, /\sstyle\s*=\s*"/,
  'F1 invariant: index.html must not contain inline style="" attributes');
assert.doesNotMatch(indexHtml, /<script(?![^>]*\bsrc=)/,
  'F1 invariant: index.html must not contain inline <script> blocks');
assert.doesNotMatch(indexHtml, /<style[^>]*>/,
  'F1 invariant: index.html must not contain inline <style> blocks');
assert.doesNotMatch(vercelJson, /'unsafe-inline'/,
  "F1 invariant: vercel.json CSP must not contain 'unsafe-inline'");
assert.match(vercelJson, /https:\/\/nominatim\.openstreetmap\.org/,
  'F1 invariant: vercel.json connect-src must include Nominatim');

const jsDir = new URL('../js/', import.meta.url);
const jsFiles = (await readdir(jsDir)).filter(f => f.endsWith('.js'));
for (const f of jsFiles) {
  const content = await readFile(new URL(f, jsDir), 'utf8');
  assert.doesNotMatch(content, /\sstyle\s*=\s*"/,
    `F1 invariant: js/${f} must not inject inline style="" via templates`);
  assert.doesNotMatch(content, /\sonclick\s*=\s*"/,
    `F1 invariant: js/${f} must not inject inline onclick="" via templates`);
}

const appJs = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
assert.doesNotMatch(appJs, /style\.setProperty\('--card-color'/,
  'CSP invariant: scenario cards must use CSS classes, not inline --card-color styles');

assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');

const sanitized = sanitizeSharedState({
  cityName: '<b>Ankara</b>',
  lat: 120,
  lon: 32.85,
  roofArea: -50,
  shadingFactor: 999,
  panelType: 'not-real',
  displayCurrency: 'EUR',
  monthlyConsumption: [1, '2', -3, Number.NaN, ...new Array(20).fill(5)],
  results: { annualEnergy: 999 },
  __proto__: { polluted: true },
  tax: {
    hasIncentiveCert: true,
    investmentContribution: '<script>x</script>'
  }
});

assert.equal(sanitized.cityName, '<b>Ankara</b>');
assert.equal(sanitized.lat, 90);
assert.equal(sanitized.lon, 32.85);
assert.equal(sanitized.roofArea, 0);
assert.equal(sanitized.shadingFactor, 80);
assert.equal('panelType' in sanitized, false);
assert.equal('displayCurrency' in sanitized, false);
assert.equal(sanitized.monthlyConsumption.length, 12);
assert.equal(sanitized.monthlyConsumption[0], 1);
assert.equal(sanitized.monthlyConsumption[2], 0);
assert.equal('results' in sanitized, false);
assert.equal({}.polluted, undefined);
assert.equal(sanitized.tax.hasIncentiveCert, true);
assert.equal(sanitized.tax.investmentContribution, '<script>x</script>');
assert.equal(sanitizeSharedState({ step: 7 }).step, 7);
assert.equal(sanitizeSharedState({ multiRoof: true, tariffIncludesTax: false }).multiRoof, true);
assert.equal(sanitizeSharedState({ multiRoof: true, tariffIncludesTax: false }).tariffIncludesTax, false);
assert.equal(sanitizeSharedState({ panelType: 'poly' }).panelType, 'n_type_topcon');
assert.equal(sanitizeSharedState({ panelSelectionMode: 'advanced' }).panelSelectionMode, 'advanced');
assert.equal('panelSelectionMode' in sanitizeSharedState({ panelSelectionMode: 'expert' }), false);
assert.equal(sanitizeSharedState({ costProfile: 'premium' }).costProfile, 'premium');
assert.equal('costProfile' in sanitizeSharedState({ costProfile: 'invalid' }), false);
assert.equal(sanitizeSharedState({ panelFormFactor: 'largeFormatCommercial' }).panelFormFactor, 'largeFormatCommercial');
assert.equal('panelFormFactor' in sanitizeSharedState({ panelFormFactor: 'huge' }), false);
assert.equal(sanitizeSharedState({ financialProfile: 'custom' }).financialProfile, 'custom');
assert.equal('financialProfile' in sanitizeSharedState({ financialProfile: 'legacy' }), false);
assert.equal(sanitizeSharedState({ vatProfile: 'manual' }).vatProfile, 'manual');
assert.equal('vatProfile' in sanitizeSharedState({ vatProfile: 'zero' }), false);
assert.equal(sanitizeSharedState({ manualCostMode: 'partialManualOverride' }).manualCostMode, 'partialManualOverride');
assert.equal('manualCostMode' in sanitizeSharedState({ manualCostMode: 'all' }), false);

const snapshot = createShareStateSnapshot({
  cityName: 'Izmir',
  results: { unsafe: true },
  roofSections: [{ area: 10, tilt: 90, azimuth: 180, azimuthCoeff: 1, shadingFactor: 10 }]
});
assert.equal(snapshot.cityName, 'Izmir');
assert.equal('results' in snapshot, false);
assert.equal(snapshot.roofSections[0].tilt, 90);

const local = sanitizeLocalState({
  multiRoof: true,
  tariffIncludesTax: false,
  tariffSourceCheckedAt: '2026-04-14T12:00:00Z',
  exchangeRate: { source: 'manual/fallback', fetchedAt: '2026-04-14T12:00:00Z' },
  previewSystemPower: 12.34
});
assert.equal(local.multiRoof, true);
assert.equal(local.tariffIncludesTax, false);
assert.equal(local.tariffSourceCheckedAt, '2026-04-14T12:00:00Z');
assert.equal(local.exchangeRate.source, 'manual/fallback');
assert.equal(local.previewSystemPower, 12.34);

console.log('security state tests passed');
