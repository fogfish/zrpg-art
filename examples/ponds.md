# ponds.md — pond recipes

Ponds are small, enclosed water bodies, about 100–220 px across at 1×. Read [WATER-SPEC.md](WATER-SPEC.md) first: it defines `S`, `Wsh`, the bands, the bank face and the decor rules referenced here. Scene data is in [scenes.js](scenes.js) and the visual check is [ponds.html](ponds.html).

Every pond renders with any shore: `grass`, `rocky` or `sand`. The `shore` value in each scene is only the default.

## Pond design rules

| Parameter | Range | Why |
|---|---|---|
| `rx` | 60–100 px | Below about 50 px, the shore bands and decor cover the water. |
| `ry / rx` | 0.65–0.8 | The 3/4 view compresses depth. A pond with `ry = rx` looks tall and egg-shaped. |
| `wobble` | 0.08–0.14 | Higher values give a ragged lake rather than a calm pond. |
| `harmonics` | 3–5 | More harmonics add small coves, which look noisy at pond scale. |
| Canvas margin | ≥ `shoreWidth[1]` + 30 px around the blob | Room for the outer shore and the tall decor on the north bank. |

Composition:
- Put the pond so that its north bank is visible. The bank face is the strongest depth cue.
- One reed bed on a grass pond is enough to read as "pond". Three or more makes it a marsh.
- Sand ponds read as oases: add a palm shrub on the outer band (the style does this already).
- Rocky ponds want 2–3 boulders straddling the waterline and at most 1 rock in open water.

---

<a id="pond-round"></a>
## pond-round — Round pond (default: grass)

The minimum viable pond: one blob.

```js
{ id: 'pond-round', width: 384, height: 256, seed: 11, shore: 'grass',
  bodies: [{ kind: 'blob', x: 192, y: 128, rx: 92, ry: 64, wobble: 0.10, harmonics: 4 }] }
```

- Shoreline is about 520 px, which gives about 50 decor items (grass).
- Grass: 1–2 reed beds, about 18 tufts on the rim, a mud line and a 2–4 px earth face on the north bank. The water is tinted green.
- Rocky: about 10 boulders along the waterline in clusters of 1–3, a gravel band with an inner stone band, and a 3–6 px stone face.
- Sand: a 10–24 px sand band (wide on one side, narrow on the other because of the low-frequency width noise), wet sand at the waterline, shells, and turquoise shallows with bright foam.

<a id="pond-kidney"></a>
## pond-kidney — Kidney pond (default: sand)

Two overlapping blobs give an organic waist without any extra shape maths.

```js
bodies: [
  { kind: 'blob', x: 150, y: 116, rx: 72, ry: 50, wobble: 0.12 },
  { kind: 'blob', x: 240, y: 150, rx: 64, ry: 46, wobble: 0.12 },
]
```

- Offset the second blob diagonally (here +90, +34) by about 1.0–1.3 × the smaller `rx`. Too close gives just a bigger oval; too far gives two ponds joined by a neck.
- The distance field treats the union as one shape. Do **not** draw two shores and try to blend them.
- The waist is where the shore band is widest and decor gathers. That is the natural place for a path or bridge.

<a id="pond-tiles"></a>
## pond-tiles — Pond from a 32 px tile grid (default: rocky)

Use this when a level is authored on a tile grid and the agent must keep that grid for game logic.

```js
bodies: [{ kind: 'tiles', x: 64, y: 32, cell: 32, round: 0.55, rows: [
  '..####..',
  '.######.',
  '########',
  '.#######',
  '..####..',
  '...##...',
]}]
```

How the rounding works:
1. Fill each `#` cell with coverage 1.
2. Box blur twice with radius `round(cell × round)` = 18 px.
3. Threshold at 0.5.

This turns each 90° outer corner into an arc of radius about `cell × round`, and fills each inner (concave) corner. The source cells show in Debug mode as red dashed squares.

| `round` | Result |
|---|---|
| 0.3 | Still visibly blocky; corners only chamfered. |
| 0.5–0.6 | **Recommended.** Natural outline that still follows the grid. |
| 0.8+ | Single-cell bays and peninsulas disappear; the shape turns into a blob. |

Authoring tips for the grid:
- Avoid long straight rows of equal length. Stagger row starts and ends by 1 cell, as in the example.
- A 1-cell-wide arm (`...##...`) becomes a small cove or inlet after rounding. Keep it; it adds character.
- A single isolated `#` cell disappears at `round ≥ 0.5`. Use at least 2×2 cells for a puddle.
- For collision, use `S` from the renderer, not the raw cells. The rounded shape differs from the cells by up to about 10 px.

<a id="pond-brook"></a>
## pond-brook — Spring pond with outflow brook (default: grass)

A pond with an exit stream, built as a blob plus a narrow river.

```js
flow: [0, 0],
bodies: [
  { kind: 'blob', x: 140, y: 104, rx: 80, ry: 56, wobble: 0.12 },
  { kind: 'river', path: [[200,130],[250,170],[290,196],[330,236],[360,300]], width: [13, 10], widthNoise: 0.25 },
]
```

- Start the river path **inside** the blob, about 0.6 × `rx` from the centre, so the discs merge into the pond with no gap.
- End the path outside the canvas (here y = 300 > 256). The 48 px padding then keeps the bank continuous to the screen edge.
- Brook width is 10–14 px. Narrower brooks get their bank face capped by `RUN × 0.3`, so they stay visibly water.
- Set `flow: [0, 0]` when a pond dominates the scene. A drifting pond surface looks wrong; a still brook at this scale is fine.

## Common pond mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Pond looks like a blue egg | `ry ≈ rx` | Use `ry ≈ 0.7·rx`. |
| Water is mostly hidden | Tall decor on the south shore, or density too high | Lower `density`; tall sprites go on north or side shores. |
| Edge looks like a vector outline | `edgeRag` set to 0, or anti-aliased drawing | Keep `edgeRag` ≥ 1 and `imageSmoothingEnabled = false`. |
| Square corners from a tile grid | Tile mask used directly | `kind: 'tiles'` with `round` 0.5–0.6. |
