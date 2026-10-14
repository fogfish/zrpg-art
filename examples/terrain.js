// terrain.js — reference renderer for the 9-slice tilesets in the ZRPG catalogue
// (../catalog.js + ../atlas/atlas-0.png). No dependencies.
//
// A tileset (catalog.tilesets[]) is a composite cut on a 32 px grid:
//
//   tl | t t t … | tr      corners are drawn once,
//   l  | c c c … | r       edges repeat along their side,
//   bl | b b b … | br      fill (c) repeats inside. hole = true: no fill, the ground shows through.
//
// cols / rows give the band sizes in px: [left, centre, right] / [top, middle, bottom]. Side bands can be
// wider than one cell (mesa rims are 64 px, the cliff face 128 px). Centre bands repeat in 32 px steps,
// so a tileset drawn with nx × ny centre cells is cols[0] + nx·32 + cols[2] wide.
// Pieces with several variants (t1, t2, …) are cycled, which reproduces the original art at its own size.
(function (global) {
  'use strict';
  const CELL = 32;

  function loadImage(src) {
    return new Promise((ok, err) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => err(new Error('cannot load ' + src));
      img.src = src;
    });
  }

  class Terrain {
    constructor(cat, atlases) {
      this.cat = cat; this.atlases = atlases;
      this.byId = new Map(cat.sprites.map(s => [s.id, s]));
      this.sets = new Map(cat.tilesets.map(t => [t.name, t]));
    }
    tileset(name) {
      const t = this.sets.get(name);
      if (!t) throw new Error('unknown tileset ' + name);
      return t;
    }
    // centre cells of the original art
    natural(name) {
      const t = this.tileset(name);
      return { nx: t.cols[1] / CELL, ny: t.rows[1] / CELL };
    }
    // px size of a tileset drawn with nx × ny centre cells
    size(name, nx, ny) {
      const t = this.tileset(name);
      if (!t.cols[1]) nx = 0;
      if (!t.rows[1]) ny = 0;
      return { w: t.cols[0] + nx * CELL + t.cols[2], h: t.rows[0] + ny * CELL + t.rows[2], nx, ny };
    }
    blit(ctx, id, x, y) {
      const s = this.byId.get(id), a = s.atlas;
      ctx.drawImage(this.atlases[a.index], a.x, a.y, a.w, a.h, Math.round(x), Math.round(y), a.w, a.h);
    }
    // Draw tileset `name` with its top-left at (x, y). Returns the drawn rect.
    draw(ctx, name, x, y, nx, ny) {
      const t = this.tileset(name), p = t.pieces, z = this.size(name, nx, ny);
      const L = t.cols[0], T = t.rows[0], X2 = x + L + z.nx * CELL, Y2 = y + T + z.ny * CELL;
      const put = (role, i, px, py) => { const v = p[role]; if (v && v.length) this.blit(ctx, v[i % v.length], px, py); };
      for (let j = 0; j < z.ny; j++)
        for (let i = 0; i < z.nx; i++) put('c', i + j, x + L + i * CELL, y + T + j * CELL);
      for (let i = 0; i < z.nx; i++) { put('t', i, x + L + i * CELL, y); put('b', i, x + L + i * CELL, Y2); }
      for (let j = 0; j < z.ny; j++) { put('l', j, x, y + T + j * CELL); put('r', j, X2, y + T + j * CELL); }
      put('tl', 0, x, y); put('tr', 0, X2, y); put('bl', 0, x, Y2); put('br', 0, X2, Y2);
      return { x, y, w: z.w, h: z.h };
    }
    // Repeat a ground sprite (by sheet + name) over a rect, e.g. a grass base under everything.
    fill(ctx, sheet, name, x, y, w, h) {
      const s = this.cat.sprites.find(s => s.sheet === sheet && s.name === name);
      if (!s) throw new Error('unknown sprite ' + sheet + '/' + name);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      for (let yy = y; yy < y + h; yy += s.h)
        for (let xx = x; xx < x + w; xx += s.w) this.blit(ctx, s.id, xx, yy);
      ctx.restore();
    }
  }

  // base: path prefix of the folder that holds catalog.js / atlas/
  async function load(base) {
    const cat = global.TILE_CATALOG;
    if (!cat) throw new Error('catalog.js is not loaded (window.TILE_CATALOG is missing)');
    if (!cat.tilesets) throw new Error('catalog.js has no tilesets: regenerate it with tools/export.py');
    const atlases = await Promise.all(cat.atlases.map(a => loadImage(base + a.file)));
    return new Terrain(cat, atlases);
  }

  global.ZRPGTerrain = { load, CELL };
})(window);
