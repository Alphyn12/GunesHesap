// Safer Turkey location validation than a single broad bounding box.
// MVP limitation: this is an intentionally coarse polygon and excludes some
// small islands/border edge cases. A production build should replace it with an
// official administrative boundary dataset or a geocoder-backed point-in-polygon check.
//
// Bilinen sınırlılıklar:
//  - Hatay/Suriye sınırı yakınında (36.0-36.2 lat, 36.0-37.0 lon) bazı geçerli noktalar
//    poligon dışında kalabilir; tersine Kuzey Suriye'deki bazı noktalar yanlışlıkla
//    Türkiye olarak işaretlenebilir.
//  - Doğu Karadeniz adacıkları ve Datça/Marmaris kıyı uzantıları kaba kapsanır.
//  - NEARSHORE_BOXES yalnızca Gokceada/Bozcaada ile Kaş/Kekova kıyılarını ekler;
//    Kastellorizo (Yunan) bölgesi de Kaş kutusuna düşer ama o nokta zaten ana
//    poligon dışıdır, dolayısıyla `inBox || pointInPolygon` ifadesi kabul edebilir.
//    Production'da gerçek idari sınır verisetiyle değiştirilmelidir.

const TURKEY_MAINLAND_POLYGON = [
  [41.55, 25.65], [41.95, 27.20], [42.05, 28.90], [41.60, 31.00],
  [41.85, 33.60], [42.00, 35.40], [41.55, 37.80], [41.25, 40.20],
  [41.65, 41.80], [41.20, 43.20], [39.90, 44.80], [39.15, 44.50],
  [38.45, 43.70], [37.10, 44.45], [36.70, 42.00], [36.55, 40.50],
  [36.00, 38.40], [36.10, 36.20], [35.82, 34.75], [36.10, 33.30],
  [36.00, 31.70], [36.30, 30.00], [36.65, 28.50], [37.65, 27.00],
  [39.10, 26.05], [40.20, 26.00]
];

const TURKEY_NEARSHORE_BOXES = [
  { minLat: 39.75, maxLat: 40.55, minLon: 25.55, maxLon: 26.35 }, // Gokceada/Bozcaada/C. peninsula
  { minLat: 36.00, maxLat: 36.65, minLon: 29.20, maxLon: 30.10 }  // Kaş/Kekova kıyısı (Kastellorizo da kutuda)
];

function pointInPolygon(lat, lon, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lonI] = polygon[i];
    const [latJ, lonJ] = polygon[j];
    const intersects = ((lonI > lon) !== (lonJ > lon))
      && lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}

function inBox(lat, lon, box) {
  return lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon;
}

export function isLocationInTurkey(lat, lon) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return false;
  if (latNum < 35.75 || latNum > 42.15 || lonNum < 25.55 || lonNum > 44.90) return false;
  return pointInPolygon(latNum, lonNum, TURKEY_MAINLAND_POLYGON)
    || TURKEY_NEARSHORE_BOXES.some(box => inBox(latNum, lonNum, box));
}
