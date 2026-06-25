const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CompositionInvariantChecker", function () {
  let reservable;
  let workflow;
  let checker;
  let consumer;
  let provider;
  let asset;

  const tokenId = 1;

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

    await reservable.mintValue(tokenId, asset.address, ethers.parseEther("10"));

    await reservable.approveReserve(
      tokenId,
      await workflow.getAddress(),
      asset.address,
      ethers.parseEther("10")
    );
  });

  it("checker validates reservable accounting after reservation", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await workflow.reserveForRun(1, ethers.parseEther("4"));

    expect(
      await checker.assertReservableAccounting(
        await reservable.getAddress(),
        tokenId,
        asset.address
      )
    ).to.equal(true);
  });

  it("checker validates authority cursor bound", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await workflow.recordConsumption(1, ethers.parseEther("2"));

    const run = await workflow.runs(1);

    expect(
      await checker.assertAuthorityCursor(run.consumed, run.authorityLimit)
    ).to.equal(true);
  });

  it("checker rejects authority cursor overflow", async function () {
    await expect(
      checker.assertAuthorityCursor(
        ethers.parseEther("11"),
        ethers.parseEther("10")
      )
    ).to.be.revertedWith("CONSUMPTION_EXCEEDS_AUTHORITY");
  });

  it("checker validates settlement bound", async function () {
    expect(
      await checker.assertSettlementBound(
        ethers.parseEther("2"),
        ethers.parseEther("4")
      )
    ).to.equal(true);
  });

  it("checker rejects settlement beyond reserved value", async function () {
    await expect(
      checker.assertSettlementBound(
        ethers.parseEther("5"),
        ethers.parseEther("4")
      )
    ).to.be.revertedWith("SETTLEMENT_EXCEEDS_RESERVED");
  });

  it("checker validates monotonic state progression", async function () {
    expect(await checker.assertStateDoesNotRegress(1, 5)).to.equal(true);
  });

  it("checker rejects state regression", async function () {
    await expect(
      checker.assertStateDoesNotRegress(5, 2)
    ).to.be.revertedWith("STATE_REGRESSION");
  });

  it("checker validates identity stability across settlement", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    const before = await workflow.runs(1);

    await workflow.reserveForRun(1, ethers.parseEther("4"));
    await workflow.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("checker-identity")));
    await workflow.connect(provider).verifyResult(1);
    await workflow.grantEligibility(1);
    await workflow.settleFromReservedValue(1, ethers.parseEther("2"));

    const after = await workflow.runs(1);

    expect(
      await checker.assertIdentityStable(
        before.consumer,
        after.consumer,
        before.provider,
        after.provider,
        before.tokenId,
        after.tokenId,
        before.asset,
        after.asset
      )
    ).to.equal(true);
  });

  it("checker rejects mutated identity fields", async function () {
    await expect(
      checker.assertIdentityStable(
        consumer.address,
        provider.address,
        provider.address,
        provider.address,
        tokenId,
        tokenId,
        asset.address,
        asset.address
      )
    ).to.be.revertedWith("CONSUMER_MUTATED");
  });

  it("checker validates full lifecycle invariants", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await workflow.reserveForRun(1, ethers.parseEther("4"));
    await workflow.recordConsumption(1, ethers.parseEther("2"));
    await workflow.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("full-checker")));
    await workflow.connect(provider).verifyResult(1);
    await workflow.grantEligibility(1);
    await workflow.settleFromReservedValue(1, ethers.parseEther("2"));

    const run = await workflow.runs(1);

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
      await checker.assertSettlementBound(run.settledValue, ethers.parseEther("4"))
    ).to.equal(true);
  });
});