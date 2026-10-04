import numpy as np, json, sys
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

import os
T = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'   # tiles folder
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache') + '/'   # intermediates
os.makedirs(S, exist_ok=True)
EIGHT = np.ones((3, 3), bool)

def load(f):
    return np.array(Image.open(T + f).convert('RGBA'))

def segment(a, gap=1, min_area=6):
    """Return label image: body components (grouped by `gap` px dilation), shadows attached to touching body."""
    rgb, al = a[..., :3].astype(int), a[..., 3]
    shadow = (al > 8) & (al < 255) & (rgb.sum(-1) == 0)
    body = (al > 8) & ~shadow
    grouped = ndi.binary_dilation(body, EIGHT, iterations=gap) if gap else body
    glab, n = ndi.label(grouped, EIGHT)
    lab = np.where(body, glab, 0)
    # shadows: attach each shadow component to the body label it touches most
    slab, sn = ndi.label(shadow, EIGHT)
    orphans = 0
    for i, sl in enumerate(ndi.find_objects(slab), 1):
        y0, y1 = max(sl[0].start - 2, 0), sl[0].stop + 2
        x0, x1 = max(sl[1].start - 2, 0), sl[1].stop + 2
        m = slab[y0:y1, x0:x1] == i
        ring = ndi.binary_dilation(m, EIGHT, iterations=2) & ~m
        touch = lab[y0:y1, x0:x1][ring]
        touch = touch[touch > 0]
        if touch.size:
            owner = np.bincount(touch).argmax()
        else:
            n += 1; owner = n; orphans += 1
        sub = lab[y0:y1, x0:x1]
        sub[m] = owner
    # drop specks
    out = np.zeros_like(lab)
    k = 0
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None: continue
        if (lab[sl] == i).sum() < min_area: continue
        k += 1
        out[sl][lab[sl] == i] = k
    return out, shadow

def absorb(lab, small=150, dist=14):
    """Merge components smaller than `small` px into the nearest larger component within `dist` px."""
    sizes = np.bincount(lab.ravel())
    big = np.isin(lab, np.nonzero(sizes >= small)[0]) & (lab > 0)
    d, (iy, ix) = ndi.distance_transform_edt(~big, return_indices=True)
    out = lab.copy()
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None or sizes[i] >= small: continue
        m = lab[sl] == i
        dd = d[sl][m]
        if dd.min() <= dist:
            k = np.argmin(dd)
            yy, xx = np.nonzero(m)
            ty, tx = iy[sl][yy[k], xx[k]], ix[sl][yy[k], xx[k]]
            out[sl][m] = lab[ty, tx]
    # relabel compactly
    u = np.unique(out); u = u[u > 0]
    remap = np.zeros(out.max() + 1, out.dtype); remap[u] = np.arange(1, len(u) + 1)
    return remap[out]

def boxes(lab):
    res = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None: continue
        res.append(dict(n=i, x=sl[1].start, y=sl[0].start, w=sl[1].stop - sl[1].start, h=sl[0].stop - sl[0].start,
                        area=int((lab[sl] == i).sum())))
    return res

def overlay(f, lab, out, scale=1, region=None):
    im = Image.open(T + f).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
    if region:
        x0, y0, x1, y1 = region; bg = bg.crop(region)
    else:
        x0 = y0 = 0
    bg = bg.resize((bg.width * scale, bg.height * scale), Image.NEAREST)
    d = ImageDraw.Draw(bg)
    rng = np.random.RandomState(3)
    for b in boxes(lab):
        c = tuple(int(v) for v in rng.randint(0, 200, 3)) + (255,)
        X, Y = (b['x'] - x0) * scale, (b['y'] - y0) * scale
        if X + b['w'] * scale < 0 or Y + b['h'] * scale < 0 or X > bg.width or Y > bg.height: continue
        d.rectangle([X, Y, X + b['w'] * scale - 1, Y + b['h'] * scale - 1], outline=c, width=1)
        d.rectangle([X, Y, X + 6 * len(str(b['n'])) + 3, Y + 10], fill=c)
        d.text((X + 2, Y), str(b['n']), fill=(255, 255, 255, 255))
    bg.convert('RGB').save(S + out)
