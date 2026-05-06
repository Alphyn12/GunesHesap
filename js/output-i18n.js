// Shared presentation translations for report/export/governance output layers.
// Business-rule modules may keep stable raw statuses and blocker strings; this
// module turns those values into selected-language display text at the boundary.
import { i18n } from './i18n.js';

const MESSAGE_RULES = [
  [/^([^:]+): doğrulanmış kanıt yok\.$/, 'warnings.evidenceMissing', ['item']],
  [/^([^:]+): doğrulanmış dosya eki ve SHA-256 parmak izi yok\.$/, 'warnings.evidenceFileMissing', ['item']],
  [/^tariffSource: kaynak doküman eki veya kaynak URL yok\.$/, 'warnings.tariffSourceDocumentMissing', []],
  [/^tariffSource: kaynak kontrol tarihi eski veya eksik\.$/, 'warnings.tariffSourceStale', []],
  [/^regulationSource: regülasyon kaynak kontrol tarihi 90 günden eski veya eksik\.$/, 'warnings.regulationSourceStale', []],
  [/^([^:]+): kanıt geçerlilik tarihi dolmuş\.$/, 'warnings.evidenceExpired', ['item']],
  [/^supplierQuote: geçerlilik tarihi yok; marj ve satış fiyatı riskli\.$/, 'warnings.supplierQuoteValidityMissing', []],
  [/^Tarife kaynak kontrol tarihi 45 günden eski veya eksik\.$/, 'warnings.tariffSourceStale45', []],
  [/^PVGIS canlı veri yok; fallback üretim quote-ready kabul edilmez\.$/, 'warnings.pvgisLiveDataMissing', []],
  [/^Çatı geometrisi harita\/saha çizimiyle doğrulanmadı\.$/, 'warnings.roofGeometryUnverified', []],
  [/^Teklif varsayımları yetkili kullanıcı tarafından doğrulanmadı\.$/, 'warnings.proposalInputsUnverified', []],
  [/^Müşteri fatura\/tüketim verisi doğrulanmadı\.$/, 'warnings.customerBillUnverified', []],
  [/^Proposal onay durumu approved değil\.$/, 'warnings.proposalNotApproved', []],
  [/^Immutable onay kaydı yok\.$/, 'warnings.immutableApprovalMissing', []],
  [/^Tedarikçi BOM teklifi alınmadı\.$/, 'warnings.supplierBomMissing', []],
  [/^Şebeke başvuru kontrol listesi oluşturulmadı\.$/, 'warnings.gridChecklistMissing', []],
  [/^Tarife kaynak tarihi\/etiketi eksik\.$/, 'warnings.tariffSourceMetadataMissing', []],
  [/^Quote-readiness blocker mevcut\.$/, 'warnings.quoteReadinessBlockerPresent', []],
  [/^Proposal ticari temeli değişti; mevcut onay geçersiz, yeni revizyon\/onay gerekli\.$/, 'warnings.approvalInvalidatedByMaterialChange', []]
];

export function evidenceItemLabel(item, translate = i18n.t.bind(i18n)) {
  const key = `evidenceItems.${String(item || '').trim()}`;
  const translated = translate(key);
  return translated && translated !== key ? translated : String(item || '');
}

export function tx(key, params = {}, translate = i18n.t.bind(i18n)) {
  const template = translate(key);
  const value = template && template !== key ? template : key;
  return String(value).replace(/\{(\w+)\}/g, (_, name) => {
    const replacement = params[name];
    return replacement === undefined || replacement === null ? '' : String(replacement);
  });
}

export function localeTag(locale = i18n.locale) {
  if (locale === 'en') return 'en-US';
  if (locale === 'de') return 'de-DE';
  return 'tr-TR';
}

export function localizeKnownMessage(message, translate = i18n.t.bind(i18n)) {
  if (!message) return '';
  const raw = String(message);
  for (const [pattern, key, names] of MESSAGE_RULES) {
    const match = raw.match(pattern);
    if (!match) continue;
    const params = {};
    names.forEach((name, index) => {
      params[name] = name === 'item' ? evidenceItemLabel(match[index + 1], translate) : match[index + 1];
    });
    return tx(key, params, translate);
  }
  return raw;
}

export function localizeMessageList(messages = [], translate = i18n.t.bind(i18n)) {
  return (Array.isArray(messages) ? messages : [])
    .filter(Boolean)
    .map(message => localizeKnownMessage(message, translate));
}

export function statusLabel(status, translate = i18n.t.bind(i18n)) {
  if (status === undefined || status === null || status === '') return '—';
  const normalized = String(status)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');
  const key = `status.${normalized}`;
  const translated = translate(key);
  return translated && translated !== key ? translated : String(status);
}

export function yesNo(value, translate = i18n.t.bind(i18n)) {
  return value ? translate('common.yes') : translate('common.no');
}
