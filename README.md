# ZRPG sprite assets

Ready-to-use 2D sprites for a top-down RPG in the browser: 379 objects (trees, bushes, plants, rocks, terrain tiles, props, animated water) cut pixel-exact from the five `ZRPG*.png` sheets in this folder, with a JSON catalogue that tells your code what each sprite is, how big it is, where it sits in the atlas and where its "feet" are.

- `OBJECTS.md` — full list of every sprite (id, class, name, size, description).
- `lightbox.html` — open in a browser to look at every sprite and review it.
- `examples/` — how to build natural ponds, lakes and rivers (there are no water-edge tiles): HTML demos for humans, `examples/WATER-SPEC.md` for agents.

## What to copy into the game

Copy **one** of these two sets. Paths inside the catalogue are relative, so keep the folder structure as is.

| Option                     | Copy                                          | Use when                                                                     |
| -------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| **A. Atlas** (recommended) | `atlas/` + `catalog.json` (or `catalog.js`)   | Canvas/WebGL games. One image download (≈1.2 MB, 2048×1822) for all sprites. |
| **B. Single files**        | `sprites/` + `catalog.json` (or `catalog.js`) | DOM/`<img>` based UIs, editors, or when you only need a handful of sprites.  |

`catalog.json` and `catalog.js` hold the same data. Use `catalog.json` with `fetch()` or an `import` from a bundler. Use `catalog.js` with a plain `<script>` tag when the page is opened from `file://` without a server; it sets `window.TILE_CATALOG`.

Example, copying option A into a game's `public/assets/tiles/`:

```sh
mkdir -p ../my-game/public/assets/tiles
cp -R atlas catalog.json ../my-game/public/assets/tiles/
```

**Do not copy:**
- `ZRPG*.png` — the source sheets. Bounding boxes on them overlap, so cropping a sheet pulls in neighbouring art. Use the exported sprites instead.
- `ZRPG*.md` — the old, inaccurate specs.
- `tools/`, `tiles-qa.json`, `lightbox.html`, `examples/` — these are for producing, reviewing and learning the assets, not for running the game. (`examples/water.js` may be copied if you want the reference water renderer.)

## Catalogue format

```jsonc
{
  "version": 2,
  "atlases": [{ "file": "atlas/atlas-0.png", "w": 2048, "h": 1822 }],
  "classes": [{ "name": "tree", "description": "..." }, ...],   // tree, bush, plant, rock, terrain, prop, water
  "animations": { "water": { "frames": ["water-water-001", ...], "fps": 6, "loop": true } },
  "sprites": [{
    "id": "trees-tree-001",            // stable key: <sheet>-<class>-<NNN>
    "name": "oak_large_a",             // readable slug, unique per sheet
    "class": "tree",
    "sheet": "trees",
    "description": "Large oak tree with wide cast shadow",
    "file": "sprites/trees/trees-tree-001.png",
    "w": 347, "h": 305,
    "atlas":  { "index": 0, "x": 351, "y": 2, "w": 347, "h": 305 },
    "anchor": { "x": 158, "y": 288 },  // foot point inside the sprite (trunk base; the shadow extends below)
    "shadow": true,                    // cast shadow is baked in
    "src": { "x": 23, "y": 18, "w": 347, "h": 305 }   // where it came from in the source sheet (info only)
  }]
}
```

## Drawing sprites (canvas)

```js
const BASE = 'assets/tiles/';
const cat = await (await fetch(BASE + 'catalog.json')).json();
const atlases = await Promise.all(cat.atlases.map(a => new Promise((ok, err) => {
  const img = new Image(); img.onload = () => ok(img); img.onerror = err; img.src = BASE + a.file;
})));
const byId = new Map(cat.sprites.map(s => [s.id, s]));

// Draw a sprite so that its foot point lands on (worldX, worldY).
function drawSprite(ctx, id, worldX, worldY, scale = 1) {
  const s = byId.get(id), a = s.atlas;
  ctx.drawImage(atlases[a.index], a.x, a.y, a.w, a.h,
                Math.round(worldX - s.anchor.x * scale), Math.round(worldY - s.anchor.y * scale),
                a.w * scale, a.h * scale);
}

ctx.imageSmoothingEnabled = false;   // keep pixel art crisp
```

With option B, load `BASE + s.file` and draw the whole image with `ctx.drawImage(img, dx, dy)`.

## Rules of thumb

- **Placement and depth.** The anchor is the bottom centre of the object's body, with any shadow excluded. Place objects by their anchor. Each frame, draw `terrain`, then `water`, then all other sprites sorted by `worldY`, so things lower on screen cover things behind them.
- **Ground tiles.** `terrain` and `water` sprites anchor at `0,0` (top-left) and are drawn on a grid.
  - Square tiles are 32×32 (e.g. `grass_tile_*`) or 64×64 (sand, gravel, stone, grass).
  - Ragged patches (meadows, pits, rim pieces) are decals: draw them over a base tile at any position.
- **Water.** `cat.animations.water.frames` lists 21 frames of 320×128 that tile horizontally. To animate, pick frame `Math.floor(t * fps / 1000) % 21`.
- **Shadows.** When `shadow` is `true`, a semi-transparent black shadow (alpha 92) is already part of the sprite. Don't draw another one.
- **Scaling.** Scale by whole numbers only (1×, 2×, 3×). In CSS, set `image-rendering: pixelated` on the canvas.
- **Collision.** The catalogue has no hitboxes. A practical default is a small rectangle around the anchor, roughly the trunk or base width and 8–16 px tall. `rock`, `tree` and big `bush`/`prop` sprites usually block; `plant` and `terrain` usually don't.
- **Picking sprites.** Filter by class and name, e.g. `cat.sprites.filter(s => s.class === 'tree' && s.name.startsWith('palm'))`. Browse `lightbox.html` to see each one.

## Keeping the game in sync

Treat this folder as the source of truth and the game's copy as a build artifact.

1. Change assets only here, using `tools/`. Never edit the copied PNGs or the catalogue by hand.
2. After regenerating, copy `atlas/`, `sprites/` and the catalogue files again, all together. The atlas coordinates and the catalogue must come from the same run.
3. Ids are `<sheet>-<class>-<NNN>`, numbered in reading order. If a sprite is split, merged or dropped, later numbers in that sheet and class can shift. If your maps store sprite ids, re-check them after an asset update, or store `sheet` + `name`, which is stable unless a sprite is renamed.

## Reviewing and regenerating

1. Open `lightbox.html` and mark each sprite OK, Fix (with a note) or Drop.
2. Click **Export QA** to download `tiles-qa.json`.
3. Hand that file to the agent, or apply the fixes yourself in `tools/build.py` (masks per sheet) and `tools/labels.py` (class, name and description in reading order).
4. Regenerate:

```sh
pip install pillow numpy scipy
python tools/build.py && python tools/contact.py && python tools/export.py
```

`OBJECTS.md` §6 explains how the masks work.

## Derived from

* https://opengameart.org/content/zrpg-beach
* https://opengameart.org/content/the-battle-for-wesnoth-water-animation
* https://opengameart.org/content/zrpg-tiles

