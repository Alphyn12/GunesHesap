import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PANEL_TYPES } from '../js/data.js';
import {
  buildTariffModel,
  calculateSystemLayout,
  estimateSolarCapex,
  resolveBifacialGainAssumption,
  resolvePanelSpec
} from '../js/calc-core.js';
import { buildPvEngineRequest } from '../js/pv-engine-contracts.js';

const cost = JSON.parse(await readFile(new URL('../shared/assumptions/cost-assumptions-tr-2026-q2.json', import.meta.url), 'utf8'));
const financial = JSON.parse(await readFile(new URL('../shared/assumptions/financial-assumptions-tr-2026-q2.json', import.meta.url), 'utf8'));
const costSchema = JSON.parse(await readFile(new URL('../shared/assumptions/cost-assumptions.schema.json', import.meta.url), 'utf8'));
const financialSchema = JSON.parse(await readFile(new URL('../shared/assumptions/financial-assumptions.schema.json', import.meta.url), 'utf8'));

function assertSchemaBasics(data, schema) {
  for (const key of schema.required || []) assert.ok(key in data, `missing required schema key: ${key}`);
  assert.equal(typeof data.version, 'string');
  assert.equal(data.currency, 'TRY');
  assert.match(data.sourceDate, /^\d{4}-\d{2}-\d{2}$/);
}

assertSchemaBasics(cost, costSchema);
assertSchemaBasics(financial, financialSchema);

for (const [key, item] of Object.entries(cost.panelPrices)) {
  assert.ok(item.low <= item.base && item.base <= item.high, `panel price band order: ${key}`);
  assert.ok(item.sourceDate && item.sourceLabel && item.confidence, `panel metadata: ${key}`);
}
for (const group of [cost.inverterAssumptions, cost.bosAssumptions, cost.vatProfiles, financial.financialProfiles]) {
  for (const [key, item] of Object.entries(group)) {
    assert.ok(item.sourceDate && item.sourceLabel && item.confidence, `assumption metadata: ${key}`);
  }
}

const basePanel = { ...PANEL_TYPES.mono_perc, key: 'mono_perc' };
const capex = profile => estimateSolarCapex({
  systemPowerKwp: 10,
  panel: basePanel,
  panelCount: 23,
  inverterTypeKey: 'string',
  costProfile: profile,
  vatProfile: 'standard'
});
const economy = capex('economy');
const standard = capex('standard');
const premium = capex('premium');
assert.ok(economy.solarCost >= 220000 && economy.solarCost <= 320000, `economy capex ${economy.solarCost}`);
assert.ok(standard.solarCost >= 280000 && standard.solarCost <= 420000, `standard capex ${standard.solarCost}`);
assert.ok(premium.solarCost > standard.solarCost);
assert.ok(premium.solarCost >= 380000);

const partial = estimateSolarCapex({
  systemPowerKwp: 10,
  panel: basePanel,
  panelCount: 23,
  costProfile: 'standard',
  vatProfile: 'standard',
  manualCostMode: 'partialManualOverride',
  manualCostOverrides: { inverterCost: 50000 }
});
assert.equal(partial.inverterCost, 50000);
assert.equal(partial.panelCost, standard.panelCost);

const full = estimateSolarCapex({
  systemPowerKwp: 10,
  panel: basePanel,
  panelCount: 23,
  costProfile: 'premium',
  vatProfile: 'standard',
  manualCostMode: 'fullManualBom',
  manualCostOverrides: { totalCost: 250000, kdv: 20000 }
});
assert.equal(full.subtotal, 250000);
assert.equal(full.solarKdv, 20000);
assert.equal(full.solarCost, 270000);

const manualVatFallback = estimateSolarCapex({
  systemPowerKwp: 10,
  panel: basePanel,
  panelCount: 23,
  costProfile: 'standard',
  vatProfile: 'manual'
});
assert.equal(manualVatFallback.vatProfile, 'standard');
assert.equal(manualVatFallback.requestedVatProfile, 'manual');
assert.equal(manualVatFallback.vatFallbackApplied, true);
assert.ok(manualVatFallback.solarKdv > 0);

const compactLayout = calculateSystemLayout({
  scenarioKey: 'on-grid',
  designTarget: 'fill-roof',
  panelType: 'mono_perc',
  panelFormFactor: 'compactResidential',
  roofArea: 100,
  usableRoofRatio: 0.75
});
const largeLayout = calculateSystemLayout({
  scenarioKey: 'on-grid',
  designTarget: 'fill-roof',
  panelType: 'mono_perc',
  panelFormFactor: 'largeFormatCommercial',
  roofArea: 100,
  usableRoofRatio: 0.75
});
assert.ok(largeLayout.panel.areaM2 > compactLayout.panel.areaM2);
assert.ok(largeLayout.panelCount < compactLayout.panelCount);
assert.notEqual(largeLayout.systemPower, compactLayout.systemPower);

const bifacialPanel = resolvePanelSpec({ panelType: 'bifacial_topcon' }, 'bifacial_topcon');
assert.equal(resolveBifacialGainAssumption({ panelType: 'bifacial_topcon' }, bifacialPanel).applied, false);
assert.equal(resolveBifacialGainAssumption({ panelType: 'bifacial_topcon', enableBifacialGain: true }, bifacialPanel).applied, true);

const legacyTariff = buildTariffModel({ tariff: 5, annualPriceIncrease: 0.17, discountRate: 0.21 });
assert.equal(legacyTariff.financialProfile, 'custom');
assert.deepEqual(legacyTariff.tariffIncreaseCurve, [{ fromYear: 1, toYear: 25, rate: 0.17 }]);
assert.equal(legacyTariff.discountRate, 0.21);

const request = buildPvEngineRequest({
  lat: 36.8969,
  lon: 30.7133,
  roofArea: 100,
  panelType: 'mono_perc',
  tariff: 3.23
});
assert.equal(request.assumptions.costAssumptionVersion, cost.version);
assert.equal(request.assumptions.financialAssumptionVersion, financial.version);
assert.equal(request.tariff.financialAssumptionVersion, financial.version);
assert.notEqual(request.tariff.discountRate, 0.12);

console.log('assumption model tests passed');
