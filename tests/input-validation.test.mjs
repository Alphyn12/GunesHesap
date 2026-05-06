import assert from 'node:assert/strict';
import {
  hasCompleteHourlyProfile8760,
  hashHourlyProfile8760,
  hasMeaningfulHourlyProfile8760,
  hasMeaningfulConsumptionEvidence,
  hasMeaningfulMonthlyConsumption,
  validateHourlyProfile8760
} from '../js/consumption-evidence.js';
import { sanitizeDashboardRecord } from '../js/dashboard.js';
import { isLocationInTurkey } from '../js/location-validation.js';

assert.equal(hasMeaningfulMonthlyConsumption(new Array(12).fill(0)), false);
assert.equal(hasMeaningfulMonthlyConsumption([12, ...new Array(11).fill(0)]), true);
assert.equal(hasMeaningfulConsumptionEvidence({ monthlyConsumption: new Array(12).fill(0) }), false);
assert.equal(hasMeaningfulConsumptionEvidence({ hourlyConsumption8760: new Array(24).fill(1) }), false);
assert.equal(hasCompleteHourlyProfile8760(new Array(8760).fill(1)), true);
assert.equal(hasCompleteHourlyProfile8760(new Array(8759).fill(1)), false);
assert.equal(hasMeaningfulHourlyProfile8760(new Array(8760).fill(0)), false);
assert.equal(hasMeaningfulConsumptionEvidence({ hourlyConsumption8760: new Array(8760).fill(0) }), false);
assert.equal(hasMeaningfulConsumptionEvidence({ hourlyConsumption8760: new Array(8760).fill(1) }), true);
assert.equal(validateHourlyProfile8760(new Array(8760).fill(0), { label: 'test' }).ok, false);
assert.equal(validateHourlyProfile8760(new Array(8760).fill(1), { label: 'test' }).ok, true);
assert.equal(hashHourlyProfile8760(new Array(8760).fill(1)), hashHourlyProfile8760(new Array(8760).fill(1)));
assert.notEqual(hashHourlyProfile8760(new Array(8760).fill(1)), hashHourlyProfile8760(new Array(8760).fill(2)));

const imported = sanitizeDashboardRecord({
  id: '7',
  cityName: '<img src=x onerror=alert(1)>',
  timestamp: '<svg/onload=alert(1)>',
  systemPower: '5.25',
  annualEnergy: '7000',
  totalCost: '100000',
  paybackYear: '8',
  roi: '22',
  lcoe: '1.5',
  npv: '50000',
  usdToTry: '40',
  displayCurrency: 'EUR',
  tilt: '120',
  azimuthName: '<b>Güney</b>'
});
assert.equal(imported.id, 7);
assert.equal(imported.cityName, '<img src=x onerror=alert(1)>');
assert.equal(imported.displayCurrency, 'TRY');
assert.equal(imported.tilt, 90);

assert.equal(isLocationInTurkey(39.9334, 32.8597), true);
assert.equal(isLocationInTurkey(35.9, 33.0), false);
assert.equal(isLocationInTurkey(37.98, 23.72), false);

console.log('input validation tests passed');
