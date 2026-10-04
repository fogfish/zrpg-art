"""Export masked sprites, packed atlases, catalog.json/catalog.js and OBJECTS.md into the tiles folder.

Regenerate everything:  pip install pillow numpy scipy && python build.py && python export.py
(build.py = segmentation + manual masks per sheet; labels.py = class/name/description per sprite in reading order;
 python contact.py renders .cache/cs_<sheet>.png to check that order after changing masks.)"""
import json, os, shutil, datetime
import numpy as np
from PIL import Image
import build, contact, labels, seg

T = seg.T
CLASSES = [
    ('tree',    'Standing trees and palms (incl. dead trees, palm trunk/crown segments). Usually with cast shadow.'),
    ('bush',    'Shrubs, cacti, ferns, leafy vines and overhangs: mid-size ground vegetation that blocks or decorates.'),
    ('plant',   'Small vegetation: flowers, sprouts, tufts, reeds, mushrooms, grass-blade scatter decals.'),
    ('rock',    'Rocks: mesas, cliffs, pillars, boulders, crystal/ore nodes, pebbles.'),
    ('terrain', 'Ground art drawn under everything: grass/sand/gravel tiles, patches, autotile masks, pits, decals.'),
    ('prop',    'Objects: logs, signposts, planters, tent, lantern, hive, bones, skulls, shells, starfish, coral.'),
    ('water',   'Water animation frames.'),
]
SHEETS = {'trees': 'ZRPGtrees.png', 'rocks2': 'ZRPGRocks2.png', 'beach': 'ZRPGBeach.png',
          'jungle': 'ZRPGJunglePlants.png', 'water': 'ZRPGWater.png'}
GROUND = {'terrain', 'water'}

def anchor(img, cls):
    """Foot point in sprite pixels: bottom-centre of the non-shadow body. Ground classes anchor top-left."""
    if cls in GROUND: return 0, 0
    a = np.array(img); al = a[..., 3]
    shadow = (al > 8) & (al < 255) & (a[..., :3].astype(int).sum(-1) == 0)
    body = (al > 8) & ~shadow
    ys, xs = np.nonzero(body)
    if not len(ys): return img.width // 2, img.height
    bottom = ys.max(); band = ys >= bottom - 3
    return int(round(xs[band].mean())), int(bottom + 1)

def has_shadow(img):
    a = np.array(img); al = a[..., 3]
    return bool(((al > 8) & (al < 255) & (a[..., :3].astype(int).sum(-1) == 0)).sum() > 20)

def collect():
    out = []
    for key in ('trees', 'rocks2', 'beach', 'jungle'):
        sp = contact.sprites(key); lab = labels.LABELS[key]
        assert len(sp) == len(lab), key
        for s, (cls, name, desc) in zip(sp, lab):
            out.append(dict(sheet=key, cls=cls, name=name, desc=desc, img=s['img'],
                            src=dict(x=s['x'], y=s['y'], w=s['w'], h=s['h'])))
    water = Image.open(T + SHEETS['water']).convert('RGBA')
    for i in range(21):   # measured: 21 frames 320x128, pitch 160 (32px teal divider between frames)
        out.append(dict(sheet='water', cls='water', name='water_frame_%02d' % (i + 1),
                        desc='Animated deep-water texture, frame %d of 21 (tileable horizontally)' % (i + 1),
                        img=water.crop((0, i * 160, 320, i * 160 + 128)), src=dict(x=0, y=i * 160, w=320, h=128)))
    counters = {}
    for o in out:
        k = (o['sheet'], o['cls']); counters[k] = counters.get(k, 0) + 1
        o['id'] = '%s-%s-%03d' % (o['sheet'], o['cls'], counters[k])
    return out

def pack(objs, W=2048, H=2048, pad=2):
    order = sorted(range(len(objs)), key=lambda i: (-objs[i]['img'].height, -objs[i]['img'].width))
    atlases, cur, x, y, row = [], [], pad, pad, 0
    for i in order:
        w, h = objs[i]['img'].size
        if x + w + pad > W: x, y, row = pad, y + row + pad, 0
        if y + h + pad > H:
            atlases.append(cur); cur, x, y, row = [], pad, pad, 0
        cur.append((i, x, y)); objs[i]['atlas'] = dict(index=len(atlases), x=x, y=y, w=w, h=h)
        x += w + pad; row = max(row, h)
    atlases.append(cur)
    files = []
    for k, items in enumerate(atlases):
        hh = max(objs[i]['atlas']['y'] + objs[i]['img'].height for i, _, _ in items) + pad
        im = Image.new('RGBA', (W, hh), (0, 0, 0, 0))
        for i, ax, ay in items: im.paste(objs[i]['img'], (ax, ay))
        fn = 'atlas/atlas-%d.png' % k; im.save(T + fn, optimize=True)
        files.append(dict(file=fn, w=W, h=hh))
    return files

def main():
    objs = collect()
    for d in ('sprites', 'atlas'):
        shutil.rmtree(T + d, ignore_errors=True)
    os.makedirs(T + 'atlas')
    for o in objs:
        os.makedirs(T + 'sprites/' + o['sheet'], exist_ok=True)
        o['file'] = 'sprites/%s/%s.png' % (o['sheet'], o['id'])
        o['img'].save(T + o['file'], optimize=True)
        o['anchor'] = anchor(o['img'], o['cls']); o['shadow'] = has_shadow(o['img'])
    atlases = pack(objs)
    sizes = {k: Image.open(T + f).size for k, f in SHEETS.items()}
    cat = dict(
        version=2, generated=datetime.date.today().isoformat(),
        notes='Pixel-exact sprites segmented from the ZRPG sheets. Each sprite PNG is masked: only its own pixels, '
              'transparent elsewhere. src = bounding box in the source sheet; atlas = rectangle in atlas[index]. '
              'anchor = foot point in sprite pixels (place sprite so anchor sits on the map position; y-sort by it). '
              'terrain/water anchor at top-left.',
        classes=[dict(name=c, description=d) for c, d in CLASSES],
        sheets={k: dict(file=f, w=sizes[k][0], h=sizes[k][1]) for k, f in SHEETS.items()},
        atlases=atlases,
        animations=dict(water=dict(frames=[o['id'] for o in objs if o['cls'] == 'water'], fps=6, loop=True)),
        sprites=[dict(id=o['id'], name=o['name'], **{'class': o['cls']}, sheet=o['sheet'], description=o['desc'],
                      file=o['file'], w=o['img'].width, h=o['img'].height, src=o['src'], atlas=o['atlas'],
                      anchor=dict(x=o['anchor'][0], y=o['anchor'][1]), shadow=o['shadow']) for o in objs])
    json.dump(cat, open(T + 'catalog.json', 'w'), indent=1)
    open(T + 'catalog.js', 'w').write('// Generated. Same data as catalog.json, usable from file:// via <script src="catalog.js">.\n'
                                      'window.TILE_CATALOG = ' + json.dumps(cat, separators=(',', ':')) + ';\n')
    write_md(cat)
    print('sprites', len(objs), 'atlases', [(a['file'], a['w'], a['h']) for a in atlases])

def write_md(cat):
    L = []; A = L.append
    A('# OBJECTS.md — Sprite Catalogue')
    A('')
    A('Every game object cut from the ZRPG sheets in this folder, as ready-to-use browser sprites. '
      'Machine-readable copy: `catalog.json` (and `catalog.js` for `file://` pages). Human QA: `lightbox.html`.')
    A('')
    A('## 1. How to use (for agents)')
    A('')
    A('- **Use the exported sprites, not the source sheets.** Source bounding boxes overlap (shadows, tight packing), '
      'so cropping a sheet by box pulls in neighbours. Each file in `sprites/<sheet>/<id>.png` is masked: only that object\'s pixels.')
    A('- **Two ways to draw:** load `sprites/<sheet>/<id>.png` as an `Image`, or load `atlas/atlas-N.png` once and '
      '`ctx.drawImage(atlas, a.x, a.y, a.w, a.h, dx, dy, a.w, a.h)` with `a = sprite.atlas`. Atlas rects never overlap (2 px padding).')
    A('- **Anchor:** `anchor` (sprite px) is the foot point (bottom-centre of the body, shadow excluded). Draw at '
      '`dx = worldX - anchor.x`, `dy = worldY - anchor.y` and depth-sort by `worldY`. `terrain` and `water` anchor at `0,0` (top-left) and are drawn first.')
    A('- **Pixel art:** set `ctx.imageSmoothingEnabled = false` and CSS `image-rendering: pixelated`; scale by integers.')
    A('- **Shadows** are baked into the sprite (`shadow: true`) as black at alpha 92. Do not add another shadow.')
    A('- **Water** is an animation: `catalog.animations.water.frames` (21 frames, 320×128, fps 6), tile horizontally.')
    A('- **Ids** are `<sheet>-<class>-<NNN>`; `name` is a readable slug unique within a sheet. Refer to sprites by `id`.')
    A('- **Classes** are fixed to the 7 in section 2. Do not invent new ones.')
    A('')
    A('```js')
    A('// <script src="catalog.js"></script>')
    A('const cat = window.TILE_CATALOG, byId = Object.fromEntries(cat.sprites.map(s => [s.id, s]));')
    A('const atlas = cat.atlases.map(a => Object.assign(new Image(), { src: a.file }));')
    A('function draw(ctx, id, worldX, worldY) {')
    A('  const s = byId[id], a = s.atlas;')
    A('  ctx.drawImage(atlas[a.index], a.x, a.y, a.w, a.h, worldX - s.anchor.x, worldY - s.anchor.y, a.w, a.h);')
    A('}')
    A('```')
    A('')
    A('## 2. Classes')
    A('')
    A('| Class | Meaning | Count |')
    A('| --- | --- | ---: |')
    for c in cat['classes']:
        A('| `%s` | %s | %d |' % (c['name'], c['description'], sum(1 for s in cat['sprites'] if s['class'] == c['name'])))
    A('')
    A('## 3. Sources and outputs')
    A('')
    A('| Sheet | Source file | Size | Sprites |')
    A('| --- | --- | --- | ---: |')
    for k, s in cat['sheets'].items():
        A('| `%s` | `%s` | %d × %d | %d |' % (k, s['file'], s['w'], s['h'], sum(1 for x in cat['sprites'] if x['sheet'] == k)))
    A('')
    A('Atlases: ' + ', '.join('`%s` (%d × %d)' % (a['file'], a['w'], a['h']) for a in cat['atlases']) + '.')
    A('')
    A('## 4. Sprites')
    A('')
    A('Columns: `src` = box in the source sheet (x, y, w, h); `anchor` = foot point in sprite px; `S` = shadow baked in.')
    A('')
    for k in cat['sheets']:
        A('### %s — `%s`' % (k, cat['sheets'][k]['file']))
        A('')
        A('| ID | Name | Class | File | src x,y,w,h | anchor | S | Description |')
        A('| --- | --- | --- | --- | --- | --- | --- | --- |')
        for s in cat['sprites']:
            if s['sheet'] != k: continue
            r = s['src']
            A('| `%s` | `%s` | `%s` | `%s` | %d,%d,%d,%d | %d,%d | %s | %s |' % (
                s['id'], s['name'], s['class'], s['file'], r['x'], r['y'], r['w'], r['h'],
                s['anchor']['x'], s['anchor']['y'], 'y' if s['shadow'] else '', s['description']))
        A('')
    A('## 5. How the boxes were made')
    A('')
    A('- Boxes were **not** taken from the original `ZRPG*.md` specs (QA in `tiles-qa.json` rejected 120 of them). '
      'Every sprite is a pixel-connected component of the sheet alpha (8-connectivity).')
    A('- Cast shadows (pure black, alpha 92) are attached to the object they touch, so a tree and its shadow are one sprite and a neighbour is never included.')
    A('- Where two objects touch in the art (pedestal/leaves, bowl/pot, bone arch/grass/sand tiles, two desert arches, '
      'pillar/ledge, tile strips, two jungle plants, frond/shoot) they were separated with hand-placed masks.')
    A('- Specks under 6×6 px were absorbed into the nearest sprite or dropped. Scatter decals (loose grass blades, rubble) are grouped into one sprite per cluster.')
    A('- Removed: solid dark/black placeholder squares (1 in trees, 4 in beach) and the water divider bands.')
    A('')
    A('## 6. Regenerating')
    A('')
    A('Do not edit sprites, atlas or catalog by hand. Change `tools/build.py` (masks: cuts, groups, clips per sheet) or '
      '`tools/labels.py` (class, name, description in reading order), then run:')
    A('')
    A('```sh')
    A('pip install pillow numpy scipy')
    A('python tools/build.py && python tools/contact.py && python tools/export.py')
    A('```')
    A('')
    A('`tools/contact.py` writes `tools/.cache/cs_<sheet>.png`, a numbered contact sheet. Its order must match `labels.py`; '
      'if a mask change adds or removes a sprite, update the labels to match. Ids are reassigned on regeneration.')
    A('')
    open(T + 'OBJECTS.md', 'w').write('\n'.join(L))

if __name__ == '__main__':
    main()
