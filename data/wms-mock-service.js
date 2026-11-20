(function (global) {
  'use strict';
  const WMS = (global.WMS = global.WMS || {});

  const MATERIALS = [
    { materialNo: 'MAT-8801', materialName: 'Precision servo motor assembly', unit: 'PCS' },
    { materialNo: 'MAT-4205', materialName: 'Industrial photoelectric sensor', unit: 'PCS' },
    { materialNo: 'MAT-1090', materialName: 'Stainless flange DN80', unit: 'SET' },
    { materialNo: 'MAT-2041', materialName: 'VFD control board V3', unit: 'PCS' },
    { materialNo: 'MAT-3118', materialName: 'High-precision linear rail 1200mm', unit: 'BAR' },
    { materialNo: 'MAT-5012', materialName: 'Pneumatic proportional valve', unit: 'PCS' },
    { materialNo: 'MAT-6304', materialName: 'Li-ion module heat sink housing', unit: 'BOX' },
    { materialNo: 'MAT-7155', materialName: 'Industrial Ethernet switch module', unit: 'PCS' },
    { materialNo: 'MAT-9022', materialName: 'Heavy-duty polyurethane caster kit', unit: 'SET' },
    { materialNo: 'MAT-3409', materialName: 'Shielded servo power harness 5m', unit: 'ROLL' },
    { materialNo: 'MAT-4820', materialName: 'High-temp silicone seal kit', unit: 'BAG' },
    { materialNo: 'MAT-6190', materialName: 'Aluminum profile corner brackets', unit: 'BOX' },
  ];

  const TASK_LABELS = {
    RECEIVING: 'Receiving / unload',
    PUTAWAY: 'Putaway',
    PICKING: 'Picking',
    PACKING: 'Packing / check',
    SHIPPING: 'Shipping / load',
    TRANSFER: 'In-warehouse transfer',
    CYCLE_COUNT: 'Cycle count',
  };

  const STATUS_LABELS = {
    AVAILABLE: 'Available',
    ALLOCATED: 'Allocated',
    HOLD: 'Hold / QC',
  };

  const ZONE_NAMES = {
    'Z-RCV': 'Receiving staging',
    'Z-HIGHBAY': 'High-bay heavy storage',
    'Z-FLOW': 'Light flow storage',
    'Z-FLOOR': 'Floor stacking',
    'Z-PACK': 'Packing / check',
    'Z-SHIP': 'Shipping staging',
  };

  function curatedRow(fields) {
    const mat = MATERIALS.find((item) => item.materialNo === fields.materialNo);
    return {
      materialName: mat.materialName,
      unit: mat.unit,
      warehouse: 'WH-01',
      zoneName: ZONE_NAMES[fields.zoneId] || fields.zoneId,
      rackId: null,
      receivingJobId: null,
      putawayId: null,
      currentLocatorId: fields.locatorId,
      receivingLocatorId: null,
      putawayDestinationId: null,
      ...fields,
    };
  }

  // Curated On-hand projection. The hero rows are the frozen inbound snapshot.
  const CURATED_ON_HAND = [
    curatedRow({
      materialNo: 'MAT-2041', batchNo: 'B20261119-R01', locatorId: 'Z-RCV-01', zoneId: 'Z-RCV',
      qty: 30, status: 'AVAILABLE', receivedAt: '2026-11-19 09:15',
      currentLocatorId: 'Z-RCV-01', receivingLocatorId: 'Z-RCV-01', putawayDestinationId: 'A-04-B2-L1',
      receivingJobId: 'RCV-2604271', putawayId: 'PA-2604271',
    }),
    curatedRow({
      materialNo: 'MAT-3118', batchNo: 'B20261119-R04', locatorId: 'A-05-B1-L1', zoneId: 'Z-HIGHBAY', rackId: 'A-05',
      qty: 12, status: 'AVAILABLE', receivedAt: '2026-11-19 09:15',
      currentLocatorId: 'A-05-B1-L1', receivingLocatorId: 'Z-RCV-01', putawayDestinationId: 'A-05-B1-L1',
      receivingJobId: 'RCV-2604271', putawayId: 'PA-2604271',
    }),
    curatedRow({
      materialNo: 'MAT-5012', batchNo: 'B20261119-R02', locatorId: 'Z-RCV-02', zoneId: 'Z-RCV',
      qty: 18, status: 'HOLD', receivedAt: '2026-11-19 09:15',
    }),
    curatedRow({
      materialNo: 'MAT-7155', batchNo: 'B20261119-R03', locatorId: 'Z-RCV-03', zoneId: 'Z-RCV',
      qty: 24, status: 'AVAILABLE', receivedAt: '2026-11-19 09:15',
    }),
    curatedRow({
      materialNo: 'MAT-9022', batchNo: 'B20261110-F01', locatorId: 'Z-FLOOR-01', zoneId: 'Z-FLOOR',
      qty: 12, status: 'AVAILABLE', receivedAt: '2026-11-10 09:15',
    }),
    curatedRow({
      materialNo: 'MAT-8801', batchNo: 'B20261101-01', locatorId: 'B-04-B2-L2', zoneId: 'Z-HIGHBAY', rackId: 'B-04',
      qty: 18, status: 'AVAILABLE', receivedAt: '2026-11-01 09:20',
    }),
  ];

  function createRng(seed) {
    let s = seed >>> 0;
    return function next() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  class WmsMockService {
    constructor(layout) {
      this.layout = layout;
      this.rng = createRng(20261119);
      this.listeners = new Set();
      this.eventLog = [];
      this.scenarioTimers = [];
      this.stressInterval = null;
      this.stressActive = false;

      // Indexed structures
      this.rackMap = new Map(layout.racks.map((r) => [r.rackId, r]));
      this.zoneMap = new Map(layout.zones.map((z) => [z.zoneId, z]));
      this.locatorToRack = new Map();
      this.locatorToZone = new Map();
      this.locatorItems = new Map(); // locatorId -> Array<StockRecord>
      this.zoneLocators = new Map(); // zoneId -> Array<locatorId>
      this.lineageRegistry = new Map(); // lineageId -> { lineageId, materialNo, materialName, nodes: [...] }
      this.batchToLineage = new Map(); // batchNo -> lineageId
      this.activePdas = new Map(); // pdaId -> PdaState
      this.kpiBacklog = {
        pendingPutaway: 14,
        pendingPicking: 26,
      };

      this._heroLocked = false;
      this._initInventory();
      this._initSplitLineages();
      this._initActivePdas();
      this._freezeHeroSnapshot();
      this._startInactivitySweep();
    }

    _heroBatch(batchNo) {
      return batchNo === 'B20261119-R01' || batchNo === 'B20261119-R04';
    }

    _writeCuratedStock(row) {
      const rackId = row.rackId || this.locatorToRack.get(row.locatorId) || null;
      const zoneId = row.zoneId || this.locatorToZone.get(row.locatorId);
      this.locatorItems.set(row.locatorId, [{
        recordId: `REC-${row.locatorId}-${row.batchNo}`,
        locatorId: row.locatorId,
        rackId,
        zoneId,
        materialNo: row.materialNo,
        materialName: row.materialName,
        batchNo: row.batchNo,
        qty: row.qty,
        unit: row.unit,
        status: row.status,
        receivedAt: row.receivedAt,
      }]);
    }

    _freezeHeroSnapshot() {
      // Putaway destination stays empty even if the rack fill RNG occupied it.
      this.locatorItems.set('A-04-B2-L1', []);
      CURATED_ON_HAND.filter((row) => this._heroBatch(row.batchNo)).forEach((row) => this._writeCuratedStock(row));
      const pda = this.activePdas.get('PDA-005');
      if (pda) {
        pda.category = 'INBOUND';
        pda.taskType = 'PUTAWAY';
        pda.orderNo = 'PA-2604271';
        pda.target = { zoneId: 'Z-HIGHBAY', rackId: 'A-04', locatorId: 'A-04-B2-L1' };
      }
      this._heroLocked = true;
    }

    _makeLocatorId(rackId, bay, level) {
      return `${rackId}-B${bay}-L${level}`;
    }

    _formatReceivedAt(daysAgo, hour) {
      const base = new Date('2026-11-19T00:00:00+08:00');
      base.setDate(base.getDate() - daysAgo);
      const y = base.getFullYear();
      const m = String(base.getMonth() + 1).padStart(2, '0');
      const d = String(base.getDate()).padStart(2, '0');
      const hh = String(hour).padStart(2, '0');
      return `${y}-${m}-${d} ${hh}:15`;
    }

    _initInventory() {
      // Dedicated empty racks (approx 10% of 108) for realistic visual contrast & Putaway demo
      const emptyRacks = new Set([
        'A-02', 'B-08', 'C-07', 'E-03', 'F-04', 'H-06',
        'K-02', 'M-04', 'P-01', 'Q-03', 'S-02',
      ]);
      // Racks guaranteed to contain Stock Hold records
      const holdRacks = new Set([
        'A-05', 'C-02', 'D-06', 'F-07', 'G-03', 'H-01',
        'J-03', 'L-04', 'O-02', 'R-03',
      ]);

      for (const rack of this.layout.racks) {
        const tpl = this.layout.rackTemplates[rack.templateId];
        const isEmptyRack = emptyRacks.has(rack.rackId);
        const wantsHold = holdRacks.has(rack.rackId);
        let holdAssigned = false;

        for (let level = 1; level <= tpl.levels; level++) {
          for (let bay = 1; bay <= tpl.bays; bay++) {
            const locatorId = this._makeLocatorId(rack.rackId, bay, level);
            this.locatorToRack.set(locatorId, rack.rackId);
            this.locatorToZone.set(locatorId, rack.zoneId);
            const items = [];

            if (!isEmptyRack) {
              // Vary occupied probability per rack to reflect real heterogeneous stocking
              const fillChance = rack.templateId === 'HEAVY_4X3' ? 0.62 : 0.56;
              if (this.rng() < fillChance) {
                const recordCount = this.rng() < 0.35 ? 2 : 1;
                for (let idx = 0; idx < recordCount; idx++) {
                  const mat = MATERIALS[3 + Math.floor(this.rng() * (MATERIALS.length - 3))];
                  const dayOffset = 1 + Math.floor(this.rng() * 45);
                  const batchSuffix = String(100 + Math.floor(this.rng() * 899));
                  let status = 'AVAILABLE';
                  if (wantsHold && !holdAssigned && idx === 0) {
                    status = 'HOLD';
                    holdAssigned = true;
                  } else if (this.rng() < 0.14) {
                    status = 'ALLOCATED';
                  }
                  items.push({
                    recordId: `REC-${locatorId}-${idx + 1}`,
                    locatorId,
                    rackId: rack.rackId,
                    zoneId: rack.zoneId,
                    materialNo: mat.materialNo,
                    materialName: mat.materialName,
                    batchNo: `B202610-${batchSuffix}`,
                    qty: 2 + Math.floor(this.rng() * 48),
                    unit: mat.unit,
                    status,
                    receivedAt: this._formatReceivedAt(dayOffset, 8 + (dayOffset % 10)),
                  });
                }
              }
            }
            this.locatorItems.set(locatorId, items);
          }
        }
      }

      // Floor Zone locators with live operational stock
      const floorSeeds = [
        {
          zoneId: 'Z-RCV',
          records: [
            { locatorId: 'Z-RCV-01', materialIdx: 3, batchNo: 'B20261119-R01', qty: 30, status: 'AVAILABLE', daysAgo: 0 },
            { locatorId: 'Z-RCV-02', materialIdx: 5, batchNo: 'B20261119-R02', qty: 18, status: 'HOLD', daysAgo: 0 },
            { locatorId: 'Z-RCV-03', materialIdx: 7, batchNo: 'B20261119-R03', qty: 24, status: 'AVAILABLE', daysAgo: 0 },
          ],
        },
        {
          zoneId: 'Z-FLOOR',
          records: [
            { locatorId: 'Z-FLOOR-01', materialIdx: 8, batchNo: 'B20261110-F01', qty: 12, status: 'AVAILABLE', daysAgo: 9 },
            { locatorId: 'Z-FLOOR-02', materialIdx: 6, batchNo: 'B20261112-F02', qty: 16, status: 'AVAILABLE', daysAgo: 7 },
            { locatorId: 'Z-FLOOR-03', materialIdx: 2, batchNo: 'B20261108-20A', qty: 32, status: 'AVAILABLE', daysAgo: 11 },
          ],
        },
        {
          zoneId: 'Z-PACK',
          records: [
            { locatorId: 'Z-PACK-01', materialIdx: 1, batchNo: 'B20261105-10B', qty: 15, status: 'ALLOCATED', daysAgo: 14 },
            { locatorId: 'Z-PACK-02', materialIdx: 9, batchNo: 'B20261115-P02', qty: 8, status: 'ALLOCATED', daysAgo: 4 },
          ],
        },
        {
          zoneId: 'Z-SHIP',
          records: [
            { locatorId: 'Z-SHIP-01', materialIdx: 4, batchNo: 'B20261114-S01', qty: 22, status: 'ALLOCATED', daysAgo: 5 },
            { locatorId: 'Z-SHIP-02', materialIdx: 0, batchNo: 'B20261101-01B', qty: 4, status: 'ALLOCATED', daysAgo: 18 },
            { locatorId: 'Z-SHIP-03', materialIdx: 11, batchNo: 'B20261117-S03', qty: 40, status: 'ALLOCATED', daysAgo: 2 },
          ],
        },
      ];

      for (const seed of floorSeeds) {
        const locIds = [];
        for (const r of seed.records) {
          const mat = MATERIALS[r.materialIdx];
          this.locatorToZone.set(r.locatorId, seed.zoneId);
          this.locatorItems.set(r.locatorId, [
            {
              recordId: `REC-${r.locatorId}-1`,
              locatorId: r.locatorId,
              rackId: null,
              zoneId: seed.zoneId,
              materialNo: mat.materialNo,
              materialName: mat.materialName,
              batchNo: r.batchNo,
              qty: r.qty,
              unit: mat.unit,
              status: r.status,
              receivedAt: this._formatReceivedAt(r.daysAgo, 9),
            },
          ]);
          locIds.push(r.locatorId);
        }
        this.zoneLocators.set(seed.zoneId, locIds);
      }
    }

    _placeStock(locatorId, record) {
      if (this._heroLocked && (locatorId === 'A-04-B2-L1' || this._heroBatch(record.batchNo))) return;
      const rackId = this.locatorToRack.get(locatorId) || null;
      const zoneId = this.locatorToZone.get(locatorId);
      const list = this.locatorItems.get(locatorId) || [];
      list.unshift({
        recordId: `REC-${locatorId}-${record.batchNo}`,
        locatorId,
        rackId,
        zoneId,
        ...record,
      });
      this.locatorItems.set(locatorId, list);
    }

    _initSplitLineages() {
      // Lineage 1 (Flagship 3-generation split across High-Bay, Flow Rack, Hold & Shipping Floor Zone + Depleted Root)
      const mat0 = MATERIALS[0];
      this._placeStock('B-04-B2-L2', {
        materialNo: mat0.materialNo,
        materialName: mat0.materialName,
        batchNo: 'B20261101-01',
        qty: 18,
        unit: mat0.unit,
        status: 'AVAILABLE',
        receivedAt: '2026-11-01 09:20',
      });
      this._placeStock('L-02-B1-L3', {
        materialNo: mat0.materialNo,
        materialName: mat0.materialName,
        batchNo: 'B20261101-01A',
        qty: 6,
        unit: mat0.unit,
        status: 'ALLOCATED',
        receivedAt: '2026-11-06 14:10',
      });
      this._placeStock('F-07-B3-L1', {
        materialNo: mat0.materialNo,
        materialName: mat0.materialName,
        batchNo: 'B20261101-02',
        qty: 8,
        unit: mat0.unit,
        status: 'HOLD',
        receivedAt: '2026-11-01 09:20',
      });

      this._registerLineage({
        lineageId: 'LIN-8801',
        materialNo: mat0.materialNo,
        materialName: mat0.materialName,
        nodes: [
          { batchNo: 'B20261101-00', parentBatchNo: null, note: 'Original inbound parent (fully split / shipped)' },
          { batchNo: 'B20261101-01', parentBatchNo: 'B20261101-00', note: 'Standard sort split' },
          { batchNo: 'B20261101-01A', parentBatchNo: 'B20261101-01', note: 'Second split by outbound wave' },
          { batchNo: 'B20261101-01B', parentBatchNo: 'B20261101-01', note: 'Second split for shipping staging' },
          { batchNo: 'B20261101-02', parentBatchNo: 'B20261101-00', note: 'QC isolation split' },
        ],
      });

      // Lineage 2 (MAT-4205 split across High-Bay, Flow Rack & Packing Floor Zone)
      const mat1 = MATERIALS[1];
      this._placeStock('A-06-B1-L2', {
        materialNo: mat1.materialNo,
        materialName: mat1.materialName,
        batchNo: 'B20261105-10',
        qty: 45,
        unit: mat1.unit,
        status: 'AVAILABLE',
        receivedAt: '2026-11-05 10:40',
      });
      this._placeStock('N-03-B2-L4', {
        materialNo: mat1.materialNo,
        materialName: mat1.materialName,
        batchNo: 'B20261105-10A',
        qty: 20,
        unit: mat1.unit,
        status: 'AVAILABLE',
        receivedAt: '2026-11-09 16:05',
      });
      this._registerLineage({
        lineageId: 'LIN-4205',
        materialNo: mat1.materialNo,
        materialName: mat1.materialName,
        nodes: [
          { batchNo: 'B20261105-10', parentBatchNo: null, note: 'Original on-hand parent' },
          { batchNo: 'B20261105-10A', parentBatchNo: 'B20261105-10', note: 'Replenish-to-flow-rack split' },
          { batchNo: 'B20261105-10B', parentBatchNo: 'B20261105-10', note: 'Picked, pending packing split' },
        ],
      });

      // Lineage 3 (MAT-1090 split across Floor Stacking Zone & High-Bay Rack + Depleted Root)
      const mat2 = MATERIALS[2];
      this._placeStock('D-03-B2-L1', {
        materialNo: mat2.materialNo,
        materialName: mat2.materialName,
        batchNo: 'B20261108-20B',
        qty: 24,
        unit: mat2.unit,
        status: 'AVAILABLE',
        receivedAt: '2026-11-08 11:30',
      });
      this._registerLineage({
        lineageId: 'LIN-1090',
        materialNo: mat2.materialNo,
        materialName: mat2.materialName,
        nodes: [
          { batchNo: 'B20261108-20', parentBatchNo: null, note: 'Original inbound parent (depleted)' },
          { batchNo: 'B20261108-20A', parentBatchNo: 'B20261108-20', note: 'Bulk floor-stack split' },
          { batchNo: 'B20261108-20B', parentBatchNo: 'B20261108-20', note: 'High-bay putaway split' },
        ],
      });
    }

    _registerLineage(lineage) {
      this.lineageRegistry.set(lineage.lineageId, lineage);
      for (const n of lineage.nodes) {
        this.batchToLineage.set(n.batchNo, lineage.lineageId);
      }
    }

    _initActivePdas() {
      const now = Date.now();
      const seedPdas = [
        // 4 PDAs in Z-RCV to showcase >3 aggregation badge (+1) and non-overlapping slots
        { pdaId: 'PDA-001', category: 'INBOUND', taskType: 'RECEIVING', orderNo: 'IN-20261119-011', target: { zoneId: 'Z-RCV', rackId: null, locatorId: 'Z-RCV-01' } },
        { pdaId: 'PDA-002', category: 'INBOUND', taskType: 'RECEIVING', orderNo: 'IN-20261119-012', target: { zoneId: 'Z-RCV', rackId: null, locatorId: 'Z-RCV-02' } },
        { pdaId: 'PDA-003', category: 'INBOUND', taskType: 'RECEIVING', orderNo: 'IN-20261119-015', target: { zoneId: 'Z-RCV', rackId: null, locatorId: 'Z-RCV-03' } },
        { pdaId: 'PDA-004', category: 'INBOUND', taskType: 'RECEIVING', orderNo: 'IN-20261119-018', target: { zoneId: 'Z-RCV', rackId: null, locatorId: 'Z-RCV-01' } },
        // Inbound Putaway at Racks
        { pdaId: 'PDA-005', category: 'INBOUND', taskType: 'PUTAWAY', orderNo: 'PA-2604271', target: { zoneId: 'Z-HIGHBAY', rackId: 'A-04', locatorId: 'A-04-B2-L1' } },
        { pdaId: 'PDA-006', category: 'INBOUND', taskType: 'PUTAWAY', orderNo: 'PUT-20261119-044', target: { zoneId: 'Z-HIGHBAY', rackId: 'C-05', locatorId: 'C-05-B1-L2' } },
        { pdaId: 'PDA-007', category: 'INBOUND', taskType: 'PUTAWAY', orderNo: 'PUT-20261119-049', target: { zoneId: 'Z-FLOW', rackId: 'K-03', locatorId: 'K-03-B3-L2' } },
        // Outbound Picking at Racks (including 2 PDAs sharing B-04 to demonstrate side-by-side spacing)
        { pdaId: 'PDA-011', category: 'OUTBOUND', taskType: 'PICKING', orderNo: 'WV-20261119-082', target: { zoneId: 'Z-HIGHBAY', rackId: 'B-04', locatorId: 'B-04-B2-L2' } },
        { pdaId: 'PDA-012', category: 'OUTBOUND', taskType: 'PICKING', orderNo: 'WV-20261119-085', target: { zoneId: 'Z-HIGHBAY', rackId: 'B-04', locatorId: 'B-04-B1-L1' } },
        { pdaId: 'PDA-013', category: 'OUTBOUND', taskType: 'PICKING', orderNo: 'WV-20261119-089', target: { zoneId: 'Z-FLOW', rackId: 'L-02', locatorId: 'L-02-B1-L3' } },
        { pdaId: 'PDA-014', category: 'OUTBOUND', taskType: 'PICKING', orderNo: 'WV-20261119-091', target: { zoneId: 'Z-FLOW', rackId: 'Q-02', locatorId: 'Q-02-B4-L1' } },
        // Outbound Packing & Shipping
        { pdaId: 'PDA-015', category: 'OUTBOUND', taskType: 'PACKING', orderNo: 'PK-20261119-103', target: { zoneId: 'Z-PACK', rackId: null, locatorId: 'Z-PACK-01' } },
        { pdaId: 'PDA-016', category: 'OUTBOUND', taskType: 'PACKING', orderNo: 'PK-20261119-104', target: { zoneId: 'Z-PACK', rackId: null, locatorId: 'Z-PACK-02' } },
        { pdaId: 'PDA-017', category: 'OUTBOUND', taskType: 'SHIPPING', orderNo: 'SH-20261119-022', target: { zoneId: 'Z-SHIP', rackId: null, locatorId: 'Z-SHIP-02' } },
        { pdaId: 'PDA-018', category: 'OUTBOUND', taskType: 'SHIPPING', orderNo: 'SH-20261119-024', target: { zoneId: 'Z-SHIP', rackId: null, locatorId: 'Z-SHIP-01' } },
        // Internal Operations (Transfer & Cycle Count)
        { pdaId: 'PDA-021', category: 'INTERNAL', taskType: 'TRANSFER', orderNo: 'MV-20261119-007', target: { zoneId: 'Z-HIGHBAY', rackId: 'E-06', locatorId: 'E-06-B3-L2' } },
        { pdaId: 'PDA-022', category: 'INTERNAL', taskType: 'CYCLE_COUNT', orderNo: 'CC-20261119-019', target: { zoneId: 'Z-FLOW', rackId: 'O-03', locatorId: 'O-03-B2-L4' } },
        { pdaId: 'PDA-023', category: 'INTERNAL', taskType: 'TRANSFER', orderNo: 'MV-20261119-009', target: { zoneId: 'Z-FLOOR', rackId: null, locatorId: 'Z-FLOOR-02' } },
      ];
      for (const p of seedPdas) {
        this.activePdas.set(p.pdaId, {
          ...p,
          lastEventAt: now,
          inactivityWindowMs: 10 * 60 * 1000,
        });
      }
    }

    _startInactivitySweep() {
      setInterval(() => {
        const now = Date.now();
        for (const [pdaId, pda] of this.activePdas.entries()) {
          if (pda.taskType === 'RECEIVING' && now - pda.lastEventAt >= pda.inactivityWindowMs) {
            this.activePdas.delete(pdaId);
            this._emit({
              kind: 'PDA_EVENT',
              event: {
                eventType: 'TASK_COMPLETED',
                silentFade: true,
                pdaId,
                category: pda.category,
                taskType: pda.taskType,
                orderNo: pda.orderNo,
                target: pda.target,
                timestamp: new Date().toISOString(),
              },
              logText: `${pdaId} continuous-scan silent inactivity — marker faded with no alert`,
            });
          }
        }
      }, 1000);
    }

    // ---- Public WMS Data Contract APIs ----

    getLayoutSnapshot() {
      return this.layout;
    }

    getRackSummary(rackId) {
      const rack = this.rackMap.get(rackId);
      if (!rack) return null;
      const tpl = this.layout.rackTemplates[rack.templateId];
      const locators = [];
      let occupiedLocators = 0;
      let hasHold = false;
      let hasAllocated = false;
      let totalQty = 0;
      const skuSet = new Set();

      for (let level = 1; level <= tpl.levels; level++) {
        for (let bay = 1; bay <= tpl.bays; bay++) {
          const locatorId = this._makeLocatorId(rackId, bay, level);
          const items = this.locatorItems.get(locatorId) || [];
          const hasStock = items.length > 0;
          const locHold = items.some((i) => i.status === 'HOLD');
          const locAllocated = items.some((i) => i.status === 'ALLOCATED');
          const locQty = items.reduce((sum, i) => sum + i.qty, 0);
          const locSkus = new Set(items.map((i) => i.materialNo));
          if (hasStock) occupiedLocators++;
          if (locHold) hasHold = true;
          if (locAllocated) hasAllocated = true;
          totalQty += locQty;
          locSkus.forEach((s) => skuSet.add(s));
          locators.push({
            locatorId,
            bay,
            level,
            hasStock,
            hasHold: locHold,
            hasAllocated: locAllocated,
            skuCount: locSkus.size,
            totalQty: locQty,
          });
        }
      }

      const activePdas = this.getActivePdas().filter((p) => p.target.rackId === rackId);
      return {
        rackId,
        zoneId: rack.zoneId,
        zoneName: this.zoneMap.get(rack.zoneId)?.name || rack.zoneId,
        template: tpl,
        occupiedLocators,
        totalLocators: tpl.bays * tpl.levels,
        hasStock: occupiedLocators > 0,
        hasHold,
        hasAllocated,
        skuCount: skuSet.size,
        totalQty,
        activePdas,
        locators,
      };
    }

    getInventorySummarySnapshot() {
      const racks = {};
      for (const rack of this.layout.racks) {
        racks[rack.rackId] = this.getRackSummary(rack.rackId);
      }
      const floorZones = {};
      for (const zone of this.layout.zones) {
        if (!zone.isFloorZone) continue;
        const items = this.getZoneInventory(zone.zoneId);
        floorZones[zone.zoneId] = {
          zoneId: zone.zoneId,
          name: zone.name,
          recordCount: items.length,
          skuCount: new Set(items.map((i) => i.materialNo)).size,
          totalQty: items.reduce((s, i) => s + i.qty, 0),
          hasHold: items.some((i) => i.status === 'HOLD'),
        };
      }
      return { racks, floorZones };
    }

    getLocatorDetails(locatorId) {
      const items = this.locatorItems.get(locatorId) || [];
      return items.map((item) => {
        const curated = CURATED_ON_HAND.find((row) => row.batchNo === item.batchNo && row.currentLocatorId === item.locatorId);
        return {
          ...item,
          statusLabel: STATUS_LABELS[item.status] || item.status,
          hasSplitLineage: this.batchToLineage.has(item.batchNo),
          lineageId: this.batchToLineage.get(item.batchNo) || null,
          receivingJobId: curated?.receivingJobId || null,
        };
      });
    }

    resolveFocusTarget(token) {
      if (!token || !token.id) return null;
      if (token.kind === 'rack') {
        const rack = this.rackMap.get(token.id);
        if (!rack) return null;
        return { kind: 'rack', id: token.id, rackId: token.id, zoneId: rack.zoneId, locatorId: null };
      }
      if (token.kind === 'zone') {
        if (!this.zoneMap.has(token.id)) return null;
        return { kind: 'zone', id: token.id, rackId: null, zoneId: token.id, locatorId: null };
      }
      if (token.kind !== 'locator') return null;
      const rackId = this.locatorToRack.get(token.id) || null;
      const zoneId = this.locatorToZone.get(token.id) || (rackId ? this.rackMap.get(rackId)?.zoneId : null);
      if (!rackId && !zoneId) return null;
      return { kind: 'locator', id: token.id, locatorId: token.id, rackId, zoneId };
    }

    putawayDestinationNote(locatorId) {
      const stock = this.locatorItems.get(locatorId) || [];
      if (stock.length) return null;
      const assigned = CURATED_ON_HAND.filter((row) => row.putawayDestinationId === locatorId && row.currentLocatorId !== locatorId);
      return assigned.length ? assigned : null;
    }

    getZoneInventory(zoneId) {
      const locIds = this.zoneLocators.get(zoneId) || [];
      const out = [];
      for (const locId of locIds) {
        out.push(...this.getLocatorDetails(locId));
      }
      return out;
    }

    getActivePdas() {
      return Array.from(this.activePdas.values()).map((p) => ({
        ...p,
        taskLabel: TASK_LABELS[p.taskType] || p.taskType,
      }));
    }

    getKpiSummary() {
      const pdas = this.getActivePdas();
      const countTask = (t) => pdas.filter((p) => p.taskType === t).length;
      return {
        inbound: {
          receiving: countTask('RECEIVING'),
          pendingPutaway: this.kpiBacklog.pendingPutaway,
          putawayActive: countTask('PUTAWAY'),
        },
        outbound: {
          pendingPicking: this.kpiBacklog.pendingPicking,
          pickingActive: countTask('PICKING'),
          packingActive: countTask('PACKING'),
          shippingActive: countTask('SHIPPING'),
        },
        pdas: {
          total: pdas.length,
          inbound: pdas.filter((p) => p.category === 'INBOUND').length,
          outbound: pdas.filter((p) => p.category === 'OUTBOUND').length,
          internal: pdas.filter((p) => p.category === 'INTERNAL').length,
        },
      };
    }

    _normalizeSearchMode(mode) {
      const key = String(mode || 'MATERIAL').trim().toUpperCase();
      if (key === 'BATCH' || key === 'DOCUMENT' || key === 'PDA') return key;
      return 'MATERIAL';
    }

    getSearchSuggestions(rawQuery, mode) {
      const searchMode = this._normalizeSearchMode(mode);
      const raw = (rawQuery || '').trim();
      const q = raw.toUpperCase();
      if (searchMode === 'BATCH') return this._suggestBatches(q);
      if (searchMode === 'DOCUMENT') return this._suggestDocuments(q);
      if (searchMode === 'PDA') return this._suggestPdas(q);
      return this._suggestMaterials(q, raw);
    }

    _suggestMaterials(q, raw) {
      const suggestions = [];
      const seen = new Set();
      for (const lin of this.lineageRegistry.values()) {
        if (!q || lin.materialNo.includes(q) || lin.materialName.includes(raw)) {
          if (!seen.has(lin.materialNo)) {
            seen.add(lin.materialNo);
            suggestions.push({
              type: 'MATERIAL',
              code: lin.materialNo,
              label: `${lin.materialNo} · ${lin.materialName}`,
              badge: 'Has split lineage',
            });
          }
        }
      }
      if (q) {
        for (const mat of MATERIALS) {
          if ((mat.materialNo.includes(q) || mat.materialName.includes(raw)) && !seen.has(mat.materialNo)) {
            seen.add(mat.materialNo);
            suggestions.push({
              type: 'MATERIAL',
              code: mat.materialNo,
              label: `${mat.materialNo} · ${mat.materialName}`,
              badge: 'Material',
            });
          }
        }
      }
      return suggestions.slice(0, 8);
    }

    _suggestBatches(q) {
      const suggestions = [];
      const seen = new Set();
      for (const lin of this.lineageRegistry.values()) {
        for (const node of lin.nodes) {
          if (q && !node.batchNo.toUpperCase().includes(q)) continue;
          if (seen.has(node.batchNo)) continue;
          seen.add(node.batchNo);
          suggestions.push({
            type: 'BATCH',
            code: node.batchNo,
            label: `${node.batchNo} (${lin.materialNo})`,
            badge: 'Split batch',
          });
        }
      }
      if (q) {
        for (const items of this.locatorItems.values()) {
          for (const item of items) {
            if (!item.batchNo || seen.has(item.batchNo)) continue;
            if (!item.batchNo.toUpperCase().includes(q)) continue;
            seen.add(item.batchNo);
            suggestions.push({
              type: 'BATCH',
              code: item.batchNo,
              label: `${item.batchNo} (${item.materialNo})`,
              badge: 'Batch',
            });
          }
        }
      }
      return suggestions.slice(0, 8);
    }

    _suggestDocuments(q) {
      const suggestions = [];
      const seen = new Set();
      const push = (code, label, badge) => {
        const key = String(code || '').toUpperCase();
        if (!key || seen.has(key)) return;
        if (q && !key.includes(q)) return;
        seen.add(key);
        suggestions.push({ type: 'DOCUMENT', code, label, badge });
      };

      for (const row of CURATED_ON_HAND) {
        if (row.receivingJobId) push(row.receivingJobId, row.receivingJobId, 'Receiving job');
        if (row.putawayId) push(row.putawayId, row.putawayId, 'Putaway');
      }

      const orders = [];
      for (const pda of this.getActivePdas()) {
        if (!pda.orderNo || seen.has(pda.orderNo.toUpperCase())) continue;
        orders.push(pda);
      }
      const ranked = [];
      const rest = [];
      const prefixes = new Set();
      for (const pda of orders) {
        const prefix = String(pda.orderNo).split('-')[0];
        if (!prefixes.has(prefix)) {
          prefixes.add(prefix);
          ranked.push(pda);
        } else {
          rest.push(pda);
        }
      }
      for (const pda of ranked.concat(rest)) {
        push(pda.orderNo, `${pda.orderNo} · ${pda.pdaId}`, 'Order');
      }
      return suggestions.slice(0, 8);
    }

    _suggestPdas(q) {
      const suggestions = [];
      for (const pda of this.getActivePdas()) {
        if (q && !pda.pdaId.toUpperCase().includes(q)) continue;
        suggestions.push({
          type: 'PDA',
          code: pda.pdaId,
          label: `${pda.pdaId} · ${pda.taskLabel}`,
          badge: 'PDA',
        });
        if (suggestions.length >= 8) break;
      }
      return suggestions;
    }

    _findStockByBatch(batchNo) {
      const hits = [];
      for (const [locatorId, items] of this.locatorItems.entries()) {
        for (const item of items) {
          if (item.batchNo.toUpperCase() === batchNo.toUpperCase()) {
            hits.push({
              ...item,
              locatorId,
              zoneName: this.zoneMap.get(item.zoneId)?.name || item.zoneId,
              statusLabel: STATUS_LABELS[item.status] || item.status,
            });
          }
        }
      }
      return hits;
    }

    _buildLineageResult(lineageId, primaryBatchNo) {
      const lineage = this.lineageRegistry.get(lineageId);
      if (!lineage) return null;
      const nodes = lineage.nodes.map((n) => {
        const locations = this._findStockByBatch(n.batchNo);
        const currentQty = locations.reduce((s, loc) => s + loc.qty, 0);
        return {
          batchNo: n.batchNo,
          parentBatchNo: n.parentBatchNo,
          note: n.note,
          currentQty,
          isDepleted: currentQty === 0,
          isPrimary: primaryBatchNo ? n.batchNo.toUpperCase() === primaryBatchNo.toUpperCase() : false,
          locations,
        };
      });
      return {
        lineageId: lineage.lineageId,
        materialNo: lineage.materialNo,
        materialName: lineage.materialName,
        nodes,
      };
    }

    _emptySearchResult(query, searchMode) {
      const noun = { MATERIAL: 'material', BATCH: 'batch', DOCUMENT: 'document', PDA: 'PDA' }[searchMode] || 'material';
      return {
        query,
        mode: 'EMPTY',
        searchMode,
        title: `No ${noun} matched "${query}"`,
        primaryRackIds: [],
        secondaryRackIds: [],
        primaryZoneIds: [],
        secondaryZoneIds: [],
        matchedLocators: new Map(),
        records: [],
        batchGroups: [],
        lineage: null,
        pda: null,
      };
    }

    _collectStockHits(predicate) {
      const records = [];
      const batchGroups = new Map();
      const primaryRackIds = new Set();
      const primaryZoneIds = new Set();
      const matchedLocators = new Map();
      let discoveredLineageId = null;

      for (const [locatorId, items] of this.locatorItems.entries()) {
        for (const item of items) {
          if (!predicate(item)) continue;
          const lineageId = this.batchToLineage.get(item.batchNo) || null;
          if (lineageId && !discoveredLineageId) discoveredLineageId = lineageId;

          const enriched = {
            ...item,
            locatorId,
            zoneName: this.zoneMap.get(item.zoneId)?.name || item.zoneId,
            statusLabel: STATUS_LABELS[item.status] || item.status,
            hasSplitLineage: Boolean(lineageId),
            lineageId,
          };
          records.push(enriched);
          matchedLocators.set(locatorId, { role: 'primary', batchNo: item.batchNo });
          if (item.rackId) primaryRackIds.add(item.rackId);
          else if (item.zoneId) primaryZoneIds.add(item.zoneId);

          if (!batchGroups.has(item.batchNo)) {
            batchGroups.set(item.batchNo, {
              batchNo: item.batchNo,
              materialNo: item.materialNo,
              materialName: item.materialName,
              hasSplitLineage: Boolean(lineageId),
              lineageId,
              totalQty: 0,
              unit: item.unit,
              locations: [],
            });
          }
          const grp = batchGroups.get(item.batchNo);
          grp.totalQty += item.qty;
          grp.locations.push(enriched);
        }
      }

      return {
        records,
        batchGroups: Array.from(batchGroups.values()),
        primaryRackIds,
        primaryZoneIds,
        matchedLocators,
        discoveredLineageId,
      };
    }

    _stockHitResult(query, searchMode, mode, hit) {
      const lineage = mode === 'MATERIAL' && hit.discoveredLineageId
        ? this._buildLineageResult(hit.discoveredLineageId, null)
        : null;
      return {
        query,
        mode,
        searchMode,
        title: `${hit.records[0].materialNo} · ${hit.records[0].materialName}`,
        primaryRackIds: Array.from(hit.primaryRackIds),
        secondaryRackIds: [],
        primaryZoneIds: Array.from(hit.primaryZoneIds),
        secondaryZoneIds: [],
        matchedLocators: hit.matchedLocators,
        records: hit.records,
        batchGroups: hit.batchGroups,
        lineage,
        pda: null,
      };
    }

    _lineageSearchResult(query, lineageId, batchNo) {
      const lineage = this._buildLineageResult(lineageId, batchNo);
      if (!lineage) return this._emptySearchResult(query, 'BATCH');
      const primaryRackIds = new Set();
      const secondaryRackIds = new Set();
      const primaryZoneIds = new Set();
      const secondaryZoneIds = new Set();
      const matchedLocators = new Map();

      for (const node of lineage.nodes) {
        for (const loc of node.locations) {
          matchedLocators.set(loc.locatorId, {
            role: node.isPrimary ? 'primary' : 'secondary',
            batchNo: node.batchNo,
          });
          if (loc.rackId) {
            (node.isPrimary ? primaryRackIds : secondaryRackIds).add(loc.rackId);
          } else if (loc.zoneId) {
            (node.isPrimary ? primaryZoneIds : secondaryZoneIds).add(loc.zoneId);
          }
        }
      }
      primaryRackIds.forEach((id) => secondaryRackIds.delete(id));
      primaryZoneIds.forEach((id) => secondaryZoneIds.delete(id));

      return {
        query,
        mode: 'BATCH_LINEAGE',
        searchMode: 'BATCH',
        title: `${lineage.materialNo} · ${lineage.materialName}`,
        primaryBatchNo: batchNo,
        lineage,
        primaryRackIds: Array.from(primaryRackIds),
        secondaryRackIds: Array.from(secondaryRackIds),
        primaryZoneIds: Array.from(primaryZoneIds),
        secondaryZoneIds: Array.from(secondaryZoneIds),
        matchedLocators,
        records: lineage.nodes.flatMap((n) => n.locations),
        batchGroups: [],
        pda: null,
      };
    }

    _highlightBucket() {
      return {
        seen: new Set(),
        records: [],
        primaryRackIds: new Set(),
        primaryZoneIds: new Set(),
        matchedLocators: new Map(),
      };
    }

    _addHighlight(bucket, locatorId, label, extra = {}) {
      if (!locatorId || bucket.seen.has(locatorId)) return;
      const rackId = extra.rackId || this.locatorToRack.get(locatorId) || null;
      const zoneId = extra.zoneId || this.locatorToZone.get(locatorId) || (rackId ? this.rackMap.get(rackId)?.zoneId : null);
      if (!rackId && !zoneId) return;
      bucket.seen.add(locatorId);
      bucket.matchedLocators.set(locatorId, { role: 'primary', batchNo: label });
      if (rackId) bucket.primaryRackIds.add(rackId);
      else bucket.primaryZoneIds.add(zoneId);
      bucket.records.push({
        locatorId,
        rackId,
        zoneId,
        zoneName: this.zoneMap.get(zoneId)?.name || zoneId,
        batchNo: label,
        materialNo: extra.materialNo || '',
        materialName: extra.materialName || '',
        qty: extra.qty || 0,
        unit: extra.unit || '',
        statusLabel: extra.emptyDestination ? 'No stock' : (extra.status ? (STATUS_LABELS[extra.status] || extra.status) : ''),
        emptyDestination: Boolean(extra.emptyDestination),
      });
    }

    _searchMaterial(q) {
      const upper = q.toUpperCase();
      const hit = this._collectStockHits(
        (item) => item.materialNo.toUpperCase().includes(upper) || item.materialName.includes(q)
      );
      if (!hit.records.length) return this._emptySearchResult(q, 'MATERIAL');
      return this._stockHitResult(q, 'MATERIAL', 'MATERIAL', hit);
    }

    _searchBatch(q) {
      const upper = q.toUpperCase();
      for (const [batchNo, lineageId] of this.batchToLineage.entries()) {
        if (batchNo.toUpperCase() === upper || batchNo.toUpperCase().includes(upper)) {
          return this._lineageSearchResult(q, lineageId, batchNo);
        }
      }
      const hit = this._collectStockHits((item) => item.batchNo.toUpperCase().includes(upper));
      if (!hit.records.length) return this._emptySearchResult(q, 'BATCH');
      return this._stockHitResult(q, 'BATCH', 'BATCH', hit);
    }

    _searchDocument(q) {
      const upper = q.toUpperCase();
      const includes = (value) => Boolean(value) && String(value).toUpperCase().includes(upper);
      const bucket = this._highlightBucket();
      const docIds = [];
      const seenDocs = new Set();
      const noteDoc = (id) => {
        if (!id || seenDocs.has(id)) return;
        seenDocs.add(id);
        docIds.push(id);
      };

      const curatedHits = CURATED_ON_HAND.filter((row) => includes(row.receivingJobId) || includes(row.putawayId));
      for (const row of curatedHits) {
        if (includes(row.receivingJobId)) noteDoc(row.receivingJobId);
        if (includes(row.putawayId)) noteDoc(row.putawayId);
        const live = (this.locatorItems.get(row.currentLocatorId) || []).find((item) => item.batchNo === row.batchNo);
        this._addHighlight(bucket, row.currentLocatorId, live?.batchNo || row.batchNo, {
          rackId: row.rackId,
          zoneId: row.zoneId,
          materialNo: live?.materialNo || row.materialNo,
          materialName: live?.materialName || row.materialName,
          qty: live?.qty ?? row.qty,
          unit: live?.unit || row.unit,
          status: live?.status || row.status,
        });
      }

      const heroDest = curatedHits.some(
        (row) => includes(row.putawayId) && row.putawayDestinationId === 'A-04-B2-L1' && row.currentLocatorId !== 'A-04-B2-L1'
      );
      if (heroDest) {
        const row = curatedHits.find((item) => item.putawayDestinationId === 'A-04-B2-L1');
        this._addHighlight(bucket, 'A-04-B2-L1', 'Putaway Destination', {
          rackId: 'A-04',
          zoneId: 'Z-HIGHBAY',
          materialNo: row?.materialNo || '',
          materialName: row?.materialName || '',
          qty: 0,
          unit: row?.unit || '',
          emptyDestination: true,
        });
      }

      const pdas = this.getActivePdas().filter((pda) => includes(pda.orderNo));
      for (const pda of pdas) {
        noteDoc(pda.orderNo);
        const locId = pda.target && pda.target.locatorId;
        const stock = locId ? (this.locatorItems.get(locId) || [])[0] : null;
        this._addHighlight(bucket, locId, stock?.batchNo || pda.orderNo, {
          rackId: pda.target && pda.target.rackId,
          zoneId: pda.target && pda.target.zoneId,
          materialNo: stock?.materialNo || '',
          materialName: stock?.materialName || '',
          qty: stock?.qty || 0,
          unit: stock?.unit || '',
          status: stock?.status || null,
        });
      }

      if (!bucket.records.length && pdas.length === 0) return this._emptySearchResult(q, 'DOCUMENT');
      return {
        query: q,
        mode: 'DOCUMENT',
        searchMode: 'DOCUMENT',
        title: docIds.join(' · ') || q,
        primaryRackIds: Array.from(bucket.primaryRackIds),
        secondaryRackIds: [],
        primaryZoneIds: Array.from(bucket.primaryZoneIds),
        secondaryZoneIds: [],
        matchedLocators: bucket.matchedLocators,
        records: bucket.records,
        batchGroups: [],
        lineage: null,
        pda: pdas.length === 1 ? pdas[0] : null,
      };
    }

    _searchPda(q) {
      const upper = q.toUpperCase();
      const matches = this.getActivePdas().filter((pda) => pda.pdaId.toUpperCase().includes(upper));
      if (!matches.length) return this._emptySearchResult(q, 'PDA');
      const exact = matches.find((pda) => pda.pdaId.toUpperCase() === upper) || null;
      const bucket = this._highlightBucket();
      for (const pda of matches) {
        const target = pda.target || {};
        const locId = target.locatorId;
        const stock = locId ? (this.locatorItems.get(locId) || [])[0] : null;
        this._addHighlight(bucket, locId, pda.orderNo, {
          rackId: target.rackId,
          zoneId: target.zoneId,
          materialNo: stock?.materialNo || '',
          materialName: stock?.materialName || '',
          qty: stock?.qty || 0,
          unit: stock?.unit || '',
          status: stock?.status || null,
        });
      }
      const pda = exact || (matches.length === 1 ? matches[0] : null);
      return {
        query: q,
        mode: 'PDA',
        searchMode: 'PDA',
        title: pda ? `${pda.pdaId} · ${pda.taskLabel}` : `PDAs matching "${q}"`,
        primaryRackIds: Array.from(bucket.primaryRackIds),
        secondaryRackIds: [],
        primaryZoneIds: Array.from(bucket.primaryZoneIds),
        secondaryZoneIds: [],
        matchedLocators: bucket.matchedLocators,
        records: bucket.records,
        batchGroups: [],
        lineage: null,
        pda,
      };
    }

    searchInventory(rawQuery, mode) {
      const q = (rawQuery || '').trim();
      if (!q) return null;
      const searchMode = this._normalizeSearchMode(mode);
      if (searchMode === 'BATCH') return this._searchBatch(q);
      if (searchMode === 'DOCUMENT') return this._searchDocument(q);
      if (searchMode === 'PDA') return this._searchPda(q);
      return this._searchMaterial(q);
    }

    // ---- Event Subscription & Simulation Engine ----

    subscribeEvents(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    _emit(payload) {
      if (payload.logText) {
        const time = new Date().toTimeString().slice(0, 8);
        this.eventLog.unshift({ time, text: payload.logText });
        if (this.eventLog.length > 30) this.eventLog.pop();
      }
      for (const fn of this.listeners) fn(payload);
    }

    _schedule(ms, fn) {
      const id = setTimeout(() => {
        this.scenarioTimers = this.scenarioTimers.filter((t) => t !== id);
        fn();
      }, ms);
      this.scenarioTimers.push(id);
    }

    _clearScenarioTimers() {
      for (const id of this.scenarioTimers) clearTimeout(id);
      this.scenarioTimers = [];
    }

    _upsertPda(pda, logText, opts = {}) {
      if (pda.pdaId === 'PDA-005') return;
      const next = {
        ...pda,
        lastEventAt: Date.now(),
        inactivityWindowMs: pda.inactivityWindowMs || 10 * 60 * 1000,
      };
      this.activePdas.set(pda.pdaId, next);
      this._emit({
        kind: 'PDA_EVENT',
        cameraFollow: Boolean(opts.cameraFollow),
        event: {
          eventType: 'TASK_ACTIVE',
          pdaId: next.pdaId,
          category: next.category,
          taskType: next.taskType,
          orderNo: next.orderNo,
          target: next.target,
          timestamp: new Date().toISOString(),
        },
        logText,
      });
    }

    _completePda(pdaId, logText, opts = {}) {
      if (pdaId === 'PDA-005') return;
      const existing = this.activePdas.get(pdaId);
      if (!existing) return;
      this.activePdas.delete(pdaId);
      this._emit({
        kind: 'PDA_EVENT',
        cameraFollow: Boolean(opts.cameraFollow),
        event: {
          eventType: 'TASK_COMPLETED',
          pdaId,
          category: existing.category,
          taskType: existing.taskType,
          orderNo: existing.orderNo,
          target: existing.target,
          timestamp: new Date().toISOString(),
        },
        logText,
      });
    }

    _clearLocatorStock(locatorId) {
      if (!this._heroLocked) {
        this.locatorItems.set(locatorId, []);
        return;
      }
      if (locatorId === 'A-04-B2-L1') {
        this.locatorItems.set(locatorId, []);
        return;
      }
      const kept = (this.locatorItems.get(locatorId) || []).filter((item) => this._heroBatch(item.batchNo));
      this.locatorItems.set(locatorId, kept);
    }

    runInboundScenario() {
      this._clearScenarioTimers();
      const pdaId = 'PDA-SIM-IN';
      const targetRackId = 'A-02';
      const targetLocatorId = 'A-02-B2-L1';
      const mat = MATERIALS[3];
      const batchNo = `B20261119-IN${Math.floor(10 + Math.random() * 89)}`;
      const follow = { cameraFollow: true };

      this._upsertPda(
        {
          pdaId,
          category: 'INBOUND',
          taskType: 'RECEIVING',
          orderNo: 'IN-20261119-DEMO',
          target: { zoneId: 'Z-RCV', rackId: null, locatorId: 'Z-RCV-01' },
        },
        `[Inbound] ${pdaId} starts unload scan of ${mat.materialNo} in receiving staging (Z-RCV)`,
        follow
      );

      this._schedule(2400, () => {
        this.kpiBacklog.pendingPutaway += 1;
        this._upsertPda(
          {
            pdaId,
            category: 'INBOUND',
            taskType: 'PUTAWAY',
            orderNo: 'PUT-20261119-DEMO',
            target: { zoneId: 'Z-HIGHBAY', rackId: targetRackId, locatorId: targetLocatorId },
          },
          `[Inbound] ${pdaId} takes putaway task → empty rack ${targetRackId} (${targetLocatorId})`,
          follow
        );
      });

      this._schedule(5600, () => {
        this._placeStock(targetLocatorId, {
          materialNo: mat.materialNo,
          materialName: mat.materialName,
          batchNo,
          qty: 20,
          unit: mat.unit,
          status: 'AVAILABLE',
          receivedAt: '2026-11-19 12:15',
        });
        this.kpiBacklog.pendingPutaway = Math.max(0, this.kpiBacklog.pendingPutaway - 1);
        this._completePda(
          pdaId,
          `[Inbound] ${pdaId} putaway synced → ${targetRackId} shows standard cargo block; PDA marker clears`,
          follow
        );
        this._emit({
          kind: 'INVENTORY_UPDATE',
          rackId: targetRackId,
          locatorId: targetLocatorId,
          cameraFollow: true,
        });
      });
    }

    runOutboundScenario() {
      this._clearScenarioTimers();
      const pdaId = 'PDA-SIM-OUT';
      const targetRackId = 'C-04';
      const targetLocatorId = 'C-04-B1-L1';
      const follow = { cameraFollow: true };
      const mat = MATERIALS[5];

      // Guarantee a pickable Symbolic Cargo Block so the outbound narrative can show presence disappear
      if (!(this.locatorItems.get(targetLocatorId) || []).length) {
        this._placeStock(targetLocatorId, {
          materialNo: mat.materialNo,
          materialName: mat.materialName,
          batchNo: 'B20261119-OUT-SEED',
          qty: 8,
          unit: mat.unit,
          status: 'AVAILABLE',
          receivedAt: '2026-11-12 10:40',
        });
        this._emit({ kind: 'INVENTORY_UPDATE', rackId: targetRackId, locatorId: targetLocatorId });
      }

      this._upsertPda(
        {
          pdaId,
          category: 'OUTBOUND',
          taskType: 'PICKING',
          orderNo: 'WV-20261119-DEMO',
          target: { zoneId: 'Z-HIGHBAY', rackId: targetRackId, locatorId: targetLocatorId },
        },
        `[Outbound] ${pdaId} takes wave pick task at rack ${targetRackId}`,
        follow
      );

      this._schedule(2600, () => {
        this._clearLocatorStock(targetLocatorId);
        this._emit({
          kind: 'INVENTORY_UPDATE',
          rackId: targetRackId,
          locatorId: targetLocatorId,
          cameraFollow: true,
        });
        this._upsertPda(
          {
            pdaId,
            category: 'OUTBOUND',
            taskType: 'PACKING',
            orderNo: 'PK-20261119-DEMO',
            target: { zoneId: 'Z-PACK', rackId: null, locatorId: 'Z-PACK-01' },
          },
          `[Outbound] ${pdaId} pick complete → ${targetLocatorId} block clears; moves to packing (Z-PACK)`,
          follow
        );
      });

      this._schedule(5000, () => {
        this._upsertPda(
          {
            pdaId,
            category: 'OUTBOUND',
            taskType: 'SHIPPING',
            orderNo: 'SH-20261119-DEMO',
            target: { zoneId: 'Z-SHIP', rackId: null, locatorId: 'Z-SHIP-01' },
          },
          `[Outbound] ${pdaId} enters shipping staging (Z-SHIP) for load-out`,
          follow
        );
      });

      this._schedule(7400, () => {
        this.kpiBacklog.pendingPicking = Math.max(0, this.kpiBacklog.pendingPicking - 1);
        this._completePda(
          pdaId,
          `[Outbound] ${pdaId} shipping confirmed → PDA marker clears`,
          follow
        );
      });
    }

    runSilentFadeDemo() {
      const pdaId = 'PDA-SCAN-99';
      this._upsertPda(
        {
          pdaId,
          category: 'INBOUND',
          taskType: 'RECEIVING',
          orderNo: 'IN-SCAN-CONT',
          target: { zoneId: 'Z-RCV', rackId: null, locatorId: 'Z-RCV-02' },
          // Demo accelerated 5-second silent inactivity window (production default: 10 min)
          inactivityWindowMs: 5000,
        },
        `[Silent fade] ${pdaId} continuous-scan receiving (demo: fade after 5s with no new scan, no timeout alert)`
      );
    }

    toggleStressTest() {
      if (this.stressActive) {
        clearInterval(this.stressInterval);
        this.stressInterval = null;
        this.stressActive = false;
        for (const key of Array.from(this.activePdas.keys())) {
          if (key.startsWith('PDA-STRESS-')) this.activePdas.delete(key);
        }
        this._emit({ kind: 'PDA_BATCH_SYNC', logText: '[Stress] Concurrent stress test stopped; restored normal PDA count' });
        return false;
      }

      this.stressActive = true;
      const racks = this.layout.racks;
      const floorZoneIds = ['Z-RCV', 'Z-FLOOR', 'Z-PACK', 'Z-SHIP'];
      const makeRandomTarget = (idx) => {
        if (idx % 5 === 0) {
          const zId = floorZoneIds[idx % floorZoneIds.length];
          const taskByZone = {
            'Z-RCV': { category: 'INBOUND', taskType: 'RECEIVING' },
            'Z-FLOOR': { category: 'INTERNAL', taskType: 'TRANSFER' },
            'Z-PACK': { category: 'OUTBOUND', taskType: 'PACKING' },
            'Z-SHIP': { category: 'OUTBOUND', taskType: 'SHIPPING' },
          }[zId];
          return { ...taskByZone, target: { zoneId: zId, rackId: null, locatorId: `${zId}-01` } };
        }
        const rack = racks[(idx * 7 + Math.floor(Math.random() * 19)) % racks.length];
        const modes = [
          { category: 'INBOUND', taskType: 'PUTAWAY' },
          { category: 'OUTBOUND', taskType: 'PICKING' },
          { category: 'INTERNAL', taskType: 'CYCLE_COUNT' },
        ];
        const m = modes[idx % modes.length];
        return { ...m, target: { zoneId: rack.zoneId, rackId: rack.rackId, locatorId: `${rack.rackId}-B1-L1` } };
      };

      // Bring total active PDAs up to ~42 concurrent PDAs
      for (let i = 1; i <= 26; i++) {
        const pdaId = `PDA-STRESS-${String(i).padStart(2, '0')}`;
        const spec = makeRandomTarget(i);
        this.activePdas.set(pdaId, {
          pdaId,
          ...spec,
          orderNo: `STR-${200 + i}`,
          lastEventAt: Date.now(),
          inactivityWindowMs: 10 * 60 * 1000,
        });
      }
      this._emit({
        kind: 'PDA_BATCH_SYNC',
        logText: `[Stress] Started 40+ concurrent active PDA stress test (now ${this.activePdas.size})`,
      });

      this.stressInterval = setInterval(() => {
        const idx = 1 + Math.floor(Math.random() * 26);
        const pdaId = `PDA-STRESS-${String(idx).padStart(2, '0')}`;
        const spec = makeRandomTarget(idx + Math.floor(Math.random() * 50));
        this._upsertPda({ pdaId, ...spec, orderNo: `STR-${200 + idx}` });
      }, 900);

      return true;
    }
  }

  WMS.TASK_LABELS = TASK_LABELS;
  WMS.STATUS_LABELS = STATUS_LABELS;
  WMS.CURATED_ON_HAND = CURATED_ON_HAND;
  WMS.WmsMockService = WmsMockService;
})(window);
