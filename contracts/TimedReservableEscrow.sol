// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IERC8060Reservable.sol";

contract TimedReservableEscrow {
    IERC8060Reservable public immutable reservable;

    struct TimedEscrow {
        uint256 tokenId;
        address asset;
        uint256 amount;
        address seller;
        uint256 deadline;
        bool active;
        bool settled;
        bool refunded;
    }

    uint256 public nextEscrowId;
    mapping(uint256 => TimedEscrow) public escrows;

    event TimedEscrowCreated(
        uint256 indexed escrowId,
        uint256 indexed tokenId,
        address indexed seller,
        address asset,
        uint256 amount,
        uint256 deadline
    );

    event TimedEscrowSettled(uint256 indexed escrowId);
    event TimedEscrowRefunded(uint256 indexed escrowId);

    constructor(address reservable_) {
        require(reservable_ != address(0), "invalid reservable");
        reservable = IERC8060Reservable(reservable_);
    }

    function createTimedEscrow(
        uint256 tokenId,
        address asset,
        uint256 amount,
        address seller,
        uint256 duration
    ) external returns (uint256 escrowId) {
        require(amount > 0, "amount is zero");
        require(seller != address(0), "invalid seller");
        require(duration > 0, "duration is zero");

        reservable.reserveValue(tokenId, asset, amount);

        escrowId = nextEscrowId++;

        escrows[escrowId] = TimedEscrow({
            tokenId: tokenId,
            asset: asset,
            amount: amount,
            seller: seller,
            deadline: block.timestamp + duration,
            active: true,
            settled: false,
            refunded: false
        });

        emit TimedEscrowCreated(
            escrowId,
            tokenId,
            seller,
            asset,
            amount,
            block.timestamp + duration
        );
    }

    function settleTimedEscrow(uint256 escrowId) external {
        TimedEscrow storage e = escrows[escrowId];

        require(e.active, "escrow not active");
        require(!e.refunded, "escrow refunded");

        e.active = false;
        e.settled = true;

        // Demo only:
        // Settlement is intentionally application-layer logic.
        // IERC8060Reservable does not define payout or consumption.

        emit TimedEscrowSettled(escrowId);
    }

    function refundExpiredEscrow(uint256 escrowId) external {
        TimedEscrow storage e = escrows[escrowId];

        require(e.active, "escrow not active");
        require(!e.settled, "escrow settled");
        require(block.timestamp > e.deadline, "deadline not reached");

        e.active = false;
        e.refunded = true;

        reservable.releaseValue(e.tokenId, e.asset, e.amount);

        emit TimedEscrowRefunded(escrowId);
    }
}