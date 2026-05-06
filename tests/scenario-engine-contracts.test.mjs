import assert from 'node:assert/strict';
import { applyScenarioDefaults, getScenarioDefinition, listScenarioDefinitions, scenarioSourceQualityNote } from '../js/scenario-workflows.js';
import {
  buildEngineSourceMeta,
  buildPvEngineRequest,
  getPvEngineRequestIssues,
  hasValidSiteCoordinates,
  isAuthoritativeBackendResponse,
  normalizePvEngineResponse
} from '../js/pv-engine-contracts.js';
import { createSolarEngineContext, resolveExternalEngine, sourceMetaForCurrentCalculation } from '../js/solar-engine-adapter.js';

assert.equal(listScenarioDefinitions().length, 6);
assert.equal(getScenarioDefinition('off-grid').visibleBlocks.netMetering, false);

const offgrid = applyScenarioDefaults({ dailyConsumption: 30, netMeteringEnabled: true }, 'off-grid');
assert.equal(offgrid.scenarioKey, 'off-grid');
assert.equal(offgrid.netMeteringEnabled, false);
assert.equal(offgrid.batteryEnabled, true);
assert.equal(offgrid.scenarioContext.proposalTone, 'autonomy');

const irrigation = applyScenarioDefaults({}, 'agricultural-irrigation');
assert.equal(irrigation.tariffType, 'agriculture');
assert.equal(irrigation.scenarioContext.visibleBlocks.netMetering, false);

const request = buildPvEngineRequest({
  scenarioKey: 'ev-charging',
  scenarioContext: { label: 'EV Charging Station', proposalTone: 'charging' },
  lat: 39.9,
  lon: 32.8,
  cityName: 'Ankara',
  roofArea: 100,
  tilt: 30,
  azimuth: 180,
  panelType: 'mono',
  inverterType: 'string',
  dailyConsumption: 50,
  hourlyConsumption8760: new Array(8760).fill(1),
  tariffType: 'commercial',
  tariff: 8
});
assert.equal(request.schema, 'GH-PV-ENGINE-CONTRACT-2026.04-v1');
assert.equal(request.scenario.key, 'ev-charging');
assert.equal(request.load.hourlyConsumption8760.length, 8760);
assert.equal(request.tariff.tariffType, 'commercial');
assert.equal(request.tariff.annualPriceIncrease, 0.12);
assert.equal(request.tariff.discountRate, 0.18);
assert.equal(request.system.targetPowerKwp, null);
assert.equal(request.system.layoutSnapshot.authoritativeSizing, true);
assert.ok(request.system.layoutSnapshot.panelCount > 0);
assert.equal(request.system.panelWattPeak, 435);
assert.ok(Math.abs(request.system.panelAreaM2 - (1.134 * 1.762)) < 1e-9);
assert.equal(request.system.inverterEfficiency, 0.984);
assert.equal(request.system.cableLossPct, 0);
assert.equal(request.parity.authoritativeSourceRule, 'one-production-source-per-run');

const staleResultRequest = buildPvEngineRequest({
  lat: 39.9,
  lon: 32.8,
  roofArea: 40,
  results: { systemPower: 999 }
});
assert.equal(staleResultRequest.system.targetPowerKwp, null);

const billOffsetRequest = buildPvEngineRequest({
  scenarioKey: 'on-grid',
  designTarget: 'bill-offset',
  lat: 39.9,
  lon: 32.8,
  roofArea: 100,
  panelType: 'mono',
  dailyConsumption: 3,
  annualConsumptionKwh: 1095,
  ghi: 1600,
  usableRoofRatio: 0.75
});
assert.equal(billOffsetRequest.system.layoutSnapshot.designTargetApplied, 'bill-offset');
assert.equal(billOffsetRequest.system.layoutSnapshot.limitedBy, 'bill-target');
assert.equal(billOffsetRequest.system.chosenSystemPowerKwp, billOffsetRequest.system.layoutSnapshot.chosenSystemPowerKwp);
assert.ok(billOffsetRequest.system.layoutSnapshot.panelCount < request.system.layoutSnapshot.panelCount);

const roofLimitedRequest = buildPvEngineRequest({
  scenarioKey: 'on-grid',
  designTarget: 'fill-roof',
  lat: 39.9,
  lon: 32.8,
  roofArea: 35,
  panelType: 'mono',
  annualConsumptionKwh: 50000,
  ghi: 1600,
  usableRoofRatio: 0.6
});
assert.equal(roofLimitedRequest.system.layoutSnapshot.designTargetApplied, 'fill-roof');
assert.equal(roofLimitedRequest.system.layoutSnapshot.limitedBy, 'roof-area');
assert.equal(roofLimitedRequest.system.authoritativePanelCount, roofLimitedRequest.system.layoutSnapshot.panelCount);

const qcellsCatalogRequest = buildPvEngineRequest({
  scenarioKey: 'on-grid',
  lat: 39.9,
  lon: 32.8,
  roofArea: 60,
  panelType: 'n_type_topcon',
  panelCatalogId: 'qcells_qtron_blk_mg2',
  usableRoofRatio: 0.75
});
assert.equal(qcellsCatalogRequest.system.panelWattPeak, 440);
assert.ok(Math.abs(qcellsCatalogRequest.system.panelAreaM2 - (1.722 * 1.134)) < 1e-9);
assert.equal(qcellsCatalogRequest.system.layoutSnapshot.panelCount, 23);

const explicitTargetRequest = buildPvEngineRequest({
  lat: 39.9,
  lon: 32.8,
  roofArea: 40,
  targetSystemPowerKwp: 12.5,
  results: { systemPower: 999 }
});
assert.equal(explicitTargetRequest.system.targetPowerKwp, 12.5);

const cableLossRequest = buildPvEngineRequest({
  lat: 39.9,
  lon: 32.8,
  roofArea: 40,
  cableLossEnabled: true,
  cableLoss: { totalLossPct: 1.75 }
});
assert.equal(cableLossRequest.system.cableLossPct, 1.75);
assert.equal(cableLossRequest.system.wiringMismatchPct, 1.75);

const onGridTariffRequest = buildPvEngineRequest({
  scenarioKey: 'on-grid',
  lat: 39.9,
  lon: 32.8,
  roofArea: 40,
  tariff: 5,
  tariffInputMode: 'net-plus-fee',
  distributionFee: 1.2
});
assert.equal(onGridTariffRequest.tariff.importRateTryKwh, 5);
assert.equal(onGridTariffRequest.tariff.tariffInputMode, 'net-plus-fee');
assert.equal(onGridTariffRequest.tariff.distributionFeeTryKwh, 1.2);

const offgridNoGeneratorRequest = buildPvEngineRequest({
  scenarioKey: 'off-grid',
  lat: 39.9,
  lon: 32.8,
  roofArea: 40,
  offgridCalculationMode: 'advanced',
  offgridGeneratorEnabled: false
});
assert.equal(offgridNoGeneratorRequest.offgrid.generatorEnabled, false);
assert.equal(offgridNoGeneratorRequest.offgrid.calculationMode, 'advanced');
assert.equal(offgridNoGeneratorRequest.offgrid.fieldRevalidationRequired.includes('offgridGeneratorServiceRecord'), false);
assert.ok(offgridNoGeneratorRequest.offgrid.fieldRevalidationSkipped.includes('offgridGeneratorServiceRecord'));

const offgridGeneratorRequest = buildPvEngineRequest({
  scenarioKey: 'off-grid',
  lat: 39.9,
  lon: 32.8,
  roofArea: 40,
  offgridGeneratorEnabled: true,
  offgridGeneratorKw: 5
});
assert.equal(offgridGeneratorRequest.offgrid.generatorEnabled, true);
assert.ok(offgridGeneratorRequest.offgrid.fieldRevalidationRequired.includes('offgridGeneratorServiceRecord'));
assert.equal(offgridGeneratorRequest.offgrid.fieldRevalidationSkipped.length, 0);

const missingCoordinateRequest = buildPvEngineRequest({ lat: null, lon: undefined, results: { systemPower: 5 } });
assert.equal(missingCoordinateRequest.site.lat, null);
assert.equal(missingCoordinateRequest.site.lon, null);
assert.equal(hasValidSiteCoordinates(missingCoordinateRequest.site), false);
assert.ok(getPvEngineRequestIssues(missingCoordinateRequest).includes('missing-or-invalid-site-coordinates'));

const invalidCoordinateRequest = buildPvEngineRequest({ lat: 120, lon: 32.8 });
assert.equal(hasValidSiteCoordinates(invalidCoordinateRequest.site), false);

const context = createSolarEngineContext({ scenarioKey: 'on-grid' });
assert.ok(context.availableEngines.some(engine => engine.key === 'pvlib-service' && engine.bridge.readyForBackend));
assert.ok(context.availableEngines.some(engine => engine.key === 'python-backend' && engine.bridge.readyForBackend));

const fallbackMeta = sourceMetaForCurrentCalculation({ usedFallback: true });
assert.equal(fallbackMeta.source, 'local simplified');
assert.equal(buildEngineSourceMeta({ engine: 'python-backend' }).source, 'Python backend pvlib-ready');
assert.match(scenarioSourceQualityNote('heat-pump', 'pvgis-live'), /PVGIS-based/);
assert.match(scenarioSourceQualityNote('heat-pump', 'python-backend'), /Python backend pvlib-ready/);
assert.equal(normalizePvEngineResponse({ usedFallback: true }).engineSource.source, 'local simplified');

const defaultAutoBackend = await resolveExternalEngine(
  { enginePreference: 'auto', scenarioKey: 'on-grid' },
  {
    fetchImpl: async () => {
      throw new Error('fetch should not be called unless auto backend discovery is opted in');
    }
  }
);
assert.equal(defaultAutoBackend, null);

const failedBackend = await resolveExternalEngine(
  { enginePreference: 'auto', scenarioKey: 'on-grid' },
  {
    endpoint: 'http://127.0.0.1:9/api/pv/calculate',
    timeoutMs: 5,
    fetchImpl: async () => { throw new Error('backend down'); },
    autoDiscover: true
  }
);
assert.equal(failedBackend.failed, true);
assert.equal(failedBackend.fallbackEngineSource.source, 'PVGIS-based');

const blockedInvalidSiteBackend = await resolveExternalEngine(
  { enginePreference: 'auto', scenarioKey: 'on-grid', lat: null, lon: null },
  {
    autoDiscover: true,
    fetchImpl: async () => {
      throw new Error('fetch should not be called for invalid coordinates');
    }
  }
);
assert.equal(blockedInvalidSiteBackend.failed, true);
assert.match(blockedInvalidSiteBackend.error, /missing-or-invalid-site-coordinates/);

assert.equal(isAuthoritativeBackendResponse({
  engineSource: { pvlibBacked: true, fallbackUsed: false },
  production: { annualEnergyKwh: 12000 }
}), true);
assert.equal(isAuthoritativeBackendResponse({
  engineSource: { pvlibBacked: false, fallbackUsed: true },
  production: { annualEnergyKwh: 12000 }
}), false);

console.log('scenario and engine contract tests passed');
