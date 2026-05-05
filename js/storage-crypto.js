// ═══════════════════════════════════════════════════════════
// STORAGE CRYPTO — AES-256-GCM localStorage şifrelemesi
// Solar Rota v2.0 — Faz 2 Güvenlik İyileştirmesi (S-03)
// ═══════════════════════════════════════════════════════════
//
// Tasarım:
//   • Web Crypto API (SubtleCrypto) — dış bağımlılık yok
//   • AES-256-GCM: authenticated encryption (gizlilik + bütünlük aynı anda)
//   • Anahtar türetimi: PBKDF2 (100 000 iterasyon, SHA-256)
//   • Her yazma için rastgele 12-bayt IV — replay saldırısına karşı
//   • Sadece https:// ve localhost'ta kullanılabilir (SubtleCrypto kısıtlaması)
//   • Şifreleme yoksa (http://) → console.warn + düz metin fallback
//
// Kullanım:
//   await initStorageCrypto('isteğe-bağlı-salt');
//   const enc = await encryptForStorage({ tariff: 8.5 });
//   const dec = await decryptFromStorage(enc);

const CRYPTO_VERSION = 'SR-CRYPTO-v1';
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;
const IV_BYTES = 12;          // AES-GCM standart IV uzunluğu
const SALT_BYTES = 16;

// Uygulama çapında tek CryptoKey örneği (init sonrası set edilir)
let _cryptoKey = null;
let _ready = false;

/**
 * SubtleCrypto erişilebilir mi?
 * Sadece secure context (https://, localhost) altında true döner.
 */
export function isEncryptionAvailable() {
  return !!(
    typeof globalThis.crypto !== 'undefined' &&
    globalThis.crypto.subtle &&
    typeof globalThis.crypto.subtle.importKey === 'function'
  );
}

/**
 * Tek seferlik başlatma — app.js'de DOMContentLoaded'da çağrılır.
 *
 * @param {string} userSalt - deployment'ta HTML'den inject edilir
 *   (window.SOLARROTA_STORAGE_SALT veya boş string → varsayılan kullanılır)
 */
export async function initStorageCrypto(userSalt = '') {
  if (!isEncryptionAvailable()) {
    console.warn(
      '[storage-crypto] SubtleCrypto erişilemez (secure context değil). ' +
      'Hassas veriler şifrelenmeden saklanacak. Production için HTTPS kullanın.'
    );
    _ready = false;
    return;
  }

  try {
    // Anahtar malzemesi: deployment salt + sabit uygulama kimliği
    const saltString = (userSalt || 'solarrota-local-default') + '-solarrota-2026';
    const saltBytes = new TextEncoder().encode(saltString.slice(0, 32).padEnd(32, '0'));

    // PBKDF2 için raw key materyali
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      saltBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    // Deterministik uygulama salt'ı (her oturumda aynı anahtar türetilsin)
    const appSalt = new TextEncoder().encode('solarrota-pbkdf2-salt-v1');

    // AES-256-GCM anahtarı türet
    _cryptoKey = await globalThis.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: appSalt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: KEY_LENGTH_BITS },
      false,   // extractable: false — anahtar dışarı çıkarılamaz
      ['encrypt', 'decrypt']
    );

    _ready = true;
  } catch (err) {
    console.warn('[storage-crypto] Anahtar türetme başarısız:', err);
    _ready = false;
  }
}

/**
 * Bir JavaScript nesnesini şifrele, Base64 string olarak döndür.
 *
 * Format: "<version>:<iv_base64>:<ciphertext_base64>"
 * Şifreleme mevcut değilse → JSON.stringify döner (fallback).
 *
 * @param {object} plainObject
 * @returns {Promise<string>}
 */
export async function encryptForStorage(plainObject) {
  const json = JSON.stringify(plainObject);

  if (!_ready || !_cryptoKey) {
    return json;   // şifreleme yoksa düz metin
  }

  try {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const encoded = new TextEncoder().encode(json);

    const cipherBuffer = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      _cryptoKey,
      encoded
    );

    const ivB64 = _uint8ToBase64(iv);
    const ctB64 = _uint8ToBase64(new Uint8Array(cipherBuffer));
    return `${CRYPTO_VERSION}:${ivB64}:${ctB64}`;
  } catch (err) {
    console.warn('[storage-crypto] Şifreleme başarısız, düz metin fallback:', err);
    return json;
  }
}

/**
 * encryptForStorage çıktısını çöz, nesne olarak döndür.
 *
 * Hem şifreli ("<version>:...") hem eski düz metin JSON formatını destekler
 * (geriye dönük uyumluluk / smooth migration).
 *
 * @param {string|null} raw
 * @returns {Promise<object|null>}
 */
export async function decryptFromStorage(raw) {
  if (!raw) return null;

  // Eski format: düz JSON başlıyorsa (migration)
  if (!raw.startsWith(CRYPTO_VERSION + ':')) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // Şifreli format
  if (!_ready || !_cryptoKey) {
    // Anahtar yok ama şifreli veri var → çözülemeyen veriyi at, null dön
    console.warn('[storage-crypto] Şifreli veri mevcut ama anahtar hazır değil.');
    return null;
  }

  try {
    const parts = raw.split(':');
    if (parts.length !== 3) return null;

    const [, ivB64, ctB64] = parts;
    const iv = _base64ToUint8(ivB64);
    const cipherBuffer = _base64ToUint8(ctB64);

    const plainBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      _cryptoKey,
      cipherBuffer
    );

    return JSON.parse(new TextDecoder().decode(plainBuffer));
  } catch (err) {
    console.warn('[storage-crypto] Çözme başarısız (bozuk/eski veri):', err);
    return null;
  }
}

// ── İç yardımcılar ───────────────────────────────────────────────────────────

function _uint8ToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function _base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
