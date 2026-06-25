// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IERC8060Reservable
/// @notice Optional extension for ERC-8060-style value-bearing NFTs.
/// @dev This interface does not standardize obligations, terms, deadlines,
/// beneficiaries, disputes, metadata or business logic.
/// It only provides the minimal accounting required to prevent reserved
/// value from being withdrawn by the owner.
interface IERC8060Reservable {

    event ReserveApproval(
        uint256 indexed tokenId,
        address indexed spender,
        address indexed asset,
        uint256 amount
    );

    event ValueReserved(
        uint256 indexed tokenId,
        address indexed spender,
        address indexed asset,
        uint256 amount
    );

    event ValueReleased(
        uint256 indexed tokenId,
        address indexed spender,
        address indexed asset,
        uint256 amount
    );

    function approveReserve(
        uint256 tokenId,
        address spender,
        address asset,
        uint256 amount
    ) external;

    /// @notice Moves `amount` from available value to locked value.
    /// @dev Callable only by an authorized spender.
    ///      Reverts if `amount` exceeds remaining allowance or available value.
    function reserveValue(
        uint256 tokenId,
        address asset,
        uint256 amount
    ) external;

    function releaseValue(
        uint256 tokenId,
        address asset,
        uint256 amount
    ) external;

    function reserveAllowance(
        uint256 tokenId,
        address spender,
        address asset
    ) external view returns (uint256);

    function lockedValue(
        uint256 tokenId,
        address asset
    ) external view returns (uint256);

    /// @notice Returns value currently withdrawable by the owner.
    /// @dev Must equal totalValue(tokenId, asset) - lockedValue(tokenId, asset).
    function availableValue(
        uint256 tokenId,
        address asset
    ) external view returns (uint256);
}

/**
 * Required Invariants
 *
 * Any correct implementation MUST maintain these invariants.
 * Violations MUST cause reverts in the relevant functions.
 *
 * 1. lockedValue(tokenId, asset) <= totalValue(tokenId, asset)
 *
 * 2. availableValue(tokenId, asset) == totalValue(tokenId, asset) - lockedValue(tokenId, asset)
 *
 * 3. Any operation that reduces the token's custodied balance for an asset
 *    (withdraw, burn, or internal value movement) MUST revert if
 *    amount > availableValue(tokenId, asset).
 *
 * 4. reserveValue() MUST revert unless BOTH hold:
 *    - amount <= reserveAllowance(tokenId, msg.sender, asset)
 *    - amount <= availableValue(tokenId, asset)
 *
 * 5. releaseValue() MUST revert if the caller tries to release more
 *    than it currently has locked.
 *
 * 6. Reservations and locked value are bound to tokenId. If the NFT is
 *    transferred, all active reservations travel with the token.
 */

/**
 * Implementation Requirements
 *
 * - The contract MUST enforce Invariant 3 inside its withdraw/burn logic.
 * - totalValue(tokenId, asset) is expected to be provided by the base
 *   ERC-8060 implementation or equivalent accounting.
 */

/**
 * Design Notes
 *
 * - reserveAllowance is authorization, not a commitment.
 *   It does not reduce availableValue and is not counted as lockedValue.
 *
 * - Transfer restrictions while value is locked are out of scope.
 *   Reservations travel with the tokenId by design.
 *
 * - Higher-level concerns (terms, deadlines, beneficiaries, risk assessment,
 *   dispute resolution, etc.) belong in the escrow / application layer.
 */