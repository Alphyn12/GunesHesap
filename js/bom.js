// BOM selection and costing helpers shared by proposal and calculation flows.

const BASE_CATEGORIES = ['panel', 'inverter', 'mounting', 'cable', 'labor', 'other'];

function cleanString(value, fallback = '') {
  return String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

function finiteNonNegative(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function normalizeBomItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item, idx) => {
    const category = cleanString(item?.category || 'other');
    const unit = cleanString(item?.unit || 'fixed');
    return {
      id: cleanString(item?.id || `${category}-${idx + 1}`),
      category,
      supplier: cleanString(item?.supplier || ''),
      name: cleanString(item?.name || item?.label || category),
      unit,
      unitCost: finiteNonNegative(item?.unitCost ?? item?.cost ?? item?.price, 0),
      qty: finiteNonNegative(item?.qty ?? item?.quantity, 1) || 1,
      currency: cleanString(item?.currency || 'TRY')
    };
  }).filter(item => item.id && item.category && item.unitCost >= 0);
}

export function getActiveBomCategories(state = {}) {
  const categories = new Set(BASE_CATEGORIES);
  if (state.batteryEnabled) categories.add('battery');
  if (state.bomCommercials?.includeMonitoringHardware) categories.add('monitoring');
  return categories;
}

export function selectBomItems(items = [], selection = {}, { activeCategories = null } = {}) {
  const normalized = normalizeBomItems(items);
  const active = activeCategories instanceof Set ? activeCategories : getActiveBomCategories({});
  const byCategory = new Map();
  normalized.forEach(item => {
    if (!active.has(item.category)) return;
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  });

  const selected = [];
  for (const category of active) {
    const candidates = byCategory.get(category) || [];
    if (!candidates.length) continue;
    const requestedId = selection?.[category];
    selected.push(candidates.find(item => item.id === requestedId) || candidates[0]);
  }
  return selected;
}

/**
 * BOM toplamı: her satır için `(unit-multiplier) × (item.qty)` çarpılır.
 *
 * Sözleşme: `quantities[item.unit]` bir SİSTEM ÇARPANI (panel sayısı, kWp, m² gibi
 * birim başına düşen miktar). `item.qty` ise ITEM içsel miktarıdır (örn. 1 inverter
 * paketi içinde 2 mppt). Sonuç çarpımdır — `quantities[item.unit] = 5` ve
 * `item.qty = 2` ise satır miktarı 10 olur.
 *
 * Eğer çağıran toplam miktarı önceden hesapladıysa `item.qty = 1` ile gönderilmeli;
 * aksi halde çift sayım olur.
 *
 * @param {Array<object>} items — normalize edilmemiş ham BOM kalemleri
 * @param {Record<string, number>} quantities — birim ('panel', 'kwp', 'm2', 'fixed' vs.)
 *        bazında sistem çarpanı; eksik birim için varsayılan 1.
 * @returns {{ rows: Array<object>, subtotal: number }}
 */
export function calculateBomTotal(items = [], quantities = {}) {
  const selected = normalizeBomItems(items);
  const rows = selected.map(item => {
    const quantity = finiteNonNegative(quantities[item.unit], 1) * (finiteNonNegative(item.qty, 1) || 1);
    const total = Math.round(item.unitCost * quantity);
    return {
      ...item,
      quantity,
      total
    };
  });
  return {
    rows,
    subtotal: rows.reduce((sum, row) => sum + row.total, 0)
  };
}
