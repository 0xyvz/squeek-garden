const fs = require("fs");
const path = require("path");
const { artifacts } = require("hardhat");

const WEB_SRC = path.join(__dirname, "..", "web", "src");
const DEPLOYMENTS = path.join(WEB_SRC, "deployments.json");

/** Copies ABIs into the web app so the frontend never reads Hardhat's artifacts folder. */
async function exportAbis() {
  const dir = path.join(WEB_SRC, "abi");
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ["SqueekGarden", "MockSqueekCore"]) {
    const { abi } = await artifacts.readArtifact(name);
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(abi, null, 2) + "\n");
  }
}

function saveDeployment(key, info) {
  const all = fs.existsSync(DEPLOYMENTS) ? JSON.parse(fs.readFileSync(DEPLOYMENTS, "utf8")) : {};
  all[key] = info;
  fs.writeFileSync(DEPLOYMENTS, JSON.stringify(all, null, 2) + "\n");
  console.log(`Saved ${key} deployment to ${path.relative(process.cwd(), DEPLOYMENTS)}`);
}

function loadDeployment(key) {
  const all = fs.existsSync(DEPLOYMENTS) ? JSON.parse(fs.readFileSync(DEPLOYMENTS, "utf8")) : {};
  return all[key] ?? null;
}

module.exports = { exportAbis, saveDeployment, loadDeployment };
