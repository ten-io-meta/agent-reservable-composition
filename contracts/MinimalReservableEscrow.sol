// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IERC8060Reservable.sol";

contract MinimalReservableEscrow {
    IERC8060Reservable public immutable reservable;

    struct Escrow {
        uint256 tokenId;
        address asset;
        uint256 amount;
        address seller;
        bool active;
        bool settled;
    }

    uint256 public nextEscrowId;
    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(
        uint256 indexed escrowId,
        uint256 indexed tokenId,
        address indexed seller,
        address asset,
        uint256 amount
    );

    event EscrowReleased(uint256 indexed escrowId);
    event EscrowSettled(uint256 indexed escrowId);

    constructor(address reservable_) {
        reservable = IERC8060Reservable(reservable_);
    }

    function createEscrow(
        uint256 tokenId,
        address asset,
        uint256 amount,
        address seller
    ) external returns (uint256 escrowId) {
        reservable.reserveValue(tokenId, asset, amount);

        escrowId = nextEscrowId++;

        escrows[escrowId] = Escrow({
            tokenId: tokenId,
            asset: asset,
            amount: amount,
            seller: seller,
            active: true,
            settled: false
        });

        emit EscrowCreated(escrowId, tokenId, seller, asset, amount);
    }

    function releaseEscrow(uint256 escrowId) external {
        Escrow storage e = escrows[escrowId];

        require(e.active, "Escrow not active");
        require(!e.settled, "Escrow already settled");

        e.active = false;

        reservable.releaseValue(e.tokenId, e.asset, e.amount);

        emit EscrowReleased(escrowId);
    }

    function settleEscrow(uint256 escrowId) external {
        Escrow storage e = escrows[escrowId];

        require(e.active, "Escrow not active");
        require(!e.settled, "Escrow already settled");

        e.active = false;
        e.settled = true;

        // Demo only:
        // IERC8060Reservable deliberately does not define settlement.
        // A real application would call its own settlement / payout logic here.

        emit EscrowSettled(escrowId);
    }
}