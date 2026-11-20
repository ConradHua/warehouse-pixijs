/* Apply the persisted WMS design-school theme before first paint. */
(() => {
  'use strict';

  const themes = [
    {
      id: 'harbor',
      name: 'Harbor Precision',
      subtitle: '港湾精密 · 青蓝激光',
      swatch: '#006E7A',
    },
    {
      id: 'mineral',
      name: 'Mineral Studio',
      subtitle: '矿岩工坊 · 建筑哑光',
      swatch: '#2A4038',
    },
    {
      id: 'sap-signature',
      name: 'SAP Signature',
      subtitle: '经典蓝银 · 鎏金高光',
      swatch: '#165796',
    },
  ];

  const ids = new Set(themes.map(theme => theme.id));

  /* Map retired skins to the nearest design-school theme. */
  const migrations = {
    sage: 'mineral',
    slate: 'sap-signature',
    amber: 'mineral',
    navy: 'sap-signature',
    sap: 'sap-signature',
    'harbor-cr': 'harbor',
    'mineral-cr': 'mineral',
    'sap-signature-cr': 'sap-signature',
    'harbor-precision': 'harbor',
    'mineral-studio': 'mineral',
  };

  function resolve(id) {
    if (ids.has(id)) return id;
    if (migrations[id]) return migrations[id];
    return 'harbor';
  }

  function storedTheme() {
    try {
      return resolve(localStorage.getItem('wmsTheme'));
    } catch (error) {
      return 'harbor';
    }
  }

  function syncFavicon(themeId) {
    const assets = window.WMSThemeAssets;
    if (!assets) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      document.head.appendChild(link);
    }
    link.href = assets.faviconDataUri(themeId);
  }

  function syncDocumentAssets(themeId) {
    syncFavicon(themeId);
    const assets = window.WMSThemeAssets;
    if (!assets) return;

    document.querySelectorAll('[data-theme-asset="login-hero"]').forEach(node => {
      const wrap = document.createElement('div');
      wrap.innerHTML = assets.loginHeroSvg(themeId);
      const next = wrap.firstElementChild;
      if (next) {
        next.setAttribute('data-theme-asset', 'login-hero');
        node.replaceWith(next);
      }
    });

    document.querySelectorAll('[data-theme-asset="wordmark"]').forEach(node => {
      const wrap = document.createElement('div');
      wrap.innerHTML = assets.wordmarkSvg(themeId);
      const next = wrap.firstElementChild;
      if (next) {
        next.setAttribute('data-theme-asset', 'wordmark');
        node.replaceWith(next);
      }
    });

    document.querySelectorAll('#warehouse-root .mark, [data-theme-asset="brand-mark"]').forEach(node => {
      if (node.classList.contains('mark') && node.tagName === 'SPAN') {
        const wrap = document.createElement('div');
        wrap.innerHTML = assets.brandMarkSvg(themeId);
        const svg = wrap.firstElementChild;
        if (svg) {
          svg.setAttribute('data-theme-asset', 'brand-mark');
          svg.classList.add('mark');
          svg.style.width = '36px';
          svg.style.height = '36px';
          node.replaceWith(svg);
        }
        return;
      }
      if (node.getAttribute('data-theme-asset') === 'brand-mark') {
        const wrap = document.createElement('div');
        wrap.innerHTML = assets.brandMarkSvg(themeId);
        const svg = wrap.firstElementChild;
        if (svg) {
          svg.setAttribute('data-theme-asset', 'brand-mark');
          svg.classList.add('mark');
          svg.style.width = '36px';
          svg.style.height = '36px';
          node.replaceWith(svg);
        }
      }
    });
  }

  function apply(id, options = {}) {
    const theme = resolve(id);
    const previous = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('wmsTheme', theme); } catch (error) { /* private browsing */ }
    syncDocumentAssets(theme);
    if (!options.silent && previous !== theme) {
      document.dispatchEvent(new CustomEvent('wms-theme-change', { detail: { themeId: theme, previous } }));
    }
    return theme;
  }

  const initial = apply(storedTheme(), { silent: true });

  window.WMSTheme = {
    themes,
    current() { return document.documentElement.dataset.theme || 'harbor'; },
    apply,
    resolve,
    syncAssets: syncDocumentAssets,
  };

  /* Assets script may load after theme.js; re-sync once available. */
  if (!window.WMSThemeAssets) {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.WMSThemeAssets) syncDocumentAssets(window.WMSTheme.current());
    }, { once: true });
  } else {
    syncDocumentAssets(initial);
  }
})();
