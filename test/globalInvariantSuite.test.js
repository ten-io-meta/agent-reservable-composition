const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Global invariant suite: full system properties", function () {
  let reservable;
  let workflow;
  let checker;
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

  async function assertAll(runId, initiallyReserved = 0n) {
    const run = await workflow.runs(runId);

    await checker.assertReservableAccounting(
      await reservable.getAddress(),
      tokenId,
      asset.address
    );

    await checker.assertAuthorityCursor(run.consumed, run.authorityLimit);

    await checker.assertSettlementBound(run.settledValue, initiallyReserved);
  }

  it("preserves global accounting after every operation in a full lifecycle", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;
    const reserved = ethers.parseEther("4");

    await assertAll(runId, reserved);

    await workflow.reserveForRun(runId, reserved);
    await assertAll(runId, reserved);

    await workflow.recordConsumption(runId, ethers.parseEther("2"));
    await assertAll(runId, reserved);

    await workflow.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("global-full")));
    await assertAll(runId, reserved);

    await workflow.connect(provider).verifyResult(runId);
    await assertAll(runId, reserved);

    await workflow.grantEligibility(runId);
    await assertAll(runId, reserved);

    await workflow.settleFromReservedValue(runId, ethers.parseEther("1"));
    await assertAll(runId, reserved);
  });

  it("reservation never mutates authority or consumption invariants", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await workflow.recordConsumption(runId, ethers.parseEther("2"));
    const before = await workflow.runs(runId);

    await workflow.reserveForRun(runId, ethers.parseEther("4"));
    const after = await workflow.runs(runId);

    expect(after.authorityLimit).to.equal(before.authorityLimit);
    expect(after.consumed).to.equal(before.consumed);

    await assertAll(runId, ethers.parseEther("4"));
  });

  it("consumption never mutates reservable accounting", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    const lockedBefore = await workflow.lockedValue(runId);
    const availableBefore = await workflow.availableValue(runId);

    await workflow.recordConsumption(runId, ethers.parseEther("2"));

    expect(await workflow.lockedValue(runId)).to.equal(lockedBefore);
    expect(await workflow.availableValue(runId)).to.equal(availableBefore);

    await assertAll(runId, 0n);
  });

  it("settlement never mutates authority or identity fields", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;
    const reserved = ethers.parseEther("4");

    await workflow.reserveForRun(runId, reserved);
    await workflow.recordConsumption(runId, ethers.parseEther("2"));
    await workflow.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("settlement-identity")));
    await workflow.connect(provider).verifyResult(runId);
    await workflow.grantEligibility(runId);

    const before = await workflow.runs(runId);

    await workflow.settleFromReservedValue(runId, ethers.parseEther("1"));

    const after = await workflow.runs(runId);

    expect(after.consumer).to.equal(before.consumer);
    expect(after.provider).to.equal(before.provider);
    expect(after.tokenId).to.equal(before.tokenId);
    expect(after.asset).to.equal(before.asset);
    expect(after.authorityLimit).to.equal(before.authorityLimit);
    expect(after.consumed).to.equal(before.consumed);

    await assertAll(runId, reserved);
  });

  it("anchoring verification and eligibility never mutate reservable accounting", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;
    const reserved = ethers.parseEther("4");

    await workflow.reserveForRun(runId, reserved);

    const lockedBefore = await workflow.lockedValue(runId);
    const availableBefore = await workflow.availableValue(runId);

    await workflow.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("non-accounting-layers")));
    await workflow.connect(provider).verifyResult(runId);
    await workflow.grantEligibility(runId);

    expect(await workflow.lockedValue(runId)).to.equal(lockedBefore);
    expect(await workflow.availableValue(runId)).to.equal(availableBefore);

    await assertAll(runId, reserved);
  });

  it("global accounting invariant holds across 100 mixed workflows", async function () {
    for (let i = 1; i <= 100; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

      const reserved = ethers.parseEther("0.01");
      const consumed = ethers.parseEther("0.005");

      if (i % 2 === 0) {
        await workflow.reserveForRun(i, reserved);
        await workflow.recordConsumption(i, consumed);
      } else {
        await workflow.recordConsumption(i, consumed);
        await workflow.reserveForRun(i, reserved);
      }

      await assertAll(i, reserved);
    }
  });

  it("global invariant holds after partial settlements across 50 workflows", async function () {
    for (let i = 1; i <= 50; i++) {
      const reserved = ethers.parseEther("0.02");

      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
      await workflow.reserveForRun(i, reserved);
      await workflow.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`partial-global-${i}`)));
      await workflow.connect(provider).verifyResult(i);
      await workflow.grantEligibility(i);
      await workflow.settleFromReservedValue(i, ethers.parseEther("0.01"));

      await assertAll(i, reserved);
    }
  });

  it("authority exhaustion does not break reservable accounting", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
    const runId = 1;

    await workflow.recordConsumption(runId, ethers.parseEther("1"));
    await workflow.reserveForRun(runId, ethers.parseEther("4"));

    const run = await workflow.runs(runId);

    expect(run.consumed).to.equal(run.authorityLimit);

    await assertAll(runId, ethers.parseEther("4"));
  });

  it("full settlement at reserved boundary preserves accounting invariant", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;
    const reserved = ethers.parseEther("4");

    await workflow.reserveForRun(runId, reserved);
    await workflow.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("full-boundary")));
    await workflow.connect(provider).verifyResult(runId);
    await workflow.grantEligibility(runId);
    await workflow.settleFromReservedValue(runId, reserved);

    await assertAll(runId, reserved);

    expect(await workflow.lockedValue(runId)).to.equal(0n);
  });

  it("multiple global invariant domains remain isolated", async function () {
    const [, , assetA, assetB] = await ethers.getSigners();

    await reservable.mintValue(tokenId, assetB.address, ethers.parseEther("50"));

    await reservable.approveReserve(
      tokenId,
      await workflow.getAddress(),
      assetB.address,
      ethers.parseEther("50")
    );

    await workflow.createRun(provider.address, tokenId, assetA.address, ethers.parseEther("10"));
    await workflow.createRun(provider.address, tokenId, assetB.address, ethers.parseEther("10"));

    await workflow.reserveForRun(1, ethers.parseEther("4"));
    await workflow.reserveForRun(2, ethers.parseEther("5"));

    const lockedA = await reservable.lockedValue(tokenId, assetA.address);
    const availableA = await reservable.availableValue(tokenId, assetA.address);
    const totalA = await reservable.totalValue(tokenId, assetA.address);

    const lockedB = await reservable.lockedValue(tokenId, assetB.address);
    const availableB = await reservable.availableValue(tokenId, assetB.address);
    const totalB = await reservable.totalValue(tokenId, assetB.address);

    expect(lockedA + availableA).to.equal(totalA);
    expect(lockedB + availableB).to.equal(totalB);
  });
});