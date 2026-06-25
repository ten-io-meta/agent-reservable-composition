const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Concurrent isolation: independent workflows remain isolated", function () {
  let reservable;
  let workflow;
  let checker;
  let accounts;

  const tokenId = 1;

  beforeEach(async function () {
    accounts = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const Workflow = await ethers.getContractFactory("AgentReservableIntegrationHarness");
    workflow = await Workflow.deploy(await reservable.getAddress());
    await workflow.waitForDeployment();

    const Checker = await ethers.getContractFactory("CompositionInvariantChecker");
    checker = await Checker.deploy();
    await checker.waitForDeployment();

    // 5 dominios (assets) independientes
    for (let i = 2; i <= 6; i++) {
      await reservable.mintValue(
        tokenId,
        accounts[i].address,
        ethers.parseEther("100")
      );

      await reservable.approveReserve(
        tokenId,
        await workflow.getAddress(),
        accounts[i].address,
        ethers.parseEther("100")
      );
    }
  });

  it("keeps accounting isolated across 5 independent asset domains", async function () {
    for (let i = 1; i <= 50; i++) {
      const asset = accounts[(i % 5) + 2];

      await workflow.createRun(
        accounts[1].address,
        tokenId,
        asset.address,
        ethers.parseEther("10")
      );

      await workflow.reserveForRun(i, ethers.parseEther("1"));
      await workflow.recordConsumption(i, ethers.parseEther("0.5"));

      if (i % 3 === 0) {
        await workflow.anchorCommitment(
          i,
          ethers.keccak256(
            ethers.toUtf8Bytes(`parallel-${i}`)
          )
        );

        await workflow.connect(accounts[1]).verifyResult(i);
        await workflow.grantEligibility(i);
        await workflow.settleFromReservedValue(
          i,
          ethers.parseEther("0.5")
        );
      }
    }

    // cada asset mantiene su propia contabilidad
    for (let i = 2; i <= 6; i++) {
      const total = await reservable.totalValue(
        tokenId,
        accounts[i].address
      );

      const locked = await reservable.lockedValue(
        tokenId,
        accounts[i].address
      );

      const available = await reservable.availableValue(
        tokenId,
        accounts[i].address
      );

      expect(locked + available).to.equal(total);

      await checker.assertReservableAccounting(
        await reservable.getAddress(),
        tokenId,
        accounts[i].address
      );
    }
  });

  it("changing one workflow never mutates another workflow", async function () {
    await workflow.createRun(
      accounts[1].address,
      tokenId,
      accounts[2].address,
      ethers.parseEther("10")
    );

    await workflow.createRun(
      accounts[1].address,
      tokenId,
      accounts[3].address,
      ethers.parseEther("10")
    );

    await workflow.reserveForRun(1, ethers.parseEther("2"));

    const run1 = await workflow.runs(1);
    const run2 = await workflow.runs(2);

    expect(run2.consumed).to.equal(0);
    expect(run2.settledValue).to.equal(0);
    expect(run2.verified).to.equal(false);
    expect(run2.eligible).to.equal(false);

    expect(run1.authorityLimit).to.equal(run2.authorityLimit);
  });

  it("independent assets preserve independent locked balances", async function () {
    for (let i = 0; i < 5; i++) {
      await workflow.createRun(
        accounts[1].address,
        tokenId,
        accounts[i + 2].address,
        ethers.parseEther("10")
      );

      await workflow.reserveForRun(
        i + 1,
        ethers.parseEther((i + 1).toString())
      );
    }

    for (let i = 0; i < 5; i++) {
      const locked = await reservable.lockedValue(
        tokenId,
        accounts[i + 2].address
      );

      expect(locked).to.equal(
        ethers.parseEther((i + 1).toString())
      );
    }
  });

  it("authority consumption remains isolated per workflow", async function () {
    for (let i = 1; i <= 20; i++) {
      await workflow.createRun(
        accounts[1].address,
        tokenId,
        accounts[2].address,
        ethers.parseEther("10")
      );

      await workflow.recordConsumption(
        i,
        ethers.parseEther("1")
      );
    }

    for (let i = 1; i <= 20; i++) {
      const run = await workflow.runs(i);

      expect(run.consumed).to.equal(
        ethers.parseEther("1")
      );

      expect(run.authorityLimit).to.equal(
        ethers.parseEther("10")
      );
    }
  });
});