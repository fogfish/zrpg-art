// world.js — the "Arcade World Map" (../world_map.jpg) rebuilt from the ZRPG catalogue as one static image.
// Needs ../catalog.js, water.js (water, shores, grass base) and terrain.js. Spec: WORLD-SPEC.md.
//
// Layers, bottom to top:
//   1. water.js scene: grass ground, Lake Joy, Lake Byte, the river (enters at the top, leaves at the bottom),
//      a chain of swamp pools between the lakes, grass shores and waterline reeds
//   2. ground overlay: organic areas (swamp, sand beach, rocky desert), roads as bands of trampled grass
//   3. sprites: forests, mountains, region objects and sparse meadow scatter, depth-sorted by foot y
//   4. finish: warm grade, sun glow, vignette
//
// The catalogue has no buildings, characters, boats or castle: towns, the market and the castle are left out
// (one tent marks Pixel Town), monsters are alien pods and crystal nodes, boats are floating logs.
//
// All coordinates are px of the reference image (1376 x 768); the world is K times larger so that the
// library's sprite sizes match the image's proportions.
(function (global) {
  'use strict';
  const K = 2, REF_W = 1376, REF_H = 768;

  // ------------------------------------------------------------- the map data
  const WATER = {
    shore: 'grass', seed: 7, density: 0.5,
    bodies: [
      { kind: 'blob', x: 535, y: 272, rx: 112, ry: 84, wobble: 0.12, harmonics: 5 },                // Lake Joy
      { kind: 'blob', x: 650, y: 300, rx: 50, ry: 42, wobble: 0.1 },                                // Joy's outlet bay
      { kind: 'river', path: [[690, -40], [698, 60], [700, 150], [712, 190], [742, 240], [748, 285], [732, 322]],
        width: [30, 36], widthNoise: 0.25 },                                                        // north river, off the top edge
      { kind: 'river', path: [[650, 300], [700, 318], [732, 326]], width: [34, 26], widthNoise: 0.1 },
      // the swamp: a chain of pools from the river mouth down to Lake Byte
      { kind: 'blob', x: 738, y: 340, rx: 18, ry: 11, wobble: 0.25 },
      { kind: 'blob', x: 712, y: 356, rx: 20, ry: 10, wobble: 0.3 },
      { kind: 'blob', x: 686, y: 372, rx: 12, ry: 7, wobble: 0.3 },
      { kind: 'blob', x: 736, y: 378, rx: 13, ry: 8, wobble: 0.3 },
      { kind: 'blob', x: 708, y: 406, rx: 18, ry: 9, wobble: 0.3 },
      { kind: 'blob', x: 674, y: 418, rx: 11, ry: 6, wobble: 0.3 },
      { kind: 'blob', x: 742, y: 418, rx: 20, ry: 10, wobble: 0.3 },
      { kind: 'blob', x: 712, y: 440, rx: 30, ry: 14, wobble: 0.25 },
      { kind: 'blob', x: 770, y: 535, rx: 152, ry: 100, wobble: 0.14, harmonics: 6 },              // Lake Byte
      { kind: 'blob', x: 648, y: 600, rx: 58, ry: 68, wobble: 0.1 },                                // Byte's west lobe
      { kind: 'river', path: [[648, 640], [652, 690], [646, 730], [640, 800]], width: [56, 52], widthNoise: 0.15 },
      { kind: 'island', x: 664, y: 616, rx: 30, ry: 24, wobble: 0.1 },                              // island in Lake Byte
    ],
  };

  // roads: centreline (Catmull-Rom) and width; drawn as a band of trampled grass with a dithered edge
  const ROADS = [
    { w: 20, pts: [[150, 602], [240, 594], [330, 596], [420, 590], [500, 580], [535, 545], [552, 480], [585, 420], [640, 395],
      [705, 390], [770, 394], [850, 390], [925, 386], [990, 370], [1040, 318], [1090, 296], [1140, 278]] },
    { w: 15, pts: [[268, 592], [264, 520], [266, 440], [272, 360], [284, 300], [292, 268]] },          // start -> Pixel Town
    { w: 13, pts: [[350, 592], [348, 525], [400, 516], [460, 522], [462, 565], [462, 592]] },         // Level 1 Forest loop
    { w: 13, pts: [[1000, 378], [992, 430], [985, 476]] },                                            // down to the dunes
  ];
  const ROAD_TEX = 'rocks2/grass_cross_frame_b';   // its top 32 px are solid trampled (yellow-green) grass

  // organic ground areas: union of ellipses [x, y, rx, ry] + noise. tex2 shows through where noise > tex2At.
  const GROUNDS = [
    { name: 'swamp', tex: 'rocks2/grass_tile_dark', soft: true, mud: 'rgba(66,54,26,0.38)',
      blobs: [[710, 388, 66, 58], [760, 356, 36, 26], [664, 404, 34, 26]] },
    { name: 'dunes', tex: 'beach/sand_pit_light_small_c', rim: 'rgba(168,118,58,0.55)', wet: 'rgba(110,70,30,0.32)',
      blobs: [[1015, 556, 96, 90], [925, 548, 60, 84], [960, 625, 80, 42], [1085, 612, 44, 48]] },
    { name: 'desert', tex: 'beach/sand_pit_dark_b_c', tex2: 'rocks2/gravel_patch_round_c', tex2At: 0.52,
      rim: 'rgba(120,80,40,0.5)', blobs: [[1200, 566, 74, 80], [1160, 616, 46, 38], [1236, 516, 38, 30]] },
  ];

  // forests: the border band (px thickness per side) and inner groves (ellipses)
  const BORDER = { left: 104, right: 90, top: 118, bottom: 94, rag: 22, step: 44, fill: 0.85,
    gaps: [[600, 700, 'bottom'], [680, 720, 'top']] };
  const GROVES = [
    { x: 420, y: 420, rx: 118, ry: 64 },     // Level 1 Forest
    { x: 400, y: 552, rx: 40, ry: 22 },      // inside the forest loop
    { x: 515, y: 512, rx: 28, ry: 40 },
    { x: 860, y: 245, rx: 44, ry: 108 },     // east of the river
    { x: 676, y: 205, rx: 34, ry: 26 },      // the north bend
    { x: 610, y: 352, rx: 22, ry: 14 },
    { x: 590, y: 600, rx: 26, ry: 44 },      // west shore of Lake Byte
    { x: 900, y: 650, rx: 20, ry: 16 },
    { x: 460, y: 152, rx: 18, ry: 16 },
    { x: 1150, y: 200, rx: 62, ry: 40 },     // north-east woods
    { x: 330, y: 190, rx: 30, ry: 22 },      // behind Pixel Town
  ];
  // no trees / scatter here (regions with their own content)
  const KEEP_OUT = [
    [110, 280, 250, 450],    // NW mountains
    [120, 410, 260, 560],    // Slime Hills: open meadow
    [160, 560, 320, 640],    // Starting Area
    [255, 225, 335, 300],    // the tent
    [1160, 270, 1290, 470],  // E mountains
  ];

  const T = (sheet, name) => sheet + '/' + name;
  const TREES = ['round_tree_small', 'round_tree_dense', 'round_tree_tiny', 'oak_small_d', 'oak_small_c', 'pine_small',
    'pine_small_wide', 'round_tree_small', 'round_tree_dense'].map(n => T('trees', n));
  const PEAKS = ['cliff_column', 'cliff_column_shadow', 'pillar_4', 'pillar_8', 'pillar_6', 'pillar_2', 'outcrop_small_shadow']
    .map(n => T('rocks2', n));
  const FLOWERS = [T('trees', 'yellow_flowers_cluster'), T('trees', 'yellow_flowers_trio'), T('jungle', 'blue_flower'),
    T('jungle', 'white_flower_sprout'), T('trees', 'red_flower_plant')];
  const STONES = [T('rocks2', 'small_boulder_a'), T('rocks2', 'small_boulder_b'), T('rocks2', 'rock_cluster_grass_a')];
  const BUSHES = [T('trees', 'broadleaf_bush'), T('trees', 'dense_shrub'), T('trees', 'yellow_green_bush')];
  const SWAMP_PLANTS = [T('rocks2', 'grass_tuft_green'), T('rocks2', 'grass_tuft_green_cluster'), T('trees', 'grass_tuft_a'),
    T('jungle', 'grass_blades'), T('beach', 'grass_tuft_tall'), T('trees', 'fern_small')];
  const SAND_DECALS = [T('beach', 'sand_ripples_a'), T('beach', 'sand_ripples_b'), T('beach', 'sand_ripple_tile_a'),
    T('beach', 'sand_ripple_tile_b'), T('beach', 'sand_clump_a'), T('beach', 'sand_clump_c'), T('beach', 'sand_crater_small_a')];
  const SAND_PEBBLES = ['pebble_a', 'pebble_b', 'pebble_c', 'pebble_e', 'pebble_pair', 'pebble_cluster'].map(n => T('beach', n));
  const SMALL_BONES = ['bone_fragment_a', 'bone_fragments_b', 'bone_fragment_c', 'bone_fragment_e', 'bone_fragments_f',
    'bone_fragment_g', 'bone_a', 'bone_b'].map(n => T('beach', n));
  const DESERT_ROCKS = [T('rocks2', 'small_boulder_a'), T('rocks2', 'small_boulder_b'), T('rocks2', 'pebble_crumbs_a'),
    T('rocks2', 'pebble_c'), T('beach', 'sand_pebbles_set_a'), T('rocks2', 'low_rock_grass_a'), T('beach', 'dry_shrub')];

  // hand-placed objects: [sprite, x, y] (x, y = foot point in reference px)
  const OBJECTS = [
    // Pixel Town: one tent by the end of the road
    [T('jungle', 'canvas_tent'), 292, 262], [T('jungle', 'campfire_logs'), 320, 276], [T('trees', 'wooden_signpost'), 260, 296],
    // Starting Area: flag
    [T('jungle', 'skull_spear_banner'), 196, 586], [T('trees', 'hollow_log'), 230, 624],
    // Slime Hills: an open meadow with a few bushes and stones
    [T('trees', 'yellow_green_bush'), 170, 468], [T('trees', 'broadleaf_bush'), 214, 446], [T('trees', 'dense_shrub'), 186, 528],
    [T('rocks2', 'small_boulder_a'), 236, 536], [T('rocks2', 'rock_cluster_grass_a'), 148, 548], [T('trees', 'yellow_flowers_cluster'), 202, 494],
    // Level 1 Forest: monsters, ruin
    [T('jungle', 'purple_alien_pod'), 372, 470], [T('jungle', 'orange_carnivorous_pod'), 406, 503],
    [T('rocks2', 'pillar_1'), 300, 520], [T('rocks2', 'pillar_3'), 318, 528],
    // lakes: boats, island
    [T('jungle', 'hollow_log'), 568, 238], [T('jungle', 'hollow_log_mossy'), 790, 512], [T('jungle', 'hollow_log'), 702, 586],
    [T('trees', 'round_tree_tiny'), 656, 618], [T('trees', 'round_tree_small'), 676, 624], [T('trees', 'broadleaf_bush'), 660, 632],
    // the swamp
    [T('jungle', 'hollow_log_mossy'), 690, 392], [T('beach', 'dead_gnarled_tree'), 652, 372], [T('jungle', 'dark_frond_bush_1'), 770, 368],
    // north-east (the boss lands): strong monsters by the end of the road
    [T('jungle', 'crystal_node_corrupted'), 1112, 262], [T('jungle', 'purple_spiky_alien'), 1150, 270], [T('jungle', 'crystal_node_corrupted'), 1215, 250],
    // The Dunes: a few cacti and dunes; bones and pebbles are scattered on the sand
    [T('beach', 'saguaro_light'), 1080, 530], [T('beach', 'saguaro_small_a'), 958, 600], [T('beach', 'prickly_pear'), 1018, 646],
    [T('beach', 'sand_dune_a_left'), 1040, 512], [T('beach', 'sand_dune_b_right'), 1068, 650],
    [T('beach', 'animal_skull'), 1030, 590], [T('beach', 'ribcage'), 972, 520], [T('beach', 'long_bone'), 1002, 616],
    // rocky desert: rocks and a few dead trees
    [T('beach', 'dead_gnarled_tree'), 1186, 560], [T('beach', 'dead_gnarled_tree'), 1250, 620], [T('beach', 'fallen_dead_branch'), 1170, 626],
    [T('rocks2', 'outcrop_small'), 1226, 540], [T('rocks2', 'outcrop_small_shadow'), 1150, 586],
    // monsters on the roads
    [T('jungle', 'purple_alien_pod'), 600, 384], [T('jungle', 'orange_carnivorous_pod'), 840, 372], [T('jungle', 'purple_spiky_alien'), 950, 280],
  ];
  const MOUNTAINS = [
    { x: 175, y: 360, rx: 62, ry: 70, n: 13 },   // north-west range
    { x: 1222, y: 372, rx: 52, ry: 98, n: 16 },  // east range
  ];
  const SCATTER = { tries: 600, max: 110, spacing: 70 };   // meadow flowers/stones/bushes: sparse, never clumped

  // finish: warm grade, soft sun glow from the north-west, vignette
  const FINISH = { warm: 'rgba(255,206,140,0.22)', glow: 'rgba(255,244,214,0.14)', vignette: 'rgba(6,14,10,0.5)' };

  // ------------------------------------------------------------------- build
  async function load(base) {
    const [sprites, terrain] = await Promise.all([ZRPGWater.load(base), ZRPGTerrain.load(base)]);
    return { sprites, terrain };
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16 - 0.5);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  function build(lib, opts) {
    opts = opts || {};
    const { sprites, terrain } = lib, cat = sprites.cat;
    const { mulberry32, fbm, vnoise, edt } = ZRPGWater.util;
    const W = REF_W * K, H = REF_H * K;
    const seed = opts.seed || 1, rnd = mulberry32(seed * 977 + 3);
    const byName = new Map(cat.sprites.map(s => [s.sheet + '/' + s.name, s]));
    const spr = key => { const s = byName.get(key); if (!s) throw new Error('unknown sprite ' + key); return s; };
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
    const s = v => v * K;
    const pick = a => a[Math.floor(rnd() * a.length)];
    const texture = (key, h) => {                     // a repeatable canvas from a sprite (optionally its top h rows)
      const t = spr(key), [c, x] = mk(t.w, h || t.h); sprites.blit(x, t.id, 0, 0); return c;
    };

    // 1. water + grass base; no waterline decor on the sand beach
    const scene = Object.assign({}, WATER, {
      width: W, height: H, seed: WATER.seed + seed - 1,
      bodies: WATER.bodies.map(b => {
        const o = Object.assign({}, b);
        for (const k of ['x', 'y', 'rx', 'ry']) if (k in o) o[k] = s(o[k]);
        if (o.path) o.path = o.path.map(([x, y]) => [s(x), s(y)]);
        if (o.width) o.width = o.width.map(s);
        return o;
      }),
    });
    const beach = GROUNDS[1].blobs.map(([x, y, rx, ry]) => [s(x), s(y), s(rx + 24), s(ry + 24)]);
    scene.decorFilter = (x, y) => !beach.some(([bx, by, rx, ry]) => Math.hypot((x - bx) / rx, (y - by) / ry) < 1);
    const water = ZRPGWater.build(sprites, scene, scene.shore);
    const sdf = water.sdf;
    const landAt = (x, y, m) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return true;
      return sdf[y * W + x] > (m || 0);
    };

    // paint `fill` (colour, sprite key or canvas) through a per-pixel test inside a box: pixel-crisp edges
    const [ground, g] = mk(W, H);
    function paint(fill, x0, y0, x1, y1, test, opacity) {
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
      x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
      if (x1 <= x0 || y1 <= y0) return;
      const [c, cx] = mk(x1 - x0, y1 - y0), im = cx.createImageData(x1 - x0, y1 - y0), d = im.data;
      for (let y = y0, i = 3; y < y1; y++) for (let x = x0; x < x1; x++, i += 4) if (test(x, y)) d[i] = 255;
      cx.putImageData(im, 0, 0);
      cx.globalCompositeOperation = 'source-in';
      if (typeof fill !== 'string' || fill.includes('/')) {
        const p = cx.createPattern(typeof fill === 'string' ? sprites.tile(spr(fill).id) : fill, 'repeat');
        p.setTransform(new DOMMatrix().translate(-x0, -y0));   // world-aligned texture
        cx.fillStyle = p;
      } else cx.fillStyle = fill;
      cx.fillRect(0, 0, x1 - x0, y1 - y0);
      g.globalAlpha = opacity == null ? 1 : opacity; g.drawImage(c, x0, y0); g.globalAlpha = 1;
    }
    const blitCentred = (key, x, y) => { const t = spr(key); sprites.blit(g, t.id, Math.round(x - t.w / 2), Math.round(y - t.h / 2)); };

    // 2a. organic ground areas
    const areaOf = new Uint8Array(W * H);   // 1 + index into GROUNDS
    GROUNDS.forEach((gr, k) => {
      const bl = gr.blobs.map(([x, y, rx, ry]) => [s(x), s(y), s(rx), s(ry)]);
      const x0 = Math.max(0, Math.floor(Math.min(...bl.map(b => b[0] - b[2] * 1.3))));
      const x1 = Math.min(W, Math.ceil(Math.max(...bl.map(b => b[0] + b[2] * 1.3))));
      const y0 = Math.max(0, Math.floor(Math.min(...bl.map(b => b[1] - b[3] * 1.3))));
      const y1 = Math.min(H, Math.ceil(Math.max(...bl.map(b => b[1] + b[3] * 1.3))));
      const bw = x1 - x0, E = new Float32Array(bw * (y1 - y0));
      const at = (x, y) => E[(y - y0) * bw + (x - x0)];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        let v = Math.min(...bl.map(([bx, by, rx, ry]) => Math.hypot((x - bx) / rx, (y - by) / ry)))
          + fbm(x / 40, y / 40, 31 + k) * 0.16 + fbm(x / 6, y / 6, 37 + k) * 0.035;
        if (gr.soft) v += bayer(x, y) * 0.22;            // dithered, feathered edge
        E[(y - y0) * bw + (x - x0)] = v;
        if (v < 1 && sdf[y * W + x] > 0) areaOf[y * W + x] = k + 1;
      }
      const inside = (x, y) => areaOf[y * W + x] === k + 1;
      paint(gr.tex, x0, y0, x1, y1, inside);
      if (gr.tex2) paint(gr.tex2, x0, y0, x1, y1, (x, y) => inside(x, y) && at(x, y) < 0.9 &&
        vnoise(x / 26, y / 26, 51) + fbm(x / 6, y / 6, 53) * 0.12 > gr.tex2At);
      if (gr.mud) paint(gr.mud, x0, y0, x1, y1, (x, y) => inside(x, y) &&
        (sdf[y * W + x] < 5 + fbm(x / 7, y / 7, 3) * 3 || vnoise(x / 22, y / 22, 57) + bayer(x, y) * 0.1 > 0.66));
      if (gr.wet) paint(gr.wet, x0, y0, x1, y1, (x, y) => inside(x, y) && sdf[y * W + x] < 7 + fbm(x / 8, y / 8, 3) * 3);
      if (gr.rim) paint(gr.rim, x0, y0, x1, y1, (x, y) => inside(x, y) && at(x, y) > 0.93);
    });
    const AREA = Object.fromEntries(GROUNDS.map((gr, k) => [gr.name, k + 1]));
    const areaAt = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H ? areaOf[y * W + x] : 0; };
    const nearArea = (x, y, pad) => [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]].some(([dx, dy]) => areaAt(x + dx, y + dy));
    // sand decals on the beach
    for (let n = 0, placed = 0; n < 400 && placed < 14; n++) {
      const x = s(890) + rnd() * s(250), y = s(460) + rnd() * s(220);
      if (areaAt(x, y) !== AREA.dunes || [[30, 0], [-30, 0], [0, 30], [0, -30]].some(([a, b]) => areaAt(x + a, y + b) !== AREA.dunes) || !landAt(x, y, 22)) continue;
      blitCentred(pick(SAND_DECALS), x, y); placed++;
    }

    // 2b. roads: a band of trampled grass, width wavering along the road, dithered edge, worn spots in the middle
    const roadTex = texture(ROAD_TEX, 32), dirt = 'beach/sand_pit_light_small_c';
    const nearRoad = new Uint8Array(W * H);
    for (const r of ROADS) {
      const pts = catmull(r.pts.map(([x, y]) => [s(x), s(y)]), 12), hw = s(r.w) / 2;
      const pad = Math.ceil(hw * 1.6 + 8);
      const bx0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0])) - pad)), by0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1])) - pad));
      const bx1 = Math.min(W, Math.ceil(Math.max(...pts.map(p => p[0])) + pad)), by1 = Math.min(H, Math.ceil(Math.max(...pts.map(p => p[1])) + pad));
      const bw = bx1 - bx0, bh = by1 - by0;
      const [lc, lx] = mk(bw, bh);
      lx.lineWidth = 2; lx.strokeStyle = '#000'; lx.beginPath();
      pts.forEach(([x, y], i) => i ? lx.lineTo(x - bx0, y - by0) : lx.moveTo(x - bx0, y - by0)); lx.stroke();
      const la = lx.getImageData(0, 0, bw, bh).data, site = new Uint8Array(bw * bh);
      for (let i = 0; i < bw * bh; i++) site[i] = la[i * 4 + 3] > 0 ? 1 : 0;
      const D = edt(site, bw, bh);
      // coverage: 1 on the centreline, 0 at the (wavering) edge
      const cover = (x, y) => {
        const d = D[(y - by0) * bw + (x - bx0)], h = hw * (1 + 0.28 * fbm(x / 70, y / 70, 61));
        return 1 - d / h + fbm(x / 9, y / 9, 63) * 0.18;
      };
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) if (D[(y - by0) * bw + (x - bx0)] < hw * 1.6) nearRoad[y * W + x] = 1;
      const dry = (x, y) => sdf[y * W + x] > 3 && areaAt(x, y) !== AREA.dunes;
      paint(roadTex, bx0, by0, bx1, by1, (x, y) => dry(x, y) && cover(x, y) + bayer(x, y) * 0.35 > 0.18);
      paint(dirt, bx0, by0, bx1, by1, (x, y) => dry(x, y) && cover(x, y) > 0.55 &&
        vnoise(x / 30, y / 30, 67) + bayer(x, y) * 0.18 > 0.6, 0.5);
    }

    // 3. sprites
    const items = [];
    const free = (x, y, pad) => {
      const rx = x / K, ry = y / K;
      for (const [a, b, c, d] of KEEP_OUT) if (rx > a && rx < c && ry > b && ry < d) return false;
      const xx = Math.round(x), yy = Math.round(y);
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && nearRoad[yy * W + xx]) return false;
      return !nearArea(x, y, pad);
    };
    const add = (key, x, y) => items.push({ s: spr(key), x: Math.round(x), y: Math.round(y) });

    // border forest: jittered grid inside a ragged band along every edge
    const B = BORDER;
    const inGap = (x, side) => B.gaps.some(([a, b, sd]) => sd === side && x / K > a && x / K < b);
    for (let y = -40; y < H + 90; y += B.step) for (let x = -40; x < W + 40; x += B.step) {
      const jx = x + (rnd() - 0.5) * B.step * 0.9, jy = y + (rnd() - 0.5) * B.step * 0.9;
      const rag = fbm(jx / 90, jy / 90, 5) * s(B.rag);
      const band = (jx < s(B.left) + rag) || (jx > W - s(B.right) - rag) ||
        (jy < s(B.top) + rag && !inGap(jx, 'top')) || (jy > H - s(B.bottom) - rag && !inGap(jx, 'bottom'));
      const rock = MOUNTAINS.some(m => Math.hypot((jx / K - m.x) / (m.rx + 14), (jy / K - m.y) / (m.ry + 14)) < 1);
      if (band && !rock && rnd() < B.fill && landAt(jx, jy, 10) && !nearArea(jx, jy, 20)) add(pick(TREES), jx, jy);
    }
    // groves
    for (const gr of GROVES) {
      const cx = s(gr.x), cy = s(gr.y), rx = s(gr.rx), ry = s(gr.ry);
      for (let y = cy - ry; y < cy + ry; y += 44) for (let x = cx - rx; x < cx + rx; x += 44) {
        const jx = x + (rnd() - 0.5) * 30, jy = y + (rnd() - 0.5) * 30;
        if (Math.hypot((jx - cx) / rx, (jy - cy) / ry) > 1 + fbm(jx / 30, jy / 30, 9) * 0.2 || rnd() > 0.85) continue;
        if (landAt(jx, jy, 12) && free(jx, jy, 22)) add(pick(TREES), jx, jy);
      }
    }
    // mountains
    for (const m of MOUNTAINS) {
      for (let i = 0; i < m.n; i++) {
        const t = i / m.n, a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
        add(pick(PEAKS), s(m.x) + Math.cos(a) * r * s(m.rx), s(m.y - m.ry) + t * s(m.ry * 2) + (rnd() - 0.5) * 30);
      }
    }
    // hand-placed objects
    for (const [key, x, y] of OBJECTS) add(key, s(x), s(y));
    // area scatter with minimum spacing: [area, count, sprites, spacing (ref px), margin from water (world px)]
    const spaced = (list, x, y, d) => list.every(p => Math.hypot(p[0] - x, p[1] - y) >= d);
    for (const [area, count, set, gap, wet] of [
      ['swamp', 11, SWAMP_PLANTS, 40, 4],
      ['dunes', 12, SMALL_BONES, 40, 16], ['dunes', 10, SAND_PEBBLES, 40, 16],
      ['desert', 14, DESERT_ROCKS, 48, 10],
    ]) {
      const mine = [];
      for (let n = 0; n < 900 && mine.length < count; n++) {
        const x = s(560) + rnd() * s(760), y = s(300) + rnd() * s(400);
        if (areaAt(x, y) !== AREA[area] || !landAt(x, y, wet) || !spaced(mine, x, y, s(gap) / 2)) continue;
        if (area !== 'swamp' && nearRoad[Math.round(y) * W + Math.round(x)]) continue;
        mine.push([x, y]); add(pick(set), x, y);
      }
    }
    // meadow scatter: flowers, stones, bushes on open grass, kept apart
    const meadow = [];
    for (let n = 0; n < SCATTER.tries && meadow.length < SCATTER.max; n++) {
      const x = s(130) + rnd() * (W - s(240)), y = s(140) + rnd() * (H - s(250));
      if (!landAt(x, y, 14) || !free(x, y, 12) || !spaced(meadow, x, y, SCATTER.spacing)) continue;
      const r = rnd(); meadow.push([x, y]);
      add(r < 0.55 ? pick(FLOWERS) : r < 0.8 ? pick(STONES) : pick(BUSHES), x, y);
    }
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const [top, tx] = mk(W, H);
    for (const it of items) sprites.draw(tx, it.s.id, it.x, it.y);

    // 4. flatten and finish
    const [out, ox] = mk(W, H);
    water.draw(ox, 0);
    ox.drawImage(ground, 0, 0);
    ox.drawImage(top, 0, 0);
    ox.globalCompositeOperation = 'soft-light'; ox.fillStyle = FINISH.warm; ox.fillRect(0, 0, W, H);
    const glow = ox.createRadialGradient(W * 0.25, H * 0.1, 0, W * 0.25, H * 0.1, W * 0.7);
    glow.addColorStop(0, FINISH.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ox.globalCompositeOperation = 'screen'; ox.fillStyle = glow; ox.fillRect(0, 0, W, H);
    const vig = ox.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, FINISH.vignette);
    ox.globalCompositeOperation = 'source-over'; ox.fillStyle = vig; ox.fillRect(0, 0, W, H);
    return {
      width: W, height: H, canvas: out, stats: { sprites: items.length },
      draw(ctx) { ctx.imageSmoothingEnabled = false; ctx.drawImage(out, 0, 0); },
    };
  }

  // Catmull-Rom through pts, `seg` samples per segment
  function catmull(pts, seg) {
    const out = [], n = pts.length, P = i => pts[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
      const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
      for (let k = 0; k < seg; k++) {
        const t = k / seg, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 +
          (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    out.push(pts[n - 1]);
    return out;
  }

  global.ZRPGWorld = { load, build, K, REF_W, REF_H };
})(window);
