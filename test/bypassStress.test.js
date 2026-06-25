const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Bypass stress: repeated invalid paths across many runs", function () {
  let reservable;
  let workflow;
  let consumer;
  let provider;
  let attacker;
  let asset;

  const tokenId = 1;
  const TOTAL = ethers.parseEther("100");

  beforeEach(async function () {
    [consumer, provider, attacker, asset] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const Workflow = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    workflow = await Workflow.deploy(await reservable.getAddress());
    await workflow.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, TOTAL);

    await reservable.approveReserve(
      tokenId,
      await workflow.getAddress(),
      asset.address,
      TOTAL
    );
  });

  it("rejects attacker attempts to reserve across 25 workflows", async function () {
    for (let i = 1; i <= 25; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await expect(
        workflow.connect(attacker).reserveForRun(i, ethers.parseEther("0.01"))
      ).to.be.revertedWith("ONLY_CONSUMER");
    }
  });

  it("rejects attacker attempts to advance cursor across 25 workflows", async function () {
    for (let i = 1; i <= 25; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await expect(
        workflow.connect(attacker).recordConsumption(i, ethers.parseEther("0.01"))
      ).to.be.revertedWith("ONLY_CONSUMER");
    }
  });

  it("rejects attacker attempts to anchor commitments across 25 workflows", async function () {
    for (let i = 1; i <= 25; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await expect(
        workflow.connect(attacker).anchorCommitment(
          i,
          ethers.keccak256(ethers.toUtf8Bytes(`attacker-anchor-${i}`))
        )
      ).to.be.revertedWith("ONLY_CONSUMER");
    }
  });

  it("rejects wrong provider verification across 25 workflows", async function () {
    for (let i = 1; i <= 25; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await workflow.anchorCommitment(
        i,
        ethers.keccak256(ethers.toUtf8Bytes(`wrong-provider-${i}`))
      );

      await expect(
        workflow.connect(attacker).verifyResult(i)
      ).to.be.revertedWith("ONLY_PROVIDER");
    }
  });

  it("rejects settlement before eligibility across 25 workflows", async function () {
    for (let i = 1; i <= 25; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
      await workflow.reserveForRun(i, ethers.parseEther("0.01"));

      await expect(
        workflow.settleFromReservedValue(i, ethers.parseEther("0.005"))
      ).to.be.revertedWith("NOT_ELIGIBLE");
    }
  });

  it("rejects repeated settlement across 25 finalized workflows", async function () {
    for (let i = 1; i <= 25; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
      await workflow.reserveForRun(i, ethers.parseEther("0.01"));
      await workflow.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`finalized-${i}`)));
      await workflow.connect(provider).verifyResult(i);
      await workflow.grantEligibility(i);
      await workflow.settleFromReservedValue(i, ethers.parseEther("0.005"));

      await expect(
        workflow.settleFromReservedValue(i, ethers.parseEther("0.001"))
      ).to.be.revertedWith("INVALID_STATE");
    }
  });

  it("rejects repeated anchoring across 25 anchored workflows", async function () {
    for (let i = 1; i <= 25; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await workflow.anchorCommitment(i, ethers.keccak256(ethers.toUtf8Bytes(`first-${i}`)));

      await expect(
        workflow.anchorCommitment(
          i,
          ethers.keccak256(ethers.toUtf8Bytes(`second-${i}`))
        )
      ).to.be.revertedWith("INVALID_STATE");
    }
  });

  it("rejects empty commitments across 25 workflows", async function () {
    for (let i = 1; i <= 25; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await expect(
        workflow.anchorCommitment(i, ethers.ZeroHash)
      ).to.be.revertedWith("INVALID_COMMITMENT");
    }
  });

  it("rejects authority overrun across 25 workflows", async function () {
    for (let i = 1; i <= 25; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("0.01"));
      await workflow.recordConsumption(i, ethers.parseEther("0.01"));

      await expect(
        workflow.recordConsumption(i, 1)
      ).to.be.revertedWith("AUTHORITY_LIMIT_EXCEEDED");
    }
  });

  it("preserves global accounting after repeated failed bypass attempts", async function () {
    for (let i = 1; i <= 25; i++) {
      await workflow.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));

      await expect(
        workflow.connect(attacker).reserveForRun(i, ethers.parseEther("0.01"))
      ).to.be.revertedWith("ONLY_CONSUMER");

      await expect(
        workflow.connect(attacker).recordConsumption(i, ethers.parseEther("0.01"))
      ).to.be.revertedWith("ONLY_CONSUMER");

      await workflow.reserveForRun(i, ethers.parseEther("0.01"));
    }

    const locked = await reservable.lockedValue(tokenId, asset.address);
    const available = await reservable.availableValue(tokenId, asset.address);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(locked + available).to.equal(total);
  });
});