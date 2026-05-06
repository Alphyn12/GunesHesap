// Local persistence layer. State metadata is stored in localStorage; evidence
// file blobs are stored in IndexedDB so proposal evidence survives reloads.
//
// Faz 2 Güvenlik İyileştirmesi (S-03): Hassas state alanları AES-256-GCM ile
// şifrelenerek saklanır. storage-crypto.js'in initStorageCrypto() fonksiyonu
// app.js'de başlangıçta çağrılmalıdır.

import { sanitizeLocalState } from './security.js';
import { encryptForStorage, decryptFromStorage, isEncryptionAvailable } from './storage-crypto.js';

export const STORAGE_VERSION = 'GH-STORAGE-2026.04-v1';
export const PROPOSAL_STATE_STORAGE_KEY = 'guneshesap_proposal_state_v1';
export const EVIDENCE_DB_NAME = 'guneshesap-evidence-db';
export const EVIDENCE_STORE_NAME = 'evidenceFiles';

// ── Hassas alan tanımları (S-03 şifreleme kapsamı) ───────────────────────────
// Bu alanlar localStorage'a yazılmadan önce AES-256-GCM ile şifrelenir.
// Teknik mühendislik girdileri (lat, lon, tilt...) hassas değil → şifrelenmez.
// 8760 elemanlı diziler (offgridPvHourly8760 vb.) performans için şifre dışı.
const SENSITIVE_KEYS = new Set([
  'tariff', 'importTariffBase', 'distributionFee', 'exportTariff',
  'contractedTariff', 'skttTariff', 'annualPriceIncrease', 'discountRate',
  'expenseEscalationRate', 'onGridMonthlyConsumptionKwh', 'onGridMonthlyBillEstimate',
  'previousYearConsumptionKwh', 'currentYearConsumptionKwh', 'sellableExportCapKwh',
  'evidence', 'financing', 'maintenanceContract', 'monthlyConsumption',
]);

// localStorage anahtar adı — şifreli payload
const ENCRYPTED_PAYLOAD_KEY = 'solarrota_enc_v1';

const STATE_KEYS = [
  'step', 'lat', 'lon', 'cityName', 'ghi', 'roofArea', 'tilt', 'azimuth',
  'scenarioKey', 'scenarioContext', 'scenarioSelectedAt', 'enginePreference', 'engineContext',
  'azimuthCoeff', 'azimuthName', 'shadingFactor', 'soilingFactor', 'panelType',
  'panelSelectionMode', 'panelCatalogId', 'panelCatalogTechFilter', 'panelCatalogSegmentFilter',
  'inverterType', 'multiRoof', 'roofSections', 'roofGeometry', 'dailyConsumption', 'designTarget',
  'batteryEnabled', 'battery', 'netMeteringEnabled', 'usdToTry', 'displayCurrency',
  'exchangeRate', 'tariff', 'importTariffBase', 'distributionFee', 'tariffInputMode',
  'tariffSourceType', 'tariffType', 'tariffMode', 'tariffRegime',
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
  'exportSettlementMode', 'settlementDate', 'previousYearConsumptionKwh', 'currentYearConsumptionKwh',
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
  try {
    const txPromise = new Promise((resolve, reject) => {
      const tx = db.transaction(EVIDENCE_STORE_NAME, mode);
      const store = tx.objectStore(EVIDENCE_STORE_NAME);
      // Faz-3 (#17): callback senkron throw ederse Promise executor yakalamaz; manuel reject.
      // Faz-3 (#18): callback Promise döndürse de bekle ve değeri tx.oncomplete sonrası dön —
      // böylece tx commit edilmeden inner Promise'in sonucuna güvenmiyoruz.
      let pending;
      try {
        pending = Promise.resolve(callback(store));
      } catch (err) {
        try { tx.abort(); } catch { /* zaten kapalı olabilir */ }
        reject(err);
        return;
      }
      // tx oncomplete olmadan pending reject ederse unhandled rejection oluşmasın.
      pending.catch(() => {});
      tx.oncomplete = () => {
        pending.then(resolve, reject);
      };
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
    });
    return await txPromise;
  } finally {
    db.close();
  }
}

// Şifresi çözülmüş hassas alan önbelleği.
// preloadEncryptedState() tarafından doldurulur; loadProposalState() bunu kullanır.
let _decryptedSensitiveCache = null;

/**
 * Şifreli hassas alanları async olarak çözer ve önbelleğe alır.
 * app.js'de ilk loadProposalState() çağrısından ÖNCE çağrılmalıdır.
 * DOMContentLoaded içinde veya module init sırasında çağrılır.
 */
export async function preloadEncryptedState() {
  if (!isEncryptionAvailable()) return;
  try {
    const encRaw = localStorage.getItem(ENCRYPTED_PAYLOAD_KEY);
    if (encRaw) {
      _decryptedSensitiveCache = await decryptFromStorage(encRaw);
    }
  } catch {
    _decryptedSensitiveCache = null;
  }
}

/**
 * State'i localStorage'a kaydeder — TAM ŞİFRELİ MOD (Faz 2B).
 *
 * Strateji:
 *   • Şifreleme MEVCUT (https / localhost):
 *       – Hassas alanlar (SENSITIVE_KEYS) YALNIZCA şifreli anahtara yazılır.
 *         Plain JSON'a hassas alan dahil edilmez — düz metin sızıntısı sıfır.
 *       – Hassas olmayan alanlar plain JSON'a yazılır (şifreleme gereksiz).
 *   • Şifreleme MEVCUT DEĞİL (http://, SubtleCrypto erişilemez):
 *       – Tüm alanlar plain JSON'a yazılır (zorunlu fallback, uyarı loglanır).
 *       – Kullanıcıya production'da HTTPS kullanması önerilir.
 */
export function saveProposalState(state = {}) {
  try {
    const persistable = pickPersistableState(state);

    if (isEncryptionAvailable()) {
      // Hassas / hassas-olmayan ayrımı
      const sensitive = {};
      const plain = {};
      for (const [k, v] of Object.entries(persistable)) {
        if (SENSITIVE_KEYS.has(k)) sensitive[k] = v;
        else plain[k] = v;
      }

      // Hassas olmayan alanları düz metin olarak kaydet
      localStorage.setItem(PROPOSAL_STATE_STORAGE_KEY, JSON.stringify({
        schema: STORAGE_VERSION,
        savedAt: new Date().toISOString(),
        state: plain,             // hassas alan YOK
      }));

      // Hassas alanları YALNIZCA şifreli olarak kaydet (fire-and-forget)
      if (Object.keys(sensitive).length > 0) {
        encryptForStorage(sensitive)
          .then(enc => {
            try { localStorage.setItem(ENCRYPTED_PAYLOAD_KEY, enc); } catch { /* quota */ }
            _decryptedSensitiveCache = sensitive;
          })
          .catch(err => {
            console.warn('[storage] Hassas alan şifrelemesi başarısız — veri kaydedilmedi:', err);
          });
      }
    } else {
      // Şifreleme yoksa → tüm alanlar plain (kaçınılmaz fallback)
      console.warn(
        '[storage] SubtleCrypto erişilemez; hassas tarife/finansal veriler ' +
        'düz metin olarak saklanıyor. Production için HTTPS kullanın.'
      );
      localStorage.setItem(PROPOSAL_STATE_STORAGE_KEY, JSON.stringify({
        schema: STORAGE_VERSION,
        savedAt: new Date().toISOString(),
        state: persistable,
      }));
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * State'i localStorage'dan yükler (senkron).
 *
 * Kaynak birleştirme önceliği:
 *   1. _decryptedSensitiveCache (preloadEncryptedState ile çözülmüş) — en güvenilir
 *   2. Ana anahtardaki plain JSON — her zaman mevcut (fallback)
 * Smooth migration: eski düz metin formatı da okunur.
 */
export function loadProposalState() {
  try {
    const raw = localStorage.getItem(PROPOSAL_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.state) return null;

    // Önbellekteki şifreli hassas alanları birleştir (varsa)
    const mergedState = _decryptedSensitiveCache
      ? { ...parsed.state, ..._decryptedSensitiveCache }
      : { ...parsed.state };

    return {
      schema: parsed.schema || 'unknown',
      savedAt: parsed.savedAt || null,
      state: sanitizeLocalState(mergedState),
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
