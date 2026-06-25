const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Manual fuzz composition: pseudo-random valid and invalid sequences", function () {
  let reservable;
  let workflow;
  let consumer;
  let provider;
  let attacker;
  let asset;

  const tokenId = 1;
  const TOTAL = ethers.parseEther("100");

  beforeEach(async function () {
    [consumer, provider, attacker, asset] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const Workflow = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    workflow = await Workflow.deploy(await reservable.getAddress());
    await workflow.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, TOTAL);

    await reservable.approveReserve(
      tokenId,
      await workflow.getAddress(),
      asset.address,
      TOTAL
    );
  });

  async function assertGlobalInvariant() {
    const locked = await reservable.lockedValue(tokenId, asset.address);
    const available = await reservable.availableValue(tokenId, asset.address);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(locked).to.be.lte(total);
    expect(available).to.be.lte(total);
    expect(locked + available).to.equal(total);
  }

  function pseudoRandom(seed) {
    return Number((BigInt(seed) * 1103515245n + 12345n) % 2147483648n);
  }

  it("runs 100 pseudo-random valid operation paths while preserving global accounting", async function () {
    for (let i = 1; i <= 100; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      const r = pseudoRandom(i);
      const reserveAmount = ethers.parseEther(((r % 5) + 1).toString()) / 1000n;
      const consumeAmount = ethers.parseEther(((r % 3) + 1).toString()) / 1000n;
      const settleAmount = reserveAmount / 2n;

      await workflow.reserveForRun(i, reserveAmount);
      await assertGlobalInvariant();

      await workflow.recordConsumption(i, consumeAmount);
      await assertGlobalInvariant();

      await workflow.anchorCommitment(
        i,
        ethers.keccak256(ethers.toUtf8Bytes(`manual-fuzz-valid-${i}`))
      );
      await assertGlobalInvariant();

      await workflow.connect(provider).verifyResult(i);
      await workflow.grantEligibility(i);
      await workflow.settleFromReservedValue(i, settleAmount);

      await assertGlobalInvariant();

      const run = await workflow.runs(i);
      expect(run.consumed).to.be.lte(run.authorityLimit);
      expect(run.state).to.equal(5n);
    }
  });

  it("runs 100 pseudo-random invalid bypass attempts without mutating global accounting incorrectly", async function () {
    for (let i = 1; i <= 100; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      const lockedBefore = await reservable.lockedValue(tokenId, asset.address);
      const availableBefore = await reservable.availableValue(tokenId, asset.address);

      const r = pseudoRandom(i) % 5;

      if (r === 0) {
        await expect(
          workflow.connect(attacker).reserveForRun(i, ethers.parseEther("0.001"))
        ).to.be.revertedWith("ONLY_CONSUMER");
      }

      if (r === 1) {
        await expect(
          workflow.connect(attacker).recordConsumption(i, ethers.parseEther("0.001"))
        ).to.be.revertedWith("ONLY_CONSUMER");
      }

      if (r === 2) {
        await expect(
          workflow.connect(attacker).anchorCommitment(
            i,
            ethers.keccak256(ethers.toUtf8Bytes(`bad-anchor-${i}`))
          )
        ).to.be.revertedWith("ONLY_CONSUMER");
      }

      if (r === 3) {
        await expect(
          workflow.connect(provider).verifyResult(i)
        ).to.be.revertedWith("INVALID_STATE");
      }

      if (r === 4) {
        await expect(
          workflow.settleFromReservedValue(i, ethers.parseEther("0.001"))
        ).to.be.revertedWith("NOT_ELIGIBLE");
      }

      expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(lockedBefore);
      expect(await reservable.availableValue(tokenId, asset.address)).to.equal(availableBefore);

      await assertGlobalInvariant();
    }
  });

  it("runs mixed valid and invalid paths while preserving authority and reservable separation", async function () {
    for (let i = 1; i <= 75; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      const reserveAmount = ethers.parseEther("0.002");
      const consumeAmount = ethers.parseEther("0.001");

      if (i % 2 === 0) {
        await workflow.reserveForRun(i, reserveAmount);
        await workflow.recordConsumption(i, consumeAmount);
      } else {
        await workflow.recordConsumption(i, consumeAmount);
        await workflow.reserveForRun(i, reserveAmount);
      }

      await expect(
        workflow.connect(attacker).anchorCommitment(
          i,
          ethers.keccak256(ethers.toUtf8Bytes(`attacker-mixed-${i}`))
        )
      ).to.be.revertedWith("ONLY_CONSUMER");

      const run = await workflow.runs(i);
      const locked = await workflow.lockedValue(i);

      expect(run.consumed).to.equal(consumeAmount);
      expect(locked).to.be.gte(reserveAmount);

      await assertGlobalInvariant();
    }
  });

  it("runs lifecycle fuzz with deterministic operation branches", async function () {
    for (let i = 1; i <= 60; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      const branch = pseudoRandom(i) % 4;

      if (branch === 0) {
        await workflow.reserveForRun(i, ethers.parseEther("0.002"));
        await workflow.recordConsumption(i, ethers.parseEther("0.001"));
      }

      if (branch === 1) {
        await workflow.recordConsumption(i, ethers.parseEther("0.001"));
        await workflow.reserveForRun(i, ethers.parseEther("0.002"));
      }

      if (branch === 2) {
        await workflow.reserveForRun(i, ethers.parseEther("0.003"));
      }

      if (branch === 3) {
        await workflow.recordConsumption(i, ethers.parseEther("0.001"));
      }

      await workflow.anchorCommitment(
        i,
        ethers.keccak256(ethers.toUtf8Bytes(`branch-${branch}-${i}`))
      );

      await workflow.connect(provider).verifyResult(i);
      await workflow.grantEligibility(i);

      const lockedBefore = await workflow.lockedValue(i);

      if (lockedBefore > 0n) {
        await workflow.settleFromReservedValue(i, lockedBefore / 2n);
      } else {
        await expect(
          workflow.settleFromReservedValue(i, ethers.parseEther("0.001"))
        ).to.be.revertedWith("release exceeds locked value");
      }

      await assertGlobalInvariant();
    }
  });
});