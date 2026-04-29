// v44: Refresh step 4 panel selection mode assets.
const CACHE_NAME = 'solarRota-v44';
// Sadece local dosyaları pre-cache et — CDN dosyaları runtime'da cache'lenir
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/new_version_logo.png',
  '/css/components.css',
  '/css/redesign.css',
  '/css/mobile.css',
  '/css/landing.css',
  '/js/app.js',
  '/js/analytics-init.js',
  '/js/bill-analysis.js',
  '/js/backend-config.js',
  '/js/calc-core.js',
  '/js/calc-engine.js',
  '/js/offgrid-dispatch.js',
  '/js/calculation-service.js',
  '/js/comparison.js',
  '/js/consumption-evidence.js',
  '/js/audit-log.js',
  '/js/crm-export.js',
  '/js/dashboard.js',
  '/js/data.js',
  '/js/datasheet-sizing.js',
  '/js/device-catalog.js',
  '/js/eng-report.js',
  '/js/ev-charging.js',
  '/js/evidence-governance.js',
  '/js/evidence-files.js',
  '/js/exchange-rate.js',
  '/js/glare.js',
  '/js/heat-pump.js',
  '/js/heatmap.js',
  '/js/hourly-profile.js',
  '/js/i18n.js',
  '/js/identity.js',
  '/js/landing-bootstrap.js',
  '/js/inverter.js',
  '/js/location-validation.js',
  '/js/osm-shadow.js',
  '/js/output-i18n.js',
  '/js/offgrid-field-import.js',
  '/js/panel-catalog.js',
  '/js/pv-engine-contracts.js',
  '/js/pvlib-bridge.js',
  '/js/proposal-governance.js',
  '/js/roof-geometry.js',
  '/js/satellite-enhance.js',
  '/js/scenarios.js',
  '/js/scenario-workflows.js',
  '/js/scenario-icons.js',
  '/js/security.js',
  '/js/solar-art.js',
  '/js/solar-engine-adapter.js',
  '/js/structural.js',
  '/js/sun-path.js',
  '/js/storage.js',
  '/js/tax.js',
  '/js/turkey-regulation.js',
  '/js/ui-charts.js',
  '/js/ui-render.js',
  '/locales/tr.json',
  '/locales/en.json',
  '/locales/de.json',
  '/fixtures/bom-suppliers.json',
  '/assets/solar-proposal-mark.svg',
  '/icon-192.svg',
  '/icon-512.svg'
];

const API_DOMAINS = [
  're.jrc.ec.europa.eu',
  'api.open-meteo.com',
  'overpass-api.de',
  'cdn.jsdelivr.net',
  'api.exchangerate-api.com',
  'open.er-api.com'
];

// ── Install: tüm static assets'i önbelleğe al ──────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((asset) => cache.add(asset))
      ).then((results) => {
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length) console.warn('[SW] Some assets were not precached:', failures.length);
      });
    }).then(() => {
      // Yeni SW hemen aktif olsun, eski SW bekletmesin
      return self.skipWaiting();
    })
  );
});

// ── Activate: eski cache versiyonlarını temizle ─────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Bu SW tüm client'ları hemen kontrol etsin
      return self.clients.claim();
    })
  );
});

// ── Yardımcı: URL'nin API domain'e ait olup olmadığını kontrol et ───────────
function isApiRequest(url) {
  return API_DOMAINS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}

function apiOfflineResponse() {
  return new Response(
    JSON.stringify({ error: 'offline', message: 'Network unavailable and no cached API response exists.' }),
    { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

// ── Yardımcı: Network First — timeout ile ──────────────────────────────────
function networkFirstWithTimeout(request, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      // Timeout doldu → cache'e düş
      caches.match(request).then((cached) => {
        if (cached) {
          resolve(cached);
        } else {
          resolve(apiOfflineResponse());
        }
      });
    }, timeoutMs);

    fetch(request)
      .then((networkResponse) => {
        if (timedOut) return; // Timer zaten çalıştı, işlem tamam

        clearTimeout(timer);

        // Başarılı network yanıtını cache'e yaz (GET istekleri için)
        if (networkResponse.ok && request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }

        resolve(networkResponse);
      })
      .catch(() => {
        if (timedOut) return;
        clearTimeout(timer);

        // Network hatası → cache'e düş
        caches.match(request).then((cached) => {
          if (cached) {
            resolve(cached);
          } else {
            resolve(apiOfflineResponse());
          }
        });
      });
  });
}

// ── Yardımcı: Cache First ───────────────────────────────────────────────────
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) {
      return cached;
    }

    // Cache'de yok → ağdan al ve cache'e yaz
    return fetch(request)
      .then((networkResponse) => {
        if (networkResponse.ok && request.method === 'GET') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Hem cache hem ağ yok → offline fallback
        return caches.match('/index.html').then((fallback) => {
          return fallback || new Response(
            `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
            <title>Çevrimdışı — Solar Rota</title>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <style>body{background:#0F172A;color:#F1F5F9;font-family:sans-serif;
            display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
            h1{color:#F59E0B;margin-bottom:8px}p{color:#94A3B8}</style></head>
            <body><div><h1>Çevrimdışısınız</h1>
            <p>İnternet bağlantınızı kontrol edip sayfayı yenileyin.</p></div></body></html>`,
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      });
  });
}

// ── Fetch: strateji yönlendirmesi ───────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Sadece http/https isteklerini ele al
  if (!url.protocol.startsWith('http')) return;

  // Chrome extension ve browser-internal isteklerini atla
  if (url.protocol === 'chrome-extension:') return;

  if (event.request.method !== 'GET') {
    if (isApiRequest(url)) event.respondWith(fetch(event.request).catch(() => apiOfflineResponse()));
    return;
  }

  if (isApiRequest(url)) {
    // API istekleri: Network First (20s timeout) → cache fallback
    event.respondWith(networkFirstWithTimeout(event.request, 20000));
  } else {
    // Static assets: Cache First → network fallback
    event.respondWith(cacheFirst(event.request));
  }
});
