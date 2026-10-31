// Renders the NFT cover frames: the site's own pixel hamster + wheel (web/src/art.js) on the Gemini background.
// Usage: node make-frames.mjs <art.js path> <bg.rgba> <out dir>
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [artPath, bgPath, outDir] = process.argv.slice(2);
const W = 1024;
const H = 1024;

// Minimal canvas stand-in: art.js only uses fillStyle + 1x1 fillRect + toDataURL.
const sprites = [];
globalThis.document = {
  createElement() {
    const c = { width: 0, height: 0 };
    c.getContext = () => {
      c.px ??= new Uint8ClampedArray(c.width * c.height * 4);
      return {
        fillStyle: "#000",
        fillRect(x, y) {
          let h = this.fillStyle.replace("#", "");
          if (h.length === 3) h = [...h].map((ch) => ch + ch).join("");
          const i = (y * c.width + x) * 4;
          c.px.set([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255], i);
        },
      };
    };
    c.toDataURL = () => {
      sprites.push({ w: c.width, h: c.height, px: c.px ?? new Uint8ClampedArray(c.width * c.height * 4) });
      return `stub:${sprites.length - 1}`;
    };
    return c;
  },
};

const { hamsterArt } = await import(pathToFileURL(artPath).href);
const ids = [...hamsterArt(1).matchAll(/stub:(\d+)/g)].map((m) => sprites[Number(m[1])]);
const [stand, wheel, run] = ids;

const bg = new Uint8ClampedArray(readFileSync(bgPath));

// ---- Title: hand-made 5x7 pixel font on the cover's 8 px grid, with a dark outline and a drop shadow.
const GLYPHS = {
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};
const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));

function drawTitle(img, words, top, P, R) {
  // Ink mask in output pixels: each font pixel is P x P; then an R px outline and a drop shadow below it.
  const text = words.map((w) => w.text).join(" ");
  const tw = (text.length * 6 - 1) * P;
  const left = Math.round((W - tw) / 2);
  const ink = new Int16Array(W * H).fill(-1); // -1 empty, else index into colours
  const colours = [];
  let cx = left;
  for (const w of words) {
    for (const ch of w.text) {
      GLYPHS[ch].forEach((row, gy) =>
        [...row].forEach((c, gx) => {
          if (c !== "#") return;
          const k = colours.push(hex(gy >= 4 ? w.shade : w.color)) - 1;
          for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) ink[(top + gy * P + y) * W + cx + gx * P + x] = k;
        }),
      );
      cx += 6 * P;
    }
    cx += 6 * P;
  }
  const has = (x, y) => x >= 0 && y >= 0 && x < W && y < H && ink[y * W + x] >= 0;
  const outlined = new Uint8Array(W * H);
  for (let y = top - R; y < top + 7 * P + R; y++)
    for (let x = left - R; x < left + tw + R; x++) {
      let hit = false;
      for (let dy = -R; dy <= R && !hit; dy++) for (let dx = -R; dx <= R && !hit; dx++) hit = has(x + dx, y + dy);
      if (hit) outlined[y * W + x] = 1;
    }
  const shadow = hex("#141c33");
  const outline = hex("#2b1d16");
  const S = R + 2;
  for (let p = 0; p < outlined.length; p++) if (outlined[p]) blend(img, p % W, Math.floor(p / W) + S, ...shadow, 200);
  for (let p = 0; p < outlined.length; p++) if (outlined[p]) blend(img, p % W, Math.floor(p / W), ...outline, 255);
  for (let p = 0; p < ink.length; p++) if (ink[p] >= 0) blend(img, p % W, Math.floor(p / W), ...colours[ink[p]], 255);
}

drawTitle(
  bg,
  [
    { text: "SQUEEK", color: "#f6e7c1", shade: "#e2c993" },
    { text: "GARDEN", color: "#ffd85a", shade: "#f2b01e" },
  ],
  218,
  10,
  4,
);

// Placement on the 1024x1024 cover: u = 5 output px per sprite px, wheel centred on the empty clearing.
const U = 5;
const sceneLeft = 500 - 32 * U;
const sceneTop = 868 - 61 * U;

function blend(frame, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a === 0) return;
  const i = (y * W + x) * 4;
  const t = a / 255;
  frame[i] = frame[i] * (1 - t) + r * t;
  frame[i + 1] = frame[i + 1] * (1 - t) + g * t;
  frame[i + 2] = frame[i + 2] * (1 - t) + b * t;
}

/** Draws a sprite (or a sub-rect of it) scaled by U with nearest neighbour; `sample` can remap source coords. */
function draw(frame, s, dx, dy, { sx = 0, sw = s.w, sample, mask = null } = {}) {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < sw; x++) {
      const [px, py] = sample ? sample(x, y) : [sx + x, y];
      if (px < 0 || py < 0 || px >= s.w || py >= s.h) continue;
      const i = (py * s.w + px) * 4;
      const a = s.px[i + 3];
      if (!a) continue;
      for (let oy = 0; oy < U; oy++) {
        for (let ox = 0; ox < U; ox++) {
          const X = dx + x * U + ox;
          const Y = dy + y * U + oy;
          if (mask) {
            if (X >= 0 && Y >= 0 && X < W && Y < H) mask[Y * W + X] = 1;
          } else blend(frame, X, Y, s.px[i], s.px[i + 1], s.px[i + 2], a);
        }
      }
    }
  }
}

// One wheel turn = 16 frames (as the site's steps(16)); the legs swap every 2 frames.
const FRAMES = 16;
mkdirSync(outDir, { recursive: true });
for (let f = 0; f < FRAMES; f++) {
  const frame = new Uint8ClampedArray(bg);
  const angle = (f / FRAMES) * Math.PI * 2; // clockwise: the floor of the wheel moves back under his feet
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const rotate = (x, y) => {
    const cx = x + 0.5 - 32;
    const cy = y + 0.5 - 32;
    return [Math.floor(cx * cos - cy * sin + 32), Math.floor(cx * sin + cy * cos + 32)];
  };
  const legs = Math.floor(f / 2) % 2;
  const layers = [
    [stand, sceneLeft, sceneTop + 32 * U, {}],
    [wheel, sceneLeft, sceneTop, { sample: rotate }],
    [run, sceneLeft + 16 * U, sceneTop + Math.round(36.7 * U), { sx: legs * 32, sw: 32 }],
  ];
  // The site's drop shadow: the whole scene, 2 sprite px lower, at 18% black.
  const mask = new Uint8Array(W * H);
  for (const [s, x, y, o] of layers) draw(frame, s, x, y + 2 * U, { ...o, mask });
  for (let p = 0; p < mask.length; p++) if (mask[p]) blend(frame, p % W, Math.floor(p / W), 0, 0, 0, 46);
  for (const [s, x, y, o] of layers) draw(frame, s, x, y, o);
  writeFileSync(`${outDir}/f${String(f).padStart(2, "0")}.rgba`, frame);
}
console.log(`wrote ${FRAMES} frames; sprites ${ids.map((s) => `${s.w}x${s.h}`).join(", ")}`);
