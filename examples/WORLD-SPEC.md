# WORLD-SPEC — rebuilding a world map from the ZRPG catalogue

How `world.html` / `world.js` turn the reference picture `../world_map.jpg` (an "Arcade World Map") into a static map made only of catalogue sprites. Follow this spec to rebuild that map, or to build another map in the same style. `world.js` is the reference implementation, and all of its data sits in the constants at the top of the file.

Read first: `../README.md` (catalogue, anchors, tilesets) and `WATER-SPEC.md` (the water renderer this builds on).

## 1. Ground rules

These rules come from design review. Breaking any of them was rejected.

1. **Use only catalogue sprites.** Never draw art procedurally. Painting is allowed only to mask textures that come from the catalogue, plus the final colour grade (§8).
2. **Do not emulate what the library does not have.** There are no buildings, towns, markets, castles, bridges or characters. Leave them out rather than faking them from rocks or tents. One tent may mark a settlement. Never build a castle from rock pieces or a village from several tents.
3. **The map is static.** Draw the water once (`t = 0`). Do not run an animation loop.
4. **Nothing square.** Ground areas (sand, desert, swamp) are organic shapes with ragged edges. Never place a 9-slice sand or gravel rectangle as a region.
5. **Roads are trampled grass**, a lighter grass band with a dithered edge. They are not dirt strokes, rock patches or tiles.
6. **Two lakes are joined by a swamp**: wet ground with small pools and reeds. Never a bridge.
7. **A river crosses the map edge** at the top and at the bottom. It never starts or ends inside the map.
8. **Bones belong on sand.** Use mostly small bones (fragments, `bone_a/b`) plus at most one skull (`animal_skull`, not `cow_skull`), one ribcage and one long bone.
9. **Cacti only grow in the desert.** No cacti on grass, not even as stand-ins for slimes.
10. **No crowding.** Every scatter has a hard cap and a minimum spacing (§7). When in doubt, place fewer.
11. **Luxury finish.** Apply a warm grade, a soft sun glow and a vignette, and present the map in a framed page (§8).

## 2. Coordinates and scale

- Author everything in **reference px**: the pixels of `world_map.jpg` (1376 × 768).
- The world is **K = 2** times larger (2752 × 1536). At that size the library's sprites (e.g. an 80 px tree) match the reference's proportions. Convert with `s(v) = v * K` and nothing else.
- Sprites are referred to as `sheet/name`, never by id; ids change when the catalogue is regenerated. Resolve them with `catalog.sprites.find(s => s.sheet === sheet && s.name === name)`.
- Every sprite is placed by its **foot point** (`anchor`). Ground decals are blitted centred.

## 3. Pipeline

| # | Layer | Made of | Code |
|---|---|---|---|
| 1 | Water and grass base | `ZRPGWater.build(sprites, scene, 'grass')`, drawn once at t = 0 | `WATER` |
| 2a | Organic ground areas | texture masks: swamp, sand beach, rocky desert | `GROUNDS` |
| 2b | Roads | trampled-grass bands | `ROADS` |
| 3 | Sprites | forest border, groves, mountains, hand-placed objects, area scatter, meadow scatter; sorted by foot y | `BORDER`, `GROVES`, `MOUNTAINS`, `OBJECTS`, scatter |
| 4 | Finish | warm soft-light grade, sun glow, vignette | `FINISH` |

Flatten 1–4 into one canvas and draw it once. The water renderer exposes `sdf` (signed distance to the waterline: < 0 in water, > 0 on land) and accepts `decorFilter(x, y, rule)`. Every later layer uses `sdf` to stay out of the water.

## 4. Water (layer 1)

Water is built from `WATER-SPEC.md` bodies, scaled by K. The shore style is `grass`, with `density: 0.5`.

| Feature | Bodies (reference px) |
|---|---|
| Lake Joy | blob (535, 272) rx 112 ry 84 + outlet bay blob (650, 300) rx 50 ry 42 |
| North river | river from (690, **−40**) down to (732, 322), width 30→36. It starts above the canvas. |
| Joy → swamp | river (650, 300) → (732, 326), width 34→26 |
| Swamp pools | 8 small blobs with rx 11–30, ry 6–14 and wobble 0.25–0.3, in a loose chain from (738, 340) down to (712, 440). Neighbouring pools may touch but must not form a channel. |
| Lake Byte | blob (770, 535) rx 152 ry 100 + west lobe (648, 600) rx 58 ry 68 + island (664, 616) rx 30 ry 24 |
| South river | river (648, 640) → (640, **800**), width 56→52. It ends below the canvas. |

`decorFilter` vetoes waterline decor (reeds, tufts) inside the sand beach, enlarged by 24 ref px. A beach has no reeds.

## 5. Ground areas (layer 2a)

Each area is a union of ellipses `[x, y, rx, ry]`. A pixel belongs to the area when

```
e = min over ellipses of hypot((x-bx)/rx, (y-by)/ry) + fbm(x/40, y/40)·0.16 + fbm(x/6, y/6)·0.035  (+ bayer·0.22 if soft)
e < 1  and  sdf > 0
```

Keep a per-pixel `areaOf` index; scatter and tree placement use it. Paint with world-aligned texture patterns (the pattern transform offsets the box origin) through a per-pixel mask, so edges stay pixel-crisp.

| Area | Base texture | Extras | Ellipses (ref px) |
|---|---|---|---|
| `swamp` | `rocks2/grass_tile_dark` | soft (dithered) edge; mud `rgba(66,54,26,0.38)` where `sdf < 5 ± 3` or `vnoise(x/22) > 0.66` | (710, 388, 66, 58), (760, 356, 36, 26), (664, 404, 34, 26) |
| `dunes` (sand beach) | `beach/sand_pit_light_small_c` | wet sand `rgba(110,70,30,0.32)` where `sdf < 7 ± 3`; rim `rgba(168,118,58,0.55)` where `e > 0.93` | (1015, 556, 96, 90), (925, 548, 60, 84) reaching into Lake Byte, (960, 625, 80, 42), (1085, 612, 44, 48) |
| `desert` (rocky) | `beach/sand_pit_dark_b_c` | gravel `rocks2/gravel_patch_round_c` where `vnoise(x/26) + fbm·0.12 > 0.52`; rim `rgba(120,80,40,0.5)` | (1200, 566, 74, 80), (1160, 616, 46, 38), (1236, 516, 38, 30) |

The beach must touch the lake. An ellipse has to overlap the water, because `sdf > 0` clips it to the shoreline. After the beach, blit up to 14 sand decals (ripples, clumps, one small crater). Each must sit at least 30 world px inside the beach and 22 px from water.

## 6. Roads (layer 2b)

- Each road is a centreline of reference points through Catmull-Rom (12 samples per segment) plus a width `w` (13–20 ref px).
- Distance field: stroke the centreline 2 px wide into an offscreen canvas over the road's bounding box, then run `ZRPGWater.util.edt` to get `D`, the distance to the centreline.
- Coverage: `c = 1 − D / (hw · (1 + 0.28·fbm(x/70, y/70))) + fbm(x/9, y/9)·0.18`, with `hw = s(w)/2`.
- Trampled grass: the top 32 rows of `rocks2/grass_cross_frame_b`, which are solid yellow-green, used as the texture where `c + bayer·0.35 > 0.18`. This gives the dithered, wavering edge.
- Worn spots: `beach/sand_pit_light_small_c` at opacity 0.5, where `c > 0.55` and `vnoise(x/30, y/30) + bayer·0.18 > 0.6`.
- Skip pixels in water (`sdf ≤ 3`) and on the sand beach. Roads simply fade into the swamp and the sand.
- Mark `nearRoad` within 1.6·hw of the centreline. Trees and scatter never stand on a road.

Reference roads: the main road runs from the start (150, 602) across the swamp at y ≈ 390 to the north-east (1140, 278). Branches go from the start to Pixel Town, around the Level 1 Forest loop, and down to the dunes.

## 7. Sprites (layer 3)

All sprites go into one list sorted by foot y (ties by x) and are drawn with `anchor`.

**Trees.** Use `trees/` `round_tree_small`, `round_tree_dense`, `round_tree_tiny`, `oak_small_c`, `oak_small_d`, `pine_small` and `pine_small_wide`. No large oaks: they dwarf the map.
- **Border forest:** a jittered grid (step 44 world px, jitter 0.9·step) inside a band with sides left 104, right 90, top 118 and bottom 94 ref px, each ±22 ref px of fbm. Fill probability is 0.85. Leave gaps where the rivers cross the top and bottom edges, and skip spots in water, in ground areas or in mountain ellipses.
- **Groves:** ellipses on a grid of step 44 with jitter 30 and fill 0.85. Skip spots on roads, in ground areas and in `KEEP_OUT` boxes.

**Mountains.** These are clusters of `rocks2/` `cliff_column`, `cliff_column_shadow`, `pillar_2/4/6/8` and `outcrop_small_shadow`, spread over an ellipse in north→south order:
- North-west: (175, 360), rx 62, ry 70, 13 pieces.
- East: (1222, 372), rx 52, ry 98, 16 pieces.

**Hand-placed objects (`OBJECTS`).** Each region gets a few stand-ins:

| Region | Objects |
|---|---|
| Pixel Town | **one** `jungle/canvas_tent`, `jungle/campfire_logs`, `trees/wooden_signpost` |
| Starting Area | `jungle/skull_spear_banner` (the flag), `trees/hollow_log` |
| Slime Hills | open meadow: 3 bushes, 2 stones, 1 flower cluster (no cacti) |
| Level 1 Forest | 2 monsters (`jungle/purple_alien_pod`, `orange_carnivorous_pod`), ruin `rocks2/pillar_1` + `pillar_3` |
| Lakes | boats as `jungle/hollow_log` / `hollow_log_mossy` on the water; island: 2 trees + 1 bush |
| Swamp | `jungle/hollow_log_mossy`, one `beach/dead_gnarled_tree`, one `jungle/dark_frond_bush_1` |
| North-east (boss lands) | `jungle/crystal_node_corrupted` ×2, `jungle/purple_spiky_alien` |
| Dunes | `beach/saguaro_light`, `saguaro_small_a`, `prickly_pear`, `sand_dune_a_left`, `sand_dune_b_right`, `animal_skull`, `ribcage`, `long_bone` |
| Rocky desert | `beach/dead_gnarled_tree` ×2, `beach/fallen_dead_branch`, `rocks2/outcrop_small`, `outcrop_small_shadow` |
| Roads | 3 monsters in total, never on the road itself |

**Area scatter.** These caps and spacings are the anti-crowding rules:

| Area | Max | Min spacing (ref px) | Water margin (world px) | Sprites |
|---|---:|---:|---:|---|
| swamp | 11 | 40 | 4 | `rocks2/grass_tuft_green(_cluster)`, `trees/grass_tuft_a`, `jungle/grass_blades`, `beach/grass_tuft_tall`, `trees/fern_small`. No tall `reed_orange_sheath`. |
| dunes | 12 | 40 | 16 | small bones: `beach/bone_fragment_*`, `bone_fragments_*`, `bone_a`, `bone_b` |
| dunes | 10 | 40 | 16 | `beach/pebble_*` |
| desert | 14 | 48 | 10 | `rocks2/small_boulder_a/b`, `pebble_crumbs_a`, `pebble_c`, `low_rock_grass_a`, `beach/sand_pebbles_set_a`, `dry_shrub` |

**Meadow scatter.** At most 110 sprites, at least 70 world px apart, on open grass only: not on roads, in ground areas, in `KEEP_OUT` or within 14 px of water. The mix is 55 % flowers, 25 % stones and 20 % bushes.

`KEEP_OUT` (ref px): the NW mountains, Slime Hills, the Starting Area, the tent and the E mountains.

## 8. Finish (layer 4) and page

Apply these on the flattened canvas, in this order:
1. `soft-light`, filling the whole canvas with `rgba(255,206,140,0.22)` (warm grade).
2. `screen`, with a radial gradient centred at (0.25 W, 0.1 H), radius 0.7 W, going from `rgba(255,244,214,0.14)` to transparent (sun glow from the north-west).
3. `source-over`, with a radial vignette centred on the map from radius 0.45 H to 0.62 W, ending at `rgba(6,14,10,0.5)`.

Page: a dark green-black radial background, a serif title, and the canvas at 100 % width with `image-rendering: pixelated`. The canvas sits inside a frame with a 10 px gold gradient border (`#c9a45c → #7d5f2a → #e3c27a`), a 2 px dark inner border, a light 1 px inner outline and a deep drop shadow. Add a "New variation" button (rebuild with a random seed) and a 1:1 toggle.

## 9. Self-check

Render the canvas (headless Chrome with `--allow-file-access-from-files`, a harness page that draws `ZRPGWorld.build(...)` into a 2752 × 1536 canvas) and inspect it at 50 % and at 1:1:

- [ ] There are no buildings, castle, bridge, market stalls or groups of tents; there is exactly one tent.
- [ ] The river leaves the top edge and the bottom edge.
- [ ] The lakes are connected only through swamp pools on dark wet ground; the trail crosses the swamp.
- [ ] The roads look like lighter grass with soft dithered edges: no hard outline, no rock patches.
- [ ] The beach is organic, touches Lake Byte, and has no reeds; the rocky desert joins it on the east.
- [ ] Bones lie only on sand, mostly small ones; there is one `animal_skull` and no `cow_skull`.
- [ ] No cacti appear outside the dunes.
- [ ] No two scatter sprites touch; clearings stay clear; the forest border shows gaps between trees.
- [ ] The warm grade and vignette are visible but subtle, and the colours are not muddy.
- [ ] There are no console errors, and every `sheet/name` resolves.
