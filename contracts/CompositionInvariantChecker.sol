// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReservableAccountingView {
    function totalValue(uint256 tokenId, address asset) external view returns (uint256);
    function lockedValue(uint256 tokenId, address asset) external view returns (uint256);
    function availableValue(uint256 tokenId, address asset) external view returns (uint256);
}

contract CompositionInvariantChecker {
    function assertReservableAccounting(
        address reservable,
        uint256 tokenId,
        address asset
    ) external view returns (bool) {
        uint256 total = IReservableAccountingView(reservable).totalValue(tokenId, asset);
        uint256 locked = IReservableAccountingView(reservable).lockedValue(tokenId, asset);
        uint256 available = IReservableAccountingView(reservable).availableValue(tokenId, asset);

        require(locked <= total, "LOCKED_EXCEEDS_TOTAL");
        require(available <= total, "AVAILABLE_EXCEEDS_TOTAL");
        require(locked + available == total, "ACCOUNTING_DRIFT");

        return true;
    }

    function assertAuthorityCursor(
        uint256 consumed,
        uint256 authorityLimit
    ) external pure returns (bool) {
        require(consumed <= authorityLimit, "CONSUMPTION_EXCEEDS_AUTHORITY");
        return true;
    }

    function assertSettlementBound(
        uint256 settledValue,
        uint256 initiallyReserved
    ) external pure returns (bool) {
        require(settledValue <= initiallyReserved, "SETTLEMENT_EXCEEDS_RESERVED");
        return true;
    }

    function assertStateDoesNotRegress(
        uint8 previousState,
        uint8 nextState
    ) external pure returns (bool) {
        require(nextState >= previousState, "STATE_REGRESSION");
        return true;
    }

    function assertIdentityStable(
        address beforeConsumer,
        address afterConsumer,
        address beforeProvider,
        address afterProvider,
        uint256 beforeTokenId,
        uint256 afterTokenId,
        address beforeAsset,
        address afterAsset
    ) external pure returns (bool) {
        require(beforeConsumer == afterConsumer, "CONSUMER_MUTATED");
        require(beforeProvider == afterProvider, "PROVIDER_MUTATED");
        require(beforeTokenId == afterTokenId, "TOKEN_MUTATED");
        require(beforeAsset == afterAsset, "ASSET_MUTATED");

        return true;
    }
}