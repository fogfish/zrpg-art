"""Pixel-exact sprite segmentation for the ZRPG sheets.
Pipeline per sheet: alpha components (8-conn) -> attach black/alpha-92 shadows -> manual cuts/groups/merges/drops
-> absorb specks -> tileset pieces -> masked sprite export."""
import numpy as np, json
from PIL import Image
from scipy import ndimage as ndi
import seg

T, S = seg.T, seg.S
EIGHT = np.ones((3, 3), bool)

CONF = {
  'trees': dict(file='ZRPGtrees.png', absorb=(40, 6), absorb2=(35, 24),
    cuts=[((370, 700), [(360, 736, 381, 756)])],                      # leaves stuck under the pedestal
    groups=[],
    tiles=[(512, 512, 544, 544), (512, 544, 544, 576), (512, 576, 544, 608), (544, 576, 576, 608),
           (512, 608, 544, 640), (544, 608, 576, 640),                 # grass strip -> 32px grass tiles
           (544, 512, 576, 544), (576, 512, 608, 544), (544, 544, 576, 576)],  # yellow flower decal squares
    merges=[], drops=[(1008, 144), (977, 578)]),
  'rocks2': dict(file='ZRPGRocks2.png', absorb=(60, 6), absorb2=(30, 24),
    cuts=[((700, 240), [(765, 296, 830, 360)]),                       # pillar touching the fogged ledge
          ((130, 790), [(96, 766, 161, 833)]),                        # stone tile with hole vs rubble patch
          ((285, 930), [(255, 766, 322, 832)]),                       # vertical strip -> 3 tiles
          ((285, 930), [(255, 832, 322, 896)]),
          ((130, 880), [(96, 926, 161, 962)]),
          ((970, 940), [(958, 992, 1024, 1024)])],                   # pebble tile vs rubble under it
    clips=[((200, 820), (158, 766, 256, 866)), ((262, 775), (256, 768, 320, 832)), ((262, 840), (256, 832, 320, 896)), ((262, 905), (256, 896, 320, 960))],
    groups=[(318, 220, 460, 372), (322, 400, 515, 512),               # cliff/boulder + grass pieces
            (170, 610, 310, 760), (330, 610, 470, 760),               # masks + inner squares
            (700, 680, 835, 790), (630, 795, 835, 1010),              # grass band, cliff-edge set
            (470, 600, 660, 712),                                     # loose light grass scatter
            (330, 765, 478, 872), (478, 765, 640, 872),               # loose yellow / green scatter
            (318, 862, 400, 962), (385, 862, 470, 962), (478, 862, 555, 962), (540, 862, 630, 962),
            (96, 830, 160, 864), (0, 860, 97, 964), (60, 955, 150, 996), (160, 895, 252, 992), (863, 930, 960, 1024)],
    tiles=[(224, 640, 256, 672), (192, 672, 224, 704), (224, 672, 256, 704), (256, 672, 288, 704),  # cross-mask inner tiles
           (626, 792, 705, 896), (767, 792, 840, 896)],                # cliff-rim vertical bars (diamond stays)
    merges=[[(20, 100), (95, 75)], [(230, 100), (357, 60), (368, 60)]], drops=[(20, 100), (128, 945)],
    tilesets=[dict(name='mesa_hollow_open', at=(224, 0), cols=(2, 2, 3), rows=(2, 1, 4)),   # rim | fill | rim+shadow
              dict(name='mesa_solid', at=(448, 0), cols=(2, 2, 3), rows=(2, 1, 4)),         # rows: rim | fill | cliff face
              dict(name='mesa_solid_fog', at=(672, 0), cols=(2, 2, 2), rows=(2, 1, 4)),
              dict(name='plateau_tall', at=(672, 352), cols=(2, 2, 2), rows=(2, 1, 4)),
              dict(name='grass_patch_octagon', at=(0, 608), cols=(2, 1, 2), rows=(2, 1, 2)),  # diagonal corners span 2 cells
              dict(name='grass_cross_frame', at=(160, 608), cols=(2, 1, 2), rows=(2, 1, 2)),
              dict(name='grass_cross_cutout', at=(320, 608), cols=(2, 1, 2), rows=(2, 1, 2)),
              dict(name='cobble_ground_grass_edge', at=(0, 768)),
              dict(name='cobble_overgrown', at=(160, 768)),
              dict(name='gravel_patch_round', at=(0, 864)),
              dict(name='pebble_patch_round', at=(864, 928))]),
  'beach': dict(file='ZRPGBeach.png', absorb=(30, 4),
    cuts=[((30, 570), [(64, 540, 130, 610)]),
          ((175, 15), [(192, 0, 226, 33)]),                           # fern vs dry shrub at top
          ((470, 440), [(446, 414, 546, 511)]),                       # sand ring tile (touches grass patch)
          ((400, 540), [(480, 576, 544, 674)]),                       # tall grass B
          ((400, 540), [(544, 576, 660, 712)]),                       # tall grass C
          ((400, 540), [(280, 576, 480, 703)]),                       # tall grass A
          ((400, 540), [(286, 703, 386, 770)]),                       # sand hole tile under tall grass A
          ((50, 960), [(383, 915, 485, 1024)]),
          ((50, 960), [(192, 890, 383, 1024)]),
          ((50, 960), [(96, 900, 192, 1024)]),                        # desert arch A: right dune
          ((250, 960), [(288, 900, 383, 1024)]),                      # desert arch B: right dune
          ((500, 920), [(476, 960, 548, 1024)])],                     # sand ripples: lower group
    clips=[((400, 540), (318, 512, 514, 577))],                       # grass patch: hand stray pixels to neighbours
    drops=[(1008, 16), (464, 368), (624, 464), (528, 720), (888, 676)],
    groups=[(192, 0, 226, 33), (0, 605, 97, 708), (95, 858, 165, 892), (478, 832, 548, 896), (672, 960, 735, 1024)],
    tiles=[(96, 992, 128, 1024), (288, 992, 320, 1024)],               # craters under the desert arches
    merges=[],
    tilesets=[dict(name='sand_ring_tile', at=(448, 416)),
              dict(name='sand_ring_small', at=(544, 416), cols=(1, 0, 1), rows=(1, 0, 1)),  # four quadrants only
              dict(name='gravel_patch', at=(0, 608)),
              dict(name='sand_pit_square', at=(96, 608)),
              dict(name='gravel_pit', at=(192, 608)),
              dict(name='sand_pit_dark_large', at=(0, 768)),
              dict(name='sand_pit_light_small', at=(96, 768)),
              dict(name='sand_pit_dark_b', at=(192, 768))]),
  'jungle': dict(file='ZRPGJunglePlants.png', absorb=(40, 4),
    cuts=[((150, 100), [(191, 55, 265, 135)]),                       # two plants touching by a leaf
          ((410, 180), [(378, 224, 421, 262)])],                      # green shoot touching frond above
    groups=[], merges=[], drops=[]),
}
# Pipeline order: cuts -> groups -> merges -> absorb -> tiles -> clips -> tilesets -> drops -> speck filter.
# tiles: every labelled pixel inside an exact rect becomes its own sprite (grid tiles, whatever component it was in).
# tilesets: a composite drawn on the CELL grid (mesa, patch, pit, ring) is a 9-slice. cols/rows = cells in the
#   left|centre|right and top|middle|bottom bands (default 1,1,1). Corner bands are one piece each; centre bands are
#   cut into single-cell pieces, so edges and fill repeat to any size. Every piece keeps its exact grid rect.
# drops: points on sprites removed from the catalogue (placeholders, QA 'drop').
CELL = 32
ROLES = (('tl', 't', 'tr'), ('l', 'c', 'r'), ('bl', 'b', 'br'))

def bands(origin, sizes):
    """(band, start, stop) pixel segments: side bands whole, centre band one segment per cell."""
    a, b, c = sizes; out = [(0, origin, origin + a * CELL)] if a else []
    out += [(1, origin + (a + i) * CELL, origin + (a + i + 1) * CELL) for i in range(b)]
    return out + ([(2, origin + (a + b) * CELL, origin + (a + b + c) * CELL)] if c else [])

def tileset_rect(ts):
    (x, y), cols, rows = ts['at'], ts.get('cols', (1, 1, 1)), ts.get('rows', (1, 1, 1))
    return x, y, x + sum(cols) * CELL, y + sum(rows) * CELL

def pieces(ts):
    """Pieces of a tileset in layout order: dict(role, row, col, rect) with row/col = position in the original layout."""
    (x, y), cols, rows = ts['at'], ts.get('cols', (1, 1, 1)), ts.get('rows', (1, 1, 1))
    return [dict(role=ROLES[by][bx], row=r, col=c, rect=(x0, y0, x1, y1))
            for r, (by, y0, y1) in enumerate(bands(y, rows)) for c, (bx, x0, x1) in enumerate(bands(x, cols))]

def at(lab, p, r=8):
    x, y = p
    if lab[y, x]: return lab[y, x]
    ys, xs = np.nonzero(lab[max(y-r, 0):y+r+1, max(x-r, 0):x+r+1])
    if not len(ys): raise ValueError('no component near %s' % (p,))
    k = np.argmin((ys - min(y, r))**2 + (xs - min(x, r))**2)
    return lab[max(y-r, 0) + ys[k], max(x-r, 0) + xs[k]]

def relabel(lab):
    u = np.unique(lab); u = u[u > 0]
    m = np.zeros(lab.max() + 1, lab.dtype); m[u] = np.arange(1, len(u) + 1)
    return m[lab]

def segment_sheet(key):
    c = CONF[key]
    a = seg.load(c['file'])
    lab, _ = seg.segment(a, gap=0, min_area=1)
    lab = lab.astype(np.int32)
    for p, rects in c['cuts']:
        src = at(lab, p); new = lab.max() + 1
        for x0, y0, x1, y1 in rects:
            sub = lab[y0:y1, x0:x1]; sub[sub == src] = new
    for x0, y0, x1, y1 in c['groups']:
        ids = [i for i, sl in enumerate(ndi.find_objects(lab), 1)
               if sl is not None and sl[1].start >= x0 and sl[1].stop <= x1 and sl[0].start >= y0 and sl[0].stop <= y1]
        for i in ids[1:]: lab[lab == i] = ids[0]
    for pts in c['merges']:
        ids = [at(lab, p) for p in pts]
        for i in ids[1:]: lab[lab == i] = ids[0]
    lab = seg.absorb(relabel(lab), *c['absorb'])
    if 'absorb2' in c: lab = seg.absorb(lab, *c['absorb2'])
    for x0, y0, x1, y1 in c.get('tiles', []):
        sub = lab[y0:y1, x0:x1]; sub[sub > 0] = lab.max() + 1
    clips = [(at(lab, p), r) for p, r in c.get('clips', [])]
    clipped = [i for i, _ in clips]
    for i, (x0, y0, x1, y1) in clips:
        # pixels of a clipped component outside its rect go to the nearest unclipped component (<= 30 px), else dropped
        keep = np.zeros_like(lab, bool); keep[y0:y1, x0:x1] = True
        stray = (lab == i) & ~keep
        if not stray.any(): continue
        others = (lab > 0) & ~np.isin(lab, clipped)
        d, (iy, ix) = ndi.distance_transform_edt(~others, return_indices=True)
        lab[stray] = np.where(d[stray] <= 30, lab[iy[stray], ix[stray]], 0)
    owner = {}                                                         # piece label -> (tileset index, piece index)
    for k, ts in enumerate(c.get('tilesets', [])):
        x0, y0, x1, y1 = tileset_rect(ts)
        u, n = np.unique(lab[y0:y1, x0:x1], return_counts=True); n[u == 0] = 0
        src = u[n.argmax()]                                            # the composite: largest component in the grid
        inside = np.zeros_like(lab, bool); inside[y0:y1, x0:x1] = True
        lab[(lab == src) & ~inside] = 0                                # stray outline pixels past the grid
        for j, p in enumerate(pieces(ts)):
            px0, py0, px1, py1 = p['rect']
            sub = lab[py0:py1, px0:px1]; owner[lab.max() + 1] = (k, j); sub[sub == src] = lab.max() + 1
    for p in c['drops']:
        lab[lab == at(lab, p)] = 0
    sizes = np.bincount(lab.ravel()); lab[np.isin(lab, np.nonzero(sizes < 6)[0])] = 0
    for i, sl in enumerate(ndi.find_objects(lab), 1):                 # specks under 6x6 px are not sprites
        if sl is not None and sl[0].stop - sl[0].start < 6 and sl[1].stop - sl[1].start < 6:
            lab[sl][lab[sl] == i] = 0
    u = np.unique(lab); u = u[u > 0]
    new = dict(zip(u.tolist(), range(1, len(u) + 1)))
    return a, relabel(lab), {new[i]: kj for i, kj in owner.items() if i in new}

if __name__ == '__main__':
    import sys
    for key in (sys.argv[1:] or CONF):
        a, lab, owner = segment_sheet(key)
        np.save(S + key + '.final.npy', lab)
        json.dump({str(i): kj for i, kj in owner.items()}, open(S + key + '.pieces.json', 'w'))
        seg.overlay(CONF[key]['file'], lab, key + '.final.png', scale=2 if key == 'jungle' else 1)
        print(key, lab.max())
