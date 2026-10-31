import { formatUnits } from "viem";
import { gardenAbi, deployment, publicClient } from "./chain.js";
import { plantArt, seedArt, SEED_COLOR } from "./art.js";
import { initNav } from "./nav.js";
import { t, seedName } from "./i18n.js";
import { pointsForLevel } from "./levels.js";

initNav();

const WORK_PER_KM = 1140;
const ROUND_SECONDS = 600;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n) => Number(n).toLocaleString("en-US");

document.getElementById("growth-see1").innerHTML = t("growth.see1", {
  demo: `<span class="grow-pct demo"><span aria-hidden="true">⚙️</span>42.17%</span>`,
});

function needs(s) {
  if (s.mode === 0) return `${t("card.work", { n: fmt(s.growAmount) })} <small>${t("card.km", { km: (Number(s.growAmount) / WORK_PER_KM).toFixed(1) })}</small>`;
  if (s.mode === 1) return t("card.blocks", { n: fmt(s.growAmount) });
  const hours = (Number(s.growAmount) * ROUND_SECONDS) / 3600;
  return `${t("card.rounds", { n: fmt(s.growAmount) })} <small>${t("card.rest", { h: hours.toFixed(0) })}</small>`;
}

function seedCard(s) {
  const price = s.price === 0n ? t("seeds.free") : `${fmt(formatUnits(s.price, 18))} SQK`;
  const extras = [
    s.level > 1 ? t("card.level", { n: s.level }) : "",
    s.unlockSnacks > 0 ? t("card.unlock", { n: fmt(s.unlockSnacks) }) : "",
    s.dailyLimit > 0 ? t("card.daily", { n: s.dailyLimit }) : "",
    s.needsFreshRun ? t("card.fresh") : "",
    s.mode === 2 ? t("card.wilts", { n: fmt(s.napWorkLimit), m: Math.round((Number(s.napWorkLimit) / WORK_PER_KM) * 1000) }) : "",
  ].filter(Boolean);
  const note = t(`note.${s.name}`);
  return `
    <article class="seed-card" style="--seed:${SEED_COLOR[s.name] ?? "#4f9d43"}">
      <div class="seed-card-art">${plantArt(s.name, 100, {})}</div>
      <div class="seed-card-body">
        <h3>${seedArt(s.name)} ${esc(seedName(s.name))}${s.rare ? ` <i class="rare">${t("seeds.rare")}</i>` : ""}</h3>
        <dl>
          <div><dt>${t("card.growsWith")}</dt><dd>${t(`card.mode.${s.mode}`)}</dd></div>
          <div><dt>${t("card.needs")}</dt><dd>${needs(s)}</dd></div>
          <div><dt>${t("card.points")}</dt><dd><b>${fmt(s.basePoints)}</b> <small>${t("card.upTo", { n: fmt(Math.floor(s.basePoints * 1.45)) })}</small></dd></div>
          <div><dt>${t("card.price")}</dt><dd>${price}</dd></div>
        </dl>
        ${note === `note.${s.name}` ? "" : `<p class="seed-card-note">${esc(note)}</p>`}
        ${extras.length ? `<ul class="seed-card-tags">${extras.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
      </div>
    </article>`;
}

/** Levels 1-10 with the points they need and the seeds they open. */
function levelTable(seeds) {
  const rows = Array.from({ length: 10 }, (_, k) => {
    const level = k + 1;
    const opens = seeds.filter((s) => s.active && Math.max(1, s.level) === level).map((s) => `${seedArt(s.name)} ${esc(seedName(s.name))}`);
    return `<tr><td><b>${level}</b></td><td>${fmt(pointsForLevel(level))}</td><td>${opens.join(", ") || "–"}</td></tr>`;
  });
  document.getElementById("level-table").innerHTML = `<table class="level-table">
    <thead><tr><th>${t("levels.th.level")}</th><th>${t("levels.th.points")}</th><th>${t("levels.th.opens")}</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table>`;
}

async function loadSeeds() {
  const target = document.getElementById("seed-guide");
  levelTable([]);
  if (!deployment) {
    target.innerHTML = `<p class="hint">${t("card.notDeployed")}</p>`;
    return;
  }
  try {
    const seeds = await publicClient.readContract({ address: deployment.garden, abi: gardenAbi, functionName: "seeds" });
    target.innerHTML = seeds.filter((s) => s.active).map(seedCard).join("");
    levelTable(seeds);
  } catch {
    target.innerHTML = `<p class="hint">${t("card.unreachable")}</p>`;
  }
}

loadSeeds();
