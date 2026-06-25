const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MinimalReservableEscrow coverage", function () {
  let reservable;
  let escrow;
  let owner;
  let seller;
  let asset;

  const tokenId = 1;

  beforeEach(async function () {
    [owner, seller, asset] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    const Escrow = await ethers.getContractFactory("MinimalReservableEscrow");
    escrow = await Escrow.deploy(await reservable.getAddress());
    await escrow.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, ethers.parseEther("10"));

    await reservable.approveReserve(
      tokenId,
      await escrow.getAddress(),
      asset.address,
      ethers.parseEther("10")
    );
  });

  it("creates escrow and locks reservable value", async function () {
    await escrow.createEscrow(tokenId, asset.address, ethers.parseEther("2"), seller.address);

    const e = await escrow.escrows(0);

    expect(e.tokenId).to.equal(tokenId);
    expect(e.asset).to.equal(asset.address);
    expect(e.amount).to.equal(ethers.parseEther("2"));
    expect(e.seller).to.equal(seller.address);
    expect(e.active).to.equal(true);
    expect(e.settled).to.equal(false);

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(ethers.parseEther("2"));
  });

  it("increments escrow ids", async function () {
    await escrow.createEscrow(tokenId, asset.address, ethers.parseEther("1"), seller.address);
    await escrow.createEscrow(tokenId, asset.address, ethers.parseEther("1"), seller.address);

    expect(await escrow.nextEscrowId()).to.equal(2);
  });

  it("releases escrow and returns value to available balance", async function () {
    await escrow.createEscrow(tokenId, asset.address, ethers.parseEther("2"), seller.address);

    await escrow.releaseEscrow(0);

    const e = await escrow.escrows(0);

    expect(e.active).to.equal(false);
    expect(e.settled).to.equal(false);
    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(0);
    expect(await reservable.availableValue(tokenId, asset.address)).to.equal(ethers.parseEther("10"));
  });

  it("settles escrow without releasing reserved value by design", async function () {
    await escrow.createEscrow(tokenId, asset.address, ethers.parseEther("2"), seller.address);

    await escrow.settleEscrow(0);

    const e = await escrow.escrows(0);

    expect(e.active).to.equal(false);
    expect(e.settled).to.equal(true);
    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(ethers.parseEther("2"));
  });

  it("prevents release of inactive escrow", async function () {
    await escrow.createEscrow(tokenId, asset.address, ethers.parseEther("2"), seller.address);
    await escrow.releaseEscrow(0);

    await expect(escrow.releaseEscrow(0)).to.be.revertedWith("Escrow not active");
  });

  it("prevents settlement of inactive escrow", async function () {
    await escrow.createEscrow(tokenId, asset.address, ethers.parseEther("2"), seller.address);
    await escrow.releaseEscrow(0);

    await expect(escrow.settleEscrow(0)).to.be.revertedWith("Escrow not active");
  });

  it("prevents release after settlement", async function () {
    await escrow.createEscrow(tokenId, asset.address, ethers.parseEther("2"), seller.address);
    await escrow.settleEscrow(0);

    await expect(escrow.releaseEscrow(0)).to.be.revertedWith("Escrow not active");
  });

  it("prevents settlement after settlement", async function () {
    await escrow.createEscrow(tokenId, asset.address, ethers.parseEther("2"), seller.address);
    await escrow.settleEscrow(0);

    await expect(escrow.settleEscrow(0)).to.be.revertedWith("Escrow not active");
  });

  it("prevents creating escrow beyond available value", async function () {
    await reservable.approveReserve(
      tokenId,
      await escrow.getAddress(),
      asset.address,
      ethers.parseEther("20")
    );

    await expect(
      escrow.createEscrow(
        tokenId,
        asset.address,
        ethers.parseEther("11"),
        seller.address
      )
    ).to.be.revertedWith("insufficient available value");
  });

  it("prevents creating escrow beyond reserve allowance", async function () {
    await reservable.approveReserve(
      tokenId,
      await escrow.getAddress(),
      asset.address,
      ethers.parseEther("1")
    );

    await expect(
      escrow.createEscrow(
        tokenId,
        asset.address,
        ethers.parseEther("2"),
        seller.address
      )
    ).to.be.revertedWith("exceeds reserve allowance");
  });
});