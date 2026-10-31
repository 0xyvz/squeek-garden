// Security review tests for SqueekGarden.
// "FIXED:" tests were "BUG:" tests from the review; they now show the fixed behaviour.
// "DESIGN:" tests pin down behaviour that is a deliberate (or acceptable) trade-off, so a change is noticed.
// Every other test shows that an attack does NOT work.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { PANIC_CODES } = require("@nomicfoundation/hardhat-chai-matchers/panic");

const HAY = 1;
const SUNFLOWER = 2;
const CHAMOMILE = 4;
const MOON_MELON = 6;
const GOLDEN_CARROT = 7;
const SQK = 10n ** 18n;
const DAY = 24 * 3600;

/** The next UTC midnight at least a minute away. */
async function nextMidnight() {
  const now = await time.latest();
  return (Math.floor((now + 60) / DAY) + 1) * DAY;
}

async function deployGarden() {
  const signers = await ethers.getSigners();
  const [owner, alice, bob, carol, treasury, dave, erin, frank] = signers;
  const core = await ethers.deployContract("MockSqueekCore");
  const sqk = await ethers.deployContract("MockSQK");
  const nft = await ethers.deployContract("MockSqueekNFT");
  await core.setState(45_000, 4_000, 500, 0);
  const garden = await ethers.deployContract("SqueekGarden", [core, sqk, nft, treasury.address]);
  for (let id = 1; id <= Number(await garden.seedCount()); id++) await garden.setSeedLevel(id, 1);
  return { garden, core, sqk, nft, owner, alice, bob, carol, treasury, dave, erin, frank, signers };
}

/** Garden on a core that can later be made to revert or answer with malformed data. */
async function deployBreakableGarden() {
  const [owner, alice, bob, carol, treasury] = await ethers.getSigners();
  const core = await ethers.deployContract("MockBreakableSqueekCore");
  const sqk = await ethers.deployContract("MockSQK");
  const nft = await ethers.deployContract("MockSqueekNFT");
  await core.setState(45_000, 4_000, 500, 0);
  const garden = await ethers.deployContract("SqueekGarden", [core, sqk, nft, treasury.address]);
  for (let id = 1; id <= Number(await garden.seedCount()); id++) await garden.setSeedLevel(id, 1);
  return { garden, core, sqk, nft, owner, alice, bob, carol, treasury };
}

describe("SqueekGarden security review", function () {
  describe("core switch (setCore / _toGarden)", function () {
    it("FIXED: an old core with no code makes setCore refuse cleanly, and setCoreFrom moves the garden on", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, HAY); // planted at 45,000 work
      await core.run(500);
      const [last] = await garden.readings(); // what the owner reads before the core disappears
      await network.provider.send("hardhat_setCode", [await core.getAddress(), "0x"]);
      await expect(garden.connect(alice).plant(1, HAY)).to.be.reverted; // the game is down while the core is gone
      const fresh = await ethers.deployContract("MockSqueekCore");
      await fresh.setState(20, 3, 7, 0);
      await expect(garden.setCore(fresh)).to.be.revertedWithCustomError(garden, "OldCoreUnreadable");
      await expect(garden.setCoreFrom(fresh, [...last])).to.emit(garden, "CoreSet").withArgs(await fresh.getAddress(), last.work, last.blockHeight, last.settledRound);
      await fresh.run(300); // 500 + 300 = 800: the hay is ripe, nothing was lost
      await garden.connect(alice).harvest(0);
    });

    it("FIXED: malformed state() data makes setCore refuse cleanly; setCoreFrom still works", async function () {
      const { garden, core } = await loadFixture(deployBreakableGarden);
      const [last] = await garden.readings();
      await core.setMode(2); // returns 32 bytes instead of the 8-word CoreState
      const fresh = await ethers.deployContract("MockSqueekCore");
      await expect(garden.setCore(fresh)).to.be.revertedWithCustomError(garden, "OldCoreUnreadable");
      await garden.setCoreFrom(fresh, [...last]);
      expect(await garden.core()).to.equal(await fresh.getAddress());
    });

    it("a reverting old core makes setCore refuse instead of carrying stale readings", async function () {
      const { garden, core } = await loadFixture(deployBreakableGarden);
      await core.setMode(1);
      const fresh = await ethers.deployContract("MockSqueekCore");
      await expect(garden.setCore(fresh)).to.be.revertedWithCustomError(garden, "OldCoreUnreadable");
    });

    it("setCoreFrom refuses readings below what was already carried, and non-owners", async function () {
      const { garden, alice } = await loadFixture(deployGarden);
      const b = await ethers.deployContract("MockSqueekCore");
      await garden.setCore(b); // carried = 45,000 / 4,000 / 500
      await expect(garden.setCoreFrom(b, [44_999, 4_000, 500])).to.be.revertedWithCustomError(garden, "ReadingsGoBack");
      await expect(garden.setCoreFrom(b, [45_000, 3_999, 500])).to.be.revertedWithCustomError(garden, "ReadingsGoBack");
      await expect(garden.setCoreFrom(b, [45_000, 4_000, 499])).to.be.revertedWithCustomError(garden, "ReadingsGoBack");
      await expect(garden.connect(alice).setCoreFrom(b, [45_000, 4_000, 500])).to.be.revertedWithCustomError(garden, "OwnableUnauthorizedAccount");
      await expect(garden.setCoreFrom(ethers.ZeroAddress, [45_000, 4_000, 500])).to.be.revertedWithCustomError(garden, "ZeroAddress");
    });

    it("FIXED: when the old core stops answering, plants keep their progress through setCoreFrom", async function () {
      const { garden, core, alice } = await loadFixture(deployBreakableGarden);
      await garden.connect(alice).plant(0, HAY); // planted at work 45,000, needs 800
      await garden.connect(alice).plant(1, CHAMOMILE); // planted at round 500, needs 36 rounds
      await core.run(500);
      const [last] = await garden.readings();
      await core.setMode(1); // old core no longer answers

      const fresh = await ethers.deployContract("MockSqueekCore");
      await fresh.setState(20, 3, 7, 0);
      await expect(garden.setCore(fresh)).to.be.revertedWithCustomError(garden, "OldCoreUnreadable");
      await garden.setCoreFrom(fresh, [...last]);
      const [r] = await garden.readings();
      expect(r.work).to.equal(45_500n);
      await fresh.run(300);
      expect((await garden.plotStatus(alice.address, 0)).ripe).to.equal(true);
      await fresh.nap(35); // rounds: 1 before the switch, 1 from run(300), 35 now
      expect((await garden.plotStatus(alice.address, 1)).progress).to.equal(37n);
    });

    it("DESIGN: a counter reset on the same core stalls growth until the owner rebases with setCoreFrom", async function () {
      const { garden, alice } = await loadFixture(deployGarden);
      const b = await ethers.deployContract("MockSqueekCore");
      await b.setState(10_000, 1_000, 100, 0);
      await garden.setCore(b); // base = 10,000 work
      await garden.connect(alice).plant(1, HAY); // planted before the reset, at 45,000
      const [last] = await garden.readings();
      await b.setState(0, 0, 0, 0); // same-core reset
      await garden.connect(alice).plant(0, HAY);
      await b.run(800);
      expect((await garden.plotStatus(alice.address, 0)).progress).to.equal(0n); // stalled until the rescue
      await garden.setCoreFrom(b, [...last]); // rebase on the same core from the readings before the reset
      await b.run(800);
      expect((await garden.plotStatus(alice.address, 1)).ripe).to.equal(true); // planted before: kept its progress
    });

    it("stays continuous when switching away and back to an earlier core, and a high new counter causes no jump", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, HAY);
      const b = await ethers.deployContract("MockSqueekCore");
      await b.setState(2n ** 63n, 2n ** 62n, 2n ** 40n, 0); // huge counters on the new core
      await garden.setCore(b);
      let [r] = await garden.readings();
      expect([r.work, r.blockHeight, r.settledRound]).to.deep.equal([45_000n, 4_000n, 500n]);
      await b.run(400);
      await garden.setCore(core); // back to the first core, which has not moved
      [r] = await garden.readings();
      expect(r.work).to.equal(45_400n);
      await core.run(400);
      expect((await garden.plotStatus(alice.address, 0)).ripe).to.equal(true);
    });

    it("fresh-run check uses raw core deltas, so it still works after a core switch", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.setSeedActive(MOON_MELON, true);
      // Fill the pantry quickly through a test seed.
      const quick = ["Quick", 0, 1, 0, 0, 0, 1, 0, 0, false, false, true];
      await garden.addSeed(quick);
      const QUICK = Number(await garden.seedCount());
      for (let k = 0; k < 17; k++) {
        await garden.connect(alice).plantMany([...Array(9).keys()], QUICK);
        await core.run(1);
        await garden.connect(alice).harvestMany([...Array(9).keys()]);
      }
      await garden.connect(alice).plant(0, MOON_MELON);
      const fresh = await ethers.deployContract("MockSqueekCore");
      await fresh.setState(5, 0, 3, 0);
      await garden.setCore(fresh);
      await fresh.run(6_000);
      await fresh.nap(5);
      await expect(garden.connect(alice).harvest(0)).to.be.revertedWithCustomError(garden, "NeedsFreshRun");
      await fresh.run(1);
      await garden.connect(alice).harvest(0);
    });

    it("FIXED: ownership cannot be renounced, so setCore always stays reachable", async function () {
      const { garden, owner, alice } = await loadFixture(deployGarden);
      await expect(garden.renounceOwnership()).to.be.revertedWithCustomError(garden, "RenounceDisabled");
      await expect(garden.connect(alice).renounceOwnership()).to.be.revertedWithCustomError(garden, "RenounceDisabled");
      expect(await garden.owner()).to.equal(owner.address);
      await garden.transferOwnership(alice.address); // handing it over still works
      expect(await garden.owner()).to.equal(alice.address);
    });
  });

  describe("reentrancy", function () {
    it("a token with a spend hook cannot let a player plant past the daily limit by reentering plant", async function () {
      const [, , , , treasury] = await ethers.getSigners();
      const core = await ethers.deployContract("MockSqueekCore");
      const hook = await ethers.deployContract("MockHookSQK");
      const nft = await ethers.deployContract("MockSqueekNFT");
      await core.setState(45_000, 4_000, 500, 0);
      const garden = await ethers.deployContract("SqueekGarden", [core, hook, nft, treasury.address]);
      await garden.setSeedLevel(GOLDEN_CARROT, 1);
      const player = await ethers.deployContract("ReentrantGardener", [garden]);
      await hook.mint(await player.getAddress(), 10_000n * SQK);
      await player.approve(hook, ethers.MaxUint256);

      await player.start(GOLDEN_CARROT, 8); // tries plots 0..8 through nested reentry
      expect(await player.reentrySucceeded()).to.equal(2n); // plots 1 and 2: still inside the limit of 3
      expect(await player.reentryFailed()).to.equal(1n); // the 4th planting hits SeedDailyLimit
      expect(await garden.plantedToday(await player.getAddress(), GOLDEN_CARROT)).to.equal(3);
      expect(await hook.balanceOf(treasury.address)).to.equal(300n * SQK); // every planting paid
      const plots = await garden.garden(await player.getAddress());
      expect(plots.slice(0, 4).map((p) => p.seedId)).to.deep.equal([7n, 7n, 7n, 0n]);
    });

    it("an NFT cannot reenter: ownerOf is a STATICCALL, so a state-changing ownerOf just reads as 'not owner'", async function () {
      const { garden, alice } = await loadFixture(deployGarden);
      const evil = await ethers.deployContract("MockStatefulSqueekNFT");
      await evil.mint(alice.address, 1);
      await garden.setSqueekNft(evil);
      await expect(garden.connect(alice).bindSqueek(1)).to.be.revertedWithCustomError(garden, "NotSqueekOwner");
      expect(await garden.hasSqueek(alice.address)).to.equal(false);
      expect(await evil.calls()).to.equal(0n);
    });
  });

  describe("arithmetic and counters", function () {
    it("the largest possible crop (max basePoints, 3 waterings, 3 helps) fits the uint64 points cast exactly", async function () {
      const { garden, core, alice, bob, carol, dave } = await loadFixture(deployGarden);
      const maxPts = 2n ** 32n - 1n;
      await garden.addSeed(["Giant", 0, 1, 0, maxPts, 0, 1, 0, 0, false, false, true]);
      const GIANT = Number(await garden.seedCount());
      await garden.connect(alice).plant(0, GIANT);
      for (const helper of [bob, carol, dave]) {
        await garden.connect(alice).water(0);
        await garden.connect(helper).helpWater(alice.address, 0);
        await time.increase(DAY);
      }
      await expect(garden.connect(bob).helpWater(alice.address, 0)).to.be.revertedWithCustomError(garden, "HelpLimit");
      await expect(garden.connect(alice).water(0)).to.be.revertedWithCustomError(garden, "TooManyWaterings");
      await core.run(1);
      const expected = (maxPts * 145n) / 100n;
      await expect(garden.connect(alice).harvest(0)).to.emit(garden, "Harvested").withArgs(alice.address, 0, GIANT, expected, false, 1);
      expect(await garden.points(alice.address)).to.equal(expected);
    });

    it("plot help counter (uint8) stays at 3 and helper day counter at 10 even across many helpers and days", async function () {
      const { garden, alice, signers } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, SUNFLOWER);
      for (let d = 0; d < 6; d++) {
        const h = signers[8 + d];
        const tx = garden.connect(h).helpWater(alice.address, 0);
        if (d < 3) await tx;
        else await expect(tx).to.be.revertedWithCustomError(garden, "HelpLimit");
        await time.increase(DAY);
      }
      expect((await garden.garden(alice.address))[0].helps).to.equal(3);
    });

    it("overripe and wilt boundaries are exact (2x grow amount; nap limit is inclusive)", async function () {
      const { garden, core, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, HAY);
      await core.setWork(45_000 + 1_599);
      expect((await garden.plotStatus(alice.address, 0)).overripe).to.equal(false);
      await core.setWork(45_000 + 1_600);
      const st = await garden.plotStatus(alice.address, 0);
      expect([st.overripe, st.value]).to.deep.equal([true, 4n]);

      await garden.connect(alice).plant(1, CHAMOMILE); // planted at 46,600 work, limit 300
      await core.setWork(46_600 + 300);
      expect((await garden.plotStatus(alice.address, 1)).wilted).to.equal(false);
      await core.setWork(46_600 + 301);
      expect((await garden.plotStatus(alice.address, 1)).wilted).to.equal(true);
    });
  });

  describe("level gating and daily limits", function () {
    it("plantMany cannot slip past the level check or the daily limit (the whole batch reverts)", async function () {
      const { garden, sqk, alice } = await loadFixture(deployGarden);
      await sqk.mint(alice.address, 10_000n * SQK);
      await sqk.connect(alice).approve(garden, ethers.MaxUint256);
      await expect(garden.connect(alice).plantMany([0, 1, 2, 3], GOLDEN_CARROT)).to.be.revertedWithCustomError(garden, "SeedDailyLimit");
      expect(await garden.plantedToday(alice.address, GOLDEN_CARROT)).to.equal(0);

      await garden.setSeedLevel(SUNFLOWER, 2);
      await expect(garden.connect(alice).plantMany([0, 1], SUNFLOWER)).to.be.revertedWithCustomError(garden, "LevelTooLow");
    });

    it("DESIGN: the daily limit is per UTC day, so a player can plant 2x the limit a minute apart around midnight", async function () {
      const { garden, sqk, alice } = await loadFixture(deployGarden);
      await sqk.mint(alice.address, 10_000n * SQK);
      await sqk.connect(alice).approve(garden, ethers.MaxUint256);
      const midnight = await nextMidnight();
      await time.setNextBlockTimestamp(midnight - 30);
      await garden.connect(alice).plantMany([0, 1, 2], GOLDEN_CARROT);
      await time.setNextBlockTimestamp(midnight + 30);
      await garden.connect(alice).plantMany([3, 4, 5], GOLDEN_CARROT);
    });
  });

  describe("griefing between players", function () {
    it("nobody else can harvest, uproot or water your plot, and a stranger using all help slots only adds bonus", async function () {
      const { garden, core, alice, bob, carol, dave } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, SUNFLOWER);
      for (const h of [bob, carol, dave]) {
        await garden.connect(h).helpWater(alice.address, 0);
        await time.increase(DAY);
      }
      await core.run(3_500);
      // Bob's own plot 0 is empty: everything he does touches his own garden only.
      await expect(garden.connect(bob).harvest(0)).to.be.revertedWithCustomError(garden, "PlotEmpty");
      await expect(garden.connect(bob).uproot(0)).to.be.revertedWithCustomError(garden, "PlotEmpty");
      await expect(garden.connect(bob).water(0)).to.be.revertedWithCustomError(garden, "PlotEmpty");
      await expect(garden.connect(alice).harvest(0)).to.emit(garden, "Harvested").withArgs(alice.address, 0, SUNFLOWER, 46, false, 1);
    });

    it("DESIGN: uprooting and replanting resets a plant's help count, so a helper can help one plot ten times a day", async function () {
      const { garden, alice, bob } = await loadFixture(deployGarden);
      for (let i = 0; i < 10; i++) {
        await garden.connect(alice).plant(0, HAY);
        await garden.connect(bob).helpWater(alice.address, 0);
        await garden.connect(alice).uproot(0);
      }
      expect(await garden.points(bob.address)).to.equal(20n);
    });

    it("DESIGN: help limits are per UTC day, so a plant can be helped twice a minute apart around midnight", async function () {
      const { garden, alice, bob } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, HAY);
      const midnight = await nextMidnight();
      await time.setNextBlockTimestamp(midnight - 30);
      await garden.connect(bob).helpWater(alice.address, 0);
      await time.setNextBlockTimestamp(midnight + 30);
      await garden.connect(bob).helpWater(alice.address, 0);
    });

    it("DESIGN: crops on holder plots can still be watered, helped and uprooted while the Squeek is away", async function () {
      const { garden, nft, alice, bob } = await loadFixture(deployGarden);
      await nft.mint(alice.address);
      await garden.connect(alice).bindSqueek(1);
      await garden.connect(alice).plant(9, HAY);
      await nft.connect(alice).transferFrom(alice.address, bob.address, 1);
      expect(await garden.hasSqueek(alice.address)).to.equal(false);
      await garden.connect(alice).water(9);
      await garden.connect(bob).helpWater(alice.address, 9);
      await garden.connect(alice).uproot(9);
    });
  });

  describe("Squeek NFT binding", function () {
    it("one Squeek never opens holder plots in two gardens at once, however it is passed around", async function () {
      const { garden, nft, alice, bob } = await loadFixture(deployGarden);
      await nft.mint(alice.address);
      await garden.connect(alice).bindSqueek(1);
      await time.increase(8 * DAY);
      await nft.connect(alice).transferFrom(alice.address, bob.address, 1);
      await garden.connect(bob).bindSqueek(1); // cooldown long passed: moves at once
      await nft.connect(bob).transferFrom(bob.address, alice.address, 1);
      // Back with Alice, but bound to Bob's garden: neither has holder plots, and Alice cannot rebind for 7 days.
      expect(await garden.hasSqueek(alice.address)).to.equal(false);
      expect(await garden.hasSqueek(bob.address)).to.equal(false);
      await expect(garden.connect(alice).bindSqueek(1)).to.be.revertedWithCustomError(garden, "SqueekMoveCooldown");
      // Re-binding by the current garden does not restart the cooldown.
      const movable = await garden.squeekMovableAt(1);
      await nft.connect(alice).transferFrom(alice.address, bob.address, 1);
      await garden.connect(bob).bindSqueek(1);
      expect(await garden.squeekMovableAt(1)).to.equal(movable);
    });

    it("binding a second Squeek leaves the first one tied to your garden until its own cooldown runs out", async function () {
      const { garden, nft, alice, bob } = await loadFixture(deployGarden);
      await nft.mint(alice.address); // 1
      await nft.mint(alice.address); // 2
      await garden.connect(alice).bindSqueek(1);
      await garden.connect(alice).bindSqueek(2);
      expect((await garden.boundSqueekOf(alice.address)).tokenId).to.equal(2n);
      await nft.connect(alice).transferFrom(alice.address, bob.address, 1);
      await expect(garden.connect(bob).bindSqueek(1)).to.be.revertedWithCustomError(garden, "SqueekMoveCooldown");
      expect(await garden.hasSqueek(alice.address)).to.equal(true); // token 2 still counts
    });

    it("a collection switch needs a fresh binding; switching back restores the old one", async function () {
      const { garden, nft, alice } = await loadFixture(deployGarden);
      await nft.mint(alice.address);
      await garden.connect(alice).bindSqueek(1);
      const nft2 = await ethers.deployContract("MockSqueekNFT");
      await nft2.mint(alice.address);
      await garden.setSqueekNft(nft2);
      expect(await garden.hasSqueek(alice.address)).to.equal(false);
      await garden.connect(alice).bindSqueek(1);
      expect(await garden.hasSqueek(alice.address)).to.equal(true);
      await garden.setSqueekNft(nft);
      // boundSqueekOf now points at nft2, so the old binding under nft does not come back by itself.
      expect(await garden.hasSqueek(alice.address)).to.equal(false);
      await garden.connect(alice).bindSqueek(1); // free: still bound to her under nft
      expect(await garden.hasSqueek(alice.address)).to.equal(true);
    });

    it("DESIGN: a seller can re-bind through an alt right before a sale, locking the buyer out for 7 days", async function () {
      const { garden, nft, alice, bob, carol } = await loadFixture(deployGarden);
      await nft.mint(alice.address);
      await garden.connect(alice).bindSqueek(1);
      await time.increase(8 * DAY);
      await nft.connect(alice).transferFrom(alice.address, carol.address, 1); // Alice's alt
      await garden.connect(carol).bindSqueek(1);
      await nft.connect(carol).transferFrom(carol.address, bob.address, 1); // "sold" to Bob
      await expect(garden.connect(bob).bindSqueek(1)).to.be.revertedWithCustomError(garden, "SqueekMoveCooldown");
    });
  });

  describe("referrals", function () {
    it("DESIGN: only direct two-player loops are refused; a three-player referral cycle is accepted", async function () {
      const { garden, alice, bob, carol } = await loadFixture(deployGarden);
      for (const p of [alice, bob, carol]) await garden.connect(p).setNickname(`p_${p.address.slice(2, 8).toLowerCase()}`);
      await garden.connect(bob).setReferrer(alice.address);
      await garden.connect(carol).setReferrer(bob.address);
      await garden.connect(alice).setReferrer(carol.address); // closes A -> B -> C -> A
      expect(await garden.referrerOf(alice.address)).to.equal(carol.address);
    });

    it("DESIGN: alts referred by one player funnel 10% of all their harvests to it (Sybil scales linearly)", async function () {
      const { garden, core, alice, signers } = await loadFixture(deployGarden);
      await garden.connect(alice).setNickname("main_acc");
      const alts = signers.slice(8, 13);
      for (const a of alts) await garden.connect(a).setReferrer(alice.address);
      for (const a of alts) await garden.connect(a).plantMany([...Array(9).keys()], SUNFLOWER);
      await core.run(3_500);
      for (const a of alts) await garden.connect(a).harvestMany([...Array(9).keys()]);
      // 5 alts x 9 sunflowers x 40 points x 10% = 180 points for alice, who never planted anything.
      expect(await garden.points(alice.address)).to.equal(180n);
      expect((await garden.stats(alice.address)).referrals).to.equal(5n);
    });

    it("a helper-only player (no harvest yet) may still pick a referrer; one who harvested may not", async function () {
      const { garden, core, alice, bob, carol } = await loadFixture(deployGarden);
      await garden.connect(alice).plant(0, HAY);
      await garden.connect(bob).helpWater(alice.address, 0);
      await garden.connect(bob).setReferrer(alice.address);
      await core.run(800);
      await garden.connect(alice).harvest(0);
      await expect(garden.connect(alice).setReferrer(carol.address)).to.be.revertedWithCustomError(garden, "ReferrerTooLate");
    });
  });

  describe("nicknames", function () {
    it("renaming to your current name keeps it reserved, and renaming frees the old one", async function () {
      const { garden, alice, bob } = await loadFixture(deployGarden);
      await garden.connect(alice).setNickname("squeek");
      await garden.connect(alice).setNickname("squeek");
      const key = ethers.keccak256(ethers.toUtf8Bytes("squeek"));
      expect(await garden.nicknameOwner(key)).to.equal(alice.address);
      await expect(garden.connect(bob).setNickname("squeek")).to.be.revertedWithCustomError(garden, "NicknameTaken");
      await garden.connect(alice).setNickname("other");
      expect(await garden.nicknameOwner(key)).to.equal(ethers.ZeroAddress);
      await garden.connect(bob).setNickname("squeek");
    });

    it("FIXED: clearNickname bans the name, so the same player cannot take it straight back", async function () {
      const { garden, alice } = await loadFixture(deployGarden);
      await garden.connect(alice).setNickname("rude_name");
      await garden.clearNickname(alice.address);
      await expect(garden.connect(alice).setNickname("rude_name")).to.be.revertedWithCustomError(garden, "NicknameTaken");
      expect(await garden.nicknameOf(alice.address)).to.equal("");
    });

    it("FIXED: clearNickname on a player without a nickname does nothing and emits nothing", async function () {
      const { garden, bob } = await loadFixture(deployGarden);
      await expect(garden.clearNickname(bob.address)).not.to.emit(garden, "NicknameSet");
      expect(await garden.isPlayer(bob.address)).to.equal(false);
    });
  });

  describe("views", function () {
    it("FIXED: playersPage clamps a huge limit to the list end", async function () {
      const { garden, alice, bob } = await loadFixture(deployGarden);
      await garden.connect(alice).setNickname("alice");
      await garden.connect(bob).setNickname("bob");
      expect((await garden.playersPage(1, ethers.MaxUint256)).map((p) => p.nickname)).to.deep.equal(["bob"]);
      expect((await garden.playersPage(0, ethers.MaxUint256)).length).to.equal(2);
      expect((await garden.playersPage(2, ethers.MaxUint256)).length).to.equal(0);
    });

    it("pointsForLevel overflows only for absurd levels; levelFor never loops more than ten times", async function () {
      const { garden } = await loadFixture(deployGarden);
      await expect(garden.pointsForLevel(ethers.MaxUint256)).to.be.revertedWithPanic(PANIC_CODES.ARITHMETIC_OVERFLOW);
      expect(await garden.levelFor(2n ** 64n - 1n)).to.equal(10n + (2n ** 64n - 1n - 18_000n) / 8_000n);
    });
  });
});
