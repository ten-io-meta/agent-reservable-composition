const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Stress simulation: high-volume agent reservable composition", function () {
  let reservable;
  let harness;
  let consumer;
  let provider;
  let asset;

  const tokenId = 1;
  const TOTAL = ethers.parseEther("100");

  beforeEach(async function () {
    [consumer, provider, asset] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const Harness = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    harness = await Harness.deploy(await reservable.getAddress());
    await harness.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, TOTAL);

    await reservable.approveReserve(
      tokenId,
      await harness.getAddress(),
      asset.address,
      TOTAL
    );
  });

  async function assertAccounting(runId) {
    const run = await harness.runs(runId);
    const locked = await harness.lockedValue(runId);
    const available = await harness.availableValue(runId);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(run.consumed).to.be.lte(run.authorityLimit);
    expect(locked).to.be.lte(total);
    expect(available).to.be.lte(total);
    expect(locked + available).to.equal(total);
  }

  it("processes 200 complete workflows under shared reservable value", async function () {
    const count = 200;

    for (let i = 1; i <= count; i++) {
      await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await harness.reserveForRun(i, ethers.parseEther("0.01"));
      await harness.recordConsumption(i, ethers.parseEther("0.005"));
      await harness.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`stress-${i}`)));
      await harness.connect(provider).verifyResult(i);
      await harness.grantEligibility(i);
      await harness.settleFromReservedValue(i, ethers.parseEther("0.005"));

      await assertAccounting(i);

      const run = await harness.runs(i);
      expect(run.state).to.equal(5n);
    }
  });

  it("creates 500 runs and preserves cursor authority limits", async function () {
    const count = 500;

    for (let i = 1; i <= count; i++) {
      await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
      await harness.recordConsumption(i, ethers.parseEther("0.001"));

      const run = await harness.runs(i);
      expect(run.consumed).to.be.lte(run.authorityLimit);
    }
  });

  it("creates 300 reservations and preserves aggregate locked accounting", async function () {
    const count = 300;
    const amount = ethers.parseEther("0.001");

    for (let i = 1; i <= count; i++) {
      await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
      await harness.reserveForRun(i, amount);
    }

    const locked = await reservable.lockedValue(tokenId, asset.address);
    const available = await reservable.availableValue(tokenId, asset.address);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(locked).to.equal(amount * BigInt(count));
    expect(locked + available).to.equal(total);
  });

  it("settles 100 workflows and preserves aggregate locked value", async function () {
    const count = 100;
    const reserveAmount = ethers.parseEther("0.01");
    const settleAmount = ethers.parseEther("0.005");

    for (let i = 1; i <= count; i++) {
      await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
      await harness.reserveForRun(i, reserveAmount);
      await harness.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`settle-stress-${i}`)));
      await harness.connect(provider).verifyResult(i);
      await harness.grantEligibility(i);
      await harness.settleFromReservedValue(i, settleAmount);
    }

    const locked = await reservable.lockedValue(tokenId, asset.address);
    const expectedLocked = (reserveAmount - settleAmount) * BigInt(count);

    expect(locked).to.equal(expectedLocked);
  });

  it("rejects authority overrun after exact authority exhaustion", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
    const runId = 1;

    await harness.recordConsumption(runId, ethers.parseEther("1"));

    await expect(
      harness.recordConsumption(runId, 1)
    ).to.be.revertedWith("AUTHORITY_LIMIT_EXCEEDED");
  });

  it("rejects reservable overrun after exact allowance exhaustion", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
    const runId = 1;

    await harness.reserveForRun(runId, TOTAL);

    await expect(
      harness.reserveForRun(runId, 1)
    ).to.be.revertedWith("exceeds reserve allowance");
  });

  it("rejects repeated settlement attempts across many finalized runs", async function () {
    const count = 25;

    for (let i = 1; i <= count; i++) {
      await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
      await harness.reserveForRun(i, ethers.parseEther("0.01"));
      await harness.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`double-settle-stress-${i}`)));
      await harness.connect(provider).verifyResult(i);
      await harness.grantEligibility(i);
      await harness.settleFromReservedValue(i, ethers.parseEther("0.005"));

      await expect(
        harness.settleFromReservedValue(i, ethers.parseEther("0.001"))
      ).to.be.revertedWith("INVALID_STATE");
    }
  });

  it("preserves accounting under alternating reserve and consume operations", async function () {
    const count = 150;

    for (let i = 1; i <= count; i++) {
      await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      if (i % 2 === 0) {
        await harness.reserveForRun(i, ethers.parseEther("0.002"));
        await harness.recordConsumption(i, ethers.parseEther("0.001"));
      } else {
        await harness.recordConsumption(i, ethers.parseEther("0.001"));
        await harness.reserveForRun(i, ethers.parseEther("0.002"));
      }

      await assertAccounting(i);
    }
  });

  it("preserves final aggregate invariant after mixed stress workflow", async function () {
    const count = 100;

    for (let i = 1; i <= count; i++) {
      await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
      await harness.reserveForRun(i, ethers.parseEther("0.004"));
      await harness.recordConsumption(i, ethers.parseEther("0.002"));

      if (i % 3 === 0) {
        await harness.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`mixed-${i}`)));
        await harness.connect(provider).verifyResult(i);
        await harness.grantEligibility(i);
        await harness.settleFromReservedValue(i, ethers.parseEther("0.001"));
      }

      await assertAccounting(i);
    }

    const locked = await reservable.lockedValue(tokenId, asset.address);
    const available = await reservable.availableValue(tokenId, asset.address);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(locked + available).to.equal(total);
  });

  it("does not mutate provider consumer asset or token identity under stress settlement", async function () {
    const count = 50;

    for (let i = 1; i <= count; i++) {
      await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      const before = await harness.runs(i);

      await harness.reserveForRun(i, ethers.parseEther("0.01"));
      await harness.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`identity-stress-${i}`)));
      await harness.connect(provider).verifyResult(i);
      await harness.grantEligibility(i);
      await harness.settleFromReservedValue(i, ethers.parseEther("0.005"));

      const after = await harness.runs(i);

      expect(after.consumer).to.equal(before.consumer);
      expect(after.provider).to.equal(before.provider);
      expect(after.tokenId).to.equal(before.tokenId);
      expect(after.asset).to.equal(before.asset);
    }
  });
});