# lakes.md — lake recipes

Lakes are large water bodies, about 300–500 px across at 1×, usually wider than one screen. Read [WATER-SPEC.md](WATER-SPEC.md) first. Scene data is in [scenes.js](scenes.js) and the visual check is [lakes.html](lakes.html).

## Lake design rules

| Parameter | Range | Why |
|---|---|---|
| `rx` | 180–260 px | Lakes should fill most of a screen. |
| `ry / rx` | 0.55–0.65 | Flatter than ponds. Large bodies look even more compressed in 3/4 view. |
| `wobble` | 0.14–0.24 | Produces bays and headlands. Above 0.28 the outline can pinch off into separate lakes. |
| `harmonics` | 5–7 | High harmonics give coves along the long shore. |
| `flow` | about `[3, 1]` px/s | A slow drift stops the open water from looking frozen. Keep it under 5 px/s. |
| Islands | 0–3; `rx` 15–70 | Keep 30+ px of water between an island and the main shore, or the two shore bands merge into a land bridge. |

Composition:
- Open water should be **visible**. Decor only runs around the edge, so a lake's centre is plain animated texture with shallow steps near the shore. That is intended.
- Rocky lakes get 1–2 large outcrops (`rocks2-rock-037/038`), which only appear in the `lakes` group. They anchor the composition.
- If the lake runs past the canvas, still keep its body in data beyond the edge. Distances near the canvas border then stay correct (padding is 48 px; for larger overlaps render the whole map mask).

---

<a id="lake-bays"></a>
## lake-bays — Lake with bays and headlands (default: rocky)

```js
{ id: 'lake-bays', width: 640, height: 416, seed: 5, shore: 'rocky', flow: [3, 1],
  bodies: [{ kind: 'blob', x: 320, y: 208, rx: 228, ry: 136, wobble: 0.22, harmonics: 7 }] }
```

- Bays come from the harmonics alone. Change `seed` to get a different coastline at the same size.
- Shoreline is about 1500 px, which gives about 155 decor items (rocky): roughly 30 waterline boulders, 1–2 outcrops, about 5 rocks in open water, plus pebbles, gravel splats and rubble strips.
- Grass variant: reed beds gather in the bays because their band (`S −5…1`) is long there. This is a natural result; do not force it.
- Sand variant: the shore width (10–24 px) varies along the coast, so some bays get wide beaches.

<a id="lake-island"></a>
## lake-island — Lake with islands (default: sand)

```js
bodies: [
  { kind: 'blob',   x: 320, y: 210, rx: 250, ry: 155, wobble: 0.14, harmonics: 5 },
  { kind: 'island', x: 370, y: 186, rx: 64,  ry: 40,  wobble: 0.22, harmonics: 5 },
  { kind: 'island', x: 210, y: 262, rx: 22,  ry: 15,  wobble: 0.15 },
]
```

- `island` must come **after** the water body it cuts.
- An island has the same full treatment as the main shore: shore band, bank face on its **south** side (the island's south edge is where land sits above water on screen), rim and foam on its north side, and decor.
- Give islands more `wobble` than the lake (0.15–0.25). Round islands look placed.
- A small island (`rx` about 20) is almost all shore band. That is fine for sand ("sand bar") and rocky ("skerry"). For grass, use `rx ≥ 30` so some lush rim shows.

<a id="lake-river"></a>
## lake-river — Lake fed by a river (default: grass)

```js
flow: [-4, 4],
bodies: [
  { kind: 'blob',  x: 310, y: 222, rx: 205, ry: 122, wobble: 0.16, harmonics: 5 },
  { kind: 'river', path: [[680,-30],[610,40],[540,80],[470,120]], width: [28, 34] },   // inlet
  { kind: 'river', path: [[150,300],[100,350],[60,390],[-20,450]], width: [24, 20] },   // outlet
]
```

- Each river path starts off-canvas, beyond the 48 px padding, and **ends inside** the lake (inlet), or starts inside and ends off-canvas (outlet).
- Widen the inlet towards the lake (`width: [28, 34]`): rivers spread as they enter still water.
- The outlet is narrower than the inlet.
- Set `flow` to the inlet→outlet direction at 4–6 px/s. The whole surface then reads as one moving system.
- Bend bias (§3.4 of the spec) applies only within `halfWidth + 60` px of a river centreline. The rest of the lake shore keeps its normal width.

## Common lake mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Lake cut off by the canvas edge on all sides | `rx + rx·Σa_k` exceeds the canvas | Keep `rx ≤ 0.36·W`, `ry ≤ 0.33·H`, or treat the canvas as a window into a bigger map. |
| Lake splits into pieces | `wobble` ≥ 0.28 with many harmonics | Lower `wobble`, or try another `seed`. |
| Island fused to the shore | Gap < 30 px | Move the island inward or shrink it. |
| Monotonous coastline | Too few harmonics on a big blob | `harmonics: 6–7`. |
| Surface looks frozen | `flow` is `[0, 0]` on a large body | `[3, 1]`. |
