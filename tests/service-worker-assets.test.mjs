import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sw = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

function staticAssets(source) {
  const match = source.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(match, 'STATIC_ASSETS array not found');
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]));
}

const assets = staticAssets(sw);
assert.ok(/solarRota-v\d+/.test(sw), 'cache name must be bumped when active assets change');

for (const required of [
  '/',
  '/index.html',
  '/new_logo.png',
  '/css/components.css',
  '/css/redesign.css',
  '/css/mobile.css',
  '/js/app.js',
  '/js/scenario-icons.js',
  '/js/pvlib-bridge.js',
  '/js/backend-config.js',
  '/js/calculation-service.js',
  '/js/pv-engine-contracts.js',
  '/js/output-i18n.js',
  '/fixtures/bom-suppliers.json'
]) {
  assert.ok(assets.has(required), `${required} missing from service worker precache`);
}

for (const href of [...index.matchAll(/<link[^>]+href="(css\/[^"]+)"/g)].map(match => `/${match[1]}`)) {
  assert.ok(assets.has(href), `${href} stylesheet is loaded by index.html but not precached`);
}

for (const modulePath of [...app.matchAll(/from '\.\/([^']+\.js)'/g)].map(match => `/js/${match[1]}`)) {
  assert.ok(assets.has(modulePath), `${modulePath} is imported by app.js but not precached`);
}

console.log('service worker asset tests passed');
