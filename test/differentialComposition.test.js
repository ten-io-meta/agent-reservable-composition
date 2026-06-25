const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Differential composition: conceptual harness vs real reservable integration", function () {
  let conceptual;
  let reservable;
  let realWorkflow;
  let consumer;
  let provider;
  let asset;

  const tokenId = 1;

  beforeEach(async function () {
    [consumer, provider, asset] = await ethers.getSigners();

    const Conceptual = await ethers.getContractFactory("AgentWorkflowCompositionHarness");
    conceptual = await Conceptual.deploy();
    await conceptual.waitForDeployment();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const RealWorkflow = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    realWorkflow = await RealWorkflow.deploy(await reservable.getAddress());
    await realWorkflow.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, ethers.parseEther("10"));

    await reservable.approveReserve(
      tokenId,
      await realWorkflow.getAddress(),
      asset.address,
      ethers.parseEther("10")
    );
  });

  it("produces equivalent workflow state for the same full lifecycle", async function () {
    const authorityLimit = ethers.parseEther("10");
    const totalValue = ethers.parseEther("10");
    const reserveAmount = ethers.parseEther("4");
    const consumeAmount = ethers.parseEther("2");
    const settleAmount = ethers.parseEther("1");

    await conceptual.createRun(provider.address, authorityLimit, totalValue);

    await realWorkflow.createRun(
      provider.address,
      tokenId,
      asset.address,
      authorityLimit
    );

    const runId = 1;

    await conceptual.reserveValue(runId, reserveAmount);
    await realWorkflow.reserveForRun(runId, reserveAmount);

    await conceptual.recordConsumption(runId, consumeAmount);
    await realWorkflow.recordConsumption(runId, consumeAmount);

    const commitmentHash = ethers.keccak256(
      ethers.toUtf8Bytes("differential-full-lifecycle")
    );

    await conceptual.anchorCommitment(runId, commitmentHash);
    await realWorkflow.anchorCommitment(runId, commitmentHash);

    await conceptual.connect(provider).verifyResult(runId);
    await realWorkflow.connect(provider).verifyResult(runId);

    await conceptual.grantEligibility(runId);
    await realWorkflow.grantEligibility(runId);

    await conceptual.settle(runId, settleAmount);
    await realWorkflow.settleFromReservedValue(runId, settleAmount);

    const c = await conceptual.runs(runId);
    const r = await realWorkflow.runs(runId);

    expect(r.authorityLimit).to.equal(c.authorityLimit);
    expect(r.consumed).to.equal(c.consumed);
    expect(r.settledValue).to.equal(c.settledValue);
    expect(r.commitmentHash).to.equal(c.commitmentHash);
    expect(r.verified).to.equal(c.verified);
    expect(r.eligible).to.equal(c.eligible);
    expect(r.state).to.equal(c.state);

    expect(await realWorkflow.lockedValue(runId)).to.equal(ethers.parseEther("3"));
    expect(await realWorkflow.availableValue(runId)).to.equal(ethers.parseEther("7"));
  });

  it("keeps cursor behavior equivalent while reservable accounting remains external", async function () {
    await conceptual.createRun(
      provider.address,
      ethers.parseEther("10"),
      ethers.parseEther("10")
    );

    await realWorkflow.createRun(
      provider.address,
      tokenId,
      asset.address,
      ethers.parseEther("10")
    );

    await conceptual.recordConsumption(1, ethers.parseEther("1"));
    await realWorkflow.recordConsumption(1, ethers.parseEther("1"));

    await conceptual.reserveValue(1, ethers.parseEther("4"));
    await realWorkflow.reserveForRun(1, ethers.parseEther("4"));

    const c = await conceptual.runs(1);
    const r = await realWorkflow.runs(1);

    expect(r.authorityLimit).to.equal(c.authorityLimit);
    expect(r.consumed).to.equal(c.consumed);

    expect(await realWorkflow.lockedValue(1)).to.equal(ethers.parseEther("4"));
    expect(await realWorkflow.availableValue(1)).to.equal(ethers.parseEther("6"));
  });

  it("matches authority overrun behavior", async function () {
    await conceptual.createRun(
      provider.address,
      ethers.parseEther("1"),
      ethers.parseEther("10")
    );

    await realWorkflow.createRun(
      provider.address,
      tokenId,
      asset.address,
      ethers.parseEther("1")
    );

    await conceptual.recordConsumption(1, ethers.parseEther("1"));
    await realWorkflow.recordConsumption(1, ethers.parseEther("1"));

    await expect(
      conceptual.recordConsumption(1, 1)
    ).to.be.revertedWith("AUTHORITY_LIMIT_EXCEEDED");

    await expect(
      realWorkflow.recordConsumption(1, 1)
    ).to.be.revertedWith("AUTHORITY_LIMIT_EXCEEDED");
  });

  it("matches settlement-before-eligibility behavior", async function () {
    await conceptual.createRun(
      provider.address,
      ethers.parseEther("10"),
      ethers.parseEther("10")
    );

    await realWorkflow.createRun(
      provider.address,
      tokenId,
      asset.address,
      ethers.parseEther("10")
    );

    await conceptual.reserveValue(1, ethers.parseEther("2"));
    await realWorkflow.reserveForRun(1, ethers.parseEther("2"));

    await expect(
      conceptual.settle(1, ethers.parseEther("1"))
    ).to.be.revertedWith("NOT_ELIGIBLE");

    await expect(
      realWorkflow.settleFromReservedValue(1, ethers.parseEther("1"))
    ).to.be.revertedWith("NOT_ELIGIBLE");
  });

  it("matches logical workflow fields after multiple equivalent runs", async function () {
    for (let i = 1; i <= 25; i++) {
      await conceptual.createRun(
        provider.address,
        ethers.parseEther("10"),
        ethers.parseEther("10")
      );

      await realWorkflow.createRun(
        provider.address,
        tokenId,
        asset.address,
        ethers.parseEther("10")
      );

      await conceptual.reserveValue(i, ethers.parseEther("0.1"));
      await realWorkflow.reserveForRun(i, ethers.parseEther("0.1"));

      await conceptual.recordConsumption(i, ethers.parseEther("0.05"));
      await realWorkflow.recordConsumption(i, ethers.parseEther("0.05"));

      const c = await conceptual.runs(i);
      const r = await realWorkflow.runs(i);

      expect(r.authorityLimit).to.equal(c.authorityLimit);
      expect(r.consumed).to.equal(c.consumed);
      expect(r.state).to.equal(c.state);
    }

    expect(await realWorkflow.lockedValue(1)).to.equal(ethers.parseEther("2.5"));
    expect(await realWorkflow.availableValue(1)).to.equal(ethers.parseEther("7.5"));
  });
});