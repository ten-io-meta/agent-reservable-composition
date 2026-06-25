const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Long-chain simulation: extended composition stability", function () {
  let reservable;
  let workflow;
  let checker;
  let consumer;
  let provider;
  let asset;

  const tokenId = 1;
  const TOTAL = ethers.parseEther("500");

  beforeEach(async function () {
    [consumer, provider, asset] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const Workflow = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    workflow = await Workflow.deploy(await reservable.getAddress());
    await workflow.waitForDeployment();

    const Checker = await ethers.getContractFactory("CompositionInvariantChecker");
    checker = await Checker.deploy();
    await checker.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, TOTAL);

    await reservable.approveReserve(
      tokenId,
      await workflow.getAddress(),
      asset.address,
      TOTAL
    );
  });

  async function assertGlobal(runId, initiallyReserved) {
    const run = await workflow.runs(runId);

    await checker.assertReservableAccounting(
      await reservable.getAddress(),
      tokenId,
      asset.address
    );

    await checker.assertAuthorityCursor(run.consumed, run.authorityLimit);
    await checker.assertSettlementBound(run.settledValue, initiallyReserved);
  }

  it("runs 1000 lightweight workflows without accounting drift", async function () {
    const count = 1000;
    const reserveAmount = ethers.parseEther("0.001");
    const consumeAmount = ethers.parseEther("0.0005");

    for (let i = 1; i <= count; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await workflow.reserveForRun(i, reserveAmount);
      await workflow.recordConsumption(i, consumeAmount);

      if (i % 10 === 0) {
        await assertGlobal(i, reserveAmount);
      }
    }

    const locked = await reservable.lockedValue(tokenId, asset.address);
    const available = await reservable.availableValue(tokenId, asset.address);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(locked + available).to.equal(total);
    expect(locked).to.equal(reserveAmount * BigInt(count));
  });

  it("runs 500 full lifecycle workflows with periodic invariant checks", async function () {
    const count = 500;
    const reserveAmount = ethers.parseEther("0.002");
    const consumeAmount = ethers.parseEther("0.001");
    const settleAmount = ethers.parseEther("0.001");

    for (let i = 1; i <= count; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await workflow.reserveForRun(i, reserveAmount);
      await workflow.recordConsumption(i, consumeAmount);
      await workflow.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`long-chain-${i}`)));
      await workflow.connect(provider).verifyResult(i);
      await workflow.grantEligibility(i);
      await workflow.settleFromReservedValue(i, settleAmount);

      if (i % 25 === 0) {
        await assertGlobal(i, reserveAmount);
      }
    }

    const locked = await reservable.lockedValue(tokenId, asset.address);
    const expectedLocked = (reserveAmount - settleAmount) * BigInt(count);

    expect(locked).to.equal(expectedLocked);
  });

  it("runs 1000 cursor updates without exceeding authority", async function () {
    const count = 1000;

    for (let i = 1; i <= count; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
      await workflow.recordConsumption(i, ethers.parseEther("0.001"));

      if (i % 50 === 0) {
        const run = await workflow.runs(i);
        expect(run.consumed).to.be.lte(run.authorityLimit);
      }
    }
  });

  it("runs 300 mixed completed and pending workflows without state contamination", async function () {
    const count = 300;

    for (let i = 1; i <= count; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await workflow.reserveForRun(i, ethers.parseEther("0.002"));

      if (i % 3 === 0) {
        await workflow.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`completed-${i}`)));
        await workflow.connect(provider).verifyResult(i);
        await workflow.grantEligibility(i);
        await workflow.settleFromReservedValue(i, ethers.parseEther("0.001"));
      }

      if (i % 20 === 0) {
        await assertGlobal(i, ethers.parseEther("0.002"));
      }
    }

    const locked = await reservable.lockedValue(tokenId, asset.address);
    const available = await reservable.availableValue(tokenId, asset.address);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(locked + available).to.equal(total);
  });

  it("runs long alternating reserve and consume sequence with stable invariants", async function () {
    const count = 750;

    for (let i = 1; i <= count; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      if (i % 2 === 0) {
        await workflow.reserveForRun(i, ethers.parseEther("0.001"));
        await workflow.recordConsumption(i, ethers.parseEther("0.0005"));
      } else {
        await workflow.recordConsumption(i, ethers.parseEther("0.0005"));
        await workflow.reserveForRun(i, ethers.parseEther("0.001"));
      }

      if (i % 75 === 0) {
        await assertGlobal(i, ethers.parseEther("0.001"));
      }
    }
  });
});