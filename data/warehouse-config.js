(function (global) {
  'use strict';
  const WMS = (global.WMS = global.WMS || {});

  function createDefaultWarehouseLayout() {
    // Non-rectangular L-shaped + chamfered industrial warehouse footprint
    const outline = [
      [0, 0],
      [1480, 0],
      [1480, 250],
      [2040, 250],
      [2040, 1280],
      [1860, 1460],
      [320, 1460],
      [320, 1140],
      [0, 1140],
    ];

    const rearWallSegments = [
      { x1: 0, y1: 0, x2: 1480, y2: 0, orientation: 'x' },
      { x1: 1480, y1: 0, x2: 1480, y2: 250, orientation: 'y' },
      { x1: 1480, y1: 250, x2: 2040, y2: 250, orientation: 'x' },
      { x1: 0, y1: 0, x2: 0, y2: 1140, orientation: 'y' },
    ];

    const docks = [
      { dockId: 'D-01', x: 0, y: 120, width: 88, hasTruck: true, truckColor: 0x537d95 },
      { dockId: 'D-02', x: 0, y: 360, width: 88, hasTruck: false },
      { dockId: 'D-03', x: 0, y: 610, width: 88, hasTruck: true, truckColor: 0x8f5b4a },
      { dockId: 'D-04', x: 0, y: 860, width: 88, hasTruck: false },
    ];

    const zones = [
      {
        zoneId: 'Z-RCV',
        name: 'Receiving staging',
        code: '01',
        type: 'FLOOR_RECEIVING',
        category: 'INBOUND',
        isFloorZone: true,
        polygon: [
          [42, 85],
          [292, 85],
          [292, 1060],
          [42, 1060],
        ],
        labelPos: [167, 1015],
        pdaAnchors: [
          [148, 220],
          [215, 360],
          [148, 520],
          [215, 700],
          [148, 860],
        ],
      },
      {
        zoneId: 'Z-HIGHBAY',
        name: 'High-bay heavy storage',
        code: '02',
        type: 'STORAGE',
        category: 'STORAGE',
        isFloorZone: false,
        polygon: [
          [382, 62],
          [1398, 62],
          [1398, 766],
          [382, 766],
        ],
        labelPos: [890, 42],
      },
      {
        zoneId: 'Z-FLOW',
        name: 'Light flow storage',
        code: '03',
        type: 'STORAGE',
        category: 'STORAGE',
        isFloorZone: false,
        polygon: [
          [1466, 294],
          [2002, 294],
          [2002, 1044],
          [1466, 1044],
        ],
        labelPos: [1734, 276],
      },
      {
        zoneId: 'Z-FLOOR',
        name: 'Floor stacking',
        code: '04',
        type: 'FLOOR_STACKING',
        category: 'STORAGE',
        isFloorZone: true,
        polygon: [
          [382, 816],
          [1382, 816],
          [1382, 998],
          [382, 998],
        ],
        labelPos: [882, 962],
        pdaAnchors: [
          [520, 905],
          [760, 905],
          [1020, 905],
          [1240, 905],
        ],
      },
      {
        zoneId: 'Z-PACK',
        name: 'Packing / check',
        code: '05',
        type: 'FLOOR_PACKING',
        category: 'OUTBOUND',
        isFloorZone: true,
        polygon: [
          [382, 1076],
          [1160, 1076],
          [1160, 1410],
          [382, 1410],
        ],
        labelPos: [771, 1372],
        pdaAnchors: [
          [520, 1185],
          [720, 1185],
          [940, 1185],
          [620, 1300],
          [860, 1300],
        ],
      },
      {
        zoneId: 'Z-SHIP',
        name: 'Shipping staging',
        code: '06',
        type: 'FLOOR_SHIPPING',
        category: 'OUTBOUND',
        isFloorZone: true,
        // 5-vertex chamfered polygon matching the warehouse front-right bevel
        polygon: [
          [1224, 1086],
          [1990, 1086],
          [1990, 1260],
          [1840, 1410],
          [1224, 1410],
        ],
        labelPos: [1585, 1368],
        pdaAnchors: [
          [1380, 1180],
          [1580, 1180],
          [1780, 1180],
          [1480, 1295],
          [1700, 1295],
        ],
      },
    ];

    const rackTemplates = {
      HEAVY_4X3: {
        id: 'HEAVY_4X3',
        name: 'High-bay heavy rack',
        bays: 3,
        levels: 4,
        width: 112,
        depth: 34,
        height: 112,
        beamColor: 0xb97042,
        beamTopColor: 0xd19159,
        postColor: 0x36576c,
      },
      FLOW_5X4: {
        id: 'FLOW_5X4',
        name: 'Light flow rack',
        bays: 4,
        levels: 5,
        width: 116,
        depth: 28,
        height: 94,
        beamColor: 0x4f7f77,
        beamTopColor: 0x6f9e95,
        postColor: 0x3b5868,
      },
    };

    const racks = [];

    // 64 High-Bay Heavy-Duty Racks: 8 rows (A..H) x 8 columns, arranged in 4 back-to-back pairs
    const heavyRowYs = [
      { row: 'A', y: 92, aisleSide: 'back' },
      { row: 'B', y: 134, aisleSide: 'front' },
      { row: 'C', y: 274, aisleSide: 'back' },
      { row: 'D', y: 316, aisleSide: 'front' },
      { row: 'E', y: 456, aisleSide: 'back' },
      { row: 'F', y: 498, aisleSide: 'front' },
      { row: 'G', y: 638, aisleSide: 'back' },
      { row: 'H', y: 680, aisleSide: 'front' },
    ];
    for (const rowSpec of heavyRowYs) {
      for (let col = 0; col < 8; col++) {
        const x = 402 + col * 124;
        const rackId = `${rowSpec.row}-${String(col + 1).padStart(2, '0')}`;
        racks.push({
          rackId,
          zoneId: 'Z-HIGHBAY',
          templateId: 'HEAVY_4X3',
          x,
          y: rowSpec.y,
          rotation: 0,
          aisleSide: rowSpec.aisleSide,
        });
      }
    }

    // 44 Light Flow Racks: 11 rows (J..T) x 4 columns in the stepped-in right wing
    const flowRowYs = [
      { row: 'J', y: 314, aisleSide: 'back' },
      { row: 'K', y: 348, aisleSide: 'front' },
      { row: 'L', y: 450, aisleSide: 'back' },
      { row: 'M', y: 484, aisleSide: 'front' },
      { row: 'N', y: 586, aisleSide: 'back' },
      { row: 'O', y: 620, aisleSide: 'front' },
      { row: 'P', y: 722, aisleSide: 'back' },
      { row: 'Q', y: 756, aisleSide: 'front' },
      { row: 'R', y: 858, aisleSide: 'back' },
      { row: 'S', y: 892, aisleSide: 'front' },
      { row: 'T', y: 994, aisleSide: 'front' },
    ];
    for (const rowSpec of flowRowYs) {
      for (let col = 0; col < 4; col++) {
        const x = 1484 + col * 128;
        const rackId = `${rowSpec.row}-${String(col + 1).padStart(2, '0')}`;
        racks.push({
          rackId,
          zoneId: 'Z-FLOW',
          templateId: 'FLOW_5X4',
          x,
          y: rowSpec.y,
          rotation: 0,
          aisleSide: rowSpec.aisleSide,
        });
      }
    }

    // Visual props (packing benches inside Z-PACK)
    const benches = [
      { x: 460, y: 1130 },
      { x: 640, y: 1130 },
      { x: 820, y: 1130 },
      { x: 460, y: 1245 },
      { x: 640, y: 1245 },
      { x: 820, y: 1245 },
    ];

    return {
      warehouseId: 'WH-01',
      warehouseName: 'WH-01 Industrial Warehouse Operations Center',
      outline,
      rearWallSegments,
      docks,
      zones,
      rackTemplates,
      racks,
      benches,
    };
  }

  WMS.createDefaultWarehouseLayout = createDefaultWarehouseLayout;
})(window);
