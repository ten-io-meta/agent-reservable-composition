// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CompositionAccountingDemo {
    uint256 public authorityLimit;
    uint256 public consumed;
    uint256 public totalValue;
    uint256 public lockedValue;
    uint256 public settled;

    event AuthorityDefined(uint256 limit);
    event ValueEmbedded(uint256 totalValue);
    event ValueReserved(uint256 amount, uint256 lockedValue, uint256 availableValue);
    event ConsumptionRecorded(uint256 amount, uint256 consumed);
    event Settled(uint256 amount, uint256 settled, uint256 lockedValue);

    constructor(uint256 _authorityLimit, uint256 _totalValue) {
        authorityLimit = _authorityLimit;
        totalValue = _totalValue;

        emit AuthorityDefined(_authorityLimit);
        emit ValueEmbedded(_totalValue);
    }

    function availableValue() public view returns (uint256) {
        return totalValue - lockedValue;
    }

    function reserveValue(uint256 amount) external {
        require(amount <= availableValue(), "INSUFFICIENT_AVAILABLE_VALUE");
        lockedValue += amount;
        emit ValueReserved(amount, lockedValue, availableValue());
    }

    function recordConsumption(uint256 amount) external {
        require(consumed + amount <= authorityLimit, "AUTHORITY_LIMIT_EXCEEDED");
        consumed += amount;
        emit ConsumptionRecorded(amount, consumed);
    }

    function settleReserved(uint256 amount) external {
        require(amount <= lockedValue, "INSUFFICIENT_LOCKED_VALUE");
        lockedValue -= amount;
        settled += amount;
        totalValue -= amount;

        emit Settled(amount, settled, lockedValue);
    }
}