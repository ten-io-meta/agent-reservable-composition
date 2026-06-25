// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentIdentityProvenanceHarness {
    struct AgentIdentity {
        address owner;
        address sourceContract;
        uint256 sourceTokenId;
        bool active;
    }

    mapping(bytes32 => AgentIdentity) public agents;
    mapping(bytes32 => bytes32) public inputHashes;
    mapping(bytes32 => bytes32) public spineCommitments;

    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed owner,
        address indexed sourceContract,
        uint256 sourceTokenId
    );

    event InputCommitted(
        bytes32 indexed agentId,
        bytes32 indexed inputHash
    );

    event SpineCommitted(
        bytes32 indexed agentId,
        bytes32 indexed commitmentHash
    );

    function registerAgent(
        bytes32 agentId,
        address owner,
        address sourceContract,
        uint256 sourceTokenId
    ) external {
        require(agentId != bytes32(0), "INVALID_AGENT");
        require(owner != address(0), "INVALID_OWNER");
        require(sourceContract != address(0), "INVALID_SOURCE");
        require(!agents[agentId].active, "AGENT_EXISTS");

        agents[agentId] = AgentIdentity({
            owner: owner,
            sourceContract: sourceContract,
            sourceTokenId: sourceTokenId,
            active: true
        });

        emit AgentRegistered(agentId, owner, sourceContract, sourceTokenId);
    }

    function commitInput(
        bytes32 agentId,
        bytes32 inputHash
    ) external {
        require(agents[agentId].active, "UNKNOWN_AGENT");
        require(inputHash != bytes32(0), "INVALID_INPUT");

        inputHashes[agentId] = inputHash;

        emit InputCommitted(agentId, inputHash);
    }

    function commitSpine(
        bytes32 agentId,
        bytes32 modelHash,
        bytes32 outputHash,
        uint256 timestamp
    ) external returns (bytes32 commitmentHash) {
        require(agents[agentId].active, "UNKNOWN_AGENT");
        require(inputHashes[agentId] != bytes32(0), "NO_INPUT");

        commitmentHash = keccak256(
            abi.encode(
                agentId,
                modelHash,
                inputHashes[agentId],
                outputHash,
                timestamp
            )
        );

        spineCommitments[agentId] = commitmentHash;

        emit SpineCommitted(agentId, commitmentHash);
    }

    function isAgentActive(bytes32 agentId) external view returns (bool) {
        return agents[agentId].active;
    }
}