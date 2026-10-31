// Particle and motion effects drawn in a fixed overlay, so polling re-renders never cut them short.
import { canArt } from "./art.js";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let layer = null;

function fxLayer() {
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "fx-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
  }
  return layer;
}

const center = (rect, dy = 0) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 + dy });

/** Particles thrown out of a point. */
export function burst(x, y, { count = 10, colors = ["#8a5d38"], size = [4, 9], spread = 60, up = 50, gravity = 90, life = 650, shape = "circle" } = {}) {
  if (reduced()) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("i");
    el.className = `particle ${shape}`;
    const s = size[0] + Math.random() * (size[1] - size[0]);
    el.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${colors[i % colors.length]}`;
    fxLayer().append(el);
    const dx = (Math.random() - 0.5) * spread * 2;
    const dy = -up * (0.4 + Math.random());
    el.animate(
      [
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + gravity}px)) scale(0.4)`, opacity: 0 },
      ],
      { duration: life * (0.8 + Math.random() * 0.4), easing: "cubic-bezier(.2,.7,.4,1)" },
    ).onfinish = () => el.remove();
  }
}

/** Falling water drops from a can held above the plot. */
export function waterDrops(rect) {
  const { x } = center(rect);
  const top = rect.top + rect.height * 0.05;
  if (!reduced()) {
    const can = document.createElement("div");
    can.className = "fx-can";
    can.innerHTML = canArt();
    can.style.cssText = `left:${x + 18}px;top:${top - 10}px`;
    fxLayer().append(can);
    can.animate(
      [
        { transform: "translate(-50%,-50%) rotate(0deg) scale(.6)", opacity: 0 },
        { transform: "translate(-50%,-50%) rotate(-35deg) scale(1)", opacity: 1, offset: 0.2 },
        { transform: "translate(-50%,-50%) rotate(-40deg) scale(1)", opacity: 1, offset: 0.8 },
        { transform: "translate(-50%,-50%) rotate(0deg) scale(.6)", opacity: 0 },
      ],
      { duration: 900, easing: "ease-out" },
    ).onfinish = () => can.remove();
  }
  for (let i = 0; i < 12; i++) {
    setTimeout(() => burst(x + (Math.random() - 0.5) * 30, top + 20, { count: 1, colors: ["#5bb3f0", "#8fd0ff"], size: [5, 7], spread: 6, up: -10, gravity: rect.height * 0.55, life: 520, shape: "drop" }), 120 + i * 45);
  }
}

/** A seed dropping into the soil, then dirt flying. */
export function plantSeed(rect, art) {
  const { x, y } = center(rect, rect.height * 0.15);
  if (reduced()) return;
  const seed = document.createElement("div");
  seed.className = "fx-seed";
  seed.innerHTML = art;
  seed.style.cssText = `left:${x}px;top:${y}px`;
  fxLayer().append(seed);
  seed.animate(
    [
      { transform: "translate(-50%, -160%) scale(.9) rotate(-20deg)", opacity: 0 },
      { transform: "translate(-50%, -120%) scale(1) rotate(0deg)", opacity: 1, offset: 0.25 },
      { transform: "translate(-50%, -20%) scale(.6) rotate(10deg)", opacity: 1, offset: 0.8 },
      { transform: "translate(-50%, 0%) scale(.3)", opacity: 0 },
    ],
    { duration: 520, easing: "cubic-bezier(.5,0,.9,.6)" },
  ).onfinish = () => {
    seed.remove();
    burst(x, y + 6, { count: 14, colors: ["#7a4f2c", "#9b6a3e", "#5e3a1e"], size: [4, 8], spread: 45, up: 40, gravity: 60 });
  };
}

/** Crop leaping out of the plot and flying into a target (the pantry jar). */
export function flyTo(rect, target, art, onArrive) {
  const from = center(rect, -rect.height * 0.1);
  const to = target ? center(target.getBoundingClientRect()) : { x: from.x, y: from.y - 120 };
  burst(from.x, from.y, { count: 12, colors: ["#ffe27a", "#fff6c4", "#ffd04a"], size: [4, 7], spread: 50, up: 60, gravity: 30, shape: "star" });
  if (reduced()) return void onArrive?.();
  const el = document.createElement("div");
  el.className = "fx-crop";
  el.innerHTML = art;
  el.style.cssText = `left:${from.x}px;top:${from.y}px`;
  fxLayer().append(el);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  el.animate(
    [
      { transform: "translate(-50%,-50%) scale(1)", offset: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.15}px), calc(-50% - 70px)) scale(1.35)`, offset: 0.3 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.35)`, offset: 1 },
    ],
    { duration: 900, easing: "cubic-bezier(.3,.1,.3,1)" },
  ).onfinish = () => {
    el.remove();
    if (target) {
      target.animate([{ transform: "scale(1)" }, { transform: "scale(1.18) rotate(-4deg)" }, { transform: "scale(1)" }], { duration: 380, easing: "cubic-bezier(.3,1.6,.5,1)" });
      const t = center(target.getBoundingClientRect());
      burst(t.x, t.y - 10, { count: 8, colors: ["#ffd04a", "#fff"], size: [3, 6], spread: 30, up: 30, gravity: 20, shape: "star" });
    }
    onArrive?.();
  };
}

/** "+12" floating up from a point. */
export function floatText(x, y, text, cls = "") {
  const el = document.createElement("div");
  el.className = `float-text ${cls}`;
  el.textContent = text;
  el.style.cssText = `left:${x}px;top:${y}px`;
  fxLayer().append(el);
  el.animate(
    [
      { transform: "translate(-50%, 0) scale(.6)", opacity: 0 },
      { transform: "translate(-50%, -14px) scale(1.2)", opacity: 1, offset: 0.2 },
      { transform: "translate(-50%, -70px) scale(1)", opacity: 0 },
    ],
    { duration: reduced() ? 600 : 1300, easing: "ease-out" },
  ).onfinish = () => el.remove();
}

export function floatFrom(el, text, cls) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  floatText(r.left + r.width / 2, r.top + r.height * 0.25, text, cls);
}

/** Squash-and-stretch bounce on an element. */
export function squish(el) {
  if (!el || reduced()) return;
  el.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.08, .9)" }, { transform: "scale(.95, 1.06)" }, { transform: "scale(1)" }],
    { duration: 380, easing: "cubic-bezier(.3,1.4,.5,1)" },
  );
}

export function shake(el) {
  if (!el || reduced()) return;
  el.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(0)" }],
    { duration: 320 },
  );
}

/** Counts a number element up to its new value. */
export function tickNumber(el, from, to) {
  if (!el || from === to || reduced()) return;
  const start = performance.now();
  const dur = 700;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const v = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    el.textContent = v.toLocaleString("en-US");
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  el.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 450, easing: "cubic-bezier(.3,1.6,.5,1)" });
}
