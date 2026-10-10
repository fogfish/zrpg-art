# WATER-SPEC.md — natural ponds, lakes and rivers with ZRPG art

This spec tells a coding agent how to build water bodies that look natural with the sprites in this repo. Read it before you place any water or shore sprite.

- Reference implementation: [`water.js`](water.js). It is about 700 lines with no dependencies, works from `file://`, and exposes `ZRPGWater.build()`.
- Example scenes: [`scenes.js`](scenes.js).
- Recipes per body type: [`ponds.md`](ponds.md), [`lakes.md`](lakes.md), [`rivers.md`](rivers.md).
- Visual check: open [`index.html`](index.html), [`ponds.html`](ponds.html), [`lakes.html`](lakes.html) or [`rivers.html`](rivers.html) in a browser.

Every number below is copied from `water.js`. If you change one, change both.

---

## 0. Rules (read first)

1. **Do not build water from tiles.** The catalogue has **no** shore, edge or corner autotiles for water. The only water art is `water-water-001..021`: a seamless 320×128 texture, animated at 6 fps. Laying it out cell by cell, or ringing it with sand tiles, always produces square, staircase edges.
2. **Build a water mask, then derive everything from distance to its edge.** Draw shore textures, shallows, foam, the bank face and decoration placement as functions of `S`, the signed distance in pixels to the waterline.
3. **Each band varies in width.** Use low-frequency noise for width and high-frequency noise for edge roughness. If any band has a constant width anywhere, the result looks artificial.
4. **North banks show a face; south banks do not.** The game uses a 3/4 top-down view. Where land lies directly **above** water on screen, draw a 1–6 px vertical bank face with a shadow under it. Where land lies below water, draw a light rim instead.
5. **Hide the seam with decor that straddles it.** Place boulders, reed beds and stones with their foot point in the band `S ∈ [-5, +3]` and draw a ripple ring under the ones that stand in water.
6. **Pick from catalogue sprites only.** Do not invent ids. Every id used here exists in `../catalog.json`.
7. **Keep pixels crisp.** Use integer scale, `imageSmoothingEnabled = false`, binary masks (alpha 0 or 255) and ordered dithering for soft transitions. Do not use anti-aliased blur.

---

## 1. What the catalogue gives you

| Role | Sprite id(s) | Size | Notes |
|---|---|---|---|
| Water texture | `water-water-001` … `021` | 320×128 | Seamless **in both axes** (checked: seam difference equals the in-texture difference). 21 frames at 6 fps (`catalog.animations.water`). |
| Ground grass (light) | `rocks2-terrain-014` | 64×64 | Seamless. Base ground in every example. |
| Lush grass (dark) | `rocks2-terrain-020` | 64×64 | Seamless. Grass shore rim. |
| Sand | `beach-terrain-026` (`sand_strip_b`) | 96×32 | Seamless and fully opaque. Sand shore and sand bank face. |
| Gravel | `beach-terrain-007` (`gravel_tile_hole`) | 64×64 | Has a centre hole: use **hole fill** (§3.1). Rocky shore; dirt bank face (tinted). |
| Stones | `rocks2-terrain-012` (`stone_tile_hole`) | 64×64 | Has small holes: use hole fill. Inner rocky band; rocky bank face. |
| Reeds | `beach-plant-003`, `beach-plant-002` | 96×127, 64×96 | Rectangular blocks. Do not place them raw; clip them to a reed-bed shape (§6.3). |

Do **not** use these for water edges:
- The 32×32 tiles `rocks2-terrain-004..007` are flat single colours.
- `trees-terrain-002/003/009/011`, the dark teal patches, clash with the light ground.
- `beach-rock-013/017` (`sand_pebbles_set_*`) are tall scatter sets whose art reaches about 57 px above the anchor, so they end up drawn over the water.
- `jungle-plant-009` reads as a dead tree, not a cattail.
- `sand_ring_*`, `sand_pit_*` and `sand_crater_*` are craters, not shores.

---

## 2. Units and coordinates

- World px at 1× scale. The examples use canvases of 384×256 (ponds) and 640×384 or 640×416 (lakes, rivers). Display them at 2× or 3×.
- `S(x,y)` is the **signed distance** in px to the waterline. `S < 0` is water, `S ≥ 0` is land, and `S = 0` is the waterline.
- `Wsh(x,y)` is the local **shore width** in px.
- `t = S / Wsh` is the position across the shore: 0 at the waterline, 1 at the outer shore edge.
- `U(x,y)`, for water pixels only, is the count of consecutive water pixels straight up to the first land pixel. `U = 1` means the land pixel is directly above.
- `RUN(x,y)` is the length of the vertical water run that a pixel belongs to.

---

## 3. Pipeline

```
bodies ──raster──▶ mask (padded) ──EDT──▶ S_raw ──+noise──▶ S
                                                     │
                       Wsh = lerp(w0,w1, lowNoise)·bias
                                                     ▼
  ground ▸ shore bands ▸ ground decals ▸ [water ▸ overlay ▸ foam] ▸ sorted sprites
```

### 3.1 Textures

- `pattern(id)`: draw the sprite into a w×h canvas and use `createPattern(..., 'repeat')`. Fill with `fillRect(0,0,W,H)` so the pattern stays world-aligned.
- **Hole fill**, for tiles with a transparent centre: on a w×h canvas, draw the tile 4 times offset by `(w/2, h/2)` with wrap-around, then draw it once at `(0,0)` on top. The holes in the top copy are filled from the shifted copy. The result is still seamless.

### 3.2 Rasterise the bodies into a mask

Use a grid of `(W + 2·PAD) × (H + 2·PAD)` with `PAD = 48`, so rivers that leave the screen still get correct distances at the canvas edge. Process the bodies in order:

| `kind` | Fields | Rasterisation |
|---|---|---|
| `blob` | `x, y, rx, ry, wobble=0.12, harmonics=4` | Inside if `ρ < r(θ)` with `ρ = √(dx²+dy²)`, `dx = (x-cx)/rx`, `dy = (y-cy)/ry`, `r(θ) = 1 + Σ_{k=2..n+1} a_k·sin(kθ + φ_k)`, `a_k = wobble·(0.4+0.6·rnd)/(k-1)^0.7`, `φ_k = rnd·2π`. Sets mask to 1. |
| `island` | same as blob | Same test, but sets mask to 0. Put islands **after** the bodies they cut. |
| `river` | `path:[[x,y]…], width:[w0,w1], widthNoise=0.2` | Sample a Catmull-Rom spline through `path` every ~2 px. At arc length `s`, the width is `lerp(w0,w1,s/L)·(1 + widthNoise·fbm(s/60))`. Stamp a disc of radius `width/2` at every sample. |
| `tiles` | `x, y, cell=32, rows:[...], round=0.5` | Fill each `'#'` cell as a square of coverage 1. Box blur twice with radius `round(cell·round)`, then set `mask = coverage > 0.5`. This rounds every corner. Use it when the level is authored on a tile grid. |

The union of bodies is just the union of masks. A pond plus a brook, or a lake plus an inlet, therefore gets one continuous shore with no seam.

### 3.3 Signed distance

Compute exact Euclidean distance transforms (Felzenszwalb, O(n)) twice: `dOut` = distance to the nearest water pixel, `dIn` = distance to the nearest land pixel. Then:

```
S_raw = mask ? -(dIn - 0.5) : (dOut - 0.5)
S     = S_raw + fbm(x/7, y/7) · edgeRag           // ragged waterline, 1–1.6 px
Wsh   = lerp(w0, w1, 0.5 + 0.5·fbm(x/70, y/70, 2 octaves)) · bias
```

- `fbm` is 3-octave value noise in about [-1, 1], seeded per scene.
- `bias` is 1, except near rivers (§3.4).
- Recompute the water mask as `S < 0` and use that from here on.

### 3.4 River bend bias (point bars and cut banks)

For every land pixel within `halfWidth + 60` px of a river centreline, find the nearest centreline sample (on a 4 px coarse grid). Then:

```
k     = signed curvature at that sample, smoothed over ±10 samples (~40 px); + = turning left
side  = sign(cross(tangent, p - sample))       // + = left bank
bias  = clamp(1 + 1.1 · clamp(k·45, -1, 1) · side, 0.35, 2.2)
```

The **inside** of a bend gets up to 2.2× shore width: a sand or gravel point bar. The **outside** gets as little as 0.35×, with a taller bank face (§3.5), which is the cut bank.

### 3.5 Bank face (3/4 view)

```
faceH = min( round( lerp(h0, h1, vnoise(x/9, y/40)) · clamp(2 - bias, 0.6, 1.8) ),
             floor(RUN · 0.3) )
face       : water && U ≤ faceH                         → face texture + face tint
waterline  : water && U == faceH + 1                    → rgba(10,18,36,0.55)
bank shadow: water && faceH+1 < U ≤ faceH+1+shadow.h    → shadow colour
rim        : water && -S < 1.1 && U > faceH + 1         → rim colour (south/east/west edges)
```

The `RUN·0.3` cap stops narrow brooks from being covered by their own bank.

### 3.6 Shore bands (land side, drawn in order)

For band limit `L`, a pixel is in the band if `0 ≤ S < L + rag`:
- `to: 1` means `L = Wsh + fbm(x/5, y/5)·outerRag` (the ragged outer edge).
- `to: f` means `L = Wsh·f`.
- `toPx: p` means `L = p`.
- `rag`, when set, is `fbm(x/4, y/4)·rag + bayer4(x,y)·0.8`. The dithered edge stays pixel-art.

Each band is a texture (`tex`) or a translucent colour (`color`) painted through the band mask.

### 3.7 Water (drawn every frame)

1. Water texture frame `floor(t·6/1000) % 21`, translated by `flow·t`. Rivers move along the first river's direction at `flowSpeed` px/s (10–18). Lakes drift by about `[3,1]` px/s. Ponds use `[0,0]`.
2. Static overlay: whole-water `tint`; then shallow steps `-S < depth + bayer4·1.6 + fbm(x/11)·1.2` from deep to shallow; then face, waterline, shadow and rim.
3. Foam, one of 4 precomputed phases in the sequence `0,1,2,3,2,1` at 330 ms per step. A pixel is foam if `| -S - (2.2 + p·foamSpread + fbm(x/9)·0.9) | < 0.55` and `vnoise(x/2.5, y/2.5) > 0.42`. The second test breaks the foam into dashes. Foam is skipped inside the face and shadow.
4. Clip all of the above with `destination-in` against the water mask.

### 3.8 Draw order per frame

```
ground (grass ▸ shore bands ▸ ground decals)   static, cached
water layer (texture ▸ overlay ▸ foam) ∩ mask   per frame
sprites (ripple ring ▸ sprite), sorted by foot y  static, cached
```

In a game with moving actors, merge the decor sprites into the normal y-sorted sprite pass instead of caching them in one layer.

---

## 4. Shore styles

Shared by all styles: ground `rocks2-terrain-014`, plus meadow flowers `trees-plant-001/002/003` at `S ≥ 40`, `per100: 0.8`, `spacing: 22`.

### 4.1 Sand

| Item | Value |
|---|---|
| shoreWidth | 10–24 px; edgeRag 1.0; outerRag 3.5 |
| bands | `beach-terrain-026` to the outer edge ▸ wet sand `rgba(120,72,28,0.30)` for `S < 4` (rag 1.5) |
| face | h 1–2 px, `beach-terrain-026` + `rgba(110,62,18,0.55)`. Beaches are low. |
| water | tint `rgba(30,150,175,0.22)`; shallows `10 px rgba(90,205,210,0.28)`, `4.5 px rgba(160,235,220,0.32)`; shadow 1 px `rgba(0,20,50,0.25)`; rim `rgba(250,252,255,0.9)`; foam `rgba(240,250,255,0.75)`, spread 1.3 |

| Decor | Sprite ids | Band | per100 | spacing | clear |
|---|---|---|---|---|---|
| sand clumps (ground decal) | `beach-terrain-016..019` | t 0.95–1.25 | 2.6 | 9 | – |
| sand splat (ground decal) | `beach-terrain-006` | t 0.9–1.15 | 0.5 | 40 | – |
| shells | `beach-prop-001,003,004,005,006,007,009,010,013,015,017,019,022,023` | t 0.15–0.85 | 1.3 | 16 | – |
| pebbles | `beach-rock-001,002,004..012` | t 0–0.45 | 1.8 | 9 | – |
| grass sprigs | `beach-plant-004,005,006,007,008,010,011,012` | t 1.0–1.6 | 3.2 | 7 | – |
| tall tuft | `beach-plant-015` | t 1.0–1.4 | 0.35 | 34 | 5 |
| palm shrubs | `beach-bush-022, 023` | t 1.2–2.0 | 0.22 | 90 | 20 |

### 4.2 Rocky

| Item | Value |
|---|---|
| shoreWidth | 6–14 px; edgeRag 1.6; outerRag 3 |
| bands | gravel `beach-terrain-007` (hole fill) to the outer edge ▸ stones `rocks2-terrain-012` (hole fill) for `S < 0.5·Wsh` (rag 2) ▸ wet `rgba(20,30,50,0.30)` for `S < 3` |
| face | h 3–6 px, `rocks2-terrain-012` + `rgba(15,22,40,0.50)` |
| water | no tint; shallows `6 px rgba(70,165,190,0.25)`, `2.5 px rgba(120,200,215,0.25)`; shadow 3 px `rgba(0,15,45,0.32)`; rim `rgba(235,245,255,0.8)`; foam `rgba(235,245,255,0.6)`, spread 0.9 |

| Decor | Sprite ids | Band | per100 | spacing | clear | other |
|---|---|---|---|---|---|---|
| gravel splats (ground) | `beach-terrain-008` | t 0.9–1.15 | 1.0 | 26 | – | |
| rubble strips (ground) | `rocks2-terrain-021, 024` | t 0.85–1.2 | 0.35 | 60 | – | |
| outcrops | `rocks2-rock-037, 038` | S −8…4 | 0.1 | 220 | 40 | ripple; **lakes only** |
| waterline boulders | `rocks2-rock-016,017,018,008,009` | S −5…3 | 2.0 | 18 | 7 | ripple; cluster 1–3 within 12 px |
| low rocks | `rocks2-rock-011,014,007,010` | S −1…8 | 1.0 | 16 | 5 | |
| rocks in water | `rocks2-rock-011,018,016,013` | S −16…−6 | 0.3 | 36 | 8 | ripple |
| pebbles | `rocks2-rock-012,013,015,043,045`, `beach-rock-003,007` | t 0.05–0.95 | 3.0 | 8 | – | |
| crumbs | `rocks2-rock-042, 044` | t 0.3–1.0 | 0.45 | 36 | – | |
| rock clusters on grass | `rocks2-rock-004,005,006` | t 1.0–1.7 | 0.7 | 26 | 6 | |
| grass tufts | `trees-plant-006, 007` | t 1.05–1.8 | 0.9 | 20 | – | |

### 4.3 Grass

| Item | Value |
|---|---|
| shoreWidth | 4–11 px (a lush rim, not a beach); edgeRag 1.2; outerRag 4 |
| bands | lush grass `rocks2-terrain-020` to the outer edge ▸ mud line `rgba(72,58,22,0.55)` for `S < 1.8` (rag 1.0) |
| face | h 2–4 px, gravel `beach-terrain-007` (hole fill) + `rgba(66,40,12,0.60)`, which reads as earth |
| water | tint `rgba(30,110,80,0.24)` (green, murky); shallows `6 px rgba(70,150,110,0.28)`, `2.5 px rgba(110,170,110,0.30)`; shadow 2 px `rgba(0,25,30,0.32)`; rim `rgba(205,235,210,0.45)`; foam `rgba(220,240,225,0.32)`, spread 0.8 |

| Decor | Sprite ids | Band | per100 | spacing | clear | other |
|---|---|---|---|---|---|---|
| reed beds | clipped `beach-plant-003` / `002` (§6.3) | S −5…1 | 0.32 | 56 | 16 | ripple; rx 9–20, ry 4–7, height 14–26 |
| waterline stones | `rocks2-rock-013, 011` | S −2…2 | 0.35 | 40 | 5 | ripple |
| mossy log | `jungle-prop-007` | S −3…3 | 0.05 | 400 | 14 | ripple; max 1; shoreline ≥ 900 px |
| tufts | `trees-plant-006, 007`, `jungle-plant-011`, `beach-plant-015` | t 0–1.3 | 3.6 | 10 | 3 | |
| sprigs | `beach-plant-004,005,006,007,008,010,011,012` | t 0.2–1.8 | 3.0 | 7 | – | |
| ferns | `trees-plant-008`, `jungle-bush-008` | t 1.0–2.6 | 0.35 | 50 | 12 | |
| wild flowers | `jungle-plant-016, 017`, `trees-plant-005` | t 1.3–3.5 | 0.7 | 22 | – | |

---

## 5. Choosing a shore

| Shore | Use for | Feels like |
|---|---|---|
| Grass | Meadow ponds, forest lakes, lowland rivers | Calm, overgrown, green-tinted water, reeds |
| Rocky | Mountain lakes, brooks, rapids, cliffs nearby | Cold, clear, tall stone bank, boulders in the water |
| Sand | Beaches, desert oases, wide river bends | Bright turquoise shallows, wide pale band, shells |

You can mix shores on one body: compute the band per pixel from a style map, for example `style = noise > 0.3 ? rocky : grass`. Keep each region at least about 80 px of shoreline long, or it looks noisy.

---

## 6. Decoration placement

### 6.1 Algorithm (per rule, in table order)

```
perimeter = count of pixels with -1 ≤ S < 0                 // shoreline length, px
want      = round(per100 · perimeter/100 · scene.density + rnd·0.6), capped by max
cand      = all pixels in the rule's band (s:[a,b] on S, or t:[a,b] on S/Wsh with S ≥ 0)
repeat up to want·40 times:
  pick a random candidate (a cluster rule adds 0–2 extra points within ±r px)
  reject if outside the band, closer than `spacing` to one of this rule's items,
  or closer than clear_a + clear_b to any earlier item with clear > 0
  accept → item {id: random from ids, x, y, wet: S(x,y) < 0}
```

- The foot point (`anchor`) of a sprite lands on `(x, y)`.
- Ground decals (`layer: 'ground'`, terrain sprites with a 0,0 anchor) are **centred** on `(x, y)` and drawn into the ground layer.
- Rules earlier in the table win space. Put big blocking items (outcrops, boulders, reed beds) before small filler.
- Keep anchors inside `[4, W-4] × [6, H-2]`.

### 6.2 Ripple ring

Before drawing an item whose anchor is in water (`wet`) and whose rule has `ripple`, plot a 1 px pixel ellipse at `(x, y-1)` in `rgba(225,240,250,0.6)`:
- Sprites: `rx = clamp(0.42·spriteW, 4, 26)`, `ry = max(2, 0.28·rx)`.
- Reed beds: `rx = bed.rx + 2`, `ry = max(2, 0.6·bed.ry)`.

### 6.3 Reed bed

Reed sprites are rectangles, so cut them into a natural clump:

1. Make a canvas of `(2rx+1) × (ht + 2ry + 2)`.
2. Tile `beach-plant-003` or `beach-plant-002` across it at a random x offset.
3. Keep a pixel in column `px` if `top ≤ py ≤ bottom`, where:
   - `ex = (px-rx)/rx`, `e = √(1-ex²)`
   - `bottom = cy + ry·e + (vnoise(px/3) - 0.5)·2`
   - `top = cy - ry·e - ht·e·(0.45 + 0.55·vnoise(px/1.6))`, which gives a jagged, blade-like top
   - `cy = ht + ry`
4. The anchor is `(rx, cy + ry)`.

### 6.4 Placement rules of thumb

- Waterline items use `S ∈ [-5, +3]`. Any further into the water and they float; any further out and they no longer hide the edge.
- In-water rocks use `S ∈ [-16, -6]`, sparse, always with a ripple.
- Do not mirror sprites. Shadows are baked in and fall to the right, so mirroring breaks the lighting.
- Tall sprites hang above their anchor. A sprite drawn on the south shore covers the water above it. Sprites taller than about `0.3 × water width` should only go on north or side shores, or be left out (see `sand_pebbles_set`, §1).
- Narrow water needs lower density: use `scene.density` 0.5 for brooks.

---

## 7. Using it in a game

- **Authoring.** Store a water body as data (`blob`, `river`, `tiles`, `island`), not as sprites. Keep a tile grid for game logic if you need one, and render water with `kind: 'tiles'` from that same grid.
- **Caching.** Build once per map chunk. Building costs 50–200 ms per 640×416 area. Keep the ground and decor canvases and redraw only the water layer each frame. Chunks must overlap by at least `PAD = 48` px, or by rendering the whole map mask, so that distances are continuous across chunk borders.
- **Collision.** Keep `S` (or a downsampled copy). Suggested defaults:
  - Water blocks walking where `S < -3`.
  - `-3 ≤ S < 0` is shallow and walkable at a slower speed.
  - Boulders and outcrops block with a small rectangle around their anchor (see README "Collision").
  - Reed beds do not block.
- **Determinism.** All randomness comes from `mulberry32(seed)` and hashed value noise. The same scene and seed always gives the same pixels, so you can store just the seed in save data.
- **API** (`water.js`):

```js
const sprites = await ZRPGWater.load('../');               // needs <script src="../catalog.js">
const r = ZRPGWater.build(sprites, scene, 'grass', seed?);  // 'grass' | 'rocky' | 'sand'
r.draw(ctx, timeMs, { debug: false });                       // ctx is a W×H canvas at 1x
r.stats  // { perimeter, decor, seed }
r.decor  // placed items [{ x, y, id, rule, layer, clear }] -> reuse for collision
```

Scene object (see `scenes.js`):

```js
{ id, width, height, seed, shore,          // shore = default style
  bodies: [ /* §3.2 */ ],
  flow: [vx, vy] | flowSpeed: n,           // optional water drift (px/s)
  shoreWidth: [w0, w1],                    // optional override of the style range
  density: 1 }                             // optional decor multiplier
```

---

## 8. Self-check before you ship a water body

Turn on **Debug bands** in the HTML pages, or call `draw(ctx, t, {debug: true})`, and check every item:

- [ ] The waterline (cyan) has no straight run longer than about 24 px and no 90° corners.
- [ ] The outer shore edge (orange) is ragged and its distance from the cyan line visibly varies.
- [ ] North banks show a bank face (magenta) with a dark waterline under it; south banks show a light rim.
- [ ] Foam is broken into dashes and moves.
- [ ] Shallow tint steps are dithered, not hard rings.
- [ ] At least one sprite straddles the waterline every 60–100 px of shoreline.
- [ ] No sprite floats in the middle of the water without a ripple ring.
- [ ] No sprite art covers more than about a third of a narrow river's width.
- [ ] No hard seam where two bodies join (pond and brook, lake and river).
- [ ] The texture drifts for rivers (along the flow) and not, or barely, for ponds.

Anti-patterns these examples replace:
- A rectangle of water tiles framed by a ring of sand tiles.
- Shore sprites rotated or mirrored to make corners.
- A constant-width outline.
- A smooth vector stroke.
- A river drawn as a polyline of constant width.
- Reed blocks placed as raw rectangles.
