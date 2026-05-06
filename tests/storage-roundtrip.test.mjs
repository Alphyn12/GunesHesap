import assert from 'node:assert/strict';
import { loadProposalState, saveProposalState } from '../js/storage.js';

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
};

const state = {
  multiRoof: true,
  tariffIncludesTax: false,
  tariffSourceCheckedAt: '2026-04-14T12:00:00Z',
  exchangeRate: { source: 'manual/fallback', fetchedAt: '2026-04-14T12:00:00Z' },
  roofSections: [{ area: 20, tilt: 30, azimuth: 180, azimuthCoeff: 1, shadingFactor: 5 }],
  results: { annualEnergy: 999999 }
};

assert.equal(saveProposalState(state), true);
const restored = loadProposalState();
assert.equal(restored.state.multiRoof, true);
assert.equal(restored.state.tariffIncludesTax, false);
assert.equal(restored.state.tariffSourceCheckedAt, '2026-04-14T12:00:00Z');
assert.equal(restored.state.exchangeRate.source, 'manual/fallback');
assert.equal(restored.state.roofSections.length, 1);
assert.equal('results' in restored.state, false);

console.log('storage roundtrip tests passed');
