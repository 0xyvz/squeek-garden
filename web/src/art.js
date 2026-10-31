// Pixel-art sprites, drawn in code on small grids (see pixel.js). Crops share a 32x32 grid with the soil line at y=27.
import { sprite, img } from "./pixel.js";

const C = {
  leafD: "#2e6b34",
  leaf: "#4f9d43",
  leafL: "#86c95f",
  leafLL: "#b5e08a",
  soilD: "#5a3a22",
  soil: "#7a4f2e",
  soilL: "#9a6a3e",
  soilLL: "#b5834f",
  yel: "#f2b01e",
  yelL: "#ffd85a",
  yelD: "#c98a0e",
  org: "#e3761a",
  orgL: "#f59a3c",
  orgD: "#b9560f",
  brown: "#6b3d1e",
  brownL: "#9a6232",
  white: "#fffdf4",
  pur: "#6a3fb5",
  purL: "#b9a0ec",
  purD: "#4a2a85",
  mel: "#cfe7a0",
  melD: "#9fc070",
  hay: "#d9c25a",
  hayD: "#a9933a",
  hayL: "#efe08a",
  fur: "#e0a05c",
  furL: "#f8e2c0",
  furD: "#b8732f",
  furH: "#eebc80",
  pink: "#f2a5a0",
  nose: "#e07a8a",
  eye: "#1d1410",
  glint: "#fff6c4",
  wood: "#c79a62",
  woodD: "#8f6338",
  woodL: "#e0b97f",
  grass: "#5e9e48",
  grassD: "#4f8c3d",
  grassL: "#79b85a",
  dry: "#9b8a5a",
  dryD: "#7a6a44",
};

const mound = (p) => {
  p.ellipse(16, 28.5, 9, 2.5, C.soilD);
  p.ellipse(16, 27.8, 7, 1.6, C.soil);
  p.rect(13, 27, 6, 1, C.soilL);
};

const stem = (p, top) => {
  p.rect(15, top, 2, 28 - top, C.leafD);
  p.rect(15, top, 1, 28 - top, C.leaf);
};

const leaf = (p, cx, cy, rx, ry, base = C.leaf, light = C.leafL) => {
  p.ellipse(cx, cy, rx, ry, base);
  p.ellipse(cx - 0.4, cy - 0.5, rx * 0.55, Math.max(0.6, ry * 0.45), light);
};

const sparkle = (p, x, y, big = true) => {
  p.set(x, y, C.glint);
  p.set(x - 1, y, C.glint);
  p.set(x + 1, y, C.glint);
  p.set(x, y - 1, C.glint);
  p.set(x, y + 1, C.glint);
  if (big) {
    p.set(x, y - 2, C.glint);
    p.set(x, y + 2, C.glint);
  }
};

// ------------------------------------------------------------------ growth stages

const stages = {
  seedling: (p) => {
    mound(p);
    p.rect(15, 24, 2, 4, C.leafD);
    leaf(p, 12.5, 23.5, 2.6, 1.3, C.leafL, C.leafLL);
    leaf(p, 19.5, 23.5, 2.6, 1.3, C.leafL, C.leafLL);
  },
  sprout: (p) => {
    mound(p);
    stem(p, 18);
    leaf(p, 11.5, 22, 3.6, 1.7);
    leaf(p, 20.5, 22, 3.6, 1.7);
    leaf(p, 12.5, 18.5, 2.8, 1.4, C.leafL, C.leafLL);
    leaf(p, 19.5, 18.5, 2.8, 1.4, C.leafL, C.leafLL);
  },
  young: (bud) => (p) => {
    mound(p);
    stem(p, 11);
    leaf(p, 10.5, 23, 4.4, 1.9);
    leaf(p, 21.5, 23, 4.4, 1.9);
    leaf(p, 11.5, 17.5, 3.8, 1.7, C.leafL, C.leafLL);
    leaf(p, 20.5, 17.5, 3.8, 1.7, C.leafL, C.leafLL);
    p.circle(16, 10, 3, bud);
    p.set(15, 8, C.glint);
  },
  wilted: (p) => {
    mound(p);
    p.line(16, 27, 16, 21, C.dryD, 2);
    p.line(16, 21, 21, 17, C.dryD, 2);
    p.ellipse(12, 24, 3, 1.3, C.dry);
    p.ellipse(20.5, 24.5, 3, 1.3, C.dry);
    p.circle(22, 17, 2.2, "#8f7d58");
  },
};

// ------------------------------------------------------------------ ripe crops

const RIPE = {
  "Timothy Hay": {
    draw(p) {
      mound(p);
      const blades = [
        [-7, 8, C.hayD],
        [-4, 5, C.hay],
        [0, 3, C.hay],
        [4, 6, C.hayD],
        [7, 9, C.hay],
        [-2, 11, "#c9b24a"],
        [2, 10, "#c9b24a"],
      ];
      for (const [dx, top, c] of blades) p.line(16 + dx * 0.3, 27, 16 + dx, top, c);
      for (const [dx, top] of blades.slice(0, 5)) p.ellipse(16 + dx + 0.5, top + 0.5, 1.2, 3, C.hayL);
    },
  },
  Sunflower: {
    draw(p) {
      mound(p);
      stem(p, 12);
      leaf(p, 9.5, 21, 4.6, 2);
      leaf(p, 22.5, 18, 4.6, 2);
      p.circle(16, 10, 8.2, C.yel);
      for (let i = 0; i < 12; i += 2) {
        const a = (i / 12) * Math.PI * 2;
        p.circle(16 + Math.cos(a) * 6.4, 10 + Math.sin(a) * 6.4, 1.7, C.yelL);
      }
      p.circle(16, 10, 4, C.brown);
      for (const [x, y] of [
        [14, 8],
        [17, 9],
        [15, 11],
        [18, 11],
        [16, 12],
      ])
        p.set(x, y, C.brownL);
    },
  },
  "Block Broccoli": {
    draw(p) {
      mound(p);
      p.rect(13, 19, 6, 9, "#9fcf74");
      p.rect(13, 19, 2, 9, "#b9e08f");
      p.line(16, 20, 11, 15, "#9fcf74", 2);
      p.line(16, 20, 21, 15, "#9fcf74", 2);
      const florets = [
        [10, 14, 4.5],
        [22, 14, 4.5],
        [16, 9.5, 5],
        [13, 17, 3.6],
        [19, 17, 3.6],
      ];
      for (const [x, y, r] of florets) p.circle(x, y, r, "#2f7a36");
      for (const [x, y, r] of florets) p.circle(x - 1, y - 1.2, r * 0.45, "#58a64a");
    },
    after(p) {
      p.rect(14, 7, 2, 2, C.yelL);
      p.rect(20, 12, 2, 2, C.yel);
      p.rect(9, 13, 2, 2, C.yelL);
    },
  },
  "Nap Chamomile": {
    draw(p) {
      mound(p);
      p.line(16, 27, 11, 12, C.leaf);
      p.line(16, 27, 22, 9, C.leaf);
      p.line(16, 27, 16, 17, C.leaf);
      p.ellipse(13, 22, 2.4, 1.1, C.leafL);
      p.ellipse(19.5, 21, 2.4, 1.1, C.leafL);
      for (const [x, y, r] of [
        [11, 11, 3.6],
        [22, 8, 3.8],
        [16, 16, 3],
      ]) {
        p.circle(x, y, r, C.white);
        p.circle(x, y, r * 0.42, C.yel);
      }
    },
    after(p) {
      for (const [x, y] of [
        [26, 2],
        [27, 2],
        [28, 2],
        [27, 3],
        [26, 4],
        [27, 4],
        [28, 4],
      ])
        p.set(x, y, "#8fb8e8");
    },
  },
  Pumpkin: {
    draw(p) {
      leaf(p, 24, 15, 3.8, 1.8);
      p.line(16, 16, 20, 13, C.leafD);
      p.rect(15, 13, 2, 4, "#6b4a22");
      p.ellipse(10, 22, 6.5, 5.8, C.org);
      p.ellipse(22, 22, 6.5, 5.8, C.org);
      p.ellipse(16, 21.5, 6.5, 6.8, C.orgL);
      p.line(12, 17, 12, 27, C.orgD);
      p.line(20, 17, 20, 27, C.orgD);
      p.ellipse(13.5, 18.5, 1.2, 2, "#ffc27a");
    },
  },
  "Moon Melon": {
    draw(p) {
      leaf(p, 24.5, 12, 3.8, 1.8);
      p.line(16, 12, 21, 10, C.leafD);
      p.circle(16, 20, 8.5, C.mel);
      p.line(9, 17, 23, 17, C.melD);
      p.line(8, 21, 24, 21, C.melD);
      p.line(9, 25, 23, 25, C.melD);
      p.line(12, 12, 12, 28, C.melD);
      p.line(20, 12, 20, 28, C.melD);
      p.circle(19, 16, 3.2, C.glint);
      p.circle(20.6, 15, 2.6, C.mel);
    },
    after(p) {
      sparkle(p, 4, 10);
      sparkle(p, 28, 25, false);
    },
  },
  "Golden Carrot": {
    draw(p) {
      mound(p);
      p.line(16, 14, 11, 4, C.leaf, 2);
      p.line(15, 14, 15, 2, C.leafL, 2);
      p.line(16, 14, 21, 4, C.leaf, 2);
      for (let y = 12; y <= 29; y++) {
        const half = Math.max(0.5, 4.6 - (y - 12) * 0.27);
        const x0 = Math.round(16 - half);
        const w = Math.max(1, Math.round(half * 2));
        p.rect(x0, y, w, 1, "#f5a524");
        p.rect(16, y, Math.ceil(w / 2), 1, "#ffd84a");
      }
      p.rect(14, 17, 2, 1, "#d9861a");
      p.rect(17, 21, 2, 1, "#d9861a");
      p.rect(15, 25, 2, 1, "#d9861a");
    },
    after(p) {
      sparkle(p, 25, 9);
      sparkle(p, 6, 15, false);
      sparkle(p, 24, 22, false);
    },
  },
  "Hamster Berry": {
    draw(p) {
      for (const [x, y, r] of [
        [10, 20, 6],
        [22, 20, 6],
        [16, 15, 7],
        [12, 24, 5],
        [20, 24, 5],
      ])
        p.circle(x, y, r, C.leaf);
      p.circle(13, 12, 3, C.leafL);
      for (const [x, y] of [
        [11, 15],
        [19, 12],
        [23, 18],
        [9, 21],
        [16, 20],
        [13, 25],
        [20, 24],
      ]) {
        p.circle(x, y, 2.1, C.purD);
        p.circle(x - 0.3, y - 0.3, 1.5, C.pur);
      }
    },
    after(p) {
      for (const [x, y] of [
        [11, 15],
        [19, 12],
        [23, 18],
        [9, 21],
        [16, 20],
        [13, 25],
        [20, 24],
      ])
        p.set(x - 1, y - 1, C.purL);
    },
  },
};

export const BUD = {
  "Timothy Hay": C.hay,
  Sunflower: C.yel,
  "Block Broccoli": "#2f7a36",
  "Nap Chamomile": C.white,
  Pumpkin: C.orgL,
  "Moon Melon": C.mel,
  "Golden Carrot": "#f5a524",
  "Hamster Berry": C.pur,
};

export const SEED_COLOR = {
  "Timothy Hay": "#8fa73c",
  Sunflower: "#e2a10f",
  "Block Broccoli": "#3f8a3a",
  "Nap Chamomile": "#6f8fc2",
  Pumpkin: "#e3761a",
  "Moon Melon": "#4f6db0",
  "Golden Carrot": "#d39410",
  "Hamster Berry": "#6a3fb5",
};

const ripeURL = (name) => {
  const r = RIPE[name] ?? RIPE.Sunflower;
  return sprite(`ripe:${name}`, 32, 32, r.draw, { after: r.after });
};

/** Sprite for a seed at a growth percentage. */
export function plantArt(name, pct, { overripe = false, wilt = false } = {}) {
  if (wilt) return img(sprite("wilted", 32, 32, stages.wilted), "art wilted");
  if (pct >= 100) return img(ripeURL(name), `art ${overripe ? "overripe" : "ripe"}`);
  if (pct < 8) return img(sprite("seedling", 32, 32, stages.seedling), "art seedling");
  if (pct < 45) return img(sprite("sprout", 32, 32, stages.sprout), "art sprout");
  const bud = BUD[name] ?? C.leafL;
  return img(sprite(`young:${bud}`, 32, 32, stages.young(bud)), "art young");
}

export const seedArt = (name) => img(ripeURL(name), "art");

// ------------------------------------------------------------------ hamster, wheel, props

function hamsterFrame(p, ox, frame) {
  p.circle(ox + 4, 12, 1.4, C.furD);
  p.ellipse(ox + 14, 13, 9, 6.5, C.fur);
  p.ellipse(ox + 12, 9.5, 4.5, 1.6, C.furH);
  p.ellipse(ox + 13, 16.5, 6, 2.6, C.furL);
  p.circle(ox + 23, 10, 5.2, C.fur);
  p.ellipse(ox + 26, 12.2, 2.8, 2.1, C.furL);
  p.circle(ox + 20.5, 5.2, 2.2, C.fur);
  p.circle(ox + 20.5, 5.2, 1, C.pink);
  const feet = frame === 0 ? [9, 19] : [6.5, 21.5];
  for (const fx of feet) p.ellipse(ox + fx, 19.6, 2.2, 1.2, C.furD);
  p.ellipse(ox + 26, 16.4, 1.4, 1, C.furD);
}

function hamsterFace(p, ox) {
  p.rect(ox + 24, 8, 2, 2, C.eye);
  p.set(ox + 24, 8, "#ffffff");
  p.set(ox + 22, 12, C.pink);
  p.set(ox + 23, 12, C.pink);
  p.set(ox + 28, 11, C.nose);
}

const runSheet = () =>
  sprite(
    "hamster:run",
    64,
    22,
    (p) => {
      hamsterFrame(p, 0, 0);
      hamsterFrame(p, 32, 1);
    },
    {
      after(p) {
        hamsterFace(p, 0);
        hamsterFace(p, 32);
      },
    },
  );

const sleepSprite = () =>
  sprite(
    "hamster:sleep",
    32,
    22,
    (p) => {
      p.circle(5, 14, 1.4, C.furD);
      p.ellipse(16, 13.5, 11, 6.5, C.fur);
      p.ellipse(14, 9.5, 6, 1.8, C.furH);
      p.ellipse(15, 16.6, 7, 2.4, C.furL);
      p.circle(24, 11, 4.6, C.fur);
      p.circle(23.5, 6, 2, C.fur);
      p.circle(23.5, 6, 0.9, C.pink);
    },
    {
      after(p) {
        p.rect(24, 11, 3, 1, C.eye);
        p.set(24, 13, C.pink);
        p.set(25, 13, C.pink);
        p.set(28, 12, C.nose);
      },
    },
  );

const wheelSprite = () =>
  sprite(
    "wheel",
    64,
    64,
    (p) => {
      p.circle(32, 32, 30, "#d7c09b");
      p.clearEllipse(32, 32, 26.5, 26.5);
    },
    {
      after(p) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          p.line(32, 32, 32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26, "#bda57f");
        }
        for (let k = 0; k < 30; k++) {
          const a = (k / 30) * Math.PI * 2;
          p.set(32 + Math.cos(a) * 28.2, 32 + Math.sin(a) * 28.2, "#b39a74");
        }
        p.circle(32, 32, 3.2, "#8a7357");
      },
    },
  );

const standSprite = () =>
  sprite("stand", 64, 30, (p) => {
    p.line(32, 0, 18, 26, "#8a7357", 2);
    p.line(32, 0, 45, 26, "#8a7357", 2);
    p.rect(12, 26, 40, 3, "#7a6248");
    p.rect(12, 26, 40, 1, "#9a8064");
  });

/** Squeektoshi in the wheel. `spinSeconds` is one wheel turn at the live rpm; 0 means asleep. */
export function hamsterArt(spinSeconds) {
  const running = spinSeconds > 0;
  const body = running
    ? `<div class="px hamster run" style="background-image:url(${runSheet()})"></div>`
    : `${img(sleepSprite(), "hamster sleep", 32, 22)}<span class="zzz">z</span><span class="zzz z2">z</span><span class="zzz z3">Z</span>`;
  return `<div class="hamster-scene ${running ? "running" : "asleep"}" style="--spin:${running ? spinSeconds : 1}s">
    ${img(standSprite(), "stand", 64, 30)}
    ${img(wheelSprite(), "wheel", 64, 64)}
    ${body}
  </div>`;
}

/** The shared pantry jar; fill is 0..1. */
export function pantryArt(fill) {
  const level = Math.round(Math.max(0, Math.min(1, fill)) * 10);
  const url = sprite(`jar:${level}`, 24, 30, (p) => {
    p.rect(5, 1, 14, 4, "#b5532f");
    p.rect(5, 1, 14, 1, "#d0704a");
    p.rect(4, 5, 16, 2, "#8f3e22");
    p.rect(3, 7, 18, 21, "#dfe9ea");
    p.set(3, 27, null);
    p.set(20, 27, null);
    const h = Math.round((level / 10) * 19);
    if (h > 0) {
      p.rect(4, 27 - h, 16, h, "#e9b04a");
      for (let y = 27 - h + 1; y < 27; y += 3) for (let x = 5 + (y % 2) * 2; x < 19; x += 4) p.set(x, y, "#c98a2a");
    }
    p.rect(6, 9, 1, 14, "#ffffff");
  });
  return img(url, "pantry-art", 24, 30);
}

export const canArt = () =>
  img(
    sprite("can", 18, 14, (p) => {
      p.rect(3, 5, 9, 8, "#5aa0d8");
      p.rect(3, 5, 9, 2, "#7fbcea");
      p.line(12, 8, 16, 3, "#3f86c2");
      p.line(12, 9, 16, 4, "#3f86c2");
      p.rect(15, 2, 3, 2, "#3f86c2");
      p.line(1, 7, 1, 10, "#3f86c2");
      p.set(2, 6, "#3f86c2");
      p.set(2, 11, "#3f86c2");
    }),
    "can-art",
    18,
    14,
  );

export const signArt = () =>
  img(
    sprite("sign", 24, 18, (p) => {
      p.rect(10, 11, 4, 7, C.woodD);
      p.rect(2, 2, 20, 10, C.wood);
      p.rect(2, 2, 20, 1, C.woodL);
      p.rect(9, 6, 6, 4, "#f2c230");
      p.rect(9, 6, 6, 1, "#ffe07a");
      p.set(10, 4, "#8a8a8a");
      p.set(10, 5, "#8a8a8a");
      p.set(13, 4, "#8a8a8a");
      p.set(13, 5, "#8a8a8a");
      p.set(11, 3, "#8a8a8a");
      p.set(12, 3, "#8a8a8a");
      p.set(12, 7, "#6b4a22");
      p.set(12, 8, "#6b4a22");
    }),
    "sign-art",
    24,
    18,
  );

// ------------------------------------------------------------------ tiling textures (CSS backgrounds)

function bed(soil, soilD, soilLL) {
  return (p) => {
    p.ellipse(20, 10, 19.5, 9, soil);
    for (let y = 12; y < 20; y++) for (let x = 0; x < 40; x++) if (p.get(x, y)) p.set(x, y, soilD);
    for (const y of [4, 7, 10]) for (let x = 0; x < 40; x++) if (p.get(x, y) === soil && (x + y) % 3 !== 0) p.set(x, y, soilLL);
  };
}

/** Data URLs for the pixel textures; main.js puts them in CSS custom properties. */
export function textures() {
  return {
    grass: sprite(
      "tile:grass",
      16,
      16,
      (p) => {
        p.rect(0, 0, 16, 16, C.grass);
        for (const [x, y] of [
          [2, 3],
          [9, 1],
          [13, 7],
          [5, 10],
          [11, 13],
          [1, 14],
        ])
          p.set(x, y, C.grassD);
        for (const [x, y] of [
          [4, 5],
          [12, 3],
          [7, 13],
          [14, 11],
        ]) {
          p.set(x, y, C.grassL);
          p.set(x, y - 1, C.grassL);
          p.set(x + 1, y, C.grassL);
        }
      },
      { outline: false },
    ),
    fence: sprite("tile:fence", 16, 16, (p) => {
      p.rect(0, 5, 16, 2, C.wood);
      p.rect(0, 10, 16, 2, C.wood);
      p.rect(6, 2, 4, 13, C.woodL);
      p.rect(7, 1, 2, 1, C.woodL);
      p.rect(9, 2, 1, 13, C.woodD);
    }),
    bed: sprite("bed:dry", 40, 20, bed(C.soil, C.soilD, C.soilLL)),
    bedWet: sprite("bed:wet", 40, 20, bed("#5f3c22", "#45291a", "#7a5233")),
    bedGrass: sprite("bed:grass", 40, 20, bed(C.grassL, C.grassD, "#9ccf73")),
  };
}
