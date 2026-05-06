import assert from 'node:assert/strict';
import { callPythonEngineeringBackend } from '../js/pvlib-bridge.js';

const endpoint = process.env.GUNESHESAP_BACKEND_ENDPOINT || 'http://127.0.0.1:8000/api/pv/calculate';

const response = await callPythonEngineeringBackend({
  enginePreference: 'python-backend',
  scenarioKey: 'on-grid',
  scenarioContext: { label: 'On-Grid', proposalTone: 'commercial-grid' },
  lat: 39.9334,
  lon: 32.8597,
  cityName: 'Ankara',
  ghi: 1620,
  roofArea: 80,
  tilt: 33,
  azimuth: 180,
  azimuthName: 'Güney',
  shadingFactor: 10,
  soilingFactor: 3,
  panelType: 'mono',
  inverterType: 'string',
  dailyConsumption: 30,
  tariffType: 'commercial',
  tariff: 8.44,
  exportTariff: 2,
  annualPriceIncrease: 0.12,
  discountRate: 0.18
}, { endpoint, timeoutMs: 3000 });

assert.equal(response.schema, 'GH-PV-ENGINE-CONTRACT-2026.04-v1');
assert.equal(response.engineSource.engine, 'python-backend');
assert.equal(response.engineSource.pvlibReady, true);
assert.ok(['pvlib-backed', 'Python backend deterministic fallback', 'Python backend pvlib-ready'].includes(response.engineSource.source));
assert.ok(['engineering-mvp', 'fallback-estimate', 'adapter-ready'].includes(response.engineSource.engineQuality));
assert.ok(['pvlib-backed', 'python-deterministic-fallback'].includes(response.production.engine_used));
assert.ok(response.production.annualEnergyKwh > 0);
assert.equal(response.production.monthlyEnergyKwh.length, 12);
assert.ok(response.financial.annualSavingsTry > 0);

console.log(`backend bridge smoke passed: ${response.engineSource.source} / ${response.engineSource.engineQuality}`);
