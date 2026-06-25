const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Multi-domain stress: token asset provider isolation", function () {
  let reservable;
  let harness;
  let consumer;
  let providerA;
  let providerB;
  let assetA;
  let assetB;

  beforeEach(async function () {
    [consumer, providerA, providerB, assetA, assetB] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const Harness = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    harness = await Harness.deploy(await reservable.getAddress());
    await harness.waitForDeployment();

    for (let tokenId = 1; tokenId <= 5; tokenId++) {
      if (tokenId > 1) {
        await reservable.mintToken(tokenId, consumer.address);
      }

      await reservable.mintValue(tokenId, assetA.address, ethers.parseEther("20"));
      await reservable.mintValue(tokenId, assetB.address, ethers.parseEther("30"));

      await reservable.approveReserve(
        tokenId,
        await harness.getAddress(),
        assetA.address,
        ethers.parseEther("20")
      );

      await reservable.approveReserve(
        tokenId,
        await harness.getAddress(),
        assetB.address,
        ethers.parseEther("30")
      );
    }
  });

  it("processes 50 workflows across 5 tokens 2 assets and 2 providers", async function () {
    let runId = 1;

    for (let tokenId = 1; tokenId <= 5; tokenId++) {
      for (const asset of [assetA, assetB]) {
        for (const provider of [providerA, providerB]) {
          for (let i = 0; i < 5; i++) {
            await harness.createRun(
              provider.address,
              tokenId,
              asset.address,
              ethers.parseEther("5")
            );

            await harness.reserveForRun(runId, ethers.parseEther("0.1"));
            await harness.recordConsumption(runId, ethers.parseEther("0.05"));

            await harness.anchorCommitment(
              runId,
              ethers.keccak256(
                ethers.toUtf8Bytes(`domain-${tokenId}-${asset.address}-${provider.address}-${i}`)
              )
            );

            await harness.connect(provider).verifyResult(runId);
            await harness.grantEligibility(runId);
            await harness.settleFromReservedValue(runId, ethers.parseEther("0.02"));

            const run = await harness.runs(runId);

            expect(run.state).to.equal(5n);
            expect(run.provider).to.equal(provider.address);
            expect(run.tokenId).to.equal(BigInt(tokenId));
            expect(run.asset).to.equal(asset.address);
            expect(run.consumed).to.be.lte(run.authorityLimit);

            runId++;
          }
        }
      }
    }

    expect(runId - 1).to.equal(100);
  });

  it("preserves per-token per-asset accounting after multi-domain stress", async function () {
    let runId = 1;

    for (let tokenId = 1; tokenId <= 5; tokenId++) {
      for (const asset of [assetA, assetB]) {
        for (let i = 0; i < 4; i++) {
          await harness.createRun(
            providerA.address,
            tokenId,
            asset.address,
            ethers.parseEther("5")
          );

          await harness.reserveForRun(runId, ethers.parseEther("0.1"));
          runId++;
        }
      }
    }

    for (let tokenId = 1; tokenId <= 5; tokenId++) {
      for (const asset of [assetA, assetB]) {
        const locked = await reservable.lockedValue(tokenId, asset.address);
        const available = await reservable.availableValue(tokenId, asset.address);
        const total = await reservable.totalValue(tokenId, asset.address);

        expect(locked + available).to.equal(total);
        expect(locked).to.equal(ethers.parseEther("0.4"));
      }
    }
  });

  it("settlement in one token asset domain does not affect another domain", async function () {
    await harness.createRun(providerA.address, 1, assetA.address, ethers.parseEther("5"));
    await harness.createRun(providerB.address, 2, assetB.address, ethers.parseEther("5"));

    await harness.reserveForRun(1, ethers.parseEther("1"));
    await harness.reserveForRun(2, ethers.parseEther("2"));

    await harness.anchorCommitment(1, ethers.keccak256(ethers.toUtf8Bytes("domain-one")));
    await harness.connect(providerA).verifyResult(1);
    await harness.grantEligibility(1);
    await harness.settleFromReservedValue(1, ethers.parseEther("0.4"));

    expect(await reservable.lockedValue(1, assetA.address)).to.equal(ethers.parseEther("0.6"));
    expect(await reservable.lockedValue(2, assetB.address)).to.equal(ethers.parseEther("2"));
  });

  it("rejects wrong provider verification across domains", async function () {
    await harness.createRun(providerA.address, 1, assetA.address, ethers.parseEther("5"));

    await harness.anchorCommitment(
      1,
      ethers.keccak256(ethers.toUtf8Bytes("wrong-provider-domain"))
    );

    await expect(
      harness.connect(providerB).verifyResult(1)
    ).to.be.revertedWith("ONLY_PROVIDER");
  });

  it("preserves aggregate locked plus available invariant for every token asset pair", async function () {
    let runId = 1;

    for (let tokenId = 1; tokenId <= 5; tokenId++) {
      for (const asset of [assetA, assetB]) {
        await harness.createRun(providerA.address, tokenId, asset.address, ethers.parseEther("5"));
        await harness.reserveForRun(runId, ethers.parseEther("0.25"));
        runId++;
      }
    }

    for (let tokenId = 1; tokenId <= 5; tokenId++) {
      for (const asset of [assetA, assetB]) {
        const locked = await reservable.lockedValue(tokenId, asset.address);
        const available = await reservable.availableValue(tokenId, asset.address);
        const total = await reservable.totalValue(tokenId, asset.address);

        expect(locked + available).to.equal(total);
      }
    }
  });
});