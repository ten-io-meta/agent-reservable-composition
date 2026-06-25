const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ERC8060ReservableMock extra coverage", function () {
  let reservable;
  let owner;
  let user;
  let spender;
  let asset;

  const tokenId = 1;

  beforeEach(async function () {
    [owner, user, spender, asset] = await ethers.getSigners();

    const Reservable = await ethers.getContractFactory("ERC8060ReservableMock");
    reservable = await Reservable.deploy();
    await reservable.waitForDeployment();

    await reservable.mintValue(tokenId, asset.address, ethers.parseEther("10"));
  });

  it("returns owner of minted constructor token", async function () {
    expect(await reservable.ownerOf(tokenId)).to.equal(owner.address);
  });

  it("prevents minting an already minted token", async function () {
    await expect(
      reservable.mintToken(tokenId, user.address)
    ).to.be.revertedWith("already minted");
  });

  it("mints a new token to another owner", async function () {
    await reservable.mintToken(2, user.address);

    expect(await reservable.ownerOf(2)).to.equal(user.address);
  });

  it("prevents non-owner from minting value", async function () {
    await expect(
      reservable.connect(user).mintValue(tokenId, asset.address, ethers.parseEther("1"))
    ).to.be.revertedWith("not owner");
  });

  it("allows owner to withdraw available value", async function () {
    await reservable.withdraw(tokenId, asset.address, ethers.parseEther("3"));

    expect(await reservable.totalValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("7")
    );
  });

  it("prevents withdrawing more than available value", async function () {
    await reservable.approveReserve(
      tokenId,
      spender.address,
      asset.address,
      ethers.parseEther("8")
    );

    await reservable.connect(spender).reserveValue(
      tokenId,
      asset.address,
      ethers.parseEther("8")
    );

    await expect(
      reservable.withdraw(tokenId, asset.address, ethers.parseEther("3"))
    ).to.be.revertedWith("insufficient available value");
  });

  it("prevents non-owner from withdrawing value", async function () {
    await expect(
      reservable.connect(user).withdraw(tokenId, asset.address, ethers.parseEther("1"))
    ).to.be.revertedWith("not owner");
  });

  it("transfers token from owner to another address", async function () {
    await reservable.transferFrom(owner.address, user.address, tokenId);

    expect(await reservable.ownerOf(tokenId)).to.equal(user.address);
  });

  it("prevents transfer from wrong owner", async function () {
    await expect(
      reservable.transferFrom(user.address, spender.address, tokenId)
    ).to.be.revertedWith("wrong owner");
  });

  it("prevents transfer by unauthorized caller", async function () {
    await expect(
      reservable.connect(user).transferFrom(owner.address, user.address, tokenId)
    ).to.be.revertedWith("not authorized");
  });

  it("prevents reserving zero amount", async function () {
    await expect(
      reservable.connect(spender).reserveValue(tokenId, asset.address, 0)
    ).to.be.revertedWith("amount is zero");
  });

  it("prevents releasing zero amount", async function () {
    await expect(
      reservable.connect(spender).releaseValue(tokenId, asset.address, 0)
    ).to.be.revertedWith("amount is zero");
  });

  it("prevents releasing more than locked value", async function () {
    await reservable.approveReserve(
      tokenId,
      spender.address,
      asset.address,
      ethers.parseEther("1")
    );

    await reservable.connect(spender).reserveValue(
      tokenId,
      asset.address,
      ethers.parseEther("1")
    );

    await expect(
      reservable.connect(spender).releaseValue(
        tokenId,
        asset.address,
        ethers.parseEther("2")
      )
    ).to.be.revertedWith("release exceeds locked value");
  });
    it("allows partial release and restores allowance", async function () {
    await reservable.approveReserve(
      tokenId,
      spender.address,
      asset.address,
      ethers.parseEther("5")
    );

    await reservable.connect(spender).reserveValue(
      tokenId,
      asset.address,
      ethers.parseEther("3")
    );

    await reservable.connect(spender).releaseValue(
      tokenId,
      asset.address,
      ethers.parseEther("1")
    );

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("2")
    );

    expect(await reservable.reserveAllowance(tokenId, spender.address, asset.address)).to.equal(
      ethers.parseEther("3")
    );
  });

  it("allows reserving again after partial release", async function () {
    await reservable.approveReserve(
      tokenId,
      spender.address,
      asset.address,
      ethers.parseEther("5")
    );

    await reservable.connect(spender).reserveValue(
      tokenId,
      asset.address,
      ethers.parseEther("3")
    );

    await reservable.connect(spender).releaseValue(
      tokenId,
      asset.address,
      ethers.parseEther("2")
    );

    await reservable.connect(spender).reserveValue(
      tokenId,
      asset.address,
      ethers.parseEther("4")
    );

    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("5")
    );
  });

  it("keeps locked value after token transfer", async function () {
    await reservable.approveReserve(
      tokenId,
      spender.address,
      asset.address,
      ethers.parseEther("4")
    );

    await reservable.connect(spender).reserveValue(
      tokenId,
      asset.address,
      ethers.parseEther("4")
    );

    await reservable.transferFrom(owner.address, user.address, tokenId);

    expect(await reservable.ownerOf(tokenId)).to.equal(user.address);
    expect(await reservable.lockedValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("4")
    );
  });

  it("new owner can mint additional value after transfer", async function () {
    await reservable.transferFrom(owner.address, user.address, tokenId);

    await reservable.connect(user).mintValue(
      tokenId,
      asset.address,
      ethers.parseEther("2")
    );

    expect(await reservable.totalValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("12")
    );
  });

  it("old owner cannot mint value after transfer", async function () {
    await reservable.transferFrom(owner.address, user.address, tokenId);

    await expect(
      reservable.mintValue(tokenId, asset.address, ethers.parseEther("1"))
    ).to.be.revertedWith("not owner");
  });

  it("new owner can withdraw available value after transfer", async function () {
    await reservable.transferFrom(owner.address, user.address, tokenId);

    await reservable.connect(user).withdraw(
      tokenId,
      asset.address,
      ethers.parseEther("2")
    );

    expect(await reservable.totalValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("8")
    );
  });

  it("returns full allowance when nothing is locked", async function () {
    await reservable.approveReserve(
      tokenId,
      spender.address,
      asset.address,
      ethers.parseEther("6")
    );

    expect(await reservable.reserveAllowance(tokenId, spender.address, asset.address)).to.equal(
      ethers.parseEther("6")
    );
  });

  it("returns available value after reservation", async function () {
    await reservable.approveReserve(
      tokenId,
      spender.address,
      asset.address,
      ethers.parseEther("3")
    );

    await reservable.connect(spender).reserveValue(
      tokenId,
      asset.address,
      ethers.parseEther("3")
    );

    expect(await reservable.availableValue(tokenId, asset.address)).to.equal(
      ethers.parseEther("7")
    );
  });

  it("returns zero allowance when approved amount is fully locked", async function () {
    await reservable.approveReserve(
      tokenId,
      spender.address,
      asset.address,
      ethers.parseEther("1")
    );

    await reservable.connect(spender).reserveValue(
      tokenId,
      asset.address,
      ethers.parseEther("1")
    );

    expect(await reservable.reserveAllowance(tokenId, spender.address, asset.address)).to.equal(0);
  });
});