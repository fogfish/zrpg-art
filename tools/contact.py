import numpy as np, sys, json, os
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import build, seg

def crop(a, lab, i, x0, y0, x1, y1):
    px = a[y0:y1, x0:x1].copy(); px[lab[y0:y1, x0:x1] != i] = 0
    return Image.fromarray(px, 'RGBA')

def sprites(key):
    """Masked sprites of a sheet in reading order: list of dict(x,y,w,h,img).
    A tileset is one item with 'pieces' (role, row, col, x, y, w, h, img) cut on its exact grid rects."""
    a = seg.load(build.CONF[key]['file'])
    lab = np.load(seg.S + key + '.final.npy')
    sets = [(ts, build.pieces(ts)) for ts in build.CONF[key].get('tilesets', [])]
    f = seg.S + key + '.pieces.json'
    owner = {int(i): tuple(kj) for i, kj in json.load(open(f)).items()} if os.path.exists(f) else {}
    out, found = [], {}
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None: continue
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if i in owner:
            found[owner[i]] = (i, (x0, y0, x1, y1)); continue
        m = lab[sl] == i
        out.append(dict(x=x0, y=y0, w=x1 - x0, h=y1 - y0, area=int(m.sum()), img=crop(a, lab, i, x0, y0, x1, y1)))
    for k, (ts, ps) in enumerate(sets):
        items, boxes = [], []
        for j, p in enumerate(ps):
            if (k, j) not in found: continue                           # empty cell: a hole in the composite
            i, box = found[(k, j)]; boxes.append(box)
            x0, y0, x1, y1 = p['rect']
            items.append(dict(p, x=x0, y=y0, w=x1 - x0, h=y1 - y0, img=crop(a, lab, i, x0, y0, x1, y1)))
        x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
        x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
        out.append(dict(x=x0, y=y0, w=x1 - x0, h=y1 - y0, tileset=ts, pieces=items, img=assemble(ts, items)))
    out.sort(key=lambda s: (s['y'] // 40, s['x']))
    return out

def assemble(ts, items):
    """The composite as drawn in the sheet, rebuilt from its pieces."""
    x0, y0, x1, y1 = build.tileset_rect(ts)
    im = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
    for p in items: im.paste(p['img'], (p['x'] - x0, p['y'] - y0))
    return im

def sheet(key, cell=100, cols=12):
    sp = sprites(key)
    rows = (len(sp) + cols - 1) // cols
    im = Image.new('RGB', (cols * cell, rows * (cell + 12)), (235, 235, 235))
    d = ImageDraw.Draw(im)
    for k, s in enumerate(sp):
        cx, cy = (k % cols) * cell, (k // cols) * (cell + 12)
        t = s['img']; sc = min((cell - 6) / t.width, (cell - 6) / t.height, 3)
        t = t.resize((max(1, int(t.width * sc)), max(1, int(t.height * sc))), Image.NEAREST)
        bg = Image.new('RGBA', t.size, (255, 255, 255, 255)); bg.alpha_composite(t)
        im.paste(bg.convert('RGB'), (cx + (cell - t.width) // 2, cy + 12 + (cell - t.height) // 2))
        d.text((cx + 2, cy), '%d  %dx%d%s' % (k + 1, s['w'], s['h'], ' T%d' % len(s['pieces']) if 'pieces' in s else ''),
               fill=(180, 0, 0))
    im.save(seg.S + 'cs_' + key + '.png')
    return len(sp)

if __name__ == '__main__':
    # writes .cache/cs_<sheet>.png: numbered contact sheet, the order labels.py must follow (T<n> = tileset of n pieces)
    for k in sys.argv[1:] or build.CONF:
        print(k, sheet(k))
