/* Offline Inbound pages. Hash paths work when index.html is opened directly. */
(() => {
  'use strict';

  const model = window.WMSInboundData;
  const menu = [
    ['Receiving Job Search', 'jobs'], ['Receipt Details', 'receipts'], ['RMA Search', 'rma'],
    ['Location Preference', 'preferences'], ['Vendor Label Rules', 'labels'], ['Drop Ship', 'drop-ship'],
    ['Import Declaration', 'declarations'], ['PO Return', 'po-returns'], ['SAP Inbound', 'sap-jobs'],
  ];
  const today = '2026-10-27';
  const units = [
    ['ou', 'Operating unit (OU)', 'organizations'], ['io', 'Inventory org (IO)', 'warehouses'],
  ];
  const reference = [['asn', 'ASN'], ['po', 'PO'], ['item', 'MPN']];
  const materialReference = [['asn', 'ASN'], ['po', 'PO'], ['item', 'Material']];
  const status = ['status', 'Status', ['Open', 'Partially uploaded', 'Uploaded', 'Pending', 'Completed', 'Voided']];
  const ruleStatus = ['status', 'Status', ['Active', 'Inactive']];
  const dates = [['from', 'Date from', 'date'], ['to', 'Date to', 'date']];
  const lotColumns = [
    ['number', 'Warehouse lot'], ['supplierLot', 'Supplier lot'], ['dateCode', 'Date code'], ['origin', 'Origin'],
    ['container', 'Container'], ['quantity', 'Qty'], ['status', 'Status'],
  ];
  const options = rows => rows.map(row => [row.id, row.number]);

  function create({ app, h, icon, toast, showInfo, downloadCsv }) {
    let db, filters, current, serial;
    function reset() {
      db = model.fixtures();
      filters = {};
      serial = 100;
    }
    reset();

    const url = (page, id) => `#inbound/${page}${id ? '/' + encodeURIComponent(id) : ''}`;
    const locationFor = value => db.locations.find(location => location.locator === value);
    const subgroup = () => current.name.startsWith('sap-') ? 'sap-' : current.name.startsWith('rma-') ? 'rma-' : '';
    const jobsFor = () => subgroup() === 'sap-' ? db.sapJobs : subgroup() === 'rma-' ? db.rmas : db.jobs;
    const findJob = () => jobsFor().find(job => job.id === current.id || job.putaway === current.id);
    const lotFor = (job, id) => job.lots.find(lot => lot.id === id);
    const newId = prefix => `${prefix}-${++serial}`;

    function link(label, href, style = 'inbound-link') {
      return `<a class="${style}" href="${h(href)}">${h(label)}</a>`;
    }

    function action(label, name, { value = '', primary = false, disabled = false, elevation = false } = {}) {
      const extra = name === 'show-overview' ? ` data-elevation="${elevation ? '1' : '0'}"` : '';
      return `<button type="button" class="${primary ? 'primary-button' : 'light-button'}" data-inbound-action="${name}" data-value="${h(value)}"${extra} ${disabled ? 'disabled' : ''}>${h(label)}</button>`;
    }

    function uniqueLocators(ids) {
      return [...new Set((Array.isArray(ids) ? ids : [ids]).map(id => String(id || '').trim()).filter(id => id && id !== '—'))];
    }

    function showOverview(ids, { elevation = false } = {}) {
      if (subgroup()) return '';
      const list = uniqueLocators(ids);
      if (!list.length) return '';
      const spatial = window.WMSSpatialLink;
      const openElevation = Boolean(elevation && list.length === 1 && spatial && spatial.locatorOpensElevation(list[0]));
      return action('Show in Overview', 'show-overview', { value: list.join(','), elevation: openElevation });
    }

    function currentLocators(job) {
      return uniqueLocators((job.lots || []).map(lot => lot.currentLocator));
    }

    function receivingLocators(job) {
      const fromLots = uniqueLocators((job.lots || []).map(lot => lot.receivingLocator));
      return fromLots.length ? fromLots : uniqueLocators(job.sourceLocator);
    }

    function putawayDestinations(job) {
      return uniqueLocators((job.lots || []).map(lot => lot.target));
    }

    function screen(title, section, content, actions = '') {
      return `<main class="inventory-main inbound-main" data-inbound-title="${h(title)}">
        <div class="inventory-heading"><div><h1>${h(title)}</h1><span class="heading-divider"></span><p>${h(section)}</p></div>
        <div class="inbound-actions">${actions}</div></div>${content}
      </main>`;
    }

    function panel(title, content, symbol = 'document', actions = '') {
      return `<section class="query-panel inbound-panel">
        <div class="panel-title query-title">${icon(symbol)}<h2>${h(title)}</h2>${actions}</div>${content}
      </section>`;
    }

    function badge(value) {
      const tone = ['Active', 'Uploaded', 'Completed', 'Put away', 'Processed', 'Submitted', 'Recommended'].includes(value)
        ? 'positive' : ['Pending', 'Partially uploaded', 'Received', 'Draft'].includes(value) ? 'pending' : 'neutral';
      return `<span class="inbound-badge ${tone}">${h(value)}</span>`;
    }

    function summary(fields) {
      return `<dl class="inbound-summary">${fields.map(([label, value]) =>
        `<div><dt>${h(label)}</dt><dd>${h(value ?? '—')}</dd></div>`).join('')}</dl>`;
    }

    function control(key, type, value, { id, required, min = 1, max } = {}) {
      const attrs = `id="${id || key}" name="${key}"${required ? ' required' : ''}`;
      const items = db[type] || type;
      if (Array.isArray(items)) {
        return `<select ${attrs}><option value="">${required ? 'Select…' : 'All'}</option>${items.map(item => {
          const [option, label] = Array.isArray(item) ? item : [item, item];
          return `<option value="${h(option)}"${String(value) === String(option) ? ' selected' : ''}>${h(label)}</option>`;
        }).join('')}</select>`;
      }
      if (type === 'textarea') return `<textarea ${attrs} rows="2">${h(value)}</textarea>`;
      const limit = max != null ? ` max="${h(max)}"` : '';
      return `<input ${attrs} type="${type || 'text'}" value="${h(value)}"${type === 'number' ? ` min="${min}"${limit} step="1"` : ''}>`;
    }

    function fields(definitions, values, prefix) {
      return `<div class="inbound-fields">${definitions.map(([key, label, type, settings]) => {
        const id = `${prefix}-${key}`;
        return `<div class="query-field"><label for="${id}">${h(label)}</label>${control(key, type, values[key], { ...settings, id })}</div>`;
      }).join('')}</div>`;
    }

    function editor(name, definitions, values = {}, actions = [['Save', 'save']]) {
      return `<form class="inbound-form" data-inbound-form="${name}">${fields(definitions, values, name)}
        <div class="inbound-actions">${actions.map(([label, intent], index) =>
          `<button class="${index === actions.length - 1 ? 'primary-button' : 'outline-button'}" name="intent" value="${intent}">${h(label)}</button>`).join('')}</div>
      </form>`;
    }

    function table(columns, rows, { rowHref, rowAction, empty = 'No matching records.' } = {}) {
      const head = [...columns.map(([, label]) => `<th scope="col">${h(label)}</th>`), rowAction ? '<th scope="col">Action</th>' : ''].join('');
      const body = rows.map(row => {
        const href = rowHref?.(row);
        const cells = columns.map(([key, , cell], index) => {
          const value = row[key];
          const content = cell ? cell(value, row) : index === 0 && href ? link(value, href) : h(value ?? '—');
          return `<td${typeof value === 'number' ? ' class="quantity-cell"' : ''}>${content}</td>`;
        }).join('');
        return `<tr${href ? ` data-inbound-row="${h(href)}"` : ''}>${cells}${rowAction ? `<td>${rowAction(row)}</td>` : ''}</tr>`;
      }).join('');
      return `<div class="table-viewport inbound-table-wrap"><table class="inventory-table inbound-table">
        <thead><tr>${head}</tr></thead><tbody>${body || `<tr><td class="no-results" colspan="${columns.length + Number(Boolean(rowAction))}">${h(empty)}</td></tr>`}</tbody>
      </table></div>`;
    }

    const filterKey = () => `${current.name}/${current.id || ''}`;
    const query = () => filters[filterKey()] ||= { values: {}, page: 1 };
    function matches(row, values, definitions) {
      return definitions.every(([key, , type]) => {
        const value = values[key];
        if (!value) return true;
        if (key === 'from') return row.date >= value;
        if (key === 'to') return row.date <= value;
        if (Array.isArray(db[type] || type)) return row[key] === value;
        return String(row[key] ?? '').toLowerCase().includes(value.toLowerCase());
      });
    }

    function search(definitions, columns, rows, config = {}) {
      const record = query();
      const results = rows.filter(row => matches(row, record.values, definitions));
      const pageSize = 5;
      const pages = Math.max(1, Math.ceil(results.length / pageSize));
      record.page = Math.min(record.page, pages);
      const start = (record.page - 1) * pageSize;
      const form = `<form class="inbound-form" data-inbound-form="search">
        ${fields(definitions, record.values, 'search')}<div class="inbound-actions">
          <button class="primary-button">${icon('search')}Search</button>${action('Clear', 'clear')}
        </div></form>`;
      const toolbar = config.export ? `<div class="inbound-actions inbound-panel-actions">${action('Export', 'export')}</div>` : '';
      const paging = `<div class="inbound-pagination"><span>${results.length ? start + 1 : 0}–${Math.min(start + pageSize, results.length)} of ${results.length}</span>
        ${action('Previous', 'page', { value: record.page - 1, disabled: record.page === 1 })}
        ${action('Next', 'page', { value: record.page + 1, disabled: record.page === pages })}</div>`;
      if (config.export) record.export = { columns, results };
      return panel('QUERY', form, 'filter') + panel(config.title || 'RESULTS',
        (config.before || '') + table(columns, results.slice(start, start + pageSize), config) + paging, 'list', toolbar);
    }

    function receivingSearch(sap) {
      const prefix = sap ? 'sap-' : '';
      const rows = (sap ? db.sapJobs : db.jobs).flatMap(job => {
        const base = { ...job, kind: 'Unload', status: model.unloadStatus(job), href: url(prefix + 'unload', job.id) };
        const received = model.received(job);
        return received.length ? [base, { ...base, id: job.putaway, kind: 'Putaway',
          status: model.pending(job).length ? 'Pending' : 'Completed', href: url(prefix + 'putaway', job.putaway) }] : [base];
      });
      return screen(sap ? 'SAP Receiving Job Search' : 'Receiving Job Search', sap ? 'SAP Inbound' : 'Inbound',
        search([...units, ['kind', 'Task type', ['Unload', 'Putaway']], status, ['id', 'Job ID'], ...(sap ? reference : materialReference), ...dates, ['owner', 'Assigned to']],
          [['id', 'Job ID'], ['kind', 'Task type'], ['status', 'Status', badge], ['ou', 'OU'], ['io', 'IO'], ...(sap ? reference : materialReference), ['expected', 'Expected qty'], ['date', 'Job date'], ['owner', 'Assigned to']],
          rows, {
            rowHref: row => row.href,
            export: true,
            rowAction: sap ? undefined : row => (currentLocators(row).length ? showOverview(currentLocators(row)) : '—'),
          }));
    }

    function tabs(job, view) {
      const prefix = subgroup();
      const rma = prefix === 'rma-';
      const back = url(rma ? 'rma' : prefix + 'jobs');
      const unloadUrl = url(rma ? 'rma-detail' : prefix + 'unload', job.id);
      return `<nav class="inbound-steps" aria-label="Receiving steps">
        ${link('Back to search', back)}
        <a href="${unloadUrl}"${view === 'unload' ? ' aria-current="page"' : ''}>${rma ? 'RMA Detail' : 'Unload'}</a>
        ${model.received(job).length
          ? `<a href="${url(prefix + 'putaway', job.putaway)}"${view === 'putaway' ? ' aria-current="page"' : ''}>Putaway</a>`
          : '<span aria-disabled="true" title="Upload a batch to generate a putaway task">Putaway · Awaiting upload</span>'}
      </nav>`;
    }

    function jobSummary(job, mode) {
      const rma = subgroup() === 'rma-';
      return summary([
        [mode === 'putaway' ? 'Putaway job' : rma ? 'RMA number' : 'Unload job', mode === 'putaway' ? job.putaway : job.id],
        ['Operating unit', job.ou], ['Inventory org', job.io], [rma ? 'Sales order' : 'Purchase order', job.po],
        [rma ? 'Customer' : 'Supplier', job.partner], ['Material', job.item], ['Assigned to', job.owner], ['Job date', job.date],
        ['Expected qty', job.expected], ['Uploaded qty', model.total(model.received(job))],
        ['Draft qty', model.total(model.drafts(job))], ['Put away qty', model.total(model.putAway(job))],
      ]);
    }

    function lotTable(lots, mode, rowAction) {
      const columns = lotColumns.map(column => {
        if (column[0] === 'status') return [...column, badge];
        if (column[0] === 'container') return [...column, (value, lot) => action(value, 'container', { value: lot.id })];
        return column;
      });
      const spatial = lots.some(lot => lot.materialNo || lot.currentLocator || lot.receivingLocator);
      if (spatial && (mode === 'unload' || mode === 'putaway')) {
        columns.unshift(['materialNo', 'Material']);
        columns.push(['currentLocator', 'Current locator']);
      }
      if (spatial && mode === 'unload') columns.push(['receivingLocator', 'Receiving locator']);
      if (mode === 'putaway') columns.push(['sourceLocator', 'Source locator'], ['target', 'Target locator']);
      return table(columns, lots, { rowAction, empty: mode === 'putaway' ? 'No batches available for putaway.' : 'No recorded batches.' });
    }

    function unload(job) {
      const prefix = subgroup();
      const rma = prefix === 'rma-';
      const ready = model.received(job).length > 0;
      const remaining = job.expected - model.total(job.lots);
      const lotDefinitions = [
        ['number', 'Warehouse lot', 'text', { required: true }], ['supplierLot', 'Supplier lot', 'text', { required: true }],
        ['dateCode', 'Date code', 'text', { required: true }], ['origin', 'Country of origin', 'text', { required: true }],
        ['quantity', 'Quantity', 'number', { required: true, max: remaining }], ['container', 'Container (CID)', 'text', { required: true }],
      ];
      const details = rma
        ? action('Use original lot', 'original-lot', { disabled: job.voided || !remaining })
        : action('View source', 'source') + (ready ? link('Receipt details', url('receipts', job.receipt), 'light-button') : '');
      const tools = `<div class="inbound-actions inbound-panel-actions">${details}</div>`;
      const controls = showOverview(receivingLocators(job)) + action('Print', 'print') + (rma
        ? action('Void RMA', 'void', { disabled: job.voided || ready })
        : !prefix && ready ? link('Return to supplier', url('supplier-return', job.id), 'light-button') : '');
      const input = remaining > 0 && !job.voided ? panel(rma ? 'RETURN BATCH' : 'UNLOAD BATCH',
        editor('add-lot', lotDefinitions, {}, [[rma ? 'Save batch' : 'Add batch', 'save']]), 'box') : '';
      const upload = action('Upload', 'upload', { primary: true, disabled: job.voided || !model.drafts(job).length });
      return screen(rma ? 'RMA Detail' : prefix ? 'SAP Receiving Unload' : 'Receiving Unload', rma ? job.id : job.asn,
        tabs(job, 'unload') + panel('JOB SUMMARY', jobSummary(job, 'unload'), 'clipboard', tools) + input +
        panel('RECEIVING RECORDS', lotTable(job.lots, 'unload', lot => {
          const jump = showOverview(lot.receivingLocator || job.sourceLocator);
          const del = lot.status === 'Draft' && !job.voided ? action('Delete', 'delete-lot', { value: lot.id }) : '';
          return jump + del || '—';
        }),
        'list', `<div class="inbound-actions inbound-panel-actions">${badge(model.unloadStatus(job))}${upload}</div>`),
        controls);
    }

    function locationOptions(job) {
      return db.locations.filter(location => location.io === job.io).map(location => location.locator);
    }

    function putaway(job) {
      const prefix = subgroup();
      const pending = model.pending(job);
      const queued = pending.map(lot => ({ ...lot, sourceLocator: lot.receivingLocator || job.sourceLocator, target: lot.target || '—' }));
      const completed = model.putAway(job).map(lot => ({ ...lot, sourceLocator: lot.receivingLocator || job.sourceLocator }));
      const update = editor('update-locator', [
        ['lot', 'Warehouse lot', options(pending), { required: true }],
        ['target', 'Target locator', locationOptions(job), { required: true }],
      ], { lot: pending[0]?.id, target: pending[0]?.target }, [['Update locator', 'save']]);
      const tools = `<div class="inbound-actions inbound-panel-actions">${action('Submit putaway', 'putaway', { primary: true, disabled: !pending.length })}</div>`;
      return screen(prefix === 'rma-' ? 'RMA Putaway' : prefix ? 'SAP Receiving Putaway' : 'Receiving Putaway', job.putaway,
        tabs(job, 'putaway') + panel('JOB SUMMARY', jobSummary(job, 'putaway'), 'clipboard') +
        (pending.length ? panel('TARGET LOCATOR', update, 'pin') : '') +
        panel('PENDING BATCHES', lotTable(queued, 'putaway', lot => showOverview(lot.target, { elevation: true }) || '—'), 'list', tools) +
        panel('PUTAWAY RECORDS', lotTable(completed, 'putaway', lot => showOverview(lot.target, { elevation: true }) || '—'), 'checkClipboard'),
        showOverview(putawayDestinations(job)) + link('Expected Locator', url(prefix + 'locator', job.putaway), 'light-button') + action('Print', 'print'));
    }

    function expectedLocator(job) {
      const pending = model.pending(job);
      const rules = db.preferences.filter(rule => rule.status === 'Active' && rule.ou === job.ou && rule.io === job.io &&
        rule.item.toLowerCase() === job.item.toLowerCase());
      const candidates = db.locations.filter(location => location.io === job.io).map(location => {
        const priority = Math.min(...rules.filter(rule => rule.locator === location.locator).map(rule => rule.priority));
        return { ...location, priority, recommendation: Number.isFinite(priority) ? 'Recommended' : 'Available' };
      }).sort((a, b) => a.priority - b.priority);
      const batch = pending.length ? `<div class="inbound-locator-batch"><label for="inbound-locator-lot">Apply to batch</label>
        ${control('lot', options(pending), pending[0].id, { id: 'inbound-locator-lot', required: true })}</div>` : '';
      const batchJumps = job.lots.filter(lot => lot.target).map(lot =>
        `<div class="inbound-actions"><span>${h(lot.materialNo || lot.number)} · ${h(lot.number)} · ${h(lot.target)}</span>${showOverview(lot.target, { elevation: true })}</div>`
      ).join('');
      return screen(subgroup() === 'sap-' ? 'SAP Expected Locator' : 'Expected Locator', job.putaway,
        panel('PUTAWAY CONTEXT', summary([['Inventory org', job.io], ['Material', job.item],
          ['Pending batches', pending.length], ['Pending qty', model.total(pending)]]) + batchJumps, 'clipboard') +
        search([['subinventory', 'Zone', [...new Set(candidates.map(location => location.subinventory))]], ['locator', 'Locator'], ['zone', 'Zone name']],
          [['locator', 'Locator'], ['subinventory', 'Zone'], ['zone', 'Zone name'], ['free', 'Available qty'], ['recommendation', 'Recommendation', badge]],
          candidates, { title: 'CANDIDATE LOCATORS', before: batch,
            rowAction: row => action('Use locator', 'choose-locator', { value: row.locator, disabled: !pending.length }) }),
        showOverview(putawayDestinations(job)) + link('Back to Putaway', url(subgroup() + 'putaway', job.putaway), 'light-button'));
    }

    function receipts() {
      const rows = [...db.jobs, ...db.sapJobs].filter(job => model.received(job).length).map(job => ({
        ...job, quantity: model.total(model.received(job)),
      }));
      if (!current.id) return screen('Receipt Details', 'Inbound',
        search([...units, ['receipt', 'Receipt number'], ...reference, ...dates],
          [['receipt', 'Receipt number'], ['io', 'IO'], ...reference, ['partner', 'Supplier'], ['quantity', 'Received qty'], ['date', 'Receipt date']],
          rows, { rowHref: row => url('receipts', row.receipt) }));
      const job = rows.find(row => row.receipt === current.id);
      if (!job) return unavailable();
      const prefix = db.sapJobs.some(row => row.id === job.id) ? 'sap-' : '';
      return screen('Receipt Details', job.receipt, panel('RECEIPT SOURCE', summary([
        ['Receipt number', job.receipt], ['ASN', job.asn], ['Purchase order', job.po], ['Supplier', job.partner],
        ['Operating unit', job.ou], ['Inventory org', job.io], ['MPN', job.item], ['Receipt date', job.date],
        ['Received qty', job.quantity], ['Staging locator', job.sourceLocator],
      ]), 'clipboard') + panel('RECEIPT RECORDS', lotTable(model.received(job), 'receipt'), 'list'),
      link('Back to receipts', url('receipts'), 'light-button') + link('Open Unload', url(prefix + 'unload', job.id), 'light-button') + action('Print', 'print'));
    }

    function rmaSearch() {
      const rows = db.rmas.map(job => ({ ...job, status: model.unloadStatus(job) }));
      return screen('RMA Search', 'Inbound', search([...units, ['id', 'RMA number'], ['partner', 'Customer'],
        ['status', 'Status', ['Open', 'Partially uploaded', 'Uploaded', 'Voided']], ['item', 'MPN']],
        [['id', 'RMA number'], ['status', 'Status', badge], ['po', 'Sales order'], ['partner', 'Customer'], ['io', 'IO'], ['item', 'MPN'], ['expected', 'Expected qty'], ['date', 'Return date']],
        rows, { rowHref: job => url('rma-detail', job.id) }));
    }

    function supplierReturn(job) {
      const lines = model.received(job);
      return screen('Return to Supplier', job.po, panel('RECEIVING SOURCE', summary([
        ['Unload job', job.id], ['Receipt number', job.receipt], ['Purchase order', job.po],
        ['Supplier', job.partner], ['MPN', job.item], ['Received qty', model.total(lines)],
      ]), 'clipboard') + panel('SUPPLIER RETURN', editor('supplier-return', [
        ['lot', 'Receipted batch', options(lines), { required: true }], ['quantity', 'Return quantity', 'number', { required: true }],
        ['reason', 'Return reason', 'text', { required: true }],
      ], { lot: lines[0]?.id }, [['Record return', 'save']]), 'box') +
        panel('RETURN RECORDS', table([['id', 'Return ID'], ['lot', 'Warehouse lot'], ['quantity', 'Return qty'], ['reason', 'Reason'], ['status', 'Status', badge]], job.returns), 'list'),
      link('Back to Unload', url('unload', job.id), 'light-button'));
    }

    function rules(vendor) {
      const page = vendor ? 'labels' : 'preferences';
      const title = vendor ? 'Vendor Label Rules' : 'Location Preference';
      const records = db[page];
      const definitions = vendor
        ? [['ou', 'Operating unit (OU)', 'organizations'], ['partner', 'Supplier'], ['name', 'Rule name'], ruleStatus]
        : [...units, ['item', 'MPN'], ['locator', 'Preferred locator'], ruleStatus];
      if (!current.id) {
        const columns = vendor
          ? [['id', 'Rule ID'], ['name', 'Rule name'], ['ou', 'OU'], ['partner', 'Supplier'], ['prefix', 'Label prefix'], ['delimiter', 'Delimiter'], ['status', 'Status', badge]]
          : [['id', 'Preference ID'], ['ou', 'OU'], ['io', 'IO'], ['item', 'MPN'], ['locator', 'Preferred locator'], ['priority', 'Priority'], ['status', 'Status', badge]];
        return screen(title, 'Inbound', search(definitions, columns, records, { rowHref: row => url(page, row.id) }),
          link('Create rule', url(page, 'new'), 'primary-button'));
      }
      const isNew = current.id === 'new';
      const record = isNew ? { ou: db.organizations[0], io: db.warehouses[0], status: 'Active', priority: 1,
        delimiter: '|', itemPosition: 2, lotPosition: 3, datePosition: 4, qtyPosition: 5 } : records.find(row => row.id === current.id);
      if (!record) return unavailable();
      const common = definitions.map(([key, label, type]) => [key, label, type, { required: true }]);
      const ruleFields = vendor ? [
        ...common, ['prefix', 'Label prefix'], ['delimiter', 'Delimiter', 'text', { required: true }],
        ['itemPosition', 'MPN position', 'number', { required: true }], ['lotPosition', 'Supplier lot position', 'number', { required: true }],
        ['datePosition', 'Date code position', 'number', { required: true }], ['qtyPosition', 'Quantity position', 'number', { required: true }],
        ['sample', 'Sample label', 'textarea'],
      ] : [...common.map(field => field[0] === 'locator' ? [field[0], field[1], db.locations.map(location => location.locator), field[3]] : field),
        ['priority', 'Priority', 'number', { required: true }]];
      const actions = vendor ? [['Decode sample', 'decode'], ['Save rule', 'save']] : [['Save rule', 'save']];
      return screen(vendor ? 'Vendor Label Rule' : 'Location Preference Rule', isNew ? 'Create rule' : record.id,
        panel(vendor ? 'LABEL CONDITIONS & FIELD MAPPING' : 'PREFERENCE CONDITIONS', editor(page, ruleFields, record, actions), 'settings'),
        link(vendor ? 'Back to label rules' : 'Back to preferences', url(page), 'light-button'));
    }

    function dropShip() {
      return screen('Drop Ship', 'Inbound',
        panel('DROP SHIP RECEIPT', editor('drop-ship', [...units.map(field => [...field, { required: true }]),
          ...reference.map(field => [...field, 'text', { required: true }]), ['partner', 'Ship-to customer', 'text', { required: true }],
          ['quantity', 'Quantity', 'number', { required: true }], ['date', 'Receipt date', 'date', { required: true }],
        ], { ou: db.organizations[0], io: db.warehouses[0], date: today }, [['Process Drop Ship', 'save']]), 'truck') +
        panel('DROP SHIP RECORDS', table([['id', 'Reference'], ['io', 'IO'], ...reference, ['partner', 'Ship-to customer'],
          ['quantity', 'Qty'], ['date', 'Receipt date'], ['status', 'Status', badge]], db.drops), 'list'));
    }

    function documents(declaration) {
      const page = declaration ? 'declarations' : 'po-returns';
      const records = declaration ? db.declarations : db.poReturns;
      const title = declaration ? 'Import Declaration' : 'PO Return';
      const statusValues = declaration ? ['Draft', 'Submitted'] : ['Draft', 'Processed'];
      const idLabel = declaration ? 'Declaration ID' : 'Return ID';
      const source = declaration ? 'asn' : 'po';
      const sourceLabel = declaration ? 'ASN' : 'Purchase order';
      if (!current.id) return screen(title + ' Search', 'Inbound',
        search([...units, ['id', idLabel], [source, sourceLabel], ['partner', 'Supplier'], ['status', 'Status', statusValues]],
          [['id', idLabel], [source, sourceLabel], ['partner', 'Supplier'], ['io', 'IO'], ['item', 'MPN'], ['quantity', 'Qty'], ['date', 'Date'], ['status', 'Status', badge]],
          records, { rowHref: row => url(page, row.id) }));
      const record = records.find(row => row.id === current.id);
      if (!record) return unavailable();
      const quantity = ['quantity', declaration ? 'Declared quantity' : 'Return quantity', 'number', { required: true, max: record.maximum }];
      const documentFields = declaration
        ? [['invoice', 'Commercial invoice', 'text', { required: true }], ['origin', 'Country of origin', 'text', { required: true }], quantity,
          ['notes', 'Declaration notes', 'textarea']]
        : [quantity, ['reason', 'Return reason', 'textarea', { required: true }]];
      const fieldsInfo = documentFields.map(([key, label]) => [label, record[key]]);
      return screen(title + ' Detail', record.id, panel('SOURCE & STATUS', summary([
        [idLabel, record.id], [sourceLabel, record[source]], ['Supplier', record.partner], ['Operating unit', record.ou],
        ['Inventory org', record.io], ['MPN', record.item], ['Date', record.date], ['Status', record.status],
        ...(declaration ? [] : [['Original receipt', record.receipt], ['Warehouse lot', record.lot], ['Available to return', record.maximum]]),
      ]), 'clipboard') + panel(declaration ? 'DECLARATION DETAILS' : 'RETURN DETAILS', record.status === 'Draft'
        ? editor(page, documentFields, record, [['Save draft', 'save'], [declaration ? 'Submit declaration' : 'Process return', 'submit']])
        : summary(fieldsInfo), 'document'),
      link('Back to search', url(page), 'light-button'));
    }

    function unavailable() {
      return screen('Inbound page unavailable', 'Inbound', panel('RETURN TO SEARCH', '<p class="inbound-message">The requested page or record is unavailable in this demo.</p>'),
        link('Receiving Job Search', url('jobs'), 'light-button'));
    }

    function render(path) {
      const [, name = 'jobs', id = '', ...extra] = path.split('/');
      current = { name: name || 'jobs', id };
      if (extra.length) return unavailable();
      switch (current.name) {
        case 'jobs': return receivingSearch(false);
        case 'sap-jobs': return receivingSearch(true);
        case 'receipts': return receipts();
        case 'rma': return rmaSearch();
        case 'preferences': return rules(false);
        case 'labels': return rules(true);
        case 'drop-ship': return dropShip();
        case 'declarations': return documents(true);
        case 'po-returns': return documents(false);
        default: {
          const job = findJob();
          if (!job) return unavailable();
          if (['unload', 'sap-unload', 'rma-detail'].includes(current.name)) return unload(job);
          if (!model.received(job).length) return unavailable();
          if (['putaway', 'sap-putaway', 'rma-putaway'].includes(current.name)) return putaway(job);
          if (['locator', 'sap-locator', 'rma-locator'].includes(current.name)) return expectedLocator(job);
          if (current.name === 'supplier-return') return supplierReturn(job);
          return unavailable();
        }
      }
    }

    function refresh(message) {
      app.querySelector('.inbound-main').outerHTML = render(location.hash.slice(1));
      if (message) toast(message);
    }

    function complete(error, message) {
      if (error) toast(error);
      else refresh(message);
    }

    function setLocator(job, lotId, target) {
      const lot = lotFor(job, lotId);
      const location = locationFor(target);
      if (!lot || lot.status !== 'Received') return 'Select a batch waiting for putaway.';
      if (location?.io !== job.io) return 'Select a locator in the job’s inventory organization.';
      lot.target = target;
      return '';
    }

    function ruleSubmit(page, values, intent) {
      if (page === 'preferences') {
        if (locationFor(values.locator)?.io !== values.io) return toast('Select a locator in the rule’s inventory organization.');
        values.priority = Number(values.priority);
      } else {
        const keys = ['itemPosition', 'lotPosition', 'datePosition', 'qtyPosition'];
        keys.forEach(key => { values[key] = Number(values[key]); });
        const components = values.sample.split(values.delimiter);
        if (new Set(keys.map(key => values[key])).size !== keys.length) return toast('Each field needs a different label position.');
        if (intent === 'decode') {
          if (values.prefix && components[0] !== values.prefix) return toast('The sample does not match the configured prefix.');
          if (keys.some(key => !components[values[key] - 1])) return toast('Enter a sample label containing all configured positions.');
          return showInfo('Decoded label', ['MPN', 'Supplier lot', 'Date code', 'Quantity']
            .map((label, index) => `${label}: ${components[values[keys[index]] - 1]}`).join('\n'));
        }
      }
      const record = db[page].find(row => row.id === current.id);
      if (record) Object.assign(record, values);
      else db[page].push({ id: newId(page === 'labels' ? 'VL' : 'LP'), ...values });
      location.hash = url(page);
      toast('Rule saved.');
    }

    function submit(event) {
      const form = event.target;
      const name = form.dataset.inboundForm;
      const values = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
      const intent = event.submitter?.value || 'save';
      if ([...form.elements].some(field => field.required && !values[field.name])) return toast('Complete the required fields.');
      if ([...form.elements].some(field => field.type === 'number' && !Number.isSafeInteger(Number(values[field.name])))) {
        return toast('Enter a whole number within the supported range.');
      }
      if (name === 'search') {
        if (values.from && values.to && values.from > values.to) return toast('Date from must be on or before Date to.');
        filters[filterKey()] = { values, page: 1 };
        return refresh();
      }
      if (name === 'preferences' || name === 'labels') return ruleSubmit(name, values, intent);
      if (name === 'drop-ship') {
        db.drops.unshift({ id: newId('DS'), ...values, quantity: Number(values.quantity), status: 'Processed' });
        return refresh('Drop Ship receipt processed.');
      }
      if (name === 'declarations' || name === 'po-returns') {
        const isDeclaration = name === 'declarations';
        const record = (isDeclaration ? db.declarations : db.poReturns).find(row => row.id === current.id);
        if (!record || record.status !== 'Draft') return;
        const quantity = Number(values.quantity);
        if (record.maximum && quantity > record.maximum) return toast('Quantity exceeds the amount available to return.');
        const status = intent === 'submit' ? isDeclaration ? 'Submitted' : 'Processed' : 'Draft';
        Object.assign(record, { ...values, quantity, status });
        return refresh(status === 'Draft' ? 'Draft saved.' : isDeclaration ? 'Declaration submitted.' : 'PO return processed.');
      }
      const job = findJob();
      if (!job) return;
      if (name === 'add-lot') return complete(model.addLot(job, { ...values, id: newId('lot'), quantity: Number(values.quantity) }), 'Batch saved as draft.');
      if (name === 'update-locator') return complete(setLocator(job, values.lot, values.target), 'Target locator updated.');
      if (name === 'supplier-return') {
        const lot = lotFor(job, values.lot);
        if (!lot || lot.status === 'Draft') return toast('Select a received batch.');
        const returned = model.total(job.returns.filter(row => row.lotId === lot.id));
        const quantity = Number(values.quantity);
        if (quantity > lot.quantity - returned) return toast('Quantity exceeds the available amount for this batch.');
        job.returns.unshift({ id: newId('SR'), lotId: lot.id, lot: lot.number, quantity, reason: values.reason, status: 'Processed' });
        return refresh('Supplier return recorded.');
      }
    }

    function click(button) {
      const name = button.dataset.inboundAction;
      const value = button.dataset.value;
      if (name === 'clear') {
        delete filters[filterKey()];
        return refresh();
      }
      if (name === 'page') {
        query().page = Number(value);
        return refresh();
      }
      if (name === 'export') {
        const { columns, results } = query().export;
        downloadCsv(results, columns.map(([key, label]) => ({ key, label })), 'WMS-Receiving-Jobs.csv');
        return toast(`Exported ${results.length} records.`);
      }
      if (name === 'print') return window.print();
      if (name === 'show-overview') {
        const spatial = window.WMSSpatialLink;
        const ids = String(value || '').split(',').map(id => id.trim()).filter(Boolean);
        if (!spatial || !ids.length) return;
        location.hash = spatial.buildHomeFocus({
          focus: ids.map(id => ({ kind: 'locator', id })),
          openElevation: button.dataset.elevation === '1',
          returnHash: location.hash,
        }).slice(1);
        return;
      }
      const job = current.name === 'receipts'
        ? [...db.jobs, ...db.sapJobs].find(row => row.receipt === current.id) : findJob();
      if (!job) return;
      switch (name) {
        case 'upload': return complete(model.upload(job), 'Batches uploaded. Putaway is available.');
        case 'putaway': return complete(model.submitPutaway(job), 'Pending batches put away.');
        case 'delete-lot': {
          const lot = lotFor(job, value);
          if (lot?.status !== 'Draft' || job.voided) return;
          job.lots = job.lots.filter(row => row !== lot);
          return refresh('Draft batch deleted.');
        }
        case 'void':
          if (model.received(job).length || job.voided) return;
          job.voided = true;
          return refresh('RMA voided.');
        case 'source':
          return showInfo('Receiving source', `${job.asn} · ${job.po}\n${job.partner} · ${job.item}\n${job.expected} units · ${job.io}`);
        case 'container': {
          const lot = lotFor(job, value);
          if (lot) return showInfo(lot.container, `${lot.number} · ${lot.supplierLot}\n${lot.quantity} units · ${lot.status}\n${lot.target || job.sourceLocator}`);
          return;
        }
        case 'original-lot': {
          const form = app.querySelector('[data-inbound-form="add-lot"]');
          if (!form) return;
          Object.entries(job.original).forEach(([key, data]) => { form.elements[key].value = data; });
          return toast('Original lot attributes copied.');
        }
        case 'choose-locator': {
          const error = setLocator(job, app.querySelector('#inbound-locator-lot')?.value, value);
          if (error) return toast(error);
          location.hash = url(subgroup() + 'putaway', job.putaway);
          return toast('Target locator applied.');
        }
      }
    }

    return { render, reset, submit, click };
  }

  window.WMSInbound = { menu, create };
})();
