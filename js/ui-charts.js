// ═══════════════════════════════════════════════════════════
// UI CHARTS — Gauge, Confetti, Toast, AnimateCounter
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════

export function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  const assertive = type === 'error' || type === 'warning';
  toast.setAttribute('role', assertive ? 'alert' : 'status');
  toast.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  toast.setAttribute('aria-atomic', 'true');
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export function animateCounter(id, target, formatter) {
  const el = document.getElementById(id);
  if (!el) return;
  const duration = 1500;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatter(target * ease);
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = formatter(target);
  }
  requestAnimationFrame(tick);
}

let confettiLaunched = false;
export function launchConfetti() {
  if (confettiLaunched) return;
  confettiLaunched = true;
  const colors = ['#F59E0B','#10B981','#3B82F6','#EF4444','#F97316','#A855F7'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = `
      left:${Math.random()*100}vw;
      top:-20px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-delay:${Math.random()*1.5}s;
      animation-duration:${2+Math.random()*2}s;
      transform:rotate(${Math.random()*360}deg);
      width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }
}

export function resetConfetti() {
  confettiLaunched = false;
}

let _prGaugeValTimeoutId = null;

// PR gauge SVG yarım daire arc uzunluğu: π × 80 ≈ 251.3 (bkz. index.html
// #pr-arc-fill, path d="M 20 100 A 80 80 0 0 1 180 100" — radius 80, half-circle).
// Path attr'ında `stroke-dasharray="251.3"` olarak da işaretli; SVG'de radius/path
// güncellenirse bu sabit ve markup birlikte değişmelidir.
const PR_ARC_LENGTH = 251.3;

export function renderPRGauge(prValue) {
  const arc    = document.getElementById('pr-arc-fill');
  const needle = document.getElementById('pr-needle');
  const valEl  = document.getElementById('pr-gauge-val');
  const lblEl  = document.getElementById('pr-gauge-label');
  const unavailableShort = window.i18n?.t?.('onGridResult.prUnavailableShort') || 'N/A';
  const unavailableLong = window.i18n?.t?.('onGridResult.prUnavailableLong') || 'N/A (PR is not shown on the PSH fallback path)';
  if (!arc || !needle) return;
  // Önceki render'ın bekleyen text güncellemesini iptal et — hızlı ardışık çağrılarda
  // yeni değerin üstüne eski değer yazılmasını önler.
  if (_prGaugeValTimeoutId !== null) {
    clearTimeout(_prGaugeValTimeoutId);
    _prGaugeValTimeoutId = null;
  }
  const numericPr = (prValue === null || prValue === undefined || prValue === '') ? NaN : Number(prValue);
  if (!Number.isFinite(numericPr)) {
    arc.style.strokeDashoffset = PR_ARC_LENGTH;
    needle.style.transform = 'rotate(-90deg)';
    if (valEl) valEl.textContent = unavailableShort;
    if (lblEl) lblEl.textContent = unavailableLong;
    return;
  }
  const displayPr = Number.isInteger(numericPr) ? String(numericPr) : numericPr.toFixed(1);
  const pct = Math.min(Math.max(numericPr / 100, 0), 1);
  arc.style.strokeDashoffset = PR_ARC_LENGTH - (PR_ARC_LENGTH * pct);
  needle.style.transform = `rotate(${-90 + pct * 180}deg)`;
  _prGaugeValTimeoutId = setTimeout(() => {
    if (valEl) valEl.textContent = displayPr + '%';
    _prGaugeValTimeoutId = null;
  }, 400);
  if (lblEl) {
    const ratingMeta = numericPr >= 80
      ? { rating: 'Mükemmel', color: '#10B981', note: 'sistem kayıpları düşük görünüyor' }
      : numericPr >= 70
        ? { rating: 'İyi', color: '#F59E0B', note: 'sistem kayıpları kabul edilebilir seviyede' }
        : numericPr >= 60
          ? { rating: 'Orta', color: '#F97316', note: 'kayıplar gözden geçirilmeli' }
          : { rating: 'Düşük', color: '#EF4444', note: 'sistem kayıpları yüksek olabilir' };
    lblEl.innerHTML = `<span class="rating-badge">${ratingMeta.rating}</span> - ${ratingMeta.note}`;
    lblEl.querySelector('.rating-badge')?.style.setProperty('--c', ratingMeta.color);
  }
}

// window'a expose et
window.showToast = showToast;
window.animateCounter = animateCounter;
window.launchConfetti = launchConfetti;
window.resetConfetti = resetConfetti;
window.renderPRGauge = renderPRGauge;
