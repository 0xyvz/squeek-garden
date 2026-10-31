// Deploys Squeek Garden to Sepolia against the live SqueekCore, SQK token and Squeek NFT.
// Needs DEPLOYER_PRIVATE_KEY (and optionally TREASURY_ADDRESS, SEPOLIA_RPC_URL) in .env.
const { ethers, network } = require("hardhat");
const { SQUEEK_CORE, SQK_TOKEN, SQUEEK_NFT, SQUEEK_DEPLOY_BLOCK } = require("./squeekchain");
const { exportAbis, saveDeployment } = require("./lib");

async function main() {
  if (network.name !== "sepolia") throw new Error("Run with --network sepolia");
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is not set in .env");
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  // Holder plots start off unless asked for; the owner can switch them on later with setSqueekNft.
  const squeekNft = process.env.SQUEEK_NFT_PERK === "on" ? SQUEEK_NFT : ethers.ZeroAddress;

  console.log(`Deployer ${deployer.address}, balance ${ethers.formatEther(await ethers.provider.getBalance(deployer))} ETH`);
  console.log(`Treasury for SQK seed payments: ${treasury}`);
  console.log(`Squeek NFT holder plots: ${squeekNft === ethers.ZeroAddress ? "off" : "on"}`);

  const garden = await ethers.deployContract("SqueekGarden", [SQUEEK_CORE, SQK_TOKEN, squeekNft, treasury]);
  const receipt = await garden.deploymentTransaction().wait();
  const address = await garden.getAddress();
  console.log(`SqueekGarden deployed at ${address} (block ${receipt.blockNumber})`);
  console.log(`readings() = ${await garden.readings()}`);
  console.log(`Verify: npx hardhat verify --network sepolia ${address} ${SQUEEK_CORE} ${SQK_TOKEN} ${squeekNft} ${treasury}`);

  await exportAbis();
  saveDeployment("sepolia", {
    chainId: 11155111,
    garden: address,
    deployBlock: receipt.blockNumber,
    squeekCore: SQUEEK_CORE,
    sqk: SQK_TOKEN,
    squeekNft: SQUEEK_NFT, // the collection; whether its perk is on is read from the garden's squeekNft()
    squeekNftFromBlock: SQUEEK_DEPLOY_BLOCK,
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
