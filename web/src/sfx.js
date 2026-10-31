// Tiny synthesized sound effects (Web Audio, no files). Mute is remembered per browser.

const KEY = "squeek-garden:muted";
let ctx = null;
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable: keep it for this visit */
  }
}

function audio() {
  if (muted) return null;
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, { at = 0, dur = 0.12, type = "sine", gain = 0.16, slideTo = null } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ at = 0, dur = 0.15, freq = 800, q = 1, type = "lowpass", gain = 0.2 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  tap: () => tone(720, { dur: 0.05, type: "triangle", gain: 0.08 }),
  select: () => tone(520, { dur: 0.08, type: "triangle", gain: 0.1, slideTo: 780 }),
  plant() {
    noise({ dur: 0.12, freq: 380, gain: 0.35 });
    tone(140, { dur: 0.1, type: "sine", gain: 0.2, slideTo: 80 });
    tone(330, { at: 0.28, dur: 0.12, type: "sine", gain: 0.14, slideTo: 990 });
  },
  water() {
    noise({ dur: 0.35, freq: 2200, q: 0.8, type: "bandpass", gain: 0.12 });
    for (let i = 0; i < 4; i++) tone(1200 + Math.random() * 900, { at: 0.08 + i * 0.07, dur: 0.05, gain: 0.06, slideTo: 2400 });
  },
  harvest() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.16, type: "triangle", gain: 0.12 }));
    tone(2093, { at: 0.3, dur: 0.25, type: "sine", gain: 0.05 });
  },
  uproot() {
    noise({ dur: 0.18, freq: 600, gain: 0.3 });
    tone(220, { dur: 0.16, type: "square", gain: 0.05, slideTo: 110 });
  },
  help() {
    tone(660, { dur: 0.1, type: "triangle", gain: 0.1 });
    tone(880, { at: 0.1, dur: 0.14, type: "triangle", gain: 0.1 });
  },
  error() {
    tone(330, { dur: 0.12, type: "square", gain: 0.06 });
    tone(247, { at: 0.12, dur: 0.18, type: "square", gain: 0.06 });
  },
  block() {
    tone(988, { dur: 0.08, type: "square", gain: 0.05 });
    tone(1319, { at: 0.08, dur: 0.22, type: "square", gain: 0.05 });
  },
  fanfare() {
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.09, dur: 0.22, type: "triangle", gain: 0.11 }));
  },
};

export function buzz(ms = 12) {
  if (!muted) navigator.vibrate?.(ms);
}
