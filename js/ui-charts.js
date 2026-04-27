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

export function renderPRGauge(prValue) {
  const arc    = document.getElementById('pr-arc-fill');
  const needle = document.getElementById('pr-needle');
  const valEl  = document.getElementById('pr-gauge-val');
  const lblEl  = document.getElementById('pr-gauge-label');
  const unavailableShort = window.i18n?.t?.('onGridResult.prUnavailableShort') || 'N/A';
  const unavailableLong = window.i18n?.t?.('onGridResult.prUnavailableLong') || 'N/A (PR is not shown on the PSH fallback path)';
  if (!arc || !needle) return;
  if (!Number.isFinite(Number(prValue))) {
    arc.style.strokeDashoffset = 251.3;
    needle.style.transform = 'rotate(-90deg)';
    if (valEl) valEl.textContent = unavailableShort;
    if (lblEl) lblEl.textContent = unavailableLong;
    return;
  }
  const pct = Math.min(Math.max(prValue / 100, 0), 1);
  arc.style.strokeDashoffset = 251.3 - (251.3 * pct);
  needle.style.transform = `rotate(${-90 + pct * 180}deg)`;
  setTimeout(() => { if (valEl) valEl.textContent = prValue + '%'; }, 400);
  if (lblEl) {
    const rating = prValue >= 80 ? 'Mükemmel' : prValue >= 70 ? 'İyi' : prValue >= 60 ? 'Orta' : 'Düşük';
    const color  = prValue >= 80 ? '#10B981' : prValue >= 70 ? '#F59E0B' : prValue >= 60 ? '#F97316' : '#EF4444';
    lblEl.innerHTML = `<span class="rating-badge">${rating}</span> — sistem kayıpları düşük görünüyor`;
    lblEl.querySelector('.rating-badge')?.style.setProperty('--c', color);
  }
}

// window'a expose et
window.showToast = showToast;
window.animateCounter = animateCounter;
window.launchConfetti = launchConfetti;
window.resetConfetti = resetConfetti;
window.renderPRGauge = renderPRGauge;
