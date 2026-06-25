// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IERC8060Reservable.sol";

contract ERC8060ReservableMock is IERC8060Reservable {
    mapping(uint256 => address) private _owners;
    mapping(uint256 => mapping(address => uint256)) private _totalValue;
    mapping(uint256 => mapping(address => uint256)) private _lockedValue;

    struct Reservation {
        uint256 approved;
        uint256 locked;
    }

    mapping(uint256 => mapping(address => mapping(address => Reservation))) private _reservations;

    constructor() {
        _owners[1] = msg.sender;
    }

    modifier onlyOwner(uint256 tokenId) {
        require(_owners[tokenId] == msg.sender, "not owner");
        _;
    }

    function mintToken(uint256 tokenId, address to) external {
        require(_owners[tokenId] == address(0), "already minted");
        _owners[tokenId] = to;
    }

    function mintValue(uint256 tokenId, address asset, uint256 amount) external onlyOwner(tokenId) {
        _totalValue[tokenId][asset] += amount;
    }

    function totalValue(uint256 tokenId, address asset) external view returns (uint256) {
        return _totalValue[tokenId][asset];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(_owners[tokenId] == from, "wrong owner");
        require(msg.sender == from, "not authorized");

        _clearUnusedReserveAllowances(tokenId);

        _owners[tokenId] = to;
    }

    function withdraw(uint256 tokenId, address asset, uint256 amount) external onlyOwner(tokenId) {
        require(amount <= availableValue(tokenId, asset), "insufficient available value");
        _totalValue[tokenId][asset] -= amount;
    }

    function approveReserve(
        uint256 tokenId,
        address spender,
        address asset,
        uint256 amount
    ) external onlyOwner(tokenId) {
        _reservations[tokenId][spender][asset].approved = amount;
        emit ReserveApproval(tokenId, spender, asset, amount);
    }

    function reserveValue(
        uint256 tokenId,
        address asset,
        uint256 amount
    ) external {
        require(amount > 0, "amount is zero");

        Reservation storage r = _reservations[tokenId][msg.sender][asset];

        require(amount <= reserveAllowance(tokenId, msg.sender, asset), "exceeds reserve allowance");
        require(amount <= availableValue(tokenId, asset), "insufficient available value");

        r.locked += amount;
        _lockedValue[tokenId][asset] += amount;

        emit ValueReserved(tokenId, msg.sender, asset, amount);
    }

    function releaseValue(
        uint256 tokenId,
        address asset,
        uint256 amount
    ) external {
        require(amount > 0, "amount is zero");

        Reservation storage r = _reservations[tokenId][msg.sender][asset];

        require(amount <= r.locked, "release exceeds locked value");

        r.locked -= amount;
        _lockedValue[tokenId][asset] -= amount;

        emit ValueReleased(tokenId, msg.sender, asset, amount);
    }

    function reserveAllowance(
        uint256 tokenId,
        address spender,
        address asset
    ) public view returns (uint256) {
        Reservation memory r = _reservations[tokenId][spender][asset];

        if (r.approved <= r.locked) {
            return 0;
        }

        return r.approved - r.locked;
    }

    function lockedValue(
        uint256 tokenId,
        address asset
    ) public view returns (uint256) {
        return _lockedValue[tokenId][asset];
    }

    function availableValue(
        uint256 tokenId,
        address asset
    ) public view returns (uint256) {
        return _totalValue[tokenId][asset] - _lockedValue[tokenId][asset];
    }

    function _clearUnusedReserveAllowances(uint256 tokenId) internal {
        // Mock limitation:
        // This reference mock does not maintain an enumerable spender list.
        // Production implementations SHOULD clear or invalidate unused
        // reserve allowance on transfer while preserving active locked value.
    }
}