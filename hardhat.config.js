require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, FORK_SEPOLIA, ETHERSCAN_API_KEY } = process.env;
const sepoliaRpc = SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    // FORK_SEPOLIA=1 runs the local network on a copy of Sepolia, with the real SqueekCore and SQK.
    hardhat: FORK_SEPOLIA ? { forking: { url: sepoliaRpc }, chainId: 11155111 } : {},
    sepolia: {
      url: sepoliaRpc,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  // Publishes the source on Sepolia Etherscan (needs ETHERSCAN_API_KEY): npx hardhat verify --network sepolia <garden> <core> <sqk> <nft> <treasury>
  etherscan: { apiKey: ETHERSCAN_API_KEY || "" },
  sourcify: { enabled: false }, // hardhat-verify 2.1 still calls the removed Sourcify v1 API
};
