// A tiny pixel-art canvas: shapes land on whole pixels, an ink outline is traced around them, and the result is cached
// as a PNG data URL that the page scales up with `image-rendering: pixelated`.

export const INK = "#2b1d16";

export class Pixels {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Array(w * h).fill(null);
  }

  set(x, y, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.d[y * this.w + x];
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Ellipse centred on (cx, cy); a centre on a pixel boundary (an integer) gives an even, symmetric shape. */
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }

  circle(cx, cy, r, c) {
    this.ellipse(cx, cy, r, r, c);
  }

  /** Bresenham line, optionally two pixels thick. */
  line(x0, y0, x1, y1, c, thick = 1) {
    x0 = Math.floor(x0);
    y0 = Math.floor(y0);
    x1 = Math.floor(x1);
    y1 = Math.floor(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (thick > 1) this.set(x0 + 1, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  clearEllipse(cx, cy, rx, ry) {
    this.ellipse(cx, cy, rx, ry, null);
  }

  /** Traces a one-pixel outline around everything drawn so far. */
  outline(c = INK) {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, c);
  }

  toDataURL() {
    const canvas = document.createElement("canvas");
    canvas.width = this.w;
    canvas.height = this.h;
    const g = canvas.getContext("2d");
    for (let i = 0; i < this.d.length; i++) {
      if (!this.d[i]) continue;
      g.fillStyle = this.d[i];
      g.fillRect(i % this.w, Math.floor(i / this.w), 1, 1);
    }
    return canvas.toDataURL("image/png");
  }
}

const cache = new Map();

/**
 * Draws a sprite once and returns its data URL. `draw` paints the body; `after` paints on top of the outline
 * (sparkles, highlights) so those stay free of ink.
 */
export function sprite(key, w, h, draw, { outline = true, after } = {}) {
  if (!cache.has(key)) {
    const p = new Pixels(w, h);
    draw(p);
    if (outline) p.outline();
    after?.(p);
    cache.set(key, p.toDataURL());
  }
  return cache.get(key);
}

export const img = (url, cls = "", w = 32, h = 32) => `<img class="px ${cls}" src="${url}" width="${w}" height="${h}" alt="" draggable="false" />`;
