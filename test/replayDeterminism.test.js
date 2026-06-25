const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Replay determinism: same inputs produce same references and state", function () {
  let identityA;
  let identityB;
  let reservableA;
  let reservableB;
  let workflowA;
  let workflowB;
  let consumer;
  let provider;
  let asset;

  const tokenId = 1;

  beforeEach(async function () {
    [consumer, provider, asset] = await ethers.getSigners();

    const Identity = await ethers.getContractFactory("AgentIdentityProvenanceHarness");
    identityA = await Identity.deploy();
    await identityA.waitForDeployment();

    identityB = await Identity.deploy();
    await identityB.waitForDeployment();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservableA = await Reservable.deploy();
    await reservableA.waitForDeployment();

    reservableB = await Reservable.deploy();
    await reservableB.waitForDeployment();

    const Workflow = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    workflowA = await Workflow.deploy(await reservableA.getAddress());
    await workflowA.waitForDeployment();

    workflowB = await Workflow.deploy(await reservableB.getAddress());
    await workflowB.waitForDeployment();

    await reservableA.mintValue(tokenId, asset.address, ethers.parseEther("10"));
    await reservableB.mintValue(tokenId, asset.address, ethers.parseEther("10"));

    await reservableA.approveReserve(
      tokenId,
      await workflowA.getAddress(),
      asset.address,
      ethers.parseEther("10")
    );

    await reservableB.approveReserve(
      tokenId,
      await workflowB.getAddress(),
      asset.address,
      ethers.parseEther("10")
    );
  });

  async function executeReplay(identity, workflow, reservable, label) {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-replay"));
    const sourceContract = await reservable.getAddress();

    await identity.registerAgent(agentId, consumer.address, sourceContract, tokenId);

    const inputHash = ethers.keccak256(ethers.toUtf8Bytes("same-input"));
    const modelHash = ethers.keccak256(ethers.toUtf8Bytes("same-model"));
    const outputHash = ethers.keccak256(ethers.toUtf8Bytes("same-output"));
    const timestamp = 777;

    await identity.commitInput(agentId, inputHash);
    await identity.commitSpine(agentId, modelHash, outputHash, timestamp);

    const spineCommitment = await identity.spineCommitments(agentId);

    await workflow.createRun(
      provider.address,
      tokenId,
      asset.address,
      ethers.parseEther("10")
    );

    await workflow.reserveForRun(1, ethers.parseEther("4"));
    await workflow.recordConsumption(1, ethers.parseEther("2"));
    await workflow.anchorCommitment(1, spineCommitment);
    await workflow.connect(provider).verifyResult(1);
    await workflow.grantEligibility(1);
    await workflow.settleFromReservedValue(1, ethers.parseEther("1"));

    const run = await workflow.runs(1);
    const locked = await reservable.lockedValue(tokenId, asset.address);
    const available = await reservable.availableValue(tokenId, asset.address);
    const total = await reservable.totalValue(tokenId, asset.address);

    return {
      label,
      spineCommitment,
      authorityLimit: run.authorityLimit,
      consumed: run.consumed,
      settledValue: run.settledValue,
      commitmentHash: run.commitmentHash,
      verified: run.verified,
      eligible: run.eligible,
      state: run.state,
      locked,
      available,
      total
    };
  }

  it("replays identical workflow inputs with identical logical outputs", async function () {
    const a = await executeReplay(identityA, workflowA, reservableA, "A");
    const b = await executeReplay(identityB, workflowB, reservableB, "B");

    expect(a.spineCommitment).to.equal(b.spineCommitment);
    expect(a.authorityLimit).to.equal(b.authorityLimit);
    expect(a.consumed).to.equal(b.consumed);
    expect(a.settledValue).to.equal(b.settledValue);
    expect(a.commitmentHash).to.equal(b.commitmentHash);
    expect(a.verified).to.equal(b.verified);
    expect(a.eligible).to.equal(b.eligible);
    expect(a.state).to.equal(b.state);
    expect(a.locked).to.equal(b.locked);
    expect(a.available).to.equal(b.available);
    expect(a.total).to.equal(b.total);
  });

  it("produces different spine commitment when input changes", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-replay-diff"));

    await identityA.registerAgent(agentId, consumer.address, await reservableA.getAddress(), tokenId);
    await identityB.registerAgent(agentId, consumer.address, await reservableB.getAddress(), tokenId);

    await identityA.commitInput(agentId, ethers.keccak256(ethers.toUtf8Bytes("input-A")));
    await identityB.commitInput(agentId, ethers.keccak256(ethers.toUtf8Bytes("input-B")));

    const modelHash = ethers.keccak256(ethers.toUtf8Bytes("same-model"));
    const outputHash = ethers.keccak256(ethers.toUtf8Bytes("same-output"));

    await identityA.commitSpine(agentId, modelHash, outputHash, 1);
    await identityB.commitSpine(agentId, modelHash, outputHash, 1);

    expect(await identityA.spineCommitments(agentId)).to.not.equal(
      await identityB.spineCommitments(agentId)
    );
  });

  it("produces different spine commitment when model changes", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-model-diff"));

    await identityA.registerAgent(agentId, consumer.address, await reservableA.getAddress(), tokenId);
    await identityB.registerAgent(agentId, consumer.address, await reservableB.getAddress(), tokenId);

    const inputHash = ethers.keccak256(ethers.toUtf8Bytes("same-input"));
    await identityA.commitInput(agentId, inputHash);
    await identityB.commitInput(agentId, inputHash);

    const outputHash = ethers.keccak256(ethers.toUtf8Bytes("same-output"));

    await identityA.commitSpine(
      agentId,
      ethers.keccak256(ethers.toUtf8Bytes("model-A")),
      outputHash,
      1
    );

    await identityB.commitSpine(
      agentId,
      ethers.keccak256(ethers.toUtf8Bytes("model-B")),
      outputHash,
      1
    );

    expect(await identityA.spineCommitments(agentId)).to.not.equal(
      await identityB.spineCommitments(agentId)
    );
  });

  it("produces different spine commitment when output changes", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-output-diff"));

    await identityA.registerAgent(agentId, consumer.address, await reservableA.getAddress(), tokenId);
    await identityB.registerAgent(agentId, consumer.address, await reservableB.getAddress(), tokenId);

    const inputHash = ethers.keccak256(ethers.toUtf8Bytes("same-input"));
    const modelHash = ethers.keccak256(ethers.toUtf8Bytes("same-model"));

    await identityA.commitInput(agentId, inputHash);
    await identityB.commitInput(agentId, inputHash);

    await identityA.commitSpine(
      agentId,
      modelHash,
      ethers.keccak256(ethers.toUtf8Bytes("output-A")),
      1
    );

    await identityB.commitSpine(
      agentId,
      modelHash,
      ethers.keccak256(ethers.toUtf8Bytes("output-B")),
      1
    );

    expect(await identityA.spineCommitments(agentId)).to.not.equal(
      await identityB.spineCommitments(agentId)
    );
  });

  it("produces different spine commitment when timestamp changes", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-time-diff"));

    await identityA.registerAgent(agentId, consumer.address, await reservableA.getAddress(), tokenId);
    await identityB.registerAgent(agentId, consumer.address, await reservableB.getAddress(), tokenId);

    const inputHash = ethers.keccak256(ethers.toUtf8Bytes("same-input"));
    const modelHash = ethers.keccak256(ethers.toUtf8Bytes("same-model"));
    const outputHash = ethers.keccak256(ethers.toUtf8Bytes("same-output"));

    await identityA.commitInput(agentId, inputHash);
    await identityB.commitInput(agentId, inputHash);

    await identityA.commitSpine(agentId, modelHash, outputHash, 1);
    await identityB.commitSpine(agentId, modelHash, outputHash, 2);

    expect(await identityA.spineCommitments(agentId)).to.not.equal(
      await identityB.spineCommitments(agentId)
    );
  });
});