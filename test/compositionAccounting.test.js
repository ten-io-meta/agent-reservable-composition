const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CompositionAccountingDemo", function () {
  let demo;

  beforeEach(async function () {
    const Demo = await ethers.getContractFactory("CompositionAccountingDemo");
    demo = await Demo.deploy(
      1000, // authority limit
      ethers.parseEther("10") // total value
    );
    await demo.waitForDeployment();
  });

  it("Initial values are correct", async function () {
    expect(await demo.authorityLimit()).to.equal(1000n);
    expect(await demo.totalValue()).to.equal(
      ethers.parseEther("10")
    );
  });

  it("Reserves value correctly", async function () {
    await demo.reserveValue(ethers.parseEther("2"));

    expect(await demo.lockedValue()).to.equal(
      ethers.parseEther("2")
    );

    expect(await demo.availableValue()).to.equal(
      ethers.parseEther("8")
    );
  });

  it("Records consumption", async function () {
    await demo.recordConsumption(500);

    expect(await demo.consumed()).to.equal(500n);
  });

  it("Settles reserved value", async function () {
    await demo.reserveValue(ethers.parseEther("3"));
    await demo.settleReserved(ethers.parseEther("1"));

    expect(await demo.lockedValue()).to.equal(
      ethers.parseEther("2")
    );

    expect(await demo.totalValue()).to.equal(
      ethers.parseEther("9")
    );

    expect(await demo.settled()).to.equal(
      ethers.parseEther("1")
    );
  });
});