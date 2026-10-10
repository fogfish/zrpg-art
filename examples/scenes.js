// scenes.js — the example water bodies. Coordinates are world px at 1x.
// Every scene renders with any shore: 'grass' | 'rocky' | 'sand'.
// `shore` is only the default shown first. Specs: ponds.md, lakes.md, rivers.md.
window.WATER_SCENES = [
  // ------------------------------------------------------------------ ponds
  {
    id: 'pond-round', group: 'ponds', title: 'Round pond', shore: 'grass', seed: 11,
    width: 384, height: 256,
    desc: 'One blob. A low wobble keeps it calm; ry ≈ 0.7·rx reads as round in the 3/4 view.',
    bodies: [{ kind: 'blob', x: 192, y: 128, rx: 92, ry: 64, wobble: 0.10, harmonics: 4 }],
  },
  {
    id: 'pond-kidney', group: 'ponds', title: 'Kidney pond', shore: 'sand', seed: 23,
    width: 384, height: 256,
    desc: 'Two overlapping blobs make a waist. The shore band follows the union automatically.',
    bodies: [
      { kind: 'blob', x: 150, y: 116, rx: 72, ry: 50, wobble: 0.12 },
      { kind: 'blob', x: 240, y: 150, rx: 64, ry: 46, wobble: 0.12 },
    ],
  },
  {
    id: 'pond-tiles', group: 'ponds', title: 'Pond from a 32 px tile grid', shore: 'rocky', seed: 37,
    width: 384, height: 256,
    desc: 'Authored on the game grid ("#" = water), then rounded by blur + threshold. Turn on Debug to see the source cells.',
    bodies: [{
      kind: 'tiles', x: 64, y: 32, cell: 32, round: 0.55,
      rows: [
        '..####..',
        '.######.',
        '########',
        '.#######',
        '..####..',
        '...##...',
      ],
    }],
  },
  {
    id: 'pond-brook', group: 'ponds', title: 'Spring pond with outflow brook', shore: 'grass', seed: 41,
    width: 384, height: 256,
    desc: 'A blob plus a narrow river body. The union gets one continuous shore, with no seam where they join.',
    flow: [0, 0],
    bodies: [
      { kind: 'blob', x: 140, y: 104, rx: 80, ry: 56, wobble: 0.12 },
      { kind: 'river', path: [[200, 130], [250, 170], [290, 196], [330, 236], [360, 300]], width: [13, 10], widthNoise: 0.25 },
    ],
  },

  // ------------------------------------------------------------------ lakes
  {
    id: 'lake-bays', group: 'lakes', title: 'Lake with bays and headlands', shore: 'rocky', seed: 5,
    width: 640, height: 416,
    desc: 'One large blob with high harmonics (wobble 0.22, 7 harmonics) gives bays, coves and headlands.',
    flow: [3, 1],
    bodies: [{ kind: 'blob', x: 320, y: 208, rx: 228, ry: 136, wobble: 0.22, harmonics: 7 }],
  },
  {
    id: 'lake-island', group: 'lakes', title: 'Lake with islands', shore: 'sand', seed: 8,
    width: 640, height: 416,
    desc: 'Island bodies cut land back into the water. Each island gets its own shore, face and foam with no extra code.',
    flow: [3, 1],
    bodies: [
      { kind: 'blob', x: 320, y: 210, rx: 250, ry: 155, wobble: 0.14, harmonics: 5 },
      { kind: 'island', x: 370, y: 186, rx: 64, ry: 40, wobble: 0.22, harmonics: 5 },
      { kind: 'island', x: 210, y: 262, rx: 22, ry: 15, wobble: 0.15 },
    ],
  },
  {
    id: 'lake-river', group: 'lakes', title: 'Lake fed by a river', shore: 'grass', seed: 13,
    width: 640, height: 416,
    desc: 'An inlet and an outlet river joined to the blob. The bank, reeds and shallows run around the mouths without a break.',
    flow: [-4, 4],
    bodies: [
      { kind: 'blob', x: 310, y: 222, rx: 205, ry: 122, wobble: 0.16, harmonics: 5 },
      { kind: 'river', path: [[680, -30], [610, 40], [540, 80], [470, 120]], width: [28, 34] },
      { kind: 'river', path: [[150, 300], [100, 350], [60, 390], [-20, 450]], width: [24, 20] },
    ],
  },

  // ----------------------------------------------------------------- rivers
  {
    id: 'river-meander', group: 'rivers', title: 'Meandering river', shore: 'grass', seed: 3,
    width: 640, height: 384,
    desc: 'A Catmull-Rom centreline with S-bends. Inner bends get wide banks (point bars) and outer bends get tall cut banks.',
    flowSpeed: 12,
    bodies: [{
      kind: 'river', width: [36, 46],
      path: [[-40, 120], [70, 86], [170, 150], [236, 262], [340, 296], [424, 200], [500, 108], [590, 138], [690, 232]],
    }],
  },
  {
    id: 'river-brook', group: 'rivers', title: 'Winding brook', shore: 'rocky', seed: 17,
    width: 640, height: 384,
    desc: 'Narrow (14–18 px) and strongly varying width (widthNoise 0.3). Flows faster than the big river.',
    flowSpeed: 18, density: 0.5,
    bodies: [{
      kind: 'river', width: [14, 18], widthNoise: 0.3,
      path: [[-30, 330], [70, 300], [110, 236], [60, 170], [120, 110], [230, 128], [290, 214], [380, 250], [450, 180], [430, 100], [500, 50], [600, 40], [680, -20]],
    }],
  },
  {
    id: 'river-confluence', group: 'rivers', title: 'Confluence', shore: 'sand', seed: 29,
    width: 640, height: 384,
    desc: 'A tributary joins the main river. Both are bodies of one mask, so the banks merge into a single sand bar at the fork.',
    flowSpeed: 10,
    bodies: [
      { kind: 'river', width: [30, 42], path: [[-40, 250], [120, 228], [260, 262], [380, 222], [500, 244], [690, 196]] },
      { kind: 'river', width: [16, 22], path: [[196, -40], [228, 60], [296, 140], [360, 214]] },
    ],
  },
];
