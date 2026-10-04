import numpy as np, sys
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import build, seg

def sprites(key):
    """Masked sprites of a sheet in reading order: list of dict(x,y,w,h,img)."""
    a = seg.load(build.CONF[key]['file'])
    lab = np.load(seg.S + key + '.final.npy')
    out = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None: continue
        m = lab[sl] == i
        px = a[sl].copy(); px[~m] = 0
        out.append(dict(x=sl[1].start, y=sl[0].start, w=sl[1].stop - sl[1].start, h=sl[0].stop - sl[0].start,
                        area=int(m.sum()), img=Image.fromarray(px, 'RGBA')))
    out.sort(key=lambda s: (s['y'] // 40, s['x']))
    return out

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
        d.text((cx + 2, cy), '%d  %dx%d' % (k + 1, s['w'], s['h']), fill=(180, 0, 0))
    im.save(seg.S + 'cs_' + key + '.png')
    return len(sp)

if __name__ == '__main__':
    # writes .cache/cs_<sheet>.png: numbered contact sheet, the order labels.py must follow
    for k in sys.argv[1:] or build.CONF:
        print(k, sheet(k))
