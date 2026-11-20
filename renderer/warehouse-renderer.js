(function (global) {
  'use strict';
  const WMS = (global.WMS = global.WMS || {});

  const INK = 0x52605f;
  const PRIMARY_HI = 0x0f8a6e;
  const PRIMARY_HI_TOP = 0x26b292;
  const PRIMARY_HI_SIDE = 0x0a6d56;
  const SELECT_HI = 0x1a8f72;
  const SECONDARY_HI = 0x3b63c6;
  const SECONDARY_HI_TOP = 0x6287e2;
  const SECONDARY_HI_SIDE = 0x2b4ba0;
  const HOLD_MAIN = 0xd6962a;
  const HOLD_TOP = 0xebb54e;
  const HOLD_SIDE = 0xb3781b;
  const NORMAL_MAIN = 0xc9b492;
  const NORMAL_TOP = 0xe0cea9;
  const NORMAL_SIDE = 0xae9774;

  const PDA_COLORS = {
    INBOUND: { main: 0x2b6cb0, top: 0x4c8ed1, side: 0x1e4f85, badge: 0x2b6cb0 },
    OUTBOUND: { main: 0x2c855c, top: 0x48a87a, side: 0x1f6444, badge: 0x2c855c },
    INTERNAL: { main: 0x6f52ad, top: 0x9174ce, side: 0x523987, badge: 0x6f52ad },
  };

  function project(x, y, z = 0) {
    return { x: (x - y) * 0.88, y: (x + y) * 0.44 - z };
  }

  function pointInPolygon(px, py, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function polygonCentroid(polygon) {
    let sx = 0, sy = 0;
    for (const [x, y] of polygon) {
      sx += x;
      sy += y;
    }
    return [sx / polygon.length, sy / polygon.length];
  }

  class WarehouseRenderer {
    constructor(hostEl, layout, callbacks = {}) {
      this.host = hostEl;
      this.layout = layout;
      this.callbacks = callbacks;
      this.P = global.PIXI;
      this.app = null;
      this.world = null;

      this.layers = {};
      this.rackViews = new Map(); // rackId -> view state
      this.zoneViews = new Map(); // zoneId -> view state
      this.pdaMarkers = new Map(); // markerId -> pin + badge
      this.pdaMotion = new Map(); // pdaId -> last screen position, so a device slides to its next anchor
      this.expandedPdaKey = null;
      this.selectedPdaId = null;
      this.aisleFocusRackIds = new Set();
      this.pdaLayerVisible = true;

      this.textures = {
        templates: {},
        pda: {},
      };

      this.baseScale = 1;
      this.isMacroLod = true;
      this.selectedRackId = null;
      this.selectedZoneId = null;
      this.highlightState = null; // { primaryRacks, secondaryRacks, primaryZones, secondaryZones, matchedLocators, labels }
      this.pdaCategoryFilter = 'ALL';
      this.latestPdas = [];

      this.drag = null;
      this.dragDistance = 0;
      this.lastRackTap = { rackId: null, time: 0 };

      this.fpsFrames = 0;
      this.fpsLastTime = performance.now();
      this.currentFps = 60;
      this.pulsePhase = 0;
      this.cameraTween = null;
      this.cargoAnims = []; // { sprite, baseX, baseY, phase: 'in'|'out', t, duration }
      this._destroyed = false;
      this._resizeObserver = null;
      this._canvasUnbind = null;
    }

    async init(initialSnapshot, initialPdas) {
      if (this._destroyed) return;
      const P = this.P;
      const app = new P.Application();
      this.app = app;
      await app.init({
        resizeTo: this.host,
        background: 0xe8ebe8,
        antialias: true,
        resolution: Math.min(global.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (this._destroyed) {
        this._teardownApp(app);
        return;
      }
      this.host.appendChild(this.app.canvas);

      this.world = new P.Container();
      this.app.stage.addChild(this.world);

      this.layers.floor = new P.Container();
      this.layers.zones = new P.Container();
      this.layers.walls = new P.Container();
      this.layers.objects = new P.Container();
      this.layers.pdas = new P.Container();
      this.layers.labels = new P.Container();
      this.layers.overlay = new P.Container();

      this.world.addChild(
        this.layers.floor,
        this.layers.zones,
        this.layers.walls,
        this.layers.objects,
        this.layers.pdas,
        this.layers.labels,
        this.layers.overlay
      );

      this._buildReusableTextures();
      this._drawFloorAndAisles();
      this._drawZones();
      this._drawWallsAndDocks();
      this._buildSceneObjects(initialSnapshot);
      this._drawZoneLabels();

      this.bounds = this.world.getLocalBounds();
      this._bindInteractions();
      this.reset({ animate: false });
      this.syncPdas(initialPdas);

      this.app.ticker.add((ticker) => this._onTick(ticker));
    }

    _easeOutCubic(t) {
      return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    }

    _cancelCameraTween() {
      this.cameraTween = null;
    }

    _computeFitCamera() {
      const w = this.host.clientWidth || 1280;
      const h = this.host.clientHeight || 720;
      const rightReserve = w >= 980 ? 336 : 0;
      const availW = Math.max(320, w - rightReserve);
      const padX = availW < 700 ? 24 : 44;
      const padY = 36;
      const scale = Math.min((availW - padX * 2) / this.bounds.width, (h - padY * 2) / this.bounds.height);
      return {
        scale,
        x: (availW - this.bounds.width * scale) / 2 - this.bounds.x * scale,
        y: (h - this.bounds.height * scale) / 2 - this.bounds.y * scale + 6,
      };
    }

    _computeFocusCamera(wx, wy, targetZoomRatio = 1.65, soft = false) {
      const w = this.host.clientWidth || 1280;
      const h = this.host.clientHeight || 720;
      const pt = project(wx, wy, 30);
      const floor = this.baseScale * (soft ? 1.12 : targetZoomRatio);
      const nextScale = Math.max(this.world.scale.x, floor);
      return {
        scale: nextScale,
        x: w * 0.44 - pt.x * nextScale,
        y: h * 0.52 - pt.y * nextScale,
      };
    }

    easeCameraTo(target, duration = 0.9) {
      this.cameraTween = {
        fromX: this.world.x,
        fromY: this.world.y,
        fromScale: this.world.scale.x,
        toX: target.x,
        toY: target.y,
        toScale: target.scale,
        t: 0,
        duration: Math.max(0.05, duration),
      };
    }

    playIntroFlyIn(duration = 1.45) {
      const end = this._computeFitCamera();
      this.baseScale = end.scale;
      this.world.scale.set(end.scale * 0.68);
      this.world.position.set(end.x + end.scale * 90, end.y + end.scale * 48);
      this._updateLodAndZoom();
      this.easeCameraTo(end, duration);
    }

    // ---- Low-level isometric vector helpers ----

    _poly(g, pts, fillColor, alpha = 1, edgeColor = INK, edgeWidth = 0.6) {
      g.poly(pts.flatMap((q) => [q.x, q.y])).fill({ color: fillColor, alpha });
      if (edgeWidth > 0) g.stroke({ color: edgeColor, width: edgeWidth, alpha });
    }

    _line(g, a, b, color = INK, width = 1, alpha = 1) {
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width, alpha });
    }

    _box(g, x, y, z, w, d, h, cFront, cTop, cSide, edge = INK, edgeWidth = 0.55) {
      this._poly(
        g,
        [project(x + w, y, z), project(x + w, y + d, z), project(x + w, y + d, z + h), project(x + w, y, z + h)],
        cSide,
        1,
        edge,
        edgeWidth
      );
      this._poly(
        g,
        [project(x, y + d, z), project(x + w, y + d, z), project(x + w, y + d, z + h), project(x, y + d, z + h)],
        cFront,
        1,
        edge,
        edgeWidth
      );
      this._poly(
        g,
        [project(x, y, z + h), project(x + w, y, z + h), project(x + w, y + d, z + h), project(x, y + d, z + h)],
        cTop,
        1,
        edge,
        edgeWidth
      );
    }

    _bakeGraphic(drawFn) {
      const g = new this.P.Graphics();
      drawFn(g);
      const b = g.getLocalBounds();
      const pad = 2;
      const offsetX = (b.minX ?? b.x) - pad;
      const offsetY = (b.minY ?? b.y) - pad;
      const frame = new this.P.Rectangle(offsetX, offsetY, b.width + pad * 2, b.height + pad * 2);
      const texture = this.app.renderer.generateTexture({
        target: g,
        frame,
        resolution: 2,
        antialias: true,
      });
      g.destroy();
      return { texture, offsetX, offsetY };
    }

    _createBakedSprite(baked) {
      const sp = new this.P.Sprite(baked.texture);
      sp.position.set(baked.offsetX, baked.offsetY);
      return sp;
    }

    // ---- Pre-rendered Textures for 108 Racks + Symbolic Cargo Blocks + PDAs ----

    _buildReusableTextures() {
      for (const tpl of Object.values(this.layout.rackTemplates)) {
        const { width: w, depth: d, height: h, bays, levels, beamColor, beamTopColor, postColor } = tpl;
        const bayW = w / bays;
        const levelH = (h - 8) / levels;

        const rearFrame = this._bakeGraphic((g) => {
          // Ground shadow
          this._poly(
            g,
            [project(4, 4, 0), project(w + 7, 4, 0), project(w + 7, d + 7, 0), project(4, d + 7, 0)],
            0x394d49,
            0.12,
            0x394d49,
            0
          );
          // Rear vertical steel posts
          for (let b = 0; b <= bays; b++) {
            this._box(g, b * bayW, 0, 0, 2.6, 2.6, h, postColor, 0x738e9c, 0x2b4354, INK, 0.45);
          }
          // Deck plates for each level
          for (let l = 0; l < levels; l++) {
            const z = 4 + l * levelH;
            this._box(g, 0, 0, z, w, d, 2.2, 0x828c88, 0xb0b8ac, 0x6f7c78, INK, 0.4);
          }
        });

        const frontFrame = this._bakeGraphic((g) => {
          // Front beams for each level
          for (let l = 0; l < levels; l++) {
            const z = 4 + l * levelH;
            this._box(g, 0, d, z, w, 2.5, 3.2, beamColor, beamTopColor, 0x85492e, INK, 0.45);
          }
          // Front posts & safety foot guards
          for (let b = 0; b <= bays; b++) {
            const xx = b * bayW;
            this._box(g, xx, d, 0, 2.8, 2.8, h, 0x3e6076, 0x7592a4, 0x314a61, INK, 0.45);
            this._box(g, xx - 0.8, d - 0.8, 0, 4.4, 4.4, 10, 0xc3a14c, 0xe0bf6a, 0x977936, INK, 0.4);
          }
          // Right side steel X-bracing
          const step = h / 3;
          for (let z = 6; z < h - 14; z += step) {
            this._line(g, project(w + 2.5, 0, z), project(w + 2.5, d, z + step - 4), 0x55788b, 1.3);
            this._line(g, project(w + 2.5, d, z), project(w + 2.5, 0, z + step - 4), 0x55788b, 1.3);
          }
        });

        // Uniform Symbolic Cargo Block (strictly fixed 70% bay width x 60% level height)
        const blockW = bayW * 0.70;
        const blockD = d * 0.68;
        const blockH = Math.max(8, (levelH - 4) * 0.60);
        const makeBlockTex = (front, top, side, edge) =>
          this._bakeGraphic((g) => {
            this._box(g, 0, 0, 0, blockW, blockD, blockH, front, top, side, edge, 0.6);
            // Subtle crisp top band so it reads as an intentional symbolic block, not raw carton pile
            this._line(
              g,
              project(blockW * 0.5, 1, blockH + 0.2),
              project(blockW * 0.5, blockD - 1, blockH + 0.2),
              0xf7f7ef,
              1.4,
              0.55
            );
          });

        const blocks = {
          NORMAL: makeBlockTex(NORMAL_MAIN, NORMAL_TOP, NORMAL_SIDE, 0x766d5d),
          HOLD: makeBlockTex(HOLD_MAIN, HOLD_TOP, HOLD_SIDE, 0x7d5111),
          PRIMARY: makeBlockTex(PRIMARY_HI, PRIMARY_HI_TOP, PRIMARY_HI_SIDE, 0x064f3e),
          SECONDARY: makeBlockTex(SECONDARY_HI, SECONDARY_HI_TOP, SECONDARY_HI_SIDE, 0x1d3577),
        };

        // Macro LOD crisp simplified silhouette blocks (for zoomed-out whole-warehouse view)
        const makeMacroTex = (front, top, side, isEmpty) =>
          this._bakeGraphic((g) => {
            this._poly(
              g,
              [project(4, 4, 0), project(w + 6, 4, 0), project(w + 6, d + 6, 0), project(4, d + 6, 0)],
              0x394d49,
              0.1,
              0x394d49,
              0
            );
            if (isEmpty) {
              // Hollow-feel muted slate rack outline when empty
              this._box(g, 0, 0, 0, w, d, h * 0.82, 0xd1d7d2, 0xe3e7e1, 0xbec5c0, 0x798784, 0.9);
            } else {
              this._box(g, 0, 0, 0, w, d, h * 0.86, front, top, side, 0x455856, 0.8);
              // Front beam accent line to distinguish Heavy vs Flow rack templates
              this._line(g, project(0, d + 0.5, h * 0.42), project(w, d + 0.5, h * 0.42), beamColor, 2.2, 0.85);
            }
          });

        const macro = {
          EMPTY: makeMacroTex(0xd1d7d2, 0xe3e7e1, 0xbec5c0, true),
          NORMAL: makeMacroTex(0x9fb0a8, 0xc3d0c8, 0x859890, false),
          HOLD: makeMacroTex(0xd49a3a, 0xebbc64, 0xb27b22, false),
          PRIMARY: makeMacroTex(PRIMARY_HI, PRIMARY_HI_TOP, PRIMARY_HI_SIDE, false),
          SECONDARY: makeMacroTex(SECONDARY_HI, SECONDARY_HI_TOP, SECONDARY_HI_SIDE, false),
        };

        // Pre-bake reusable highlight / active / selection rings
        const makeRingTex = (color, width, fillAlpha) =>
          this._bakeGraphic((g) => {
            const pts = [project(-4, -4, 1), project(w + 5, -4, 1), project(w + 5, d + 5, 1), project(-4, d + 5, 1)];
            if (fillAlpha > 0) this._poly(g, pts, color, fillAlpha, color, width);
            else {
              for (let i = 0; i < 4; i++) this._line(g, pts[i], pts[(i + 1) % 4], color, width, 0.95);
            }
          });

        this.textures.templates[tpl.id] = {
          tpl,
          bayW,
          levelH,
          blockW,
          blockD,
          rearFrame,
          frontFrame,
          blocks,
          macro,
          rings: {
            // Selection sits above the rack body; keep a readable wash + hard rim.
            SELECT: makeRingTex(SELECT_HI, 4.4, 0.28),
            ACTIVE: makeRingTex(0x2b6cb0, 2.2, 0.08),
            PRIMARY: makeRingTex(PRIMARY_HI, 3.2, 0.18),
            SECONDARY: makeRingTex(SECONDARY_HI, 2.8, 0.14),
          },
        };
      }

      // Compact aisle silhouette. The floor pin and overhead badge carry location;
      // this body only appears once the view is zoomed into the aisle.
      for (const [category, col] of Object.entries(PDA_COLORS)) {
        this.textures.pda[category] = this._bakeGraphic((g) => {
          this._line(g, project(-1.6, 0, 1), project(-1.6, 0, 8), 0x35474e, 2.4);
          this._line(g, project(1.6, 0, 1), project(1.6, 0, 8), 0x35474e, 2.4);
          this._box(g, -3.1, -2.1, 7.5, 6.2, 4.2, 8.5, col.main, col.top, col.side, 0x263438, 0.5);
          const head = project(0, 0, 19);
          g.ellipse(head.x, head.y, 3.1, 3.4).fill(0xd3b290).stroke({ color: 0x6b604e, width: 0.5 });
          g.ellipse(head.x, head.y - 2.1, 3.5, 1.7).fill(col.top).stroke({ color: col.side, width: 0.45 });
        });
      }
    }

    // ---- Architecture: Non-Rectangular Slab, Walls, Docks, Floor Zones ----

    _drawFloorAndAisles() {
      const g = new this.P.Graphics();
      const outline = this.layout.outline;
      const slabH = 16;

      // Extruded visible front-facing slab faces (edges where outward normal points toward +x or +y)
      for (let i = 0; i < outline.length; i++) {
        const [x1, y1] = outline[i];
        const [x2, y2] = outline[(i + 1) % outline.length];
        const dx = x2 - x1;
        const dy = y2 - y1;
        // Clockwise polygon outward normal is (dy, -dx). In iso (+x,+y) is front-facing.
        const outX = dy;
        const outY = -dx;
        if (outX + outY > 0) {
          const shade = outX > outY ? 0x929e98 : 0xa4aca7;
          this._poly(
            g,
            [project(x1, y1, 0), project(x2, y2, 0), project(x2, y2, -slabH), project(x1, y1, -slabH)],
            shade,
            1,
            0x6a7671,
            0.7
          );
        }
      }

      // Concrete top slab
      this._poly(
        g,
        outline.map(([x, y]) => project(x, y, 0)),
        0xc2c8c1,
        1,
        0x727f79,
        1.1
      );

      // Saw-cut concrete expansion joints clipped cleanly inside the non-rectangular outline
      for (let x = 80; x < 2040; x += 80) {
        for (let y = 0; y < 1460; y += 80) {
          if (pointInPolygon(x, y + 40, outline) && pointInPolygon(x, y + 79, outline)) {
            this._line(g, project(x, y, 0.1), project(x, y + 80, 0.1), 0xa7b0a9, 0.55, 0.5);
          }
          if (pointInPolygon(x + 40, y, outline) && pointInPolygon(x + 79, y, outline)) {
            this._line(g, project(x, y, 0.1), project(x + 80, y, 0.1), 0xa7b0a9, 0.55, 0.5);
          }
        }
      }

      // Main circulation aisle dashed center lines
      for (let y = 70; y < 1100; y += 44) {
        this._line(g, project(335, y, 0.8), project(335, y + 20, 0.8), 0xded39b, 2.0);
      }
      for (let x = 350; x < 1990; x += 48) {
        this._line(g, project(x, 1036, 0.8), project(x + 22, 1036, 0.8), 0xded39b, 2.0);
      }
      for (let y = 290; y < 1020; y += 44) {
        this._line(g, project(1432, y, 0.8), project(1432, y + 20, 0.8), 0xded39b, 2.0);
      }

      this.layers.floor.addChild(g);
    }

    _drawZones() {
      const zoneStyle = {
        FLOOR_RECEIVING: { fill: 0xb7c9cf, alpha: 0.28, stroke: 0x5d8797 },
        STORAGE: { fill: 0xb4beb6, alpha: 0.14, stroke: 0xc5aa5a },
        FLOOR_STACKING: { fill: 0xc6be9d, alpha: 0.28, stroke: 0x9b8b4e },
        FLOOR_PACKING: { fill: 0xb8ccb9, alpha: 0.28, stroke: 0x5c8c69 },
        FLOOR_SHIPPING: { fill: 0xbad0c7, alpha: 0.30, stroke: 0x457f6d },
      };

      for (const zone of this.layout.zones) {
        const st = zoneStyle[zone.type] || zoneStyle.STORAGE;
        const container = new this.P.Container();
        const baseG = new this.P.Graphics();
        const pts = zone.polygon.map(([x, y]) => project(x, y, 1));
        this._poly(baseG, pts, st.fill, st.alpha, st.stroke, 1.8);

        // Floor stacking bay stripes for Z-FLOOR
        if (zone.type === 'FLOOR_STACKING') {
          for (let bx = 420; bx <= 1260; bx += 160) {
            const bPts = [
              project(bx, 838, 1.2),
              project(bx + 128, 838, 1.2),
              project(bx + 128, 926, 1.2),
              project(bx, 926, 1.2),
            ];
            this._poly(baseG, bPts, 0xd8d3bc, 0.35, 0x9b8d57, 1.1);
          }
        }

        const hiG = new this.P.Graphics();
        hiG.visible = false;

        container.addChild(baseG, hiG);

        if (zone.isFloorZone) {
          container.eventMode = 'static';
          container.cursor = 'pointer';
          container.hitArea = new this.P.Polygon(pts.flatMap((q) => [q.x, q.y]));
          container.on('pointertap', () => {
            if (this.dragDistance > 5 || this._suppressRackTap) return;
            this.selectZone(zone.zoneId);
            this.callbacks.onZoneSelect?.(zone.zoneId);
          });
        }

        this.layers.zones.addChild(container);
        this.zoneViews.set(zone.zoneId, {
          zone,
          container,
          baseG,
          hiG,
          pts,
          centroid: polygonCentroid(zone.polygon),
        });
      }
    }

    _drawWallsAndDocks() {
      const wg = new this.P.Graphics();
      const H = 200;

      for (const seg of this.layout.rearWallSegments) {
        if (seg.orientation === 'x') {
          const len = seg.x2 - seg.x1;
          this._box(wg, seg.x1 - 10, seg.y1 - 10, 0, len + 20, 10, H, 0xc9cdc7, 0xdce0d8, 0xa8b1ac, INK, 0.6);
          // High clerestory windows
          for (let x = seg.x1 + 20; x < seg.x2 - 80; x += 110) {
            this._poly(
              wg,
              [project(x, seg.y1 + 1, 134), project(x + 84, seg.y1 + 1, 134), project(x + 84, seg.y1 + 1, 178), project(x, seg.y1 + 1, 178)],
              0xb1cbd1,
              1,
              0x667b7b,
              1.6
            );
            this._line(wg, project(x, seg.y1 + 1.5, 156), project(x + 84, seg.y1 + 1.5, 156), 0x728887, 1.2);
          }
          // Steel columns
          for (let x = seg.x1; x <= seg.x2; x += 220) {
            this._box(wg, x, seg.y1 + 1, 0, 8, 9, H + 2, 0x677b79, 0x8b9b95, 0x526766, INK, 0.5);
          }
          for (const z of [112, 124, 190]) {
            this._line(wg, project(seg.x1, seg.y1 + 4, z), project(seg.x2, seg.y1 + 4, z), 0x677c79, 2.4);
          }
        } else {
          const len = seg.y2 - seg.y1;
          this._box(wg, seg.x1 - 10, seg.y1, 0, 10, len, H, 0xbcc4bf, 0xd8ddd6, 0xa8b3ad, INK, 0.6);
          for (let y = seg.y1 + 20; y < seg.y2 - 80; y += 110) {
            this._poly(
              wg,
              [project(seg.x1 + 1, y, 134), project(seg.x1 + 1, y + 84, 134), project(seg.x1 + 1, y + 84, 178), project(seg.x1 + 1, y, 178)],
              0xb2ced3,
              1,
              0x667b7b,
              1.6
            );
            this._line(wg, project(seg.x1 + 1.5, y, 156), project(seg.x1 + 1.5, y + 84, 156), 0x728887, 1.2);
          }
          for (let y = seg.y1; y <= seg.y2; y += 220) {
            this._box(wg, seg.x1 + 1, y, 0, 9, 8, H + 2, 0x677b79, 0x8b9b95, 0x526766, INK, 0.5);
          }
          for (const z of [112, 124, 190]) {
            this._line(wg, project(seg.x1 + 4, seg.y1, z), project(seg.x1 + 4, seg.y2, z), 0x677c79, 2.4);
          }
        }
      }

      // Loading dock doors on left wall
      for (const dock of this.layout.docks) {
        const y = dock.y;
        const w = dock.width;
        this._poly(
          wg,
          [project(1, y, 0), project(1, y + w, 0), project(1, y + w, 96), project(1, y, 96)],
          0x43514f,
          1,
          0x87968f,
          4
        );
        this._poly(
          wg,
          [project(2, y, 56), project(2, y + w, 56), project(2, y + w, 94), project(2, y, 94)],
          0xa4aeaa,
          1,
          INK,
          0.6
        );
        for (const yy of [y - 7, y + w + 4]) {
          this._box(wg, 8, yy, 0, 5, 5, 22, 0xccad51, 0xe1ca79, 0xa88736, INK, 0.5);
        }
        const t = new this.P.Text({
          text: dock.dockId,
          resolution: 2,
          style: { fontFamily: 'Segoe UI, Microsoft YaHei', fontSize: 11, fill: 0x465b55, fontWeight: '700' },
        });
        t.position.copyFrom(project(4, y + w / 2, 106));
        t.anchor.set(0.5);
        this.layers.walls.addChild(t);
      }

      this.layers.walls.addChildAt(wg, 0);
    }

    _drawZoneLabels() {
      for (const zone of this.layout.zones) {
        const [lx, ly] = zone.labelPos;
        const q = project(lx, ly, 4);
        const pill = new this.P.Graphics();
        const textVal = `${zone.code}  ${zone.name}`;
        const pillW = Math.max(114, textVal.length * 10.5 + 22);
        pill
          .roundRect(q.x - pillW / 2, q.y - 13, pillW, 25, 5)
          .fill({ color: 0xf4f5e9, alpha: 0.94 })
          .stroke({ color: 0x8ea195, width: 0.9 });
        const t = new this.P.Text({
          text: textVal,
          resolution: 2,
          style: { fontFamily: 'Segoe UI, Microsoft YaHei', fontSize: 11, fill: 0x384d47, fontWeight: '600' },
        });
        t.position.set(q.x, q.y);
        t.anchor.set(0.5);
        this.layers.labels.addChild(pill, t);
      }
    }

    // ---- Build 108 Racks + Subtle Props (Depth-Sorted) ----

    _buildSceneObjects(snapshot) {
      const sortable = [];

      // 108 Configurable Racks
      for (const rack of this.layout.racks) {
        const assets = this.textures.templates[rack.templateId];
        const { tpl } = assets;
        const container = new this.P.Container();
        const origin = project(rack.x, rack.y, 0);
        container.position.set(origin.x, origin.y);

        // Status / selection halos
        const activeRing = this._createBakedSprite(assets.rings.ACTIVE);
        activeRing.visible = false;
        const selectRing = this._createBakedSprite(assets.rings.SELECT);
        selectRing.visible = false;
        const highlightRing = this._createBakedSprite(assets.rings.PRIMARY);
        highlightRing.visible = false;

        // Macro LOD sprite
        const macroSprite = this._createBakedSprite(assets.macro.NORMAL);

        // Detail LOD group (rear frame -> per-locator uniform Symbolic Cargo Blocks -> front frame -> rack ID pill)
        const detailGroup = new this.P.Container();
        const rearSprite = this._createBakedSprite(assets.rearFrame);
        const cargoLayer = new this.P.Container();
        const frontSprite = this._createBakedSprite(assets.frontFrame);
        const labelBadge = new this.P.Container();
        const labelPill = new this.P.Graphics();
        const labelText = new this.P.Text({
          text: rack.rackId,
          resolution: 2,
          style: { fontFamily: 'Segoe UI, Microsoft YaHei', fontSize: 11, fill: 0x1f2e2a, fontWeight: '700' },
        });
        labelText.anchor.set(0.5);
        labelBadge.addChild(labelPill, labelText);
        const labelPos = project(tpl.width * 0.5, tpl.depth + 6, tpl.height + 14);
        labelBadge.position.set(labelPos.x, labelPos.y);

        detailGroup.addChild(rearSprite, cargoLayer, frontSprite);
        // Rings above the rack body — under the sprites they were almost invisible.
        // Keep the ID badge above the selection wash so the picked rack stays labeled.
        container.addChild(macroSprite, detailGroup, activeRing, highlightRing, selectRing, labelBadge);

        // Hit area covering the isometric footprint + height
        const hitPts = [
          project(0, 0, tpl.height),
          project(tpl.width, 0, tpl.height),
          project(tpl.width, 0, 0),
          project(tpl.width, tpl.depth, 0),
          project(0, tpl.depth, 0),
          project(0, tpl.depth, tpl.height),
        ];
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.hitArea = new this.P.Polygon(hitPts.flatMap((q) => [q.x, q.y]));

        container.on('pointertap', () => {
          if (this.dragDistance > 5 || this._suppressRackTap) return;
          const now = performance.now();
          const isDbl = this.lastRackTap.rackId === rack.rackId && now - this.lastRackTap.time < 300;
          this.lastRackTap = { rackId: rack.rackId, time: now };
          this.selectRack(rack.rackId);
          this.callbacks.onRackSelect?.(rack.rackId);
          if (isDbl) {
            this.callbacks.onRackDoubleClick?.(rack.rackId);
          }
        });

        const view = {
          rack,
          assets,
          container,
          macroSprite,
          detailGroup,
          cargoLayer,
          cargoSprites: new Map(), // locatorId -> { sprite, baseX, baseY }
          activeRing,
          selectRing,
          highlightRing,
          labelBadge,
          labelPill,
          labelText,
          selectPop: 0,
          summary: snapshot.racks[rack.rackId],
        };
        this._paintRackIdBadge(view);
        this.rackViews.set(rack.rackId, view);
        this._refreshRackVisual(view, { animateCargo: false });

        sortable.push({ depth: rack.x + tpl.width * 0.5 + rack.y + tpl.depth * 0.5, node: container });
      }

      // Packing benches in Z-PACK
      for (const b of this.layout.benches) {
        const c = new this.P.Container();
        const g = new this.P.Graphics();
        this._poly(g, [project(b.x + 4, b.y + 4, 0), project(b.x + 114, b.y + 4, 0), project(b.x + 114, b.y + 38, 0), project(b.x + 4, b.y + 38, 0)], 0x394d49, 0.11, 0x394d49, 0);
        for (const dx of [4, 102]) {
          for (const dy of [3, 28]) {
            this._box(g, b.x + dx, b.y + dy, 0, 3, 3, 24, 0x647e7a, 0x9eaaa0, 0x4f6664, INK, 0.45);
          }
        }
        this._box(g, b.x, b.y, 24, 110, 34, 3.5, 0xa5ada2, 0xd7d9c9, 0x7d8d84, INK, 0.5);
        // Workstation monitor
        this._box(g, b.x + 8, b.y + 6, 27.5, 18, 3, 14, 0x355958, 0x829c8f, 0x284a4e, INK, 0.45);
        c.addChild(g);
        sortable.push({ depth: b.x + 55 + b.y + 17, node: c });
      }

      // Docked delivery trucks at receiving docks
      for (const dock of this.layout.docks) {
        if (!dock.hasTruck) continue;
        const tx = 16, ty = dock.y + 16;
        const c = new this.P.Container();
        const g = new this.P.Graphics();
        this._box(g, tx, ty, 6, 86, 44, 46, 0xd2d7d0, 0xebeee3, 0xaab6ae, INK, 0.55);
        this._box(g, tx + 89, ty, 8, 26, 44, 30, dock.truckColor, 0x829fa2, 0x385568, INK, 0.55);
        c.addChild(g);
        sortable.push({ depth: tx + 55 + ty + 22, node: c });
      }

      sortable.sort((a, b) => a.depth - b.depth).forEach((s) => {
        s.node.zIndex = s.depth;
        this.layers.objects.addChild(s.node);
      });
      this.layers.objects.sortableChildren = true;
    }

    _paintRackIdBadge(view) {
      const text = view.labelText;
      const pill = view.labelPill;
      const selected = this.selectedRackId === view.rack.rackId;
      const padX = selected ? 10 : 8;
      const h = selected ? 22 : 19;
      const w = Math.max(selected ? 34 : 28, Math.ceil(text.width) + padX * 2);
      pill.clear();
      pill
        .roundRect(-w / 2, -h / 2, w, h, selected ? 10 : 9)
        .fill({ color: selected ? SELECT_HI : 0xf7f6ee, alpha: selected ? 0.98 : 0.96 })
        .stroke({ color: selected ? 0xffffff : 0x6f857c, width: selected ? 2.1 : 1.2 });
      text.style.fill = selected ? 0xffffff : 0x1f2e2a;
      text.position.set(0, 0);
    }

    _refreshRackVisual(view, opts = {}) {
      const animateCargo = opts.animateCargo !== false;
      const { assets, summary, cargoLayer, cargoSprites, macroSprite, activeRing, selectRing, highlightRing, container, rack } =
        view;
      const { tpl, bayW, levelH, blockW, blockD, blocks, macro } = assets;

      const hi = this.highlightState;
      const isPrimary = Boolean(hi && hi.primaryRacks.has(rack.rackId));
      const isSecondary = Boolean(hi && !isPrimary && hi.secondaryRacks.has(rack.rackId));
      const anyHighlight = Boolean(hi && hi.hasAnyTarget);

      // Update Macro LOD texture based on discrete semantic state (never fill-rate!)
      let macroKey = 'NORMAL';
      if (isPrimary) macroKey = 'PRIMARY';
      else if (isSecondary) macroKey = 'SECONDARY';
      else if (!summary.hasStock) macroKey = 'EMPTY';
      else if (summary.hasHold) macroKey = 'HOLD';
      macroSprite.texture = macro[macroKey].texture;

      // Diff-based Symbolic Cargo Blocks: presence pop-in/out only (never fake volume growth)
      const nextIds = new Set();
      for (const loc of summary.locators) {
        if (!loc.hasStock) continue;
        nextIds.add(loc.locatorId);
        const matchInfo = hi?.matchedLocators?.get(loc.locatorId);
        let blockKey = 'NORMAL';
        if (matchInfo?.role === 'primary') blockKey = 'PRIMARY';
        else if (matchInfo?.role === 'secondary') blockKey = 'SECONDARY';
        else if (loc.hasHold) blockKey = 'HOLD';

        const baked = blocks[blockKey];
        const bx = (loc.bay - 1) * bayW + (bayW - blockW) * 0.5;
        const by = (tpl.depth - blockD) * 0.5;
        const bz = 6.2 + (loc.level - 1) * levelH;
        const pos = project(bx, by, bz);
        const baseX = pos.x + baked.offsetX;
        const baseY = pos.y + baked.offsetY;

        let entry = cargoSprites.get(loc.locatorId);
        if (!entry) {
          const sp = new this.P.Sprite(baked.texture);
          if (animateCargo) {
            sp.alpha = 0;
            sp.position.set(baseX, baseY + 9);
            this.cargoAnims.push({
              sprite: sp,
              phase: 'in',
              t: 0,
              duration: 0.4,
              baseX,
              baseY,
            });
          } else {
            sp.alpha = 1;
            sp.position.set(baseX, baseY);
          }
          cargoLayer.addChild(sp);
          entry = { sprite: sp, baseX, baseY, textureKey: blockKey };
          cargoSprites.set(loc.locatorId, entry);
        } else {
          entry.sprite.texture = baked.texture;
          entry.baseX = baseX;
          entry.baseY = baseY;
          if (entry.sprite.alpha >= 0.98) {
            entry.sprite.position.set(baseX, baseY);
          }
          entry.textureKey = blockKey;
        }
      }

      for (const [locatorId, entry] of cargoSprites.entries()) {
        if (nextIds.has(locatorId)) continue;
        cargoSprites.delete(locatorId);
        if (animateCargo) {
          this.cargoAnims.push({
            sprite: entry.sprite,
            phase: 'out',
            t: 0,
            duration: 0.3,
            baseX: entry.baseX,
            baseY: entry.baseY,
          });
        } else {
          entry.sprite.destroy();
        }
      }

      // Highlight & active indicators
      const isSelected = this.selectedRackId === rack.rackId;
      activeRing.visible = summary.activePdas.length > 0 && !isPrimary && !isSecondary && !isSelected;
      selectRing.visible = isSelected;
      if (!isSelected) {
        selectRing.scale.set(1);
        selectRing.alpha = 1;
      }

      if (isPrimary) {
        highlightRing.texture = assets.rings.PRIMARY.texture;
        highlightRing.visible = true;
      } else if (isSecondary) {
        highlightRing.texture = assets.rings.SECONDARY.texture;
        highlightRing.visible = true;
      } else {
        highlightRing.visible = false;
      }

      // Highlight penetration dims every non-hit rack. A focused aisle instead
      // ghosts only the two racks that flank that aisle, so the floor pin reads.
      // A plain click dims neighbors so the selected rack is obvious in the dense yard.
      if (anyHighlight) {
        container.alpha = isPrimary || isSecondary || isSelected ? 1.0 : 0.19;
      } else if (this.selectedRackId) {
        container.alpha = isSelected ? 1.0 : 0.36;
      } else if (this.aisleFocusRackIds.size > 0 && this.aisleFocusRackIds.has(rack.rackId)) {
        container.alpha = 0.3;
      } else {
        container.alpha = 1.0;
      }

      // Apply LOD visibility (highlighted racks always show clear detail or crisp silhouette).
      // Rack ID pills live in detailGroup, so their visibility tracks showDetail / forceDetail.
      const forceDetail = isPrimary || isSecondary || isSelected;
      const showDetail = !this.isMacroLod || forceDetail;
      macroSprite.visible = !showDetail;
      view.detailGroup.visible = showDetail;
      if (view.labelBadge) {
        view.labelBadge.visible = showDetail;
        this._paintRackIdBadge(view);
      }
    }

    updateInventorySnapshot(snapshot) {
      for (const [rackId, view] of this.rackViews.entries()) {
        if (snapshot.racks[rackId]) {
          view.summary = snapshot.racks[rackId];
          this._refreshRackVisual(view, { animateCargo: true });
        }
      }
    }

    updateRackSummary(rackSummary) {
      const view = this.rackViews.get(rackSummary.rackId);
      if (!view) return;
      view.summary = rackSummary;
      this._refreshRackVisual(view, { animateCargo: true });
    }

    // ---- Highlight & Selection Management ----

    selectRack(rackId) {
      this.clearPdaFocus();
      this.selectedRackId = rackId;
      this.selectedZoneId = null;
      this._refreshZoneHighlights();
      for (const view of this.rackViews.values()) {
        if (view.rack.rackId === rackId) view.selectPop = 1;
        this._refreshRackVisual(view, { animateCargo: false });
      }
    }

    selectZone(zoneId) {
      this.clearPdaFocus();
      this.selectedRackId = null;
      this.selectedZoneId = zoneId;
      for (const view of this.rackViews.values()) {
        this._refreshRackVisual(view, { animateCargo: false });
      }
      this._refreshZoneHighlights();
    }

    clearSelection() {
      this.clearPdaFocus();
      this.selectedRackId = null;
      this.selectedZoneId = null;
      for (const view of this.rackViews.values()) {
        this._refreshRackVisual(view, { animateCargo: false });
      }
      this._refreshZoneHighlights();
    }

    setHighlight(result) {
      if (!result || (result.primaryRackIds.length === 0 && result.secondaryRackIds.length === 0 && result.primaryZoneIds.length === 0 && result.secondaryZoneIds.length === 0)) {
        this.highlightState = null;
      } else {
        const labels = new Map();
        for (const rec of result.records || []) {
          const key = rec.rackId ? `rack:${rec.rackId}` : `zone:${rec.zoneId}`;
          if (!labels.has(key)) labels.set(key, rec.batchNo);
        }
        this.highlightState = {
          primaryRacks: new Set(result.primaryRackIds),
          secondaryRacks: new Set(result.secondaryRackIds),
          primaryZones: new Set(result.primaryZoneIds),
          secondaryZones: new Set(result.secondaryZoneIds),
          matchedLocators: result.matchedLocators || new Map(),
          labels,
          hasAnyTarget: true,
        };
      }

      for (const view of this.rackViews.values()) {
        this._refreshRackVisual(view, { animateCargo: false });
      }
      this._refreshZoneHighlights();
      this._rebuildHighlightOverlay();
    }

    _refreshZoneHighlights() {
      const hi = this.highlightState;
      for (const [zoneId, zv] of this.zoneViews.entries()) {
        const isPrimary = Boolean(hi && hi.primaryZones.has(zoneId));
        const isSecondary = Boolean(hi && !isPrimary && hi.secondaryZones.has(zoneId));
        const isSelected = this.selectedZoneId === zoneId;
        zv.hiG.clear();
        if (isPrimary || isSecondary || isSelected) {
          const color = isPrimary ? PRIMARY_HI : isSecondary ? SECONDARY_HI : 0x1f6f5c;
          this._poly(zv.hiG, zv.pts, color, isSelected && !isPrimary && !isSecondary ? 0.14 : 0.24, color, 3.0);
          zv.hiG.visible = true;
        } else {
          zv.hiG.visible = false;
        }
      }
    }

    _rebuildHighlightOverlay() {
      this.layers.overlay.removeChildren();
      const hi = this.highlightState;
      if (!hi || !hi.hasAnyTarget) return;

      const drawPin = (x, y, z, title, subtitle, isPrimary, onClick) => {
        const q = project(x, y, z);
        const c = new this.P.Container();
        const color = isPrimary ? PRIMARY_HI : SECONDARY_HI;
        const g = new this.P.Graphics();
        const text = subtitle ? `${title} · ${subtitle}` : title;
        const w = Math.max(92, text.length * 7.2 + 20);
        // Stem line down to target
        g.moveTo(q.x, q.y).lineTo(q.x, q.y - 24).stroke({ color, width: 2.2 });
        g.circle(q.x, q.y, 4.2).fill(color).stroke({ color: 0xffffff, width: 1.4 });
        // Floating pill tag
        g.roundRect(q.x - w / 2, q.y - 47, w, 24, 5).fill(color).stroke({ color: 0xffffff, width: 1.5 });
        const t = new this.P.Text({
          text,
          resolution: 2,
          style: { fontFamily: 'Segoe UI, Microsoft YaHei', fontSize: 10.5, fill: 0xffffff, fontWeight: '700' },
        });
        t.position.set(q.x, q.y - 35);
        t.anchor.set(0.5);
        c.addChild(g, t);
        if (onClick) {
          c.eventMode = 'static';
          c.cursor = 'pointer';
          c.on('pointertap', () => {
            if (this.dragDistance > 5) return;
            onClick();
          });
        }
        this.layers.overlay.addChild(c);
      };

      for (const rackId of [...hi.primaryRacks, ...hi.secondaryRacks]) {
        const view = this.rackViews.get(rackId);
        if (!view) continue;
        const { rack, assets } = view;
        const isPrimary = hi.primaryRacks.has(rackId);
        drawPin(
          rack.x + assets.tpl.width * 0.5,
          rack.y + assets.tpl.depth * 0.5,
          assets.tpl.height + 6,
          rackId,
          hi.labels.get(`rack:${rackId}`),
          isPrimary,
          () => {
            this.selectRack(rackId);
            this.callbacks.onRackDoubleClick?.(rackId);
          }
        );
      }

      for (const zoneId of [...hi.primaryZones, ...hi.secondaryZones]) {
        const zv = this.zoneViews.get(zoneId);
        if (!zv) continue;
        const [cx, cy] = zv.centroid;
        const isPrimary = hi.primaryZones.has(zoneId);
        drawPin(cx, cy, 18, zv.zone.name, hi.labels.get(`zone:${zoneId}`), isPrimary, () => {
          this.selectZone(zoneId);
          this.callbacks.onZoneSelect?.(zoneId);
        });
      }
    }

    // ---- PDA markers: floor pin + rack-top badge, body only at aisle zoom ----

    setPdaCategoryFilter(category) {
      this.pdaCategoryFilter = category || 'ALL';
      this.syncPdas(this.latestPdas);
    }

    _shortPdaId(pdaId) {
      return String(pdaId).replace(/^PDA-/, '');
    }

    _pdaColor(group) {
      const cat = group[0] && group[0].category;
      if (cat && PDA_COLORS[cat] && group.every((p) => p.category === cat)) return PDA_COLORS[cat];
      return { main: 0x3d4f4c, top: 0x6a837e, side: 0x2c3d3a, badge: 0x3d4f4c };
    }

    _markerAnchor(target, slotIndex) {
      const fractions = [0.22, 0.5, 0.78];
      const slot = Math.max(0, Math.min(fractions.length - 1, slotIndex));
      if (target.rackId && this.rackViews.has(target.rackId)) {
        const { rack, assets } = this.rackViews.get(target.rackId);
        const { width, depth, height } = assets.tpl;
        const front = rack.aisleSide !== 'back';
        return {
          ax: rack.x + width * fractions[slot],
          ay: front ? rack.y + depth + 16 : rack.y - 16,
          zLift: height + 20,
          tickDir: front ? -1 : 1,
          rackId: rack.rackId,
        };
      }
      const zv = this.zoneViews.get(target.zoneId);
      if (zv && zv.zone.pdaAnchors && zv.zone.pdaAnchors.length > 0) {
        const [ax, ay] = zv.zone.pdaAnchors[slotIndex % zv.zone.pdaAnchors.length];
        return { ax, ay, zLift: 52, tickDir: 0, rackId: null };
      }
      return { ax: 200, ay: 300, zLift: 52, tickDir: 0, rackId: null };
    }

    // The rack across the working aisle: opposite face, overlapping X, aisle-sized gap.
    _aisleMateId(rackId) {
      const view = this.rackViews.get(rackId);
      if (!view) return null;
      const { rack, assets } = view;
      const faceY = rack.aisleSide === 'back' ? rack.y : rack.y + assets.tpl.depth;
      const looksFront = rack.aisleSide !== 'back';
      const x0 = rack.x;
      const x1 = rack.x + assets.tpl.width;
      let best = null;
      let bestGap = Infinity;
      for (const other of this.rackViews.values()) {
        if (other.rack.rackId === rackId) continue;
        const oFront = other.rack.aisleSide !== 'back';
        if (oFront === looksFront) continue;
        const oFace = oFront ? other.rack.y + other.assets.tpl.depth : other.rack.y;
        if (looksFront ? oFace <= faceY : oFace >= faceY) continue;
        const gap = Math.abs(oFace - faceY);
        if (gap < 40 || gap > 200 || gap >= bestGap) continue;
        const overlap = Math.min(x1, other.rack.x + other.assets.tpl.width) - Math.max(x0, other.rack.x);
        if (overlap < Math.min(assets.tpl.width, other.assets.tpl.width) * 0.45) continue;
        bestGap = gap;
        best = other.rack.rackId;
      }
      return best;
    }

    _applyAisleFocus(nextIds) {
      const prev = this.aisleFocusRackIds;
      this.aisleFocusRackIds = nextIds;
      const touched = new Set([...(prev || []), ...nextIds]);
      for (const id of touched) {
        const view = this.rackViews.get(id);
        if (view) this._refreshRackVisual(view, { animateCargo: false });
      }
    }

    _setPdaFocus(key, pdaId) {
      this.expandedPdaKey = key;
      this.selectedPdaId = pdaId || null;
      const racks = new Set();
      if (key && key.startsWith('rack:')) {
        const rackId = key.slice(5);
        racks.add(rackId);
        const mate = this._aisleMateId(rackId);
        if (mate) racks.add(mate);
      }
      this._applyAisleFocus(racks);
      this.syncPdas(this.latestPdas || []);
    }

    clearPdaFocus() {
      if (this._clearingPdaFocus) return;
      if (!this.expandedPdaKey && !this.selectedPdaId && this.aisleFocusRackIds.size === 0) return;
      this._clearingPdaFocus = true;
      try {
        this.expandedPdaKey = null;
        this.selectedPdaId = null;
        this._applyAisleFocus(new Set());
        this.syncPdas(this.latestPdas || []);
      } finally {
        this._clearingPdaFocus = false;
      }
    }

    selectPda(pda) {
      if (!pda) return;
      const key = pda.target && pda.target.rackId ? `rack:${pda.target.rackId}` : `zone:${pda.target.zoneId}`;
      this._setPdaFocus(key, pda.pdaId);
    }

    _badgeScreenScale() {
      const s = Math.max(0.2, this.world.scale.x || 1);
      return Math.max(1, Math.min(2.4, 0.92 / s));
    }

    _markerPlacements(key, group) {
      const isRack = key.startsWith('rack:');
      const expanded = this.expandedPdaKey === key;
      if (isRack && !expanded) {
        const extra = group.length - 1;
        const solo = extra === 0;
        return [
          {
            id: solo ? group[0].pdaId : `cluster:${key}`,
            kind: solo ? 'solo' : 'cluster',
            pda: group[0],
            group,
            slotIndex: 1,
            label: solo ? this._shortPdaId(group[0].pdaId) : `${this._shortPdaId(group[0].pdaId)} +${extra}`,
          },
        ];
      }
      const visibleCount = Math.min(3, group.length);
      const slotFor = (index) => {
        if (visibleCount <= 1) return 1;
        if (visibleCount === 2) return index === 0 ? 0 : 2;
        return index;
      };
      const placements = [];
      for (let i = 0; i < visibleCount; i++) {
        const pda = group[i];
        const extra = i === visibleCount - 1 ? group.length - visibleCount : 0;
        placements.push({
          id: pda.pdaId,
          kind: extra > 0 ? 'cluster' : 'solo',
          pda,
          group: extra > 0 ? group : [pda],
          slotIndex: slotFor(i),
          label: extra > 0 ? `${this._shortPdaId(pda.pdaId)} +${extra}` : this._shortPdaId(pda.pdaId),
        });
      }
      return placements;
    }

    _seedMarkerPosition(placement, fallback) {
      if (placement.kind === 'solo') {
        const prev = this.pdaMotion.get(placement.pda.pdaId);
        if (prev) return prev;
      }
      for (const pda of placement.group) {
        const prev = this.pdaMotion.get(pda.pdaId);
        if (prev) return prev;
      }
      return fallback;
    }

    _bindMarkerTap(target, id) {
      target.eventMode = 'static';
      target.cursor = 'pointer';
      target.on('pointerdown', (e) => {
        e.stopPropagation();
        this._suppressRackTap = true;
      });
      target.on('pointertap', (e) => {
        e.stopPropagation();
        this._suppressRackTap = true;
        if (this.dragDistance > 5) return;
        const marker = this.pdaMarkers.get(id);
        if (!marker || marker.fadingOut) return;
        const group = marker.group.slice();
        const pda = marker.pda;
        const key = marker.key;
        const kind = marker.kind;
        // Rebuild after this event so the rack underneath is not retargeted mid-tap.
        queueMicrotask(() => {
          if (kind === 'cluster') {
            this._setPdaFocus(key, null);
            this.callbacks.onPdaClusterSelect?.(group);
          } else {
            this._setPdaFocus(key, pda.pdaId);
            this.callbacks.onPdaSelect?.(pda);
          }
        });
      });
    }

    _createMarker(id, seed, startAlpha) {
      const P = this.P;
      const ground = new P.Container();
      ground.eventMode = 'none';
      ground.position.set(seed.x, seed.y);
      ground.alpha = startAlpha;
      const figure = new P.Sprite(this.textures.pda.INBOUND.texture);
      figure.eventMode = 'none';
      figure.visible = !this.isMacroLod;
      ground.addChild(figure);
      this.layers.objects.addChild(ground);

      const air = new P.Container();
      air.eventMode = 'passive';
      air.position.set(seed.x, seed.y);
      air.alpha = startAlpha;
      const pinG = new P.Graphics();
      const stem = new P.Graphics();
      const pinHit = new P.Container();
      pinHit.hitArea = new P.Rectangle(-16, -12, 32, 24);
      const badgeWrap = new P.Container();
      const badgeG = new P.Graphics();
      const text = new P.Text({
        text: '',
        resolution: 2,
        style: { fontFamily: 'Segoe UI, Microsoft YaHei', fontSize: 11, fill: 0xffffff, fontWeight: '700' },
      });
      text.anchor.set(0.5);
      text.eventMode = 'none';
      pinG.eventMode = 'none';
      stem.eventMode = 'none';
      badgeG.eventMode = 'none';
      badgeWrap.addChild(badgeG, text);
      air.addChild(pinG, stem, pinHit, badgeWrap);
      this.layers.pdas.addChild(air);
      this._bindMarkerTap(pinHit, id);
      this._bindMarkerTap(badgeWrap, id);

      const marker = {
        id,
        ground,
        air,
        pinG,
        stem,
        pinHit,
        badgeWrap,
        badgeG,
        text,
        figure,
        figureKey: null,
        figureBaseX: 0,
        figureBaseY: 0,
        group: [],
        logicalX: seed.x,
        logicalY: seed.y,
        fadingOut: false,
        bobPhase: Math.random() * Math.PI * 2,
        arrivePulse: 1,
        paintKey: '',
      };
      this.pdaMarkers.set(id, marker);
      return marker;
    }

    _destroyMarker(id) {
      const marker = this.pdaMarkers.get(id);
      if (!marker) return;
      marker.ground.destroy({ children: true });
      marker.air.destroy({ children: true });
      this.pdaMarkers.delete(id);
    }

    _paintMarker(marker) {
      const scale = Math.max(0.2, this.world.scale.x || 1);
      const stemBucket = Math.round(Math.max(1.4, 2 / scale) * 2) / 2;
      const paintKey = [marker.color.main, marker.selected ? 1 : 0, marker.tickDir, marker.zLift, marker.label, stemBucket].join(':');
      if (marker.paintKey === paintKey) return;
      marker.paintKey = paintKey;

      const color = marker.color.main;
      const selected = marker.selected;
      const g = marker.pinG;
      g.clear();
      g.ellipse(0, 1, selected ? 11 : 8.5, selected ? 5.2 : 4.1)
        .fill({ color, alpha: selected ? 0.58 : 0.4 })
        .stroke({ color: selected ? 0xffffff : color, width: selected ? 2.2 : 1.45, alpha: 0.96 });
      g.ellipse(0, 1, 2.1, 1.15).fill({ color: 0xffffff, alpha: 0.94 });
      if (marker.tickDir) {
        const sx = -marker.tickDir * 0.88;
        const sy = marker.tickDir * 0.44;
        const mag = Math.hypot(sx, sy) || 1;
        const ux = sx / mag;
        const uy = sy / mag;
        g.moveTo(ux * 5, uy * 5 + 1).lineTo(ux * 15, uy * 15 + 1).stroke({ color, width: 2.6, alpha: 0.96 });
      }

      marker.stem.clear();
      marker.stem.moveTo(0, -marker.zLift + 8).lineTo(0, -7).stroke({ color, width: stemBucket, alpha: 0.9 });

      const h = 16;
      const w = marker.badgeW;
      marker.badgeG.clear();
      marker.badgeG
        .roundRect(-w / 2, -h / 2, w, h, 8)
        .fill({ color, alpha: 0.96 })
        .stroke({ color: selected ? 0xffffff : 0xe7f3ee, width: selected ? 2 : 1.1 });
      marker.text.text = marker.label;
      marker.badgeWrap.position.set(0, -marker.zLift);
      marker.badgeWrap.hitArea = new this.P.Rectangle(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
    }

    _upsertMarker(placement, key, anchor, liveKeys) {
      const pos = project(anchor.ax, anchor.ay, 0);
      let marker = this.pdaMarkers.get(placement.id);
      if (!marker) {
        const seed = this._seedMarkerPosition(placement, pos);
        const startAlpha = liveKeys.has(key) ? 1 : 0.05;
        marker = this._createMarker(placement.id, seed, startAlpha);
      }

      const moved = Math.hypot(pos.x - (marker.targetX ?? pos.x), pos.y - (marker.targetY ?? pos.y)) > 2;
      marker.key = key;
      marker.kind = placement.kind;
      marker.pda = placement.pda;
      marker.group = placement.group;
      marker.color = this._pdaColor(placement.group);
      marker.selected = this.expandedPdaKey === key;
      marker.tickDir = anchor.tickDir;
      marker.zLift = anchor.zLift;
      marker.label = placement.label;
      marker.badgeW = Math.max(30, placement.label.length * 6.6 + 14);
      marker.fadingOut = false;
      marker.targetX = pos.x;
      marker.targetY = pos.y;
      if (moved) marker.arrivePulse = 1;

      const category = placement.pda.category;
      const baked = this.textures.pda[category] || this.textures.pda.INBOUND;
      if (marker.figureKey !== category) {
        marker.figure.texture = baked.texture;
        marker.figureBaseX = baked.offsetX;
        marker.figureBaseY = baked.offsetY;
        marker.figure.position.set(baked.offsetX, baked.offsetY);
        marker.figureKey = category;
      }
      marker.figure.visible = !this.isMacroLod;
      const depth = this.expandedPdaKey === key && anchor.rackId ? 100000 + anchor.ax + anchor.ay : anchor.ax + anchor.ay;
      if (marker.ground.zIndex !== depth) marker.ground.zIndex = depth;
      marker.ground.visible = this.pdaLayerVisible && !this.isMacroLod;
      this._paintMarker(marker);
      return marker;
    }

    syncPdas(pdas) {
      this.latestPdas = pdas || [];
      const visiblePdas =
        this.pdaCategoryFilter === 'ALL' ? this.latestPdas : this.latestPdas.filter((p) => p.category === this.pdaCategoryFilter);

      const groups = new Map();
      for (const pda of visiblePdas) {
        const key = pda.target.rackId ? `rack:${pda.target.rackId}` : `zone:${pda.target.zoneId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(pda);
      }

      if (this.expandedPdaKey && !groups.has(this.expandedPdaKey)) {
        this.expandedPdaKey = null;
        this.selectedPdaId = null;
        this._applyAisleFocus(new Set());
      }

      const liveKeys = new Set();
      for (const marker of this.pdaMarkers.values()) {
        if (!marker.fadingOut) liveKeys.add(marker.key);
      }

      const nextIds = new Set();
      for (const [key, group] of groups.entries()) {
        const placements = this._markerPlacements(key, group);
        for (const placement of placements) {
          nextIds.add(placement.id);
          const anchor = this._markerAnchor(group[0].target, placement.slotIndex);
          this._upsertMarker(placement, key, anchor, liveKeys);
        }
      }

      const retire = [];
      for (const [id, marker] of this.pdaMarkers.entries()) {
        if (!nextIds.has(id)) retire.push([id, marker]);
      }
      for (const [id, marker] of retire) {
        if (groups.has(marker.key)) this._destroyMarker(id);
        else marker.fadingOut = true;
      }
    }

    // ---- Tick Loop: Camera, PDA Transitions, Cargo Presence, Pulse & FPS ----

    _onTick(ticker) {
      const dt = Math.min(ticker.deltaMS || 16.6, 50) / 1000;
      this.pulsePhase += dt * 3.2;

      // Rolling FPS calculation
      this.fpsFrames++;
      const now = performance.now();
      if (now - this.fpsLastTime >= 500) {
        this.currentFps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
        this.fpsFrames = 0;
        this.fpsLastTime = now;
      }

      // Eased camera fly / focus
      if (this.cameraTween) {
        const tw = this.cameraTween;
        tw.t += dt;
        const u = this._easeOutCubic(tw.t / tw.duration);
        this.world.position.set(
          tw.fromX + (tw.toX - tw.fromX) * u,
          tw.fromY + (tw.toY - tw.fromY) * u
        );
        this.world.scale.set(tw.fromScale + (tw.toScale - tw.fromScale) * u);
        this._updateLodAndZoom();
        if (tw.t >= tw.duration) this.cameraTween = null;
      }

      // Symbolic cargo presence transitions
      if (this.cargoAnims.length) {
        const live = [];
        for (const anim of this.cargoAnims) {
          if (!anim.sprite || anim.sprite.destroyed) continue;
          anim.t += dt;
          const u = this._easeOutCubic(anim.t / anim.duration);
          if (anim.phase === 'in') {
            anim.sprite.alpha = u;
            anim.sprite.position.set(anim.baseX, anim.baseY + 9 * (1 - u));
            if (anim.t < anim.duration) live.push(anim);
            else {
              anim.sprite.alpha = 1;
              anim.sprite.position.set(anim.baseX, anim.baseY);
            }
          } else {
            anim.sprite.alpha = 1 - u;
            anim.sprite.position.set(anim.baseX, anim.baseY - 7 * u);
            if (anim.t < anim.duration) live.push(anim);
            else anim.sprite.destroy();
          }
        }
        this.cargoAnims = live;
      }

      // Floor pin and badge share one screen point. Only the aisle figure bobs.
      // Keep rack ID pills screen-stable (same clamp idea as PDA; cap ~2.2).
      const badgeScale = this._badgeScreenScale();
      const rackBadgeScale = Math.min(2.2, badgeScale);
      for (const view of this.rackViews.values()) {
        if (view.labelBadge && view.labelBadge.visible && view.detailGroup.visible) {
          view.labelBadge.scale.set(rackBadgeScale);
        }
      }
      for (const [id, marker] of this.pdaMarkers.entries()) {
        const lerp = Math.min(1, dt * 7.2);
        marker.logicalX += (marker.targetX - marker.logicalX) * lerp;
        marker.logicalY += (marker.targetY - marker.logicalY) * lerp;
        marker.ground.position.set(marker.logicalX, marker.logicalY);
        marker.air.position.set(marker.logicalX, marker.logicalY);

        marker.bobPhase += dt * 2.1;
        const bob = marker.fadingOut || this.isMacroLod ? 0 : Math.sin(marker.bobPhase) * 1.15;
        marker.figure.position.set(marker.figureBaseX, marker.figureBaseY + bob);

        if (marker.arrivePulse > 0) marker.arrivePulse = Math.max(0, marker.arrivePulse - dt * 2.8);
        const pop = marker.arrivePulse > 0 ? 1 + 0.14 * Math.sin((1 - marker.arrivePulse) * Math.PI) : 1;
        marker.badgeWrap.scale.set(badgeScale * pop);
        this._paintMarker(marker);

        if (!marker.fadingOut) {
          for (const pda of marker.group) this.pdaMotion.set(pda.pdaId, { x: marker.logicalX, y: marker.logicalY });
          if (marker.air.alpha < 1) {
            const alpha = Math.min(1, marker.air.alpha + dt * 3.5);
            marker.air.alpha = alpha;
            marker.ground.alpha = alpha;
          }
        } else {
          marker.air.alpha = Math.max(0, marker.air.alpha - dt * 2.2);
          marker.ground.alpha = marker.air.alpha;
          if (marker.air.alpha <= 0.02) this._destroyMarker(id);
        }
      }

      // Gentle breathing alpha on active/highlighted/selected rack rings
      const pulse = 0.68 + 0.32 * Math.sin(this.pulsePhase);
      for (const view of this.rackViews.values()) {
        if (view.activeRing.visible) view.activeRing.alpha = pulse;
        if (view.highlightRing.visible) view.highlightRing.alpha = 0.78 + 0.22 * Math.sin(this.pulsePhase * 1.3);
        if (view.selectRing.visible) {
          if (view.selectPop > 0) {
            view.selectPop = Math.max(0, view.selectPop - dt * 2.4);
            const pop = 1 + 0.16 * Math.sin((1 - view.selectPop) * Math.PI);
            view.selectRing.scale.set(pop);
          } else {
            view.selectRing.scale.set(1);
          }
          view.selectRing.alpha = 0.78 + 0.22 * Math.sin(this.pulsePhase * 1.55);
        }
      }
    }

    // ---- Camera, Zoom LOD, Focus & Layer Toggles ----

    _updateLodAndZoom() {
      const ratio = this.world.scale.x / this.baseScale;
      const nextMacro = ratio < 1.18;
      if (nextMacro !== this.isMacroLod) {
        this.isMacroLod = nextMacro;
        for (const view of this.rackViews.values()) {
          const isHi = Boolean(
            this.highlightState &&
              (this.highlightState.primaryRacks.has(view.rack.rackId) ||
                this.highlightState.secondaryRacks.has(view.rack.rackId))
          );
          const showDetail = !this.isMacroLod || isHi || this.selectedRackId === view.rack.rackId;
          view.macroSprite.visible = !showDetail;
          view.detailGroup.visible = showDetail;
          if (view.labelBadge) view.labelBadge.visible = showDetail;
        }
        for (const marker of this.pdaMarkers.values()) {
          marker.figure.visible = !this.isMacroLod;
          marker.ground.visible = this.pdaLayerVisible && !this.isMacroLod;
        }
      }
      this.callbacks.onZoomChange?.(Math.round(ratio * 100), this.isMacroLod);
    }

    reset(opts = {}) {
      const animate = opts.animate !== false;
      const fit = this._computeFitCamera();
      this.baseScale = fit.scale;
      if (animate) {
        this.easeCameraTo(fit, 0.75);
      } else {
        this._cancelCameraTween();
        this.world.scale.set(fit.scale);
        this.world.position.set(fit.x, fit.y);
        this._updateLodAndZoom();
      }
    }

    zoom(factor, pivot) {
      this._cancelCameraTween();
      const w = this.host.clientWidth || 1280;
      const h = this.host.clientHeight || 720;
      const pt = pivot || { x: w / 2, y: h / 2 };
      const prev = this.world.scale.x;
      const next = Math.max(this.baseScale * 0.65, Math.min(this.baseScale * 4.2, prev * factor));
      const ratio = next / prev;
      this.world.position.set(pt.x - (pt.x - this.world.x) * ratio, pt.y - (pt.y - this.world.y) * ratio);
      this.world.scale.set(next);
      this._updateLodAndZoom();
    }

    focusWorldPoint(wx, wy, targetZoomRatio = 1.65, opts = {}) {
      const soft = Boolean(opts.soft);
      const animate = opts.animate !== false;
      const duration = opts.duration ?? (soft ? 0.55 : 0.85);
      const cam = this._computeFocusCamera(wx, wy, targetZoomRatio, soft);
      if (animate) {
        this.easeCameraTo(cam, duration);
      } else {
        this._cancelCameraTween();
        this.world.scale.set(cam.scale);
        this.world.position.set(cam.x, cam.y);
        this._updateLodAndZoom();
      }
    }

    focusOnRack(rackId, opts = {}) {
      const view = this.rackViews.get(rackId);
      if (!view) return;
      this.focusWorldPoint(
        view.rack.x + view.assets.tpl.width * 0.5,
        view.rack.y + view.assets.tpl.depth * 0.5,
        opts.zoomRatio ?? 1.75,
        opts
      );
    }

    focusOnZone(zoneId, opts = {}) {
      const zv = this.zoneViews.get(zoneId);
      if (!zv) return;
      this.focusWorldPoint(zv.centroid[0], zv.centroid[1], opts.zoomRatio ?? 1.35, opts);
    }

    frameTargets(targets, opts = {}) {
      const points = [];
      (targets || []).forEach((target) => {
        if (target.rackId && this.rackViews.has(target.rackId)) {
          const view = this.rackViews.get(target.rackId);
          points.push(project(view.rack.x + view.assets.tpl.width * 0.5, view.rack.y + view.assets.tpl.depth * 0.5, 40));
        } else if (target.zoneId && this.zoneViews.has(target.zoneId)) {
          const zv = this.zoneViews.get(target.zoneId);
          points.push(project(zv.centroid[0], zv.centroid[1], 20));
        }
      });
      if (!points.length) return;
      if (points.length === 1) {
        const only = (targets || []).find((target) => (target.rackId && this.rackViews.has(target.rackId)) || (target.zoneId && this.zoneViews.has(target.zoneId)));
        if (only?.rackId && this.rackViews.has(only.rackId)) this.focusOnRack(only.rackId, opts);
        else if (only?.zoneId) this.focusOnZone(only.zoneId, opts);
        return;
      }
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      points.forEach((pt) => {
        minX = Math.min(minX, pt.x);
        maxX = Math.max(maxX, pt.x);
        minY = Math.min(minY, pt.y);
        maxY = Math.max(maxY, pt.y);
      });
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const spanX = Math.max(80, maxX - minX + 180);
      const spanY = Math.max(80, maxY - minY + 140);
      const w = this.host.clientWidth || 1280;
      const h = this.host.clientHeight || 720;
      const fit = Math.min((w * 0.62) / spanX, (h * 0.62) / spanY);
      const scale = Math.max(this.baseScale * 0.85, Math.min(this.baseScale * 2.2, fit));
      const cam = { scale, x: w * 0.44 - cx * scale, y: h * 0.52 - cy * scale };
      if (opts.animate === false) {
        this._cancelCameraTween();
        this.world.scale.set(cam.scale);
        this.world.position.set(cam.x, cam.y);
        this._updateLodAndZoom();
      } else {
        this.easeCameraTo(cam, opts.duration ?? 0.85);
      }
    }

    setLayerVisible(layerName, visible) {
      if (layerName === 'pdas') {
        this.pdaLayerVisible = visible;
        if (this.layers.pdas) this.layers.pdas.visible = visible;
        for (const marker of this.pdaMarkers.values()) {
          marker.ground.visible = visible && !this.isMacroLod;
        }
        return;
      }
      if (this.layers[layerName]) this.layers[layerName].visible = visible;
    }

    getFps() {
      return this.currentFps;
    }

    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;

      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }

      if (this._canvasUnbind) {
        for (const unbind of this._canvasUnbind) unbind();
        this._canvasUnbind = null;
      }

      const app = this.app;
      this.app = null;
      this._teardownApp(app);
    }

    // Pixi 8.14 Application.destroy(rendererDestroyOptions, stageOptions):
    // true removes the canvas and releases the renderer; stage options destroy children.
    _teardownApp(app) {
      if (!app || !app.renderer) return;
      const ticker = app.ticker;
      if (ticker && typeof ticker.stop === 'function') ticker.stop();
      app.destroy(true, { children: true });
    }

    _bindInteractions() {
      const canvas = this.app.canvas;
      const unbinders = [];
      const listen = (type, handler, options) => {
        canvas.addEventListener(type, handler, options);
        unbinders.push(() => canvas.removeEventListener(type, handler, options));
      };
      this._canvasUnbind = unbinders;

      listen(
        'wheel',
        (e) => {
          e.preventDefault();
          const r = canvas.getBoundingClientRect();
          this.zoom(Math.exp(-e.deltaY * 0.0011), { x: e.clientX - r.left, y: e.clientY - r.top });
        },
        { passive: false }
      );

      listen('pointerdown', (e) => {
        if (e.button !== 0) return;
        this.dragDistance = 0;
        this.drag = { x: e.clientX, y: e.clientY, wx: this.world.x, wy: this.world.y };
        canvas.setPointerCapture(e.pointerId);
      });

      listen('pointermove', (e) => {
        if (!this.drag) return;
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        this.dragDistance = Math.max(this.dragDistance, Math.hypot(dx, dy));
        if (this.dragDistance > 5) {
          this._cancelCameraTween();
          this.world.position.set(this.drag.wx + dx, this.drag.wy + dy);
        }
      });

      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        listen(type, () => {
          this.drag = null;
          queueMicrotask(() => {
            this._suppressRackTap = false;
          });
        });
      }

      // Preserve camera position across resize unless container was initially zero; only gently clamp/re-measure
      let prevW = this.host.clientWidth;
      let prevH = this.host.clientHeight;
      this._resizeObserver = new ResizeObserver(() => {
        if (this._destroyed) return;
        const w = this.host.clientWidth;
        const h = this.host.clientHeight;
        if (w > 0 && h > 0 && (Math.abs(w - prevW) > 12 || Math.abs(h - prevH) > 12)) {
          prevW = w;
          prevH = h;
          this.reset({ animate: false });
        }
      });
      this._resizeObserver.observe(this.host);
    }
  }

  WMS.project = project;
  WMS.WarehouseRenderer = WarehouseRenderer;
})(window);
