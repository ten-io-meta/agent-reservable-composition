const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Escrow composition with IERC8060Reservable", function () {
  let reservable;
  let minimalEscrow;
  let timedEscrow;
  let owner;
  let seller;
  let asset;

  const tokenId = 1;
  const TOTAL = ethers.parseEther("20");

  beforeEach(async function () {
    [owner, seller, asset] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const MinimalEscrow = await ethers.getContractFactory("MinimalReservableEscrow");
    minimalEscrow = await MinimalEscrow.deploy(await reservable.getAddress());
    await minimalEscrow.waitForDeployment();

    const TimedEscrow = await ethers.getContractFactory("TimedReservableEscrow");
    timedEscrow = await TimedEscrow.deploy(await reservable.getAddress());
    await timedEscrow.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, TOTAL);
  });

  it("minimal escrow reserves value through IERC8060Reservable", async function () {
    await reservable.approveReserve(
      tokenId,
      await minimalEscrow.getAddress(),
      asset.address,
      ethers.parseEther("5")
    );

    await minimalEscrow.createEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("5"),
      seller.address
    );

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("5")
    );

    expect(await reservable.availableValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("15")
    );
  });

  it("minimal escrow release returns locked value to available value", async function () {
    await reservable.approveReserve(
      tokenId,
      await minimalEscrow.getAddress(),
      asset.address,
      ethers.parseEther("5")
    );

    await minimalEscrow.createEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("5"),
      seller.address
    );

    await minimalEscrow.releaseEscrow(0);

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(0n);
    expect(await reservable.availableValue(tokenId, asset.address)).to.equal(TOTAL);
  });

  it("minimal escrow settlement does not release reservable value by design", async function () {
    await reservable.approveReserve(
      tokenId,
      await minimalEscrow.getAddress(),
      asset.address,
      ethers.parseEther("5")
    );

    await minimalEscrow.createEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("5"),
      seller.address
    );

    await minimalEscrow.settleEscrow(0);

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("5")
    );
  });

  it("minimal escrow prevents release after settlement", async function () {
    await reservable.approveReserve(
      tokenId,
      await minimalEscrow.getAddress(),
      asset.address,
      ethers.parseEther("5")
    );

    await minimalEscrow.createEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("5"),
      seller.address
    );

    await minimalEscrow.settleEscrow(0);

    await expect(
      minimalEscrow.releaseEscrow(0)
    ).to.be.revertedWith("Escrow not active");
  });

  it("timed escrow reserves value through IERC8060Reservable", async function () {
    await reservable.approveReserve(
      tokenId,
      await timedEscrow.getAddress(),
      asset.address,
      ethers.parseEther("3")
    );

    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("3"),
      seller.address,
      3600
    );

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("3")
    );
  });

  it("timed escrow cannot refund before deadline", async function () {
    await reservable.approveReserve(
      tokenId,
      await timedEscrow.getAddress(),
      asset.address,
      ethers.parseEther("3")
    );

    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("3"),
      seller.address,
      3600
    );

    await expect(
      timedEscrow.refundExpiredEscrow(0)
    ).to.be.revertedWith("deadline not reached");
  });

  it("timed escrow refunds after deadline and releases reserved value", async function () {
    await reservable.approveReserve(
      tokenId,
      await timedEscrow.getAddress(),
      asset.address,
      ethers.parseEther("3")
    );

    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("3"),
      seller.address,
      1
    );

    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine");

    await timedEscrow.refundExpiredEscrow(0);

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(0n);
    expect(await reservable.availableValue(tokenId, asset.address)).to.equal(TOTAL);
  });

  it("timed escrow settlement prevents refund", async function () {
    await reservable.approveReserve(
      tokenId,
      await timedEscrow.getAddress(),
      asset.address,
      ethers.parseEther("3")
    );

    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("3"),
      seller.address,
      1
    );

    await timedEscrow.settleTimedEscrow(0);

    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine");

    await expect(
      timedEscrow.refundExpiredEscrow(0)
    ).to.be.revertedWith("escrow not active");
  });

  it("minimal and timed escrows compose independently over the same token asset", async function () {
    await reservable.approveReserve(
      tokenId,
      await minimalEscrow.getAddress(),
      asset.address,
      ethers.parseEther("5")
    );

    await reservable.approveReserve(
      tokenId,
      await timedEscrow.getAddress(),
      asset.address,
      ethers.parseEther("3")
    );

    await minimalEscrow.createEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("5"),
      seller.address
    );

    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("3"),
      seller.address,
      3600
    );

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("8")
    );

    expect(await reservable.availableValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("12")
    );
  });

  it("escrow composition preserves locked plus available equals total", async function () {
    await reservable.approveReserve(
      tokenId,
      await minimalEscrow.getAddress(),
      asset.address,
      ethers.parseEther("5")
    );

    await reservable.approveReserve(
      tokenId,
      await timedEscrow.getAddress(),
      asset.address,
      ethers.parseEther("3")
    );

    await minimalEscrow.createEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("5"),
      seller.address
    );

    await timedEscrow.createTimedEscrow(
      tokenId,
      asset.address,
      ethers.parseEther("3"),
      seller.address,
      3600
    );

    const locked = await reservable.lockedValue(tokenId, asset.address);
    const available = await reservable.availableValue(tokenId, asset.address);
    const total = await reservable.totalValue(tokenId, asset.address);

    expect(locked + available).to.equal(total);
  });
});