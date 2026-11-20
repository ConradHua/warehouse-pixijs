/* Inbound fixtures and workflow shared by the offline demo and its checks. */
(() => {
  'use strict';

  function fixtures() {
    const organizations = ['MCHK_OU', 'MCSG_OU'];
    const warehouses = ['HKW', 'SGW', 'WH-01'];
    const locations = [
      { locator: 'Z-RCV-01', io: 'WH-01', subinventory: 'Z-RCV', zone: 'Receiving staging', free: 400 },
      { locator: 'Z-RCV-02', io: 'WH-01', subinventory: 'Z-RCV', zone: 'Receiving staging', free: 400 },
      { locator: 'Z-RCV-03', io: 'WH-01', subinventory: 'Z-RCV', zone: 'Receiving staging', free: 400 },
      { locator: 'Z-FLOOR-01', io: 'WH-01', subinventory: 'Z-FLOOR', zone: 'Floor stacking', free: 200 },
      { locator: 'A-04-B2-L1', io: 'WH-01', subinventory: 'Z-HIGHBAY', zone: 'High-bay heavy storage', free: 1 },
      { locator: 'A-05-B1-L1', io: 'WH-01', subinventory: 'Z-HIGHBAY', zone: 'High-bay heavy storage', free: 0 },
      { locator: 'A-06-B1-L2', io: 'WH-01', subinventory: 'Z-HIGHBAY', zone: 'High-bay heavy storage', free: 1 },
      { locator: 'C-04-B1-L1', io: 'WH-01', subinventory: 'Z-HIGHBAY', zone: 'High-bay heavy storage', free: 1 },
      { locator: 'C-05-B1-L2', io: 'WH-01', subinventory: 'Z-HIGHBAY', zone: 'High-bay heavy storage', free: 1 },
      { locator: 'GS.A07.7.B10', io: 'HKW', subinventory: 'YKK-JB', zone: 'General storage', free: 360 },
      { locator: 'GS.A08.2.C04', io: 'HKW', subinventory: 'YKK-JB', zone: 'General storage', free: 220 },
      { locator: 'ESD.B02.1.A03', io: 'HKW', subinventory: 'YKK-ESD', zone: 'ESD controlled', free: 600 },
      { locator: 'QA.C01.1.B01', io: 'HKW', subinventory: 'YKK-QA', zone: 'Quality inspection', free: 120 },
      { locator: 'SG.A02.1.B03', io: 'SGW', subinventory: 'SG-MAIN', zone: 'General storage', free: 480 },
      { locator: 'SG.Q01.1.A01', io: 'SGW', subinventory: 'SG-QA', zone: 'Quality inspection', free: 90 },
    ];

    function lot(id, number, supplierLot, dateCode, quantity, container, status, target = '', origin = 'TW', spatial = {}) {
      return {
        id, number, supplierLot, dateCode, quantity, container, status, target, origin,
        materialNo: spatial.materialNo || '',
        currentLocator: spatial.currentLocator || '',
        receivingLocator: spatial.receivingLocator || '',
      };
    }

    function job(ref, fields) {
      const { lots = [], ...details } = fields;
      return {
        id: `RCV-${ref}`, putaway: `PA-${ref}`, receipt: `GR-${ref}`,
        ou: 'MCHK_OU', io: 'HKW', sourceLocator: 'STAGING.HK.01', owner: 'CONRADHUA',
        date: '2026-10-27', returns: [], lots, ...details,
      };
    }

    const jobs = [
      job('2604271', { asn: 'ASN2604271', po: 'PO2601801', partner: 'Altera', item: 'MAT-2041 / MAT-3118', expected: 42,
        io: 'WH-01', sourceLocator: 'Z-RCV-01', returns: [],
        lots: [
        lot('lot-1', 'B20261119-R01', 'MJ24-115', '2608', 30, 'CID-HK-4101', 'Received', 'A-04-B2-L1', 'TW', {
          materialNo: 'MAT-2041', currentLocator: 'Z-RCV-01', receivingLocator: 'Z-RCV-01',
        }),
        lot('lot-2', 'B20261119-R04', 'MJ24-118', '2608', 12, 'CID-HK-4104', 'Put away', 'A-05-B1-L1', 'TW', {
          materialNo: 'MAT-3118', currentLocator: 'A-05-B1-L1', receivingLocator: 'Z-RCV-01',
        }),
      ] }),
      job('2604272', { asn: 'ASN2604272', po: 'PO2601807', partner: 'Texas Instruments', item: 'MAT-5012', expected: 200, owner: 'AMYLEE', io: 'WH-01', sourceLocator: 'Z-RCV-02', lots: [
        lot('lot-3', 'B20261118-T02', 'TX-58220', '2612', 200, 'CID-HK-4103', 'Draft', '', 'MY', {
          materialNo: 'MAT-5012', currentLocator: '', receivingLocator: 'Z-RCV-02',
        }),
      ] }),
      job('2604263', { asn: 'ASN2604263', po: 'PO2601794', partner: 'Murata', item: 'MAT-7155', expected: 24, date: '2026-10-26', owner: 'AMYLEE', io: 'WH-01', sourceLocator: 'Z-RCV-03', lots: [
        lot('lot-4', 'B20261026-M04', 'MU-36102', '2605', 24, 'CID-HK-4086', 'Put away', 'A-06-B1-L2', 'JP', {
          materialNo: 'MAT-7155', currentLocator: 'A-06-B1-L2', receivingLocator: 'Z-RCV-03',
        }),
      ] }),
      job('2604264', { asn: 'ASN2604264', po: 'PO2601775', partner: 'Analog Devices', item: 'MAT-6304', expected: 16, date: '2026-10-26', owner: 'JASONLIM', ou: 'MCSG_OU', io: 'WH-01', sourceLocator: 'Z-FLOOR-01', lots: [
        lot('lot-5', 'B20261026-A05', 'AD-503811', '2610', 16, 'CID-SG-2034', 'Received', 'C-05-B1-L2', 'PH', {
          materialNo: 'MAT-6304', currentLocator: 'Z-FLOOR-01', receivingLocator: 'Z-FLOOR-01',
        }),
      ] }),
      job('2604255', { asn: 'ASN2604255', po: 'PO2601759', partner: 'Nexperia', item: 'MAT-4820', expected: 120, date: '2026-10-25', io: 'WH-01', sourceLocator: 'Z-RCV-02' }),
    ];

    const rmas = [
      job('260301', { id: 'RMA-260301', putaway: 'RPA-260301', po: 'SO2607701', partner: 'Harbour Electronics', item: 'EPM240T100C5N', expected: 40,
        original: { supplierLot: 'MJ24-088', dateCode: '2602', origin: 'TW' },
        lots: [lot('lot-6', 'RT-260301-01', 'MJ24-088', '2602', 20, 'CID-HK-R301', 'Received')] }),
      job('260302', { id: 'RMA-260302', putaway: 'RPA-260302', po: 'SO2607756', partner: 'Pacific Controls', item: 'TPS54202DDCR', expected: 25, owner: 'AMYLEE',
        original: { supplierLot: 'TX-50771', dateCode: '2604', origin: 'MY' },
        lots: [lot('lot-7', 'RT-260302-01', 'TX-50771', '2604', 10, 'CID-HK-R302', 'Draft', '', 'MY')] }),
      job('260296', { id: 'RMA-260296', putaway: 'RPA-260296', po: 'SO2607658', partner: 'Lion City Components', item: 'ADP7118AUJZ-3.3', expected: 12, date: '2026-10-24', ou: 'MCSG_OU', io: 'SGW', sourceLocator: 'STAGING.SG.01', owner: 'JASONLIM',
        original: { supplierLot: 'AD-500392', dateCode: '2601', origin: 'PH' },
        lots: [lot('lot-8', 'RT-260296-01', 'AD-500392', '2601', 12, 'CID-SG-R296', 'Put away', 'SG.Q01.1.A01', 'PH')] }),
    ];

    const sapJobs = [
      job('SAP5101', { asn: 'SAP-IBD-18005101', po: '4500017083', partner: 'Infineon', item: 'BTS50015-1TAD', expected: 240, lots: [
        lot('lot-9', 'SAP-LT-5101', 'IFX-260912', '2611', 120, 'CID-SAP-5101', 'Received', '', 'DE'),
      ] }),
      job('SAP5102', { asn: 'SAP-IBD-18005102', po: '4500017107', partner: 'STMicroelectronics', item: 'STM32G031K8T6', expected: 300, date: '2026-10-26', owner: 'AMYLEE', lots: [
        lot('lot-10', 'SAP-LT-5102', 'STM-261010', '2610', 90, 'CID-SAP-5102', 'Draft', '', 'MY'),
      ] }),
    ];

    const preferences = [
      { id: 'LP-001', ou: 'MCHK_OU', io: 'HKW', item: 'EPM240T100C5N', locator: 'GS.A07.7.B10', priority: 1, status: 'Active' },
      { id: 'LP-002', ou: 'MCHK_OU', io: 'HKW', item: 'TPS54202DDCR', locator: 'ESD.B02.1.A03', priority: 2, status: 'Active' },
      { id: 'LP-003', ou: 'MCSG_OU', io: 'SGW', item: 'ADP7118AUJZ-3.3', locator: 'SG.A02.1.B03', priority: 1, status: 'Inactive' },
    ];

    const labels = [
      { id: 'VL-001', ou: 'MCHK_OU', partner: 'Altera', name: 'Altera inbound label', prefix: 'ALT', delimiter: '|', itemPosition: 2, lotPosition: 3, datePosition: 4, qtyPosition: 5, sample: 'ALT|EPM240T100C5N|MJ24-115|2608|150', status: 'Active' },
      { id: 'VL-002', ou: 'MCHK_OU', partner: 'Texas Instruments', name: 'TI reel label', prefix: 'TI', delimiter: ';', itemPosition: 2, lotPosition: 4, datePosition: 5, qtyPosition: 3, sample: 'TI;TPS54202DDCR;200;TX-58220;2612', status: 'Active' },
      { id: 'VL-003', ou: 'MCSG_OU', partner: 'Analog Devices', name: 'ADI packing label', prefix: 'ADI', delimiter: '/', itemPosition: 2, lotPosition: 3, datePosition: 4, qtyPosition: 5, sample: 'ADI/ADP7118AUJZ-3.3/AD-503811/2610/160', status: 'Inactive' },
    ];

    const drops = [
      { id: 'DS-260041', ou: 'MCHK_OU', io: 'HKW', po: 'PO2601751', asn: 'ASN-DS-0041', item: 'TPS54202DDCR', partner: 'Harbour Electronics', quantity: 75, date: '2026-10-27', status: 'Processed' },
      { id: 'DS-260040', ou: 'MCSG_OU', io: 'SGW', po: 'PO2601748', asn: 'ASN-DS-0040', item: 'ADP7118AUJZ-3.3', partner: 'Lion City Components', quantity: 30, date: '2026-10-26', status: 'Processed' },
    ];

    const declarations = [
      { id: 'DEC-260015', ou: 'MCHK_OU', io: 'HKW', asn: 'ASN2604271', partner: 'Altera', origin: 'TW', invoice: 'INV-261126', item: 'EPM240T100C5N', quantity: 250, date: '2026-10-27', status: 'Draft', notes: 'Commercial invoice received.' },
      { id: 'DEC-260014', ou: 'MCSG_OU', io: 'SGW', asn: 'ASN2604264', partner: 'Analog Devices', origin: 'PH', invoice: 'INV-261095', item: 'ADP7118AUJZ-3.3', quantity: 160, date: '2026-10-26', status: 'Submitted', notes: 'Shipment documents verified.' },
    ];

    const poReturns = [
      { id: 'PR-260023', ou: 'MCHK_OU', io: 'HKW', po: 'PO2601740', receipt: 'GR-2604208', partner: 'Murata', item: 'GRM188R71C104KA01D', lot: 'LT-260420-04', quantity: 20, maximum: 80, reason: 'Outer packaging damaged', date: '2026-10-27', status: 'Draft' },
      { id: 'PR-260022', ou: 'MCSG_OU', io: 'SGW', po: 'PO2601712', receipt: 'GR-2604194', partner: 'Analog Devices', item: 'ADP7118AUJZ-3.3', lot: 'LT-260419-01', quantity: 12, maximum: 50, reason: 'Incorrect date code', date: '2026-10-24', status: 'Processed' },
    ];

    return { organizations, warehouses, locations, jobs, rmas, sapJobs, preferences, labels, drops, declarations, poReturns };
  }

  const total = (lots) => lots.reduce((sum, lot) => sum + lot.quantity, 0);
  const drafts = (job) => job.lots.filter(lot => lot.status === 'Draft');
  const received = (job) => job.lots.filter(lot => lot.status !== 'Draft');
  const pending = (job) => job.lots.filter(lot => lot.status === 'Received');
  const putAway = (job) => job.lots.filter(lot => lot.status === 'Put away');

  function unloadStatus(job) {
    if (job.voided) return 'Voided';
    const quantity = total(received(job));
    if (quantity === job.expected) return 'Uploaded';
    return quantity ? 'Partially uploaded' : 'Open';
  }

  function addLot(job, lot) {
    if (job.voided) return 'This receipt has been voided.';
    if (!Number.isSafeInteger(lot.quantity) || lot.quantity < 1) return 'Enter a whole quantity greater than zero.';
    if (lot.quantity > job.expected - total(job.lots)) return 'Quantity exceeds the remaining amount to receive.';
    job.lots.push({ ...lot, status: 'Draft', target: '' });
    return '';
  }

  function upload(job) {
    const lines = drafts(job);
    if (job.voided || !lines.length) return 'Add a draft batch before uploading.';
    lines.forEach(lot => { lot.status = 'Received'; });
    return '';
  }

  function submitPutaway(job) {
    const lines = pending(job);
    if (!lines.length) return 'There are no batches waiting for putaway.';
    if (lines.some(lot => !lot.target)) return 'Assign a target locator to each pending batch before submitting.';
    lines.forEach(lot => { lot.status = 'Put away'; });
    return '';
  }

  const api = { fixtures, total, drafts, received, pending, putAway, unloadStatus, addLot, upload, submitPutaway };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.WMSInboundData = api;
})();
