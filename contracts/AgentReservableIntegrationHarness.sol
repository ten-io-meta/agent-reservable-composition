// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IERC8060Reservable.sol";

contract AgentReservableIntegrationHarness {
    enum WorkflowState {
        None,
        Created,
        Anchored,
        Verified,
        Eligible,
        Settled
    }

    struct Run {
        address consumer;
        address provider;
        uint256 tokenId;
        address asset;
        uint256 authorityLimit;
        uint256 consumed;
        uint256 settledValue;
        bytes32 commitmentHash;
        bool verified;
        bool eligible;
        WorkflowState state;
    }

    IERC8060Reservable public reservable;

    uint256 public nextRunId = 1;
    mapping(uint256 => Run) public runs;

    event RunCreated(uint256 indexed runId, address consumer, address provider, uint256 tokenId, address asset);
    event ValueReserved(uint256 indexed runId, uint256 amount);
    event ConsumptionRecorded(uint256 indexed runId, uint256 amount);
    event CommitmentAnchored(uint256 indexed runId, bytes32 commitmentHash);
    event ResultVerified(uint256 indexed runId);
    event EligibilityGranted(uint256 indexed runId);
    event Settled(uint256 indexed runId, uint256 amount);

    constructor(address reservableAddress) {
        require(reservableAddress != address(0), "INVALID_RESERVABLE");
        reservable = IERC8060Reservable(reservableAddress);
    }

    function createRun(
        address provider,
        uint256 tokenId,
        address asset,
        uint256 authorityLimit
    ) external returns (uint256 runId) {
        require(provider != address(0), "INVALID_PROVIDER");
        require(asset != address(0), "INVALID_ASSET");
        require(authorityLimit > 0, "INVALID_AUTHORITY");

        runId = nextRunId++;

        runs[runId] = Run({
            consumer: msg.sender,
            provider: provider,
            tokenId: tokenId,
            asset: asset,
            authorityLimit: authorityLimit,
            consumed: 0,
            settledValue: 0,
            commitmentHash: bytes32(0),
            verified: false,
            eligible: false,
            state: WorkflowState.Created
        });

        emit RunCreated(runId, msg.sender, provider, tokenId, asset);
    }

    function reserveForRun(uint256 runId, uint256 amount) external {
        Run storage r = runs[runId];

        require(msg.sender == r.consumer, "ONLY_CONSUMER");
        require(r.state == WorkflowState.Created, "INVALID_STATE");

        reservable.reserveValue(r.tokenId, r.asset, amount);

        emit ValueReserved(runId, amount);
    }

    function recordConsumption(uint256 runId, uint256 amount) external {
        Run storage r = runs[runId];

        require(msg.sender == r.consumer, "ONLY_CONSUMER");
        require(r.consumed + amount <= r.authorityLimit, "AUTHORITY_LIMIT_EXCEEDED");

        r.consumed += amount;

        emit ConsumptionRecorded(runId, amount);
    }

    function anchorCommitment(uint256 runId, bytes32 commitmentHash) external {
        Run storage r = runs[runId];

        require(msg.sender == r.consumer, "ONLY_CONSUMER");
        require(r.state == WorkflowState.Created, "INVALID_STATE");
        require(commitmentHash != bytes32(0), "INVALID_COMMITMENT");

        r.commitmentHash = commitmentHash;
        r.state = WorkflowState.Anchored;

        emit CommitmentAnchored(runId, commitmentHash);
    }

    function verifyResult(uint256 runId) external {
        Run storage r = runs[runId];

        require(msg.sender == r.provider, "ONLY_PROVIDER");
        require(r.state == WorkflowState.Anchored, "INVALID_STATE");
        require(r.commitmentHash != bytes32(0), "NO_COMMITMENT");

        r.verified = true;
        r.state = WorkflowState.Verified;

        emit ResultVerified(runId);
    }

    function grantEligibility(uint256 runId) external {
        Run storage r = runs[runId];

        require(r.verified, "NOT_VERIFIED");
        require(r.state == WorkflowState.Verified, "INVALID_STATE");

        r.eligible = true;
        r.state = WorkflowState.Eligible;

        emit EligibilityGranted(runId);
    }

    function settleFromReservedValue(uint256 runId, uint256 amount) external {
        Run storage r = runs[runId];

        require(r.eligible, "NOT_ELIGIBLE");
        require(r.state == WorkflowState.Eligible, "INVALID_STATE");

        reservable.releaseValue(r.tokenId, r.asset, amount);

        r.settledValue += amount;
        r.state = WorkflowState.Settled;

        emit Settled(runId, amount);
    }

    function lockedValue(uint256 runId) external view returns (uint256) {
        Run storage r = runs[runId];
        return reservable.lockedValue(r.tokenId, r.asset);
    }

    function availableValue(uint256 runId) external view returns (uint256) {
        Run storage r = runs[runId];
        return reservable.availableValue(r.tokenId, r.asset);
    }
}