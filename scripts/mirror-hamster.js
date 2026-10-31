// Keeps the local playground's MockSqueekCore in step with the real hamster on Sepolia, so local plants grow from
// Squeektoshi's actual runs. Run alongside `npx hardhat node` after deploy-local.js:
//   npx hardhat run scripts/mirror-hamster.js --network localhost
const { ethers } = require("ethers");
const { SQUEEK_CORE, SEPOLIA_RPC } = require("./squeekchain");

const POLL_MS = 15_000;
const FRESH_RUN_ROUNDS = 3n;
const CORE_ABI = [
  "function state() view returns (tuple(uint64 settledThroughRound, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint64 blockHeight, uint96 blockProgress, uint32 workPerThousandBlocks, uint256 authorizationNonce, bool paused))",
  "function roundPage(uint64 afterRound, uint64 throughRound, uint256 maxRecords) view returns (tuple(uint64 certifiedThroughRound, tuple(uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks) start, tuple(uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks) end, tuple(uint64 roundId, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint32 workPerThousandBlocks, bytes32 dataHash)[] rounds))",
];

async function readRealHamster() {
  const core = new ethers.Contract(SQUEEK_CORE, CORE_ABI, new ethers.JsonRpcProvider(SEPOLIA_RPC));
  const s = await core.state();
  const through = s.settledThroughRound;
  const page = await core.roundPage(through > FRESH_RUN_ROUNDS ? through - FRESH_RUN_ROUNDS : 0n, through, 0);
  const recentWork = page.end.cumulativeWork > page.start.cumulativeWork ? page.end.cumulativeWork - page.start.cumulativeWork : 0n;
  return { work: s.cumulativeWork, blockHeight: s.blockHeight, settledRound: through, recentWork };
}

async function main() {
  const hre = require("hardhat");
  const { loadDeployment } = require("./lib");
  if (hre.network.name !== "localhost") throw new Error("Run with --network localhost");
  const local = loadDeployment("local");
  if (!local) throw new Error("No local deployment; run scripts/deploy-local.js first");
  const mock = await hre.ethers.getContractAt("MockSqueekCore", local.squeekCore);

  let last = "";
  for (;;) {
    try {
      const r = await readRealHamster();
      const key = `${r.work}/${r.blockHeight}/${r.settledRound}/${r.recentWork}`;
      if (key !== last) {
        await (await mock.setState(r.work, r.blockHeight, r.settledRound, r.recentWork)).wait();
        console.log(`${new Date().toISOString()} mirrored work ${r.work}, block ${r.blockHeight}, round ${r.settledRound}, recent ${r.recentWork}`);
        last = key;
      }
    } catch (e) {
      console.error(`${new Date().toISOString()} mirror failed: ${e.shortMessage ?? e.message}`);
    }
    await new Promise((res) => setTimeout(res, POLL_MS));
  }
}

module.exports = { readRealHamster };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
