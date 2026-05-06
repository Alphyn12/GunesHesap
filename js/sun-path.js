// ═══════════════════════════════════════════════════════════
// SUN PATH — Güneş Yolu Diyagramı (Faz C4)
// Solar Rota v2.0 — Solar Position Algorithm (SPA)
// ═══════════════════════════════════════════════════════════

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date - start) / 86400000) + 1;
}

export function solarPosition(lat, lon, dateTime) {
  const dayOfYear = getDayOfYear(dateTime);
  const declination = 23.45 * Math.sin(toRad(360 / 365 * (dayOfYear - 81)));
  // Türkiye sabit UTC+3 (DST yok); yaz saati uygulanan ülkeler için parametrelendirme gerekir.
  const solarNoon = 12 - (lon - 30) / 15;
  const hourAngle = 15 * (dateTime.getHours() + dateTime.getMinutes() / 60 - solarNoon);

  const elevation = Math.asin(
    Math.sin(toRad(lat)) * Math.sin(toRad(declination)) +
    Math.cos(toRad(lat)) * Math.cos(toRad(declination)) * Math.cos(toRad(hourAngle))
  );

  const azimuthRad = Math.atan2(
    -Math.sin(toRad(hourAngle)),
    Math.tan(toRad(declination)) * Math.cos(toRad(lat)) - Math.sin(toRad(lat)) * Math.cos(toRad(hourAngle))
  );

  return {
    elevation: toDeg(elevation),
    azimuth: toDeg(azimuthRad) + 180
  };
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function svgText(x, y, txt, attrs = {}) {
  const el = svgEl('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', ...attrs });
  el.textContent = txt;
  return el;
}

export function renderSunPath() {
  const state = window.state;
  const card = document.getElementById('sun-path-card');
  if (!card) return;

  const lat = state.lat;
  const lon = state.lon;
  if (!lat || !lon) return;

  card.style.display = 'block';

  const svg = document.getElementById('sun-path-svg');
  if (!svg) return;

  const W = 440, H = 440;
  const cx = W / 2, cy = H / 2;
  const R = 170;

  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // ─── Arka plan ────────────────────────────────────────────────────────────
  svg.appendChild(svgEl('circle', { cx, cy, r: R + 5, fill: 'rgba(15,23,42,0.8)', stroke: 'rgba(71,85,105,0.4)', 'stroke-width': '1' }));

  // ─── Elevasyonel daireler + etiketler ────────────────────────────────────
  [0, 15, 30, 45, 60, 75].forEach(elev => {
    const r = R * (1 - elev / 90);
    svg.appendChild(svgEl('circle', { cx, cy, r, fill: 'none', stroke: 'rgba(71,85,105,0.25)', 'stroke-width': '0.5' }));
    if (elev > 0) {
      svg.appendChild(svgText(cx + 4, cy - r + 8, elev + '°', { fill: 'rgba(148,163,184,0.5)', 'font-size': '8', 'text-anchor': 'start' }));
    }
  });

  // ─── Yön çizgileri (çapraz) ───────────────────────────────────────────────
  [0, 45, 90, 135].forEach(azDeg => {
    const rad = toRad(azDeg - 90);
    svg.appendChild(svgEl('line', {
      x1: cx + R * Math.cos(rad), y1: cy + R * Math.sin(rad),
      x2: cx - R * Math.cos(rad), y2: cy - R * Math.sin(rad),
      stroke: 'rgba(71,85,105,0.18)', 'stroke-width': '0.5'
    }));
  });

  // ─── Yön etiketleri + derece ──────────────────────────────────────────────
  const dirs = [
    ['K', 0, '0°'], ['KD', 45, '45°'], ['D', 90, '90°'], ['GD', 135, '135°'],
    ['G', 180, '180°'], ['GB', 225, '225°'], ['B', 270, '270°'], ['KB', 315, '315°']
  ];
  dirs.forEach(([label, azDeg, deg]) => {
    const rad = toRad(azDeg - 90);
    const px = cx + (R + 16) * Math.cos(rad);
    const py = cy + (R + 16) * Math.sin(rad);
    const isG = label === 'G';
    svg.appendChild(svgText(px, py, label, {
      fill: isG ? '#F59E0B' : 'rgba(148,163,184,0.85)',
      'font-size': label.length > 1 ? '8.5' : '11',
      'font-weight': '600'
    }));
    // Degree number outside the label
    const px2 = cx + (R + 28) * Math.cos(rad);
    const py2 = cy + (R + 28) * Math.sin(rad);
    svg.appendChild(svgText(px2, py2, deg, {
      fill: 'rgba(100,116,139,0.55)', 'font-size': '7'
    }));
  });

  // ─── 12 ay için güneş yolu çizgileri ─────────────────────────────────────
  const monthColors = [
    '#3B82F6','#6366F1','#8B5CF6','#A855F7','#EC4899','#EF4444',
    '#F97316','#F59E0B','#EAB308','#22C55E','#14B8A6','#06B6D4'
  ];
  const monthNames = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  const year = new Date().getFullYear();

  for (let month = 0; month < 12; month++) {
    let d = '';
    let first = true;
    let lastPx = 0, lastPy = 0;
    const isJune = month === 5;   // Yaz solstisi
    const isDec  = month === 11;  // Kış solstisi
    const isKeyMonth = isJune || isDec;

    for (let hour = 4; hour <= 21; hour += 0.5) {
      const h = Math.floor(hour);
      const m = (hour % 1) * 60;
      const dt = new Date(year, month, 21, h, m);
      const pos = solarPosition(lat, lon, dt);
      if (pos.elevation < 0) continue;

      const r = R * (1 - pos.elevation / 90);
      const azRad = toRad(pos.azimuth - 90);
      const px = cx + r * Math.cos(azRad);
      const py = cy + r * Math.sin(azRad);

      if (first) { d += `M${px.toFixed(1)},${py.toFixed(1)}`; first = false; }
      else d += ` L${px.toFixed(1)},${py.toFixed(1)}`;
      lastPx = px; lastPy = py;
    }

    if (d) {
      svg.appendChild(svgEl('path', {
        d,
        fill: 'none',
        stroke: monthColors[month],
        'stroke-width': isKeyMonth ? '2.2' : '1',
        opacity: isKeyMonth ? '0.95' : '0.45'
      }));

      // Ay etiketi sadece Haziran ve Aralık için path sonunda
      if (isKeyMonth) {
        const lx = lastPx + (lastPx > cx ? 4 : -4);
        const ly = lastPy - 5;
        svg.appendChild(svgText(lx, ly, monthNames[month], {
          fill: monthColors[month],
          'font-size': '9',
          'font-weight': '700',
          'text-anchor': lastPx > cx ? 'start' : 'end'
        }));
      }
    }
  }

  // ─── Yaz solstisi saat etiketleri (her 2 saatte bir) ─────────────────────
  for (let hour = 6; hour <= 20; hour += 2) {
    const dt = new Date(year, 5, 21, hour, 0);
    const pos = solarPosition(lat, lon, dt);
    if (pos.elevation <= 0) continue;

    const r = R * (1 - pos.elevation / 90);
    const azRad = toRad(pos.azimuth - 90);
    const px = cx + r * Math.cos(azRad);
    const py = cy + r * Math.sin(azRad);

    svg.appendChild(svgEl('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: '3', fill: '#EF4444', opacity: '0.9' }));
    svg.appendChild(svgText(px + 4, py - 6, hour + ':00', {
      fill: 'rgba(239,68,68,0.85)', 'font-size': '8', 'text-anchor': 'start'
    }));
  }

  // ─── Bugünkü güneş pozisyonu ───────────────────────────────────────────────
  const now = new Date();
  const curPos = solarPosition(lat, lon, now);
  if (curPos.elevation > 0) {
    const r = R * (1 - curPos.elevation / 90);
    const azRad = toRad(curPos.azimuth - 90);
    const px = cx + r * Math.cos(azRad);
    const py = cy + r * Math.sin(azRad);

    svg.appendChild(svgEl('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: '7', fill: '#F59E0B', stroke: '#FCD34D', 'stroke-width': '2' }));
    // Şu an etiketi
    svg.appendChild(svgText(px, py + 16, `${curPos.elevation.toFixed(0)}° / ${curPos.azimuth.toFixed(0)}°`, {
      fill: '#FCD34D', 'font-size': '8', 'font-weight': '600'
    }));
  }

  // ─── Panel yön oku (kalın, okbaşı ile) ───────────────────────────────────
  const roofAz = state.azimuth || 180;
  const roofRad = toRad(roofAz - 90);
  const arrowLen = R * 0.60;
  const rx = cx + arrowLen * Math.cos(roofRad);
  const ry = cy + arrowLen * Math.sin(roofRad);

  let defs = svg.querySelector('defs');
  if (!defs) { defs = svgEl('defs', {}); svg.appendChild(defs); }
  const marker = svgEl('marker', { id: 'arrowhead', markerWidth: '8', markerHeight: '6', refX: '8', refY: '3', orient: 'auto' });
  const poly = svgEl('polygon', { points: '0 0, 8 3, 0 6', fill: '#F59E0B' });
  marker.appendChild(poly);
  defs.appendChild(marker);

  svg.appendChild(svgEl('line', {
    x1: cx, y1: cy, x2: rx.toFixed(1), y2: ry.toFixed(1),
    stroke: '#F59E0B', 'stroke-width': '3',
    'marker-end': 'url(#arrowhead)'
  }));

  // "Panel Yönü" etiketi
  const lx = cx + (arrowLen + 18) * Math.cos(roofRad);
  const ly = cy + (arrowLen + 18) * Math.sin(roofRad);
  svg.appendChild(svgText(lx.toFixed(1), ly.toFixed(1), `Panel ${roofAz}°`, {
    fill: '#F59E0B', 'font-size': '9', 'font-weight': '700',
    'text-anchor': lx > cx ? 'start' : 'end'
  }));

  // ─── Renk legendı (sağ alt köşe) ─────────────────────────────────────────
  const legendX = W - 60, legendY = H - 100;
  const gradId = 'monthGrad';
  const gradEl = svgEl('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' });
  monthColors.forEach((c, i) => {
    const stop = svgEl('stop', { offset: `${(i / 11 * 100).toFixed(0)}%`, 'stop-color': c });
    gradEl.appendChild(stop);
  });
  defs.appendChild(gradEl);

  svg.appendChild(svgEl('rect', { x: legendX, y: legendY, width: '10', height: '88', fill: `url(#${gradId})`, rx: '3' }));
  svg.appendChild(svgText(legendX + 5, legendY - 7, 'Ara', { fill: '#3B82F6', 'font-size': '7.5' }));
  svg.appendChild(svgText(legendX + 5, legendY + 95, 'Oca', { fill: '#06B6D4', 'font-size': '7.5' }));
  svg.appendChild(svgText(legendX + 5, legendY + 44, 'Haz', { fill: '#EF4444', 'font-size': '7.5' }));

  // ─── Bilgi metni ─────────────────────────────────────────────────────────
  const infoEl = document.getElementById('sun-path-info');
  if (infoEl) {
    const nowStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const sunStatus = curPos.elevation > 0
      ? `Şu An: Yükseklik ${curPos.elevation.toFixed(1)}° | Azimut ${curPos.azimuth.toFixed(1)}° (${nowStr})`
      : `Güneş şu an ufkun altında (${nowStr})`;
    infoEl.innerHTML = `
      <div class="sun-path-card">
        <strong class="sun-path-city">${state.cityName || 'Seçilen konum'}</strong> —
        <span class="sun-path-status">${sunStatus}</span><br>
        <span class="sun-path-explainer">İçe doğru halkalar 0°→75° yüksekliği gösterir. Dış çemberde azimut yönleri (0°=Kuzey, 90°=Doğu, 180°=Güney, 270°=Batı).
        Kırmızı noktalar yaz solstisinde (21 Haziran) iki saatlik aralıklarla güneş pozisyonlarını gösterir.</span>
      </div>`;
  }
}

// window'a expose et
if (typeof window !== 'undefined') {
  window.renderSunPath = renderSunPath;
  window.solarPosition = solarPosition;
}
