import assert from 'node:assert/strict';
import { calculatePolygonAreaM2, estimateDominantAzimuth } from '../js/roof-geometry.js';
import { estimateBuildingHeight, computeShadowRisk } from '../js/osm-shadow.js';
import { calculateBomTotal, normalizeBomItems, selectBomItems } from '../js/bom.js';
import { estimateGlareRisk } from '../js/glare.js';

const roof = [
  { lat: 39.0, lng: 32.0 },
  { lat: 39.0, lng: 32.0001 },
  { lat: 39.0001, lng: 32.0001 },
  { lat: 39.0001, lng: 32.0 }
];

const area = calculatePolygonAreaM2(roof);
assert.ok(area > 90 && area < 110, `unexpected area ${area}`);

const az = estimateDominantAzimuth(roof);
assert.ok(az >= 0 && az < 360, `invalid azimuth ${az}`);

assert.equal(Math.round(estimateBuildingHeight({ 'building:levels': '4' })), 12);
assert.equal(estimateBuildingHeight({ building: 'industrial' }), 8);

const shadow = computeShadowRisk(
  { lat: 39.0, lng: 32.0 },
  [{ centroid: { lat: 38.9996, lng: 32.0 }, heightM: 18, tags: {}, points: [] }],
  { panelAzimuth: 180 }
);
assert.ok(shadow.score > 0);

const shadowNorth = computeShadowRisk(
  { lat: 39.0, lng: 32.0 },
  [{ centroid: { lat: 39.0004, lng: 32.0 }, heightM: 18, tags: {}, points: [] }],
  { panelAzimuth: 180 }
);
assert.equal(shadowNorth.score, 0);

const shadowNear = computeShadowRisk(
  { lat: 39.0, lng: 32.0 },
  [{ centroid: { lat: 38.9997, lng: 32.0 }, heightM: 18, tags: {}, points: [] }],
  { panelAzimuth: 180 }
);
const shadowFar = computeShadowRisk(
  { lat: 39.0, lng: 32.0 },
  [{ centroid: { lat: 38.9986, lng: 32.0 }, heightM: 18, tags: {}, points: [] }],
  { panelAzimuth: 180 }
);
assert.ok(shadowNear.score > shadowFar.score, `expected near building risk to exceed far risk: ${shadowNear.score} vs ${shadowFar.score}`);

const items = normalizeBomItems([
  { category: 'panel', supplier: 'A', name: 'Panel', unit: 'wp', unitCost: 20 },
  { category: 'inverter', supplier: 'A', name: 'Inv', unit: 'kwp', unitCost: 6000 }
]);
const selected = selectBomItems(items, {});
const bom = calculateBomTotal(selected, { wp: 5000, kwp: 5 });
assert.equal(bom.subtotal, 130000);

const glare = estimateGlareRisk({
  sunAzimuth: 120,
  sunElevation: 18,
  panelAzimuth: 180,
  panelTilt: 30,
  targetBearing: 240,
  targetDistanceM: 250
});
assert.ok(glare > 0 && glare <= 100);

console.log('advanced feature tests passed');
