/* Inline theme visual assets — no network fetch, no flash. */
(() => {
  'use strict';

  function encodeSvg(svg) {
    return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
  }

  const preview = {
    harbor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 34" aria-hidden="true">
      <rect width="52" height="34" fill="#E8EFF4"/>
      <rect width="52" height="6" fill="#162C3A"/>
      <rect y="6" width="52" height="5" fill="#1E4E5E"/>
      <rect x="8" y="10" width="10" height="1.5" fill="#46DCE3"/>
      <rect x="4" y="14" width="28" height="12" rx="2" fill="rgba(255,255,255,0.9)" stroke="#7D96A8"/>
      <rect x="4" y="14" width="28" height="3" rx="2" fill="#185466"/>
      <path d="M6 20h8M6 23h12" stroke="#4E6578" stroke-width="1"/>
      <rect y="30" width="52" height="4" fill="#162C3A"/>
    </svg>`,
    mineral: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 34" aria-hidden="true">
      <rect width="52" height="34" fill="#EAECE6"/>
      <g fill="rgba(42,64,56,0.18)">${Array.from({ length: 24 }, (_, i) => {
        const x = (i % 6) * 8 + 2;
        const y = Math.floor(i / 6) * 8 + 10;
        return `<circle cx="${x}" cy="${y}" r="0.7"/>`;
      }).join('')}</g>
      <rect width="52" height="6" fill="#2A4038"/>
      <rect y="6" width="52" height="5" fill="#2A4038"/>
      <rect x="8" y="10" width="10" height="1.5" fill="#8F4C24"/>
      <rect x="4" y="14" width="28" height="12" fill="#FBFBF8" stroke="#7E8E85"/>
      <rect x="6" y="16" width="24" height="2" fill="#2F4D44"/>
      <path d="M6 21h10M6 24h14" stroke="#52615B" stroke-width="1"/>
      <rect y="30" width="52" height="4" fill="#1F302B"/>
    </svg>`,
    'sap-signature': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 34" aria-hidden="true">
      <defs>
        <linearGradient id="sapTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#F4F9FE"/><stop offset="1" stop-color="#CFE0F2"/>
        </linearGradient>
        <linearGradient id="sapNav" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2D6EB0"/><stop offset="1" stop-color="#17477A"/>
        </linearGradient>
        <linearGradient id="sapHead" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#E8F2FC"/><stop offset="1" stop-color="#C3D9EE"/>
        </linearGradient>
      </defs>
      <rect width="52" height="34" fill="#EBF2F9"/>
      <rect width="52" height="6" fill="url(#sapTop)"/>
      <rect y="6" width="52" height="5" fill="url(#sapNav)"/>
      <rect x="8" y="10" width="10" height="1.5" fill="#F2B418"/>
      <rect x="4" y="14" width="28" height="12" fill="#fff" stroke="#7290AE"/>
      <rect x="4" y="14" width="28" height="3" fill="url(#sapHead)"/>
      <path d="M8 20h4M14 20h4M20 20h4M8 23h4M14 23h4M20 23h4" stroke="#C9D9E8" stroke-width="2"/>
      <rect y="30" width="52" height="4" fill="#DCE7F3" stroke="#9BB4CE"/>
    </svg>`,
  };

  const favicons = {
    harbor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
      <rect width="40" height="40" rx="9" fill="#1E4E5E"/>
      <path d="m20 8 11 6.5v11L20 32 9 25.5v-11Z" fill="none" stroke="#46DCE3" stroke-width="2" stroke-linejoin="round"/>
      <path d="M20 8v13m11-6.5L20 21 9 14.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>`,
    mineral: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
      <rect x="3" y="3" width="34" height="34" fill="#FBFBF8" stroke="#2A4038" stroke-width="2"/>
      <rect x="6" y="6" width="28" height="28" fill="none" stroke="#2A4038" stroke-width="1"/>
      <path d="M12 28V14l8-4 8 4v14" fill="none" stroke="#2A4038" stroke-width="1.6" stroke-linecap="butt"/>
      <path d="M12 14l8 4 8-4M20 18v10" stroke="#8F4C24" stroke-width="1.2" fill="none"/>
    </svg>`,
    'sap-signature': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
      <defs>
        <linearGradient id="sapFav" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#DFECF8"/><stop offset="1" stop-color="#165796"/>
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="3" fill="url(#sapFav)"/>
      <rect x="1" y="1" width="38" height="38" rx="2" fill="none" stroke="#fff" stroke-width="1" opacity=".7"/>
      <path d="M12 26V15l8-5 8 5v11H12Z" fill="#fff" stroke="#124878" stroke-width="1.2"/>
      <path d="M12 15l8 5 8-5M20 20v11" stroke="#124878" stroke-width="1"/>
      <circle cx="31" cy="10" r="2.2" fill="#F2B418"/>
    </svg>`,
  };

  const brandMarks = {
    harbor: `<svg class="brand-mark overview-mark" viewBox="0 0 36 36" aria-hidden="true">
      <defs><linearGradient id="hMark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1E4E5E"/><stop offset="1" stop-color="#006E7A"/></linearGradient></defs>
      <rect width="36" height="36" rx="6" fill="url(#hMark)"/>
      <text x="18" y="24" text-anchor="middle" fill="#fff" font-family="Georgia, serif" font-size="18" font-weight="700">W</text>
    </svg>`,
    mineral: `<svg class="brand-mark overview-mark" viewBox="0 0 36 36" aria-hidden="true">
      <rect x="1.5" y="1.5" width="33" height="33" fill="#FBFBF8" stroke="#2A4038" stroke-width="1.5"/>
      <rect x="4" y="4" width="28" height="28" fill="none" stroke="#2A4038" stroke-width="1"/>
      <text x="18" y="24" text-anchor="middle" fill="#2A4038" font-family="Segoe UI, Tahoma, sans-serif" font-size="16" font-weight="700">W</text>
    </svg>`,
    'sap-signature': `<svg class="brand-mark overview-mark" viewBox="0 0 36 36" aria-hidden="true">
      <defs><linearGradient id="sMark" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2D7CC0"/><stop offset="1" stop-color="#165796"/></linearGradient></defs>
      <rect width="36" height="36" rx="2" fill="url(#sMark)"/>
      <rect x="32" width="4" height="36" fill="#F2B418"/>
      <text x="16" y="24" text-anchor="middle" fill="#fff" font-family="Segoe UI, Tahoma, sans-serif" font-size="16" font-weight="700">W</text>
    </svg>`,
  };

  const wordmarks = {
    harbor: `<svg class="image-crop brand-logo brand-mark" viewBox="0 0 153 40" role="img" aria-label="MACNICA">
      <text x="0" y="28" fill="currentColor" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="750" letter-spacing="1.5">MACNICA</text>
    </svg>`,
    mineral: `<svg class="image-crop brand-logo brand-mark" viewBox="0 0 153 40" role="img" aria-label="MACNICA">
      <text x="0" y="28" fill="currentColor" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="2">MACNICA</text>
    </svg>`,
    'sap-signature': `<svg class="image-crop brand-logo brand-mark" viewBox="0 0 153 40" role="img" aria-label="MACNICA">
      <text x="0" y="28" fill="currentColor" font-family="Segoe UI, Tahoma, sans-serif" font-size="21" font-weight="700" letter-spacing="1.2">MACNICA</text>
    </svg>`,
  };

  function harborHero() {
    return `<svg class="warehouse-scene login-hero-art" viewBox="0 0 930 285" role="img" aria-label="Modern warehouse line art">
      <defs>
        <linearGradient id="hGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#46DCE3" stop-opacity=".9"/>
          <stop offset="1" stop-color="#46DCE3" stop-opacity=".15"/>
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#hGlow)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
        <path d="M70 220 L160 170 L250 220 L250 270 L70 270 Z"/>
        <path d="M160 170 V220 M70 220 L160 220 L250 220"/>
        <path d="M270 230 L360 175 L450 230 V270 H270 Z"/>
        <path d="M360 175 V230 M270 230 H450"/>
        <path d="M470 225 L580 155 L690 225 V270 H470 Z"/>
        <path d="M580 155 V225 M470 225 H690"/>
        <path d="M710 235 L800 185 L890 235 V270 H710 Z"/>
        <path d="M800 185 V235 M710 235 H890"/>
        <path d="M120 250 H210 M300 250 H410 M520 250 H650 M740 250 H850"/>
        <path d="M200 140 L260 110 L320 140"/>
        <path d="M500 120 L580 80 L660 120"/>
        <path d="M40 275 H900"/>
      </g>
      <g stroke="#7AF0F5" stroke-width="1.2" fill="none" opacity=".75">
        <path d="M180 200 L180 160 M210 200 L210 155 M330 205 L330 168 M390 205 L390 160"/>
        <path d="M540 195 L540 140 M610 195 L610 135 M760 205 L760 165 M830 205 L830 160"/>
      </g>
      <g fill="#46DCE3" opacity=".55">
        <circle cx="180" cy="150" r="2"/><circle cx="580" cy="95" r="2"/><circle cx="800" cy="160" r="2"/>
      </g>
      <path d="M100 100 Q300 40 500 90 T860 70" fill="none" stroke="#46DCE3" stroke-width="1" opacity=".35"/>
    </svg>`;
  }

  function mineralHero() {
    return `<svg class="warehouse-scene login-hero-art" viewBox="0 0 930 285" role="img" aria-label="Architectural warehouse blueprint">
      <defs>
        <pattern id="mGrid" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="rgba(251,251,248,0.18)"/>
        </pattern>
      </defs>
      <rect width="930" height="285" fill="url(#mGrid)"/>
      <g fill="none" stroke="#FBFBF8" stroke-width="1.35" stroke-linecap="butt" stroke-linejoin="miter">
        <path d="M80 240 L170 185 L260 240 V275 H80 Z"/>
        <path d="M170 185 V240 M80 240 H260"/>
        <path d="M290 245 L400 175 L510 245 V275 H290 Z"/>
        <path d="M400 175 V245 M290 245 H510"/>
        <path d="M540 235 L650 160 L760 235 V275 H540 Z"/>
        <path d="M650 160 V235 M540 235 H760"/>
        <path d="M100 255 H240 M320 255 H480 M570 255 H730"/>
        <path d="M140 220 H220 M140 230 H220 M350 215 H470 M350 225 H470 M590 205 H720 M590 215 H720"/>
      </g>
      <g fill="#8F4C24" opacity=".85">
        <rect x="150" y="248" width="18" height="12"/><rect x="175" y="248" width="18" height="12"/>
        <rect x="360" y="248" width="18" height="12"/><rect x="385" y="248" width="18" height="12"/>
        <rect x="600" y="248" width="18" height="12"/><rect x="625" y="248" width="18" height="12"/>
      </g>
      <g stroke="#C9B492" stroke-width="1" fill="none" opacity=".9">
        <path d="M60 60 H200 M60 60 V90"/><path d="M780 50 H880 M880 50 V85"/>
        <path d="M60 70 H120"/><path d="M820 60 H880"/>
      </g>
      <text x="70" y="55" fill="#EAECE6" font-family="Segoe UI, sans-serif" font-size="11" letter-spacing="2">WH-01 · PLAN</text>
    </svg>`;
  }

  function sapHero() {
    return `<svg class="warehouse-scene login-hero-art" viewBox="0 0 930 285" role="img" aria-label="SAP-style warehouse blueprint">
      <defs>
        <linearGradient id="sapWave" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#B8DCFF" stop-opacity=".0"/>
          <stop offset=".45" stop-color="#B8DCFF" stop-opacity=".35"/>
          <stop offset="1" stop-color="#B8DCFF" stop-opacity=".05"/>
        </linearGradient>
      </defs>
      <path d="M-40 40 C180 10 260 120 420 70 S720 20 980 90" fill="none" stroke="url(#sapWave)" stroke-width="28"/>
      <path d="M-20 110 C200 80 300 160 480 110 S760 60 960 130" fill="none" stroke="#B8DCFF" stroke-width="2" opacity=".45"/>
      <path d="M40 200 C220 150 380 230 560 170 S820 120 940 180" fill="none" stroke="#F2B418" stroke-width="1.2" opacity=".7"/>
      <g fill="none" stroke="#B8DCFF" stroke-width="1.4" stroke-linecap="square" stroke-linejoin="miter">
        <path d="M90 245 L150 160 L210 245"/>
        <path d="M110 245 V185 M130 245 V170 M150 245 V160 M170 245 V175 M190 245 V195"/>
        <path d="M250 245 L330 140 L410 245"/>
        <path d="M270 245 V190 M290 245 V165 M310 245 V150 M330 245 V140 M350 245 V155 M370 245 V175 M390 245 V200"/>
        <path d="M450 245 L540 125 L630 245"/>
        <path d="M470 245 V195 M500 245 V160 M530 245 V135 M560 245 V150 M590 245 V180 M610 245 V205"/>
        <path d="M680 230 H820 V255 H680 Z"/><path d="M700 230 V210 H800 V230"/><path d="M720 215 H760"/>
        <rect x="830" y="200" width="48" height="55" rx="2"/>
        <path d="M842 215 H866 M842 225 H866 M842 235 H858"/>
      </g>
      <g fill="#F2B418">
        <circle cx="150" cy="155" r="2"/><circle cx="330" cy="135" r="2"/><circle cx="540" cy="120" r="2"/><circle cx="854" cy="208" r="2"/>
      </g>
      <path d="M60 270 H880" stroke="#B8DCFF" stroke-width="1" opacity=".5"/>
    </svg>`;
  }

  const heroes = {
    harbor: harborHero,
    mineral: mineralHero,
    'sap-signature': sapHero,
  };

  function normalize(themeId) {
    return heroes[themeId] ? themeId : 'harbor';
  }

  window.WMSThemeAssets = {
    loginHeroSvg(themeId) {
      return heroes[normalize(themeId)]();
    },
    brandMarkSvg(themeId) {
      return brandMarks[normalize(themeId)];
    },
    wordmarkSvg(themeId) {
      return wordmarks[normalize(themeId)];
    },
    faviconDataUri(themeId) {
      return encodeSvg(favicons[normalize(themeId)]);
    },
    previewCardSvg(themeId) {
      return preview[normalize(themeId)];
    },
  };
})();
