// Harita görünümü netleştirme — canvas unsharp mask.
// Gelecekte: ESRGAN/WebNN adaptörü aynı arayüze takılabilir.

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

/**
 * Unsharp mask — doğru formül: sharpened = original + (original - blur) * strength
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} scale - upscale faktörü
 * @param {number} strength - keskinlik katsayısı (0.5–2.0 arası önerilir)
 */
export function enhanceCanvasFallback(sourceCanvas, scale = 1.5, strength = 0.85) {
  const src = sourceCanvas.getContext('2d');
  const srcData = src.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  const out = document.createElement('canvas');
  out.width = Math.round(sourceCanvas.width * scale);
  out.height = Math.round(sourceCanvas.height * scale);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, out.width, out.height);

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const data = img.data;
  const copy = new Uint8ClampedArray(data);
  const w = out.width;
  const h = out.height;

  // 3×3 Gaussian blur kernel weights: center=4, edges=2, corners=1 (normalized /16)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[i + c];
        // 5-tap box blur
        const blurSum =
          copy[i - 4 + c] +
          copy[i + 4 + c] +
          copy[i - w * 4 + c] +
          copy[i + w * 4 + c];
        const blurVal = blurSum / 4;
        // Unsharp mask: original + (original - blur) * strength
        data[i + c] = clamp(center + (center - blurVal) * strength);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    canvas: out,
    sourcePixels: srcData.width * srcData.height,
    enhancedPixels: out.width * out.height,
    method: `unsharp-mask (strength=${strength}, scale=${scale}x)`
  };
}

/**
 * Haritadaki tüm yüklenmiş tile'ları birleştirerek bir canvas oluşturur.
 * CORS kısıtlamaları nedeniyle sadece güvenli şekilde erişilebilen tile'lar kullanılır.
 */
async function captureMapCanvas(map) {
  const container = map?.getContainer?.();
  if (!container) throw new Error('Harita container bulunamadı.');

  // Leaflet tile container boyutunu al
  const mapEl = container;
  const mapW = mapEl.offsetWidth || 512;
  const mapH = mapEl.offsetHeight || 512;

  const canvas = document.createElement('canvas');
  canvas.width = Math.min(mapW, 800);
  canvas.height = Math.min(mapH, 800);
  const ctx = canvas.getContext('2d');

  // Arka planı koyu renkle doldur (tile olmayan kısımlar için)
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Tüm yüklenmiş tile'ları bul
  const tiles = Array.from(container.querySelectorAll('.leaflet-tile-loaded'));
  let drawnCount = 0;

  for (const tile of tiles) {
    try {
      const rect = tile.getBoundingClientRect();
      const containerRect = mapEl.getBoundingClientRect();
      const dx = rect.left - containerRect.left;
      const dy = rect.top - containerRect.top;
      const dw = rect.width;
      const dh = rect.height;
      ctx.drawImage(tile, dx, dy, dw, dh);
      drawnCount++;
    } catch {
      // CORS kısıtlaması — bu tile'ı atla
    }
  }

  if (drawnCount === 0) {
    throw new Error(`Hiç tile çizilemedi (${tiles.length} tile bulundu, CORS kısıtlaması olabilir). Uydu katmanı yerine OpenStreetMap katmanını deneyin.`);
  }

  return canvas;
}

function renderPreview(source, enhanced, meta) {
  const before = document.getElementById('sat-enhance-before');
  const after = document.getElementById('sat-enhance-after');
  const status = document.getElementById('sat-enhance-status');
  if (before) {
    source.style.cssText = 'max-width:100%;border-radius:6px;display:block';
    before.replaceChildren(source);
  }
  if (after) {
    enhanced.style.cssText = 'max-width:100%;border-radius:6px;display:block';
    after.replaceChildren(enhanced);
  }
  if (status) {
    status.textContent = `Yöntem: ${meta.method} · ${(meta.sourcePixels / 1000).toFixed(0)}K px → ${(meta.enhancedPixels / 1000).toFixed(0)}K px`;
  }
}

export async function enhanceSatelliteView() {
  const status = document.getElementById('sat-enhance-status');
  const preview = document.getElementById('sat-enhance-preview');
  if (window._activeTileLayer === 'satellite') {
    if (status) status.innerHTML = `<span class="text-primary">
      ⚠ Uydu (Esri) katmanında netleştirme desteklenmez — CORS kısıtlaması.
      Lütfen "Koyu" veya "OpenStreetMap" katmanına geçin.
    </span>`;
    window.showToast?.('Netleştirme yalnızca OSM veya Koyu harita katmanında çalışır.', 'warning');
    return null;
  }
  if (status) status.innerHTML = `<span class="text-accent">Harita görünümü işleniyor...</span>`;
  try {
    const source = await captureMapCanvas(window.map);
    const result = enhanceCanvasFallback(source, 1.5, 0.85);
    window.state.satelliteEnhancement = {
      enabled: true,
      method: result.method,
      updatedAt: new Date().toISOString()
    };
    if (preview) preview.style.display = 'grid';
    renderPreview(source, result.canvas, result);
    return result;
  } catch (err) {
    if (status) status.innerHTML = `<span class="text-danger">İşlem yapılamadı: ${err.message}</span>`;
    window.showToast?.(`Netleştirme başarısız: ${err.message}`, 'error');
    return null;
  }
}

export function toggleSatelliteEnhancement(enabled) {
  window.state.satelliteEnhancementEnabled = !!enabled;
  const wrap = document.getElementById('sat-enhance-preview');
  if (wrap) wrap.style.display = enabled ? 'grid' : 'none';
  if (enabled) enhanceSatelliteView();
}

if (typeof window !== 'undefined') {
  window.enhanceSatelliteView = enhanceSatelliteView;
  window.toggleSatelliteEnhancement = toggleSatelliteEnhancement;
}
