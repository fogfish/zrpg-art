// water.js — reference renderer for natural-looking ponds, lakes and rivers
// built from the ZRPG sprite catalogue (../catalog.js + ../atlas/atlas-0.png).
//
// The catalogue has no shore/edge autotiles. Natural water is therefore NOT
// assembled from tiles; it is painted in distance bands around a water mask:
//
//   shape -> water mask -> signed distance field S -> bands -> layers -> decor
//
// See WATER-SPEC.md for the algorithm and every parameter used below.
// Works from file:// (never reads pixels back from a canvas that holds art).
(function (global) {
  'use strict';

  // ------------------------------------------------------------ random/noise
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y, s) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // value noise in [0,1)
  function vnoise(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s);
    const c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  // fractal noise in ~[-1,1]
  function fbm(x, y, s, oct) {
    oct = oct || 3;
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let i = 0; i < oct; i++) {
      sum += amp * (vnoise(x * f, y * f, s + i * 101) * 2 - 1);
      norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
  }
  // 4x4 ordered dither offsets in [-0.5,0.5)
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
  const bayer = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ------------------------------------------------- exact distance transform
  // Felzenszwalb & Huttenlocher squared EDT, O(n).
  const INF = 1e20;
  function edt1d(f, n, d, v, z) {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  }
  // distance from every cell to the nearest cell where site(i) is true
  function edt(site, w, h) {
    const g = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = site[i] ? 0 : INF;
    const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n);
    const v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = g[y * w + x];
      edt1d(f, h, d, v, z);
      for (let y = 0; y < h; y++) g[y * w + x] = d[y];
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) f[x] = g[y * w + x];
      edt1d(f, w, d, v, z);
      for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]);
    }
    return g;
  }

  // ------------------------------------------------------------------ canvas
  function mkCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function ctx2d(c) { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; }

  // ----------------------------------------------------------------- sprites
  class Sprites {
    constructor(cat, atlases) {
      this.cat = cat; this.atlases = atlases;
      this.byId = new Map(cat.sprites.map(s => [s.id, s]));
      this._tiles = new Map();
    }
    get(id) {
      const s = this.byId.get(id);
      if (!s) throw new Error('unknown sprite ' + id);
      return s;
    }
    // draw so the sprite's anchor (foot point) lands on (x, y)
    draw(ctx, id, x, y) {
      const s = this.get(id), a = s.atlas;
      ctx.drawImage(this.atlases[a.index], a.x, a.y, a.w, a.h,
        Math.round(x - s.anchor.x), Math.round(y - s.anchor.y), a.w, a.h);
    }
    // draw the raw sprite rect with its top-left at (x, y)
    blit(ctx, id, x, y) {
      const s = this.get(id), a = s.atlas;
      ctx.drawImage(this.atlases[a.index], a.x, a.y, a.w, a.h, Math.round(x), Math.round(y), a.w, a.h);
    }
    // A seamless texture canvas made from a terrain tile. fillHoles draws a
    // half-offset copy underneath, which plugs the transparent "hole" that
    // many ZRPG ground tiles have in their centre.
    tile(id, fillHoles) {
      const key = id + (fillHoles ? '+' : '');
      if (this._tiles.has(key)) return this._tiles.get(key);
      const s = this.get(id), c = mkCanvas(s.w, s.h), x = ctx2d(c);
      if (fillHoles) {
        const hx = Math.floor(s.w / 2), hy = Math.floor(s.h / 2);
        for (const [dx, dy] of [[hx, hy], [hx - s.w, hy], [hx, hy - s.h], [hx - s.w, hy - s.h]]) this.blit(x, id, dx, dy);
      }
      this.blit(x, id, 0, 0);
      this._tiles.set(key, c);
      return c;
    }
    pattern(ctx, id, fillHoles) { return ctx.createPattern(this.tile(id, fillHoles), 'repeat'); }
  }

  function loadImage(src) {
    return new Promise((ok, err) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => err(new Error('cannot load ' + src));
      img.src = src;
    });
  }
  // base: path prefix of the folder that holds catalog.js / atlas/
  async function load(base) {
    const cat = global.TILE_CATALOG;
    if (!cat) throw new Error('catalog.js is not loaded (window.TILE_CATALOG is missing)');
    const atlases = await Promise.all(cat.atlases.map(a => loadImage(base + a.file)));
    return new Sprites(cat, atlases);
  }

  // ------------------------------------------------------------ shore styles
  // Units: px at 1x. S = signed distance to the waterline (S < 0 is water).
  // Wsh = local shore width. Decor bands use s:[a,b] (px of S) or t:[a,b] (S/Wsh).
  const SAND_SHELLS = ['beach-prop-001', 'beach-prop-003', 'beach-prop-004', 'beach-prop-005', 'beach-prop-006',
    'beach-prop-007', 'beach-prop-009', 'beach-prop-010', 'beach-prop-013', 'beach-prop-015', 'beach-prop-017',
    'beach-prop-019', 'beach-prop-022', 'beach-prop-023'];
  const SMALL_PEBBLES = ['beach-rock-001', 'beach-rock-002', 'beach-rock-004', 'beach-rock-005', 'beach-rock-006',
    'beach-rock-007', 'beach-rock-008', 'beach-rock-009', 'beach-rock-010', 'beach-rock-011', 'beach-rock-012'];
  const GRASS_SPRIGS = ['beach-plant-004', 'beach-plant-005', 'beach-plant-006', 'beach-plant-007', 'beach-plant-008',
    'beach-plant-010', 'beach-plant-011', 'beach-plant-012'];

  // decor shared by every shore: breaks up the ground far from water
  const COMMON_DECOR = [
    { name: 'meadow flowers', ids: ['trees-plant-001', 'trees-plant-002', 'trees-plant-003'], s: [40, 1e9], per100: 0.8, spacing: 22 },
  ];

  const STYLES = {
    sand: {
      label: 'Sand',
      ground: 'rocks2-terrain-014',
      shoreWidth: [10, 24],      // band width range, varied by low-frequency noise
      edgeRag: 1.0,              // waterline wobble (px)
      outerRag: 3.5,             // outer shore edge wobble (px)
      bands: [
        { name: 'sand', tex: 'beach-terrain-026', to: 1 },                          // to: in Wsh units
        { name: 'wet sand', color: 'rgba(120,72,28,0.30)', toPx: 4, rag: 1.5 },
      ],
      face: { h: [1, 2], tex: 'beach-terrain-026', tint: 'rgba(110,62,18,0.55)' },
      water: {
        tint: 'rgba(30,150,175,0.22)',
        shallow: [[10, 'rgba(90,205,210,0.28)'], [4.5, 'rgba(160,235,220,0.32)']],
        shadow: { h: 1, color: 'rgba(0,20,50,0.25)' },
        rim: 'rgba(250,252,255,0.9)',
        foam: 'rgba(240,250,255,0.75)', foamSpread: 1.3,
      },
      decor: [
        { name: 'sand clumps', layer: 'ground', ids: ['beach-terrain-016', 'beach-terrain-017', 'beach-terrain-018', 'beach-terrain-019'], t: [0.95, 1.25], per100: 2.6, spacing: 9 },
        { name: 'sand splat', layer: 'ground', ids: ['beach-terrain-006'], t: [0.9, 1.15], per100: 0.5, spacing: 40 },
        { name: 'shells', ids: SAND_SHELLS, t: [0.15, 0.85], per100: 1.3, spacing: 16 },
        { name: 'pebbles', ids: SMALL_PEBBLES, t: [0.0, 0.45], per100: 1.8, spacing: 9 },
        { name: 'grass sprigs', ids: GRASS_SPRIGS, t: [1.0, 1.6], per100: 3.2, spacing: 7 },
        { name: 'tall tuft', ids: ['beach-plant-015'], t: [1.0, 1.4], per100: 0.35, spacing: 34, clear: 5 },
        { name: 'palm shrubs', ids: ['beach-bush-022', 'beach-bush-023'], t: [1.2, 2.0], per100: 0.22, spacing: 90, clear: 20 },
      ],
    },
    rocky: {
      label: 'Rocky',
      ground: 'rocks2-terrain-014',
      shoreWidth: [6, 14],
      edgeRag: 1.6,
      outerRag: 3,
      bands: [
        { name: 'gravel', tex: 'beach-terrain-007', fillHoles: true, to: 1 },
        { name: 'stones', tex: 'rocks2-terrain-012', fillHoles: true, to: 0.5, rag: 2 },
        { name: 'wet stones', color: 'rgba(20,30,50,0.30)', toPx: 3, rag: 1.2 },
      ],
      face: { h: [3, 6], tex: 'rocks2-terrain-012', fillHoles: true, tint: 'rgba(15,22,40,0.50)' },
      water: {
        tint: null,
        shallow: [[6, 'rgba(70,165,190,0.25)'], [2.5, 'rgba(120,200,215,0.25)']],
        shadow: { h: 3, color: 'rgba(0,15,45,0.32)' },
        rim: 'rgba(235,245,255,0.8)',
        foam: 'rgba(235,245,255,0.6)', foamSpread: 0.9,
      },
      decor: [
        { name: 'gravel splats', layer: 'ground', ids: ['beach-terrain-008'], t: [0.9, 1.15], per100: 1.0, spacing: 26 },
        { name: 'rubble strips', layer: 'ground', ids: ['rocks2-terrain-021', 'rocks2-terrain-024'], t: [0.85, 1.2], per100: 0.35, spacing: 60 },
        { name: 'outcrops', ids: ['rocks2-rock-037', 'rocks2-rock-038'], s: [-8, 4], per100: 0.1, spacing: 220, clear: 40, ripple: true, groups: ['lakes'] },
        { name: 'waterline boulders', ids: ['rocks2-rock-016', 'rocks2-rock-017', 'rocks2-rock-018', 'rocks2-rock-008', 'rocks2-rock-009'], s: [-5, 3], per100: 2.0, spacing: 18, clear: 7, ripple: true, cluster: [1, 3, 12] },
        { name: 'low rocks', ids: ['rocks2-rock-011', 'rocks2-rock-014', 'rocks2-rock-007', 'rocks2-rock-010'], s: [-1, 8], per100: 1.0, spacing: 16, clear: 5 },
        { name: 'rocks in water', ids: ['rocks2-rock-011', 'rocks2-rock-018', 'rocks2-rock-016', 'rocks2-rock-013'], s: [-16, -6], per100: 0.3, spacing: 36, clear: 8, ripple: true },
        { name: 'pebbles', ids: ['rocks2-rock-012', 'rocks2-rock-013', 'rocks2-rock-015', 'rocks2-rock-043', 'rocks2-rock-045', 'beach-rock-003', 'beach-rock-007'], t: [0.05, 0.95], per100: 3.0, spacing: 8 },
        { name: 'crumbs', ids: ['rocks2-rock-042', 'rocks2-rock-044'], t: [0.3, 1.0], per100: 0.45, spacing: 36 },
        { name: 'rock clusters on grass', ids: ['rocks2-rock-004', 'rocks2-rock-005', 'rocks2-rock-006'], t: [1.0, 1.7], per100: 0.7, spacing: 26, clear: 6 },
        { name: 'grass tufts', ids: ['trees-plant-006', 'trees-plant-007'], t: [1.05, 1.8], per100: 0.9, spacing: 20 },
      ],
    },
    grass: {
      label: 'Grass',
      ground: 'rocks2-terrain-014',
      shoreWidth: [4, 11],       // lush darker-grass rim
      edgeRag: 1.2,
      outerRag: 4,
      bands: [
        { name: 'lush grass', tex: 'rocks2-terrain-020', to: 1 },
        { name: 'mud line', color: 'rgba(72,58,22,0.55)', toPx: 1.8, rag: 1.0 },
      ],
      face: { h: [2, 4], tex: 'beach-terrain-007', fillHoles: true, tint: 'rgba(66,40,12,0.60)' },
      water: {
        tint: 'rgba(30,110,80,0.24)',
        shallow: [[6, 'rgba(70,150,110,0.28)'], [2.5, 'rgba(110,170,110,0.30)']],
        shadow: { h: 2, color: 'rgba(0,25,30,0.32)' },
        rim: 'rgba(205,235,210,0.45)',
        foam: 'rgba(220,240,225,0.32)', foamSpread: 0.8,
      },
      decor: [
        { name: 'reed beds', kind: 'reedbed', s: [-5, 1], per100: 0.32, spacing: 56, clear: 16, ripple: true, rx: [9, 20], ry: [4, 7], height: [14, 26] },
        { name: 'waterline stones', ids: ['rocks2-rock-013', 'rocks2-rock-011'], s: [-2, 2], per100: 0.35, spacing: 40, clear: 5, ripple: true },
        { name: 'mossy log', ids: ['jungle-prop-007'], s: [-3, 3], per100: 0.05, spacing: 400, clear: 14, ripple: true, max: 1, minPerimeter: 900 },
        { name: 'tufts', ids: ['trees-plant-006', 'trees-plant-007', 'jungle-plant-011', 'beach-plant-015'], t: [0.0, 1.3], per100: 3.6, spacing: 10, clear: 3 },
        { name: 'sprigs', ids: GRASS_SPRIGS, t: [0.2, 1.8], per100: 3.0, spacing: 7 },
        { name: 'ferns', ids: ['trees-plant-008', 'jungle-bush-008'], t: [1.0, 2.6], per100: 0.35, spacing: 50, clear: 12 },
        { name: 'wild flowers', ids: ['jungle-plant-016', 'jungle-plant-017', 'trees-plant-005'], t: [1.3, 3.5], per100: 0.7, spacing: 22 },
      ],
    },
  };

  // ------------------------------------------------------------------ shapes
  // Every body is rasterised into a Uint8 water mask on a padded grid.
  const PAD = 48;

  // blob: ellipse with harmonic wobble -> ponds, lakes, islands
  function rasterBlob(grid, b, seed, value) {
    const { gw, gh, mask } = grid, rnd = mulberry32(seed);
    const n = b.harmonics || 4, wob = b.wobble == null ? 0.12 : b.wobble;
    const amp = [], ph = [];
    let total = 0;
    for (let k = 2; k <= n + 1; k++) {
      amp[k] = wob * (0.4 + 0.6 * rnd()) / Math.pow(k - 1, 0.7);
      ph[k] = rnd() * Math.PI * 2; total += amp[k];
    }
    const cx = b.x + PAD, cy = b.y + PAD;
    const ex = b.rx * (1 + total) + 2, ey = b.ry * (1 + total) + 2;
    for (let y = Math.max(0, Math.floor(cy - ey)); y < Math.min(gh, cy + ey); y++) {
      for (let x = Math.max(0, Math.floor(cx - ex)); x < Math.min(gw, cx + ex); x++) {
        const dx = (x + 0.5 - cx) / b.rx, dy = (y + 0.5 - cy) / b.ry;
        const th = Math.atan2(dy, dx);
        let r = 1;
        for (let k = 2; k <= n + 1; k++) r += amp[k] * Math.sin(k * th + ph[k]);
        if (dx * dx + dy * dy < r * r) mask[y * gw + x] = value;
      }
    }
  }

  // Catmull-Rom centreline sampled every ~2px: [{x,y,s,tx,ty}]
  function samplePath(pts) {
    const P = pts.map(p => [p[0] + PAD, p[1] + PAD]);
    const out = [];
    let s = 0, px = P[0][0], py = P[0][1];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2));
      for (let j = (i === 0 ? 0 : 1); j <= n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        const x = f(p0[0], p1[0], p2[0], p3[0]), y = f(p0[1], p1[1], p2[1], p3[1]);
        s += Math.hypot(x - px, y - py); px = x; py = y;
        out.push({ x, y, s });
      }
    }
    for (let i = 0; i < out.length; i++) {
      const a = out[Math.max(0, i - 2)], b = out[Math.min(out.length - 1, i + 2)];
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      out[i].tx = (b.x - a.x) / l; out[i].ty = (b.y - a.y) / l;
    }
    // signed curvature (+ = turning left), smoothed over ~40px
    const W = 10;
    for (let i = 0; i < out.length; i++) {
      const a = out[Math.max(0, i - W)], b = out[Math.min(out.length - 1, i + W)];
      const cross = a.tx * b.ty - a.ty * b.tx, len = Math.max(1, b.s - a.s);
      out[i].k = Math.asin(clamp(cross, -1, 1)) / len;
    }
    return out;
  }

  // river: union of discs along the centreline, width varies with distance
  function rasterRiver(grid, b, seed) {
    const { gw, gh, mask } = grid;
    const path = samplePath(b.path), L = path[path.length - 1].s;
    const wn = b.widthNoise == null ? 0.2 : b.widthNoise;
    for (const p of path) {
      const w = lerp(b.width[0], b.width[1], p.s / L) * (1 + wn * fbm(p.s / 60, 0.5, seed));
      p.hw = w / 2;
      const r = p.hw, r2 = r * r;
      for (let y = Math.max(0, Math.floor(p.y - r)); y <= Math.min(gh - 1, Math.ceil(p.y + r)); y++) {
        for (let x = Math.max(0, Math.floor(p.x - r)); x <= Math.min(gw - 1, Math.ceil(p.x + r)); x++) {
          const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y;
          if (dx * dx + dy * dy <= r2) mask[y * gw + x] = 1;
        }
      }
    }
    return path;
  }

  // tiles: a coarse grid authored by hand ('#' = water). Rasterised as squares,
  // then box-blurred and re-thresholded: this rounds every corner, removing the
  // "staircase of squares" look that comes from placing water tile by tile.
  function rasterTiles(grid, b) {
    const { gw, gh, mask } = grid, cell = b.cell || 32;
    const cov = new Float32Array(gw * gh);
    b.rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== '#') continue;
        const x0 = b.x + PAD + c * cell, y0 = b.y + PAD + r * cell;
        for (let y = y0; y < y0 + cell; y++) for (let x = x0; x < x0 + cell; x++) {
          if (x >= 0 && y >= 0 && x < gw && y < gh) cov[y * gw + x] = 1;
        }
      }
    });
    const rad = Math.max(1, Math.round(cell * (b.round == null ? 0.5 : b.round)));
    boxBlur(cov, gw, gh, rad); boxBlur(cov, gw, gh, rad);
    for (let i = 0; i < gw * gh; i++) if (cov[i] > 0.5) mask[i] = 1;
  }
  function boxBlur(a, w, h, r) {
    const tmp = new Float32Array(Math.max(w, h)), n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[x] = acc / n;
        acc += a[y * w + clamp(x + r + 1, 0, w - 1)] - a[y * w + clamp(x - r, 0, w - 1)];
      }
      for (let x = 0; x < w; x++) a[y * w + x] = tmp[x];
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += a[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        tmp[y] = acc / n;
        acc += a[clamp(y + r + 1, 0, h - 1) * w + x] - a[clamp(y - r, 0, h - 1) * w + x];
      }
      for (let y = 0; y < h; y++) a[y * w + x] = tmp[y];
    }
  }

  // ------------------------------------------------------------ field build
  function buildFields(scene, style, seed) {
    const W = scene.width, H = scene.height, gw = W + 2 * PAD, gh = H + 2 * PAD;
    const grid = { gw, gh, mask: new Uint8Array(gw * gh) };
    const rivers = [];
    scene.bodies.forEach((b, i) => {
      const bs = seed * 31 + i * 977;
      if (b.kind === 'blob') rasterBlob(grid, b, bs, 1);
      else if (b.kind === 'island') rasterBlob(grid, b, bs, 0);
      else if (b.kind === 'river') rivers.push(rasterRiver(grid, b, bs));
      else if (b.kind === 'tiles') rasterTiles(grid, b);
      else throw new Error('unknown body kind ' + b.kind);
    });

    // signed distance: S > 0 on land, S < 0 in water, 0 on the waterline
    const m = grid.mask;
    const dOut = edt(m, gw, gh);
    const dIn = edt(m.map(v => 1 - v), gw, gh);

    // bend bias for rivers: wider beaches on the inside of a bend (point bar),
    // narrow beach + taller bank face on the outside (cut bank)
    const bias = new Float32Array(gw * gh).fill(1);
    if (rivers.length) {
      const C = 4, cw = Math.ceil(gw / C), ch = Math.ceil(gh / C);
      const pts = [].concat(...rivers.map(r => r.filter((_, i) => i % 3 === 0)));
      const coarse = new Float32Array(cw * ch).fill(1);
      for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
        const x = cx * C + C / 2, y = cy * C + C / 2;
        let best = null, bd = INF;
        for (const p of pts) {
          const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
          if (d < bd) { bd = d; best = p; }
        }
        const dist = Math.sqrt(bd);
        if (!best || dist > best.hw + 60) continue;
        const side = Math.sign(best.tx * (y - best.y) - best.ty * (x - best.x)); // + = left of flow
        const k = clamp(best.k * 45, -1, 1);
        coarse[cy * cw + cx] = clamp(1 + 1.1 * k * side, 0.35, 2.2);
      }
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        bias[y * gw + x] = coarse[Math.min(ch - 1, (y / C) | 0) * cw + Math.min(cw - 1, (x / C) | 0)];
      }
    }

    // crop to the canvas window and apply noise
    const N = W * H, S = new Float32Array(N), Wsh = new Float32Array(N), B = new Float32Array(N);
    const [w0, w1] = scene.shoreWidth || style.shoreWidth;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const gi = (y + PAD) * gw + x + PAD, i = y * W + x;
      const raw = m[gi] ? -(dIn[gi] - 0.5) : (dOut[gi] - 0.5);
      S[i] = raw + fbm(x / 7, y / 7, seed + 3) * style.edgeRag;
      B[i] = bias[gi];
      Wsh[i] = lerp(w0, w1, 0.5 + 0.5 * fbm(x / 70, y / 70, seed + 7, 2)) * B[i];
    }
    // U = how many px below the nearest land pixel straight above (water only).
    // Used for the 3/4-view bank face on north-facing shores.
    const U = new Float32Array(N);
    for (let x = 0; x < W; x++) {
      // the column starts above the canvas: look into the padded mask
      let u = 0;
      for (let y = -PAD; y < 0; y++) u = m[(y + PAD) * gw + x + PAD] ? u + 1 : 0;
      for (let y = 0; y < H; y++) { const i = y * W + x; u = S[i] < 0 ? u + 1 : 0; U[i] = u; }
    }
    // RUN = length of the vertical water run a pixel belongs to (caps the
    // bank face on narrow water so a brook is not covered by its own bank)
    const RUN = new Float32Array(N);
    for (let x = 0; x < W; x++) {
      let d = 0;
      for (let y = H - 1; y >= 0; y--) { const i = y * W + x; d = S[i] < 0 ? d + 1 : 0; RUN[i] = d ? U[i] + d - 1 : 0; }
    }
    return { W, H, S, Wsh, B, U, RUN, rivers, grid };
  }

  // ------------------------------------------------------------- the scene
  function maskCanvas(W, H, test) {
    const c = mkCanvas(W, H), x = c.getContext('2d'), im = x.createImageData(W, H), d = im.data;
    for (let y = 0, i = 0; y < H; y++) for (let X = 0; X < W; X++, i++) if (test(X, y, i)) d[i * 4 + 3] = 255;
    x.putImageData(im, 0, 0);
    return c;
  }

  // shore: 'grass' | 'rocky' | 'sand'
  function build(sprites, scene, shore, seedOverride) {
    const style = STYLES[shore];
    if (!style) throw new Error('unknown shore ' + shore);
    const seed = seedOverride == null ? scene.seed : seedOverride;
    const F = buildFields(scene, style, seed);
    const { W, H, S, Wsh, B, U } = F, N = W * H;
    const rnd = mulberry32(seed * 7 + 1);

    const tmp = mkCanvas(W, H), tctx = ctx2d(tmp);
    function paint(dst, fill, mask) {
      tctx.globalCompositeOperation = 'source-over';
      tctx.clearRect(0, 0, W, H);
      tctx.fillStyle = fill; tctx.fillRect(0, 0, W, H);
      tctx.globalCompositeOperation = 'destination-in';
      tctx.drawImage(mask, 0, 0);
      tctx.globalCompositeOperation = 'source-over';
      dst.drawImage(tmp, 0, 0);
    }
    const pat = (id, holes) => tctx.createPattern(sprites.tile(id, holes), 'repeat');

    // per-column bank face height (px), taller on cut banks
    const faceH = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = i % W, y = (i / W) | 0;
      const h = lerp(style.face.h[0], style.face.h[1], vnoise(x / 9, y / 40, seed + 11));
      faceH[i] = Math.min(Math.round(h * clamp(2 - B[i], 0.6, 1.8)), Math.floor(F.RUN[i] * 0.3));
    }
    const isWater = i => S[i] < 0;
    const outerEdge = (x, y, i) => Wsh[i] + fbm(x / 5, y / 5, seed + 5) * style.outerRag;

    // ---- static ground layer: grass, shore bands, ground decals
    const ground = mkCanvas(W, H), g = ctx2d(ground);
    g.fillStyle = g.createPattern(sprites.tile(style.ground), 'repeat');
    g.fillRect(0, 0, W, H);

    const decor = placeDecor(sprites, F, style, scene, rnd, seed);
    for (const d of decor.filter(d => d.layer === 'under')) d.draw(g);

    const waterMask = maskCanvas(W, H, (x, y, i) => isWater(i));
    for (const band of style.bands) {
      const m = maskCanvas(W, H, (x, y, i) => {
        if (isWater(i)) return false;
        const rag = band.rag ? fbm(x / 4, y / 4, seed + 13) * band.rag + bayer(x, y) * 0.8 : 0;
        const lim = band.toPx != null ? band.toPx : (band.to === 1 ? outerEdge(x, y, i) : Wsh[i] * band.to);
        return S[i] < lim + rag;
      });
      paint(g, band.tex ? pat(band.tex, band.fillHoles) : band.color, m);
    }
    for (const d of decor.filter(d => d.layer === 'ground')) d.draw(g);

    // ---- static water overlay: tint, shallows, bank face, shadow, rim
    const over = mkCanvas(W, H), o = ctx2d(over), wst = style.water;
    if (wst.tint) paint(o, wst.tint, waterMask);
    for (const [depth, color] of wst.shallow) {
      paint(o, color, maskCanvas(W, H, (x, y, i) => isWater(i) && -S[i] < depth + bayer(x, y) * 1.6 + fbm(x / 11, y / 11, seed + 17) * 1.2));
    }
    const faceMask = maskCanvas(W, H, (x, y, i) => isWater(i) && U[i] <= faceH[i]);
    paint(o, pat(style.face.tex, style.face.fillHoles), faceMask);
    paint(o, style.face.tint, faceMask);
    paint(o, 'rgba(10,18,36,0.55)', maskCanvas(W, H, (x, y, i) => isWater(i) && U[i] === faceH[i] + 1));
    paint(o, wst.shadow.color, maskCanvas(W, H, (x, y, i) => isWater(i) && U[i] > faceH[i] + 1 && U[i] <= faceH[i] + 1 + wst.shadow.h));
    paint(o, wst.rim, maskCanvas(W, H, (x, y, i) => isWater(i) && -S[i] < 1.1 && U[i] > faceH[i] + 1));

    // ---- animated foam: 4 phases of a broken line that laps the shore
    const foam = [0, 1, 2, 3].map(p => {
      const c = mkCanvas(W, H);
      paint(ctx2d(c), wst.foam, maskCanvas(W, H, (x, y, i) => {
        if (!isWater(i) || U[i] <= faceH[i] + 1 + wst.shadow.h) return false;
        const r = 2.2 + p * wst.foamSpread + fbm(x / 9, y / 9, seed + 19) * 0.9;
        return Math.abs(-S[i] - r) < 0.55 && vnoise(x / 2.5, y / 2.5, seed + 23 + p) > 0.42;
      }));
      return c;
    });

    // ---- static decor layer (depth-sorted by foot y)
    const top = mkCanvas(W, H), tp = ctx2d(top);
    decor.filter(d => d.layer === 'sprite').sort((a, b) => a.y - b.y || a.x - b.x).forEach(d => d.draw(tp));

    // ---- debug overlay
    const dbg = mkCanvas(W, H), dg = ctx2d(dbg);
    paint(dg, 'rgba(0,255,255,1)', maskCanvas(W, H, (x, y, i) => isWater(i) && S[i] > -1));
    paint(dg, 'rgba(255,150,0,1)', maskCanvas(W, H, (x, y, i) => {
      if (isWater(i)) return false;
      const e = outerEdge(x, y, i); return S[i] >= e - 0.5 && S[i] < e + 0.5;
    }));
    paint(dg, 'rgba(255,0,255,0.45)', faceMask);
    dg.fillStyle = 'rgba(255,40,40,1)';
    for (const d of decor) if (d.layer === 'sprite') dg.fillRect(Math.round(d.x) - 1, Math.round(d.y) - 1, 3, 3);
    dg.strokeStyle = 'rgba(255,60,60,0.9)'; dg.setLineDash([3, 2]);
    for (const b of scene.bodies) if (b.kind === 'tiles') {
      const cell = b.cell || 32;
      b.rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') dg.strokeRect(b.x + c * cell + 0.5, b.y + r * cell + 0.5, cell - 1, cell - 1); });
    }

    // ---- flow (px/s) for drifting the water texture
    let flow = scene.flow;
    if (!flow && F.rivers.length) {
      const r = F.rivers[0], a = r[0], b = r[r.length - 1], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const v = scene.flowSpeed || 10; flow = [(b.x - a.x) / l * v, (b.y - a.y) / l * v];
    }
    flow = flow || [0, 0];

    const frames = (sprites.cat.animations.water.frames).map(id => sprites.tile(id));
    const fps = sprites.cat.animations.water.fps;
    const layer = mkCanvas(W, H), lc = ctx2d(layer);
    const FOAM_SEQ = [0, 1, 2, 3, 2, 1];
    const stats = { perimeter: F.perimeter, decor: decor.length, seed };

    return {
      width: W, height: H, stats, decor,
      draw(ctx, t, opts) {
        opts = opts || {};
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ground, 0, 0);
        const f = Math.floor(t * fps / 1000) % frames.length;
        const p = lc.createPattern(frames[f], 'repeat');
        const ox = (flow[0] * t / 1000) % 320, oy = (flow[1] * t / 1000) % 128;
        p.setTransform(new DOMMatrix().translate(Math.round(ox), Math.round(oy)));
        lc.globalCompositeOperation = 'source-over';
        lc.clearRect(0, 0, W, H);
        lc.fillStyle = p; lc.fillRect(0, 0, W, H);
        lc.drawImage(over, 0, 0);
        lc.drawImage(foam[FOAM_SEQ[Math.floor(t / 330) % FOAM_SEQ.length]], 0, 0);
        lc.globalCompositeOperation = 'destination-in';
        lc.drawImage(waterMask, 0, 0);
        lc.globalCompositeOperation = 'source-over';
        ctx.drawImage(layer, 0, 0);
        ctx.drawImage(top, 0, 0);
        if (opts.debug) ctx.drawImage(dbg, 0, 0);
      },
    };
  }

  // ------------------------------------------------------------------ decor
  function placeDecor(sprites, F, style, scene, rnd, seed) {
    const { W, H, S, Wsh } = F, N = W * H;
    let perimeter = 0;
    for (let i = 0; i < N; i++) if (S[i] < 0 && S[i] >= -1) perimeter++;
    F.perimeter = perimeter;

    const rules = COMMON_DECOR.concat(style.decor);
    const placed = [], out = [];
    const density = scene.density == null ? 1 : scene.density;
    const pick = a => a[Math.floor(rnd() * a.length)];

    for (const rule of rules) {
      if (rule.minPerimeter && perimeter < rule.minPerimeter) continue;
      if (rule.groups && !rule.groups.includes(scene.group)) continue;
      const inBand = i => {
        if (rule.s) return S[i] >= rule.s[0] && S[i] <= rule.s[1];
        const t = S[i] / Wsh[i]; return S[i] >= 0 && t >= rule.t[0] && t <= rule.t[1];
      };
      const cand = [];
      for (let y = 6; y < H - 2; y++) for (let x = 4; x < W - 4; x++) if (inBand(y * W + x)) cand.push(y * W + x);
      if (!cand.length) continue;
      let want = Math.round(rule.per100 * perimeter / 100 * density + rnd() * 0.6);
      if (rule.max) want = Math.min(want, rule.max);
      const mine = [];
      const ok = (x, y) => {
        if (x < 4 || y < 6 || x >= W - 4 || y >= H - 2 || !inBand((y | 0) * W + (x | 0))) return false;
        for (const p of mine) if (Math.hypot(p.x - x, p.y - y) < rule.spacing) return false;
        if (rule.clear) for (const p of placed) if (p.clear && Math.hypot(p.x - x, p.y - y) < rule.clear + p.clear) return false;
        return true;
      };
      for (let a = 0; a < want * 40 && mine.length < want; a++) {
        const c = pick(cand);
        const cx = c % W, cy = (c / W) | 0;
        const n = rule.cluster ? rule.cluster[0] + Math.floor(rnd() * (rule.cluster[1] - rule.cluster[0] + 1)) : 1;
        for (let k = 0; k < n && mine.length < want; k++) {
          const x = k === 0 ? cx : cx + (rnd() * 2 - 1) * rule.cluster[2];
          const y = k === 0 ? cy : cy + (rnd() * 2 - 1) * rule.cluster[2] * 0.6;
          if (!ok(x, y)) continue;
          const item = makeItem(sprites, rule, Math.round(x), Math.round(y), S[(y | 0) * W + (x | 0)] < 0, rnd, seed + out.length);
          mine.push(item); placed.push(item); out.push(item);
        }
      }
    }
    return out;
  }

  function ripple(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    const n = Math.ceil(rx * 4);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      ctx.fillRect(Math.round(x + Math.cos(a) * rx), Math.round(y + Math.sin(a) * ry), 1, 1);
    }
  }

  function makeItem(sprites, rule, x, y, wet, rnd, seed) {
    const layer = rule.layer || 'sprite', clear = rule.clear || 0;
    if (rule.kind === 'reedbed') {
      const bed = makeReedBed(sprites, rnd, seed, rule);
      return {
        x, y, layer, clear, rule: rule.name, id: 'reedbed',
        draw(ctx) {
          if (wet && rule.ripple) ripple(ctx, x, y - 1, bed.rx + 2, Math.max(2, bed.ry * 0.6), 'rgba(225,240,250,0.55)');
          ctx.drawImage(bed.canvas, x - bed.ax, y - bed.ay);
        },
      };
    }
    const id = rule.ids[Math.floor(rnd() * rule.ids.length)], s = sprites.get(id);
    if (layer !== 'sprite') {
      // terrain decals anchor top-left: centre them on the chosen point
      return { x, y, layer, clear, rule: rule.name, id, draw(ctx) { sprites.blit(ctx, id, x - s.w / 2, y - s.h / 2); } };
    }
    return {
      x, y, layer, clear, rule: rule.name, id,
      draw(ctx) {
        if (wet && rule.ripple) {
          const rx = clamp(s.w * 0.42, 4, 26);
          ripple(ctx, x, y - 1, rx, Math.max(2, rx * 0.28), 'rgba(225,240,250,0.6)');
        }
        sprites.draw(ctx, id, x, y);
      },
    };
  }

  // Reed bed: the rectangular tall-grass sprite clipped to an organic
  // footprint with a jagged, blade-like top edge.
  function makeReedBed(sprites, rnd, seed, rule) {
    const rx = Math.round(lerp(rule.rx[0], rule.rx[1], rnd()));
    const ry = Math.round(lerp(rule.ry[0], rule.ry[1], rnd()));
    const ht = Math.round(lerp(rule.height[0], rule.height[1], rnd()));
    const w = rx * 2 + 1, h = ht + ry * 2 + 2, cy = ht + ry;
    const c = mkCanvas(w, h), x = ctx2d(c);
    const src = rnd() < 0.5 ? 'beach-plant-003' : 'beach-plant-002', s = sprites.get(src);
    const ox = Math.floor(rnd() * Math.max(1, s.w - 8));
    for (let tx = -ox; tx < w; tx += s.w) sprites.blit(x, src, tx, 0);
    const m = maskCanvas(w, h, (px, py) => {
      const ex = (px - rx) / rx;
      if (Math.abs(ex) >= 1) return false;
      const e = Math.sqrt(1 - ex * ex);
      const bottom = cy + ry * e + (vnoise(px / 3, 0, seed) - 0.5) * 2;
      const top = cy - ry * e - ht * e * (0.45 + 0.55 * vnoise(px / 1.6, 7, seed + 1));
      return py >= top && py <= bottom;
    });
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(m, 0, 0);
    return { canvas: c, ax: rx, ay: cy + ry, rx, ry };
  }

  // -------------------------------------------------------- mount on a page
  // Renders a scene into a canvas at the largest integer scale that fits the
  // canvas' parent, and animates it while visible.
  function mount(canvas, sprites, scene, opts) {
    opts = Object.assign({ shore: scene.shore, debug: false, seed: scene.seed, maxScale: 3 }, opts || {});
    let r = null, visible = true, raf = 0;
    canvas.width = scene.width; canvas.height = scene.height;
    canvas.style.imageRendering = 'pixelated';
    const ctx = ctx2d(canvas);
    function rebuild() { r = build(sprites, scene, opts.shore, opts.seed); fit(); }
    function fit() {
      const avail = canvas.parentElement.clientWidth;
      // integer scale keeps pixels square; fall back to a fitted width when
      // 1x would leave most of the stage empty (or the stage is too narrow)
      const k = Math.max(1, Math.min(opts.maxScale, Math.floor(avail / scene.width)));
      const fitted = avail < scene.width || (k === 1 && avail > scene.width * 1.5);
      canvas.style.width = (fitted ? Math.min(avail, scene.width * opts.maxScale) : scene.width * k) + 'px';
    }
    function loop(t) { if (visible) r.draw(ctx, t, opts); raf = requestAnimationFrame(loop); }
    rebuild();
    raf = requestAnimationFrame(loop);
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; });
    io.observe(canvas);
    const ro = new ResizeObserver(fit); ro.observe(canvas.parentElement);
    return {
      get stats() { return r.stats; },
      set(o) { const need = 'shore' in o || 'seed' in o; Object.assign(opts, o); if (need) rebuild(); },
      destroy() { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); },
    };
  }

  global.ZRPGWater = { load, build, mount, STYLES, COMMON_DECOR, Sprites, util: { mulberry32, vnoise, fbm, edt } };
})(typeof window !== 'undefined' ? window : globalThis);
