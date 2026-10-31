// Deploys the garden on a local fork of Sepolia and checks it against the real SqueekCore and Squeek NFT.
// Run: FORK_SEPOLIA=1 npx hardhat run scripts/fork-check.js
const { ethers, network } = require("hardhat");
const { SQUEEK_CORE, SQK_TOKEN, SQUEEK_NFT } = require("./squeekchain");

async function main() {
  if (!network.config.forking) throw new Error("Set FORK_SEPOLIA=1 to run this against a Sepolia fork.");
  const [owner, player] = await ethers.getSigners();

  const garden = await ethers.deployContract("SqueekGarden", [SQUEEK_CORE, SQK_TOKEN, SQUEEK_NFT, owner.address]);
  const [r, recentWork] = await garden.readings();
  console.log(`real readings: work ${r.work}, block ${r.blockHeight}, settled round ${r.settledRound}, recent work ${recentWork}`);
  if (r.work === 0n || r.blockHeight === 0n || r.settledRound === 0n) throw new Error("SqueekCore returned zeros; struct layout mismatch?");

  console.log("hasSqueek(player) on the real NFT:", await garden.hasSqueek(player.address));
  await garden.connect(player).setNickname("fork_tester");
  await garden.connect(player).plantMany([0, 1, 2, 3], 1);
  await garden.connect(player).plant(4, 3);
  await garden.connect(player).plant(5, 4);
  const st = await garden.plotStatus(player.address, 5);
  console.log(`planted hay, broccoli and chamomile; chamomile status: progress ${st.progress}/${st.needed}, wilted ${st.wilted}`);
  console.log("leaderboard page:", (await garden.playersPage(0, 5)).map((p) => `${p.nickname}:${p.points}`));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
