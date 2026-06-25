const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TimedReservableEscrow coverage", function () {
  let reservable;
  let timedEscrow;
  let owner;
  let seller;
  let asset;

  const tokenId = 1;

  beforeEach(async function () {
    [owner, seller, asset] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const TimedEscrow = await ethers.getContractFactory("TimedReservableEscrow");
    timedEscrow = await TimedEscrow.deploy(await reservable.getAddress());
    await timedEscrow.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, ethers.parseEther("10"));

    await reservable.approveReserve(
      tokenId,
      await timedEscrow.getAddress(),
      asset.address,
      ethers.parseEther("10")
    );
  });

  it("creates timed escrow and locks value", async function () {
    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("2"),
      seller.address,
      3600
    );

    const e = await timedEscrow.escrows(0);

    expect(e.tokenId).to.equal(tokenId);
    expect(e.asset).to.equal(asset.address);
    expect(e.amount).to.equal(ethers.parseEther("2"));
    expect(e.seller).to.equal(seller.address);
    expect(e.active).to.equal(true);
    expect(e.settled).to.equal(false);
    expect(e.refunded).to.equal(false);

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("2")
    );
  });

  it("increments timed escrow ids", async function () {
    await timedEscrow.createTimedEscrow(tokenId, asset.address, ethers.parseEther("1"), seller.address, 3600);
    await timedEscrow.createTimedEscrow(tokenId, asset.address, ethers.parseEther("1"), seller.address, 3600);

    expect(await timedEscrow.nextEscrowId()).to.equal(2);
  });

  it("prevents constructor with zero reservable address", async function () {
    const TimedEscrow = await ethers.getContractFactory("TimedReservableEscrow");

    await expect(
      TimedEscrow.deploy(ethers.ZeroAddress)
    ).to.be.revertedWith("invalid reservable");
  });

  it("prevents creating timed escrow with zero amount", async function () {
    await expect(
      timedEscrow.createTimedEscrow(
        tokenId,
        asset.address,
        0,
        seller.address,
        3600
      )
    ).to.be.revertedWith("amount is zero");
  });

  it("prevents creating timed escrow with zero seller", async function () {
    await expect(
      timedEscrow.createTimedEscrow(
        tokenId,
        asset.address,
        ethers.parseEther("1"),
        ethers.ZeroAddress,
        3600
      )
    ).to.be.revertedWith("invalid seller");
  });

  it("prevents creating timed escrow with zero duration", async function () {
    await expect(
      timedEscrow.createTimedEscrow(
        tokenId,
        asset.address,
        ethers.parseEther("1"),
        seller.address,
        0
      )
    ).to.be.revertedWith("duration is zero");
  });

  it("prevents creating timed escrow beyond available value", async function () {
    await reservable.approveReserve(
      tokenId,
      await timedEscrow.getAddress(),
      asset.address,
      ethers.parseEther("20")
    );

    await expect(
      timedEscrow.createTimedEscrow(
        tokenId,
        asset.address,
        ethers.parseEther("11"),
        seller.address,
        3600
      )
    ).to.be.revertedWith("insufficient available value");
  });

  it("prevents creating timed escrow beyond reserve allowance", async function () {
    await reservable.approveReserve(
      tokenId,
      await timedEscrow.getAddress(),
      asset.address,
      ethers.parseEther("1")
    );

    await expect(
      timedEscrow.createTimedEscrow(
        tokenId,
        asset.address,
        ethers.parseEther("2"),
        seller.address,
        3600
      )
    ).to.be.revertedWith("exceeds reserve allowance");
  });

  it("settles active timed escrow", async function () {
    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("2"),
      seller.address,
      3600
    );

    await timedEscrow.settleTimedEscrow(0);

    const e = await timedEscrow.escrows(0);

    expect(e.active).to.equal(false);
    expect(e.settled).to.equal(true);
    expect(e.refunded).to.equal(false);
  });

  it("prevents settlement of inactive timed escrow", async function () {
    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("2"),
      seller.address,
      3600
    );

    await timedEscrow.settleTimedEscrow(0);

    await expect(
      timedEscrow.settleTimedEscrow(0)
    ).to.be.revertedWith("escrow not active");
  });

  it("prevents refund before deadline", async function () {
    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("2"),
      seller.address,
      3600
    );

    await expect(
      timedEscrow.refundExpiredEscrow(0)
    ).to.be.revertedWith("deadline not reached");
  });

  it("refunds expired escrow and releases reserved value", async function () {
    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("2"),
      seller.address,
      3600
    );

    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine");

    await timedEscrow.refundExpiredEscrow(0);

    const e = await timedEscrow.escrows(0);

    expect(e.active).to.equal(false);
    expect(e.settled).to.equal(false);
    expect(e.refunded).to.equal(true);

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(0);
    expect(await reservable.availableValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("10")
    );
  });

  it("prevents refund of inactive escrow", async function () {
    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("2"),
      seller.address,
      3600
    );

    await timedEscrow.settleTimedEscrow(0);

    await expect(
      timedEscrow.refundExpiredEscrow(0)
    ).to.be.revertedWith("escrow not active");
  });

  it("prevents refund after settlement", async function () {
    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("2"),
      seller.address,
      3600
    );

    await timedEscrow.settleTimedEscrow(0);

    await expect(
      timedEscrow.refundExpiredEscrow(0)
    ).to.be.revertedWith("escrow not active");
  });
});