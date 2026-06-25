const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentWorkflowCompositionHarness", function () {
  let harness;
  let consumer;
  let provider;

  beforeEach(async function () {
    [consumer, provider] = await ethers.getSigners();

    const Harness = await ethers.getContractFactory("AgentWorkflowCompositionHarness");
    harness = await Harness.deploy();
    await harness.waitForDeployment();
  });

  it("composes authority, cursor, workflow, anchor, verification, eligibility, settlement and reservation", async function () {
    const authorityLimit = ethers.parseEther("10");
    const totalValue = ethers.parseEther("10");
    const reserveAmount = ethers.parseEther("4");
    const consumedAmount = ethers.parseEther("2");
    const settleAmount = ethers.parseEther("2");

    await harness.createRun(provider.address, authorityLimit, totalValue);

    const runId = 1;

    await harness.reserveValue(runId, reserveAmount);
    await harness.recordConsumption(runId, consumedAmount);

    const commitmentHash = ethers.keccak256(
      ethers.toUtf8Bytes("agent-service-result-commitment")
    );

    await harness.anchorCommitment(runId, commitmentHash);
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settle(runId, settleAmount);

    const run = await harness.runs(runId);

    expect(run.authorityLimit).to.equal(ethers.parseEther("10"));
    expect(run.consumed).to.equal(ethers.parseEther("2"));
    expect(run.totalValue).to.equal(ethers.parseEther("8"));
    expect(run.lockedValue).to.equal(ethers.parseEther("2"));
    expect(run.settledValue).to.equal(ethers.parseEther("2"));
    expect(await harness.availableValue(runId)).to.equal(ethers.parseEther("6"));
    expect(run.commitmentHash).to.equal(commitmentHash);
    expect(run.verified).to.equal(true);
    expect(run.eligible).to.equal(true);

    // WorkflowState.Settled = 5
    expect(run.state).to.equal(5n);
  });

  it("keeps authority consumption and value reservation independent", async function () {
    await harness.createRun(
      provider.address,
      ethers.parseEther("10"),
      ethers.parseEther("10")
    );

    const runId = 1;

    await harness.reserveValue(runId, ethers.parseEther("4"));
    await harness.recordConsumption(runId, ethers.parseEther("1"));

    const run = await harness.runs(runId);

    expect(run.authorityLimit).to.equal(ethers.parseEther("10"));
    expect(run.consumed).to.equal(ethers.parseEther("1"));
    expect(run.lockedValue).to.equal(ethers.parseEther("4"));
    expect(run.totalValue).to.equal(ethers.parseEther("10"));
    expect(await harness.availableValue(runId)).to.equal(ethers.parseEther("6"));
  });

  it("prevents over-consuming authority", async function () {
    await harness.createRun(
      provider.address,
      ethers.parseEther("10"),
      ethers.parseEther("10")
    );

    const runId = 1;

    await expect(
      harness.recordConsumption(runId, ethers.parseEther("11"))
    ).to.be.revertedWith("AUTHORITY_LIMIT_EXCEEDED");
  });

  it("prevents over-reserving embedded value", async function () {
    await harness.createRun(
      provider.address,
      ethers.parseEther("10"),
      ethers.parseEther("10")
    );

    const runId = 1;

    await expect(
      harness.reserveValue(runId, ethers.parseEther("11"))
    ).to.be.revertedWith("INSUFFICIENT_AVAILABLE_VALUE");
  });

  it("prevents settlement before verification and eligibility", async function () {
    await harness.createRun(
      provider.address,
      ethers.parseEther("10"),
      ethers.parseEther("10")
    );

    const runId = 1;

    await harness.reserveValue(runId, ethers.parseEther("4"));

    await expect(
      harness.settle(runId, ethers.parseEther("2"))
    ).to.be.revertedWith("NOT_ELIGIBLE");
  });
});