const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Composition report: full ERC stack execution summary", function () {
  let identity;
  let reservable;
  let workflow;
  let checker;
  let consumer;
  let provider;
  let asset;

  const tokenId = 1;

  beforeEach(async function () {
    [consumer, provider, asset] = await ethers.getSigners();

    const Identity = await ethers.getContractFactory("AgentIdentityProvenanceHarness");
    identity = await Identity.deploy();
    await identity.waitForDeployment();

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

  it("prints a complete layer-by-layer composition report", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("TEN.IO-agent-report"));
    const sourceContract = await reservable.getAddress();

    await identity.registerAgent(agentId, consumer.address, sourceContract, tokenId);

    const inputHash = ethers.keccak256(ethers.toUtf8Bytes("ERC-8281-input-provenance"));
    await identity.commitInput(agentId, inputHash);

    const modelHash = ethers.keccak256(ethers.toUtf8Bytes("model-reference"));
    const outputHash = ethers.keccak256(ethers.toUtf8Bytes("output-reference"));

    await identity.commitSpine(agentId, modelHash, outputHash, 123456);

    const spineCommitment = await identity.spineCommitments(agentId);

    await workflow.createRun(
      provider.address,
      tokenId,
      asset.address,
      ethers.parseEther("10")
    );

    const runId = 1;

    await workflow.reserveForRun(runId, ethers.parseEther("4"));
    await workflow.recordConsumption(runId, ethers.parseEther("2"));
    await workflow.anchorCommitment(runId, spineCommitment);
    await workflow.connect(provider).verifyResult(runId);
    await workflow.grantEligibility(runId);
    await workflow.settleFromReservedValue(runId, ethers.parseEther("1"));

    const run = await workflow.runs(runId);

    const total = await reservable.totalValue(tokenId, asset.address);
    const locked = await reservable.lockedValue(tokenId, asset.address);
    const available = await reservable.availableValue(tokenId, asset.address);

    await checker.assertReservableAccounting(
      await reservable.getAddress(),
      tokenId,
      asset.address
    );

    await checker.assertAuthorityCursor(run.consumed, run.authorityLimit);
    await checker.assertSettlementBound(run.settledValue, ethers.parseEther("4"));

    console.log("");
    console.log("============================================================");
    console.log("TEN.IO ERC Composition Report");
    console.log("============================================================");
    console.log("ERC-8004 / ERC-8217 Identity Binding:     PASS");
    console.log("ERC-8281 Input Provenance:                PASS");
    console.log("ERC-8299 WYRIWE-style Spine Commitment:   PASS");
    console.log("ERC-8001 Authority Envelope:              PASS");
    console.log("ERC-8312 Consumption Cursor:              PASS");
    console.log("ERC-8301 Workflow State Machine:          PASS");
    console.log("ERC-8263 Commitment Anchor:               PASS");
    console.log("ERC-8274 Verification Layer:              PASS");
    console.log("ReceiptOS Eligibility Gate:               PASS");
    console.log("ERC-8275 Settlement Layer:                PASS");
    console.log("ERC-8060 Embedded Value Layer:            PASS");
    console.log("IERC8060Reservable Reservation Layer:     PASS");
    console.log("------------------------------------------------------------");
    console.log("authorityLimit:", ethers.formatEther(run.authorityLimit), "ETH");
    console.log("consumed:", ethers.formatEther(run.consumed), "ETH");
    console.log("initiallyReserved:", "4.0 ETH");
    console.log("settledValue:", ethers.formatEther(run.settledValue), "ETH");
    console.log("lockedValue:", ethers.formatEther(locked), "ETH");
    console.log("availableValue:", ethers.formatEther(available), "ETH");
    console.log("totalValue:", ethers.formatEther(total), "ETH");
    console.log("workflowState:", run.state.toString(), "(Settled)");
    console.log("verified:", run.verified);
    console.log("eligible:", run.eligible);
    console.log("accountingInvariant:", "locked + available == total");
    console.log("============================================================");
    console.log("");

    expect(run.state).to.equal(5n);
    expect(run.verified).to.equal(true);
    expect(run.eligible).to.equal(true);
    expect(locked + available).to.equal(total);
  });
});