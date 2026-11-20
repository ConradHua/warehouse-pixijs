/* MACNICA WMS demo — open index.html directly, with no installation. */
(() => {
  'use strict';
  const data = window.WMSData;
  const app = document.getElementById('app');
  const state = {
    signedIn: false, environment: 'UAT', route: 'login', dayOffset: 0,
    filters: { ...data.defaults }, columnFilters: {}, sort: null,
    visible: new Set(data.columns.map(c => c.key)), page: 1, pageSize: 500, collapsed: false,
  };
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const number = value => Number(value).toLocaleString('en-US');
  const paths = {
    box: '<path d="m12 3 9 5v10l-9 5-9-5V8zm0 10v10M3 8l9 5 9-5M7.5 5.5l9 5v5"/>',
    cubes: '<path d="m12 2 5 3v6l-5 3-5-3V5zm0 6v6M7 5l5 3 5-3M6 12l5 3v6l-5 3-5-3v-6zm0 6v6M1 15l5 3 5-3m7-6 5 3v6l-5 3-5-3v-6zm0 6v6m-5-9 5 3 5-3"/>',
    truck: '<path d="M2 5h12v13H2zm12 5h4l4 5v3h-8M4 18a2 2 0 1 0 4 0m9 0a2 2 0 1 0 4 0M15 11v4h6"/>',
    shield: '<path d="M12 2c3 2 6 3 9 3v7c0 5-4 9-9 12-5-3-9-7-9-12V5c3 0 6-1 9-3Z"/>',
    putaway: '<path d="M8 2h8v7H8zm-5 9h8v7H3zm10 0h8v7h-8M1 20h22v4H1M12 2v3m-5 6v3m10-3v3"/>',
    cart: '<path d="M2 3h3l3 13h12l3-10H6M9 20a1.5 1.5 0 1 0 0 .1m10-.1a1.5 1.5 0 1 0 0 .1"/>',
    clipboard: '<path d="M9 4H5v19h15V4h-4M9 2h7v5H9zm-1 9h9m-9 4h9m-9 4h6"/>',
    checkClipboard: '<path d="M9 4H4v19h17V4h-5M9 2h7v5H9zm-1 12 3 3 6-7"/>',
    document: '<path d="M5 2h10l5 5v16H5zm10 0v6h5M9 12h7m-7 4h7m-7 4h5"/>',
    wrench: '<path d="M14 3a7 7 0 0 0-7 9L1 19a3 3 0 0 0 4 4l8-8a7 7 0 0 0 9-9l-5 5-4-4 5-5a7 7 0 0 0-4 1Z"/>',
    settings: '<path d="m10 2 4 0 1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1z"/><circle cx="12" cy="12" r="4"/>',
    headset: '<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 12H1v8h5v-8zm18 0h2v8h-5v-8m3 8c0 3-2 4-6 4h-2"/>',
    lock: '<path d="M7 11V7a5 5 0 0 1 10 0v4M4 11h16v12H4z"/><circle cx="12" cy="16" r="1"/><path d="M12 17v3"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="m2 2 20 20M7 6a13 13 0 0 1 5-1c7 0 11 7 11 7a20 20 0 0 1-4 5M4 7a20 20 0 0 0-3 5s4 7 11 7a13 13 0 0 0 5-1"/>',
    warning: '<path d="m12 2 11 20H1zm0 7v6m0 3v1"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>',
    down: '<path d="m6 9 6 6 6-6"/>', up: '<path d="m6 15 6-6 6 6"/>',
    right: '<path d="m9 5 7 7-7 7"/>', left: '<path d="m15 5-7 7 7 7"/>',
    arrow: '<path d="M3 12h18m-7-7 7 7-7 7"/>',
    refresh: '<path d="M21 8a9 9 0 0 0-16-3L2 9m0-7v7h7m-6 7a9 9 0 0 0 16 3l3-4m0 7v-7h-7"/>',
    cycle: '<path d="M21 8a9 9 0 0 0-16-3L2 9m0-7v7h7m-6 7a9 9 0 0 0 16 3l3-4m0 7v-7h-7"/>',
    user: '<circle cx="12" cy="6" r="4"/><path d="M3 23v-3a9 9 0 0 1 18 0v3Z"/>',
    logout: '<path d="M11 3H3v18h8m-3-9h15m-6-6 6 6-6 6"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9 8a3 3 0 1 1 5 3c-2 1-2 2-2 4m0 3h.01"/>',
    check: '<path d="M3 3h18v18H3zm4 9 4 4 7-9"/>',
    calendar: '<path d="M3 5h18v18H3zm0 5h18M7 2v6m10-6v6"/>',
    pin: '<path d="M20 10c0 6-8 13-8 13S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    filter: '<path d="M2 3h20l-8 9v10l-4-2v-8Z"/>',
    funnel: '<path d="M3 5h18M6 9h12m-9 4h6m-4 4h2v4"/>',
    columns: '<path d="M3 3h18v18H3zm6 0v18m6-18v18"/>',
    list: '<path d="M8 5h14M8 12h14M8 19h14M2 5h1m-1 7h1m-1 7h1"/>',
    export: '<path d="M8 8H3v14h18V8h-5M12 16V1m-5 5 5-5 5 5"/>',
    bookmark: '<path d="M5 2h14v21l-7-5-7 5Z"/>',
    home: '<path d="m2 11 10-9 10 9M5 9v13h14V9M9 22v-8h6v8"/>',
    first: '<path d="M6 6v12m12-12-7 6 7 6Z"/>', last: '<path d="M18 6v12M6 6l7 6-7 6Z"/>',
  };
  function icon(name, extra = '') {
    return `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">${paths[name] || paths.document}</svg>`;
  }
  function wordmark() {
    const assets = window.WMSThemeAssets;
    const themeId = window.WMSTheme ? window.WMSTheme.current() : 'harbor';
    if (assets) {
      return assets.wordmarkSvg(themeId).replace('class="image-crop brand-logo brand-mark"', 'class="image-crop brand-logo brand-mark" data-theme-asset="wordmark"');
    }
    return `<svg class="image-crop brand-logo brand-mark" data-theme-asset="wordmark" viewBox="0 0 153 40" role="img" aria-label="MACNICA"><text x="0" y="28" fill="currentColor" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="750">MACNICA</text></svg>`;
  }
  function loginHero() {
    const assets = window.WMSThemeAssets;
    const themeId = window.WMSTheme ? window.WMSTheme.current() : 'harbor';
    if (assets) {
      return assets.loginHeroSvg(themeId).replace('class="warehouse-scene login-hero-art"', 'class="warehouse-scene login-hero-art" data-theme-asset="login-hero"');
    }
    return '<div class="warehouse-scene login-hero-art" data-theme-asset="login-hero" role="img" aria-label="Warehouse illustration"></div>';
  }
  const badge = () => `<span class="environment-badge">${icon('warning')}<span>${state.environment} ENVIRONMENT</span></span>`;
  function themeControl() {
    const api = window.WMSTheme;
    const assets = window.WMSThemeAssets;
    const themes = api ? api.themes : [{ id: 'harbor', name: 'Harbor Precision', subtitle: '港湾精密 · 青蓝激光', swatch: '#006E7A' }];
    const current = api ? api.current() : 'harbor';
    const active = themes.find(theme => theme.id === current) || themes[0];
    const options = themes.map(theme => {
      const preview = assets ? assets.previewCardSvg(theme.id) : `<span class="theme-swatch" style="background:${theme.swatch}"></span>`;
      return `<button type="button" role="option" class="theme-option" data-theme="${theme.id}" aria-checked="${theme.id === current}" id="theme-option-${theme.id}">
        <span class="theme-preview" aria-hidden="true">${preview}</span>
        <span class="theme-meta"><strong>${h(theme.name)}</strong><span>${h(theme.subtitle || '')}</span></span>
        ${icon('check', 'theme-check')}
      </button>`;
    }).join('');
    return `<div class="dropdown theme-dropdown"><button type="button" class="theme-button" data-menu="theme" aria-haspopup="listbox" aria-expanded="false" aria-controls="menu-theme" aria-label="Color theme, ${h(active.name)}"><span class="theme-swatch" style="background:${active.swatch}" aria-hidden="true"></span><span class="theme-label">Theme</span>${icon('down')}</button><div class="dropdown-panel theme-panel" id="menu-theme" role="listbox" aria-label="Design theme" hidden>${options}</div></div>`;
  }
  function header(login) {
    return `<header class="topbar ${login ? 'login-topbar' : ''}">
      <div class="brand">${wordmark()}<span class="brand-divider"></span><strong>WMS</strong><span class="brand-divider"></span><span class="desk-name">OPERATIONS DESK</span>${login ? '' : '<span class="brand-divider warehouse-divider"></span><span class="warehouse-code">WH-01</span>'}</div>
      <div class="header-right">${themeControl()}${badge()}${login ? '' : `<span class="header-divider"></span><div class="header-date"><span>Tue, Oct 27, 2026</span><strong>10:14 AM</strong></div><span class="header-divider"></span><div class="dropdown account-dropdown"><button class="account-button" data-menu="account" aria-expanded="false"><span class="avatar">CH</span><span>CONRADHUA</span>${icon('down')}</button><div class="dropdown-panel" id="menu-account" hidden><button data-info="User info">${icon('user')}CONRADHUA · Warehouse operator</button><button data-action="logout">${icon('logout')}Sign out</button></div></div>`}</div>
    </header>`;
  }
  const navItems = ['Home', 'Inbound', 'Outbound', 'Inventory', 'Physical Count', 'Miscellaneous', 'Work in Process', 'Documents', 'Human Resources', 'System', 'Settings'];
  const navChildren = {
    Outbound: ['Order picking', 'Packing', 'Shipping'],
    Inventory: ['On-hand enquiry', 'Stock hold', 'FIFO', 'Locator'], 'Physical Count': ['Cycle count', 'Count sheets', 'Variance review'],
    Miscellaneous: ['Label design', 'Document lookup'], 'Work in Process': ['WIP overview'],
    Documents: ['Document lookup'], 'Human Resources': ['User info'], System: ['System status'], Settings: ['Preferences', 'Sign out'],
  };
  function navContent(name) {
    if (name === 'Inbound') return window.WMSInbound.menu.map(([label, page]) => `<a href="#inbound/${page}">${h(label)}</a>`).join('');
    return navChildren[name].map(child => {
      if (child === 'On-hand enquiry') return '<a href="#inventory">On-hand enquiry</a>';
      if (child === 'Sign out') return '<button data-action="logout">Sign out</button>';
      return `<button data-info="${h(child)}">${h(child)}</button>`;
    }).join('');
  }
  function navigation() {
    if (state.route === 'home') {
      const symbols = ['home', 'truck', 'box', 'cubes', 'clipboard', 'wrench', 'cycle', 'document', 'user', 'columns', 'settings'];
      return `<nav class="main-nav hover-nav" aria-label="Main navigation">
        <a href="#home" class="nav-link nav-home active" aria-current="page">${icon('home')}<span>Home</span></a>
        ${navItems.slice(1).map((name, i) => `<div class="dropdown nav-dropdown">
          <button class="nav-link" data-menu="nav-${i + 1}" aria-controls="menu-nav-${i + 1}" aria-expanded="false">${icon(symbols[i + 1])}<span>${h(name)}</span></button>
          <div id="menu-nav-${i + 1}" class="dropdown-panel horizontal-menu${name === 'Inbound' ? ' inbound-menu' : ''}" hidden>${navContent(name)}</div>
        </div>`).join('')}
      </nav>`;
    }
    return `<nav class="main-nav" aria-label="Main navigation">${navItems.map((name, index) => name === 'Home'
      ? '<a href="#home" class="nav-link">Home</a>'
      : `<div class="dropdown nav-dropdown"><button class="nav-link ${name.toLowerCase() === state.route ? 'active' : ''}" data-menu="nav-${index}" aria-controls="menu-nav-${index}" aria-expanded="false">${h(name)}${icon('down')}</button><div id="menu-nav-${index}" class="dropdown-panel" hidden>${navContent(name)}</div></div>`).join('')}</nav>`;
  }
  function footer() {
    if (state.route === 'login') return `<footer class="statusbar login-statusbar"><div class="status-left">${icon('box')}<span class="footer-divider"></span><strong>WMS ACCESS</strong><span class="footer-divider"></span><span class="environment-label">Environment:</span><span class="small-badge">${state.environment}</span></div><span class="authorized">Authorized users only</span></footer>`;
    if (state.route === 'inventory') return `<footer class="statusbar"><div class="status-left">${icon('box')}<span class="footer-divider"></span><strong class="query-status"><span class="status-dot"></span>QUERY COMPLETE</strong><span class="footer-divider"></span><span id="footer-summary">5 records · Total qty <b>2,033</b></span></div><div class="footer-actions"><span class="footer-divider"></span><button class="footer-button" data-action="refresh">${icon('refresh')}Refresh</button><button class="footer-button accent" data-action="export">${icon('document')}Export results</button></div></footer>`;
    if (state.route === 'inbound') return `<footer class="statusbar"><div class="status-left">${icon('truck')}<span class="footer-divider"></span><strong>INBOUND</strong><span class="footer-divider"></span><span>Offline demo</span><span class="small-badge">${state.environment}</span></div><a class="footer-button" href="#inbound/jobs">${icon('list')}Receiving jobs</a></footer>`;
    return `<footer class="statusbar home-statusbar"><div class="status-left">${icon('check')}<span class="footer-divider"></span><strong>WORKSPACE READY</strong><span class="footer-divider"></span><span class="environment-label">Environment:</span><span class="small-badge">${state.environment}</span><span class="footer-divider"></span><span class="support-label">Support: <b>wmsasia.support@macnica.com</b></span></div><div class="footer-actions"><span class="footer-divider"></span><button class="footer-button" data-info="Help">${icon('help')}Help</button><a class="footer-button accent" href="#inventory">${icon('document')}Open on-hand enquiry</a></div></footer>`;
  }
  function loginPage() {
    const steps = [['truck', 'Receiving'], ['shield', 'Quality'], ['putaway', 'Putaway'], ['cart', 'Picking'], ['box', 'Packing'], ['truck', 'Dispatch']];
    return `<main class="login-main"><section class="login-hero" aria-labelledby="hero-title">
      <div class="hero-copy"><div class="eyebrow">WAREHOUSE MANAGEMENT SYSTEM</div><div class="cyan-rule"></div><h1 id="hero-title">Your shift<br><span>starts here.</span></h1><p class="hero-subtitle">One workspace for warehouse operations.</p>
      <div class="warehouse-steps">${steps.map(([symbol, label], i) => `<div class="warehouse-step"><span class="step-number">0${i + 1}</span>${icon(symbol)}<span>${label}</span></div>`).join('')}</div></div>
      ${loginHero()}
      <div class="hero-signature"><span></span>MACNICA · WAREHOUSE OPERATIONS</div>
    </section><section class="login-panel" aria-labelledby="login-title"><div class="login-content">
      <div class="secure-access">${icon('lock')}<span>SECURE ACCESS</span></div><h2 id="login-title">Sign in to WMS</h2><p class="login-subtitle">Use your company account to continue.</p>
      <div class="test-notice">${icon('warning')}<span>UAT / FUAT — Test environment</span></div>
      <form id="login-form"><div class="login-field"><label for="username">User name</label><input id="username" name="username" value="CONRADHUA" placeholder="Enter user name" autocomplete="username" required></div>
      <div class="login-field"><label for="password">Password</label><div class="password-input"><input id="password" name="password" type="password" value="Demo@123" placeholder="Enter password" autocomplete="current-password" required><button type="button" class="icon-button" data-action="password" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div></div>
      <div class="login-field"><label for="environment">Connect to</label><select id="environment" name="environment">${['UAT', 'FUAT'].map(env => `<option ${env === state.environment ? 'selected' : ''}>${env}</option>`).join('')}</select></div>
      <p id="login-error" class="form-error" role="alert" hidden></p><button class="primary-button sign-in" type="submit">Sign in ${icon('arrow')}</button></form>
      <button class="text-link forgot-password" data-info="Forgot password via Oracle EBS">Forgot password via Oracle EBS</button>
      <div class="login-support">${icon('headset')}<div>Need help? Contact WMS support<br><button class="text-link" data-info="Contact support">wmsasia.support@macnica.com</button></div></div>
    </div></section></main>`;
  }
  function calendarLabel() {
    return new Date(Date.UTC(2026, 9, 27 + state.dayOffset)).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function homePage() {
    return `<main class="home-main home-main--warehouse"><div class="home-warehouse" id="home-warehouse-slot"></div></main>`;
  }
  const filterGroups = [
    [['operatingUnit', 'Operating unit', ['MCHK_OU']], ['materialNo', 'Material'], ['batchNo', 'Batch'], ['locator', 'Locator']],
    [['warehouse', 'Warehouse', ['WH-01']], ['zone', 'Zone'], ['receivedFrom', 'Received date from', 'date'], ['receivedTo', 'Received date to', 'date']],
  ];
  function filterField([key, label, type]) {
    const value = state.filters[key] || '';
    return `<div class="query-field"><label for="query-${key}">${label}</label>${Array.isArray(type) ? `<select name="${key}" id="query-${key}">${type.map(option => `<option ${value === option ? 'selected' : ''}>${h(option)}</option>`).join('')}</select>` : `<div class="query-input-wrap ${type === 'date' && !value ? 'date-empty' : ''}"><input id="query-${key}" name="${key}" type="${type === 'date' ? 'date' : 'text'}" value="${h(value)}" placeholder="${type === 'date' ? 'dd/mm/yyyy' : 'Any'}" ${key === 'mpn' ? 'class="mpn-input"' : ''}>${type === 'date' ? '<span class="date-placeholder" aria-hidden="true">dd/mm/yyyy</span>' : ''}${['mpn', 'lotNumber'].includes(key) ? `<button type="button" class="clear-input" data-clear-field="${key}" aria-label="Clear ${label}">×</button>` : ''}</div>`}</div>`;
  }
  function inventoryPage() {
    return `<main class="inventory-main"><div class="inventory-heading"><div><h1>Real-time inventory enquiry</h1><span class="heading-divider"></span><p>Inventory / On-hand enquiry</p></div><div class="heading-actions"><button class="light-button" data-info="Saved views">${icon('bookmark')}Saved views ${icon('down')}</button><span class="heading-divider"></span><button class="light-button" data-action="filters" aria-expanded="${!state.collapsed}">${icon('filter')}<span id="filters-label">Filters ${state.collapsed ? 'collapsed' : 'expanded'}</span>${icon('down')}</button></div></div>
      <section class="query-panel"><button class="panel-title query-title" data-action="filters" aria-expanded="${!state.collapsed}">${icon('search')}<h2>QUERY FILTERS</h2><span class="collapse-label">${state.collapsed ? 'Expand' : 'Collapse'}</span>${icon(state.collapsed ? 'down' : 'up')}</button><form id="query-form" ${state.collapsed ? 'hidden' : ''}><div class="filter-columns">${filterGroups.map((fields, i) => `<div class="filter-column">${fields.map(filterField).join('')}${i === filterGroups.length - 1 ? `<div class="query-actions"><button class="primary-button" type="submit">${icon('search')}Search</button><button class="outline-button" type="button" data-action="clear">Clear</button></div>` : ''}</div>`).join('')}</div><p id="query-error" class="form-error" role="alert" hidden></p></form></section>
      <section class="results-panel" aria-label="Inventory results"><div class="panel-title results-title">${icon('cubes')}<h2>RESULTS</h2><span class="result-title-divider"></span><span id="record-count">5 records</span><div class="result-tools"><div class="dropdown columns-dropdown"><button class="tool-button" data-menu="columns" aria-expanded="false">${icon('columns')}Columns ${icon('down')}</button><div class="dropdown-panel column-options" id="menu-columns" hidden><strong>Visible columns</strong>${data.columns.map(c => `<label><input type="checkbox" data-column-toggle="${c.key}" ${state.visible.has(c.key) ? 'checked' : ''}>${c.label}</label>`).join('')}</div></div><button class="tool-button" data-info="Group by">${icon('list')}Group by ${icon('down')}</button><button class="tool-button" data-action="export">${icon('export')}Export ${icon('down')}</button><span class="result-title-divider"></span><button class="tool-button icon-only" data-action="refresh" aria-label="Refresh results">${icon('refresh')}</button></div></div>
      <button class="grouping-hint" data-info="Group by">Drag a column header here to group by that column</button><div class="table-viewport" tabindex="0" aria-label="Scrollable inventory results"><table class="inventory-table"><caption class="sr-only">On-hand inventory results. Select a column heading to sort.</caption></table></div><div class="pagination-bar" id="pagination"></div></section></main>`;
  }
  function render() {
    const login = state.route === 'login';
    const content = login ? loginPage() : state.route === 'home' ? homePage()
      : state.route === 'inbound' ? inbound.render(location.hash.slice(1)) : inventoryPage();
    app.className = `app-shell ${state.route}-screen`;
    app.innerHTML = header(login) + (login ? '' : navigation()) + content + footer();
    document.title = `${app.querySelector('[data-inbound-title]')?.dataset.inboundTitle ||
      (login ? 'Sign in' : state.route === 'home' ? 'Warehouse operations' : 'Real-time inventory enquiry')} · MACNICA WMS`;
    if (state.route === 'inventory') updateResults(true);
    window.WMSWarehouseEmbed && window.WMSWarehouseEmbed.sync(state.route);
    if (window.WMSTheme) window.WMSTheme.syncAssets(window.WMSTheme.current());
  }
  function refreshThemeChrome(themeId) {
    const theme = window.WMSTheme && window.WMSTheme.themes.find(item => item.id === themeId);
    const button = app.querySelector('.theme-button');
    if (button && theme) {
      const swatch = button.querySelector('.theme-swatch');
      if (swatch) swatch.style.background = theme.swatch;
      button.setAttribute('aria-label', `Color theme, ${theme.name}`);
    }
    app.querySelectorAll('#menu-theme [data-theme]').forEach(option => {
      option.setAttribute('aria-checked', String(option.dataset.theme === themeId));
    });
    if (window.WMSTheme) window.WMSTheme.syncAssets(themeId);
  }
  function applyInventoryDeepLink() {
    const spatial = window.WMSSpatialLink;
    if (!spatial) return;
    const query = spatial.parseInventoryQuery(location.hash);
    if (!query.materialNo && !query.batchNo && !query.locator) return;
    state.filters = { ...data.defaults, materialNo: query.materialNo, batchNo: query.batchNo, locator: query.locator };
    state.page = 1;
  }
  function route() {
    const requested = (location.hash.slice(1) || 'login').split('?')[0];
    const section = requested === 'inbound' || requested.startsWith('inbound/') ? 'inbound' : requested;
    const next = state.signedIn && ['home', 'inventory', 'inbound'].includes(section) ? section : 'login';
    if (next === 'login') {
      // Sign-out clears signedIn before hashchange, so tear the canvas down whenever we leave a signed-in screen.
      if (state.signedIn || state.route !== 'login') {
        window.WMSWarehouseEmbed && window.WMSWarehouseEmbed.destroy();
      }
      if (state.signedIn) inbound.reset();
      state.signedIn = false;
      if (location.hash !== '#login') history.replaceState(null, '', '#login');
    }
    if (next === 'inventory') applyInventoryDeepLink();
    state.route = next;
    closeMenus();
    render();
  }
  function overviewHref(row) {
    const spatial = window.WMSSpatialLink;
    if (!spatial) return '#home';
    return spatial.buildHomeFocus({
      focus: [{ kind: 'locator', id: row.locator }],
      openElevation: spatial.locatorOpensElevation(row.locator),
      returnHash: location.hash,
    });
  }
  function inventoryCell(row, column) {
    if (column.key === 'hold') return `<span class="hold-badge ${row.hold === 'Yes' ? 'on-hold' : ''}">${row.hold}</span>`;
    if (column.key === 'receivedDate') return data.formatDate(row[column.key]);
    if (column.key === 'locator') return `${h(row.locator)} <a class="text-link" href="${h(overviewHref(row))}">Show in Overview</a>`;
    return h(column.key === 'qty' ? number(row[column.key]) : row[column.key]);
  }
  function columns() { return data.columns.filter(c => state.visible.has(c.key)); }
  function tableHeader() {
    const visible = columns();
    return `<colgroup>${visible.map(c => `<col style="width:${c.width}px">`).join('')}</colgroup><thead><tr>${visible.map(c => `<th scope="col" aria-sort="${state.sort?.key === c.key ? state.sort.direction === 1 ? 'ascending' : 'descending' : 'none'}"><button class="sort-button" data-sort="${c.key}">${c.label}<span class="sort-marker">${state.sort?.key === c.key ? state.sort.direction === 1 ? '↑' : '↓' : ''}</span></button></th>`).join('')}</tr><tr class="column-filter-row">${visible.map(c => `<th>${c.key === 'hold' ? `<select data-column-filter="hold" aria-label="Filter Hold">${['All', 'No', 'Yes'].map(v => `<option ${state.columnFilters.hold === v ? 'selected' : ''}>${v}</option>`).join('')}</select>` : `<div class="column-filter-wrap"><input data-column-filter="${c.key}" value="${h(state.columnFilters[c.key] || '')}" aria-label="Filter ${c.label}" ${c.key === 'qty' ? 'inputmode="numeric"' : ''}>${icon('funnel')}</div>`}</th>`).join('')}</tr></thead><tbody></tbody>`;
  }
  function updateResults(rebuild = false) {
    const rows = data.query(state.filters, state.columnFilters, state.sort);
    const total = rows.reduce((sum, row) => sum + row.qty, 0);
    const maxPage = Math.max(1, Math.ceil(rows.length / state.pageSize));
    state.page = Math.max(1, Math.min(state.page, maxPage));
    const start = (state.page - 1) * state.pageSize;
    const table = app.querySelector('.inventory-table');
    if (!table) return;
    if (rebuild || !table.tHead) {
      table.innerHTML = tableHeader();
      table.style.minWidth = `${columns().reduce((sum, c) => sum + c.width, 0)}px`;
    }
    table.tBodies[0].innerHTML = rows.length ? rows.slice(start, start + state.pageSize).map(row => `<tr>${columns().map(c => `<td ${c.key === 'qty' ? 'class="quantity-cell"' : ''}>${inventoryCell(row, c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns().length}" class="no-results">${icon('search')}<strong>No matching inventory found.</strong><span>Try another search or clear your filters.</span></td></tr>`;
    document.getElementById('record-count').textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    document.getElementById('footer-summary').innerHTML = `${rows.length} record${rows.length === 1 ? '' : 's'} · Total qty <b>${number(total)}</b>`;
    document.getElementById('pagination').innerHTML = `<div class="pagination-controls"><button class="page-button" data-page="first" ${state.page === 1 ? 'disabled' : ''} aria-label="First page">${icon('first')}</button><button class="page-button" data-page="previous" ${state.page === 1 ? 'disabled' : ''} aria-label="Previous page">${icon('left')}</button><span class="current-page" aria-label="Current page">${state.page}</span><button class="page-button" data-page="next" ${state.page === maxPage ? 'disabled' : ''} aria-label="Next page">${icon('right')}</button><button class="page-button" data-page="last" ${state.page === maxPage ? 'disabled' : ''} aria-label="Last page">${icon('last')}</button><span class="page-range">${rows.length ? start + 1 : 0}–${Math.min(start + state.pageSize, rows.length)} of ${rows.length}</span><span class="pagination-divider"></span><label for="page-size">Rows per page</label><select id="page-size">${[2, 5, 10, 50, 100, 500].map(v => `<option ${state.pageSize === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div class="total-qty">TOTAL QTY <strong>${number(total)}</strong></div>`;
  }
  function showInfo(title, detail) {
    closeMenus();
    const dialog = document.getElementById('info-dialog');
    document.getElementById('dialog-title').textContent = title;
    document.getElementById('dialog-body').textContent = detail ?? (title === 'Saved views' ? 'Saved views is a preview in this demo. Search, column filters, sorting, column visibility and CSV export are available.' : title === 'Group by' ? 'Grouping is a preview in this demo. Use the column filters and sorting to explore the on-hand records.' : /password/i.test(title) ? 'In the connected WMS, passwords are managed through Oracle EBS.\n\nFor this offline demo, use:\nUser name: CONRADHUA\nPassword: Demo@123' : /support|help/i.test(title) ? 'WMS support: wmsasia.support@macnica.com\n\nTry Inbound → Receiving Job Search or Inventory → On-hand enquiry.' : title === 'User info' ? 'CONRADHUA\nWarehouse operator · SHIFT A\nWarehouse: WH-01\nEnvironment: ' + state.environment : `${title} is outside this offline demo.\n\nExplore Inbound → Receiving Job Search or Inventory → On-hand enquiry.`);
    dialog.showModal();
  }
  let toastTimeout;
  function toast(message) {
    const element = document.getElementById('toast');
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => element.classList.remove('visible'), 3200);
  }
  function closeMenus() {
    app.querySelectorAll('.dropdown-panel').forEach(menu => { menu.hidden = true; });
    app.querySelectorAll('[data-menu]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    app.querySelectorAll('.nav-dropdown.is-open').forEach(menu => menu.classList.remove('is-open'));
  }
  function openHomeMenu(menu) {
    if (menu.classList.contains('is-open')) return;
    closeMenus();
    menu.classList.add('is-open');
    menu.querySelector('.dropdown-panel').hidden = false;
    menu.querySelector('[data-menu]').setAttribute('aria-expanded', 'true');
  }
  function downloadCsv(rows, fields, filename) {
    const url = URL.createObjectURL(new Blob([data.csv(rows, fields)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function exportResults() {
    const rows = data.query(state.filters, state.columnFilters, state.sort);
    downloadCsv(rows, columns(), `WMS-On-Hand-${state.environment}-2026-10-27.csv`);
    toast(`Exported ${rows.length} record${rows.length === 1 ? '' : 's'} to CSV.`);
  }
  function clearQuery() {
    state.filters = { operatingUnit: 'MCHK_OU', warehouse: 'WH-01' };
    state.columnFilters = {};
    state.sort = null;
    state.page = 1;
    app.querySelector('#query-form').reset();
    app.querySelectorAll('#query-form [name]').forEach(input => { input.value = state.filters[input.name] || (input.tagName === 'SELECT' ? 'All' : ''); input.removeAttribute('aria-invalid'); if (input.type === 'date') input.parentElement.classList.add('date-empty'); });
    document.getElementById('query-error').hidden = true;
    updateResults(true);
    toast('Filters cleared. Default operating unit and warehouse retained.');
  }
  app.addEventListener('submit', event => {
    event.preventDefault();
    if (event.target.dataset.inboundForm) return inbound.submit(event);
    if (event.target.id === 'login-form') {
      const form = new FormData(event.target);
      if (String(form.get('username')).trim().toUpperCase() !== 'CONRADHUA' || form.get('password') !== 'Demo@123') {
        const error = document.getElementById('login-error');
        error.textContent = 'Incorrect user name or password. Demo account: CONRADHUA / Demo@123';
        error.hidden = false;
        return;
      }
      state.signedIn = true;
      state.environment = form.get('environment');
      location.hash = 'home';
    } else if (event.target.id === 'query-form') {
      const filters = Object.fromEntries(new FormData(event.target));
      Object.keys(filters).forEach(key => { filters[key] = filters[key].trim(); });
      const error = data.validate(filters);
      const errorElement = document.getElementById('query-error');
      event.target.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
      errorElement.hidden = !error;
      if (error) {
        errorElement.textContent = error.message;
        const input = document.getElementById(`query-${error.field}`);
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      state.filters = filters;
      state.page = 1;
      updateResults();
      toast('Query complete. Results updated.');
    }
  });
  app.addEventListener('click', event => {
    const target = event.target.closest('button, a');
    if (!target) {
      const row = event.target.closest('[data-inbound-row]');
      if (row && !window.getSelection()?.toString()) location.hash = row.dataset.inboundRow;
      return;
    }
    if (target.dataset.inboundAction) return inbound.click(target);
    if (target.dataset.theme && window.WMSTheme) {
      const themeId = window.WMSTheme.apply(target.dataset.theme);
      refreshThemeChrome(themeId);
      closeMenus();
      return;
    }
    if (target.dataset.info) { event.preventDefault(); showInfo(target.dataset.info); }
    else if (target.dataset.menu) {
      const homeMenu = target.closest('.hover-nav .nav-dropdown');
      if (homeMenu) { openHomeMenu(homeMenu); return; }
      const panel = document.getElementById(`menu-${target.dataset.menu}`);
      const willOpen = panel.hidden;
      closeMenus();
      panel.hidden = !willOpen;
      target.setAttribute('aria-expanded', String(willOpen));
      if (willOpen && target.dataset.menu === 'theme') {
        const selected = panel.querySelector('[aria-checked="true"]') || panel.querySelector('[role="option"]');
        selected && selected.focus();
      }
    } else if (target.dataset.clearField) {
      const field = document.getElementById(`query-${target.dataset.clearField}`);
      field.value = ''; field.focus();
    } else if (target.dataset.togglePanel) {
      const panel = document.getElementById(`panel-${target.dataset.togglePanel}`);
      panel.hidden = !panel.hidden;
      target.setAttribute('aria-expanded', String(!panel.hidden));
      target.lastElementChild.innerHTML = paths[panel.hidden ? 'down' : 'up'];
    } else if (target.dataset.sort) {
      const key = target.dataset.sort;
      state.sort = { key, direction: state.sort?.key === key ? -state.sort.direction : 1 };
      state.page = 1;
      updateResults(true);
    } else if (target.dataset.page) {
      const last = Math.max(1, Math.ceil(data.query(state.filters, state.columnFilters, state.sort).length / state.pageSize));
      state.page = ({ first: 1, previous: state.page - 1, next: state.page + 1, last })[target.dataset.page];
      updateResults();
    } else if (target.dataset.action) {
      const action = target.dataset.action;
      if (action === 'logout') {
        event.preventDefault();
        state.signedIn = false;
        inbound.reset();
        state.filters = { ...data.defaults }; state.columnFilters = {}; state.sort = null;
        state.visible = new Set(data.columns.map(c => c.key)); state.page = 1; state.pageSize = 500; state.collapsed = false;
        location.hash = 'login';
      } else if (action === 'password') {
        const field = document.getElementById('password');
        const show = field.type === 'password';
        field.type = show ? 'text' : 'password';
        target.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        target.setAttribute('aria-pressed', String(show));
        target.innerHTML = icon(show ? 'eyeOff' : 'eye');
      } else if (action === 'filters') {
        state.collapsed = !state.collapsed;
        app.querySelector('#query-form').hidden = state.collapsed;
        app.querySelectorAll('[data-action="filters"]').forEach(button => button.setAttribute('aria-expanded', String(!state.collapsed)));
        document.getElementById('filters-label').textContent = `Filters ${state.collapsed ? 'collapsed' : 'expanded'}`;
        const title = app.querySelector('.query-title');
        title.querySelector('.collapse-label').textContent = state.collapsed ? 'Expand' : 'Collapse';
        title.lastElementChild.innerHTML = paths[state.collapsed ? 'down' : 'up'];
      } else if (action === 'clear') clearQuery();
      else if (action === 'refresh') { updateResults(); toast('Inventory refreshed using the current query.'); }
      else if (action === 'export') exportResults();
      else if (['previous-day', 'next-day', 'today'].includes(action)) {
        state.dayOffset = action === 'today' ? 0 : state.dayOffset + (action === 'next-day' ? 1 : -1);
        document.getElementById('calendar-label').textContent = calendarLabel();
        document.getElementById('todo-empty').textContent = state.dayOffset === 0 ? 'No scheduled tasks for today.' : 'No scheduled tasks for this day.';
      }
    }
  });
  app.addEventListener('change', event => {
    const target = event.target;
    if (target.dataset.columnToggle) {
      const key = target.dataset.columnToggle;
      if (!target.checked && state.visible.size === 1) { target.checked = true; toast('Keep at least one column visible.'); return; }
      if (target.checked) state.visible.add(key);
      else { state.visible.delete(key); delete state.columnFilters[key]; if (state.sort?.key === key) state.sort = null; }
      state.page = 1;
      updateResults(true);
    } else if (target.id === 'page-size') { state.pageSize = Number(target.value); state.page = 1; updateResults(); }
    else if (target.dataset.columnFilter && target.tagName === 'SELECT') { state.columnFilters[target.dataset.columnFilter] = target.value; state.page = 1; updateResults(); }
    else if (target.id === 'environment') {
      state.environment = target.value;
      app.querySelector('.environment-badge span').textContent = `${state.environment} ENVIRONMENT`;
      app.querySelector('.small-badge').textContent = state.environment;
    }
  });
  app.addEventListener('input', event => {
    if (event.target.type === 'date') event.target.parentElement.classList.toggle('date-empty', !event.target.value);
    if (event.target.dataset.columnFilter) {
      state.columnFilters[event.target.dataset.columnFilter] = event.target.value;
      state.page = 1;
      updateResults();
    }
    if (event.target.closest('#login-form')) document.getElementById('login-error').hidden = true;
  });
  app.addEventListener('pointerover', event => {
    const menu = event.target.closest('.hover-nav .nav-dropdown');
    if (menu && (!event.relatedTarget || !menu.contains(event.relatedTarget))) openHomeMenu(menu);
  });
  app.addEventListener('pointerout', event => {
    const menu = event.target.closest('.hover-nav .nav-dropdown');
    if (menu && (!event.relatedTarget || !menu.contains(event.relatedTarget))) closeMenus();
  });
  app.addEventListener('focusin', event => {
    const menu = event.target.closest('.hover-nav .nav-dropdown');
    if (menu) openHomeMenu(menu);
  });
  app.addEventListener('focusout', event => {
    const menu = event.target.closest('.hover-nav .nav-dropdown');
    if (menu && (!event.relatedTarget || !menu.contains(event.relatedTarget))) closeMenus();
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.dropdown')) closeMenus();
    if (event.target.closest('[data-close-dialog]')) document.getElementById('info-dialog').close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenus();
    const option = event.target.closest('#menu-theme [role="option"]');
    if (!option) return;
    const options = [...document.querySelectorAll('#menu-theme [role="option"]')];
    const index = options.indexOf(option);
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      options[(index + 1) % options.length].focus();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      options[(index - 1 + options.length) % options.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      options[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      options[options.length - 1].focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      option.click();
    }
  });
  document.addEventListener('wms-theme-change', event => {
    refreshThemeChrome(event.detail.themeId);
  });
  document.getElementById('info-dialog').addEventListener('click', event => { if (event.target.id === 'info-dialog') { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
  const inbound = window.WMSInbound.create({ app, h, icon, toast, showInfo, downloadCsv });
  window.addEventListener('hashchange', route);
  route();
})();
