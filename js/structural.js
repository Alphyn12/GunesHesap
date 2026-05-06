// ═══════════════════════════════════════════════════════════
// STRUCTURAL — Rüzgar & Kar Yükü Kontrolü (Faz C1)
// Solar Rota v2.0 — TS EN 1991-1-3 / TS EN 1991-1-4
// ═══════════════════════════════════════════════════════════
import { SNOW_ZONES, WIND_ZONES } from './data.js';

// NOT: Bu modül ön fizibilite kontrolüdür — `disclaimer` alanı return objesinde de
// belirtildiği gibi, statik proje veya mühendis onayı yerine geçmez. Eurocode
// formülleri sadeleştirilmiş varsayımlarla kullanılır (Arazi Kat. II, z=5 m vb.).
export function calculateStructural(cityName, tiltDeg, systemPowerKWp, totalPanelAreaM2) {
  const snowData = SNOW_ZONES[cityName] || SNOW_ZONES['default'];
  const windData = WIND_ZONES[cityName] || WIND_ZONES['default'];
  const alpha = tiltDeg; // derece

  // ─── Kar Yükü (TS EN 1991-1-3) ───────────────────────────────────────────
  // mu: ön fizibilite şekil katsayısı. 30°-60° arası lineer interpolasyon (0.8 → 0)
  // kullanır; gerçek Eurocode mono-pitch formülü ara açılarda farklılaşabilir.
  let mu;
  if (alpha >= 60) {
    mu = 0;
  } else if (alpha < 30) {
    mu = 0.8;
  } else {
    mu = 0.8 * (60 - alpha) / 30;
  }
  const Ce = 1.0; // Çevre katsayısı (açık arazi)
  const Ct = 1.0; // Termal katsayı
  const snowLoad = mu * Ce * Ct * snowData.sk; // kN/m²

  // ─── Rüzgar Basıncı (TS EN 1991-1-4) ─────────────────────────────────────
  // Saha-spesifik z, z0, co değerleri kullanılmıyor — projenin statik mühendisi
  // gerçek arazi kategorisi ve orografi üzerinden yeniden hesaplamalıdır.
  const vb = windData.vb; // m/s referans hız
  const z = 5; // Panel yüksekliği (m) — tipik çatı
  const z0 = 0.05; // Pürüzlülük uzunluğu (Arazi Kat. II)
  const zmin = 2.0;
  const kr = 0.19 * Math.pow(z0 / 0.05, 0.07);
  const cr = kr * Math.log(Math.max(z, zmin) / z0); // Pürüzlülük faktörü
  const co = 1.0; // Orografi katsayısı
  const vm = cr * co * vb; // Ortalama rüzgar hızı

  const rho = 1.25; // Hava yoğunluğu (kg/m³)
  const Iv = 1 / (co * Math.log(Math.max(z, zmin) / z0));
  const qp = (1 + 7 * Iv) * 0.5 * rho * vm * vm / 1000; // kN/m²

  // Panel üzerindeki net rüzgar kuvveti. Düşük eğimli çatılarda emme/uplift
  // riski sıfırlanmaz; bu yüzden minimum aerodinamik katsayı korunur.
  const Cp = 0.7; // Ön fizibilite net basınç katsayısı
  const tiltFactor = Math.max(0.35, Math.abs(Math.sin((alpha * Math.PI) / 180)));
  const windPressure = qp * Cp * tiltFactor; // kN/m²

  // ─── Montaj sistemi gereksinimi ───────────────────────────────────────────
  const maxLoad = Math.max(snowLoad, windPressure);
  let recommendation;
  let status;
  if (maxLoad <= 0.3) {
    status = 'ok';
    recommendation = 'Ön fizibiliteye göre standart montaj sistemi yeterli olabilir; kesin teklif öncesi taşıyıcı sistem, bağlantı elemanı ve kenar bölge kontrolleri yapılmalıdır.';
  } else if (maxLoad <= 0.6) {
    status = 'warn';
    recommendation = 'Güçlendirilmiş montaj rayları ve ek ankraj noktaları mühendis tarafından kontrol edilmelidir.';
  } else {
    status = 'danger';
    recommendation = 'Yüksek yük bölgesi — profesyonel yapısal hesap zorunlu. Özel montaj sistemi ve statik hesap gerektirir.';
  }

  return {
    snowLoad: parseFloat(snowLoad.toFixed(3)),
    windPressure: parseFloat(windPressure.toFixed(3)),
    snowZone: `Bölge ${snowData.zone}`,
    windZone: `Bölge ${windData.zone}`,
    sk: snowData.sk,
    vb: windData.vb,
    mu: mu.toFixed(2),
    status,
    recommendation,
    maxLoad: parseFloat(maxLoad.toFixed(3))
    , disclaimer: 'Ön fizibilite kontrolüdür; statik proje veya mühendis onayı yerine geçmez.'
  };
}

// calculateStructural ES module export olarak kullanılıyor — window ataması gereksiz.
