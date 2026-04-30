// ═══════════════════════════════════════════════════════════
// DATA — Tüm sabitler ve referans verileri
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════

export const TURKISH_CITIES = [
  { name: "İstanbul", lat: 41.0082, lon: 28.9784, ghi: 1550 },
  { name: "Ankara", lat: 39.9334, lon: 32.8597, ghi: 1620 },
  { name: "İzmir", lat: 38.4192, lon: 27.1287, ghi: 1720 },
  { name: "Antalya", lat: 36.8969, lon: 30.7133, ghi: 1800 },
  { name: "Bursa", lat: 40.1885, lon: 29.0610, ghi: 1580 },
  { name: "Adana", lat: 37.0000, lon: 35.3213, ghi: 1780 },
  { name: "Konya", lat: 37.8715, lon: 32.4846, ghi: 1680 },
  { name: "Gaziantep", lat: 37.0662, lon: 37.3833, ghi: 1820 },
  { name: "Şanlıurfa", lat: 37.1591, lon: 38.7969, ghi: 1880 },
  { name: "Mersin", lat: 36.8000, lon: 34.6333, ghi: 1790 },
  { name: "Diyarbakır", lat: 37.9144, lon: 40.2306, ghi: 1750 },
  { name: "Edirne", lat: 41.6818, lon: 26.5623, ghi: 1490 },
  { name: "Trabzon", lat: 41.0015, lon: 39.7178, ghi: 1320 },
  { name: "Erzurum", lat: 39.9055, lon: 41.2658, ghi: 1580 },
  { name: "Malatya", lat: 38.3552, lon: 38.3095, ghi: 1720 },
  { name: "Kayseri", lat: 38.7312, lon: 35.4787, ghi: 1650 },
  { name: "Eskişehir", lat: 39.7767, lon: 30.5206, ghi: 1580 },
  { name: "Samsun", lat: 41.2867, lon: 36.3300, ghi: 1380 },
  { name: "Denizli", lat: 37.7765, lon: 29.0864, ghi: 1720 },
  { name: "Sakarya", lat: 40.7731, lon: 30.3949, ghi: 1500 },
  { name: "Tekirdağ", lat: 40.9781, lon: 27.5115, ghi: 1490 },
  { name: "Balıkesir", lat: 39.6484, lon: 27.8826, ghi: 1580 },
  { name: "Kahramanmaraş", lat: 37.5753, lon: 36.9228, ghi: 1780 },
  { name: "Van", lat: 38.4938, lon: 43.3800, ghi: 1700 },
  { name: "Aydın", lat: 37.8444, lon: 27.8458, ghi: 1760 },
  { name: "Manisa", lat: 38.6191, lon: 27.4289, ghi: 1680 },
  { name: "Muğla", lat: 37.2153, lon: 28.3636, ghi: 1780 },
  { name: "Hatay", lat: 36.4018, lon: 36.3498, ghi: 1800 },
  { name: "Kocaeli", lat: 40.8533, lon: 29.8815, ghi: 1480 },
  { name: "Ordu", lat: 40.9862, lon: 37.8797, ghi: 1340 },
  { name: "Afyonkarahisar", lat: 38.7507, lon: 30.5567, ghi: 1620 },
  { name: "Çorum", lat: 40.5506, lon: 34.9556, ghi: 1580 },
  { name: "Sivas", lat: 39.7477, lon: 37.0179, ghi: 1600 },
  { name: "Elazığ", lat: 38.6810, lon: 39.2264, ghi: 1720 },
  { name: "Tokat", lat: 40.3167, lon: 36.5544, ghi: 1500 },
  { name: "Osmaniye", lat: 37.0742, lon: 36.2464, ghi: 1760 },
  { name: "Düzce", lat: 40.8438, lon: 31.1565, ghi: 1420 },
  { name: "Muş", lat: 38.7432, lon: 41.5064, ghi: 1620 },
  { name: "Nevşehir", lat: 38.6939, lon: 34.6857, ghi: 1650 },
  { name: "Isparta", lat: 37.7648, lon: 30.5566, ghi: 1700 },
  { name: "Aksaray", lat: 38.3687, lon: 34.0370, ghi: 1640 },
  { name: "Niğde", lat: 37.9667, lon: 34.6833, ghi: 1650 },
  { name: "Karaman", lat: 37.1759, lon: 33.2287, ghi: 1700 },
  { name: "Rize", lat: 41.0201, lon: 40.5234, ghi: 1260 },
  { name: "Giresun", lat: 40.9128, lon: 38.3895, ghi: 1320 },
  { name: "Artvin", lat: 41.1828, lon: 41.8183, ghi: 1280 },
  { name: "Sinop", lat: 42.0231, lon: 35.1531, ghi: 1380 },
  { name: "Kastamonu", lat: 41.3887, lon: 33.7827, ghi: 1450 },
  { name: "Zonguldak", lat: 41.4564, lon: 31.7987, ghi: 1380 },
  { name: "Bolu", lat: 40.7360, lon: 31.6061, ghi: 1460 },
  { name: "Bartın", lat: 41.6344, lon: 32.3375, ghi: 1390 },
  { name: "Karabük", lat: 41.2061, lon: 32.6204, ghi: 1440 },
  { name: "Kırıkkale", lat: 39.8468, lon: 33.5153, ghi: 1600 },
  { name: "Kırklareli", lat: 41.7333, lon: 27.2167, ghi: 1470 },
  { name: "Kırşehir", lat: 39.1425, lon: 34.1709, ghi: 1620 },
  { name: "Çankırı", lat: 40.6013, lon: 33.6134, ghi: 1540 },
  { name: "Yozgat", lat: 39.8181, lon: 34.8147, ghi: 1580 },
  { name: "Amasya", lat: 40.6499, lon: 35.8353, ghi: 1520 },
  { name: "Çanakkale", lat: 40.1553, lon: 26.4142, ghi: 1560 },
  { name: "Bilecik", lat: 40.1506, lon: 29.9792, ghi: 1510 },
  { name: "Kütahya", lat: 39.4167, lon: 29.9833, ghi: 1590 },
  { name: "Uşak", lat: 38.6823, lon: 29.4082, ghi: 1660 },
  { name: "Burdur", lat: 37.7260, lon: 30.2900, ghi: 1720 },
  { name: "Mardin", lat: 37.3212, lon: 40.7245, ghi: 1840 },
  { name: "Batman", lat: 37.8812, lon: 41.1351, ghi: 1760 },
  { name: "Şırnak", lat: 37.5164, lon: 42.4611, ghi: 1760 },
  { name: "Siirt", lat: 37.9333, lon: 41.9500, ghi: 1760 },
  { name: "Bitlis", lat: 38.3938, lon: 42.1232, ghi: 1640 },
  { name: "Ağrı", lat: 39.7191, lon: 43.0503, ghi: 1620 },
  { name: "Iğdır", lat: 39.9167, lon: 44.0453, ghi: 1680 },
  { name: "Kars", lat: 40.6013, lon: 43.0975, ghi: 1550 },
  { name: "Ardahan", lat: 41.1105, lon: 42.7022, ghi: 1480 },
  { name: "Hakkari", lat: 37.5744, lon: 43.7408, ghi: 1700 },
  { name: "Adıyaman", lat: 37.7648, lon: 38.2786, ghi: 1800 },
  { name: "Bingöl", lat: 38.8854, lon: 40.4982, ghi: 1680 },
  { name: "Tunceli", lat: 39.1079, lon: 39.5478, ghi: 1660 },
  { name: "Gümüşhane", lat: 40.4386, lon: 39.5086, ghi: 1500 },
  { name: "Bayburt", lat: 40.2552, lon: 40.2249, ghi: 1520 },
  { name: "Erzincan", lat: 39.7500, lon: 39.5000, ghi: 1640 }
];

const PANEL_TYPE_PROFILES = {
  mono_perc: {
    name: "Monokristal PERC",
    badge: "Dengeli seçim",
    summary: "Klasik tek yüzeyli panel mimarisi. Maliyet ile performans arasında dengeli çözüm arayan çatılar için güvenli tercih.",
    exampleModel: "Trina Vertex S TSM-DE09R.08",
    exampleSize: "1762 × 1134 × 30 mm",
    powerRange: "415–435 W",
    cellLayout: "144 yarım hücre",
    bestFor: "Standart konut çatısı",
    watchFor: "Aynı alanda TOPCon kadar yüksek güç yoğunluğu vermez.",
    efficiency: 0.218,
    wattPeak: 435,
    width: 1.134, height: 1.762,
    tempCoeff: -0.0034,
    degradation: 0.0055,
    firstYearDeg: 0.02,
    pricePerWatt: 18.5,
    warranty: 15,
    powerWarranty: 25,
    standard: "IEC 61215 / IEC 61730",
    bifacialGain: 0
  },
  n_type_topcon: {
    name: "N-Type TOPCon",
    badge: "Güncel standart",
    summary: "Yeni nesil yüksek verimli panel sınıfı. Aynı çatı alanında daha yüksek güç kurmaya yardımcı olur ve sıcak iklimde PERC'e göre daha dengeli davranır.",
    exampleModel: "Trina Vertex S+ TSM-NEG9R.28",
    exampleSize: "1762 × 1134 × 30 mm",
    powerRange: "430–455 W",
    cellLayout: "144 yarım hücre, dual-glass",
    bestFor: "Alanı kısıtlı ama üretim hedefi yüksek çatılar",
    watchFor: "İlk yatırım maliyeti PERC'e göre genelde daha yüksektir.",
    efficiency: 0.228,
    wattPeak: 455,
    width: 1.134, height: 1.762,
    tempCoeff: -0.0029,
    degradation: 0.0040,
    firstYearDeg: 0.01,
    pricePerWatt: 21.5,
    warranty: 25,
    powerWarranty: 30,
    standard: "IEC 61215 / IEC 61730 / IEC 62716",
    bifacialGain: 0
  },
  bifacial_topcon: {
    name: "Bifacial N-Type TOPCon",
    badge: "Arka yüz kazancı",
    summary: "Ön ve arka yüzden üretim alabilen çift cam panel. Açık renkli membran, sehpa sistem veya carport gibi yansıtıcı yüzeylerde fark yaratır.",
    exampleModel: "Astronergy ASTRO N7s",
    exampleSize: "1762 × 1134 × 30 mm",
    powerRange: "445–465 W",
    cellLayout: "108 yarım hücre, çift cam",
    bestFor: "Yükseltilmiş taşıyıcı ve açık renk zeminli kurulumlar",
    watchFor: "Koyu zeminli ve çatıya sıfır kurulumda arka yüz kazancı sınırlı kalır.",
    efficiency: 0.233,
    wattPeak: 455,
    width: 1.134, height: 1.762,
    tempCoeff: -0.0029,
    degradation: 0.0040,
    firstYearDeg: 0.01,
    pricePerWatt: 23.5,
    warranty: 25,
    powerWarranty: 30,
    standard: "IEC 61215 / IEC TS 60904-1-2",
    bifacialGain: 0.05
  },
  hjt: {
    name: "HJT Premium",
    badge: "Premium sıcak iklim",
    summary: "Heterojunction hücre mimarisi sıcaklık davranışı ve premium performans sınıfıyla öne çıkar. Yüksek kalite odaklı konut projelerinde tercih edilir.",
    exampleModel: "REC Alpha Pure-RX",
    exampleSize: "1728 × 1205 × 30 mm",
    powerRange: "450–470 W",
    cellLayout: "HJT rooftop module",
    bestFor: "Premium konut ve sıcak havada sıcaklık kaybını düşürmek isteyen projeler",
    watchFor: "Fiyat seviyesi ana akım TOPCon ürünlerinden yüksektir.",
    efficiency: 0.226,
    wattPeak: 460,
    width: 1.205, height: 1.728,
    tempCoeff: -0.0024,
    degradation: 0.0025,
    firstYearDeg: 0.01,
    pricePerWatt: 28.5,
    warranty: 25,
    powerWarranty: 25,
    standard: "IEC 61215 / IEC 61730",
    bifacialGain: 0
  }
};

export const PANEL_TYPE_KEY_ALIASES = {
  mono: "mono_perc",
  poly: "n_type_topcon",
  bifacial: "bifacial_topcon"
};

export const PANEL_TYPE_OPTIONS = ["mono_perc", "n_type_topcon", "bifacial_topcon", "hjt"];

export function normalizePanelTypeKey(rawKey) {
  const key = String(rawKey || "").trim();
  if (PANEL_TYPE_PROFILES[key]) return key;
  if (PANEL_TYPE_KEY_ALIASES[key]) return PANEL_TYPE_KEY_ALIASES[key];
  return "mono_perc";
}

export const PANEL_TYPES = {
  ...PANEL_TYPE_PROFILES,
  mono: PANEL_TYPE_PROFILES.mono_perc,
  poly: PANEL_TYPE_PROFILES.n_type_topcon,
  bifacial: PANEL_TYPE_PROFILES.bifacial_topcon
};

export const BATTERY_MODELS = {
  tesla_pw3: {
    name: 'Tesla Powerwall 3',
    capacity: 13.5, dod: 1.00, efficiency: 0.89,
    spec: '13.5 kWh usable / 11.5 kW sürekli güç',
    chemistry: 'LFP',
    warranty: 10,
    cycles: null,
    price_try: 220000,
    brand: 'Tesla',
    usableCapacity: 13.5,
    maxOutputKw: 11.5,
    maxChargeKw: 5.0,
    dimensions: '1105 × 609 × 193 mm',
    voltageClass: 'Entegre inverterli AC + yüksek voltaj PV girişi',
    expandability: '4 Powerwall 3 + ilave Expansion modülleri',
    useCase: 'Kesinti yedeği, tam ev yedekleme ve yüksek anlık güç ihtiyacı',
    details: '6 MPPT girişli entegre solar inverter içerir. Resmi teknik dökümanda solar-to-battery-to-home/grid çevrim verimi %89 olarak verilir.'
  },
  huawei_luna15: {
    name: 'Huawei LUNA2000-15-S0',
    capacity: 15.0, dod: 1.00, efficiency: 0.95,
    spec: '15 kWh usable / 5 kW çıkış',
    chemistry: 'LFP',
    warranty: 10,
    cycles: 5000,
    price_try: 180000,
    brand: 'Huawei',
    usableCapacity: 15.0,
    maxOutputKw: 5.0,
    maxChargeKw: 5.0,
    dimensions: '670 × 150 × 1320 mm',
    voltageClass: 'Yüksek voltaj (350–560 V tek faz)',
    expandability: '5 / 10 / 15 kWh modüler kule',
    useCase: 'Huawei SUN2000 hibrit inverterle entegre, sessiz ve modüler ev depolaması',
    details: 'Resmi Huawei S0 teknik sayfasında 15 kWh usable enerji, IP66 koruma, <29 dB gürültü ve 10 yıl / >5000 çevrim (80% SOH) bilgisi bulunur. Hesap motorunda %95 tipik round-trip varsayımı kullanılır.'
  },
  byd_hvs128: {
    name: 'BYD Battery-Box Premium HVS 12.8',
    capacity: 12.8, dod: 1.00, efficiency: 0.95,
    spec: '12.8 kWh usable / yüksek voltaj kule',
    chemistry: 'LFP',
    warranty: 10,
    cycles: null,
    price_try: 205000,
    brand: 'BYD',
    usableCapacity: 12.8,
    maxOutputKw: 12.8,
    maxChargeKw: 12.8,
    dimensions: '1461 × 585 × 298 mm',
    voltageClass: 'Yüksek voltaj seri bağlı modüller',
    expandability: '5.1–12.8 kWh tek kule, 38.4 kWh paralel',
    useCase: 'Yüksek voltaj hibrit sistem, güçlü yedekleme ve ölçeklenebilirlik',
    details: 'BYD resmi HVS teknik verisine göre HVS 12.8 modeli 5 modülle 12.8 kWh usable enerjiye ulaşır. Modüler kule mimarisi sonradan genişlemeye uygundur.'
  },
  sungrow_sbr096: {
    name: 'Sungrow SBR096',
    capacity: 9.6, dod: 1.00, efficiency: 0.95,
    spec: '9.6 kWh usable / 30 A HV LFP',
    chemistry: 'LFP',
    warranty: null,
    cycles: null,
    price_try: 165000,
    brand: 'Sungrow',
    usableCapacity: 9.6,
    maxOutputKw: 8.6,
    maxChargeKw: 8.6,
    dimensions: 'Yaklaşık 625 × 330 × 1185 mm',
    voltageClass: 'Yüksek voltaj modüler batarya',
    expandability: '6.4–25.6 kWh (2–8 modül)',
    useCase: 'Modüler büyümek isteyen ev kullanıcıları için esnek çözüm',
    details: 'Sungrow resmi SBR serisi sayfasında 6.4–25.6 kWh kapasite aralığı, 30 A sürekli şarj/deşarj ve %100 usable enerji bilgisi verilir. 9.6 kWh seçenek 3 modül üzerinden modellenir.'
  },
  solaredge_home_97: {
    name: 'SolarEdge Home Battery 400V',
    capacity: 9.7, dod: 1.00, efficiency: 0.945,
    spec: '9.7 kWh usable / 5 kW sürekli güç',
    chemistry: 'NMC',
    warranty: 10,
    cycles: null,
    price_try: 175000,
    brand: 'SolarEdge',
    usableCapacity: 9.7,
    maxOutputKw: 5.0,
    maxChargeKw: 5.0,
    dimensions: '790 × 1179 × 250 mm',
    voltageClass: '400V yüksek voltaj duvar tipi',
    expandability: 'Tek invertere çoklu batarya bağlanabilir',
    useCase: 'SolarEdge ekosistemi kullanan evlerde temiz entegrasyon ve yedekleme için güçlü seçenek',
    details: 'SolarEdge resmi ürün sayfası ve teknik veri sayfasında 9.7 kWh usable enerji, 5 kW sürekli güç, %94.5 round-trip verim ve iç/dış mekan uyumluluğu belirtilir.'
  },
  custom: {
    name: 'Özel Batarya',
    capacity: 5.0, dod: 0.80, efficiency: 0.90,
    spec: 'Manuel giriş',
    chemistry: 'LFP',
    warranty: 5,
    cycles: 3000,
    price_try: 0,
    brand: 'Özel',
    usableCapacity: 4.0,
    maxOutputKw: null,
    maxChargeKw: null,
    dimensions: 'Kuruluma göre değişir',
    voltageClass: 'Kurguya göre değişir',
    expandability: 'Manuel tanımlanır',
    useCase: 'Elinizde veri sayfası olan özel sistemler',
    details: 'Nominal kapasite, kullanılabilir kapasite, DoD ve çevrim verimi proje özelinde manuel girilmelidir.'
  }
};

export const COMPASS_DIRS = [
  { name: "Kuzey",      azimuth: 0,   coeff: 0.55, angle: 270 },
  { name: "Kuzeydoğu", azimuth: 45,  coeff: 0.70, angle: 315 },
  { name: "Doğu",       azimuth: 90,  coeff: 0.85, angle: 0   },
  { name: "Güneydoğu", azimuth: 135, coeff: 0.97, angle: 45  },
  { name: "Güney",      azimuth: 180, coeff: 1.00, angle: 90  },
  { name: "Güneybatı", azimuth: 225, coeff: 0.97, angle: 135 },
  { name: "Batı",       azimuth: 270, coeff: 0.85, angle: 180 },
  { name: "Kuzeybatı", azimuth: 315, coeff: 0.70, angle: 225 }
];

// PSH (Peak Sun Hours/day) fallback tüm 81 il için genişletildi.
// Kaynak: TURKISH_CITIES GHI (kWh/m²/yıl) / 365. Orijinal 12 şehir PVGIS bazlı
// değerleri korundu; yeni iller GHI/365 formülüyle hesaplandı.
export const PSH_FALLBACK = {
  // Marmara
  "İstanbul":4.24,"Edirne":4.08,"Tekirdağ":4.08,"Kırklareli":4.03,
  "Çanakkale":4.27,"Bursa":4.32,"Balıkesir":4.33,"Bilecik":4.14,
  "Kocaeli":4.05,"Sakarya":4.11,"Düzce":3.89,"Bolu":4.00,
  "Bartın":3.81,"Karabük":3.95,"Zonguldak":3.78,
  // İç Anadolu
  "Ankara":4.44,"Eskişehir":4.33,"Kırıkkale":4.38,"Kırşehir":4.44,
  "Çankırı":4.22,"Çorum":4.33,"Yozgat":4.33,"Amasya":4.16,
  "Tokat":4.11,"Sivas":4.38,"Kayseri":4.52,"Nevşehir":4.52,
  "Aksaray":4.49,"Niğde":4.52,"Konya":4.60,"Karaman":4.66,
  "Afyonkarahisar":4.44,
  // Ege
  "İzmir":4.71,"Manisa":4.60,"Aydın":4.82,"Denizli":4.71,
  "Muğla":4.88,"Kütahya":4.36,"Uşak":4.55,"Isparta":4.66,"Burdur":4.71,
  // Akdeniz
  "Antalya":4.93,"Mersin":4.90,"Adana":4.87,"Hatay":4.93,
  "Osmaniye":4.82,"Kahramanmaraş":4.88,
  // Karadeniz
  "Trabzon":3.62,"Giresun":3.62,"Ordu":3.67,"Samsun":3.78,
  "Sinop":3.78,"Kastamonu":3.97,"Rize":3.45,"Artvin":3.51,
  "Gümüşhane":4.11,"Bayburt":4.16,
  // Doğu Anadolu
  "Erzurum":4.33,"Erzincan":4.49,"Malatya":4.71,"Elazığ":4.71,
  "Van":4.66,"Bitlis":4.49,"Muş":4.44,"Bingöl":4.60,
  "Tunceli":4.55,"Hakkari":4.66,"Kars":4.25,"Ardahan":4.05,
  "Ağrı":4.44,"Iğdır":4.60,
  // Güneydoğu Anadolu
  "Şanlıurfa":5.15,"Gaziantep":4.99,"Diyarbakır":4.79,"Mardin":5.04,
  "Adıyaman":4.93,"Batman":4.82,"Şırnak":4.82,"Siirt":4.82,
  // default — Türkiye ortalaması
  "default":4.50
};

export const CITY_SUMMER_TEMPS = {
  'Rize':23,'Trabzon':24,'Giresun':24,'Artvin':25,'Ordu':25,
  'Sinop':24,'Samsun':26,'Zonguldak':25,'Bartın':25,
  'Erzurum':21,'Kars':20,'Ardahan':19,'Ağrı':22,'Iğdır':28,
  'Hakkari':28,'Bitlis':25,'Muş':27,'Bingöl':28,'Tunceli':27,
  'Van':26,'Bayburt':22,'Gümüşhane':24,'Erzincan':27,
  'İstanbul':28,'Edirne':29,'Kırklareli':28,'Tekirdağ':27,
  'Bursa':29,'Balıkesir':30,'Çanakkale':28,'Bilecik':28,
  'Eskişehir':28,'Kütahya':27,'Afyonkarahisar':28,
  'İzmir':32,'Aydın':33,'Muğla':32,'Denizli':31,'Uşak':30,
  'Antalya':35,'Mersin':34,'Adana':36,'Hatay':34,'Osmaniye':35,
  'Şanlıurfa':38,'Gaziantep':36,'Mardin':37,'Diyarbakır':38,
  'Batman':37,'Şırnak':37,'Siirt':36,'Adıyaman':36,
  'Kahramanmaraş':35,'Elazığ':33,'Malatya':33,
  'Konya':31,'Kayseri':28,'Sivas':27,'Yozgat':26,
  'Ankara':29,'Kırıkkale':28,'Kırşehir':28,
  'Nevşehir':28,'Aksaray':29,'Niğde':27,'Karaman':30,
  'Isparta':30,'Burdur':30,
  'default':32
};

export const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
export const MONTH_WEIGHTS = [0.055,0.062,0.085,0.095,0.105,0.115,0.112,0.108,0.090,0.075,0.055,0.043];

export const APRIL_2026_TARIFF_SOURCE = {
  sourceDate: '2026-04-04',
  sourceLabel: 'EPDK/EMO Nisan 2026 elektrik tarife hesabı',
  evidenceRef: 'EPDK-EMO-2026-04',
  sourceUrl: 'https://www.emo.org.tr/ekler/e551bd640f4d509_ek.pdf?sube=13&tipi=2&turu=X'
};

export const APRIL_2026_TARIFF_PROFILES = {
  residential: {
    pst: 3.237826,
    sktt: 4.857548,
    contracted: 3.237826,
    export: 0,
    distributionFee: 0,
    note: 'Mesken düşük kademe: EMO 230 kWh = 744,7 TL fatura hesabı.'
  },
  commercial: {
    pst: 5.35,
    sktt: 5.93,
    contracted: 5.35,
    export: 0,
    distributionFee: 0,
    note: 'Ticarethane AG tek zamanlı: EPDK 4 Nisan 2026 vergisiz aktif enerji + dağıtım toplamı.'
  },
  industrial: {
    pst: 4.81,
    sktt: 4.81,
    contracted: 4.81,
    export: 0,
    distributionFee: 0,
    note: 'Sanayi AG tek terim tek zamanlı: EPDK 4 Nisan 2026 vergisiz aktif enerji + dağıtım toplamı.'
  },
  agriculture: {
    pst: 4.37,
    sktt: 4.37,
    contracted: 4.37,
    export: 0,
    distributionFee: 0,
    note: 'Tarımsal sulama AG tek zamanlı: EPDK 4 Nisan 2026 vergisiz aktif enerji + dağıtım toplamı.'
  }
};

export const DEFAULT_TARIFFS = {
  residential: APRIL_2026_TARIFF_PROFILES.residential.pst,
  commercial: APRIL_2026_TARIFF_PROFILES.commercial.pst,
  industrial: APRIL_2026_TARIFF_PROFILES.industrial.pst,
  agriculture: APRIL_2026_TARIFF_PROFILES.agriculture.pst
};

export const TARIFF_META = {
  residential: {
    label: 'Konut',
    sourceLabel: APRIL_2026_TARIFF_SOURCE.sourceLabel,
    sourceDate: APRIL_2026_TARIFF_SOURCE.sourceDate,
    skttLimitKwh: 4000
  },
  commercial: {
    label: 'Ticari',
    sourceLabel: APRIL_2026_TARIFF_SOURCE.sourceLabel,
    sourceDate: APRIL_2026_TARIFF_SOURCE.sourceDate,
    skttLimitKwh: 15000
  },
  industrial: {
    label: 'Sanayi',
    sourceLabel: APRIL_2026_TARIFF_SOURCE.sourceLabel,
    sourceDate: APRIL_2026_TARIFF_SOURCE.sourceDate,
    skttLimitKwh: 15000
  },
  agriculture: {
    label: 'Tarımsal Sulama',
    sourceLabel: APRIL_2026_TARIFF_SOURCE.sourceLabel,
    sourceDate: APRIL_2026_TARIFF_SOURCE.sourceDate,
    skttLimitKwh: 150000000
  },
  custom: {
    label: 'Özel',
    sourceLabel: 'Kullanıcı tanımlı tarife',
    sourceDate: '2026-04-12',
    skttLimitKwh: null
  }
};

// ─── Faz B: İnverter Tipleri ────────────────────────────────────────────────
export const INVERTER_TYPES = {
  string: {
    name: 'String İnverter',
    badge: 'Merkezi mimari',
    summary: 'Tüm panel dizilerini tek merkezde DC/AC çeviren klasik çözüm. Çatı yüzeyleri benzerse en ekonomik mimaridir.',
    exampleModel: 'Huawei SUN2000-5KTL-L1',
    structure: '2 MPPT, tek cihaz',
    batteryPath: 'Bazı modellerde hibrit destek mümkündür',
    monitoring: 'String veya MPPT seviyesinde izleme',
    bestFor: 'Tek yönlü, düşük gölgeli çatı',
    efficiency: 0.984,
    maxInputDcV: 600,
    mpptOptimalV: 360,
    pricePerKWp: { lt10: 8200, lt50: 7000, gt50: 5900 },
    shadeTolerance: 0.65,
    lifetime: 15,
    warranty: 10,
    technicalHighlights: ['98.4% max verim', '2 MPPT', '7.5 kWp önerilen PV (5KTL-L1 örneği)'],
    advantages: ['Düşük ekipman maliyeti', 'Servis ve bakım nispeten kolay', 'Standart çatılarda güçlü verim'],
    disadvantages: ['Aynı string içindeki zayıf panel tüm diziyi etkiler', 'Karmaşık çatı geometride esnekliği sınırlı']
  },
  micro: {
    name: 'Mikro İnverter',
    badge: 'Panel bazlı kontrol',
    summary: 'Her panel altında ayrı çevirici bulunur. Farklı yön, kısmi gölge ve panel bazlı izleme gereken çatılarda öne çıkar.',
    exampleModel: 'Enphase IQ8M',
    structure: 'Her panelde ayrı inverter',
    batteryPath: 'Batarya gerekiyorsa genellikle AC-coupled çözüm gerekir',
    monitoring: 'Panel bazında izleme',
    bestFor: 'Karma çatı yönleri ve gölgeli yüzeyler',
    efficiency: 0.975,
    maxInputDcV: 60,
    mpptOptimalV: 40,
    pricePerKWp: { lt10: 12800, lt50: 11800, gt50: 10600 },
    shadeTolerance: 0.90,
    lifetime: 20,
    warranty: 25,
    technicalHighlights: ['330 VA çıkış (IQ8M)', '97.5% CEC weighted efficiency', '30–45 V MPPT aralığı'],
    advantages: ['Panel bazlı optimizasyon', 'Kısmi gölgede daha stabil üretim', 'Detaylı panel takibi'],
    disadvantages: ['İlk yatırım maliyeti yüksektir', 'Çatı üstünde daha fazla elektronik bileşen olur']
  },
  optimizer: {
    name: 'DC Optimizör + String',
    badge: 'Hibrit yaklaşım',
    summary: 'Her panelde optimizör, merkezde inverter. String ekonomisi ile panel bazlı verim ve görünürlüğü bir araya getirir.',
    exampleModel: 'SolarEdge Home Hub + S440',
    structure: 'Panel başına optimizör + merkezi inverter',
    batteryPath: 'Batarya ve akıllı ev cihazlarıyla güçlü entegrasyon',
    monitoring: 'Panel bazında izleme',
    bestFor: 'Gölgeli fakat merkezi servis avantajı istenen çatı',
    efficiency: 0.990,
    maxInputDcV: 480,
    mpptOptimalV: 380,
    pricePerKWp: { lt10: 10200, lt50: 9000, gt50: 7800 },
    shadeTolerance: 0.85,
    lifetime: 15,
    warranty: 12,
    technicalHighlights: ['Home Wave tarafında %99 weighted efficiency', 'S440: 490 Wp / 16.5 A / 60 V', '155–200% DC oversizing'],
    advantages: ['Panel bazlı görünürlük', 'Gölge ve yön farklılıklarında güçlü performans', 'Batarya/akıllı yük entegrasyonu'],
    disadvantages: ['Saf stringden daha maliyetlidir', 'Ek bileşen ve kurulum disiplini gerektirir']
  }
};

// ─── Faz B: Saatlik Üretim Profili ──────────────────────────────────────────
export const HOURLY_SOLAR_PROFILE = {
  summer: [0,0,0,0,0,0.02,0.08,0.18,0.35,0.55,0.75,0.90,0.95,1.00,0.95,0.88,0.72,0.50,0.28,0.10,0.02,0,0,0],
  winter: [0,0,0,0,0,0,0,0.05,0.15,0.32,0.52,0.70,0.78,0.75,0.65,0.45,0.22,0.05,0,0,0,0,0,0],
  spring: [0,0,0,0,0,0.01,0.05,0.14,0.28,0.48,0.68,0.82,0.90,0.92,0.85,0.70,0.50,0.30,0.12,0.03,0,0,0,0],
  autumn: [0,0,0,0,0,0,0.02,0.10,0.22,0.40,0.58,0.72,0.77,0.74,0.63,0.46,0.26,0.08,0.01,0,0,0,0,0]
};

export const RESIDENTIAL_LOAD = [0.02,0.02,0.02,0.02,0.02,0.03,0.05,0.06,0.04,0.03,0.03,0.03,
                                   0.04,0.04,0.04,0.04,0.05,0.07,0.08,0.08,0.07,0.06,0.04,0.03];

export const COMMERCIAL_LOAD = [0.01,0.01,0.01,0.01,0.01,0.02,0.03,0.05,0.07,0.08,0.08,0.08,
                                  0.08,0.08,0.08,0.08,0.07,0.06,0.04,0.03,0.02,0.02,0.01,0.01];

export const INDUSTRIAL_LOAD = [0.035,0.035,0.035,0.035,0.035,0.04,0.045,0.045,0.045,0.045,0.045,0.045,
                                0.045,0.045,0.045,0.045,0.045,0.045,0.04,0.04,0.04,0.04,0.035,0.035];

// ─── Faz C: Yapısal Yük Verileri ────────────────────────────────────────────
export const SNOW_ZONES = {
  'İstanbul': { zone: 2, sk: 0.75 }, 'Ankara': { zone: 3, sk: 1.00 },
  'İzmir': { zone: 1, sk: 0.40 }, 'Antalya': { zone: 1, sk: 0.35 },
  'Bursa': { zone: 2, sk: 0.75 }, 'Adana': { zone: 1, sk: 0.40 },
  'Konya': { zone: 3, sk: 1.00 }, 'Gaziantep': { zone: 2, sk: 0.75 },
  'Şanlıurfa': { zone: 1, sk: 0.40 }, 'Mersin': { zone: 1, sk: 0.40 },
  'Diyarbakır': { zone: 2, sk: 0.75 }, 'Trabzon': { zone: 3, sk: 1.50 },
  'Erzurum': { zone: 5, sk: 2.50 }, 'Malatya': { zone: 3, sk: 1.00 },
  'Kayseri': { zone: 3, sk: 1.00 }, 'Eskişehir': { zone: 2, sk: 0.75 },
  'Samsun': { zone: 3, sk: 1.00 }, 'Van': { zone: 4, sk: 1.75 },
  'Edirne': { zone: 2, sk: 0.75 }, 'Kars': { zone: 5, sk: 2.50 },
  'default': { zone: 2, sk: 0.75 }
};

export const WIND_ZONES = {
  'İstanbul': { zone: 2, vb: 33.5 }, 'Ankara': { zone: 2, vb: 30.0 },
  'İzmir': { zone: 2, vb: 32.0 }, 'Antalya': { zone: 2, vb: 30.0 },
  'Edirne': { zone: 3, vb: 38.0 }, 'Trabzon': { zone: 3, vb: 36.0 },
  'Erzurum': { zone: 2, vb: 28.0 }, 'Şanlıurfa': { zone: 1, vb: 26.0 },
  'default': { zone: 2, vb: 30.0 }
};

// ─── Faz C: Isı Pompası Verileri ────────────────────────────────────────────
export const HEAT_PUMP_DATA = {
  cop_heating: { good: 4.5, avg: 3.8, poor: 3.2 },
  cop_cooling: { good: 5.5, avg: 4.5, poor: 3.5 },
  heat_load: { good: 40, avg: 70, poor: 110 },
  gas_price: 8.50,
  gas_kwh_per_m3: 10.64,
  electric_price: DEFAULT_TARIFFS.residential,
  fuel_oil_price: 35.0,
  fuel_oil_kwh_per_liter: 9.5,
  heating_season_months: 5,
  cooling_season_months: 4,
  spf_heating: { good: 3.8, avg: 3.2, poor: 2.6 },
  spf_cooling: { good: 4.2, avg: 3.5, poor: 2.8 }
};

// ─── EV Araç Modelleri ───────────────────────────────────────────────────────
export const EV_MODELS = {
  togg_t10f:   { name: 'Togg T10F', brand: 'Togg', kwh100: 18.0, batteryKwh: 88.5, chargeKw: 7.4, range: 500 },
  tesla_m3sr:  { name: 'Tesla Model 3 SR', brand: 'Tesla', kwh100: 14.5, batteryKwh: 60.0, chargeKw: 11.0, range: 491 },
  tesla_m3lr:  { name: 'Tesla Model 3 LR', brand: 'Tesla', kwh100: 15.5, batteryKwh: 82.0, chargeKw: 11.0, range: 629 },
  bmw_i4:      { name: 'BMW i4 eDrive40', brand: 'BMW', kwh100: 18.0, batteryKwh: 83.9, chargeKw: 11.0, range: 590 },
  vw_id4:      { name: 'VW ID.4 Pro', brand: 'VW', kwh100: 17.5, batteryKwh: 77.0, chargeKw: 11.0, range: 529 },
  hyundai_i5:  { name: 'Hyundai Ioniq 5 LR', brand: 'Hyundai', kwh100: 17.0, batteryKwh: 77.4, chargeKw: 11.0, range: 507 },
  kia_ev6:     { name: 'Kia EV6 AWD', brand: 'Kia', kwh100: 18.0, batteryKwh: 77.4, chargeKw: 11.0, range: 506 },
  renault_meg: { name: 'Renault Megane E-Tech', brand: 'Renault', kwh100: 16.0, batteryKwh: 60.0, chargeKw: 7.4, range: 450 },
  fiat_500e:   { name: 'Fiat 500e', brand: 'Fiat', kwh100: 14.0, batteryKwh: 42.0, chargeKw: 11.0, range: 320 },
  mg_zs:       { name: 'MG ZS EV', brand: 'MG', kwh100: 17.0, batteryKwh: 72.6, chargeKw: 7.4, range: 440 },
  custom:      { name: 'Özel Araç', brand: 'Özel', kwh100: 18.0, batteryKwh: 60.0, chargeKw: 7.4, range: 400 }
};
