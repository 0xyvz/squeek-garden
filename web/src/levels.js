// Player levels, mirroring SqueekGarden.pointsForLevel and levelFor: the first levels come within a day or two of play,
// each later one asks for a little more, and past level 10 every 8,000 points is another level.
const STEPS = [30, 100, 250, 600, 1_800, 4_000, 7_500, 12_000, 18_000];
const LATE_STEP = 8_000;

export function pointsForLevel(level) {
  if (level <= 1) return 0;
  return level <= 10 ? STEPS[level - 2] : 18_000 + (level - 10) * LATE_STEP;
}

export function levelFor(points) {
  const p = Number(points);
  if (p >= 18_000) return 10 + Math.floor((p - 18_000) / LATE_STEP);
  let level = 1;
  while (p >= pointsForLevel(level + 1)) level++;
  return level;
}
