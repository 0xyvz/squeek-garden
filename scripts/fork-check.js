// Checks the deployed garden on a local fork of Sepolia against the real SqueekCore and Squeek NFT, without touching
// the real chain. Run: FORK_SEPOLIA=1 npx hardhat run scripts/fork-check.js
const { ethers, network } = require("hardhat");
const { SQUEEK_CORE } = require("./squeekchain");
const { loadDeployment } = require("./lib");

const HAY = 1;
const SUNFLOWER = 2;
const MOON_MELON = 6;

async function main() {
  if (!network.config.forking) throw new Error("Set FORK_SEPOLIA=1 to run this against a Sepolia fork.");
  const [, player] = await ethers.getSigners();
  const deployed = loadDeployment("sepolia");
  const garden = await ethers.getContractAt("SqueekGarden", deployed.garden);
  console.log(`garden ${deployed.garden}, core ${await garden.core()}`);

  // readings() also returns recentWork, which goes through the real SqueekCore.roundPage(after, through, 0).
  const [r, recentWork] = await garden.readings();
  console.log(`real readings: work ${r.work}, block ${r.blockHeight}, settled round ${r.settledRound}, recent work ${recentWork}`);
  if (r.work === 0n || r.blockHeight === 0n || r.settledRound === 0n) throw new Error("SqueekCore returned zeros; struct layout mismatch?");

  console.log("seed levels:", (await garden.seeds()).map((s) => `${s.name}:${s.level}`).join(", "));
  await garden.connect(player).setNickname("fork_tester");
  await garden.connect(player).plantMany([0, 1, 2, 3], HAY);
  await garden
    .connect(player)
    .plant(4, SUNFLOWER)
    .then(() => {
      throw new Error("Sunflower planted at level 1");
    })
    .catch((e) => {
      if (!String(e.message).includes("LevelTooLow")) throw e;
      console.log("Sunflower refused at level 1 (LevelTooLow), as it should be");
    });
  const st = await garden.plotStatus(player.address, 0);
  console.log(`hay status: progress ${st.progress}/${st.needed}, ripe ${st.ripe}`);

  // The owner's rescue path against the real core: switching to the same core must keep readings continuous.
  const owner = await ethers.getImpersonatedSigner(await garden.owner());
  await network.provider.send("hardhat_setBalance", [owner.address, "0x8AC7230489E80000"]);
  await garden.connect(owner).setCore(SQUEEK_CORE);
  const [after] = await garden.readings();
  if (after.work !== r.work || after.blockHeight !== r.blockHeight || after.settledRound !== r.settledRound) {
    throw new Error(`setCore(same core) moved readings: ${after} vs ${r}`);
  }
  console.log("setCore(same core) on the real core keeps readings continuous");

  // Moon Melon's fresh-run check reads roundPage during a harvest; make it reachable and call it.
  await garden.connect(owner).setSeedLevel(MOON_MELON, 1);
  console.log("leaderboard page:", (await garden.playersPage(0, 5)).map((p) => `${p.nickname}:${p.points}`));
  console.log("fork check passed");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
