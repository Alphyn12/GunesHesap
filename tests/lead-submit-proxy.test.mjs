import { strict as assert } from 'node:assert';
import { systemTypeToEnum, buildAdminPayload, createSignature } from '../api/lead-submit.js';

let passed = 0;

function test(name, fn) {
  fn();
  console.log(`  ✓ ${name}`);
  passed++;
}

// ── systemTypeToEnum ───────────────────────────────────────────────────────────
console.log('systemTypeToEnum');
test('on-grid → on_grid', () => assert.equal(systemTypeToEnum('on-grid'), 'on_grid'));
test('off-grid → off_grid', () => assert.equal(systemTypeToEnum('off-grid'), 'off_grid'));
test('mobile-offgrid → off_grid', () => assert.equal(systemTypeToEnum('mobile-offgrid'), 'off_grid'));
test('agricultural-irrigation → on_grid (fallback)', () => assert.equal(systemTypeToEnum('agricultural-irrigation'), 'on_grid'));
test('undefined → on_grid (fallback)', () => assert.equal(systemTypeToEnum(undefined), 'on_grid'));
test('null → on_grid (fallback)', () => assert.equal(systemTypeToEnum(null), 'on_grid'));

// ── buildAdminPayload — temel zorunlu alanlar ──────────────────────────────────
console.log('\nbuildAdminPayload — temel alanlar');

const minimalInput = {
  firstName: 'Ahmet',
  lastName: 'Yılmaz',
  email: 'ahmet@example.com',
  consentDataProcessing: true,
  consentThirdParty: true,
  proposalSnapshot: { cityName: 'İstanbul', scenarioKey: 'on-grid' },
};

test('requestId üretilir (UUID formatı)', () => {
  const p = buildAdminPayload(minimalInput);
  assert.match(p.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('fullName firstName + lastName birleştirilir', () => {
  const p = buildAdminPayload(minimalInput);
  assert.equal(p.fullName, 'Ahmet Yılmaz');
});

test('province cityName\'den alınır', () => {
  const p = buildAdminPayload(minimalInput);
  assert.equal(p.province, 'İstanbul');
});

test('systemType on-grid → on_grid', () => {
  const p = buildAdminPayload(minimalInput);
  assert.equal(p.systemType, 'on_grid');
});

test('source sabit değer', () => {
  const p = buildAdminPayload(minimalInput);
  assert.equal(p.source, 'solar-rota-main-site');
  assert.equal(p.formSource, 'quote-form');
});

test('consent.kvkkAccepted her zaman true (literal)', () => {
  const p = buildAdminPayload(minimalInput);
  assert.equal(p.consent.kvkkAccepted, true);
});

test('consent.explicitConsentAccepted her zaman true (literal)', () => {
  const p = buildAdminPayload(minimalInput);
  assert.equal(p.consent.explicitConsentAccepted, true);
});

test('consent version stringleri doğru', () => {
  const p = buildAdminPayload(minimalInput);
  assert.equal(p.consent.consentTextVersion, '2026-05-v1');
  assert.equal(p.consent.explicitConsentTextVersion, '2026-05-v1');
  assert.equal(p.consent.privacyPolicyVersion, '2026-05-v1');
});

test('consent.acceptedAt ISO-8601 formatında', () => {
  const p = buildAdminPayload(minimalInput);
  assert.ok(p.consent.acceptedAt);
  assert.ok(!isNaN(Date.parse(p.consent.acceptedAt)));
});

// ── buildAdminPayload — consentMarketing opsiyonel ─────────────────────────────
console.log('\nbuildAdminPayload — consentMarketing opsiyonel');

test('marketingConsent gönderilmezse false olur', () => {
  const p = buildAdminPayload(minimalInput);
  assert.equal(p.consent.marketingConsent, false);
});

test('marketingConsent true gönderilirse true olur', () => {
  const p = buildAdminPayload({ ...minimalInput, consentMarketing: true });
  assert.equal(p.consent.marketingConsent, true);
});

test('marketingConsent false gönderilirse false olur', () => {
  const p = buildAdminPayload({ ...minimalInput, consentMarketing: false });
  assert.equal(p.consent.marketingConsent, false);
});

// ── buildAdminPayload — consentThirdParty → transferPermissionToEpc ────────────
console.log('\nbuildAdminPayload — consentThirdParty mapping');

test('consentThirdParty=true → transferPermissionToEpc=true', () => {
  const p = buildAdminPayload({ ...minimalInput, consentThirdParty: true });
  assert.equal(p.consent.transferPermissionToEpc, true);
});

test('consentThirdParty eksikse → transferPermissionToEpc=false', () => {
  const { consentThirdParty: _, ...rest } = minimalInput;
  const p = buildAdminPayload({ ...rest, consentThirdParty: false });
  assert.equal(p.consent.transferPermissionToEpc, false);
});

// ── buildAdminPayload — province fallback ──────────────────────────────────────
console.log('\nbuildAdminPayload — province fallback');

test('cityName boşsa province = "Belirtilmedi"', () => {
  const p = buildAdminPayload({
    ...minimalInput,
    proposalSnapshot: { scenarioKey: 'on-grid' },
  });
  assert.equal(p.province, 'Belirtilmedi');
});

test('cityName null ise province = "Belirtilmedi"', () => {
  const p = buildAdminPayload({
    ...minimalInput,
    proposalSnapshot: { cityName: null, scenarioKey: 'on-grid' },
  });
  assert.equal(p.province, 'Belirtilmedi');
});

// ── buildAdminPayload — hesaplama snapshot mapping ─────────────────────────────
console.log('\nbuildAdminPayload — hesaplama snapshot');

const richInput = {
  firstName: 'Test',
  lastName: 'Kullanıcı',
  email: 'test@example.com',
  consentDataProcessing: true,
  consentThirdParty: true,
  proposalSnapshot: {
    cityName: 'İzmir',
    scenarioKey: 'off-grid',
    annualEnergy: 12000,
    systemPower: 10.5,
    totalCost: 350000,
    roofArea: 60,
    tilt: 30,
    azimuthName: 'Güney',
    panelType: 'mono_perc',
    inverterType: 'string',
    annualConsumptionKwh: 8500,
    monthlyBillAmount: 1500,
    designMode: 'fill-roof',
    expertModules: { evCharging: true, heatingCooling: false, batteryBackup: true, generatorIntegration: false },
  },
};

test('systemType off-grid → off_grid', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.systemType, 'off_grid');
});

test('calculationResult.estimatedAnnualProductionKwh', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.calculationResult.estimatedAnnualProductionKwh, 12000);
});

test('calculationResult.estimatedKwp', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.calculationResult.estimatedKwp, 10.5);
});

test('calculationResult.estimatedInvestmentAmount', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.calculationResult.estimatedInvestmentAmount, 350000);
});

test('roof.areaM2', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.roof.areaM2, 60);
});

test('roof.tiltDegrees', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.roof.tiltDegrees, 30);
});

test('roof.direction', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.roof.direction, 'Güney');
});

test('equipmentPreferences.panel', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.equipmentPreferences.panel, 'mono_perc');
});

test('equipmentPreferences.inverter', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.equipmentPreferences.inverter, 'string');
});

test('consumption.annualConsumptionKwh', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.consumption.annualConsumptionKwh, 8500);
});

test('consumption.monthlyBillAmount', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.consumption.monthlyBillAmount, 1500);
});

test('expertModules.evCharging', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.expertModules.evCharging, true);
});

test('expertModules.batteryBackup', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.expertModules.batteryBackup, true);
});

test('designMode', () => {
  const p = buildAdminPayload(richInput);
  assert.equal(p.designMode, 'fill-roof');
});

// ── buildAdminPayload — opsiyonel alanlar eksikse payload'a eklenmez ───────────
console.log('\nbuildAdminPayload — opsiyonel alanlar eksikse');

test('calculationResult eksik snapshot → payload\'da yok', () => {
  const p = buildAdminPayload(minimalInput);
  assert.equal(p.calculationResult, undefined);
});

test('roof snapshot yok → payload\'da yok', () => {
  const p = buildAdminPayload(minimalInput);
  assert.equal(p.roof, undefined);
});

test('address yoksa district eklenmez', () => {
  const p = buildAdminPayload(minimalInput);
  assert.equal(p.district, undefined);
});

test('address varsa district olarak eklenir', () => {
  const p = buildAdminPayload({ ...minimalInput, address: 'Merkez Mah.' });
  assert.equal(p.district, 'Merkez Mah.');
});

// ── createSignature ────────────────────────────────────────────────────────────
console.log('\ncreateSignature');

const testSecret = 'test-secret-32-chars-minimum-ok-!';
const testTimestamp = '2026-05-12T10:00:00.000Z';
const testBody = '{"test":1}';

test('HMAC-SHA256 → 64 hex karakter üretir', () => {
  const sig = createSignature(testSecret, testTimestamp, testBody);
  assert.equal(sig.length, 64);
  assert.match(sig, /^[0-9a-f]+$/);
});

test('aynı girdiler → aynı imza', () => {
  const s1 = createSignature(testSecret, testTimestamp, testBody);
  const s2 = createSignature(testSecret, testTimestamp, testBody);
  assert.equal(s1, s2);
});

test('farklı timestamp → farklı imza', () => {
  const s1 = createSignature(testSecret, testTimestamp, testBody);
  const s2 = createSignature(testSecret, '2026-05-12T10:01:00.000Z', testBody);
  assert.notEqual(s1, s2);
});

test('farklı body → farklı imza', () => {
  const s1 = createSignature(testSecret, testTimestamp, testBody);
  const s2 = createSignature(testSecret, testTimestamp, '{"test":2}');
  assert.notEqual(s1, s2);
});

test('farklı secret → farklı imza', () => {
  const s1 = createSignature(testSecret, testTimestamp, testBody);
  const s2 = createSignature('different-secret-32-chars-min---!', testTimestamp, testBody);
  assert.notEqual(s1, s2);
});

// ── Özet ──────────────────────────────────────────────────────────────────────
console.log(`\n${passed} test geçti.`);
