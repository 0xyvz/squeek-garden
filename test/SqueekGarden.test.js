const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const HAY = 1;
const SUNFLOWER = 2;
const BROCCOLI = 3;
const CHAMOMILE = 4;
const MOON_MELON = 6;
const GOLDEN_CARROT = 7;

const PUMPKIN = 5;
const BERRY = 8;

const SQK = 10n ** 18n;

/** The garden as deployed, with every seed at its level. */
async function deployLeveledGarden() {
  const [owner, alice, bob, carol, treasury] = await ethers.getSigners();
  const core = await ethers.deployContract("MockSqueekCore");
  const sqk = await ethers.deployContract("MockSQK");
  const nft = await ethers.deployContract("MockSqueekNFT");
  await core.setState(45_000, 4_000, 500, 0);
  const garden = await ethers.deployContract("SqueekGarden", [core, sqk, nft, treasury.address]);
  return { garden, core, sqk, nft, owner, alice, bob, carol, treasury };
}

/** Every seed open from level 1, so the other rules can be tested on their own. */
async function deployGarden() {
  const f = await deployLeveledGarden();
  for (let id = 1; id <= Number(await f.garden.seedCount()); id++) await f.garden.setSeedLevel(id, 1);
  return f;
}

/** Harvests `n` hays for `player`, the quickest way to fill the pantry in tests. */
async function fillPantry(garden, core, player, n) {
  for (let done = 0; done < n; done += 9) {
    const plots = [...Array(Math.min(9, n - done)).keys()];
    await garden.connect(player).plantMany(plots, HAY);
    await core.run(800);
    await garden.connect(player).harvestMany(plots);
  }
}

describe("SqueekGarden", function () {
  describe("catalogue", function () {
    it("ships the hamster snack seeds from the constructor", async function () {
      const { garden } = await loadFixture(deployGarden);
      const seeds = await garden.seeds();
      expect(seeds.map((s) => s.name)).to.deep.equal([
        "Timothy Hay",
        "Sunflower",
        "Block Broccoli",
        "Nap Chamomile",
        "Pumpkin",
        "Moon Melon",
        "Golden Carrot",
        "Hamster Berry",
      ]);
      expect(seeds[CHAMOMILE - 1].mode).to.equal(2);
      expect(seeds[GOLDEN_CARROT - 1].price).to.equal(100n * SQK);
    });
  });

  describe("planting", function () {
    it("records all three hamster readings and registers the player", async function () {
      const { garden, alice } = await loadFixture(deployGarden);
      await expect(garden.connect(alice).plant(0, HAY)).to.emit(garden, "Planted").withArgs(alice.address, 0, HAY, 45_000, 0);
      const p = (await garden.garden(alice.address))[0];
      expect([p.plantedWork, p.plantedBlock, p.plantedRound]).to.deep.equal([45_000n, 4_000n, 500n]);
      expect(await garden.isPlayer(alice.address)).to.equal(true);
      expect(await garden.playerCount()).to.equal(1);
    });

    it("rejects occupied plots, bad plots, unknown and inactive seeds", async function () {
      const { garden, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, HAY);
      await expect(garden.connect(alice).plant(0, HAY)).to.be.revertedWithCustomError(garden, "PlotOccupied");
      await expect(garden.connect(alice).plant(12, HAY)).to.be.revertedWithCustomError(garden, "BadPlot");
      await expect(garden.connect(alice).plant(1, 0)).to.be.revertedWithCustomError(garden, "UnknownSeed");
      await garden.setSeedActive(SUNFLOWER, false);
      await expect(garden.connect(alice).plant(1, SUNFLOWER)).to.be.revertedWithCustomError(garden, "SeedInactive");
    });

    it("charges SQK seeds to the treasury", async function () {
      const { garden, sqk, alice, treasury } = await loadFixture(deployGarden);
      await sqk.mint(alice.address, 100n * SQK);
      await sqk.connect(alice).approve(garden, 100n * SQK);
      await expect(garden.connect(alice).plant(0, GOLDEN_CARROT)).to.changeTokenBalances(
        sqk,
        [alice, treasury],
        [-100n * SQK, 100n * SQK],
      );
    });

    it("caps paid seeds per player per UTC day, and the cap resets the next day", async function () {
      const { garden, sqk, alice, bob } = await loadFixture(deployGarden);
      expect((await garden.seeds())[GOLDEN_CARROT - 1].dailyLimit).to.equal(3);
      expect((await garden.seeds())[BERRY - 1].dailyLimit).to.equal(1);
      for (const p of [alice, bob]) {
        await sqk.mint(p.address, 10_000n * SQK);
        await sqk.connect(p).approve(garden, ethers.MaxUint256);
      }
      await garden.connect(alice).plantMany([0, 1, 2], GOLDEN_CARROT);
      expect(await garden.plantedToday(alice.address, GOLDEN_CARROT)).to.equal(3);
      await expect(garden.connect(alice).plant(3, GOLDEN_CARROT))
        .to.be.revertedWithCustomError(garden, "SeedDailyLimit")
        .withArgs(GOLDEN_CARROT, 3);
      // Pulling one up does not give a planting back.
      await garden.connect(alice).uproot(0);
      await expect(garden.connect(alice).plant(0, GOLDEN_CARROT)).to.be.revertedWithCustomError(garden, "SeedDailyLimit");
      // Each seed and each player has its own count; free seeds have none.
      await garden.connect(alice).plant(3, BERRY);
      await expect(garden.connect(alice).plant(4, BERRY)).to.be.revertedWithCustomError(garden, "SeedDailyLimit");
      await garden.connect(bob).plant(0, BERRY);
      await garden.connect(alice).plantMany([4, 5, 6, 7, 8], HAY);

      await time.increase(24 * 3600);
      expect(await garden.plantedToday(alice.address, GOLDEN_CARROT)).to.equal(0);
      await garden.connect(alice).plant(0, GOLDEN_CARROT);
    });
  });

  describe("Squeek NFT plots", function () {
    it("opens plots 10-12 once a held Squeek is bound to the garden", async function () {
      const { garden, nft, alice, bob } = await loadFixture(deployGarden);
      expect(await garden.plotCount(alice.address)).to.equal(9);
      await expect(garden.connect(alice).plant(9, HAY)).to.be.revertedWithCustomError(garden, "NeedsSqueek");
      await nft.mint(alice.address); // token 1
      expect(await garden.hasSqueek(alice.address)).to.equal(false); // holding alone is not enough
      await expect(garden.connect(bob).bindSqueek(1)).to.be.revertedWithCustomError(garden, "NotSqueekOwner").withArgs(1);
      await expect(garden.connect(alice).bindSqueek(1)).to.emit(garden, "SqueekBound").withArgs(alice.address, 1);
      expect(await garden.hasSqueek(alice.address)).to.equal(true);
      expect(await garden.plotCount(alice.address)).to.equal(12);
      await garden.connect(alice).plant(11, HAY);
    });

    it("stops one Squeek passed between wallets from opening holder plots in many gardens", async function () {
      const { garden, core, nft, alice, bob } = await loadFixture(deployGarden);
      await nft.mint(alice.address); // token 1
      await garden.connect(alice).bindSqueek(1);
      await garden.connect(alice).plantMany([9, 10, 11], HAY);

      // Alice passes the NFT to Bob: her holder plots close, and his cannot open for 7 days.
      await nft.connect(alice).transferFrom(alice.address, bob.address, 1);
      expect(await garden.hasSqueek(alice.address)).to.equal(false);
      const bound = await time.latest();
      await expect(garden.connect(bob).bindSqueek(1)).to.be.revertedWithCustomError(garden, "SqueekMoveCooldown");
      expect(await garden.hasSqueek(bob.address)).to.equal(false);
      await expect(garden.connect(bob).plant(9, HAY)).to.be.revertedWithCustomError(garden, "NeedsSqueek");

      // Alice's crops on holder plots wait: no harvest without her Squeek.
      await core.run(800);
      await expect(garden.connect(alice).harvest(9)).to.be.revertedWithCustomError(garden, "NeedsSqueek");

      // Back in her wallet, it still counts for her garden and the crops can be picked.
      await nft.connect(bob).transferFrom(bob.address, alice.address, 1);
      expect(await garden.hasSqueek(alice.address)).to.equal(true);
      await garden.connect(alice).harvestMany([9, 10, 11]);

      // After 7 days it can move to Bob for real; then it no longer counts for Alice even if she gets it back.
      await nft.connect(alice).transferFrom(alice.address, bob.address, 1);
      await time.increaseTo(bound + 7 * 24 * 3600 + 1);
      await garden.connect(bob).bindSqueek(1);
      expect(await garden.hasSqueek(bob.address)).to.equal(true);
      await nft.connect(bob).transferFrom(bob.address, alice.address, 1);
      expect(await garden.hasSqueek(alice.address)).to.equal(false);
      expect(await garden.hasSqueek(bob.address)).to.equal(false);
      expect(await garden.squeekMovableAt(1)).to.be.greaterThan(0);
    });

    it("works without an NFT contract", async function () {
      const { core, sqk, treasury, alice } = await loadFixture(deployGarden);
      const garden = await ethers.deployContract("SqueekGarden", [core, sqk, ethers.ZeroAddress, treasury.address]);
      expect(await garden.hasSqueek(alice.address)).to.equal(false);
      await expect(garden.connect(alice).plant(9, HAY)).to.be.revertedWithCustomError(garden, "NeedsSqueek");
      await expect(garden.connect(alice).bindSqueek(1)).to.be.revertedWithCustomError(garden, "HolderPlotsOff");
    });

    it("lets the owner switch holder plots on later, and off again without losing plants", async function () {
      const { core, sqk, nft, treasury, alice } = await loadFixture(deployGarden);
      const garden = await ethers.deployContract("SqueekGarden", [core, sqk, ethers.ZeroAddress, treasury.address]);
      await nft.mint(alice.address);
      expect(await garden.plotCount(alice.address)).to.equal(9);
      await expect(garden.connect(alice).setSqueekNft(nft)).to.be.revertedWithCustomError(garden, "OwnableUnauthorizedAccount");
      await expect(garden.setSqueekNft(nft)).to.emit(garden, "SqueekNftSet").withArgs(await nft.getAddress());
      await garden.connect(alice).bindSqueek(1);
      expect(await garden.plotCount(alice.address)).to.equal(12);
      await garden.connect(alice).plant(9, HAY);
      await garden.setSqueekNft(ethers.ZeroAddress);
      expect(await garden.plotCount(alice.address)).to.equal(9);
      await expect(garden.connect(alice).plant(10, HAY)).to.be.revertedWithCustomError(garden, "NeedsSqueek");
      await core.run(800);
      await expect(garden.connect(alice).harvest(9)).to.be.revertedWithCustomError(garden, "NeedsSqueek");
      await garden.setSqueekNft(nft);
      await garden.connect(alice).harvest(9);
    });
  });

  describe("grow modes", function () {
    it("work plants grow only while the hamster runs", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, HAY);
      await core.nap(50);
      await time.increase(24 * 3600);
      await expect(garden.connect(alice).harvest(0)).to.be.revertedWithCustomError(garden, "NotRipe").withArgs(0, 0, 800);
      await core.run(800);
      await expect(garden.connect(alice).harvest(0)).to.emit(garden, "Harvested").withArgs(alice.address, 0, HAY, 8, false, 1);
      expect(await garden.points(alice.address)).to.equal(8);
    });

    it("block plants grow with Squeekchain blocks", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, BROCCOLI);
      await core.setState(45_000 + 1_000, 4_299, 510, 0);
      expect((await garden.plotStatus(alice.address, 0)).progress).to.equal(299);
      await core.setState(45_000 + 1_000, 4_300, 511, 0);
      const st = await garden.plotStatus(alice.address, 0);
      expect(st.ripe).to.equal(true);
      expect(st.value).to.equal(45);
    });

    it("nap plants grow with settled rounds while the hamster rests", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, CHAMOMILE);
      await core.nap(35);
      await expect(garden.connect(alice).harvest(0)).to.be.revertedWithCustomError(garden, "NotRipe");
      await core.nap(1);
      await expect(garden.connect(alice).harvest(0)).to.emit(garden, "Harvested").withArgs(alice.address, 0, CHAMOMILE, 35, false, 1);
    });

    it("nap plants wilt if the hamster runs too much, and can only be uprooted", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, CHAMOMILE);
      await core.nap(40);
      await core.run(301);
      const st = await garden.plotStatus(alice.address, 0);
      expect(st.wilted).to.equal(true);
      expect(st.ripe).to.equal(false);
      await expect(garden.connect(alice).harvest(0)).to.be.revertedWithCustomError(garden, "Wilted");
      await garden.connect(alice).uproot(0);
    });

    it("pays half for an overripe crop", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, SUNFLOWER);
      await core.run(7_000);
      await expect(garden.connect(alice).harvest(0)).to.emit(garden, "Harvested").withArgs(alice.address, 0, SUNFLOWER, 20, true, 1);
    });

    it("treats a counter reset as no growth", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, HAY);
      await core.setState(10, 1, 1, 0);
      const st = await garden.plotStatus(alice.address, 0);
      expect([st.progress, st.ripe]).to.deep.equal([0n, false]);
    });
  });

  describe("pantry and Moon Melon", function () {
    it("keeps Moon Melon locked until the shared pantry holds 150 snacks", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await expect(garden.connect(alice).plant(0, MOON_MELON))
        .to.be.revertedWithCustomError(garden, "SeedLocked")
        .withArgs(MOON_MELON, 0, 150);
      await fillPantry(garden, core, alice, 150);
      expect(await garden.pantrySnacks()).to.equal(150);
      await garden.connect(alice).plant(0, MOON_MELON);
    });

    it("harvests Moon Melon only right after the hamster has run", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await fillPantry(garden, core, alice, 150);
      await garden.connect(alice).plant(0, MOON_MELON);
      await core.run(6_000);
      await core.nap(5);
      await expect(garden.connect(alice).harvest(0)).to.be.revertedWithCustomError(garden, "NeedsFreshRun");
      await core.run(100);
      await expect(garden.connect(alice).harvest(0)).to.emit(garden, "Harvested");
      expect((await garden.stats(alice.address)).rareHarvests).to.equal(1);
    });
  });

  describe("levels", function () {
    it("comes quickly at first and then asks a little more per level", async function () {
      const { garden } = await loadFixture(deployLeveledGarden);
      const needed = [];
      for (let level = 1; level <= 12; level++) needed.push(await garden.pointsForLevel(level));
      expect(needed).to.deep.equal([0n, 30n, 100n, 250n, 600n, 1_800n, 4_000n, 7_500n, 12_000n, 18_000n, 26_000n, 34_000n]);
      for (let k = 2; k < needed.length; k++) {
        expect(needed[k] - needed[k - 1]).to.be.at.least(needed[k - 1] - needed[k - 2]); // each step at least as big
      }
      for (let level = 1; level <= 12; level++) {
        expect(await garden.levelFor(needed[level - 1])).to.equal(level);
        if (level > 1) expect(await garden.levelFor(needed[level - 1] - 1n)).to.equal(level - 1);
      }
    });

    it("matches the site's copy of the level table (web/src/levels.js)", async function () {
      const { garden } = await loadFixture(deployLeveledGarden);
      const web = await import(require("url").pathToFileURL(require("path").join(__dirname, "..", "web", "src", "levels.js")).href);
      for (let level = 1; level <= 25; level++) expect(BigInt(web.pointsForLevel(level))).to.equal(await garden.pointsForLevel(level));
      const samples = [0, 1, 29, 30, 99, 100, 599, 600, 1_799, 4_000, 17_999, 18_000, 25_999, 26_000, 1_000_000];
      for (const pts of samples) expect(BigInt(web.levelFor(pts))).to.equal(await garden.levelFor(pts));
    });

    it("opens one seed per level, up to Hamster Berry at level 8", async function () {
      const { garden } = await loadFixture(deployLeveledGarden);
      expect((await garden.seeds()).map((s) => s.level)).to.deep.equal([1n, 2n, 3n, 4n, 5n, 7n, 6n, 8n]);
    });

    it("lets a new gardener plant only hay, and Sunflower once hay has paid 30 points", async function () {
      const { garden, core, alice } = await loadFixture(deployLeveledGarden);
      expect(await garden.levelOf(alice.address)).to.equal(1);
      await expect(garden.connect(alice).plant(0, SUNFLOWER)).to.be.revertedWithCustomError(garden, "LevelTooLow").withArgs(SUNFLOWER, 2, 1);
      await expect(garden.connect(alice).plant(0, PUMPKIN)).to.be.revertedWithCustomError(garden, "LevelTooLow").withArgs(PUMPKIN, 5, 1);
      await fillPantry(garden, core, alice, 4); // 4 hays x 8 = 32 points
      expect(await garden.levelOf(alice.address)).to.equal(2);
      await garden.connect(alice).plant(0, SUNFLOWER);
      await expect(garden.connect(alice).plant(1, BROCCOLI)).to.be.revertedWithCustomError(garden, "LevelTooLow");
    });

    it("counts help points towards the level too", async function () {
      const { garden, core, alice, bob } = await loadFixture(deployLeveledGarden);
      await fillPantry(garden, core, alice, 3); // 24 points
      await garden.connect(bob).plant(0, HAY);
      await garden.connect(alice).helpWater(bob.address, 0); // +2
      await time.increase(86_400);
      await garden.connect(alice).helpWater(bob.address, 0); // +2 = 28
      expect(await garden.levelOf(alice.address)).to.equal(1);
      await time.increase(86_400);
      await garden.connect(alice).helpWater(bob.address, 0); // 30
      expect(await garden.levelOf(alice.address)).to.equal(2);
    });

    it("lets the owner move a seed to another level", async function () {
      const { garden, alice } = await loadFixture(deployLeveledGarden);
      await expect(garden.setSeedLevel(PUMPKIN, 1)).to.emit(garden, "SeedLevelSet").withArgs(PUMPKIN, 1);
      await garden.connect(alice).plant(0, PUMPKIN);
      await garden.setSeedLevel(HAY, 0); // 0 also means open from the start
      await garden.connect(alice).plant(1, HAY);
      await expect(garden.setSeedLevel(99, 1)).to.be.revertedWithCustomError(garden, "UnknownSeed");
    });
  });

  describe("harvest without roundPage", function () {
    it("still harvests seeds that do not need a fresh run", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await fillPantry(garden, core, alice, 150);
      await garden.connect(alice).plantMany([0, 1], HAY);
      await garden.connect(alice).plant(2, MOON_MELON);
      await core.run(6_000);
      await core.setPageDown(true);
      await garden.connect(alice).harvestMany([0, 1]);
      await expect(garden.connect(alice).harvest(2)).to.be.reverted;
      await core.setPageDown(false);
      await garden.connect(alice).harvest(2);
    });
  });

  describe("watering", function () {
    it("adds 10% per watering, up to three, one hour apart", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, SUNFLOWER);
      await garden.connect(alice).water(0);
      await expect(garden.connect(alice).water(0)).to.be.revertedWithCustomError(garden, "WaterCooldown");
      await time.increase(3600);
      await garden.connect(alice).water(0);
      await time.increase(3600);
      await garden.connect(alice).water(0);
      await time.increase(3600);
      await expect(garden.connect(alice).water(0)).to.be.revertedWithCustomError(garden, "TooManyWaterings");
      await core.run(3_500);
      await expect(garden.connect(alice).harvest(0)).to.emit(garden, "Harvested").withArgs(alice.address, 0, SUNFLOWER, 52, false, 1);
    });
  });

  describe("neighbours", function () {
    it("lets a neighbour water once a day: +5% for the crop, +2 points for the helper", async function () {
      const { garden, core, alice, bob } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, SUNFLOWER);
      await expect(garden.connect(bob).helpWater(alice.address, 0)).to.emit(garden, "Helped").withArgs(bob.address, alice.address, 0);
      expect(await garden.points(bob.address)).to.equal(2);
      expect((await garden.stats(bob.address)).helps).to.equal(1);
      await expect(garden.connect(bob).helpWater(alice.address, 0)).to.be.revertedWithCustomError(garden, "HelpLimit");
      await time.increase(24 * 3600);
      await garden.connect(bob).helpWater(alice.address, 0);
      await core.run(3_500);
      await expect(garden.connect(alice).harvest(0)).to.emit(garden, "Harvested").withArgs(alice.address, 0, SUNFLOWER, 44, false, 1);
    });

    it("refuses your own garden, empty plots and more than three helps per plant", async function () {
      const { garden, alice, bob, carol } = await loadFixture(deployGarden);
      await expect(garden.connect(alice).helpWater(alice.address, 0)).to.be.revertedWithCustomError(garden, "OwnGarden");
      await expect(garden.connect(bob).helpWater(alice.address, 0)).to.be.revertedWithCustomError(garden, "PlotEmpty");
      await garden.connect(alice).plant(0, SUNFLOWER);
      for (let d = 0; d < 3; d++) {
        await garden.connect(d % 2 ? carol : bob).helpWater(alice.address, 0);
        await time.increase(24 * 3600);
      }
      await expect(garden.connect(carol).helpWater(alice.address, 0)).to.be.revertedWithCustomError(garden, "HelpLimit");
    });

    it("caps a helper at ten waterings a day", async function () {
      const { garden, alice, bob } = await loadFixture(deployGarden);
      await garden.connect(alice).plantMany([...Array(9).keys()], HAY);
      const signers = await ethers.getSigners();
      const dave = signers[5];
      await garden.connect(dave).plantMany([0, 1], HAY);
      for (let i = 0; i < 9; i++) await garden.connect(bob).helpWater(alice.address, i);
      await garden.connect(bob).helpWater(dave.address, 0);
      await expect(garden.connect(bob).helpWater(dave.address, 1)).to.be.revertedWithCustomError(garden, "HelperDailyLimit");
    });
  });

  describe("nicknames and leaderboard", function () {
    it("sets, renames and frees nicknames", async function () {
      const { garden, alice, bob } = await loadFixture(deployGarden);
      await expect(garden.connect(alice).setNickname("squeeker_42")).to.emit(garden, "NicknameSet").withArgs(alice.address, "squeeker_42");
      expect(await garden.nicknameOf(alice.address)).to.equal("squeeker_42");
      await expect(garden.connect(bob).setNickname("squeeker_42")).to.be.revertedWithCustomError(garden, "NicknameTaken");
      await garden.connect(alice).setNickname("hay_queen");
      await garden.connect(bob).setNickname("squeeker_42");
      expect(await garden.nicknameOwner(ethers.keccak256(ethers.toUtf8Bytes("squeeker_42")))).to.equal(bob.address);
    });

    it("only accepts 3-16 lowercase letters, digits and underscores", async function () {
      const { garden, alice } = await loadFixture(deployGarden);
      for (const bad of ["ab", "a".repeat(17), "Squeeker", "has space", "emoji🐹", "dash-name"]) {
        await expect(garden.connect(alice).setNickname(bad)).to.be.revertedWithCustomError(garden, "BadNickname");
      }
    });

    it("lets the owner clear an offensive nickname", async function () {
      const { garden, alice, bob } = await loadFixture(deployGarden);
      await garden.connect(alice).setNickname("rude_name");
      await expect(garden.connect(bob).clearNickname(alice.address)).to.be.revertedWithCustomError(garden, "OwnableUnauthorizedAccount");
      await expect(garden.clearNickname(alice.address)).to.emit(garden, "NicknameBanned").withArgs("rude_name", true);
      expect(await garden.nicknameOf(alice.address)).to.equal("");
      // A cleared name is banned for everyone, the player who had it included, until the owner lifts the ban.
      await expect(garden.connect(bob).setNickname("rude_name")).to.be.revertedWithCustomError(garden, "NicknameTaken");
      await expect(garden.connect(alice).setNickname("rude_name")).to.be.revertedWithCustomError(garden, "NicknameTaken");
      await expect(garden.connect(bob).setNicknameBanned("rude_name", false)).to.be.revertedWithCustomError(garden, "OwnableUnauthorizedAccount");
      await garden.setNicknameBanned("rude_name", false);
      await garden.connect(bob).setNickname("rude_name");
      await garden.setNicknameBanned("another_bad", true);
      await expect(garden.connect(alice).setNickname("another_bad")).to.be.revertedWithCustomError(garden, "NicknameTaken");
    });

    it("pages players with their nickname and stats", async function () {
      const { garden, core, alice, bob } = await loadFixture(deployGarden);
      await garden.connect(alice).setNickname("alice");
      await garden.connect(alice).plant(0, HAY);
      await garden.connect(bob).helpWater(alice.address, 0);
      await core.run(800);
      await garden.connect(alice).harvest(0);
      const page = await garden.playersPage(0, 10);
      expect(page.map((p) => [p.player, p.nickname, p.points, p.harvests, p.helps])).to.deep.equal([
        [alice.address, "alice", 8n, 1n, 0n],
        [bob.address, "", 2n, 0n, 1n],
      ]);
      expect(await garden.playersPage(5, 10)).to.deep.equal([]);
    });
  });

  describe("referrals", function () {
    it("gives the inviter 10% of each harvest on top, carrying fractions over", async function () {
      const { garden, core, alice, bob } = await loadFixture(deployGarden);
      await garden.connect(alice).setNickname("alice");
      await expect(garden.connect(bob).setReferrer(alice.address)).to.emit(garden, "ReferrerSet").withArgs(bob.address, alice.address);
      expect(await garden.referrerOf(bob.address)).to.equal(alice.address);
      expect((await garden.stats(alice.address)).referrals).to.equal(1);

      // Sunflower pays 40: Alice gets 4 on top, Bob keeps all 40.
      await garden.connect(bob).plant(0, SUNFLOWER);
      await core.run(3500);
      await expect(garden.connect(bob).harvest(0)).to.emit(garden, "ReferralBonus").withArgs(alice.address, bob.address, 4);
      expect(await garden.points(bob.address)).to.equal(40);
      expect(await garden.points(alice.address)).to.equal(4);

      // Hay pays 8: 0.8 each, so the first harvest pays nothing and the second pays 1 (0.6 carried).
      await garden.connect(bob).plant(1, HAY);
      await core.run(800);
      await expect(garden.connect(bob).harvest(1)).not.to.emit(garden, "ReferralBonus");
      await garden.connect(bob).plant(1, HAY);
      await core.run(800);
      await expect(garden.connect(bob).harvest(1)).to.emit(garden, "ReferralBonus").withArgs(alice.address, bob.address, 1);
      const a = await garden.stats(alice.address);
      expect([a.points, a.referralPoints, a.referrals]).to.deep.equal([5n, 5n, 1n]);

      const page = await garden.playersPage(0, 10);
      const row = page.find((p) => p.player === alice.address);
      expect([row.referrals, row.referralPoints]).to.deep.equal([1n, 5n]);
    });

    it("refuses self, unknown, circular, late and repeated invites", async function () {
      const { garden, core, alice, bob, carol } = await loadFixture(deployGarden);
      await expect(garden.connect(bob).setReferrer(bob.address)).to.be.revertedWithCustomError(garden, "BadReferrer");
      await expect(garden.connect(bob).setReferrer(alice.address)).to.be.revertedWithCustomError(garden, "BadReferrer"); // not a gardener yet
      await expect(garden.connect(bob).setReferrer(ethers.ZeroAddress)).to.be.revertedWithCustomError(garden, "BadReferrer");
      await garden.connect(alice).setNickname("alice");
      await garden.connect(bob).setReferrer(alice.address);
      await expect(garden.connect(bob).setReferrer(alice.address)).to.be.revertedWithCustomError(garden, "ReferrerAlreadySet");
      await expect(garden.connect(alice).setReferrer(bob.address)).to.be.revertedWithCustomError(garden, "BadReferrer"); // no loops
      await garden.connect(carol).plant(0, HAY);
      await core.run(800);
      await garden.connect(carol).harvest(0);
      await expect(garden.connect(carol).setReferrer(alice.address)).to.be.revertedWithCustomError(garden, "ReferrerTooLate");
    });
  });

  describe("core switch", function () {
    it("keeps growing plants' progress when the owner moves to a new SqueekCore", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, HAY); // needs 800 work
      await garden.connect(alice).plant(1, BROCCOLI); // needs 300 blocks
      await core.run(500); // 500 work, 45 blocks on the old core

      const fresh = await ethers.deployContract("MockSqueekCore");
      await fresh.setState(20, 3, 7, 0); // a reinstalled core starts near zero
      await expect(garden.setCore(fresh)).to.emit(garden, "CoreSet").withArgs(await fresh.getAddress(), 45_500, 4_045, 501);
      expect(await garden.core()).to.equal(await fresh.getAddress());
      let [r] = await garden.readings();
      expect([r.work, r.blockHeight, r.settledRound]).to.deep.equal([45_500n, 4_045n, 501n]);

      await expect(garden.connect(alice).harvest(0)).to.be.revertedWithCustomError(garden, "NotRipe");
      await fresh.run(300); // 800 work in all
      [r] = await garden.readings();
      expect(r.work).to.equal(45_800n);
      await expect(garden.connect(alice).harvest(0)).to.emit(garden, "Harvested");
      expect((await garden.plotStatus(alice.address, 1)).progress).to.equal(45n + 27n);

      // New plants simply start from the garden readings.
      await garden.connect(alice).plant(0, HAY);
      expect((await garden.garden(alice.address))[0].plantedWork).to.equal(45_800n);
    });

    it("stays continuous over several switches and refuses non-owners and bad addresses", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, HAY);
      const b = await ethers.deployContract("MockSqueekCore");
      await b.setState(1_000, 0, 0, 0);
      await garden.setCore(b);
      await b.run(400);
      const c = await ethers.deployContract("MockSqueekCore");
      await garden.setCore(c);
      await c.run(400);
      expect((await garden.plotStatus(alice.address, 0)).ripe).to.equal(true);

      await expect(garden.connect(alice).setCore(core)).to.be.revertedWithCustomError(garden, "OwnableUnauthorizedAccount");
      await expect(garden.setCore(ethers.ZeroAddress)).to.be.revertedWithCustomError(garden, "ZeroAddress");
      const [, carried] = await garden.coreMapping();
      expect(carried.work).to.equal(45_400n);
    });

    it("lets the owner switch the SQK token paid seeds use", async function () {
      const { garden, alice, treasury } = await loadFixture(deployGarden);
      const sqk2 = await ethers.deployContract("MockSQK");
      await expect(garden.setSqk(sqk2)).to.emit(garden, "SqkSet");
      await sqk2.mint(alice.address, 100n * SQK);
      await sqk2.connect(alice).approve(garden, 100n * SQK);
      await expect(garden.connect(alice).plant(0, GOLDEN_CARROT)).to.changeTokenBalances(sqk2, [alice, treasury], [-100n * SQK, 100n * SQK]);
      await expect(garden.connect(alice).setSqk(sqk2)).to.be.revertedWithCustomError(garden, "OwnableUnauthorizedAccount");
    });
  });

  describe("uprooting and admin", function () {
    it("uproots without points", async function () {
      const { garden, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(3, SUNFLOWER);
      await expect(garden.connect(alice).uproot(3)).to.emit(garden, "Uprooted").withArgs(alice.address, 3, SUNFLOWER);
      await expect(garden.connect(alice).uproot(3)).to.be.revertedWithCustomError(garden, "PlotEmpty");
    });

    it("only lets the owner add seeds and move the treasury", async function () {
      const { garden, alice } = await loadFixture(deployGarden);
      const seed = ["Weed", 0, 1, 0, 1, 0, 1, 0, 0, false, false, true];
      await expect(garden.connect(alice).addSeed(seed)).to.be.revertedWithCustomError(garden, "OwnableUnauthorizedAccount");
      await expect(garden.connect(alice).setTreasury(alice.address)).to.be.revertedWithCustomError(garden, "OwnableUnauthorizedAccount");
      await expect(garden.connect(alice).setSeedLevel(HAY, 3)).to.be.revertedWithCustomError(garden, "OwnableUnauthorizedAccount");
      await expect(garden.addSeed(["Instant", 0, 0, 0, 1, 0, 1, 0, 0, false, false, true])).to.be.revertedWithCustomError(garden, "ZeroGrowAmount");
      await garden.addSeed(seed);
      expect(await garden.seedCount()).to.equal(9);
      expect((await garden.seed(9)).name).to.equal("Weed");
      await expect(garden.seed(0)).to.be.revertedWithCustomError(garden, "UnknownSeed");
    });

    it("moves the treasury, and paid seeds pay the new one", async function () {
      const { garden, sqk, alice, bob, treasury } = await loadFixture(deployGarden);
      await expect(garden.setTreasury(ethers.ZeroAddress)).to.be.revertedWithCustomError(garden, "ZeroAddress");
      await expect(garden.setTreasury(bob.address)).to.emit(garden, "TreasurySet").withArgs(bob.address);
      await sqk.mint(alice.address, 100n * SQK);
      await sqk.connect(alice).approve(garden, 100n * SQK);
      await expect(garden.connect(alice).plant(0, GOLDEN_CARROT)).to.changeTokenBalances(sqk, [alice, bob, treasury], [-100n * SQK, 100n * SQK, 0]);
    });

    it("refuses a zero core, SQK or treasury at deployment", async function () {
      const { core, sqk, nft, treasury } = await loadFixture(deployGarden);
      const Garden = await ethers.getContractFactory("SqueekGarden");
      for (const args of [
        [ethers.ZeroAddress, sqk, nft, treasury.address],
        [core, ethers.ZeroAddress, nft, treasury.address],
        [core, sqk, nft, ethers.ZeroAddress],
      ]) {
        await expect(Garden.deploy(...args)).to.be.revertedWithCustomError(Garden, "ZeroAddress");
      }
      await Garden.deploy(core, sqk, ethers.ZeroAddress, treasury.address); // no NFT collection is fine: holder plots off
    });
  });

  describe("small views and batches", function () {
    it("waters several plants in one go and reports empty plots as empty", async function () {
      const { garden, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plantMany([0, 1, 2], HAY);
      await garden.connect(alice).waterMany([0, 1, 2]);
      const plots = await garden.garden(alice.address);
      expect(plots.slice(0, 3).map((p) => p.waterings)).to.deep.equal([1n, 1n, 1n]);
      await expect(garden.connect(alice).waterMany([0, 5])).to.be.revertedWithCustomError(garden, "WaterCooldown");
      expect(await garden.plotStatus(alice.address, 5)).to.deep.equal([0n, 0n, false, false, false, 0n]);
    });

    it("tells when a Squeek can move to another garden", async function () {
      const { garden, nft, alice } = await loadFixture(deployGarden);
      const tokenId = await nft.mint.staticCall(alice.address);
      await nft.mint(alice.address);
      expect(await garden.squeekMovableAt(tokenId)).to.equal(0); // never bound
      await garden.connect(alice).bindSqueek(tokenId);
      const readyAt = await garden.squeekMovableAt(tokenId);
      expect(readyAt).to.equal(BigInt(await time.latest()) + 7n * 86_400n);
      await time.increaseTo(readyAt);
      expect(await garden.squeekMovableAt(tokenId)).to.equal(0); // cooldown over
    });

    it("refuses binding while holder plots are off, and a zero SQK token", async function () {
      const { garden, alice } = await loadFixture(deployGarden);
      await garden.setSqueekNft(ethers.ZeroAddress);
      await expect(garden.connect(alice).bindSqueek(1)).to.be.revertedWithCustomError(garden, "HolderPlotsOff");
      await expect(garden.setSqk(ethers.ZeroAddress)).to.be.revertedWithCustomError(garden, "ZeroAddress");
    });

    it("counts block plants as not grown when the block counter falls below the planting", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, BROCCOLI); // planted at block 4,000
      await core.setState(45_000, 3_000, 500, 0);
      expect((await garden.plotStatus(alice.address, 0)).progress).to.equal(0n);
    });

    it("checks the fresh run from round 0 while fewer than three rounds have settled", async function () {
      const { garden, core } = await loadFixture(deployGarden);
      await core.setState(1_000, 10, 2, 0);
      const [, recentWork] = await garden.readings();
      expect(recentWork).to.equal(0n);
    });
  });
});
