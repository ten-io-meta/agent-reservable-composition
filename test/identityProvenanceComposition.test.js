const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Identity provenance and WYRIWE-style spine composition", function () {
  let identity;
  let reservable;
  let workflow;
  let owner;
  let provider;
  let asset;

  const tokenId = 1;

  beforeEach(async function () {
    [owner, provider, asset] = await ethers.getSigners();

    const Identity = await ethers.getContractFactory("AgentIdentityProvenanceHarness");
    identity = await Identity.deploy();
    await identity.waitForDeployment();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const Workflow = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    workflow = await Workflow.deploy(await reservable.getAddress());
    await workflow.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, ethers.parseEther("10"));
    await reservable.approveReserve(
      tokenId,
      await workflow.getAddress(),
      asset.address,
      ethers.parseEther("10")
    );
  });

  it("binds agent identity, input provenance, spine commitment and reservable workflow", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-8004-8217"));
    const sourceContract = await reservable.getAddress();

    await identity.registerAgent(agentId, owner.address, sourceContract, tokenId);

    const inputHash = ethers.keccak256(ethers.toUtf8Bytes("input-provenance-8281"));
    await identity.commitInput(agentId, inputHash);

    const modelHash = ethers.keccak256(ethers.toUtf8Bytes("model-hash"));
    const outputHash = ethers.keccak256(ethers.toUtf8Bytes("output-hash"));

    const tx = await identity.commitSpine(agentId, modelHash, outputHash, 123456);
    await tx.wait();

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

    expect(await identity.isAgentActive(agentId)).to.equal(true);
    expect(run.commitmentHash).to.equal(spineCommitment);
    expect(run.verified).to.equal(true);
    expect(run.eligible).to.equal(true);
    expect(run.state).to.equal(5n);
    expect(await workflow.lockedValue(runId)).to.equal(ethers.parseEther("3"));
  });

  it("rejects input provenance for unknown agent", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("unknown-agent"));
    const inputHash = ethers.keccak256(ethers.toUtf8Bytes("input"));

    await expect(
      identity.commitInput(agentId, inputHash)
    ).to.be.revertedWith("UNKNOWN_AGENT");
  });

  it("rejects spine commitment before input provenance", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-no-input"));

    await identity.registerAgent(
      agentId,
      owner.address,
      await reservable.getAddress(),
      tokenId
    );

    await expect(
      identity.commitSpine(
        agentId,
        ethers.keccak256(ethers.toUtf8Bytes("model")),
        ethers.keccak256(ethers.toUtf8Bytes("output")),
        1
      )
    ).to.be.revertedWith("NO_INPUT");
  });

  it("rejects duplicate agent identity registration", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("duplicate-agent"));

    await identity.registerAgent(
      agentId,
      owner.address,
      await reservable.getAddress(),
      tokenId
    );

    await expect(
      identity.registerAgent(
        agentId,
        owner.address,
        await reservable.getAddress(),
        tokenId
      )
    ).to.be.revertedWith("AGENT_EXISTS");
  });

  it("keeps identity provenance independent from reservable accounting", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("independent-agent"));

    await identity.registerAgent(
      agentId,
      owner.address,
      await reservable.getAddress(),
      tokenId
    );

    await identity.commitInput(
      agentId,
      ethers.keccak256(ethers.toUtf8Bytes("input"))
    );

    const lockedBefore = await reservable.lockedValue(tokenId, asset.address);
    const availableBefore = await reservable.availableValue(tokenId, asset.address);

    await identity.commitSpine(
      agentId,
      ethers.keccak256(ethers.toUtf8Bytes("model")),
      ethers.keccak256(ethers.toUtf8Bytes("output")),
      1
    );

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(lockedBefore);
    expect(await reservable.availableValue(tokenId, asset.address)).to.equal(availableBefore);
  });
});