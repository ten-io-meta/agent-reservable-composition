const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ReservableNFTDemo", function () {
  let nft;
  let owner;
  let other;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    const NFT = await ethers.getContractFactory("ReservableNFTDemo");
    nft = await NFT.deploy();
    await nft.waitForDeployment();

    await nft.mint(1, ethers.parseEther("10"));
  });

  it("mints a value-bearing token", async function () {
    expect(await nft.ownerOf(1)).to.equal(owner.address);
    expect(await nft.totalValueOf(1)).to.equal(ethers.parseEther("10"));
    expect(await nft.lockedValueOf(1)).to.equal(0n);
    expect(await nft.availableValueOf(1)).to.equal(ethers.parseEther("10"));
  });

  it("reserves value without reducing total value", async function () {
    await nft.reserveValue(1, ethers.parseEther("3"));

    expect(await nft.totalValueOf(1)).to.equal(ethers.parseEther("10"));
    expect(await nft.lockedValueOf(1)).to.equal(ethers.parseEther("3"));
    expect(await nft.availableValueOf(1)).to.equal(ethers.parseEther("7"));
  });

  it("prevents over-reservation", async function () {
    await expect(
      nft.reserveValue(1, ethers.parseEther("11"))
    ).to.be.revertedWith("INSUFFICIENT_AVAILABLE_VALUE");
  });

  it("allows multiple reservations up to available value", async function () {
    await nft.reserveValue(1, ethers.parseEther("4"));
    await nft.reserveValue(1, ethers.parseEther("6"));

    expect(await nft.lockedValueOf(1)).to.equal(ethers.parseEther("10"));
    expect(await nft.availableValueOf(1)).to.equal(0n);
  });

  it("releases reserved value back to available value", async function () {
    await nft.reserveValue(1, ethers.parseEther("5"));
    await nft.releaseValue(1, ethers.parseEther("2"));

    expect(await nft.lockedValueOf(1)).to.equal(ethers.parseEther("3"));
    expect(await nft.availableValueOf(1)).to.equal(ethers.parseEther("7"));
  });

  it("consumes reserved value and reduces total value", async function () {
    await nft.reserveValue(1, ethers.parseEther("5"));
    await nft.consumeReservedValue(1, ethers.parseEther("2"));

    expect(await nft.lockedValueOf(1)).to.equal(ethers.parseEther("3"));
    expect(await nft.totalValueOf(1)).to.equal(ethers.parseEther("8"));
    expect(await nft.availableValueOf(1)).to.equal(ethers.parseEther("5"));
  });

  it("prevents non-owner from reserving value", async function () {
    await expect(
      nft.connect(other).reserveValue(1, ethers.parseEther("1"))
    ).to.be.revertedWith("NOT_OWNER");
  });
});