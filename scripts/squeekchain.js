// Live Sepolia addresses, from https://api.squeekchain.com/v1/economy/state (identities).
// A testnet reinstall changes these; re-check that endpoint before deploying.
module.exports = {
  SQUEEK_CORE: "0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44",
  SQK_TOKEN: "0x5501e1fa81be1c3f49225fa7668da0245d07db60",
  SQUEEK_NFT: "0xcb98349c134ab983da5bfd80527dfe2552bdb70f", // identities.genesis, the ERC-721 "Squeek" collection
  SQUEEK_DEPLOY_BLOCK: 11998937, // chain.deploymentBlock: where the web app starts looking for Squeek transfers
  SEPOLIA_RPC: "https://ethereum-sepolia-rpc.publicnode.com",
};
