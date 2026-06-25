const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Invariant checker stress: enforced invariants across many workflows", function () {
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

  async function checkRun(runId, initiallyReserved) {
    const run = await workflow.runs(runId);

    expect(
      await checker.assertReservableAccounting(
        await reservable.getAddress(),
        tokenId,
        asset.address
      )
    ).to.equal(true);

    expect(
      await checker.assertAuthorityCursor(run.consumed, run.authorityLimit)
    ).to.equal(true);

    expect(
      await checker.assertSettlementBound(run.settledValue, initiallyReserved)
    ).to.equal(true);
  }

  it("enforces checker invariants across 100 complete lifecycles", async function () {
    const reserved = ethers.parseEther("0.01");

    for (let i = 1; i <= 100; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await workflow.reserveForRun(i, reserved);
      await checkRun(i, reserved);

      await workflow.recordConsumption(i, ethers.parseEther("0.005"));
      await checkRun(i, reserved);

      await workflow.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`checker-stress-${i}`)));
      await workflow.connect(provider).verifyResult(i);
      await workflow.grantEligibility(i);
      await workflow.settleFromReservedValue(i, ethers.parseEther("0.005"));

      await checkRun(i, reserved);
    }
  });

  it("enforces checker invariants across 150 reserve and consume permutations", async function () {
    const reserved = ethers.parseEther("0.002");

    for (let i = 1; i <= 150; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      if (i % 2 === 0) {
        await workflow.reserveForRun(i, reserved);
        await workflow.recordConsumption(i, ethers.parseEther("0.001"));
      } else {
        await workflow.recordConsumption(i, ethers.parseEther("0.001"));
        await workflow.reserveForRun(i, reserved);
      }

      await checkRun(i, reserved);
    }
  });

  it("enforces checker invariants after partial settlements across 75 workflows", async function () {
    const reserved = ethers.parseEther("0.004");
    const settled = ethers.parseEther("0.001");

    for (let i = 1; i <= 75; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
      await workflow.reserveForRun(i, reserved);
      await workflow.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`partial-check-${i}`)));
      await workflow.connect(provider).verifyResult(i);
      await workflow.grantEligibility(i);
      await workflow.settleFromReservedValue(i, settled);

      await checkRun(i, reserved);
    }
  });

  it("rejects checker authority invariant on deliberately invalid values", async function () {
    for (let i = 1; i <= 50; i++) {
      await expect(
        checker.assertAuthorityCursor(
          ethers.parseEther("2"),
          ethers.parseEther("1")
        )
      ).to.be.revertedWith("CONSUMPTION_EXCEEDS_AUTHORITY");
    }
  });

  it("rejects checker settlement invariant on deliberately invalid values", async function () {
    for (let i = 1; i <= 50; i++) {
      await expect(
        checker.assertSettlementBound(
          ethers.parseEther("2"),
          ethers.parseEther("1")
        )
      ).to.be.revertedWith("SETTLEMENT_EXCEEDS_RESERVED");
    }
  });
});