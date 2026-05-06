# Güvenlik İstisnaları — Solar Rota

Bu belge, kasıtlı olarak SRI (Subresource Integrity) uygulanmayan kaynakları
ve gerekçelerini belgeler.

## SRI Kapsamı

### ✅ SRI Uygulanmış CDN Kaynakları

| Kaynak | Versiyon | Hash |
|---|---|---|
| leaflet CSS | 1.9.4 | `sha384-sHL9...` |
| leaflet-draw CSS | 1.0.4 | `sha384-NZLk...` |
| leaflet JS | 1.9.4 | `sha384-cxOP...` |
| leaflet-draw JS | 1.0.4 | `sha384-JP5U...` |
| chart.js | 4.4.0 | `sha384-e6nU...` |
| jspdf | 2.5.1 | `sha384-Jcns...` |

Hash doğrulaması: `node scripts/verify-sri.mjs`

### ✅ Öz-Barındırılan Kaynaklar (SRI gerekmez)

| Kaynak | Açıklama |
|---|---|
| Inter (400/500/600/700) | `assets/fonts/Inter-*.woff2` — yerel dosya |
| Space Grotesk (400–700+800) | `assets/fonts/SpaceGrotesk-*.woff2` — yerel dosya |

Google Fonts bağımlılığı P3 kapsamında kaldırılmıştır. Fontlar `css/components.css`
içindeki `@font-face` kurallarıyla öz-barındırmalı olarak sunulmaktadır.

### ⚠️ Kasıtlı SRI İstisnaları

| Kaynak | Neden SRI Yok | Risk Değerlendirmesi |
|---|---|---|
| `/_vercel/insights/script.js` | Vercel 1st-party analytics; hash her deployment'ta değişir; `'self'` CSP kapsamındadır | **Düşük** — Vercel altyapısından gelir, aynı origin |

### 🚫 Kaldırılan Dış Bağımlılıklar

| Kaldırılan | Yerine |
|---|---|
| `fonts.googleapis.com` CSS | `css/components.css` `@font-face` blokları |
| `fonts.gstatic.com` woff2 dosyaları | `assets/fonts/*.woff2` yerel dosyalar |

CSP'den de kaldırıldı: `style-src` artık `fonts.googleapis.com` içermiyor,
`font-src` artık `fonts.gstatic.com` içermiyor.

## CDN Versiyonu Güncelleme Prosedürü

CDN bağımlılığı güncellendiğinde:

1. `index.html`'deki URL'yi yeni versiyona güncelle
2. `scripts/verify-sri.mjs`'deki `expected` hash'i güncelle
3. `node scripts/verify-sri.mjs` çalıştır — yeşil çıktı alınana kadar hash'i düzelt
4. CSP'de (`vercel.json`) CDN domain'inin hâlâ geçerli olduğunu doğrula
