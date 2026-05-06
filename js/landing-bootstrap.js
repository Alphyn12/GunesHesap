// Faz 1 — F1.B.0: Inline <script> bloğunu CSP enforcing için modüle çıkardık.
// İçerik index.html'deki orijinal IIFE ile birebir aynı; modül scope IIFE'yi
// gereksiz kılar ama mevcut yapıyı bozmamak için olduğu gibi taşındı.
// Public API window.X olarak expose edilir (HTML data-action delegation
// F1.B.2 landing/FAQ/tour grubunda register edilecek).

(function(){
  'use strict';
  var APP_ROUTE = '#/app';
  var LANDING_ROUTE = '#/landing';
  var pendingScenario = null;

  function setAppMode(){
    document.body.classList.remove('landing-active');
    document.body.dataset.route = 'app';
  }

  function setLandingMode(){
    document.body.classList.add('landing-active');
    document.body.dataset.route = 'landing';
  }

  function getModeForHash(hash){
    if (!hash || hash === LANDING_ROUTE) return 'landing';
    if (hash === APP_ROUTE) return 'app';
    if (hash.indexOf('#lp-') === 0) return 'landing';
    return 'app';
  }

  function syncModeFromLocation(){
    if (getModeForHash(location.hash) === 'app') setAppMode();
    else setLandingMode();
  }

  function showApp(){
    setAppMode();
    // Scroll app'in başına
    window.scrollTo({top:0, behavior:'auto'});
    // Hash'i senkronla
    if (location.hash !== APP_ROUTE) {
      history.replaceState(null, '', APP_ROUTE);
    }
    // Pending senaryo varsa uygula
    if (pendingScenario) {
      applyPendingScenario();
    }
  }

  function showLanding(){
    setLandingMode();
    window.scrollTo({top:0, behavior:'auto'});
    if (location.hash !== LANDING_ROUTE) {
      history.replaceState(null, '', LANDING_ROUTE);
    }
  }

  function applyPendingScenario(){
    var key = pendingScenario;
    if (!key) return;
    var tryApply = function(){
      if (typeof window.selectScenario === 'function') {
        try { window.selectScenario(key); } catch(e){}
        pendingScenario = null;
        return true;
      }
      return false;
    };
    if (!tryApply()) {
      // Motor henüz yüklenmediyse kısa aralıklarla tekrar dene (max 60 × 100ms = 6 sn).
      var tries = 0;
      var iv = setInterval(function(){
        tries++;
        if (tryApply()) { clearInterval(iv); return; }
        if (tries > 60) {
          clearInterval(iv);
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[landing] selectScenario 6 saniye içinde yüklenmedi; pending senaryo (' + key + ') uygulanamadı.');
          }
          pendingScenario = null;
        }
      }, 100);
    }
  }

  // Public API (HTML onclick'ler için)
  window.startCalculator = function(){
    showApp();
    // Adım 1'e emin olmak için
    if (typeof window.goToStep === 'function') {
      try {
        if (window.state && window.state.step !== 1) window.goToStep(1);
      } catch(e){}
    }
  };

  window.startCalculatorWithScenario = function(scenarioKey){
    pendingScenario = scenarioKey;
    showApp();
  };

  window.goToLanding = function(){
    showLanding();
  };

  window.goToLandingTop = function(){
    var root = document.getElementById('landing-root');
    if (root) root.scrollIntoView({behavior:'auto', block:'start'});
    window.scrollTo({top:0, behavior:'smooth'});
  };

  // SSS accordion toggle — aynı anda tek soru açık kalır
  window.toggleFaq = function(el){
    if (!el) return;
    var isOpen = el.classList.contains('open');
    var siblings = el.parentElement ? el.parentElement.querySelectorAll('.lp-faq-item') : [];
    for (var i = 0; i < siblings.length; i++) siblings[i].classList.remove('open');
    if (!isOpen) el.classList.add('open');
  };

  // Ürün Turu — 7 adım tab navigation
  var lpTourCurrent = 1;
  var lpTourLabels = {
    1: 'Senaryo', 2: 'Konum', 3: 'Kurulum Alanı',
    4: 'Ekipman', 5: 'Ayarlar', 6: 'Hesapla', 7: 'Sonuçlar'
  };
  window.lpTourStep = function(n){
    if (n < 1 || n > 7) return;
    lpTourCurrent = n;
    var tabs = document.querySelectorAll('.lp-tour-tab');
    tabs.forEach(function(t){
      var isActive = parseInt(t.getAttribute('data-step'),10) === n;
      t.classList.toggle('active', isActive);
      if (t.getAttribute('role') === 'tab') t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    var texts = document.querySelectorAll('.lp-tour-text');
    texts.forEach(function(t){
      t.classList.toggle('active', parseInt(t.getAttribute('data-step'),10) === n);
    });
    var panes = document.querySelectorAll('.lp-tour-pane');
    panes.forEach(function(p){
      p.classList.toggle('active', parseInt(p.getAttribute('data-step'),10) === n);
    });
    var url = document.getElementById('lpTourUrl');
    if (url) url.textContent = 'solarrota.app · 0' + n + ' / ' + (lpTourLabels[n] || '');
    var chip = document.getElementById('lpTourChip');
    if (chip) chip.textContent = 'Adım ' + n + ' / 7';
    var cur = document.querySelector('.lp-tour-current');
    if (cur) cur.textContent = '0' + n;
  };
  window.lpTourPrev = function(){ window.lpTourStep(lpTourCurrent === 1 ? 7 : lpTourCurrent - 1); };
  window.lpTourNext = function(){ window.lpTourStep(lpTourCurrent === 7 ? 1 : lpTourCurrent + 1); };

  window.SolarRotaRoutes = {
    app: APP_ROUTE,
    landing: LANDING_ROUTE
  };

  // İlk açılışta hash'e göre mod
  function initialRoute(){
    if (!location.hash) {
      setLandingMode();
      if (!location.hash) {
        history.replaceState(null, '', LANDING_ROUTE);
      }
    } else {
      syncModeFromLocation();
    }
  }

  // Hash değişirse mod değiştir
  window.addEventListener('hashchange', function(){
    syncModeFromLocation();
  });

  initialRoute();
})();
