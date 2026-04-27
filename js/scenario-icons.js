// Senaryo kartları için animasyonlu inline SVG ikonları
// Inline SVG kullanılır çünkü <img> tag'i ile CSS animasyonları Safari/Firefox'ta çalışmaz

export const SCENARIO_ICONS = {
  'on-grid': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" class="scenario-svg-icon">
  <defs>
    <style>
      .og-sun-pulse{animation:ogPulse 2.5s ease-in-out infinite alternate}
      .og-dc-flow{stroke-dasharray:4 6;animation:ogFlowMove 1s linear infinite}
      .og-ac-flow{stroke-dasharray:4 6;animation:ogFlowMove 1s linear infinite}
      .og-led-blink{animation:ogBlink 1.5s step-end infinite}
      .og-glass-shine{animation:ogShine 4s ease-in-out infinite alternate}
      @keyframes ogPulse{0%{transform:scale(0.95);opacity:0.7}100%{transform:scale(1.05);opacity:1;filter:drop-shadow(0 0 8px #F59E0B)}}
      @keyframes ogFlowMove{to{stroke-dashoffset:-10}}
      @keyframes ogBlink{0%,100%{fill:#10B981;filter:drop-shadow(0 0 4px #10B981)}50%{fill:#064E3B;filter:none}}
      @keyframes ogShine{0%{opacity:0.1}100%{opacity:0.3}}
    </style>
    <linearGradient id="ogPanelCells" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617"/><stop offset="50%" stop-color="#0F172A"/><stop offset="100%" stop-color="#1E3A8A"/>
    </linearGradient>
    <linearGradient id="ogSunGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE047"/><stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>
  <g transform="translate(35,35)" class="og-sun-pulse">
    <circle cx="0" cy="0" r="14" fill="url(#ogSunGrad)"/>
    <path d="M0-19L0-24M0 19L0 24M-19 0L-24 0M19 0L24 0M-13.5-13.5L-17-17M13.5 13.5L17 17M-13.5 13.5L-17 17M13.5-13.5L17-17" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/>
  </g>
  <path d="M70 110Q70 150,95 150" fill="none" stroke="#F59E0B" stroke-width="3" stroke-linecap="round" class="og-dc-flow"/>
  <path d="M125 150Q165 150,165 110L165 80" fill="none" stroke="#38BDF8" stroke-width="3" stroke-linecap="round" class="og-ac-flow"/>
  <g transform="translate(165,75)" stroke-linejoin="round" stroke-linecap="round">
    <path d="M-12 35L0-15L12 35" fill="none" stroke="#64748B" stroke-width="2.5"/>
    <path d="M0-15L0 35" fill="none" stroke="#475569" stroke-width="1.5"/>
    <path d="M-18 5L18 5M-12-5L12-5M-22 15L22 15" fill="none" stroke="#64748B" stroke-width="2"/>
    <path d="M-12 35L0 15L12 35M-8 15L0 5L8 15M-4 5L0-5L4 5" fill="none" stroke="#475569" stroke-width="1" opacity="0.6"/>
    <circle cx="-18" cy="5" r="2" fill="#E2E8F0"/><circle cx="18" cy="5" r="2" fill="#E2E8F0"/>
    <circle cx="-22" cy="15" r="2" fill="#E2E8F0"/><circle cx="22" cy="15" r="2" fill="#E2E8F0"/>
  </g>
  <g transform="translate(110,150)">
    <rect x="-14" y="-18" width="28" height="36" rx="4" fill="#0F172A"/>
    <rect x="-16" y="-20" width="32" height="40" rx="4" fill="#1E293B" stroke="#475569" stroke-width="2"/>
    <path d="M-10-12L10-12M-10-7L10-7M-10-2L10-2" stroke="#334155" stroke-width="2" stroke-linecap="round"/>
    <rect x="-8" y="5" width="16" height="10" rx="1.5" fill="#020617"/>
    <circle cx="0" cy="10" r="2" class="og-led-blink"/>
  </g>
  <g transform="translate(70,95) scale(0.9) rotate(-30) skewX(25)">
    <rect x="-38" y="-38" width="76" height="76" rx="4" fill="#64748B" transform="translate(2,2)"/>
    <rect x="-40" y="-40" width="80" height="80" rx="4" fill="#CBD5E1" stroke="#94A3B8" stroke-width="1.5"/>
    <rect x="-36" y="-36" width="72" height="72" rx="2" fill="url(#ogPanelCells)"/>
    <g stroke="#3B82F6" stroke-width="0.75" opacity="0.6">
      <line x1="-12" y1="-36" x2="-12" y2="36"/><line x1="12" y1="-36" x2="12" y2="36"/>
      <line x1="-36" y1="-12" x2="36" y2="-12"/><line x1="-36" y1="12" x2="36" y2="12"/>
    </g>
    <g stroke="#94A3B8" stroke-width="0.3" opacity="0.8">
      <line x1="-24" y1="-36" x2="-24" y2="36"/><line x1="0" y1="-36" x2="0" y2="36"/><line x1="24" y1="-36" x2="24" y2="36"/>
    </g>
    <polygon points="-36,-36 10,-36 -36,10" fill="#ffffff" class="og-glass-shine"/>
  </g>
</svg>`,

  'off-grid': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" class="scenario-svg-icon">
  <defs>
    <style>
      .off-sun-pulse{animation:offPulse 2.5s ease-in-out infinite alternate}
      .off-dc-flow{stroke-dasharray:4 6;animation:offFlowMove 1s linear infinite}
      .off-charge-flow{stroke-dasharray:4 6;animation:offFlowMove 1.2s linear infinite}
      .off-mppt-blink{animation:offBlink 1s step-end infinite}
      .off-glass-shine{animation:offShine 4s ease-in-out infinite alternate}
      .off-led-1{animation:offLedPulse 1.5s infinite 0.0s}
      .off-led-2{animation:offLedPulse 1.5s infinite 0.3s}
      .off-led-3{animation:offLedPulse 1.5s infinite 0.6s}
      @keyframes offPulse{0%{transform:scale(0.95);opacity:0.7}100%{transform:scale(1.05);opacity:1;filter:drop-shadow(0 0 8px #F59E0B)}}
      @keyframes offFlowMove{to{stroke-dashoffset:-10}}
      @keyframes offBlink{0%,100%{fill:#F59E0B;filter:drop-shadow(0 0 4px #F59E0B)}50%{fill:#78350F;filter:none}}
      @keyframes offShine{0%{opacity:0.1}100%{opacity:0.3}}
      @keyframes offLedPulse{0%,100%{fill:#064E3B;filter:none}50%{fill:#10B981;filter:drop-shadow(0 0 4px #10B981)}}
    </style>
    <linearGradient id="offPanelCells" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#020617"/><stop offset="50%" stop-color="#0F172A"/><stop offset="100%" stop-color="#1E3A8A"/>
    </linearGradient>
    <linearGradient id="offSunGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE047"/><stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>
  <g transform="translate(35,35)" class="off-sun-pulse">
    <circle cx="0" cy="0" r="14" fill="url(#offSunGrad)"/>
    <path d="M0-19L0-24M0 19L0 24M-19 0L-24 0M19 0L24 0M-13.5-13.5L-17-17M13.5 13.5L17 17M-13.5 13.5L-17 17M13.5-13.5L17-17" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/>
  </g>
  <path d="M85 100Q120 75,145 75" fill="none" stroke="#F59E0B" stroke-width="3" stroke-linecap="round" class="off-dc-flow"/>
  <path d="M165 100Q165 150,135 150" fill="none" stroke="#10B981" stroke-width="3" stroke-linecap="round" class="off-charge-flow"/>
  <g transform="translate(165,75)">
    <rect x="-14" y="-18" width="28" height="36" rx="3" fill="#0F172A"/>
    <rect x="-16" y="-20" width="32" height="40" rx="3" fill="#1E293B" stroke="#475569" stroke-width="2"/>
    <path d="M-16-10L-20-10M-16-4L-20-4M-16 2L-20 2M-16 8L-20 8" stroke="#334155" stroke-width="2" stroke-linecap="round"/>
    <path d="M16-10L20-10M16-4L20-4M16 2L20 2M16 8L20 8" stroke="#334155" stroke-width="2" stroke-linecap="round"/>
    <rect x="-8" y="-12" width="16" height="10" rx="1.5" fill="#020617"/>
    <circle cx="0" cy="-7" r="2" class="off-mppt-blink"/>
    <circle cx="-6" cy="15" r="2.5" fill="#F59E0B"/>
    <circle cx="6" cy="15" r="2.5" fill="#10B981"/>
  </g>
  <g transform="translate(110,150)">
    <rect x="-22" y="-22" width="44" height="44" rx="4" fill="#0F172A"/>
    <rect x="-24" y="-24" width="48" height="48" rx="4" fill="#1E293B" stroke="#475569" stroke-width="2"/>
    <rect x="-16" y="-28" width="10" height="6" rx="1.5" fill="#EF4444"/>
    <rect x="6" y="-28" width="10" height="6" rx="1.5" fill="#3B82F6"/>
    <rect x="-12" y="-14" width="24" height="28" rx="2" fill="#020617"/>
    <rect x="-6" y="6" width="12" height="4" rx="1" class="off-led-1"/>
    <rect x="-6" y="-1" width="12" height="4" rx="1" class="off-led-2"/>
    <rect x="-6" y="-8" width="12" height="4" rx="1" class="off-led-3"/>
  </g>
  <g transform="translate(70,95) scale(0.9) rotate(-30) skewX(25)">
    <rect x="-38" y="-38" width="76" height="76" rx="4" fill="#64748B" transform="translate(2,2)"/>
    <rect x="-40" y="-40" width="80" height="80" rx="4" fill="#CBD5E1" stroke="#94A3B8" stroke-width="1.5"/>
    <rect x="-36" y="-36" width="72" height="72" rx="2" fill="url(#offPanelCells)"/>
    <g stroke="#3B82F6" stroke-width="0.75" opacity="0.6">
      <line x1="-12" y1="-36" x2="-12" y2="36"/><line x1="12" y1="-36" x2="12" y2="36"/>
      <line x1="-36" y1="-12" x2="36" y2="-12"/><line x1="-36" y1="12" x2="36" y2="12"/>
    </g>
    <g stroke="#94A3B8" stroke-width="0.3" opacity="0.8">
      <line x1="-24" y1="-36" x2="-24" y2="36"/><line x1="0" y1="-36" x2="0" y2="36"/><line x1="24" y1="-36" x2="24" y2="36"/>
    </g>
    <polygon points="-36,-36 10,-36 -36,10" fill="#ffffff" class="off-glass-shine"/>
  </g>
</svg>`,

  'agricultural-irrigation': `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" class="scenario-svg-icon">
    <style>
      .agr-sun{animation:agrSpin 16s linear infinite;transform-origin:20px 16px}
      .agr-drop{animation:agrDrop 2s ease-in infinite}
      .agr-plant{animation:agrSway 3s ease-in-out infinite alternate}
      @keyframes agrSpin{to{transform:rotate(360deg)}}
      @keyframes agrDrop{0%{transform:translateY(0);opacity:1}80%{transform:translateY(12px);opacity:0}100%{transform:translateY(0);opacity:0}}
      @keyframes agrSway{from{transform:rotate(-5deg)}to{transform:rotate(5deg)}}
    </style>
    <circle cx="20" cy="16" r="7" fill="#10B981" opacity="0.9"/>
    <g class="agr-sun" stroke="#10B981" stroke-width="1.8" stroke-linecap="round">
      <line x1="20" y1="4" x2="20" y2="1.5"/>
      <line x1="20" y1="27" x2="20" y2="29.5"/>
      <line x1="8" y1="16" x2="5.5" y2="16"/>
      <line x1="32" y1="16" x2="34.5" y2="16"/>
      <line x1="11.5" y1="7.5" x2="9.7" y2="5.7"/>
      <line x1="28.5" y1="24.5" x2="30.3" y2="26.3"/>
      <line x1="28.5" y1="7.5" x2="30.3" y2="5.7"/>
      <line x1="11.5" y1="24.5" x2="9.7" y2="26.3"/>
    </g>
    <path d="M38 20 C38 28 42 30 46 36 C46 30 50 28 50 20 C48 18 44 17 38 20Z" fill="#10B981" opacity="0.4"/>
    <path d="M46 36 L46 56" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" class="agr-plant"/>
    <path d="M38 30 C38 24 46 26 46 30" fill="none" stroke="#10B981" stroke-width="1.5"/>
    <path d="M46 40 C50 34 58 36 58 40" fill="none" stroke="#10B981" stroke-width="1.5"/>
    <rect x="8" y="58" width="64" height="6" rx="3" fill="#334155"/>
    <ellipse cx="40" cy="58" rx="8" ry="3" fill="#10B981" opacity="0.3"/>
    <g class="agr-drop">
      <circle cx="54" cy="44" r="2.5" fill="#06B6D4" opacity="0.9"/>
    </g>
    <g class="agr-drop anim-delay-6">
      <circle cx="62" cy="40" r="2" fill="#06B6D4" opacity="0.7"/>
    </g>
    <g class="agr-drop anim-delay-12">
      <circle cx="58" cy="36" r="2" fill="#06B6D4" opacity="0.8"/>
    </g>
  </svg>`,

  'heat-pump': `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" class="scenario-svg-icon">
    <style>
      .hp-sun{animation:hpSpin 12s linear infinite;transform-origin:20px 18px}
      .hp-therm{animation:hpTherm 2.5s ease-in-out infinite alternate}
      .hp-wave{animation:hpWave 2s ease-in-out infinite}
      @keyframes hpSpin{to{transform:rotate(360deg)}}
      @keyframes hpTherm{from{fill:rgba(236,72,153,0.4)}to{fill:rgba(236,72,153,1)}}
      @keyframes hpWave{0%,100%{opacity:0.3}50%{opacity:0.9}}
    </style>
    <circle cx="20" cy="18" r="7" fill="#EC4899" opacity="0.9"/>
    <g class="hp-sun" stroke="#EC4899" stroke-width="1.8" stroke-linecap="round">
      <line x1="20" y1="6" x2="20" y2="3.5"/>
      <line x1="20" y1="29" x2="20" y2="31.5"/>
      <line x1="8" y1="18" x2="5.5" y2="18"/>
      <line x1="32" y1="18" x2="34.5" y2="18"/>
      <line x1="11.5" y1="9.5" x2="9.7" y2="7.7"/>
      <line x1="28.5" y1="26.5" x2="30.3" y2="28.3"/>
      <line x1="28.5" y1="9.5" x2="30.3" y2="7.7"/>
      <line x1="11.5" y1="26.5" x2="9.7" y2="28.3"/>
    </g>
    <rect x="36" y="24" width="36" height="28" rx="5" fill="#1E293B" stroke="#EC4899" stroke-width="2"/>
    <rect x="39" y="27" width="30" height="22" rx="4" fill="#0F172A"/>
    <rect x="43" y="31" width="7" height="14" rx="3" fill="rgba(236,72,153,0.15)" stroke="#EC4899" stroke-width="1"/>
    <rect x="43" y="37" width="7" height="5" rx="2" fill="#EC4899" class="hp-therm"/>
    <path d="M55 34 Q58 38 55 42" stroke="#EC4899" stroke-width="1.5" fill="none" stroke-linecap="round" class="hp-wave"/>
    <path d="M59 32 Q63 38 59 44" stroke="#EC4899" stroke-width="1.5" fill="none" stroke-linecap="round" class="hp-wave anim-delay-4"/>
    <line x1="54" y1="52" x2="54" y2="62" stroke="#475569" stroke-width="2"/>
    <rect x="40" y="62" width="28" height="4" rx="2" fill="#334155"/>
  </svg>`,

  'flexible-mobile': `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" class="scenario-svg-icon">
    <style>
      .mob-sun{animation:mobSpin 14s linear infinite;transform-origin:16px 16px}
      .mob-move{animation:mobDrive 4s ease-in-out infinite}
      .mob-glow{animation:mobGlow 2s ease-in-out infinite alternate}
      @keyframes mobSpin{to{transform:rotate(360deg)}}
      @keyframes mobDrive{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
      @keyframes mobGlow{from{opacity:0.4}to{opacity:1}}
    </style>
    <circle cx="16" cy="16" r="6" fill="#06B6D4" opacity="0.9"/>
    <g class="mob-sun" stroke="#06B6D4" stroke-width="1.8" stroke-linecap="round">
      <line x1="16" y1="5" x2="16" y2="3"/>
      <line x1="16" y1="26" x2="16" y2="28"/>
      <line x1="5" y1="16" x2="3" y2="16"/>
      <line x1="27" y1="16" x2="29" y2="16"/>
      <line x1="8.8" y1="8.8" x2="7.4" y2="7.4"/>
      <line x1="23.2" y1="23.2" x2="24.6" y2="24.6"/>
      <line x1="23.2" y1="8.8" x2="24.6" y2="7.4"/>
      <line x1="8.8" y1="23.2" x2="7.4" y2="24.6"/>
    </g>
    <g class="mob-move">
      <rect x="26" y="40" width="40" height="20" rx="4" fill="#1E293B" stroke="#06B6D4" stroke-width="1.5"/>
      <rect x="30" y="35" width="20" height="8" rx="3" fill="#334155" stroke="#06B6D4" stroke-width="1"/>
      <rect x="31" y="36" width="18" height="6" rx="2" fill="#06B6D4" opacity="0.2"/>
      <line x1="34" y1="38" x2="34" y2="40" stroke="#06B6D4" stroke-width="0.8"/>
      <line x1="38" y1="38" x2="38" y2="40" stroke="#06B6D4" stroke-width="0.8"/>
      <line x1="42" y1="38" x2="42" y2="40" stroke="#06B6D4" stroke-width="0.8"/>
      <circle cx="35" cy="62" r="5" fill="#334155" stroke="#06B6D4" stroke-width="1.5"/>
      <circle cx="35" cy="62" r="2" fill="#06B6D4" class="mob-glow"/>
      <circle cx="57" cy="62" r="5" fill="#334155" stroke="#06B6D4" stroke-width="1.5"/>
      <circle cx="57" cy="62" r="2" fill="#06B6D4" class="mob-glow"/>
      <rect x="52" y="44" width="12" height="10" rx="2" fill="rgba(6,182,212,0.15)" stroke="#06B6D4" stroke-width="1"/>
    </g>
  </svg>`,

  'ev-charging': `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" class="scenario-svg-icon">
    <style>
      .ev-sun{animation:evSpin 12s linear infinite;transform-origin:16px 16px}
      .ev-bolt{animation:evBolt 1.2s ease-in-out infinite alternate}
      .ev-charge{animation:evCharge 2s ease-in-out infinite}
      @keyframes evSpin{to{transform:rotate(360deg)}}
      @keyframes evBolt{from{opacity:0.3;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
      @keyframes evCharge{0%,100%{opacity:0.3}50%{opacity:1}}
    </style>
    <circle cx="16" cy="16" r="6" fill="#3B82F6" opacity="0.9"/>
    <g class="ev-sun" stroke="#3B82F6" stroke-width="1.8" stroke-linecap="round">
      <line x1="16" y1="5" x2="16" y2="3"/>
      <line x1="16" y1="26" x2="16" y2="28"/>
      <line x1="5" y1="16" x2="3" y2="16"/>
      <line x1="27" y1="16" x2="29" y2="16"/>
      <line x1="8.8" y1="8.8" x2="7.4" y2="7.4"/>
      <line x1="23.2" y1="23.2" x2="24.6" y2="24.6"/>
      <line x1="23.2" y1="8.8" x2="24.6" y2="7.4"/>
      <line x1="8.8" y1="23.2" x2="7.4" y2="24.6"/>
    </g>
    <rect x="16" y="38" width="52" height="22" rx="5" fill="#1E293B" stroke="#3B82F6" stroke-width="1.5"/>
    <rect x="22" y="32" width="30" height="8" rx="4" fill="#334155" stroke="#3B82F6" stroke-width="1"/>
    <path d="M18 52 H66" stroke="#475569" stroke-width="1"/>
    <circle cx="26" cy="62" r="5" fill="#334155" stroke="#3B82F6" stroke-width="1.5"/>
    <circle cx="26" cy="62" r="2" fill="#3B82F6"/>
    <circle cx="58" cy="62" r="5" fill="#334155" stroke="#3B82F6" stroke-width="1.5"/>
    <circle cx="58" cy="62" r="2" fill="#3B82F6"/>
    <rect x="28" y="34" width="12" height="4" rx="2" fill="#3B82F6" opacity="0.4"/>
    <path d="M45 30 L42 38 H46 L44 46" stroke="#3B82F6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="ev-bolt"/>
    <line x1="28" y1="26" x2="28" y2="32" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" class="ev-charge"/>
    <circle cx="28" cy="25" r="2" fill="#3B82F6" class="ev-charge anim-delay-3"/>
    <line x1="25" y1="22" x2="28" y2="25" stroke="#3B82F6" stroke-width="1.5" stroke-linecap="round" class="ev-charge anim-delay-6"/>
    <line x1="31" y1="22" x2="28" y2="25" stroke="#3B82F6" stroke-width="1.5" stroke-linecap="round" class="ev-charge anim-delay-9"/>
  </svg>`,
};

// Senaryo renklerini de export edelim
export const SCENARIO_COLORS = {
  'on-grid':               '#F59E0B',
  'off-grid':              '#8B5CF6',
  'agricultural-irrigation':'#10B981',
  'heat-pump':             '#EC4899',
  'flexible-mobile':       '#06B6D4',
  'ev-charging':           '#3B82F6',
};
