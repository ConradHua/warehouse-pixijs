/* Park-and-reattach embed for the Pixi warehouse ops chrome.
   Driven only by app.js via window.WMSWarehouseEmbed.sync / destroy. */
(function () {
  'use strict';

  /** @type {{
   *   root: HTMLElement | null,
   *   layout: object | null,
   *   service: object | null,
   *   renderer: object | null,
   *   controller: object | null,
   *   initPromise: Promise<void> | null,
   *   attached: boolean,
   * }} */
  const state = {
    root: null,
    layout: null,
    service: null,
    renderer: null,
    controller: null,
    initPromise: null,
    attached: false,
  };

  function ensureRoot() {
    if (state.root && document.body.contains(state.root)) return state.root;

    const hold = document.getElementById('warehouse-hold');
    if (!hold) {
      console.warn('[WMSWarehouseEmbed] #warehouse-hold missing');
      return null;
    }

    let root = document.getElementById('warehouse-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'warehouse-root';
      root.innerHTML = chromeMarkup();
      hold.appendChild(root);
    } else if (!hold.contains(root) && !document.getElementById('home-warehouse-slot')?.contains(root)) {
      hold.appendChild(root);
    }

    state.root = root;
    if (window.WMSTheme) window.WMSTheme.syncAssets(window.WMSTheme.current());
    return root;
  }

  function brandMark() {
    const assets = window.WMSThemeAssets;
    const themeId = window.WMSTheme ? window.WMSTheme.current() : 'harbor';
    if (assets) {
      return assets.brandMarkSvg(themeId)
        .replace('class="brand-mark overview-mark"', 'class="brand-mark overview-mark mark" data-theme-asset="brand-mark" style="width:36px;height:36px"');
    }
    return '<span class="mark" data-theme-asset="brand-mark">W</span>';
  }

  function chromeMarkup() {
    return `
      <div class="ops-bar">
        <div class="ops-brand">
          ${brandMark()}
          <div>
            Warehouse Operations Overview
            <small>WH-01 · 108 RACKS / PIXI.JS 2.5D</small>
          </div>
        </div>

        <div class="search-wrap">
          <select id="search-mode" aria-label="Search mode">
            <option value="MATERIAL" selected>Material</option>
            <option value="BATCH">Batch</option>
            <option value="DOCUMENT">Document</option>
            <option value="PDA">PDA</option>
          </select>
          <input id="search-input" type="text" autocomplete="off" placeholder="MAT-8801" aria-label="Search material number or name">
          <button id="search-clear" class="icon-clear" type="button" hidden aria-label="Clear search">×</button>
          <button id="search-btn" class="search-submit" type="button">Locate</button>
          <div id="search-suggestions" class="suggestions" hidden></div>
        </div>

        <div class="header-actions">
          <button id="overview-return" type="button" class="overview-return" hidden>Back</button>
          <button id="sim-toggle-header" type="button" class="sim-header-btn">⚙ Simulator</button>
          <button id="reset" type="button">↗ Fit warehouse</button>
        </div>
      </div>

      <section id="kpi-bar" class="kpi-bar" aria-label="Daily operations KPI"></section>

      <main id="viewport" aria-label="Pan and zoom 2.5D warehouse overview canvas">
        <div id="loading" role="status">Initializing 108 racks and warehouse model…</div>
      </main>

      <aside class="inspector" aria-label="Scene controls and detail inspector">
        <div class="inspector-top">
          <div class="panel-title">Scene layers <span>LAYERS</span></div>
          <div class="layer-checks">
            <label><input id="walls" type="checkbox" checked>Building walls</label>
            <label><input id="labels" type="checkbox" checked>Zone labels</label>
            <label><input id="pdas" type="checkbox" checked>Active PDAs</label>
          </div>
          <div class="legend-grid" aria-label="Honest visualization legend">
            <span><i class="lg lg-empty"></i>Empty</span>
            <span><i class="lg lg-normal"></i>Occupied block</span>
            <span><i class="lg lg-hold"></i>Hold / QC</span>
            <span><i class="lg lg-in"></i>Inbound PDA</span>
            <span><i class="lg lg-out"></i>Outbound PDA</span>
            <span><i class="lg lg-int"></i>In-warehouse PDA</span>
          </div>
        </div>
        <div class="rule"></div>
        <div id="inspector-body" class="inspector-body" aria-live="polite"></div>
      </aside>

      <div id="pda-popover" class="pda-popover" hidden role="dialog" aria-label="PDA task details">
        <button id="pda-popover-close" class="popover-close" type="button" aria-label="Close">×</button>
        <div id="pda-popover-body"></div>
      </div>

      <section id="sim-drawer" class="sim-drawer" aria-label="Demo mock business simulator">
        <button id="sim-toggle-pill" class="sim-pill" type="button">⚙ Demo simulator (Mock)</button>
        <div class="sim-panel">
          <div class="sim-head">
            <strong>Mock business simulator <small>Remove when connecting live WMS</small></strong>
            <button id="sim-close" type="button" class="popover-close" aria-label="Collapse">×</button>
          </div>
          <div class="sim-actions">
            <button id="sim-inbound" type="button">▶ Inbound loop (unload → putaway → clear)</button>
            <button id="sim-outbound" type="button">▶ Outbound loop (pick → pack → ship)</button>
            <button id="sim-lineage" type="button">▶ Multi-level batch split trace</button>
            <button id="sim-fade" type="button">▶ Silent inactivity fade (continuous scan)</button>
            <button id="sim-stress" type="button">⚡ Stress test (40+ PDAs)</button>
          </div>
          <div id="sim-log" class="sim-log" aria-live="polite"></div>
        </div>
      </section>

      <div class="view-tools">
        <span id="lod-badge" class="lod-badge">LOD macro</span>
        <button id="out" type="button" aria-label="Zoom out">−</button>
        <output id="zoom">100%</output>
        <button id="in" type="button" aria-label="Zoom in">＋</button>
      </div>

      <div id="elevation-modal" class="modal-backdrop" hidden role="dialog" aria-modal="true" aria-labelledby="elevation-title">
        <div class="modal-sheet">
          <div class="modal-header">
            <div>
              <h2 id="elevation-title">Rack elevation view</h2>
              <div id="elevation-meta" class="modal-meta"></div>
            </div>
            <div class="modal-actions">
              <button id="elevation-return" type="button" class="overview-return modal-return" hidden>Back</button>
              <button id="elevation-close" type="button" class="modal-close">Close (Esc)</button>
            </div>
          </div>
          <div class="modal-body">
            <div class="elev-legend">
              <span><i class="el el-empty"></i>Empty locator</span>
              <span><i class="el el-occ"></i>Occupied locator</span>
              <span><i class="el el-hold"></i>Has hold / QC</span>
              <span><i class="el el-pri"></i>Primary hit batch</span>
              <span><i class="el el-sec"></i>Split-related batch</span>
            </div>
            <div id="elevation-grid" class="elevation-grid"></div>
            <div class="elev-table-section">
              <div id="elevation-locator-heading" class="elev-table-heading"></div>
              <div id="elevation-table-wrap" class="elev-table-wrap"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="ops-status">
        <span><i></i> PIXI.JS <b>2.5D</b> · Honest visualization (no physical fill-rate)</span>
        <span>Drag to pan <em>·</em> Scroll to zoom <em>·</em> Double-click rack for 2D elevation <em>·</em> Esc close/reset</span>
        <span id="fps-badge" class="footer-right">60 FPS · 108 racks</span>
      </div>
    `;
  }

  function parkRoot() {
    const root = state.root || document.getElementById('warehouse-root');
    if (!root) return;
    const hold = document.getElementById('warehouse-hold');
    if (hold && root.parentElement !== hold) {
      hold.appendChild(root);
    }
    state.attached = false;
  }

  function attachToHome() {
    const root = ensureRoot();
    const slot = document.getElementById('home-warehouse-slot');
    if (!root || !slot) {
      console.warn('[WMSWarehouseEmbed] home slot or root missing');
      return false;
    }
    if (root.parentElement !== slot) {
      slot.appendChild(root);
    }
    state.attached = true;
    return true;
  }

  function setTickerRunning(running) {
    const ticker = state.renderer?.app?.ticker;
    if (!ticker) return;
    if (running) {
      if (typeof ticker.start === 'function') ticker.start();
    } else if (typeof ticker.stop === 'function') {
      ticker.stop();
    }
  }

  function exposeDebugHandle() {
    const { layout, service, renderer, controller } = state;
    if (!layout || !service || !renderer || !controller) return;
    const WMS = window.WMS;
    window.warehouse = {
      app: renderer.app,
      world: renderer.world,
      walls: renderer.layers?.walls,
      labels: renderer.layers?.labels,
      pdas: renderer.layers?.pdas,
      racks: layout.racks.map((r) => ({
        ...r,
        id: r.rackId,
        container: renderer.rackViews?.get(r.rackId)?.container,
      })),
      zones: layout.zones,
      layout,
      service,
      renderer,
      controller,
      reset: () => renderer.reset(),
      zoom: (f, pt) => renderer.zoom(f, pt),
      project: WMS?.project,
    };
  }

  async function initOnce() {
    if (state.renderer) return;
    if (state.initPromise) {
      await state.initPromise;
      return;
    }

    state.initPromise = (async () => {
      const WMS = window.WMS;
      const root = ensureRoot();
      if (!WMS || !root) {
        throw new Error('WMS namespace or #warehouse-root unavailable');
      }

      const host = root.querySelector('#viewport');
      const loading = root.querySelector('#loading');
      if (!host) throw new Error('#viewport missing inside #warehouse-root');

      const layout = WMS.createDefaultWarehouseLayout();
      const service = new WMS.WmsMockService(layout);
      const snapshot = service.getInventorySummarySnapshot();
      const initialPdas = service.getActivePdas();

      let controller = null;
      const renderer = new WMS.WarehouseRenderer(host, layout, {
        onRackSelect: (rackId) => controller?.onRackSelect(rackId),
        onRackDoubleClick: (rackId) => controller?.openElevationModal(rackId),
        onZoneSelect: (zoneId) => controller?.onZoneSelect(zoneId),
        onPdaSelect: (pda) => controller?.onPdaSelect(pda),
        onPdaClusterSelect: (group) => controller?.onPdaClusterSelect(group),
        onZoomChange: (pct, isMacro) => controller?.onZoomChange(pct, isMacro),
      });

      state.layout = layout;
      state.service = service;
      state.renderer = renderer;

      await renderer.init(snapshot, initialPdas);

      controller = new WMS.AppController(service, renderer, root);
      controller.init();
      renderer.playIntroFlyIn();
      controller.onZoomChange(
        Math.round((renderer.world.scale.x / renderer.baseScale) * 100),
        renderer.isMacroLod
      );
      if (loading) loading.remove();

      state.controller = controller;
      exposeDebugHandle();
    })();

    try {
      await state.initPromise;
    } catch (error) {
      const loading = state.root?.querySelector('#loading');
      if (loading) {
        loading.textContent = 'Unable to initialize WebGL. Please use Chrome / Edge with hardware acceleration enabled.';
      }
      console.error('[WMSWarehouseEmbed] init failed', error);
      if (state.renderer && typeof state.renderer.destroy === 'function') {
        try {
          state.renderer.destroy();
        } catch (_) {
          /* ignore teardown errors during failed init */
        }
      }
      state.renderer = null;
      state.controller = null;
      state.service = null;
      state.layout = null;
      throw error;
    } finally {
      state.initPromise = null;
    }
  }

  function applyHomeLink() {
    const spatial = window.WMSSpatialLink;
    if (!spatial || !state.controller || typeof state.controller.applyOverviewFocus !== 'function') return;
    requestAnimationFrame(() => {
      if (!state.controller || !location.hash.startsWith('#home')) return;
      state.controller.applyOverviewFocus(spatial.parseHomeFocus(location.hash));
    });
  }

  async function sync(route) {
    if (route === 'home') {
      if (!attachToHome()) return;
      try {
        await initOnce();
      } catch {
        return;
      }
      setTickerRunning(true);
      applyHomeLink();
      return;
    }

    // Non-home: park and pause render loop if already initialized.
    if (state.root || document.getElementById('warehouse-root')) {
      parkRoot();
      setTickerRunning(false);
    }
  }

  function destroy() {
    // Detach from Home first so a concurrent shell re-render cannot touch a live tree.
    parkRoot();
    setTickerRunning(false);

    const renderer = state.renderer;
    if (renderer && typeof renderer.destroy === 'function') {
      try {
        renderer.destroy();
      } catch (error) {
        console.error('[WMSWarehouseEmbed] renderer.destroy failed', error);
      }
    }

    // WmsMockService has no dispose/stop API; leave timers for GC after nulling refs.

    // Remove parked root so the next home visit rebuilds chrome + GL cleanly
    // (avoids stale canvas nodes and duplicate controller listeners).
    const root = state.root || document.getElementById('warehouse-root');
    if (root) root.remove();

    state.root = null;
    state.layout = null;
    state.service = null;
    state.renderer = null;
    state.controller = null;
    state.initPromise = null;
    state.attached = false;

    if (window.warehouse) {
      try {
        delete window.warehouse;
      } catch {
        window.warehouse = undefined;
      }
    }
  }

  window.WMSWarehouseEmbed = { sync, destroy };
})();
