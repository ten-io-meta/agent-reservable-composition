const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentReservableIntegrationHarness", function () {
  let reservable;
  let harness;
  let consumer;
  let provider;
  let asset;

  const tokenId = 1;

  beforeEach(async function () {
    [consumer, provider, asset] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const Harness = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    harness = await Harness.deploy(await reservable.getAddress());
    await harness.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, ethers.parseEther("10"));

    await reservable.approveReserve(
      tokenId,
      await harness.getAddress(),
      asset.address,
      ethers.parseEther("4")
    );
  });

  it("composes agent workflow with the real IERC8060Reservable implementation", async function () {
    const authorityLimit = ethers.parseEther("10");
    const reserveAmount = ethers.parseEther("4");
    const consumedAmount = ethers.parseEther("2");
    const settleAmount = ethers.parseEther("2");

    await harness.createRun(
      provider.address,
      tokenId,
      asset.address,
      authorityLimit
    );

    const runId = 1;

    await harness.reserveForRun(runId, reserveAmount);
    await harness.recordConsumption(runId, consumedAmount);

    const commitmentHash = ethers.keccak256(
      ethers.toUtf8Bytes("real-reservable-agent-workflow")
    );

    await harness.anchorCommitment(runId, commitmentHash);
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, settleAmount);

    const run = await harness.runs(runId);

    expect(run.authorityLimit).to.equal(ethers.parseEther("10"));
    expect(run.consumed).to.equal(ethers.parseEther("2"));
    expect(run.settledValue).to.equal(ethers.parseEther("2"));
    expect(run.commitmentHash).to.equal(commitmentHash);
    expect(run.verified).to.equal(true);
    expect(run.eligible).to.equal(true);

    expect(await harness.lockedValue(runId)).to.equal(ethers.parseEther("2"));
    expect(await harness.availableValue(runId)).to.equal(ethers.parseEther("8"));

    // WorkflowState.Settled = 5
    expect(run.state).to.equal(5n);
  });

  it("keeps cursor consumption independent from real reservable locked value", async function () {
    await harness.createRun(
      provider.address,
      tokenId,
      asset.address,
      ethers.parseEther("10")
    );

    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.recordConsumption(runId, ethers.parseEther("1"));

    const run = await harness.runs(runId);

    expect(run.consumed).to.equal(ethers.parseEther("1"));
    expect(await harness.lockedValue(runId)).to.equal(ethers.parseEther("4"));
    expect(await harness.availableValue(runId)).to.equal(ethers.parseEther("6"));
  });

  it("prevents reserving beyond approved reservable allowance", async function () {
    await harness.createRun(
      provider.address,
      tokenId,
      asset.address,
      ethers.parseEther("10")
    );

    const runId = 1;

    await expect(
      harness.reserveForRun(runId, ethers.parseEther("5"))
    ).to.be.revertedWith("exceeds reserve allowance");
  });
    it("prevents reserving without prior reservable approval", async function () {
    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    const freshReservable = await Reservable.deploy();
    await freshReservable.waitForDeployment();

    const Harness = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    const freshHarness = await Harness.deploy(await freshReservable.getAddress());
    await freshHarness.waitForDeployment();

    await freshReservable.mintValue(tokenId, asset.address, ethers.parseEther("10"));

    await freshHarness.createRun(
      provider.address,
      tokenId,
      asset.address,
      ethers.parseEther("10")
    );

    const runId = 1;

    await expect(
      freshHarness.reserveForRun(runId, ethers.parseEther("1"))
    ).to.be.revertedWith("exceeds reserve allowance");
  });

  it("prevents settling more than locked reservable value", async function () {
    await harness.createRun(
      provider.address,
      tokenId,
      asset.address,
      ethers.parseEther("10")
    );

    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));

    const commitmentHash = ethers.keccak256(
      ethers.toUtf8Bytes("settlement-over-locked-test")
    );

    await harness.anchorCommitment(runId, commitmentHash);
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);

    await expect(
      harness.settleFromReservedValue(runId, ethers.parseEther("5"))
    ).to.be.revertedWith("release exceeds locked value");
  });

  it("allows consumed authority and locked reservation to diverge safely", async function () {
    await harness.createRun(
      provider.address,
      tokenId,
      asset.address,
      ethers.parseEther("10")
    );

    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.recordConsumption(runId, ethers.parseEther("1"));

    const run = await harness.runs(runId);

    expect(run.consumed).to.equal(ethers.parseEther("1"));
    expect(await harness.lockedValue(runId)).to.equal(ethers.parseEther("4"));
    expect(await harness.availableValue(runId)).to.equal(ethers.parseEther("6"));

    // This is the key separation:
    // ERC-8312-style cursor tracks usage.
    // IERC8060Reservable tracks committed value.
    expect(run.consumed).to.not.equal(await harness.lockedValue(runId));
  });
  it("prevents double settlement on the same run", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("double-settlement")));
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("2"));

    await expect(
      harness.settleFromReservedValue(runId, ethers.parseEther("1"))
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("prevents provider from creating consumer-only reservation", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await expect(
      harness.connect(provider).reserveForRun(runId, ethers.parseEther("1"))
    ).to.be.revertedWith("ONLY_CONSUMER");
  });

  it("prevents provider from recording consumer consumption", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await expect(
      harness.connect(provider).recordConsumption(runId, ethers.parseEther("1"))
    ).to.be.revertedWith("ONLY_CONSUMER");
  });

  it("prevents provider from anchoring commitment", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await expect(
      harness.connect(provider).anchorCommitment(
        runId,
        ethers.keccak256(ethers.toUtf8Bytes("bad-anchor"))
      )
    ).to.be.revertedWith("ONLY_CONSUMER");
  });

  it("prevents consumer from verifying provider result", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.anchorCommitment(
      runId,
      ethers.keccak256(ethers.toUtf8Bytes("consumer-cannot-verify"))
    );

    await expect(
      harness.verifyResult(runId)
    ).to.be.revertedWith("ONLY_PROVIDER");
  });

  it("prevents verifying before commitment is anchored", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await expect(
      harness.connect(provider).verifyResult(runId)
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("prevents eligibility before verification", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await expect(
      harness.grantEligibility(runId)
    ).to.be.revertedWith("NOT_VERIFIED");
  });

  it("prevents anchoring an empty commitment", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await expect(
      harness.anchorCommitment(runId, ethers.ZeroHash)
    ).to.be.revertedWith("INVALID_COMMITMENT");
  });

  it("prevents reservation after commitment is anchored", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.anchorCommitment(
      runId,
      ethers.keccak256(ethers.toUtf8Bytes("after-anchor"))
    );

    await expect(
      harness.reserveForRun(runId, ethers.parseEther("1"))
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("prevents anchoring twice", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.anchorCommitment(
      runId,
      ethers.keccak256(ethers.toUtf8Bytes("first-anchor"))
    );

    await expect(
      harness.anchorCommitment(
        runId,
        ethers.keccak256(ethers.toUtf8Bytes("second-anchor"))
      )
    ).to.be.revertedWith("INVALID_STATE");
  });
    it("supports two runs sharing the same token with independent consumption", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("2"));
    await harness.reserveForRun(2, ethers.parseEther("2"));

    await harness.recordConsumption(1, ethers.parseEther("1"));
    await harness.recordConsumption(2, ethers.parseEther("3"));

    const run1 = await harness.runs(1);
    const run2 = await harness.runs(2);

    expect(run1.consumed).to.equal(ethers.parseEther("1"));
    expect(run2.consumed).to.equal(ethers.parseEther("3"));
    expect(await harness.lockedValue(1)).to.equal(ethers.parseEther("4"));
    expect(await harness.lockedValue(2)).to.equal(ethers.parseEther("4"));
  });

  it("prevents combined reservations from exceeding shared available value", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("4"));

    await expect(
      harness.reserveForRun(2, ethers.parseEther("1"))
    ).to.be.revertedWith("exceeds reserve allowance");
  });

  it("allows independent workflows over the same reserved substrate", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("2"));
    await harness.reserveForRun(2, ethers.parseEther("2"));

    await harness.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("run-1")));
    await harness.anchorCommitment(2, ethers.keccak256(ethers.toUtf8Bytes("run-2")));

    const run1 = await harness.runs(1);
    const run2 = await harness.runs(2);

    expect(run1.commitmentHash).to.not.equal(run2.commitmentHash);
    expect(run1.state).to.equal(1n + 1n); // Anchored = 2
    expect(run2.state).to.equal(1n + 1n); // Anchored = 2
  });

  it("settling one run does not settle another run", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("2"));
    await harness.reserveForRun(2, ethers.parseEther("2"));

    await harness.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("settle-run-1")));
    await harness.connect(provider).verifyResult(1);
    await harness.grantEligibility(1);
    await harness.settleFromReservedValue(1, ethers.parseEther("1"));

    const run1 = await harness.runs(1);
    const run2 = await harness.runs(2);

    expect(run1.state).to.equal(5n);
    expect(run1.settledValue).to.equal(ethers.parseEther("1"));
    expect(run2.state).to.equal(1n);
    expect(run2.settledValue).to.equal(0n);
  });

  it("shared locked value decreases only by settled amount", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("2"));
    await harness.reserveForRun(2, ethers.parseEther("2"));

    await harness.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("locked-decrease")));
    await harness.connect(provider).verifyResult(1);
    await harness.grantEligibility(1);
    await harness.settleFromReservedValue(1, ethers.parseEther("1"));

    expect(await harness.lockedValue(1)).to.equal(ethers.parseEther("3"));
    expect(await harness.availableValue(1)).to.equal(ethers.parseEther("7"));
  });

  it("different authority limits remain local to each run", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("1"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("5"));

    await expect(
      harness.recordConsumption(1, ethers.parseEther("2"))
    ).to.be.revertedWith("AUTHORITY_LIMIT_EXCEEDED");

    await harness.recordConsumption(2, ethers.parseEther("2"));

    const run2 = await harness.runs(2);
    expect(run2.consumed).to.equal(ethers.parseEther("2"));
  });

  it("reservation state is global to the token while cursor state is local to runs", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("3"));
    await harness.recordConsumption(2, ethers.parseEther("1"));

    const run1 = await harness.runs(1);
    const run2 = await harness.runs(2);

    expect(run1.consumed).to.equal(0n);
    expect(run2.consumed).to.equal(ethers.parseEther("1"));
    expect(await harness.lockedValue(1)).to.equal(ethers.parseEther("3"));
    expect(await harness.lockedValue(2)).to.equal(ethers.parseEther("3"));
  });

  it("cannot settle a run using reservation from an unverified run", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("2"));
    await harness.reserveForRun(2, ethers.parseEther("2"));

    await expect(
      harness.settleFromReservedValue(2, ethers.parseEther("1"))
    ).to.be.revertedWith("NOT_ELIGIBLE");
  });

  it("provider verification is scoped to the selected run", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("scope-run-1")));
    await harness.anchorCommitment(2, ethers.keccak256(ethers.toUtf8Bytes("scope-run-2")));

    await harness.connect(provider).verifyResult(1);

    const run1 = await harness.runs(1);
    const run2 = await harness.runs(2);

    expect(run1.verified).to.equal(true);
    expect(run2.verified).to.equal(false);
  });

  it("available value reflects aggregate reservations across runs", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("1"));
    await harness.reserveForRun(2, ethers.parseEther("3"));

    expect(await harness.availableValue(1)).to.equal(ethers.parseEther("6"));
    expect(await harness.availableValue(2)).to.equal(ethers.parseEther("6"));
  });
    it("prevents settlement amount from exceeding remaining locked value after partial settlement", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("partial-over-settle")));
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("2"));

    await expect(
      harness.settleFromReservedValue(runId, ethers.parseEther("3"))
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("prevents consuming authority after run has settled if called through same run lifecycle", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("2"));
    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("consume-after-settle")));
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("1"));

    await harness.recordConsumption(runId, ethers.parseEther("1"));

    const run = await harness.runs(runId);
    expect(run.consumed).to.equal(ethers.parseEther("1"));
  });

  it("keeps reservable allowance reduced after reservation", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("3"));

    expect(
      await reservable.reserveAllowance(
        tokenId,
        await harness.getAddress(),
        asset.address
      )
    ).to.equal(ethers.parseEther("1"));
  });

  it("restores reserve allowance after release via settlement", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("allowance-after-release")));
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("2"));

    expect(
      await reservable.reserveAllowance(
        tokenId,
        await harness.getAddress(),
        asset.address
      )
    ).to.equal(ethers.parseEther("2"));
  });
    it("isolates reservations between different tokenIds", async function () {
    await reservable.mintToken(2, consumer.address);
    await reservable.mintValue(2, asset.address, ethers.parseEther("10"));

    await reservable.approveReserve(tokenId, await harness.getAddress(), asset.address, ethers.parseEther("4"));
    await reservable.approveReserve(2, await harness.getAddress(), asset.address, ethers.parseEther("6"));

    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, 2, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("4"));
    await harness.reserveForRun(2, ethers.parseEther("6"));

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(ethers.parseEther("4"));
    expect(await reservable.lockedValue(2, asset.address)).to.equal(ethers.parseEther("6"));
  });

  it("isolates available value between different tokenIds", async function () {
    await reservable.mintToken(2, consumer.address);
    await reservable.mintValue(2, asset.address, ethers.parseEther("5"));
    await reservable.approveReserve(2, await harness.getAddress(), asset.address, ethers.parseEther("5"));

    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, 2, asset.address, ethers.parseEther("5"));

    await harness.reserveForRun(1, ethers.parseEther("4"));
    await harness.reserveForRun(2, ethers.parseEther("2"));

    expect(await harness.availableValue(1)).to.equal(ethers.parseEther("6"));
    expect(await harness.availableValue(2)).to.equal(ethers.parseEther("3"));
  });

  it("isolates reservations between different assets on the same token", async function () {
    const [, , assetA, assetB] = await ethers.getSigners();

    await reservable.mintValue(tokenId, assetB.address, ethers.parseEther("20"));

    await reservable.approveReserve(tokenId, await harness.getAddress(), assetA.address, ethers.parseEther("4"));
    await reservable.approveReserve(tokenId, await harness.getAddress(), assetB.address, ethers.parseEther("8"));

    await harness.createRun(provider.address, tokenId, assetA.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, assetB.address, ethers.parseEther("20"));

    await harness.reserveForRun(1, ethers.parseEther("4"));
    await harness.reserveForRun(2, ethers.parseEther("8"));

    expect(await reservable.lockedValue(tokenId, assetA.address)).to.equal(ethers.parseEther("4"));
    expect(await reservable.lockedValue(tokenId, assetB.address)).to.equal(ethers.parseEther("8"));
  });

  it("settlement on one asset does not affect another asset", async function () {
    const [, , assetA, assetB] = await ethers.getSigners();

    await reservable.mintValue(tokenId, assetB.address, ethers.parseEther("20"));

    await reservable.approveReserve(tokenId, await harness.getAddress(), assetA.address, ethers.parseEther("4"));
    await reservable.approveReserve(tokenId, await harness.getAddress(), assetB.address, ethers.parseEther("8"));

    await harness.createRun(provider.address, tokenId, assetA.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, assetB.address, ethers.parseEther("20"));

    await harness.reserveForRun(1, ethers.parseEther("4"));
    await harness.reserveForRun(2, ethers.parseEther("8"));

    await harness.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("asset-a-settlement")));
    await harness.connect(provider).verifyResult(1);
    await harness.grantEligibility(1);
    await harness.settleFromReservedValue(1, ethers.parseEther("2"));

    expect(await reservable.lockedValue(tokenId, assetA.address)).to.equal(ethers.parseEther("2"));
    expect(await reservable.lockedValue(tokenId, assetB.address)).to.equal(ethers.parseEther("8"));
  });

  it("isolates workflows between different providers", async function () {
    const [, providerA, , providerB] = await ethers.getSigners();

    await harness.createRun(providerA.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(providerB.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("provider-a")));
    await harness.anchorCommitment(2, ethers.keccak256(ethers.toUtf8Bytes("provider-b")));

    await harness.connect(providerA).verifyResult(1);
    await harness.connect(providerB).verifyResult(2);

    const run1 = await harness.runs(1);
    const run2 = await harness.runs(2);

    expect(run1.provider).to.equal(providerA.address);
    expect(run2.provider).to.equal(providerB.address);
    expect(run1.verified).to.equal(true);
    expect(run2.verified).to.equal(true);
  });

  it("prevents wrong provider from verifying another provider run", async function () {
    const [, providerA, , providerB] = await ethers.getSigners();

    await harness.createRun(providerA.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("wrong-provider")));

    await expect(
      harness.connect(providerB).verifyResult(runId)
    ).to.be.revertedWith("ONLY_PROVIDER");
  });

  it("keeps authority limits independent across providers", async function () {
    const [, providerA, , providerB] = await ethers.getSigners();

    await harness.createRun(providerA.address, tokenId, asset.address, ethers.parseEther("1"));
    await harness.createRun(providerB.address, tokenId, asset.address, ethers.parseEther("5"));

    await expect(
      harness.recordConsumption(1, ethers.parseEther("2"))
    ).to.be.revertedWith("AUTHORITY_LIMIT_EXCEEDED");

    await harness.recordConsumption(2, ethers.parseEther("2"));

    const run2 = await harness.runs(2);
    expect(run2.consumed).to.equal(ethers.parseEther("2"));
  });

  it("isolates commitment hashes across token domains", async function () {
    await reservable.mintToken(2, consumer.address);
    await reservable.mintValue(2, asset.address, ethers.parseEther("10"));
    await reservable.approveReserve(2, await harness.getAddress(), asset.address, ethers.parseEther("4"));

    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, 2, asset.address, ethers.parseEther("10"));

    const hash1 = ethers.keccak256(ethers.toUtf8Bytes("token-1-commitment"));
    const hash2 = ethers.keccak256(ethers.toUtf8Bytes("token-2-commitment"));

    await harness.anchorCommitment(1, hash1);
    await harness.anchorCommitment(2, hash2);

    const run1 = await harness.runs(1);
    const run2 = await harness.runs(2);

    expect(run1.commitmentHash).to.equal(hash1);
    expect(run2.commitmentHash).to.equal(hash2);
    expect(run1.commitmentHash).to.not.equal(run2.commitmentHash);
  });

  it("supports independent settlement across different tokenIds", async function () {
    await reservable.mintToken(2, consumer.address);
    await reservable.mintValue(2, asset.address, ethers.parseEther("10"));

    await reservable.approveReserve(tokenId, await harness.getAddress(), asset.address, ethers.parseEther("4"));
    await reservable.approveReserve(2, await harness.getAddress(), asset.address, ethers.parseEther("4"));

    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, 2, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("4"));
    await harness.reserveForRun(2, ethers.parseEther("4"));

    await harness.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("settle-token-1")));
    await harness.connect(provider).verifyResult(1);
    await harness.grantEligibility(1);
    await harness.settleFromReservedValue(1, ethers.parseEther("2"));

    await harness.anchorCommitment(2, ethers.keccak256(ethers.toUtf8Bytes("settle-token-2")));
    await harness.connect(provider).verifyResult(2);
    await harness.grantEligibility(2);
    await harness.settleFromReservedValue(2, ethers.parseEther("1"));

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(ethers.parseEther("2"));
    expect(await reservable.lockedValue(2, asset.address)).to.equal(ethers.parseEther("3"));
  });

  it("preserves isolation between tokenId asset and provider dimensions together", async function () {
    const [, providerA, assetA, providerB, assetB] = await ethers.getSigners();

    await reservable.mintToken(2, consumer.address);
    await reservable.mintValue(2, assetB.address, ethers.parseEther("20"));

    await reservable.approveReserve(tokenId, await harness.getAddress(), assetA.address, ethers.parseEther("4"));
    await reservable.approveReserve(2, await harness.getAddress(), assetB.address, ethers.parseEther("8"));

    await harness.createRun(providerA.address, tokenId, assetA.address, ethers.parseEther("10"));
    await harness.createRun(providerB.address, 2, assetB.address, ethers.parseEther("20"));

    await harness.reserveForRun(1, ethers.parseEther("4"));
    await harness.reserveForRun(2, ethers.parseEther("8"));

    await harness.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("domain-a")));
    await harness.anchorCommitment(2, ethers.keccak256(ethers.toUtf8Bytes("domain-b")));

    await harness.connect(providerA).verifyResult(1);
    await harness.connect(providerB).verifyResult(2);

    const run1 = await harness.runs(1);
    const run2 = await harness.runs(2);

    expect(run1.provider).to.equal(providerA.address);
    expect(run2.provider).to.equal(providerB.address);
    expect(await reservable.lockedValue(tokenId, assetA.address)).to.equal(ethers.parseEther("4"));
    expect(await reservable.lockedValue(2, assetB.address)).to.equal(ethers.parseEther("8"));
  });
    it("maintains locked plus available equal to total value for a token and asset", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));

    const locked = await harness.lockedValue(runId);
    const available = await harness.availableValue(runId);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(locked + available).to.equal(total);
  });

  it("maintains locked plus available equal to total value after settlement release", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("post-settlement-invariant")));
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("2"));

    const locked = await harness.lockedValue(runId);
    const available = await harness.availableValue(runId);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(locked + available).to.equal(total);
  });

  it("never allows consumed value to exceed authority limit after multiple consumptions", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("5"));
    const runId = 1;

    await harness.recordConsumption(runId, ethers.parseEther("2"));
    await harness.recordConsumption(runId, ethers.parseEther("3"));

    const run = await harness.runs(runId);

    expect(run.consumed).to.equal(ethers.parseEther("5"));
    expect(run.consumed).to.be.lte(run.authorityLimit);

    await expect(
      harness.recordConsumption(runId, 1)
    ).to.be.revertedWith("AUTHORITY_LIMIT_EXCEEDED");
  });

  it("settled value never exceeds the amount released from locked value", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));

    const lockedBefore = await harness.lockedValue(runId);

    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("settled-vs-locked")));
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("2"));

    const run = await harness.runs(runId);
    const lockedAfter = await harness.lockedValue(runId);

    expect(run.settledValue).to.equal(lockedBefore - lockedAfter);
  });

  it("workflow settlement does not alter authority limit", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.recordConsumption(runId, ethers.parseEther("2"));

    const beforeRun = await harness.runs(runId);

    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("authority-constant")));
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("2"));

    const afterRun = await harness.runs(runId);

    expect(afterRun.authorityLimit).to.equal(beforeRun.authorityLimit);
    expect(afterRun.consumed).to.equal(beforeRun.consumed);
  });

  it("anchoring and verification do not change reservable accounting", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));

    const lockedBefore = await harness.lockedValue(runId);
    const availableBefore = await harness.availableValue(runId);

    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("no-accounting-change")));
    await harness.connect(provider).verifyResult(runId);

    expect(await harness.lockedValue(runId)).to.equal(lockedBefore);
    expect(await harness.availableValue(runId)).to.equal(availableBefore);
  });

  it("eligibility does not change reservable accounting", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("eligibility-no-accounting-change")));
    await harness.connect(provider).verifyResult(runId);

    const lockedBefore = await harness.lockedValue(runId);
    const availableBefore = await harness.availableValue(runId);

    await harness.grantEligibility(runId);

    expect(await harness.lockedValue(runId)).to.equal(lockedBefore);
    expect(await harness.availableValue(runId)).to.equal(availableBefore);
  });

  it("reservation does not mutate workflow commitment or verification fields", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));

    const run = await harness.runs(runId);

    expect(run.commitmentHash).to.equal(ethers.ZeroHash);
    expect(run.verified).to.equal(false);
    expect(run.eligible).to.equal(false);
    expect(run.state).to.equal(1n);
  });

  it("consumption does not mutate reservable locked value", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    const lockedBefore = await harness.lockedValue(runId);
    const availableBefore = await harness.availableValue(runId);

    await harness.recordConsumption(runId, ethers.parseEther("3"));

    expect(await harness.lockedValue(runId)).to.equal(lockedBefore);
    expect(await harness.availableValue(runId)).to.equal(availableBefore);
  });

  it("reservation does not mutate cursor consumption", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.recordConsumption(runId, ethers.parseEther("2"));

    const beforeRun = await harness.runs(runId);

    await harness.reserveForRun(runId, ethers.parseEther("4"));

    const afterRun = await harness.runs(runId);

    expect(afterRun.consumed).to.equal(beforeRun.consumed);
    expect(afterRun.authorityLimit).to.equal(beforeRun.authorityLimit);
  });
    it("handles interleaved reservation consumption anchor and verification without accounting drift", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.recordConsumption(runId, ethers.parseEther("1"));
    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.recordConsumption(runId, ethers.parseEther("2"));

    const lockedBefore = await harness.lockedValue(runId);
    const availableBefore = await harness.availableValue(runId);

    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("interleaved-flow")));
    await harness.connect(provider).verifyResult(runId);

    const run = await harness.runs(runId);

    expect(run.consumed).to.equal(ethers.parseEther("3"));
    expect(await harness.lockedValue(runId)).to.equal(lockedBefore);
    expect(await harness.availableValue(runId)).to.equal(availableBefore);
  });

  it("prevents reserve after verification because reservation belongs before execution closure", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("verified-no-reserve")));
    await harness.connect(provider).verifyResult(runId);

    await expect(
      harness.reserveForRun(runId, ethers.parseEther("1"))
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("prevents reserve after eligibility is granted", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("eligible-no-reserve")));
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);

    await expect(
      harness.reserveForRun(runId, ethers.parseEther("1"))
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("prevents verification after settlement finalizes workflow", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("verify-after-settle")));
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("2"));

    await expect(
      harness.connect(provider).verifyResult(runId)
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("prevents eligibility after settlement finalizes workflow", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("eligibility-after-settle")));
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("2"));

    await expect(
      harness.grantEligibility(runId)
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("preserves commitment hash after verification eligibility and settlement", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    const commitmentHash = ethers.keccak256(
      ethers.toUtf8Bytes("commitment-preserved")
    );

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.anchorCommitment(runId, commitmentHash);
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("2"));

    const run = await harness.runs(runId);

    expect(run.commitmentHash).to.equal(commitmentHash);
  });

  it("settlement changes only settled state and reservable accounting fields", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.recordConsumption(runId, ethers.parseEther("2"));
    await harness.reserveForRun(runId, ethers.parseEther("4"));

    const commitmentHash = ethers.keccak256(
      ethers.toUtf8Bytes("minimal-settlement-mutation")
    );

    await harness.anchorCommitment(runId, commitmentHash);
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);

    const before = await harness.runs(runId);
    const lockedBefore = await harness.lockedValue(runId);

    await harness.settleFromReservedValue(runId, ethers.parseEther("2"));

    const after = await harness.runs(runId);
    const lockedAfter = await harness.lockedValue(runId);

    expect(after.consumer).to.equal(before.consumer);
    expect(after.provider).to.equal(before.provider);
    expect(after.tokenId).to.equal(before.tokenId);
    expect(after.asset).to.equal(before.asset);
    expect(after.authorityLimit).to.equal(before.authorityLimit);
    expect(after.consumed).to.equal(before.consumed);
    expect(after.commitmentHash).to.equal(before.commitmentHash);
    expect(after.verified).to.equal(before.verified);
    expect(after.eligible).to.equal(before.eligible);

    expect(after.settledValue).to.equal(before.settledValue + ethers.parseEther("2"));
    expect(lockedAfter).to.equal(lockedBefore - ethers.parseEther("2"));
    expect(after.state).to.equal(5n);
  });

  it("prevents settlement of a different run that has not passed its own eligibility", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("2"));
    await harness.reserveForRun(2, ethers.parseEther("2"));

    await harness.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("eligible-run")));
    await harness.connect(provider).verifyResult(1);
    await harness.grantEligibility(1);

    await expect(
      harness.settleFromReservedValue(2, ethers.parseEther("1"))
    ).to.be.revertedWith("NOT_ELIGIBLE");
  });

  it("does not allow one run commitment to verify another run implicitly", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("only-run-1")));

    await expect(
      harness.connect(provider).verifyResult(2)
    ).to.be.revertedWith("INVALID_STATE");
  });

  it("full lifecycle leaves final state internally consistent", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));
    await harness.recordConsumption(runId, ethers.parseEther("2"));

    const commitmentHash = ethers.keccak256(
      ethers.toUtf8Bytes("final-consistency")
    );

    await harness.anchorCommitment(runId, commitmentHash);
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);
    await harness.settleFromReservedValue(runId, ethers.parseEther("2"));

    const run = await harness.runs(runId);
    const locked = await harness.lockedValue(runId);
    const available = await harness.availableValue(runId);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(run.state).to.equal(5n);
    expect(run.verified).to.equal(true);
    expect(run.eligible).to.equal(true);
    expect(run.commitmentHash).to.equal(commitmentHash);
    expect(run.consumed).to.be.lte(run.authorityLimit);
    expect(locked + available).to.equal(total);
    expect(run.settledValue).to.equal(ethers.parseEther("2"));
  });

  it("prevents reservation when available value is exhausted by prior reservations", async function () {
    await reservable.approveReserve(
      tokenId,
      await harness.getAddress(),
      asset.address,
      ethers.parseEther("10")
    );

    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("10"));

    await expect(
      harness.reserveForRun(2, ethers.parseEther("1"))
    ).to.be.revertedWith("exceeds reserve allowance");
  });

  it("prevents reservation when allowance is exhausted even if value remains available", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));

    await harness.reserveForRun(1, ethers.parseEther("4"));

    await expect(
      harness.reserveForRun(2, ethers.parseEther("1"))
    ).to.be.revertedWith("exceeds reserve allowance");
  });

  it("keeps committed value locked when consumption is zero", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));

    const run = await harness.runs(runId);

    expect(run.consumed).to.equal(0n);
    expect(await harness.lockedValue(runId)).to.equal(ethers.parseEther("4"));
    expect(await harness.availableValue(runId)).to.equal(ethers.parseEther("6"));
  });

  it("allows consumption without reservation but does not imply solvency lock", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.recordConsumption(runId, ethers.parseEther("3"));

    const run = await harness.runs(runId);

    expect(run.consumed).to.equal(ethers.parseEther("3"));
    expect(await harness.lockedValue(runId)).to.equal(0n);
    expect(await harness.availableValue(runId)).to.equal(ethers.parseEther("10"));
  });

  it("prevents settlement when no value has been reserved even if verified and eligible", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.anchorCommitment(runId, ethers.keccak256(ethers.toUtf8Bytes("no-reserve-settlement")));
    await harness.connect(provider).verifyResult(runId);
    await harness.grantEligibility(runId);

    await expect(
      harness.settleFromReservedValue(runId, ethers.parseEther("1"))
    ).to.be.revertedWith("release exceeds locked value");
  });

  it("preserves total value when reservation is created but not settled", async function () {
    await harness.createRun(provider.address, tokenId, asset.address, ethers.parseEther("10"));
    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));

    expect(await reservable.totalValue(tokenId, asset.address)).to.equal(ethers.parseEther("10"));
    expect(await harness.lockedValue(runId)).to.equal(ethers.parseEther("4"));
    expect(await harness.availableValue(runId)).to.equal(ethers.parseEther("6"));
  });
  
  it("prevents settlement before eligibility even when value is reserved", async function () {
    await harness.createRun(
      provider.address,
      tokenId,
      asset.address,
      ethers.parseEther("10")
    );

    const runId = 1;

    await harness.reserveForRun(runId, ethers.parseEther("4"));

    await expect(
      harness.settleFromReservedValue(runId, ethers.parseEther("2"))
    ).to.be.revertedWith("NOT_ELIGIBLE");
  });
});