const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Negative invariant cases: checker detects simulated corruption", function () {
  let checker;
  let consumer;
  let provider;
  let attacker;
  let asset;

  beforeEach(async function () {
    [consumer, provider, attacker, asset] = await ethers.getSigners();

    const Checker = await ethers.getContractFactory("CompositionInvariantChecker");
    checker = await Checker.deploy();
    await checker.waitForDeployment();
  });

  it("detects authority cursor overflow by one wei", async function () {
    await expect(
      checker.assertAuthorityCursor(
        ethers.parseEther("1") + 1n,
        ethers.parseEther("1")
      )
    ).to.be.revertedWith("CONSUMPTION_EXCEEDS_AUTHORITY");
  });

  it("detects settlement overflow by one wei", async function () {
    await expect(
      checker.assertSettlementBound(
        ethers.parseEther("1") + 1n,
        ethers.parseEther("1")
      )
    ).to.be.revertedWith("SETTLEMENT_EXCEEDS_RESERVED");
  });

  it("detects state regression from settled to eligible", async function () {
    await expect(
      checker.assertStateDoesNotRegress(5, 4)
    ).to.be.revertedWith("STATE_REGRESSION");
  });

  it("detects state regression from verified to anchored", async function () {
    await expect(
      checker.assertStateDoesNotRegress(3, 2)
    ).to.be.revertedWith("STATE_REGRESSION");
  });

  it("detects consumer mutation", async function () {
    await expect(
      checker.assertIdentityStable(
        consumer.address,
        attacker.address,
        provider.address,
        provider.address,
        1,
        1,
        asset.address,
        asset.address
      )
    ).to.be.revertedWith("CONSUMER_MUTATED");
  });

  it("detects provider mutation", async function () {
    await expect(
      checker.assertIdentityStable(
        consumer.address,
        consumer.address,
        provider.address,
        attacker.address,
        1,
        1,
        asset.address,
        asset.address
      )
    ).to.be.revertedWith("PROVIDER_MUTATED");
  });

  it("detects token mutation", async function () {
    await expect(
      checker.assertIdentityStable(
        consumer.address,
        consumer.address,
        provider.address,
        provider.address,
        1,
        2,
        asset.address,
        asset.address
      )
    ).to.be.revertedWith("TOKEN_MUTATED");
  });

  it("detects asset mutation", async function () {
    await expect(
      checker.assertIdentityStable(
        consumer.address,
        consumer.address,
        provider.address,
        provider.address,
        1,
        1,
        asset.address,
        attacker.address
      )
    ).to.be.revertedWith("ASSET_MUTATED");
  });

  it("allows equal consumed and authority at exact boundary", async function () {
    expect(
      await checker.assertAuthorityCursor(
        ethers.parseEther("1"),
        ethers.parseEther("1")
      )
    ).to.equal(true);
  });

  it("allows equal settlement and reserved at exact boundary", async function () {
    expect(
      await checker.assertSettlementBound(
        ethers.parseEther("1"),
        ethers.parseEther("1")
      )
    ).to.equal(true);
  });
});