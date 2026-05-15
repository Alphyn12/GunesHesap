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
assert.match(vercelJson, /https:\/\/maps\.googleapis\.com/,
  'Google Maps integration requires maps.googleapis.com in CSP');
assert.match(vercelJson, /https:\/\/\*\.gstatic\.com/,
  'Google Maps integration requires gstatic in CSP');

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
const heatmapJs = await readFile(new URL('../js/heatmap.js', import.meta.url), 'utf8');
const googleProviderJs = await readFile(new URL('../js/google-maps-provider.js', import.meta.url), 'utf8');
assert.doesNotMatch(appJs, /style\.setProperty\('--card-color'/,
  'CSP invariant: scenario cards must use CSS classes, not inline --card-color styles');
assert.match(appJs, /function stripInlineSvgStyles\(svg = ''\)/,
  'Scenario icon SVGs must be sanitized before render to avoid inline <style> CSP violations');
assert.match(appJs, /const icon = stripInlineSvgStyles\(SCENARIO_ICONS\?\.\[scenario\.key\] \|\| ''\);/,
  'renderScenarioCards must not inject SVG <style> blocks from SCENARIO_ICONS');
assert.match(appJs, /removeLayer\(darkLayer\)/,
  'Carto tile errors must disable the dark layer before switching to OSM fallback');
assert.match(appJs, /getDefaultMapProvider\(\)/,
  'Map init must route through provider config');
assert.match(appJs, /initGoogleMap/,
  'Production default map provider must initialize Google Maps');
assert.match(appJs, /const safeGetGhiColor = typeof getGHIColor === 'function' \? getGHIColor : fallbackGHIColor;/,
  'Google Maps init must use the locally defined GHI color helper safely');
assert.doesNotMatch(appJs, /\bgetGhiColor,\s*\n/,
  'Google Maps init must not reference an undefined getGhiColor shorthand');
assert.match(appJs, /Harita sağlayıcısı step 2\/3'e girildiğinde lazy-load edilir/,
  'Map provider must be lazy-loaded instead of initialized during DOMContentLoaded');
assert.match(appJs, /requestAnimationFrame\(\(\) => ensureMapForStep\(n\)\)/,
  'Step navigation must trigger map provider init after step 2/3 render');
assert.match(appJs, /if \(n === state\.step\) \{\s*requestAnimationFrame\(\(\) => ensureMapForStep\(n\)\);/s,
  'Re-entering the active map step must still trigger lazy map init');
assert.doesNotMatch(appJs, /darkLayer\.addTo\(map\);/,
  'Carto dark_all must not be added during map init');
assert.doesNotMatch(appJs, /try \{ initMap\(\); \} catch/,
  'Map must not initialize during first page load');
assert.doesNotMatch(indexHtml, /maps\.googleapis\.com\/maps\/api\/js/,
  'Google Maps script must be lazy-loaded by the provider, not loaded from index.html');
assert.doesNotMatch(googleProviderJs, /libraries=places/,
  'Google Maps provider must not request Places library');
assert.doesNotMatch(googleProviderJs, /Geocoding|Directions|Routes|Solar API|places/i,
  'Google Maps provider must not integrate Geocoding, Routes, or Solar APIs');
assert.doesNotMatch(heatmapJs, /tile\.openstreetmap\.org|basemaps\.cartocdn\.com/,
  'Heatmap must not initialize OSM/Carto tiles');
assert.doesNotMatch(appJs, /location-warning['"]\)\.style\.display/,
  'Location warning visibility must use classes instead of inline style writes');
assert.match(appJs, /function applyGoogleMapSuccessState\(container = document\.getElementById\('map'\)\)/,
  'Google Maps successful init must apply an explicit success state');
assert.match(appJs, /querySelectorAll\('\.map-manual-fallback'\)\.forEach\(el => el\.remove\(\)\)/,
  'Google Maps successful init must remove manual fallback overlays');
assert.match(appJs, /if \(window\._googleMapAdapter\) \{\s*applyGoogleMapSuccessState\(container\);/s,
  'Reusing an existing Google Maps adapter must still clear fallback UI');
assert.match(appJs, /if \(map\) \{\s*if \(window\._mapProvider === 'google'\) applyGoogleMapSuccessState\(document\.getElementById\('map'\)\);/s,
  'Re-entering Step 2 or Step 3 with an existing Google map must keep success UI active');
assert.match(appJs, /isMapContainerReady\(container\) && attempt < 6/s,
  'Google Maps init should wait briefly for the visible Step 2/3 container before creating the map');
assert.match(appJs, /_cartoTilesDisabled = true/,
  'Carto tile errors must disable Carto for the rest of the session');

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
