// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ReservableNFTDemo {
    mapping(uint256 => uint256) public totalValueOf;
    mapping(uint256 => uint256) public lockedValueOf;
    mapping(uint256 => address) public ownerOf;

    event Minted(uint256 indexed tokenId, address indexed owner, uint256 value);
    event ValueReserved(uint256 indexed tokenId, uint256 amount);
    event ReservedValueConsumed(uint256 indexed tokenId, uint256 amount);
    event ReservedValueReleased(uint256 indexed tokenId, uint256 amount);

    function mint(uint256 tokenId, uint256 value) external {
        require(ownerOf[tokenId] == address(0), "ALREADY_MINTED");

        ownerOf[tokenId] = msg.sender;
        totalValueOf[tokenId] = value;

        emit Minted(tokenId, msg.sender, value);
    }

    function availableValueOf(uint256 tokenId) public view returns (uint256) {
        return totalValueOf[tokenId] - lockedValueOf[tokenId];
    }

    function reserveValue(uint256 tokenId, uint256 amount) external {
        require(ownerOf[tokenId] == msg.sender, "NOT_OWNER");
        require(
            amount <= availableValueOf(tokenId),
            "INSUFFICIENT_AVAILABLE_VALUE"
        );

        lockedValueOf[tokenId] += amount;

        emit ValueReserved(tokenId, amount);
    }

    function releaseValue(uint256 tokenId, uint256 amount) external {
        require(ownerOf[tokenId] == msg.sender, "NOT_OWNER");
        require(
            amount <= lockedValueOf[tokenId],
            "INSUFFICIENT_LOCKED_VALUE"
        );

        lockedValueOf[tokenId] -= amount;

        emit ReservedValueReleased(tokenId, amount);
    }

    function consumeReservedValue(uint256 tokenId, uint256 amount) external {
        require(ownerOf[tokenId] == msg.sender, "NOT_OWNER");
        require(
            amount <= lockedValueOf[tokenId],
            "INSUFFICIENT_LOCKED_VALUE"
        );

        lockedValueOf[tokenId] -= amount;
        totalValueOf[tokenId] -= amount;

        emit ReservedValueConsumed(tokenId, amount);
    }
}