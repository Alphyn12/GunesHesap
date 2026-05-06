// ═══════════════════════════════════════════════════════════
// Device Catalog — Solar Rota Off-Grid Cihaz Kütüphanesi
// Hazır cihazlar + kullanım tipleri + dispatch motor besleme
// DOM erişimi yok. Saf veri modülü.
// ═══════════════════════════════════════════════════════════

export const DEVICE_USAGE_TYPES = {
  CONTINUOUS: 'continuous',  // Sürekli (buzdolabı, modem, kamera)
  CYCLIC:     'cyclic',      // Çevrimsel (çamaşır, bulaşık)
  SCHEDULED:  'scheduled',   // Zamanlı (pompa, sulama)
  MANUAL:     'manual'       // Kullanıcı kontrollü (TV, lamba, alet)
};

export const DEVICE_CATEGORIES = [
  'lighting',
  'refrigerator',
  'hvac',
  'entertainment',
  'security',
  'kitchen',
  'laundry',
  'pump',
  'workshop',
  'gaming',
  'generic'
];

export const DEVICE_CATEGORY_LABELS = {
  tr: {
    lighting:      'Aydınlatma',
    refrigerator:  'Buzdolabı / Dondurucu',
    hvac:          'Klima / Fan',
    entertainment: 'TV / Medya / Modem',
    security:      'Güvenlik Sistemi',
    kitchen:       'Küçük Mutfak',
    laundry:       'Çamaşır / Ütü',
    pump:          'Pompa / Hidrofor',
    workshop:      'Atölye / El Aleti',
    gaming:        'Oyun / Konsol',
    generic:       'Genel / Diğer'
  },
  en: {
    lighting:      'Lighting',
    refrigerator:  'Refrigerator / Freezer',
    hvac:          'Air Conditioner / Fan',
    entertainment: 'TV / Media / Router',
    security:      'Security System',
    kitchen:       'Small Kitchen Appliances',
    laundry:       'Washer / Iron',
    pump:          'Pump / Booster',
    workshop:      'Workshop / Power Tools',
    gaming:        'Gaming / Console',
    generic:       'General / Other'
  },
  de: {
    lighting:      'Beleuchtung',
    refrigerator:  'Kühlschrank / Tiefkühlgerät',
    hvac:          'Klimaanlage / Ventilator',
    entertainment: 'TV / Medien / Router',
    security:      'Sicherheitssystem',
    kitchen:       'Kleine Küchengeräte',
    laundry:       'Waschmaschine / Bügeleisen',
    pump:          'Pumpe / Druckerhöher',
    workshop:      'Werkstatt / Elektrowerkzeug',
    gaming:        'Gaming / Konsole',
    generic:       'Allgemein / Sonstiges'
  }
};

/**
 * Standart katalog listesi.
 * powerW = nominal güç (W)
 * defaultHoursPerDay = varsayılan günlük çalışma saati
 * defaultNightHours = gece (18:00-06:00) çalışma saati (dispatch için)
 * defaultCritical = kritik yük varsayılanı
 */
export const DEVICE_CATALOG = [
  // ── Aydınlatma ────────────────────────────────────────────────────────────
  { id: 'led-9w',          name: 'LED Ampul 9W',             category: 'lighting',     powerW: 9,    usageType: 'manual',    defaultHoursPerDay: 5,   defaultNightHours: 4,  defaultCritical: false },
  { id: 'led-15w',         name: 'LED Şerit 15W',            category: 'lighting',     powerW: 15,   usageType: 'manual',    defaultHoursPerDay: 4,   defaultNightHours: 3,  defaultCritical: false },
  { id: 'led-panel-24w',   name: 'LED Panel 24W',            category: 'lighting',     powerW: 24,   usageType: 'manual',    defaultHoursPerDay: 5,   defaultNightHours: 4,  defaultCritical: true  },
  { id: 'led-50w',         name: 'LED Projektör 50W',        category: 'lighting',     powerW: 50,   usageType: 'manual',    defaultHoursPerDay: 4,   defaultNightHours: 4,  defaultCritical: false },
  // ── Buzdolabı / Dondurucu ─────────────────────────────────────────────────
  { id: 'fridge-150l',     name: 'Buzdolabı 150L (A++)',     category: 'refrigerator', powerW: 70,   usageType: 'continuous',defaultHoursPerDay: 24,  defaultNightHours: 24, defaultCritical: true  },
  { id: 'fridge-300l',     name: 'Buzdolabı 300L (A+)',      category: 'refrigerator', powerW: 120,  usageType: 'continuous',defaultHoursPerDay: 24,  defaultNightHours: 24, defaultCritical: true  },
  { id: 'freezer-200l',    name: 'Derin Dondurucu 200L',     category: 'refrigerator', powerW: 100,  usageType: 'continuous',defaultHoursPerDay: 24,  defaultNightHours: 24, defaultCritical: true  },
  { id: 'mini-fridge',     name: 'Mini Buzdolabı 50L',       category: 'refrigerator', powerW: 45,   usageType: 'continuous',defaultHoursPerDay: 24,  defaultNightHours: 24, defaultCritical: false },
  // ── Klima / Fan ───────────────────────────────────────────────────────────
  { id: 'ac-9000',         name: 'Klima 9.000 BTU',          category: 'hvac',         powerW: 900,  usageType: 'manual',    defaultHoursPerDay: 6,   defaultNightHours: 4,  defaultCritical: false },
  { id: 'ac-12000',        name: 'Klima 12.000 BTU',         category: 'hvac',         powerW: 1200, usageType: 'manual',    defaultHoursPerDay: 8,   defaultNightHours: 5,  defaultCritical: false },
  { id: 'ac-18000',        name: 'Klima 18.000 BTU',         category: 'hvac',         powerW: 1800, usageType: 'manual',    defaultHoursPerDay: 8,   defaultNightHours: 4,  defaultCritical: false },
  { id: 'fan-ceiling',     name: 'Tavan Vantilatörü 60W',    category: 'hvac',         powerW: 60,   usageType: 'manual',    defaultHoursPerDay: 8,   defaultNightHours: 6,  defaultCritical: false },
  { id: 'fan-stand',       name: 'Ayaklı Fan 45W',           category: 'hvac',         powerW: 45,   usageType: 'manual',    defaultHoursPerDay: 6,   defaultNightHours: 4,  defaultCritical: false },
  // ── TV / Medya / Modem ────────────────────────────────────────────────────
  { id: 'tv-32',           name: 'TV 32" LED',               category: 'entertainment',powerW: 45,   usageType: 'manual',    defaultHoursPerDay: 4,   defaultNightHours: 3,  defaultCritical: false },
  { id: 'tv-50',           name: 'TV 50" LED',               category: 'entertainment',powerW: 80,   usageType: 'manual',    defaultHoursPerDay: 4,   defaultNightHours: 3,  defaultCritical: false },
  { id: 'modem',           name: 'Modem / Router 15W',       category: 'entertainment',powerW: 15,   usageType: 'continuous',defaultHoursPerDay: 24,  defaultNightHours: 24, defaultCritical: true  },
  { id: 'laptop',          name: 'Laptop / Notebook 65W',    category: 'entertainment',powerW: 65,   usageType: 'manual',    defaultHoursPerDay: 6,   defaultNightHours: 2,  defaultCritical: true  },
  { id: 'desktop-pc',      name: 'Masaüstü Bilgisayar 300W', category: 'entertainment',powerW: 300,  usageType: 'manual',    defaultHoursPerDay: 6,   defaultNightHours: 1,  defaultCritical: false },
  { id: 'satellite',       name: 'Uydu Alıcısı 20W',         category: 'entertainment',powerW: 20,   usageType: 'manual',    defaultHoursPerDay: 4,   defaultNightHours: 3,  defaultCritical: false },
  // ── Güvenlik ──────────────────────────────────────────────────────────────
  { id: 'ip-camera',       name: 'IP Güvenlik Kamerası 12W', category: 'security',     powerW: 12,   usageType: 'continuous',defaultHoursPerDay: 24,  defaultNightHours: 24, defaultCritical: true  },
  { id: 'nvr-4ch',         name: 'DVR / NVR 4 Kanal 20W',   category: 'security',     powerW: 20,   usageType: 'continuous',defaultHoursPerDay: 24,  defaultNightHours: 24, defaultCritical: true  },
  { id: 'alarm',           name: 'Alarm Sistemi 15W',        category: 'security',     powerW: 15,   usageType: 'continuous',defaultHoursPerDay: 24,  defaultNightHours: 24, defaultCritical: true  },
  // ── Küçük Mutfak ─────────────────────────────────────────────────────────
  { id: 'microwave',       name: 'Mikrodalga Fırın 800W',    category: 'kitchen',      powerW: 800,  usageType: 'manual',    defaultHoursPerDay: 0.3, defaultNightHours: 0,  defaultCritical: false },
  { id: 'coffee',          name: 'Kahve Makinesi 1000W',     category: 'kitchen',      powerW: 1000, usageType: 'manual',    defaultHoursPerDay: 0.2, defaultNightHours: 0,  defaultCritical: false },
  { id: 'kettle',          name: 'Çaydanlık / Kettle 2000W', category: 'kitchen',      powerW: 2000, usageType: 'manual',    defaultHoursPerDay: 0.2, defaultNightHours: 0,  defaultCritical: false },
  { id: 'blender',         name: 'Blender / Mikser 500W',    category: 'kitchen',      powerW: 500,  usageType: 'manual',    defaultHoursPerDay: 0.1, defaultNightHours: 0,  defaultCritical: false },
  // ── Çamaşır / Ütü ────────────────────────────────────────────────────────
  { id: 'washing-machine', name: 'Çamaşır Makinesi 1800W',  category: 'laundry',      powerW: 1800, usageType: 'cyclic',    defaultHoursPerDay: 1.5, defaultNightHours: 0,  defaultCritical: false },
  { id: 'dishwasher',      name: 'Bulaşık Makinesi 1400W',  category: 'laundry',      powerW: 1400, usageType: 'cyclic',    defaultHoursPerDay: 1,   defaultNightHours: 0,  defaultCritical: false },
  { id: 'iron',            name: 'Ütü 2200W',               category: 'laundry',      powerW: 2200, usageType: 'manual',    defaultHoursPerDay: 0.3, defaultNightHours: 0,  defaultCritical: false },
  { id: 'hair-dryer',      name: 'Saç Kurutma 1800W',       category: 'laundry',      powerW: 1800, usageType: 'manual',    defaultHoursPerDay: 0.15,defaultNightHours: 0,  defaultCritical: false },
  // ── Pompa / Hidrofor ──────────────────────────────────────────────────────
  { id: 'pump-submersible',name: 'Dalgıç Pompa 750W',       category: 'pump',         powerW: 750,  usageType: 'scheduled', defaultHoursPerDay: 3,   defaultNightHours: 0,  defaultCritical: true  },
  { id: 'pump-surface',    name: 'Yüzey Pompası 550W',      category: 'pump',         powerW: 550,  usageType: 'scheduled', defaultHoursPerDay: 3,   defaultNightHours: 0,  defaultCritical: true  },
  { id: 'pump-booster',    name: 'Hidrofor / Pompa 370W',   category: 'pump',         powerW: 370,  usageType: 'scheduled', defaultHoursPerDay: 4,   defaultNightHours: 1,  defaultCritical: true  },
  // ── Atölye / El Aleti ────────────────────────────────────────────────────
  { id: 'angle-grinder',   name: 'Taşlama / Flex 1100W',    category: 'workshop',     powerW: 1100, usageType: 'manual',    defaultHoursPerDay: 0.5, defaultNightHours: 0,  defaultCritical: false },
  { id: 'drill',           name: 'Matkap 700W',             category: 'workshop',     powerW: 700,  usageType: 'manual',    defaultHoursPerDay: 0.5, defaultNightHours: 0,  defaultCritical: false },
  { id: 'circular-saw',    name: 'Daire Testere 1400W',     category: 'workshop',     powerW: 1400, usageType: 'manual',    defaultHoursPerDay: 0.5, defaultNightHours: 0,  defaultCritical: false },
  { id: 'welder',          name: 'İnvertör Kaynak 160A',    category: 'workshop',     powerW: 4000, usageType: 'manual',    defaultHoursPerDay: 1,   defaultNightHours: 0,  defaultCritical: false },
  // ── Oyun / Konsol ────────────────────────────────────────────────────────
  { id: 'console',         name: 'Oyun Konsolu 150W',       category: 'gaming',       powerW: 150,  usageType: 'manual',    defaultHoursPerDay: 3,   defaultNightHours: 2,  defaultCritical: false },
  { id: 'gaming-pc',       name: 'Oyun Bilgisayarı 400W',   category: 'gaming',       powerW: 400,  usageType: 'manual',    defaultHoursPerDay: 3,   defaultNightHours: 2,  defaultCritical: false },
  // ── Genel / Diğer ────────────────────────────────────────────────────────
  { id: 'phone-charger',   name: 'Telefon Şarj ×4',         category: 'generic',      powerW: 20,   usageType: 'manual',    defaultHoursPerDay: 6,   defaultNightHours: 5,  defaultCritical: false },
  { id: 'tablet-charger',  name: 'Tablet Şarj ×2',          category: 'generic',      powerW: 20,   usageType: 'manual',    defaultHoursPerDay: 4,   defaultNightHours: 3,  defaultCritical: false },
  { id: 'generic-100w',    name: 'Genel Cihaz 100W',        category: 'generic',      powerW: 100,  usageType: 'manual',    defaultHoursPerDay: 4,   defaultNightHours: 1,  defaultCritical: false },
];

/** Kategoriye göre cihaz listesi */
export function getDevicesByCategory(category) {
  return DEVICE_CATALOG.filter(d => d.category === category);
}

/** ID ile cihaz bul */
export function findCatalogDevice(id) {
  return DEVICE_CATALOG.find(d => d.id === id) || null;
}

/**
 * Katalog cihazından off-grid state device nesnesi oluştur.
 * quantity adet bulunan ve etkili toplu güce sahip cihaz döner.
 */
export function catalogItemToDevice(catalogItem, quantity = 1, overrides = {}) {
  const qty = Math.max(1, Math.round(Number(quantity) || 1));
  return {
    name: qty > 1 ? `${catalogItem.name} ×${qty}` : catalogItem.name,
    category: catalogItem.category,
    powerW: catalogItem.powerW * qty,
    hoursPerDay: overrides.hoursPerDay ?? catalogItem.defaultHoursPerDay,
    nightHoursPerDay: overrides.nightHoursPerDay ?? catalogItem.defaultNightHours,
    isCritical: overrides.isCritical ?? catalogItem.defaultCritical,
    quantity: qty,
    usageType: catalogItem.usageType,
    catalogId: catalogItem.id
  };
}

/**
 * Günlük enerji tüketimi (Wh/gün).
 * Güç (W) × saatler/gün = Wh/gün.
 */
export function deviceDailyWhd(device) {
  const powerW = Math.max(0, Number(device.powerW) || 0);
  const hours  = Math.max(0, Number(device.hoursPerDay) || 0);
  return powerW * hours;
}
