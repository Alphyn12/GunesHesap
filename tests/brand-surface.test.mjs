import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const oldBrand = /GüneşHesap|GunesHesap|Güneş\s+Hesap|Gunes\s+Hesap/g;
const userFacingFiles = [
  '../index.html',
  '../manifest.json',
  '../service-worker.js',
  '../locales/tr.json',
  '../locales/en.json',
  '../locales/de.json',
  '../js/ui-render.js',
  '../js/dashboard.js',
  '../backend/main.py',
  '../backend/models/engine_contracts.py',
  '../backend/engines/pvlib_engine.py',
];

for (const relativePath of userFacingFiles) {
  const content = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  assert.doesNotMatch(content, oldBrand, `${relativePath} contains the old visible brand`);
}

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const tr = JSON.parse(await readFile(new URL('../locales/tr.json', import.meta.url), 'utf8'));
const en = JSON.parse(await readFile(new URL('../locales/en.json', import.meta.url), 'utf8'));
const de = JSON.parse(await readFile(new URL('../locales/de.json', import.meta.url), 'utf8'));

assert.match(index, /<title>Solar Rota/);
assert.match(index, /<(?:div|span) class="logo-text">Solar Rota<\/(?:div|span)>/);
assert.equal(manifest.name, 'Solar Rota');
assert.equal(manifest.short_name, 'Solar Rota');
assert.equal(tr.app.title, 'Solar Rota');
assert.equal(en.app.title, 'Solar Rota');
assert.equal(de.app.title, 'Solar Rota');
assert.equal(en.report.technicalTitle, 'Solar Rota Technical Calculation Report');

console.log('brand surface tests passed');
