(function (global) {
  'use strict';
  const WMS = (global.WMS = global.WMS || {});

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const SEARCH_MODE_CHROME = {
    MATERIAL: { placeholder: 'MAT-8801', aria: 'Search material number or name' },
    BATCH: { placeholder: 'B20261101-01A', aria: 'Search batch number' },
    DOCUMENT: { placeholder: 'RCV-2604271 / WV-20261119-082', aria: 'Search receiving job, putaway, or order number' },
    PDA: { placeholder: 'PDA-005', aria: 'Search PDA device id' },
  };

  class AppController {
    constructor(service, renderer, rootEl = document) {
      this.service = service;
      this.renderer = renderer;
      this.root = rootEl;
      this.currentSearchResult = null;
      this.searchMode = 'MATERIAL';
      this.searchOpenedPda = false;
      this.openElevationRackId = null;
      this.openElevationLocatorId = null;
      this.activePdaFilter = 'ALL';
      this.returnHash = null;

      const q = (sel) => this.root.querySelector(sel);
      this.$ = {
        searchMode: q('#search-mode'),
        searchInput: q('#search-input'),
        searchClear: q('#search-clear'),
        searchBtn: q('#search-btn'),
        suggestions: q('#search-suggestions'),
        kpiBar: q('#kpi-bar'),
        inspectorBody: q('#inspector-body'),
        zoomOutput: q('#zoom'),
        lodBadge: q('#lod-badge'),
        fpsOutput: q('#fps-badge'),
        pdaPopover: q('#pda-popover'),
        elevationModal: q('#elevation-modal'),
        elevationTitle: q('#elevation-title'),
        elevationMeta: q('#elevation-meta'),
        elevationGrid: q('#elevation-grid'),
        elevationTableWrap: q('#elevation-table-wrap'),
        elevationLocatorHeading: q('#elevation-locator-heading'),
        simDrawer: q('#sim-drawer'),
        simLog: q('#sim-log'),
        simStressBtn: q('#sim-stress'),
      };
    }

    _bind(selector, prop, handler) {
      const node = this.root.querySelector(selector);
      if (!node) return;
      node[prop] = handler;
    }

    init() {
      this._bindHeaderAndLayers();
      this._bindSearch();
      this._bindElevationModal();
      this._bindSimulator();
      this._bindServiceEvents();
      this._bindReturnChip();

      this.renderKpiBar();
      this.renderIdleInspector();
      this.renderSimLog();

      setInterval(() => {
        if (this.$.fpsOutput) {
          const fps = this.renderer.getFps();
          const pdaCount = this.service.getActivePdas().length;
          this.$.fpsOutput.textContent = `${fps} FPS · 108 racks · ${pdaCount} PDA`;
        }
      }, 600);
    }

    // ---- Header, Layers, Camera Controls ----

    _bindHeaderAndLayers() {
      this._bind('#reset', 'onclick', () => this.renderer.reset());
      this._bind('#in', 'onclick', () => this.renderer.zoom(1.25));
      this._bind('#out', 'onclick', () => this.renderer.zoom(1 / 1.25));

      this._bind('#walls', 'onchange', (e) => this.renderer.setLayerVisible('walls', e.target.checked));
      this._bind('#labels', 'onchange', (e) => this.renderer.setLayerVisible('labels', e.target.checked));
      this._bind('#pdas', 'onchange', (e) => this.renderer.setLayerVisible('pdas', e.target.checked));

      this._bind('#pda-popover-close', 'onclick', () => this.hidePdaPopover());

      window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modal = this.$.elevationModal;
        const popover = this.$.pdaPopover;
        if (modal && !modal.hidden) {
          this.closeElevationModal();
        } else if (popover && !popover.hidden) {
          this.hidePdaPopover();
        } else if (this.renderer) {
          this.renderer.reset();
        }
      });
    }

    onZoomChange(percent, isMacro) {
      if (this.$.zoomOutput) this.$.zoomOutput.value = `${percent}%`;
      if (this.$.lodBadge) {
        this.$.lodBadge.textContent = isMacro ? 'LOD macro' : 'LOD detail';
        this.$.lodBadge.classList.toggle('lod-detail', !isMacro);
      }
    }

    // ---- KPI Strip & PDA Category Filter ----

    renderKpiBar() {
      if (!this.$.kpiBar) return;
      const kpi = this.service.getKpiSummary();
      const filterPill = (key, label, count, cls) => {
        const active = this.activePdaFilter === key ? 'is-active' : '';
        return `<button type="button" class="kpi-pill ${cls} ${active}" data-pda-filter="${key}">${label} <b>${count}</b></button>`;
      };

      this.$.kpiBar.innerHTML = `
        <div class="kpi-group">
          <span class="kpi-label">Inbound</span>
          <span class="kpi-metric">Receiving <b>${kpi.inbound.receiving}</b></span>
          <span class="kpi-metric">Pending putaway <b>${kpi.inbound.pendingPutaway}</b></span>
          <span class="kpi-metric">Putaway active <b>${kpi.inbound.putawayActive}</b></span>
        </div>
        <div class="kpi-sep"></div>
        <div class="kpi-group">
          <span class="kpi-label">Outbound</span>
          <span class="kpi-metric">Pending pick <b>${kpi.outbound.pendingPicking}</b></span>
          <span class="kpi-metric">Picking <b>${kpi.outbound.pickingActive}</b></span>
          <span class="kpi-metric">Packing <b>${kpi.outbound.packingActive}</b></span>
          <span class="kpi-metric">Shipping <b>${kpi.outbound.shippingActive}</b></span>
        </div>
        <div class="kpi-sep"></div>
        <div class="kpi-group kpi-pdas" role="group" aria-label="Filter active PDAs by process">
          <span class="kpi-label">Active PDAs</span>
          ${filterPill('ALL', 'All', kpi.pdas.total, 'pill-all')}
          ${filterPill('INBOUND', 'Inbound', kpi.pdas.inbound, 'pill-in')}
          ${filterPill('OUTBOUND', 'Outbound', kpi.pdas.outbound, 'pill-out')}
          ${filterPill('INTERNAL', 'Internal', kpi.pdas.internal, 'pill-int')}
        </div>
      `;

      this.$.kpiBar.querySelectorAll('[data-pda-filter]').forEach((btn) => {
        btn.onclick = () => {
          this.activePdaFilter = btn.dataset.pdaFilter;
          this.renderer.setPdaCategoryFilter(this.activePdaFilter);
          this.renderKpiBar();
        };
      });
    }

    // ---- Overview search: Material, Batch, Document, PDA ----

    _syncSearchPlaceholder() {
      const chrome = SEARCH_MODE_CHROME[this.searchMode] || SEARCH_MODE_CHROME.MATERIAL;
      const input = this.$.searchInput;
      if (!input) return;
      input.placeholder = chrome.placeholder;
      input.setAttribute('aria-label', chrome.aria);
    }

    _setSearchMode(mode) {
      const next = Object.prototype.hasOwnProperty.call(SEARCH_MODE_CHROME, mode) ? mode : 'MATERIAL';
      this.searchMode = next;
      if (this.$.searchMode) this.$.searchMode.value = next;
      this._syncSearchPlaceholder();
    }

    _dismissSearchPda() {
      if (!this.searchOpenedPda) return;
      this.searchOpenedPda = false;
      this.hidePdaPopover();
    }

    _focusSearchTarget(target) {
      if (!target) return;
      if (target.rackId) this.renderer.focusOnRack(target.rackId, { animate: true, duration: 0.55, zoomRatio: 1.8 });
      else if (target.zoneId) this.renderer.focusOnZone(target.zoneId, { animate: true, duration: 0.55 });
    }

    _bindSearch() {
      const input = this.$.searchInput;
      const box = this.$.suggestions;
      if (!input || !box) return;

      const showSuggestions = () => {
        const list = this.service.getSearchSuggestions(input.value, this.searchMode);
        if (list.length === 0) {
          box.hidden = true;
          return;
        }
        box.innerHTML = list
          .map((item) => {
            const badgeClass =
              item.type === 'BATCH' ? 'is-batch' : item.type === 'DOCUMENT' ? 'is-document' : item.type === 'PDA' ? 'is-pda' : '';
            return `
          <button type="button" class="suggest-item" data-code="${escapeHtml(item.code)}">
            <span>${escapeHtml(item.label)}</span>
            <em class="suggest-badge ${badgeClass}">${escapeHtml(item.badge)}</em>
          </button>`;
          })
          .join('');
        box.hidden = false;
        box.querySelectorAll('.suggest-item').forEach((btn) => {
          btn.onclick = () => {
            input.value = btn.dataset.code;
            box.hidden = true;
            this.executeSearch(btn.dataset.code);
          };
        });
      };

      this._syncSearchPlaceholder();
      if (this.$.searchMode) {
        this.$.searchMode.addEventListener('change', () => {
          this.searchMode = this.$.searchMode.value || 'MATERIAL';
          this._syncSearchPlaceholder();
          showSuggestions();
        });
      }

      input.addEventListener('focus', showSuggestions);
      input.addEventListener('input', () => {
        if (this.$.searchClear) this.$.searchClear.hidden = !input.value.trim();
        showSuggestions();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          box.hidden = true;
          this.executeSearch(input.value);
        }
      });

      if (this.$.searchBtn) {
        this.$.searchBtn.onclick = () => {
          box.hidden = true;
          this.executeSearch(input.value);
        };
      }
      if (this.$.searchClear) {
        this.$.searchClear.onclick = () => {
          input.value = '';
          this.$.searchClear.hidden = true;
          box.hidden = true;
          this.clearSearch();
        };
      }

      document.addEventListener('click', (e) => {
        const wrap = this.root.querySelector('.search-wrap');
        if (wrap && e.target && wrap.contains(e.target)) return;
        box.hidden = true;
      });
    }

    executeSearch(query, mode) {
      if (mode) this._setSearchMode(mode);
      const trimmed = (query || '').trim();
      this._dismissSearchPda();
      if (this.$.suggestions) this.$.suggestions.hidden = true;
      if (!trimmed) {
        this.clearSearch();
        return;
      }
      if (this.$.searchInput) this.$.searchInput.value = trimmed;
      if (this.$.searchClear) this.$.searchClear.hidden = false;

      const result = this.service.searchInventory(trimmed, this.searchMode);
      this.currentSearchResult = result;
      this.renderer.setHighlight(result);
      this.renderSearchInspector(result);
      if (result && result.pda && result.pda.target) {
        this.searchOpenedPda = true;
        this.renderer.selectPda(result.pda);
        this.onPdaSelect(result.pda);
        if (result.searchMode === 'PDA') this._focusSearchTarget(result.pda.target);
      }
    }

    clearSearch() {
      this._dismissSearchPda();
      this.currentSearchResult = null;
      this.renderer.setHighlight(null);
      this.renderIdleInspector();
    }

    _bindReturnChip() {
      this.root.querySelectorAll('.overview-return').forEach((button) => {
        button.onclick = () => this.useReturnChip();
      });
      this._renderReturnChip();
    }

    _noteOverviewClick() {
      const spatial = window.WMSSpatialLink;
      if (!spatial) return;
      this.returnHash = spatial.nextReturnHash(this.returnHash, 'overview-click');
    }

    _renderReturnChip() {
      const spatial = window.WMSSpatialLink;
      const label = this.returnHash && spatial ? spatial.returnChipLabel(this.returnHash) : '';
      this.root.querySelectorAll('.overview-return').forEach((button) => {
        button.hidden = !this.returnHash;
        button.textContent = label;
      });
    }

    useReturnChip() {
      const spatial = window.WMSSpatialLink;
      const dest = this.returnHash;
      this.closeElevationModal();
      this.hidePdaPopover();
      this.returnHash = spatial ? spatial.nextReturnHash(dest, 'use-return') : null;
      this._renderReturnChip();
      if (!dest) return;
      location.hash = dest.charAt(0) === '#' ? dest.slice(1) : dest;
    }

    openBusinessDocument(hash) {
      const spatial = window.WMSSpatialLink;
      this.closeElevationModal();
      this.hidePdaPopover();
      this.returnHash = spatial ? spatial.nextReturnHash(this.returnHash, 'open-document') : null;
      this._renderReturnChip();
      if (!hash) return;
      location.hash = hash.charAt(0) === '#' ? hash.slice(1) : hash;
    }

    _bindDocumentButtons(scope) {
      if (!scope) return;
      scope.querySelectorAll('[data-open-doc]').forEach((btn) => {
        btn.onclick = () => this.openBusinessDocument(btn.dataset.openDoc);
      });
    }

    _stockActions(item) {
      const spatial = window.WMSSpatialLink;
      if (!spatial || !item) return '';
      const onHand = spatial.buildInventoryQuery({
        materialNo: item.materialNo,
        batchNo: item.batchNo,
        locator: item.locatorId,
      });
      const job = spatial.receivingJobHash({
        currentZoneId: item.zoneId,
        receivingJobId: item.receivingJobId,
      });
      return `<div class="stock-actions">
        <button type="button" class="ghost-btn" data-open-doc="${escapeHtml(onHand)}">Open On-hand</button>
        ${job ? `<button type="button" class="ghost-btn" data-open-doc="${escapeHtml(job)}">Open Receiving Job</button>` : ''}
      </div>`;
    }

    applyOverviewFocus(parsed) {
      const spatial = window.WMSSpatialLink;
      if (!spatial || !parsed) return;
      const plan = spatial.planOverviewFocus(parsed);
      this.returnHash = spatial.nextReturnHash(parsed.returnHash, 'overview-click');
      this._renderReturnChip();
      if (!plan.focus.length) return;
      const resolved = plan.focus.map((token) => this.service.resolveFocusTarget(token)).filter(Boolean);
      if (!resolved.length) return;
      const result = this._focusHighlight(resolved);
      this.currentSearchResult = result;
      this.renderer.setHighlight(result);
      if (plan.frame === 'all') {
        this.renderer.clearSelection();
        this.closeElevationModal();
        this.renderer.frameTargets(resolved);
        this._renderMultiFocusInspector(resolved);
        return;
      }
      const one = resolved[0];
      if (one.rackId) {
        this.renderer.selectRack(one.rackId);
        this.renderer.focusOnRack(one.rackId, { animate: true, zoomRatio: 1.85 });
        this.onRackSelect(one.rackId, { camera: false });
        if (plan.openElevation) this.openElevationModal(one.rackId, plan.elevationLocatorId);
      } else if (one.zoneId) {
        this.closeElevationModal();
        this.renderer.selectZone(one.zoneId);
        this.renderer.focusOnZone(one.zoneId, { animate: true, zoomRatio: 1.45 });
        this.onZoneSelect(one.zoneId, { camera: false });
      }
    }

    _focusHighlight(resolved) {
      const primaryRackIds = [];
      const primaryZoneIds = [];
      const matchedLocators = new Map();
      const records = [];
      resolved.forEach((item) => {
        if (item.rackId) {
          if (!primaryRackIds.includes(item.rackId)) primaryRackIds.push(item.rackId);
        } else if (item.zoneId && !primaryZoneIds.includes(item.zoneId)) {
          primaryZoneIds.push(item.zoneId);
        }
        const note = item.locatorId ? this.service.putawayDestinationNote(item.locatorId) : null;
        const stock = item.locatorId ? this.service.getLocatorDetails(item.locatorId) : [];
        const label = note ? 'Putaway Destination' : (stock[0]?.batchNo || item.locatorId || item.id);
        if (item.locatorId) matchedLocators.set(item.locatorId, { role: 'primary', batchNo: label });
        records.push({ rackId: item.rackId, zoneId: item.zoneId, batchNo: label });
      });
      const title = resolved.length > 1 ? 'Focused locators' : (records[0]?.batchNo || 'Focused locator');
      return {
        mode: 'FOCUS',
        title,
        primaryRackIds,
        secondaryRackIds: [],
        primaryZoneIds,
        secondaryZoneIds: [],
        matchedLocators,
        records,
        batchGroups: [],
        lineage: null,
      };
    }

    _renderMultiFocusInspector(resolved) {
      if (!this.$.inspectorBody) return;
      const lines = resolved.map((item) => `<li><code>${escapeHtml(item.locatorId || item.id)}</code></li>`).join('');
      this.$.inspectorBody.innerHTML = `
        <div class="detail-head"><div><div class="detail-title">Focused locators</div>
        <div class="detail-sub">${resolved.length} current locators · elevation stays closed</div></div></div>
        <ul class="focus-locator-list">${lines}</ul>`;
    }

    // ---- Inspector Panel Rendering ----

    renderIdleInspector() {
      if (!this.$.inspectorBody) return;
      this.$.inspectorBody.innerHTML = `
        <div class="empty-hint">
          <strong>Click a rack or floor zone for details</strong>
          <p>Single-click a rack to preview locator counts; <b>double-click a rack</b> to open the 2D elevation view. Click receiving, floor stacking, packing, or shipping zones for live lists.</p>
        </div>
        <div class="quick-chips">
          <span class="sub-label">Quick demo queries:</span>
          <button type="button" class="chip-btn" data-quick="B20261101-01A" data-quick-mode="BATCH">Multi-split B20261101-01A</button>
          <button type="button" class="chip-btn" data-quick="MAT-4205" data-quick-mode="MATERIAL">Cross-zone MAT-4205</button>
          <button type="button" class="chip-btn" data-quick="MAT-1090" data-quick-mode="MATERIAL">Floor + rack MAT-1090</button>
        </div>
      `;
      this.$.inspectorBody.querySelectorAll('[data-quick]').forEach((btn) => {
        btn.onclick = () => this.executeSearch(btn.dataset.quick, btn.dataset.quickMode);
      });
    }

    onRackSelect(rackId, opts = {}) {
      this._noteOverviewClick();
      const summary = this.service.getRackSummary(rackId);
      if (!summary) return;
      this.hidePdaPopover();
      if (opts.camera !== false) {
        this.renderer.focusOnRack(rackId, { soft: true, animate: true, duration: 0.55 });
      }
      if (!this.$.inspectorBody) return;

      const pdaHtml =
        summary.activePdas.length > 0
          ? summary.activePdas
              .map(
                (p) =>
                  `<div class="mini-pda"><span class="pda-dot cat-${p.category.toLowerCase()}"></span><b>${escapeHtml(
                    p.pdaId
                  )}</b> · ${escapeHtml(p.taskLabel)} (${escapeHtml(p.orderNo)})</div>`
              )
              .join('')
          : '<div class="muted-text">No active PDA tasks</div>';

      const statusBadge = !summary.hasStock
        ? '<span class="state-tag st-empty">Empty rack</span>'
        : summary.hasHold
        ? '<span class="state-tag st-hold">Has hold / QC</span>'
        : '<span class="state-tag st-normal">In stock</span>';

      this.$.inspectorBody.innerHTML = `
        <div class="detail-head">
          <div>
            <div class="detail-title">Rack ${escapeHtml(summary.rackId)}</div>
            <div class="detail-sub">${escapeHtml(summary.zoneName)} · ${escapeHtml(summary.template.name)} (${
        summary.template.levels
      } levels × ${summary.template.bays} bays)</div>
          </div>
          ${statusBadge}
        </div>

        <div class="fact-grid">
          <div class="fact-card fact-wide">
            <span class="fact-label">Occupied locators (plain-text reference)</span>
            <strong class="fact-val">${summary.occupiedLocators} / ${summary.totalLocators}</strong>
            <span class="fact-note">Reference only — not physical volume or fill rate</span>
          </div>
          <div class="fact-card">
            <span class="fact-label">On-hand SKUs</span>
            <strong class="fact-val">${summary.skuCount}</strong>
          </div>
          <div class="fact-card">
            <span class="fact-label">Total quantity</span>
            <strong class="fact-val">${summary.totalQty}</strong>
          </div>
        </div>

        <div class="section-block">
          <div class="sub-label">Linked active PDAs</div>
          ${pdaHtml}
        </div>

        <div class="action-row">
          <button type="button" class="primary-btn" id="open-elevation-btn">Open 2D rack elevation</button>
          ${
            this.currentSearchResult && this.currentSearchResult.mode !== 'FOCUS'
              ? '<button type="button" class="ghost-btn" id="back-to-search-btn">Back to search results</button>'
              : ''
          }
        </div>
      `;

      this._bind('#open-elevation-btn', 'onclick', () => this.openElevationModal(rackId));
      this._bind('#back-to-search-btn', 'onclick', () => this.renderSearchInspector(this.currentSearchResult));
    }

    onZoneSelect(zoneId, opts = {}) {
      this._noteOverviewClick();
      const zone = this.service.zoneMap.get(zoneId);
      if (!zone) return;
      this.hidePdaPopover();
      if (opts.camera !== false) {
        this.renderer.focusOnZone(zoneId, { soft: true, animate: true, duration: 0.55 });
      }
      if (!this.$.inspectorBody) return;
      const items = this.service.getZoneInventory(zoneId);
      const activePdas = this.service.getActivePdas().filter((p) => p.target.zoneId === zoneId && !p.target.rackId);

      const rowsHtml =
        items.length > 0
          ? items
              .map(
                (it) => `
          <div class="zone-item-card">
            <div class="zone-item-top">
              <b>${escapeHtml(it.materialNo)}</b>
              <span class="inv-status st-${it.status.toLowerCase()}">${escapeHtml(it.statusLabel)}</span>
            </div>
            <div class="zone-item-name">${escapeHtml(it.materialName)}</div>
            <div class="zone-item-meta">
              <span>Batch: <code>${escapeHtml(it.batchNo)}</code></span>
              <span>${it.qty} ${escapeHtml(it.unit)}</span>
            </div>
            <div class="zone-item-foot">
              <span>Locator ${escapeHtml(it.locatorId)}</span>
              ${
                it.hasSplitLineage
                  ? `<button type="button" class="lineage-btn" data-lineage-batch="${escapeHtml(it.batchNo)}">Split lineage</button>`
                  : ''
              }
            </div>
            ${this._stockActions(it)}
          </div>`
              )
              .join('')
          : '<div class="muted-text">No on-hand records in this zone</div>';

      this.$.inspectorBody.innerHTML = `
        <div class="detail-head">
          <div>
            <div class="detail-title">${escapeHtml(zone.name)}</div>
            <div class="detail-sub">Floor Zone · ${escapeHtml(zone.zoneId)} · ${items.length} records · ${
        activePdas.length
      } PDAs</div>
          </div>
          <span class="state-tag st-zone">Floor zone</span>
        </div>
        <div class="zone-list">${rowsHtml}</div>
        ${
          this.currentSearchResult && this.currentSearchResult.mode !== 'FOCUS'
            ? '<div class="action-row"><button type="button" class="ghost-btn" id="back-to-search-btn">Back to search results</button></div>'
            : ''
        }
      `;

      this.$.inspectorBody.querySelectorAll('[data-lineage-batch]').forEach((btn) => {
        btn.onclick = () => this.executeSearch(btn.dataset.lineageBatch, 'BATCH');
      });
      this._bindDocumentButtons(this.$.inspectorBody);
      this._bind('#back-to-search-btn', 'onclick', () => this.renderSearchInspector(this.currentSearchResult));
    }

    _searchEmptyHint(result) {
      const mode = result?.searchMode || this.searchMode;
      if (mode === 'BATCH') return 'Try a batch number, for example <code>B20261101-01A</code>.';
      if (mode === 'DOCUMENT') return 'Try a receiving job, putaway, or PDA order, for example <code>RCV-2604271</code> or <code>WV-20261119-082</code>.';
      if (mode === 'PDA') return 'Try a PDA device id, for example <code>PDA-005</code>.';
      return 'Try a material number or name, for example <code>MAT-8801</code>.';
    }

    _locatorJumpButton(loc, detail) {
      if (loc.rackId) {
        return `<button type="button" class="loc-jump" data-jump-rack="${escapeHtml(loc.rackId)}" data-jump-loc="${escapeHtml(
          loc.locatorId
        )}">${escapeHtml(loc.rackId)} (${escapeHtml(loc.locatorId)}) · ${detail}</button>`;
      }
      return `<button type="button" class="loc-jump is-zone" data-jump-zone="${escapeHtml(loc.zoneId)}">${escapeHtml(
        loc.zoneName || loc.zoneId
      )} (${escapeHtml(loc.locatorId || '')}) · ${detail}</button>`;
    }

    _renderDocumentSection(result) {
      const jumps = (result.records || [])
        .map((loc) => {
          const detail = loc.emptyDestination
            ? 'Putaway Destination · no stock'
            : `${loc.materialNo ? `${escapeHtml(loc.materialNo)} · ` : ''}${escapeHtml(loc.batchNo)}${
                loc.qty ? ` · ${loc.qty}${escapeHtml(loc.unit || '')}` : ''
              }`;
          return this._locatorJumpButton(loc, detail);
        })
        .join('');
      const pda = result.pda
        ? `<div class="mini-pda"><b>${escapeHtml(result.pda.pdaId)}</b> · ${escapeHtml(result.pda.taskLabel)} (${escapeHtml(
            result.pda.orderNo
          )})</div>`
        : '';
      return `
        <div class="section-block">
          <div class="sub-label">Matching locators</div>
          <div class="loc-jump-list">${jumps}</div>
          ${pda}
        </div>`;
    }

    _renderPdaSection(result) {
      const pda = result.pda;
      const device = pda
        ? `<div class="mini-pda"><b>${escapeHtml(pda.pdaId)}</b> · ${escapeHtml(pda.taskLabel)} (${escapeHtml(pda.orderNo)})</div>`
        : '';
      const jumps = (result.records || [])
        .map((loc) => this._locatorJumpButton(loc, escapeHtml(loc.batchNo || loc.locatorId || '')))
        .join('');
      return `
        <div class="section-block">
          <div class="sub-label">PDA device</div>
          ${device}
          <div class="loc-jump-list">${jumps}</div>
        </div>`;
    }

    renderSearchInspector(result) {
      if (!this.$.inspectorBody) return;
      if (!result || result.mode === 'EMPTY') {
        this.$.inspectorBody.innerHTML = `
          <div class="empty-hint">
            <strong>${escapeHtml(result?.title || 'No matching records')}</strong>
            <p>${this._searchEmptyHint(result)}</p>
          </div>
          <div class="action-row"><button type="button" class="ghost-btn" id="clear-search-btn">Clear search</button></div>
        `;
        this._bind('#clear-search-btn', 'onclick', () => this.clearSearch());
        return;
      }

      const rackCount = result.primaryRackIds.length + result.secondaryRackIds.length;
      const zoneCount = result.primaryZoneIds.length + result.secondaryZoneIds.length;

      let bodyHtml = '';

      if (result.lineage) {
        const treeHtml = this._renderLineageTreeHtml(result.lineage);
        bodyHtml += `
          <div class="section-block">
            <div class="sub-label">Split lineage (includes historically depleted batches)</div>
            <div class="lineage-legend">
              <span><i class="swatch sw-primary"></i> Primary on-hand hit</span>
              <span><i class="swatch sw-secondary"></i> Related split on-hand</span>
              <span><i class="swatch sw-depleted"></i> Qty 0 / shipped</span>
            </div>
            <div class="lineage-tree">${treeHtml}</div>
          </div>
        `;
      }

      if ((result.mode === 'MATERIAL' || result.mode === 'BATCH') && result.batchGroups?.length) {
        const batchesHtml = result.batchGroups
          .map((grp) => {
            const locButtons = grp.locations
              .map((loc) =>
                loc.rackId
                  ? `<button type="button" class="loc-jump" data-jump-rack="${escapeHtml(loc.rackId)}" data-jump-loc="${escapeHtml(
                      loc.locatorId
                    )}">${escapeHtml(loc.rackId)} (${escapeHtml(loc.locatorId)}) · ${loc.qty}${escapeHtml(loc.unit)}</button>`
                  : `<button type="button" class="loc-jump is-zone" data-jump-zone="${escapeHtml(loc.zoneId)}">${escapeHtml(
                      loc.zoneName
                    )} · ${loc.qty}${escapeHtml(loc.unit)}</button>`
              )
              .join('');

            return `
            <div class="batch-group-card">
              <div class="batch-group-head">
                <code>${escapeHtml(grp.batchNo)}</code>
                ${
                  grp.hasSplitLineage
                    ? `<button type="button" class="lineage-btn" data-lineage-batch="${escapeHtml(
                        grp.batchNo
                      )}">Split lineage</button>`
                    : '<span class="muted-mini">Standalone batch</span>'
                }
              </div>
              <div class="loc-jump-list">${locButtons}</div>
            </div>`;
          })
          .join('');

        bodyHtml += `
          <div class="section-block">
            <div class="sub-label">On-hand batch distribution (${result.batchGroups.length} batches)</div>
            ${batchesHtml}
          </div>
        `;
      }

      if (result.mode === 'DOCUMENT') bodyHtml += this._renderDocumentSection(result);
      if (result.mode === 'PDA') bodyHtml += this._renderPdaSection(result);

      this.$.inspectorBody.innerHTML = `
        <div class="detail-head">
          <div>
            <div class="detail-title">${escapeHtml(result.title)}</div>
            <div class="detail-sub">Highlighted: ${rackCount} racks · ${zoneCount} floor zones</div>
          </div>
        </div>
        ${bodyHtml}
        <div class="action-row">
          <button type="button" class="ghost-btn" id="clear-search-btn">Clear highlight</button>
        </div>
      `;

      this._bind('#clear-search-btn', 'onclick', () => {
        if (this.$.searchInput) this.$.searchInput.value = '';
        if (this.$.searchClear) this.$.searchClear.hidden = true;
        this.clearSearch();
      });

      this.$.inspectorBody.querySelectorAll('[data-lineage-batch]').forEach((btn) => {
        btn.onclick = () => this.executeSearch(btn.dataset.lineageBatch, 'BATCH');
      });

      this.$.inspectorBody.querySelectorAll('[data-jump-rack]').forEach((btn) => {
        btn.onclick = () => {
          const rackId = btn.dataset.jumpRack;
          const locId = btn.dataset.jumpLoc;
          this.renderer.selectRack(rackId);
          this.renderer.focusOnRack(rackId, { animate: true, zoomRatio: 1.85 });
          this.openElevationModal(rackId, locId);
        };
      });

      this.$.inspectorBody.querySelectorAll('[data-jump-zone]').forEach((btn) => {
        btn.onclick = () => {
          const zoneId = btn.dataset.jumpZone;
          this.renderer.selectZone(zoneId);
          this.renderer.focusOnZone(zoneId, { animate: true });
          this.onZoneSelect(zoneId, { camera: false });
        };
      });
    }

    _renderLineageTreeHtml(lineage) {
      const byParent = new Map();
      for (const n of lineage.nodes) {
        const key = n.parentBatchNo || '__ROOT__';
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(n);
      }

      const renderBranch = (parentKey, depth) => {
        const list = byParent.get(parentKey) || [];
        return list
          .map((node) => {
            const roleClass = node.isDepleted ? 'is-depleted' : node.isPrimary ? 'is-primary' : 'is-secondary';
            const locHtml = node.isDepleted
              ? '<span class="depleted-tag">Qty 0 / shipped (historical link)</span>'
              : node.locations
                  .map((loc) =>
                    loc.rackId
                      ? `<button type="button" class="loc-jump" data-jump-rack="${escapeHtml(loc.rackId)}" data-jump-loc="${escapeHtml(
                          loc.locatorId
                        )}">Rack ${escapeHtml(loc.rackId)} · ${escapeHtml(loc.locatorId)} (${loc.qty}${escapeHtml(loc.unit)})</button>`
                      : `<button type="button" class="loc-jump is-zone" data-jump-zone="${escapeHtml(loc.zoneId)}">${escapeHtml(
                          loc.zoneName
                        )} (${loc.qty}${escapeHtml(loc.unit)})</button>`
                  )
                  .join('');

            return `
              <div class="lineage-node ${roleClass}" style="margin-left:${depth * 14}px">
                <div class="lineage-node-head">
                  <span class="lineage-dot"></span>
                  <code>${escapeHtml(node.batchNo)}</code>
                  <span class="lineage-note">${escapeHtml(node.note)}</span>
                </div>
                <div class="lineage-node-locs">${locHtml}</div>
              </div>
              ${renderBranch(node.batchNo, depth + 1)}
            `;
          })
          .join('');
      };

      return renderBranch('__ROOT__', 0);
    }

    // ---- 2D Rack Elevation View Modal ----

    _bindElevationModal() {
      this._bind('#elevation-close', 'onclick', () => this.closeElevationModal());
      if (!this.$.elevationModal) return;
      this.$.elevationModal.addEventListener('click', (e) => {
        if (e.target === this.$.elevationModal) this.closeElevationModal();
      });
    }

    openElevationModal(rackId, initialLocatorId = null) {
      const summary = this.service.getRackSummary(rackId);
      if (!summary) return;
      this.openElevationRackId = rackId;

      // Pick initial Locator: requested -> matched by search -> first occupied -> L1-B1
      let chosenLocId = initialLocatorId;
      if (!chosenLocId && this.currentSearchResult?.matchedLocators) {
        const hit = summary.locators.find((l) => this.currentSearchResult.matchedLocators.has(l.locatorId));
        if (hit) chosenLocId = hit.locatorId;
      }
      if (!chosenLocId) {
        const occupied = summary.locators.find((l) => l.hasStock);
        chosenLocId = occupied ? occupied.locatorId : summary.locators[0]?.locatorId;
      }
      this.openElevationLocatorId = chosenLocId;

      this._renderElevationContent(summary);
      if (this.$.elevationModal) this.$.elevationModal.hidden = false;
    }

    closeElevationModal() {
      if (this.$.elevationModal) this.$.elevationModal.hidden = true;
      this.openElevationRackId = null;
      this.openElevationLocatorId = null;
    }

    _renderElevationContent(summary) {
      if (!this.$.elevationTitle || !this.$.elevationMeta || !this.$.elevationGrid) return;
      const { template } = summary;
      this.$.elevationTitle.textContent = `Rack elevation · ${summary.rackId}`;
      this.$.elevationMeta.innerHTML = `
        <span>${escapeHtml(summary.zoneName)}</span>
        <span>${escapeHtml(template.name)} (${template.levels} levels × ${template.bays} bays)</span>
        <span>Occupied locators <b>${summary.occupiedLocators} / ${summary.totalLocators}</b> (reference only, not fill rate)</span>
      `;

      const locByCoord = new Map(summary.locators.map((l) => [`${l.level}-${l.bay}`, l]));
      const beamClass = template.id === 'FLOW_5X4' ? 'beam-flow' : 'beam-heavy';

      let rowsHtml = '';
      for (let level = template.levels; level >= 1; level--) {
        let cellsHtml = '';
        for (let bay = 1; bay <= template.bays; bay++) {
          const loc = locByCoord.get(`${level}-${bay}`);
          const match = this.currentSearchResult?.matchedLocators?.get(loc.locatorId);
          const destNote = !loc.hasStock ? this.service.putawayDestinationNote(loc.locatorId) : null;
          const classes = ['loc-cell'];
          if (!loc.hasStock) classes.push('is-empty');
          else if (loc.hasHold) classes.push('is-hold');
          else classes.push('is-occupied');

          if (match?.role === 'primary') classes.push('is-match-primary');
          else if (match?.role === 'secondary') classes.push('is-match-secondary');
          if (loc.locatorId === this.openElevationLocatorId) classes.push('is-selected');

          const badgeText = loc.hasStock ? `${loc.skuCount} SKU · ${loc.totalQty} pcs` : destNote ? 'Putaway Destination' : 'Empty';
          cellsHtml += `
            <button type="button" class="${classes.join(' ')}" data-loc-id="${escapeHtml(loc.locatorId)}">
              <span class="loc-code">${escapeHtml(loc.locatorId)}</span>
              <span class="loc-summary">${badgeText}</span>
              ${loc.hasHold ? '<span class="loc-flag flag-hold">Hold / QC</span>' : ''}
              ${loc.hasAllocated && !loc.hasHold ? '<span class="loc-flag flag-alloc">Allocated</span>' : ''}
            </button>
          `;
        }
        rowsHtml += `
          <div class="elev-level-row">
            <div class="elev-level-tag">L${level}</div>
            <div class="elev-bays ${beamClass}" style="grid-template-columns: repeat(${template.bays}, minmax(0, 1fr))">
              ${cellsHtml}
            </div>
          </div>
        `;
      }

      let bayHeaderHtml = '<div class="elev-bay-headers"><div class="elev-level-tag"></div>';
      bayHeaderHtml += `<div class="elev-bay-cols" style="grid-template-columns: repeat(${template.bays}, minmax(0, 1fr))">`;
      for (let b = 1; b <= template.bays; b++) bayHeaderHtml += `<span>Bay ${b} (B${b})</span>`;
      bayHeaderHtml += '</div></div>';

      this.$.elevationGrid.innerHTML = `<div class="elev-rack-frame">${rowsHtml}${bayHeaderHtml}</div>`;

      this.$.elevationGrid.querySelectorAll('[data-loc-id]').forEach((btn) => {
        btn.onclick = () => {
          this.openElevationLocatorId = btn.dataset.locId;
          this._renderElevationContent(this.service.getRackSummary(this.openElevationRackId));
        };
      });

      this._renderElevationTable(this.openElevationLocatorId);
    }

    _renderElevationTable(locatorId) {
      if (!this.$.elevationLocatorHeading || !this.$.elevationTableWrap) return;
      const items = this.service.getLocatorDetails(locatorId);
      const destNote = items.length === 0 ? this.service.putawayDestinationNote(locatorId) : null;
      if (destNote) {
        this.$.elevationLocatorHeading.textContent = `Putaway Destination · ${locatorId} · no stock`;
        this.$.elevationTableWrap.innerHTML = destNote.map((row) => `
          <div class="putaway-dest-note"><b>${escapeHtml(row.materialNo)}</b> · <code>${escapeHtml(row.batchNo)}</code><span>Putaway Destination, no stock</span></div>
        `).join('');
        return;
      }
      this.$.elevationLocatorHeading.textContent = `Locator ${locatorId} inventory (${items.length} records)`;

      if (items.length === 0) {
        this.$.elevationTableWrap.innerHTML =
          '<div class="elev-empty-table">No inventory records for this locator (empty)</div>';
        return;
      }

      const rows = items
        .map(
          (item) => `
        <tr>
          <td><b>${escapeHtml(item.materialNo)}</b></td>
          <td>${escapeHtml(item.materialName)}</td>
          <td>
            <code>${escapeHtml(item.batchNo)}</code>
            ${
              item.hasSplitLineage
                ? `<button type="button" class="lineage-btn inline-lineage" data-reverse-batch="${escapeHtml(
                    item.batchNo
                  )}">Split lineage</button>`
                : ''
            }
          </td>
          <td><b>${item.qty}</b> ${escapeHtml(item.unit)}</td>
          <td><span class="inv-status st-${item.status.toLowerCase()}">${escapeHtml(item.statusLabel)}</span></td>
          <td>${escapeHtml(item.receivedAt)}</td>
          <td>${this._stockActions(item)}</td>
        </tr>`
        )
        .join('');

      this.$.elevationTableWrap.innerHTML = `
        <table class="inv-table">
          <thead>
            <tr>
              <th>Material Number</th>
              <th>Material name</th>
              <th>Batch Number</th>
              <th>Qty &amp; UOM</th>
              <th>Status</th>
              <th>Received at</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      this._bindDocumentButtons(this.$.elevationTableWrap);
      // Reverse Split Lineage lookup: close 2D modal and highlight full lineage on 2.5D Overview
      this.$.elevationTableWrap.querySelectorAll('[data-reverse-batch]').forEach((btn) => {
        btn.onclick = () => {
          const batchNo = btn.dataset.reverseBatch;
          this.closeElevationModal();
          this.executeSearch(batchNo, 'BATCH');
        };
      });
    }

    // ---- PDA Inspection Card (Non-Surveillance: Device ID + Task + Order + Target ONLY) ----

    onPdaSelect(pda) {
      this._noteOverviewClick();
      const targetText = pda.target.rackId
        ? `Rack ${pda.target.rackId} (${pda.target.locatorId || '-'})`
        : `${this.service.zoneMap.get(pda.target.zoneId)?.name || pda.target.zoneId} (${pda.target.locatorId || '-'})`;

      const body = this.root.querySelector('#pda-popover-body');
      if (!body) return;
      body.innerHTML = `
        <div class="pda-card-head">
          <span class="pda-dot cat-${pda.category.toLowerCase()}"></span>
          <strong>${escapeHtml(pda.pdaId)}</strong>
          <span class="pda-cat-tag cat-${pda.category.toLowerCase()}">${escapeHtml(pda.taskLabel)}</span>
        </div>
        <dl class="pda-dl">
          <dt>Order / wave</dt><dd><code>${escapeHtml(pda.orderNo)}</code></dd>
          <dt>Target</dt><dd>${escapeHtml(targetText)}</dd>
        </dl>
        ${
          pda.target.rackId
            ? `<button type="button" class="ghost-btn pda-jump-btn" data-pda-rack="${escapeHtml(
                pda.target.rackId
              )}">Focus rack ${escapeHtml(pda.target.rackId)}</button>`
            : ''
        }
        ${
          window.WMSSpatialLink && window.WMSSpatialLink.documentHashForPda(pda)
            ? `<button type="button" class="primary-btn pda-jump-btn" data-open-doc="${escapeHtml(
                window.WMSSpatialLink.documentHashForPda(pda)
              )}">Open Putaway</button>`
            : ''
        }
      `;
      if (this.$.pdaPopover) this.$.pdaPopover.hidden = false;
      this._bindDocumentButtons(body);
      const jump = body.querySelector('[data-pda-rack]');
      if (jump) {
        jump.onclick = () => {
          const rid = jump.dataset.pdaRack;
          this.renderer.selectRack(rid);
          this.renderer.focusOnRack(rid, { animate: true, zoomRatio: 1.8 });
          this.onRackSelect(rid, { camera: false });
        };
      }
    }

    _followNarrativeCamera(target, opts = {}) {
      if (!target) return;
      if (target.rackId) {
        this.renderer.selectRack(target.rackId);
        this.renderer.focusOnRack(target.rackId, {
          animate: true,
          zoomRatio: opts.zoomRatio ?? 1.8,
          duration: opts.duration ?? 0.9,
        });
        this.onRackSelect(target.rackId, { camera: false });
      } else if (target.zoneId) {
        this.renderer.selectZone(target.zoneId);
        this.renderer.focusOnZone(target.zoneId, {
          animate: true,
          zoomRatio: opts.zoomRatio ?? 1.4,
          duration: opts.duration ?? 0.85,
        });
        this.onZoneSelect(target.zoneId, { camera: false });
      }
    }

    onPdaClusterSelect(group) {
      const first = group[0];
      const place = first.target.rackId
        ? `Rack ${first.target.rackId}`
        : this.service.zoneMap.get(first.target.zoneId)?.name || first.target.zoneId;

      const listHtml = group
        .map(
          (p) => `
        <button type="button" class="cluster-row" data-cluster-pda="${escapeHtml(p.pdaId)}">
          <span class="pda-dot cat-${p.category.toLowerCase()}"></span>
          <b>${escapeHtml(p.pdaId)}</b>
          <span>${escapeHtml(p.taskLabel)}</span>
          <code>${escapeHtml(p.orderNo)}</code>
        </button>`
        )
        .join('');

      const body = this.root.querySelector('#pda-popover-body');
      if (!body) return;
      body.innerHTML = `
        <div class="pda-card-head">
          <strong>${escapeHtml(place)} · ${group.length} active PDAs</strong>
        </div>
        <div class="cluster-list">${listHtml}</div>
      `;
      if (this.$.pdaPopover) this.$.pdaPopover.hidden = false;
      body.querySelectorAll('[data-cluster-pda]').forEach((row) => {
        row.onclick = () => {
          const pda = group.find((p) => p.pdaId === row.dataset.clusterPda);
          if (!pda) return;
          this.renderer.selectPda(pda);
          this.onPdaSelect(pda);
        };
      });
    }

    hidePdaPopover() {
      if (this.$.pdaPopover) this.$.pdaPopover.hidden = true;
      this.renderer.clearPdaFocus();
    }

    // ---- Collapsible Mock Business Simulator Drawer ----

    _bindSimulator() {
      const drawer = this.$.simDrawer;
      const toggle = () => {
        if (drawer) drawer.classList.toggle('is-open');
      };
      this._bind('#sim-toggle-header', 'onclick', toggle);
      this._bind('#sim-toggle-pill', 'onclick', toggle);
      this._bind('#sim-close', 'onclick', () => {
        if (drawer) drawer.classList.remove('is-open');
      });

      this._bind('#sim-inbound', 'onclick', () => {
        this.service.runInboundScenario();
      });
      this._bind('#sim-outbound', 'onclick', () => {
        this.service.runOutboundScenario();
      });
      this._bind('#sim-lineage', 'onclick', () => {
        this.executeSearch('B20261101-01A', 'BATCH');
      });
      this._bind('#sim-fade', 'onclick', () => {
        this.service.runSilentFadeDemo();
      });
      if (this.$.simStressBtn) {
        this.$.simStressBtn.onclick = () => {
          const running = this.service.toggleStressTest();
          this.$.simStressBtn.classList.toggle('is-active', running);
          this.$.simStressBtn.textContent = running ? '⏹ Stop stress test' : '⚡ Stress test (40+ PDAs)';
        };
      }
    }

    renderSimLog() {
      if (!this.$.simLog) return;
      if (this.service.eventLog.length === 0) {
        this.$.simLog.innerHTML = '<div class="muted-text">Use a scenario button above to emit mock WMS incremental events…</div>';
        return;
      }
      this.$.simLog.innerHTML = this.service.eventLog
        .slice(0, 12)
        .map((entry) => `<div class="sim-log-row"><span>${entry.time}</span> ${escapeHtml(entry.text)}</div>`)
        .join('');
    }

    _bindServiceEvents() {
      this.service.subscribeEvents((payload) => {
        this.renderer.syncPdas(this.service.getActivePdas());
        this.renderKpiBar();
        this.renderSimLog();

        if (payload.kind === 'INVENTORY_UPDATE' && payload.rackId) {
          const updated = this.service.getRackSummary(payload.rackId);
          this.renderer.updateRackSummary(updated);
          if (this.openElevationRackId === payload.rackId) {
            this._renderElevationContent(updated);
          }
          if (payload.cameraFollow) {
            this._followNarrativeCamera({ rackId: payload.rackId }, { zoomRatio: 1.95, duration: 0.7 });
          } else if (this.renderer.selectedRackId === payload.rackId) {
            this.onRackSelect(payload.rackId, { camera: false });
          }
        } else if (payload.kind === 'PDA_EVENT') {
          const target = payload.event?.target;
          if (target?.rackId) {
            const updated = this.service.getRackSummary(target.rackId);
            if (updated) this.renderer.updateRackSummary(updated);
          }
          if (payload.cameraFollow && payload.event?.eventType === 'TASK_ACTIVE' && target) {
            this._followNarrativeCamera(target);
          }
        } else if (payload.kind === 'PDA_BATCH_SYNC') {
          this.renderer.updateInventorySnapshot(this.service.getInventorySummarySnapshot());
        }
      });
    }
  }

  WMS.AppController = AppController;
})(window);
