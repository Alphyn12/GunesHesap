// Local persistence layer. State metadata is stored in localStorage; evidence
// file blobs are stored in IndexedDB so proposal evidence survives reloads.

import { sanitizeLocalState } from './security.js';

export const STORAGE_VERSION = 'GH-STORAGE-2026.04-v1';
export const PROPOSAL_STATE_STORAGE_KEY = 'guneshesap_proposal_state_v1';
export const EVIDENCE_DB_NAME = 'guneshesap-evidence-db';
export const EVIDENCE_STORE_NAME = 'evidenceFiles';

const STATE_KEYS = [
  'step', 'lat', 'lon', 'cityName', 'ghi', 'roofArea', 'tilt', 'azimuth',
  'scenarioKey', 'scenarioContext', 'scenarioSelectedAt', 'enginePreference', 'engineContext',
  'azimuthCoeff', 'azimuthName', 'shadingFactor', 'soilingFactor', 'panelType',
  'inverterType', 'multiRoof', 'roofSections', 'roofGeometry', 'dailyConsumption', 'designTarget',
  'batteryEnabled', 'battery', 'netMeteringEnabled', 'usdToTry', 'displayCurrency',
  'exchangeRate', 'tariff', 'tariffType', 'tariffMode', 'tariffRegime',
  'onGridMonthlyConsumptionKwh', 'onGridMonthlyBillEstimate',
  'offgridDevices', 'offgridCalculationMode', 'offgridLoadProfileKey',
  'offgridCriticalFraction', 'offgridAutonomyGoal', 'offgridGeneratorEnabled',
  'offgridGeneratorKw', 'offgridGeneratorFuelCostPerKwh', 'offgridGeneratorCapexTry',
  'offgridGeneratorStrategy', 'offgridGeneratorFuelType', 'offgridGeneratorSizePreset', 'offgridGeneratorReservePct',
  'offgridGeneratorStartSocPct', 'offgridGeneratorMaxHoursPerDay',
  'offgridGeneratorMaintenanceCostTry',
  'offgridBadWeatherLevel', 'offgridPvHourly8760', 'offgridPvHourlySource',
  'offgridCriticalLoad8760', 'offgridFieldImports', 'offgridFieldGuaranteeMode',
  'offgridBatteryMaxChargeKw', 'offgridBatteryMaxDischargeKw',
  'offgridInverterAcKw', 'offgridInverterSurgeMultiplier',
  'exportSettlementMode', 'previousYearConsumptionKwh', 'currentYearConsumptionKwh',
  'sellableExportCapKwh', 'expenseEscalationRate', 'contractedPowerKw',
  'contractedTariff', 'skttTariff', 'exportTariff', 'annualPriceIncrease',
  'discountRate', 'tariffIncludesTax', 'tariffSourceDate', 'tariffSourceCheckedAt',
  'omEnabled', 'omRate', 'insuranceRate',
  'evidence', 'financing', 'maintenanceContract',
  'gridApplicationChecklist', 'proposalApproval', 'proposalRevisions',
  'billAnalysisEnabled', 'monthlyConsumption',
  'evEnabled', 'ev', 'heatPumpEnabled', 'heatPump', 'taxEnabled', 'tax',
  'hasSignedCustomerBillData', 'quoteInputsVerified', 'quoteReadyApproved',
  'userIdentity', 'auditLog'
];

function pickPersistableState(state = {}) {
  const out = {};
  STATE_KEYS.forEach(key => {
    if (key in state) out[key] = state[key];
  });
  return out;
}

function openEvidenceDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const req = indexedDB.open(EVIDENCE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EVIDENCE_STORE_NAME)) {
        db.createObjectStore(EVIDENCE_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed.'));
  });
}

async function withEvidenceStore(mode, callback) {
  const db = await openEvidenceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EVIDENCE_STORE_NAME, mode);
    const store = tx.objectStore(EVIDENCE_STORE_NAME);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    result = callback(store);
  }).finally(() => db.close());
}

export function saveProposalState(state = {}) {
  try {
    const payload = {
      schema: STORAGE_VERSION,
      savedAt: new Date().toISOString(),
      state: pickPersistableState(state)
    };
    localStorage.setItem(PROPOSAL_STATE_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadProposalState() {
  try {
    const raw = localStorage.getItem(PROPOSAL_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.state) return null;
    return {
      schema: parsed.schema || 'unknown',
      savedAt: parsed.savedAt || null,
      state: sanitizeLocalState(parsed.state)
    };
  } catch {
    return null;
  }
}

export async function saveEvidenceBlob(metadata, file) {
  if (!metadata?.id || !file) throw new Error('Evidence metadata and file are required.');
  const record = { id: metadata.id, metadata, blob: file, savedAt: new Date().toISOString() };
  await withEvidenceStore('readwrite', (store) => store.put(record));
  return record;
}

export async function getEvidenceBlob(id) {
  if (!id) return null;
  return withEvidenceStore('readonly', (store) => {
    const req = store.get(id);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Evidence read failed.'));
    });
  });
}
