/* On-hand enquiry over the curated spatial subset. WmsMockService owns the seed rows. */
(function (root) {
  'use strict';
  const columns = [
    ['materialNo', 'Material', 140], ['batchNo', 'Batch', 168], ['zone', 'Zone', 220],
    ['locator', 'Locator', 210], ['qty', 'Qty', 100], ['statusLabel', 'Status', 130],
    ['hold', 'Hold', 90], ['warehouse', 'Warehouse', 120], ['receivedDate', 'Received date', 150],
  ].map(([key, label, width]) => ({ key, label, width }));
  const defaults = { operatingUnit: 'MCHK_OU', warehouse: 'WH-01' };
  function enquiryRecords() {
    const curated = root.WMS && root.WMS.CURATED_ON_HAND;
    if (!curated) return [];
    return curated.map((row) => ({
      operatingUnit: 'MCHK_OU',
      warehouse: 'WH-01',
      materialNo: row.materialNo,
      materialName: row.materialName,
      batchNo: row.batchNo,
      zone: row.zoneName ? `${row.zoneId} · ${row.zoneName}` : row.zoneId,
      zoneId: row.zoneId,
      locator: row.locatorId,
      qty: row.qty,
      status: row.status,
      statusLabel: row.status === 'HOLD' ? 'Hold / QC' : row.status === 'ALLOCATED' ? 'Allocated' : 'Available',
      hold: row.status === 'HOLD' ? 'Yes' : 'No',
      receivedDate: String(row.receivedAt || '').slice(0, 10),
    }));
  }
  const ranges = [['receivedFrom', 'receivedTo', 'receivedDate'], ['locatorFrom', 'locatorTo', 'locator'], ['standardDateCodeFrom', 'standardDateCodeTo', 'standardDateCode']];
  const selects = new Set(['operatingUnit', 'warehouse', 'productLine', 'subinventory', 'coo', 'split']);
  const normalize = value => String(value ?? '').trim().toLowerCase();
  const compare = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });

  function validate(filters) {
    for (const [from, to] of ranges) {
      if (filters[from] && filters[to] && compare(filters[from], filters[to]) > 0) {
        return { field: to, message: `${from.startsWith('received') ? 'Received date' : from.startsWith('locator') ? 'Locator' : 'Standard date code'}: the From value must not exceed the To value.` };
      }
    }
    return null;
  }
  function query(filters = {}, columnFilters = {}, sort = null) {
    const rangeFields = new Set(ranges.flatMap(([from, to]) => [from, to]));
    const result = enquiryRecords().filter(record => {
      for (const [key, value] of Object.entries(filters)) {
        if (!normalize(value) || value === 'All' || rangeFields.has(key)) continue;
        if (selects.has(key) ? normalize(record[key]) !== normalize(value) : !normalize(record[key]).includes(normalize(value))) return false;
      }
      for (const [from, to, key] of ranges) {
        if (filters[from] && compare(record[key], filters[from]) < 0) return false;
        if (filters[to] && compare(record[key], filters[to]) > 0) return false;
      }
      for (const [key, value] of Object.entries(columnFilters)) {
        if (!normalize(value) || value === 'All') continue;
        const actual = key === 'receivedDate' ? formatDate(record[key]) : record[key];
        if (key === 'hold' ? actual !== value : !normalize(actual).includes(normalize(value))) return false;
      }
      return true;
    });
    if (sort) result.sort((a, b) => (sort.key === 'qty' ? a.qty - b.qty : compare(a[sort.key], b[sort.key])) * sort.direction);
    return result;
  }
  function formatDate(iso) {
    const [year, month, day] = iso.split('-');
    return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1]} ${year}`;
  }
  function csv(rows, visibleColumns) {
    // Quote every cell; neutralize spreadsheet formulas in textual values.
    const cell = value => {
      let text = String(value ?? '');
      if (/^[=+@\-\t\r]/.test(text) && text !== '—') text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    return '\uFEFF' + [visibleColumns.map(c => cell(c.label)).join(','), ...rows.map(row => visibleColumns.map(c => cell(c.key === 'receivedDate' ? formatDate(row[c.key]) : row[c.key])).join(','))].join('\r\n');
  }
  const api = { get records() { return enquiryRecords(); }, columns, defaults, validate, query, formatDate, csv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WMSData = api;
})(typeof window !== 'undefined' ? window : globalThis);
