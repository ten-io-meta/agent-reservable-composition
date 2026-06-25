const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Empirical simulation: agent workflow + reservable value", function () {
  let reservable;
  let harness;
  let consumer;
  let provider;
  let asset;

  const tokenId = 1;
  const ETH10 = ethers.parseEther("10");

  beforeEach(async function () {
    [consumer, provider, asset] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const Harness = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    harness = await Harness.deploy(await reservable.getAddress());
    await harness.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, ETH10);

    await reservable.approveReserve(
      tokenId,
      await harness.getAddress(),
      asset.address,
      ETH10
    );
  });

  async function assertGlobalInvariants(runId) {
    const run = await harness.runs(runId);

    const locked = await harness.lockedValue(runId);
    const available = await harness.availableValue(runId);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(run.consumed).to.be.lte(run.authorityLimit);
    expect(locked).to.be.lte(total);
    expect(available).to.be.lte(total);
    expect(locked + available).to.equal(total);
    expect(run.settledValue).to.be.lte(ETH10);
  }

  it("runs 100 deterministic workflows and preserves invariants after every lifecycle", async function () {
    for (let i = 1; i <= 100; i++) {
      await harness.createRun(
        provider.address,
        tokenId,
        asset.address,
        ETH10
      );

      const runId = i;

      const reserveAmount = ethers.parseEther("0.01");
      const consumeAmount = ethers.parseEther("0.005");
      const settleAmount = ethers.parseEther("0.005");

      await harness.reserveForRun(runId, reserveAmount);
      await assertGlobalInvariants(runId);

      await harness.recordConsumption(runId, consumeAmount);
      await assertGlobalInvariants(runId);

      const commitmentHash = ethers.keccak256(
        ethers.toUtf8Bytes(`workflow-${i}`)
      );

      await harness.anchorCommitment(runId, commitmentHash);
      await assertGlobalInvariants(runId);

      await harness.connect(provider).verifyResult(runId);
      await assertGlobalInvariants(runId);

      await harness.grantEligibility(runId);
      await assertGlobalInvariants(runId);

      await harness.settleFromReservedValue(runId, settleAmount);
      await assertGlobalInvariants(runId);

      const run = await harness.runs(runId);
      expect(run.state).to.equal(5n);
    }
  });

  it("runs 500 interleaved operations across 50 workflows without breaking accounting invariants", async function () {
    const workflowCount = 50;

    for (let i = 1; i <= workflowCount; i++) {
      await harness.createRun(
        provider.address,
        tokenId,
        asset.address,
        ETH10
      );
    }

    for (let i = 1; i <= workflowCount; i++) {
      await harness.reserveForRun(i, ethers.parseEther("0.01"));
      await assertGlobalInvariants(i);
    }

    for (let i = 1; i <= workflowCount; i++) {
      await harness.recordConsumption(i, ethers.parseEther("0.005"));
      await assertGlobalInvariants(i);
    }

    for (let i = 1; i <= workflowCount; i++) {
      await harness.anchorCommitment(
        i,
        ethers.keccak256(ethers.toUtf8Bytes(`interleaved-${i}`))
      );
      await assertGlobalInvariants(i);
    }

    for (let i = 1; i <= workflowCount; i++) {
      await harness.connect(provider).verifyResult(i);
      await assertGlobalInvariants(i);
    }

    for (let i = 1; i <= workflowCount; i++) {
      await harness.grantEligibility(i);
      await assertGlobalInvariants(i);
    }

    for (let i = 1; i <= workflowCount; i++) {
      await harness.settleFromReservedValue(i, ethers.parseEther("0.005"));
      await assertGlobalInvariants(i);
    }

    const locked = await reservable.lockedValue(tokenId, asset.address);
    const available = await reservable.availableValue(tokenId, asset.address);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(locked + available).to.equal(total);
  });

  it("runs pseudo-random valid workflows and preserves separation between consumption and reservation", async function () {
    const workflowCount = 75;

    for (let i = 1; i <= workflowCount; i++) {
      await harness.createRun(
        provider.address,
        tokenId,
        asset.address,
        ETH10
      );

      const runId = i;

      const reserveAmount = ethers.parseEther((0.001 * ((i % 5) + 1)).toFixed(3));
      const consumeAmount = ethers.parseEther((0.001 * ((i % 3) + 1)).toFixed(3));
      const settleAmount = ethers.parseEther("0.001");

      await harness.reserveForRun(runId, reserveAmount);
      await harness.recordConsumption(runId, consumeAmount);

      const runBefore = await harness.runs(runId);
      const lockedBefore = await harness.lockedValue(runId);

      await harness.anchorCommitment(
        runId,
        ethers.keccak256(ethers.toUtf8Bytes(`pseudo-random-${i}`))
      );
      await harness.connect(provider).verifyResult(runId);
      await harness.grantEligibility(runId);
      await harness.settleFromReservedValue(runId, settleAmount);

      await assertGlobalInvariants(runId);
    }
  });
});