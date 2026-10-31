// Local playground: mock SqueekCore, SQK and Squeek NFT plus the garden on `npx hardhat node`.
// The mock starts from the real hamster's current readings; run scripts/mirror-hamster.js to keep it in sync.
const { ethers, network } = require("hardhat");
const { exportAbis, saveDeployment } = require("./lib");
const { readRealHamster } = require("./mirror-hamster");

async function main() {
  if (network.name !== "localhost") throw new Error("Run with --network localhost");
  const [owner, player] = await ethers.getSigners();

  const core = await ethers.deployContract("MockSqueekCore");
  const sqk = await ethers.deployContract("MockSQK");
  const nft = await ethers.deployContract("MockSqueekNFT");

  const real = await readRealHamster().catch(() => null);
  const start = real ?? { work: 45_000n, blockHeight: 4_000n, settledRound: 500n, recentWork: 0n };
  await (await core.setState(start.work, start.blockHeight, start.settledRound, start.recentWork)).wait();
  console.log(real ? `Mock starts from the real hamster: work ${start.work}, block ${start.blockHeight}` : "Sepolia unreachable; mock starts from sample values");

  await (await sqk.mint(player.address, ethers.parseUnits("5000", 18))).wait();
  await (await nft.mint(player.address)).wait();

  // Like the Sepolia launch, holder plots start off unless SQUEEK_NFT_PERK=on; the mock NFT is minted either way so
  // they can be switched on later with setSqueekNft.
  const perkOn = process.env.SQUEEK_NFT_PERK === "on";
  const garden = await ethers.deployContract("SqueekGarden", [core, sqk, perkOn ? nft : ethers.ZeroAddress, owner.address]);
  const receipt = await garden.deploymentTransaction().wait();
  console.log(`Squeek NFT holder plots: ${perkOn ? "on" : "off"}`);

  await exportAbis();
  saveDeployment("local", {
    chainId: 31337,
    garden: await garden.getAddress(),
    deployBlock: receipt.blockNumber,
    squeekCore: await core.getAddress(),
    sqk: await sqk.getAddress(),
    squeekNft: await nft.getAddress(),
  });
  console.log(`Local garden ${await garden.getAddress()}; player ${player.address} holds 5000 test SQK and one test Squeek`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
