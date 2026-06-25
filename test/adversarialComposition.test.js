const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Adversarial composition: bypass and corruption attempts", function () {
  let identity;
  let reservable;
  let workflow;
  let owner;
  let provider;
  let attacker;
  let asset;

  const tokenId = 1;

  beforeEach(async function () {
    [owner, provider, attacker, asset] = await ethers.getSigners();

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

  it("attacker cannot reserve value through workflow owned by another consumer", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await expect(
      workflow.connect(attacker).reserveForRun(1, ethers.parseEther("1"))
    ).to.be.revertedWith("ONLY_CONSUMER");
  });

  it("attacker cannot advance cursor for another consumer workflow", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await expect(
      workflow.connect(attacker).recordConsumption(1, ethers.parseEther("1"))
    ).to.be.revertedWith("ONLY_CONSUMER");
  });

  it("attacker cannot anchor a fake commitment into another workflow", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await expect(
      workflow.connect(attacker).anchorCommitment(
        1,
        ethers.keccak256(ethers.toUtf8Bytes("fake-spine"))
      )
    ).to.be.revertedWith("ONLY_CONSUMER");
  });

  it("attacker cannot verify as provider", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await workflow.anchorCommitment(
      1,
      ethers.keccak256(ethers.toUtf8Bytes("valid-anchor"))
    );

    await expect(
      workflow.connect(attacker).verifyResult(1)
    ).to.be.revertedWith("ONLY_PROVIDER");
  });

  it("attacker cannot settle before eligibility even if value is locked", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await workflow.reserveForRun(1, ethers.parseEther("2"));

    await expect(
      workflow.connect(attacker).settleFromReservedValue(1, ethers.parseEther("1"))
    ).to.be.revertedWith("NOT_ELIGIBLE");
  });

  it("fake identity commitment cannot be used before registered input", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("fake-agent"));

    await expect(
      identity.commitSpine(
        agentId,
        ethers.keccak256(ethers.toUtf8Bytes("fake-model")),
        ethers.keccak256(ethers.toUtf8Bytes("fake-output")),
        1
      )
    ).to.be.revertedWith("UNKNOWN_AGENT");
  });

  it("attacker cannot overwrite registered agent identity", async function () {
    const agentId = ethers.keccak256(ethers.toUtf8Bytes("agent-fixed"));

    await identity.registerAgent(
      agentId,
      owner.address,
      await reservable.getAddress(),
      tokenId
    );

    await expect(
      identity.connect(attacker).registerAgent(
        agentId,
        attacker.address,
        await reservable.getAddress(),
        tokenId
      )
    ).to.be.revertedWith("AGENT_EXISTS");
  });

  it("commitment spine cannot be zero through workflow anchor", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await expect(
      workflow.anchorCommitment(1, ethers.ZeroHash)
    ).to.be.revertedWith("INVALID_COMMITMENT");
  });

  it("authority cannot be bypassed by reserving more value than authority after consumption", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

    await workflow.recordConsumption(1, ethers.parseEther("1"));

    await workflow.reserveForRun(1, ethers.parseEther("5"));

    const run = await workflow.runs(1);

    expect(run.consumed).to.equal(run.authorityLimit);
    expect(await workflow.lockedValue(1)).to.equal(ethers.parseEther("5"));
  });

  it("shows authority exhaustion and reservation are intentionally separate not bypasses", async function () {
    await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

    await workflow.recordConsumption(1, ethers.parseEther("1"));

    await expect(
      workflow.recordConsumption(1, 1)
    ).to.be.revertedWith("AUTHORITY_LIMIT_EXCEEDED");

    await workflow.reserveForRun(1, ethers.parseEther("2"));

    expect(await workflow.lockedValue(1)).to.equal(ethers.parseEther("2"));
  });
});