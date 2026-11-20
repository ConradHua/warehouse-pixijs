/* Pure hash linkage between business screens and the Warehouse Overview. */
(function (root) {
  'use strict';

  const FOCUS_KINDS = { locator: true, zone: true, rack: true };
  const RACK_LOCATOR = /^[A-Z]-\d{2}-B\d+-L\d+$/;
  const HERO_PUTAWAY = '#inbound/putaway/PA-2604271';

  function locatorOpensElevation(locatorId) {
    return RACK_LOCATOR.test(String(locatorId || ''));
  }

  function parseFocusTokens(value) {
    if (!value) return [];
    const focus = [];
    String(value).split(',').forEach((part) => {
      const token = part.trim();
      const sep = token.indexOf(':');
      if (sep <= 0) return;
      const kind = token.slice(0, sep);
      const id = token.slice(sep + 1).trim();
      if (!id || !FOCUS_KINDS[kind]) return;
      focus.push({ kind, id });
    });
    return focus;
  }

  function parseHomeFocus(hash) {
    const raw = String(hash || '');
    const queryAt = raw.indexOf('?');
    if (queryAt === -1) return { focus: [], openElevation: false, returnHash: null };
    const params = new URLSearchParams(raw.slice(queryAt + 1));
    let returnHash = params.get('return');
    if (returnHash && returnHash.charAt(0) !== '#') returnHash = `#${returnHash}`;
    return {
      focus: parseFocusTokens(params.get('focus')),
      openElevation: params.get('openElevation') === '1',
      returnHash: returnHash || null,
    };
  }

  function buildHomeFocus({ focus = [], openElevation = false, returnHash = null } = {}) {
    const tokens = focus.filter((token) => token && FOCUS_KINDS[token.kind] && token.id);
    const parts = [`focus=${tokens.map((token) => `${token.kind}:${token.id}`).join(',')}`];
    const singleRack = tokens.length === 1
      && tokens[0].kind === 'locator'
      && locatorOpensElevation(tokens[0].id);
    if (openElevation && singleRack) parts.push('openElevation=1');
    if (returnHash) parts.push(`return=${encodeURIComponent(returnHash)}`);
    return `#home?${parts.join('&')}`;
  }

  function planOverviewFocus(parsed) {
    const focus = parsed && parsed.focus ? parsed.focus : [];
    const single = focus.length === 1 ? focus[0] : null;
    const openElevation = Boolean(
      parsed && parsed.openElevation
      && single
      && single.kind === 'locator'
      && locatorOpensElevation(single.id)
    );
    return {
      focus,
      openElevation,
      elevationLocatorId: openElevation ? single.id : null,
      frame: focus.length > 1 ? 'all' : 'single',
    };
  }

  function parseInventoryQuery(hash) {
    const raw = String(hash || '');
    const queryAt = raw.indexOf('?');
    const params = queryAt === -1 ? new URLSearchParams() : new URLSearchParams(raw.slice(queryAt + 1));
    return {
      materialNo: params.get('materialNo') || '',
      batchNo: params.get('batchNo') || '',
      locator: params.get('locator') || '',
    };
  }

  function buildInventoryQuery({ materialNo = '', batchNo = '', locator = '' } = {}) {
    const params = new URLSearchParams();
    if (materialNo) params.set('materialNo', materialNo);
    if (batchNo) params.set('batchNo', batchNo);
    if (locator) params.set('locator', locator);
    const query = params.toString();
    return query ? `#inventory?${query}` : '#inventory';
  }

  function documentHashForPda(pda) {
    if (!pda || pda.pdaId !== 'PDA-005' || pda.taskType !== 'PUTAWAY') return null;
    return HERO_PUTAWAY;
  }

  function nextReturnHash(current, event) {
    if (!current) return null;
    if (event === 'use-return' || event === 'open-document') return null;
    return current;
  }

  function returnChipLabel(hash) {
    const path = String(hash || '').replace(/^#/, '').split('?')[0];
    if (path === 'inventory' || path.startsWith('inventory/')) return 'Back to On-hand';
    if (path.includes('/putaway/')) return 'Back to Putaway';
    if (path.includes('/unload/') || path.includes('/rma-detail/')) return 'Back to Unload';
    if (path.includes('/locator/')) return 'Back to Expected Locator';
    if (path === 'inbound/jobs' || path.startsWith('inbound/jobs/')) return 'Back to Receiving jobs';
    if (path.startsWith('inbound')) return 'Back to Inbound';
    return 'Back';
  }

  function receivingJobHash({ currentZoneId, receivingJobId } = {}) {
    if (currentZoneId !== 'Z-RCV' || !receivingJobId) return null;
    return `#inbound/unload/${receivingJobId}`;
  }

  const api = {
    locatorOpensElevation,
    parseHomeFocus,
    buildHomeFocus,
    planOverviewFocus,
    parseInventoryQuery,
    buildInventoryQuery,
    documentHashForPda,
    nextReturnHash,
    returnChipLabel,
    receivingJobHash,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WMSSpatialLink = api;
})(typeof window !== 'undefined' ? window : globalThis);
