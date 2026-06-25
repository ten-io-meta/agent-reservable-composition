// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IERC8060Reservable.sol";

contract MinimalLendingCollateral {
    IERC8060Reservable public immutable reservable;

    struct Loan {
        uint256 tokenId;
        address asset;
        uint256 collateralAmount;
        address borrower;
        bool active;
        bool closed;
    }

    uint256 public nextLoanId;
    mapping(uint256 => Loan) public loans;

    event LoanOpened(
        uint256 indexed loanId,
        uint256 indexed tokenId,
        address indexed borrower,
        address asset,
        uint256 collateralAmount
    );

    event LoanClosed(uint256 indexed loanId);

    constructor(address reservable_) {
        require(reservable_ != address(0), "invalid reservable");
        reservable = IERC8060Reservable(reservable_);
    }

    function openLoan(
        uint256 tokenId,
        address asset,
        uint256 collateralAmount
    ) external returns (uint256 loanId) {
        require(collateralAmount > 0, "collateral is zero");

        reservable.reserveValue(tokenId, asset, collateralAmount);

        loanId = nextLoanId++;

        loans[loanId] = Loan({
            tokenId: tokenId,
            asset: asset,
            collateralAmount: collateralAmount,
            borrower: msg.sender,
            active: true,
            closed: false
        });

        emit LoanOpened(
            loanId,
            tokenId,
            msg.sender,
            asset,
            collateralAmount
        );
    }

    function closeLoan(uint256 loanId) external {
        Loan storage l = loans[loanId];

        require(l.active, "loan not active");
        require(!l.closed, "loan already closed");

        l.active = false;
        l.closed = true;

        reservable.releaseValue(
            l.tokenId,
            l.asset,
            l.collateralAmount
        );

        emit LoanClosed(loanId);
    }
}