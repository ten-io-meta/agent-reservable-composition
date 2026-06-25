const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Invalid sequence stress: layer bypass protection", function () {
  let reservable;
  let harness;
  let consumer;
  let provider;
  let attacker;
  let asset;

  const tokenId = 1;
  const TOTAL = ethers.parseEther("50");

  beforeEach(async function () {
    [consumer, provider, attacker, asset] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const Harness = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    harness = await Harness.deploy(await reservable.getAddress());
    await harness.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, TOTAL);

    await reservable.approveReserve(
      tokenId,
      await harness.getAddress(),
      asset.address,
      TOTAL
    );
  });

  async function createSettledRun(runId) {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(runId, ethers.parseEther("1"));
    await harness.recordConsumption(runId, ethers.parseEther("0.5"));
    await harness.anchorCommitment(
      runId,
      ethers.keccak256(ethers.toUtf8Bytes(`settled-${runId}`))
    );
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("0.25"));
  }

  it("rejects reserve after settlement", async function () {
    await createSettledRun(1);

    await expect(
      harness.reserveForRun(1, ethers.parseEther("0.1"))
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("rejects anchor after settlement", async function () {
    await createSettledRun(1);

    await expect(
      harness.anchorCommitment(
        1,
        ethers.keccak256(ethers.toUtf8Bytes("anchor-after-settle"))
      )
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("rejects verification after settlement", async function () {
    await createSettledRun(1);

    await expect(
      harness.connect(provider).verifyResult(1)
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("rejects eligibility after settlement", async function () {
    await createSettledRun(1);

    await expect(
      harness.grantEligibility(1)
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("rejects second settlement after settlement", async function () {
    await createSettledRun(1);

    await expect(
      harness.settleFromReservedValue(1, ethers.parseEther("0.1"))
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("rejects attacker reserve on consumer-owned workflow", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await expect(
      harness.connect(attacker).reserveForRun(1, ethers.parseEther("0.1"))
    ).to.be.revertedWith("ONLY_CONSUMER");
  });

  it("rejects attacker consumption on consumer-owned workflow", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await expect(
      harness.connect(attacker).recordConsumption(1, ethers.parseEther("0.1"))
    ).to.be.revertedWith("ONLY_CONSUMER");
  });

  it("rejects attacker anchoring on consumer-owned workflow", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await expect(
      harness.connect(attacker).anchorCommitment(
        1,
        ethers.keccak256(ethers.toUtf8Bytes("attacker-anchor"))
      )
    ).to.be.revertedWith("ONLY_CONSUMER");
  });

  it("rejects attacker verification when not provider", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.anchorCommitment(
      1,
      ethers.keccak256(ethers.toUtf8Bytes("attacker-verify"))
    );

    await expect(
      harness.connect(attacker).verifyResult(1)
    ).to.be.revertedWith("ONLY_PROVIDER");
  });

  it("rejects direct workflow settlement without reservable lock", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.anchorCommitment(
      1,
      ethers.keccak256(ethers.toUtf8Bytes("no-lock-settlement"))
    );
    await harness.connect(provider).verifyResult(1);
    await harness.grantEligibility(1);

    await expect(
      harness.settleFromReservedValue(1, ethers.parseEther("0.1"))
    ).to.be.revertedWith("release exceeds locked value");
  });
});