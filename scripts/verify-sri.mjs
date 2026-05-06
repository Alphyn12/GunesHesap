/**
 * CDN SRI Hash Doğrulayıcı — Solar Rota
 *
 * index.html'deki integrity="sha384-..." değerlerini CDN'den alınan
 * gerçek içerikle karşılaştırır. Release öncesi manuel çalıştırılır.
 *
 * Kullanım:
 *   node scripts/verify-sri.mjs
 */

import { createHash } from 'node:crypto';

const RESOURCES = [
  {
    name: 'leaflet@1.9.4 CSS',
    url: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
    expected: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H',
  },
  {
    name: 'leaflet-draw@1.0.4 CSS',
    url: 'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.css',
    expected: 'sha384-NZLkVuBRMEeB4VeZz27WwTRvlhec30biQ8Xx7zG7JJnkvEKRg5qi6BNbEXo9ydwv',
  },
  {
    name: 'leaflet@1.9.4 JS',
    url: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
    expected: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH',
  },
  {
    name: 'leaflet-draw@1.0.4 JS',
    url: 'https://cdn.jsdelivr.net/npm/leaflet-draw@1.0.4/dist/leaflet.draw.js',
    expected: 'sha384-JP5UPxIO2Tm2o79Fb0tGYMa44jkWar53aBoCbd8ah0+LcCDoohTIYr+zIXyfGIJN',
  },
  {
    name: 'chart.js@4.4.0',
    url: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    expected: 'sha384-e6nUZLBkQ86NJ6TVVKAeSaK8jWa3NhkYWZFomE39AvDbQWeie9PlQqM3pmYW5d1g',
  },
  {
    name: 'jspdf@2.5.1',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    expected: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk',
  },
];

let allOk = true;

for (const { name, url, expected } of RESOURCES) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const actual = 'sha384-' + createHash('sha384').update(buf).digest('base64');
    if (actual === expected) {
      console.log(`✅  ${name}`);
    } else {
      console.error(`❌  ${name}`);
      console.error(`    Beklenen: ${expected}`);
      console.error(`    Gercek:   ${actual}`);
      allOk = false;
    }
  } catch (err) {
    console.error(`⚠️  ${name}: ${err.message}`);
    allOk = false;
  }
}

console.log('');
if (allOk) {
  console.log('Tum CDN SRI hashleri gecerli.');
} else {
  console.error('Bazi hashler eslesmiyor — index.html guncellenmeli!');
  process.exit(1);
}
