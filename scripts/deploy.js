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

  // Sepolia's base fee is close to zero, but the default 1 gwei tip makes this ~38M-gas deploy cost ~0.04 ETH; a small
  // tip gets in just as well. TIP_GWEI overrides it if blocks ever fill up.
  const tip = ethers.parseUnits(process.env.TIP_GWEI || "0.05", "gwei");
  const { maxFeePerGas } = await ethers.provider.getFeeData();
  const fees = { maxPriorityFeePerGas: tip, maxFeePerGas: maxFeePerGas * 2n + tip };

  const garden = await ethers.deployContract("SqueekGarden", [SQUEEK_CORE, SQK_TOKEN, squeekNft, treasury], fees);
  const receipt = await garden.deploymentTransaction().wait();
  const address = await garden.getAddress();
  console.log(`SqueekGarden deployed at ${address} (block ${receipt.blockNumber})`);
  console.log(`Verify: npx hardhat verify --network sepolia ${address} ${SQUEEK_CORE} ${SQK_TOKEN} ${squeekNft} ${treasury}`);

  // Save first: a public RPC can lag a few seconds behind the deploy block, so the first read may come back empty.
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
  console.log(`readings() = ${await garden.readings().catch((e) => `not readable yet (${e.shortMessage ?? e.message})`)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
