// ═══════════════════════════════════════════════════════════
// QUOTE MODAL — Step 7 "Teklif Al" iletişim formu
// Solar Rota
//
// Davranış:
//   • Müşteri iletişim bilgilerini formla toplar
//   • POST /api/lead/submit endpoint'ine gönderir
//   • Network hatasında localStorage queue'ye yazar (online'da retry)
//   • KVKK Aydınlatma + Açık Rıza için ortak sub-modal (i18n placeholder metin)
// ═══════════════════════════════════════════════════════════
import { BACKEND_CONFIG, buildBackendUrl, buildAuthHeaders } from './backend-config.js';

const QUEUE_KEY = 'solarrota_lead_queue_v1';
const QUEUE_TTL_MS = 24 * 60 * 60 * 1000; // KVKK uyumu için 24 saat sınırı
const LEGAL_KINDS = ['marketingNotice', 'dataProcessing', 'thirdParty'];

// State machine: 'idle' → 'submitting' → 'idle' (success ya da hata sonrası)
let formState = 'idle';
let escapeListenerInstalled = false;
let activeLegalKind = null;

const t = (key, fallback) => {
  const value = window.i18n?.t?.(key);
  if (value && value !== key) return value;
  return fallback ?? key;
};

// ── DOM helpers ──────────────────────────────────────────────────────────────
function getModal() { return document.getElementById('quote-modal'); }
function getLegalModal() { return document.getElementById('legal-text-modal'); }
function getForm() { return document.getElementById('quote-form'); }

function isModalOpen(modal) {
  return !!modal && getComputedStyle(modal).display !== 'none' && modal.style.display !== 'none';
}

// ── Sub-modal (KVKK / Açık Rıza ortak) ──────────────────────────────────────
function paragraphsFromBody(body) {
  // Plain-text → <p> / <h3> dönüşümü. textContent kullanılır → XSS güvenli.
  const frag = document.createDocumentFragment();
  const blocks = String(body || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  for (const block of blocks) {
    if (block.startsWith('## ')) {
      const h = document.createElement('h3');
      h.textContent = block.slice(3).trim();
      frag.appendChild(h);
    } else {
      const p = document.createElement('p');
      p.textContent = block;
      frag.appendChild(p);
    }
  }
  return frag;
}

function renderLegalContent(kind) {
  const titleEl = document.getElementById('legal-modal-title');
  const bodyEl = document.getElementById('legal-modal-body');
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = t(`legalText.${kind}.title`, t('legalText.titleFallback', 'Hukuki Metin'));
  bodyEl.replaceChildren(paragraphsFromBody(t(`legalText.${kind}.body`, '')));
  bodyEl.scrollTop = 0;
}

export function openLegalModal(kind) {
  if (!LEGAL_KINDS.includes(kind)) return;
  const modal = getLegalModal();
  if (!modal) return;
  activeLegalKind = kind;
  renderLegalContent(kind);
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  setTimeout(() => document.getElementById('legal-modal-body')?.focus(), 50);
}

export function closeLegalModal() {
  const modal = getLegalModal();
  if (modal) modal.style.display = 'none';
  activeLegalKind = null;
  // Ana quote-modal hala açıksa modal-open class'ı kalmalı
  if (!isModalOpen(getModal())) {
    document.body.classList.remove('modal-open');
  }
}

// Dil değişiminde sub-modal açıksa içerik refresh — i18n.js çağırır
function refreshLegalModalIfOpen() {
  if (activeLegalKind && isModalOpen(getLegalModal())) {
    renderLegalContent(activeLegalKind);
  }
}

// ── Ana modal aç/kapat ───────────────────────────────────────────────────────
export function openQuoteModal() {
  const modal = getModal();
  if (!modal) return;
  if (!window.state?.results) {
    window.showToast?.(t('export.calculateFirst', 'Önce hesaplama yapmalısınız.'), 'error');
    return;
  }
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  installEscapeListenerOnce();
  setTimeout(() => document.getElementById('quote-first-name')?.focus(), 50);
}

export function closeQuoteModal() {
  const modal = getModal();
  if (modal) modal.style.display = 'none';
  if (!isModalOpen(getLegalModal())) {
    document.body.classList.remove('modal-open');
  }
}

function installEscapeListenerOnce() {
  if (escapeListenerInstalled) return;
  escapeListenerInstalled = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isModalOpen(getLegalModal())) {
      e.stopPropagation();
      closeLegalModal();
    } else if (isModalOpen(getModal())) {
      closeQuoteModal();
    }
  }, true); // capture: legal-modal'ın önce yakalanmasını sağlar
}

// ── Form okuma + validasyon ──────────────────────────────────────────────────
function readFormValues() {
  const form = getForm();
  if (!form) return {};
  const data = new FormData(form);
  return {
    firstName: String(data.get('firstName') || '').trim(),
    lastName: String(data.get('lastName') || '').trim(),
    phone: String(data.get('phone') || '').trim(),
    email: String(data.get('email') || '').trim(),
    address: String(data.get('address') || '').trim(),
    contactTime: String(data.get('contactTime') || '').trim(),
    consentMarketing: !!data.get('consentMarketing'),
    consentDataProcessing: !!data.get('consentDataProcessing'),
    consentThirdParty: !!data.get('consentThirdParty'),
  };
}

const PHONE_RE = /^(?:\+?9?0?\s?)?\(?5\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateAll(values) {
  const errors = {};
  if (!values.firstName) errors.firstName = 'firstNameRequired';
  if (!values.lastName) errors.lastName = 'lastNameRequired';
  if (!values.phone) errors.phone = 'phoneRequired';
  else if (!PHONE_RE.test(values.phone)) errors.phone = 'phoneInvalid';
  if (!values.email) errors.email = 'emailRequired';
  else if (!EMAIL_RE.test(values.email)) errors.email = 'emailInvalid';
  if (!values.consentMarketing) errors.consentMarketing = 'consentRequired';
  if (!values.consentDataProcessing) errors.consentDataProcessing = 'consentRequired';
  if (!values.consentThirdParty) errors.consentThirdParty = 'consentRequired';
  return errors;
}

function clearFieldErrors() {
  const form = getForm();
  if (!form) return;
  form.querySelectorAll('.form-error').forEach(el => { el.textContent = ''; });
  form.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
}

function showFieldErrors(errors) {
  const form = getForm();
  if (!form) return;
  for (const [name, errKey] of Object.entries(errors)) {
    const input = form.querySelector(`[name="${name}"]`);
    if (input) input.setAttribute('aria-invalid', 'true');
    const errEl = form.querySelector(`[data-error-for="${name}"]`);
    if (errEl) errEl.textContent = t(`quoteForm.errors.${errKey}`, errKey);
  }
}

function bindFieldValidationOnce() {
  const form = getForm();
  if (!form || form.dataset.validationBound === '1') return;
  form.dataset.validationBound = '1';
  form.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('blur', () => {
      const values = readFormValues();
      const errors = validateAll(values);
      const name = el.name;
      if (!name) return;
      const errEl = form.querySelector(`[data-error-for="${name}"]`);
      if (errors[name]) {
        el.setAttribute('aria-invalid', 'true');
        if (errEl) errEl.textContent = t(`quoteForm.errors.${errors[name]}`, errors[name]);
      } else {
        el.removeAttribute('aria-invalid');
        if (errEl) errEl.textContent = '';
      }
    });
  });
}

// ── Payload oluşturma ────────────────────────────────────────────────────────
function buildProposalSnapshot() {
  const r = window.state?.results;
  if (!r) return null;
  return {
    annualEnergy: Number(r.annualEnergy) || null,
    systemPower: Number(r.systemPower) || null,
    totalCost: Number(r.totalCost) || null,
    scenarioKey: window.state?.scenarioKey || null,
    cityName: window.state?.cityName || null,
  };
}

function buildLeadPayload(values) {
  const locale = window.i18n?.locale || 'tr';
  const safeLocale = ['tr', 'en', 'de'].includes(locale) ? locale : 'tr';
  const payload = {
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone,
    email: values.email,
    consentMarketing: values.consentMarketing,
    consentDataProcessing: values.consentDataProcessing,
    consentThirdParty: values.consentThirdParty,
    locale: safeLocale,
  };
  if (values.address) payload.address = values.address;
  if (values.contactTime) payload.contactTime = values.contactTime;
  const snapshot = buildProposalSnapshot();
  if (snapshot) payload.proposalSnapshot = snapshot;
  return payload;
}

// ── Backend gönderimi ────────────────────────────────────────────────────────
async function postLeadToBackend(payload) {
  const url = buildBackendUrl(BACKEND_CONFIG.leadSubmitPath);
  const response = await fetch(url, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
    // 10sn timeout — AbortController ile
    signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
  });
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const err = new Error(`HTTP ${response.status}`);
    err.status = response.status;
    err.body = errBody;
    throw err;
  }
  return response.json();
}

// ── localStorage queue (offline retry) ───────────────────────────────────────
function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeQueue(items) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items)); }
  catch { /* localStorage dolu/devre dışı — sessizce geç */ }
}

function persistToLocalQueue(payload) {
  const queue = readQueue();
  queue.push({ payload, queuedAt: Date.now() });
  writeQueue(queue);
}

function purgeStaleQueueEntries() {
  const queue = readQueue();
  const now = Date.now();
  const fresh = queue.filter(item => (now - (item.queuedAt || 0)) <= QUEUE_TTL_MS);
  if (fresh.length !== queue.length) writeQueue(fresh);
  return fresh;
}

let queueFlushInFlight = false;
export async function flushLeadQueue() {
  if (queueFlushInFlight) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const queue = purgeStaleQueueEntries();
  if (!queue.length) return;
  queueFlushInFlight = true;
  const remaining = [];
  for (const item of queue) {
    try {
      await postLeadToBackend(item.payload);
    } catch {
      // İlk başarısızlıkta dur — kalanları kuyrukta tut
      remaining.push(item, ...queue.slice(queue.indexOf(item) + 1));
      break;
    }
  }
  writeQueue(remaining);
  queueFlushInFlight = false;
  if (queue.length > remaining.length) {
    window.showToast?.(t('quoteForm.queueFlushedToast', 'Bekleyen talepler iletildi.'), 'success');
  }
}

// ── Submit handler ───────────────────────────────────────────────────────────
function setSubmittingUI(submitting) {
  const btn = document.querySelector('#quote-form .quote-submit-btn');
  const label = btn?.querySelector('.quote-submit-label');
  if (!btn || !label) return;
  if (submitting) {
    btn.setAttribute('disabled', 'true');
    label.textContent = t('quoteForm.submitting', 'Gönderiliyor…');
  } else {
    btn.removeAttribute('disabled');
    label.textContent = t('quoteForm.submitButton', 'GÖNDER');
  }
}

export async function submitQuoteForm(_arg, _el, event) {
  if (event?.preventDefault) event.preventDefault();
  if (formState === 'submitting') return;

  clearFieldErrors();
  const values = readFormValues();
  const errors = validateAll(values);
  if (Object.keys(errors).length) {
    showFieldErrors(errors);
    // İlk hatalı alana focus
    const firstErrorName = Object.keys(errors)[0];
    const firstErrorEl = getForm()?.querySelector(`[name="${firstErrorName}"]`);
    firstErrorEl?.focus();
    return;
  }

  formState = 'submitting';
  setSubmittingUI(true);
  const payload = buildLeadPayload(values);
  try {
    await postLeadToBackend(payload);
    getForm()?.reset();
    closeQuoteModal();
    window.showToast?.(t('quoteForm.successToast', 'Talebiniz alındı.'), 'success');
  } catch (err) {
    if (err?.status >= 400 && err?.status < 500) {
      // Sunucu validasyon hatası — kullanıcıya göster, kuyruğa atma
      const detail = err.body?.detail;
      const detailMsg = Array.isArray(detail)
        ? detail.map(d => d?.msg || d).filter(Boolean).join('; ')
        : (typeof detail === 'string' ? detail : '');
      window.showToast?.(detailMsg || t('quoteForm.errorToast', 'Form gönderilemedi.'), 'error');
    } else {
      // Network / 5xx — kuyruğa al, kullanıcıya bilgi ver
      persistToLocalQueue(payload);
      getForm()?.reset();
      closeQuoteModal();
      window.showToast?.(t('quoteForm.queuedToast', 'Bağlantı yok; talebiniz çevrimiçi olunca gönderilecek.'), 'warning');
    }
  } finally {
    formState = 'idle';
    setSubmittingUI(false);
  }
}

// ── Init: validation bind + queue flush + online listener ────────────────────
function initQuoteModal() {
  // Form göründüğünde validation bağla (form zaten DOM'da, init'te bağlanabilir)
  bindFieldValidationOnce();

  // Sayfa açıldıktan sonra kuyrukta bekleyenleri dene
  if (typeof window !== 'undefined') {
    setTimeout(() => { flushLeadQueue(); }, 3000);
    window.addEventListener('online', () => { flushLeadQueue(); });
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuoteModal, { once: true });
  } else {
    initQuoteModal();
  }
}

// ── window expose (debug + i18n hook) ────────────────────────────────────────
window.openQuoteModal = openQuoteModal;
window.closeQuoteModal = closeQuoteModal;
window.openLegalModal = openLegalModal;
window.closeLegalModal = closeLegalModal;
window.submitQuoteForm = submitQuoteForm;
window.flushLeadQueue = flushLeadQueue;
window.refreshLegalModalIfOpen = refreshLegalModalIfOpen;
