# rivers.md — river recipes

Rivers and brooks are water swept along a centreline. Read [WATER-SPEC.md](WATER-SPEC.md) first, especially §3.2 (river rasterisation), §3.4 (bend bias) and §3.5 (bank face). Scene data is in [scenes.js](scenes.js) and the visual check is [rivers.html](rivers.html).

## River design rules

| Parameter | Range | Why |
|---|---|---|
| `width` | river 30–46 px; brook 12–18 px; stream into a pond 10–14 px | Narrower than about 10 px is hidden by the shore and decor. |
| `width[0]` → `width[1]` | grows 10–30 % downstream | Rivers widen as tributaries join. |
| `widthNoise` | 0.2 (river), 0.25–0.3 (brook) | Local width changes of ±20–30 %. A constant width looks like a canal. |
| Path points | every 60–120 px | Catmull-Rom smooths between them. Fewer points give long straight stretches. |
| Bend amplitude | ≥ 1.5 × width | Smaller bends hardly show and the river looks straight. |
| Bend spacing | 5–7 × width between alternating turns | Natural meander wavelength. |
| Path ends | 30–50 px **outside** the canvas (inside the 48 px padding) | The bank continues to the edge with no end cap. |
| `flowSpeed` | river 10–12 px/s; brook 16–20 px/s | The texture drifts from the first path point toward the last. |
| `density` | 1 (river), 0.5 (brook) | Boulders 24–40 px wide bury a 16 px brook. |

Natural river features, all automatic from the bend bias (`bias = clamp(1 + 1.1·k·side, 0.35, 2.2)`):
- **Point bar**: the inside of each bend gets a shore up to 2.2× wider. On sand this is a beach; on rocky it is a gravel bar.
- **Cut bank**: the outside of each bend gets a narrow shore (0.35×) and a taller bank face, up to 1.8× `face.h`.
- Do not apply bias to lakes or ponds. It is computed only within `halfWidth + 60` px of a river centreline.

---

<a id="river-meander"></a>
## river-meander — Meandering river (default: grass)

```js
{ id: 'river-meander', width: 640, height: 384, seed: 3, shore: 'grass', flowSpeed: 12,
  bodies: [{ kind: 'river', width: [36, 46],
    path: [[-40,120],[70,86],[170,150],[236,262],[340,296],[424,200],[500,108],[590,138],[690,232]] }] }
```

- Bends alternate (down, up, down) with an amplitude of about 100 px, which is at least 2× the width.
- Shoreline is about 1900 px, which gives about 175 decor items (grass).
- Grass: reed beds cluster on the slow inner bends, and earth faces show on the north banks.
- Sand: point bars are clearly visible as wide sand on the inside of each bend.
- Rocky: gravel bars on the inner bends; boulders and in-water rocks along the channel.

<a id="river-brook"></a>
## river-brook — Winding brook (default: rocky)

```js
{ id: 'river-brook', width: 640, height: 384, seed: 17, shore: 'rocky', flowSpeed: 18, density: 0.5,
  bodies: [{ kind: 'river', width: [14, 18], widthNoise: 0.3,
    path: [[-30,330],[70,300],[110,236],[60,170],[120,110],[230,128],[290,214],[380,250],
           [450,180],[430,100],[500,50],[600,40],[680,-20]] }] }
```

- Tight, looping bends: a brook can double back (`[110,236] → [60,170] → [120,110]`).
- `density: 0.5` halves every decor count. Without it, waterline boulders hide the water.
- The bank face is capped at `floor(RUN × 0.3)`. On a 16 px brook the face is at most about 4 px, so the channel stays readable.
- Outcrops (`rocks2-rock-076/038`) are excluded: that rule is limited to the `lakes` group.

<a id="river-confluence"></a>
## river-confluence — Confluence (default: sand)

```js
bodies: [
  { kind: 'river', width: [30, 42], path: [[-40,250],[120,228],[260,262],[380,222],[500,244],[690,196]] },  // main
  { kind: 'river', width: [16, 22], path: [[196,-40],[228,60],[296,140],[360,214]] },                       // tributary
]
```

- The tributary path **ends on the main river's centreline** (here `[360,214]` is close to `[380,222]`). Stopping short leaves a land gap; overshooting pushes a bump out of the far bank.
- Join at 30–60° to the main flow, pointing downstream. A 90° join looks engineered.
- The tributary is narrower (16–22 px) than the main river (30–42 px), and the main river widens below the join.
- The texture drift follows the **first** river body, so list the main river first.
- The land wedge between the two channels just upstream of the join becomes one merged shore band (a sand spit). This happens automatically because both are one mask.

## Rivers meeting other bodies

- **River into a lake or pond**: end the path inside the blob, at least 0.6 × `rx` from its centre. See `lake-river` in [lakes.md](lakes.md) and `pond-brook` in [ponds.md](ponds.md).
- **River with an island**: add an `island` body after the river; it splits the channel. Keep the island 1.5 × the river width long, and at most 0.4 × the width across.
- **Bridges and fords**: place them where `bias ≈ 1` (straight stretches) and the river is narrowest. Sample `S` along the crossing line and keep the water span at most 2 tiles.

## Common river mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Looks like a canal | Constant width, few path points | `widthNoise ≥ 0.2`, a point every 60–120 px, bend amplitude ≥ 1.5 × width. |
| River ends in a round cap on screen | Path ends inside the canvas | Extend both ends 30–50 px beyond the canvas. |
| Kinks at path points | Path points too far apart and at sharp angles | Add intermediate points; keep turns under about 70° per point. |
| Brook buried by rocks or banks | Full decor density on narrow water | `density: 0.5`; the `RUN` cap handles the bank face. |
| Water flows upstream | Path listed from mouth to source | List path points from source to mouth, or set `flow` explicitly. |
