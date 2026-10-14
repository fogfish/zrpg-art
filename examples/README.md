# examples/ — water, terrain and a world map

Worked examples of natural-looking water built from the ZRPG sprites. The catalogue has no shore or edge autotiles, so water is painted in distance bands around a water mask instead of being placed tile by tile.

| File | For | What |
|---|---|---|
| `index.html` | people | Overview: pond / lake / river × grass / rocky / sand shore. |
| `ponds.html`, `lakes.html`, `rivers.html` | people | Interactive variants: switch shore, re-roll the seed, show the debug bands. |
| `WATER-SPEC.md` | agents | The algorithm, every parameter, the sprite ids per shore, placement rules and a self-check list. **Start here.** |
| `ponds.md`, `lakes.md`, `rivers.md` | agents | Recipes: each example's exact data, the design ranges and common mistakes. |
| `water.js` | both | Reference renderer (`ZRPGWater.load / build / mount`). No dependencies. |
| `scenes.js` | both | The example scenes as data (`window.WATER_SCENES`). |
| `gallery.js`, `examples.css` | people | Page shell for the HTML examples. |
| `terrain.html`, `terrain.js` | both | Sand, rock and grass terrain from the 9-slice tilesets (`ZRPGTerrain.load / draw / size`). |
| `world.html`, `world.js`, `WORLD-SPEC.md` | both | `../world_map.jpg` rebuilt from the catalogue as one static map: lakes joined by a swamp, the river crossing the map, trampled-grass trails, a sand beach and rocky desert, forests, mountains. **Agents start with `WORLD-SPEC.md`.** |

Open the HTML files straight from disk (`file://` works). They load `../catalog.js` and `../atlas/atlas-0.png`, so keep this folder inside the repo.

Quick start in a game:

```html
<script src="assets/tiles/catalog.js"></script>
<script src="water.js"></script>
<script type="module">
  const sprites = await ZRPGWater.load('assets/tiles/');
  const lake = ZRPGWater.build(sprites, {
    width: 640, height: 416, seed: 5,
    bodies: [{ kind: 'blob', x: 320, y: 208, rx: 228, ry: 136, wobble: 0.22, harmonics: 7 }],
  }, 'rocky');
  // each frame: lake.draw(ctx, performance.now());
</script>
```
