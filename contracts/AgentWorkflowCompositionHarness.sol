// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentWorkflowCompositionHarness {
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
        uint256 authorityLimit;     // ERC-8001: what may be spent
        uint256 consumed;           // ERC-8312: what has been used
        uint256 totalValue;         // ERC-8060: embedded value
        uint256 lockedValue;        // Reservable: committed value
        uint256 settledValue;       // ERC-8275: paid/settled value
        bytes32 commitmentHash;     // ERC-8263 / commitment spine
        bool verified;              // ERC-8274
        bool eligible;              // ReceiptOS-style eligibility
        WorkflowState state;        // ERC-8301-style workflow state
    }

    uint256 public nextRunId = 1;
    mapping(uint256 => Run) public runs;

    event RunCreated(uint256 indexed runId, address consumer, address provider);
    event ValueReserved(uint256 indexed runId, uint256 amount);
    event ConsumptionRecorded(uint256 indexed runId, uint256 amount);
    event CommitmentAnchored(uint256 indexed runId, bytes32 commitmentHash);
    event ResultVerified(uint256 indexed runId);
    event EligibilityGranted(uint256 indexed runId);
    event Settled(uint256 indexed runId, uint256 amount);

    function createRun(
        address provider,
        uint256 authorityLimit,
        uint256 totalValue
    ) external returns (uint256 runId) {
        require(provider != address(0), "INVALID_PROVIDER");
        require(authorityLimit > 0, "INVALID_AUTHORITY");
        require(totalValue > 0, "INVALID_VALUE");

        runId = nextRunId++;

        runs[runId] = Run({
            consumer: msg.sender,
            provider: provider,
            authorityLimit: authorityLimit,
            consumed: 0,
            totalValue: totalValue,
            lockedValue: 0,
            settledValue: 0,
            commitmentHash: bytes32(0),
            verified: false,
            eligible: false,
            state: WorkflowState.Created
        });

        emit RunCreated(runId, msg.sender, provider);
    }

    function availableValue(uint256 runId) public view returns (uint256) {
        Run storage r = runs[runId];
        return r.totalValue - r.lockedValue;
    }

    function reserveValue(uint256 runId, uint256 amount) external {
        Run storage r = runs[runId];

        require(msg.sender == r.consumer, "ONLY_CONSUMER");
        require(r.state == WorkflowState.Created, "INVALID_STATE");
        require(amount <= availableValue(runId), "INSUFFICIENT_AVAILABLE_VALUE");

        r.lockedValue += amount;

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

    function settle(uint256 runId, uint256 amount) external {
        Run storage r = runs[runId];

        require(r.eligible, "NOT_ELIGIBLE");
        require(r.state == WorkflowState.Eligible, "INVALID_STATE");
        require(amount <= r.lockedValue, "INSUFFICIENT_LOCKED_VALUE");

        r.lockedValue -= amount;
        r.totalValue -= amount;
        r.settledValue += amount;
        r.state = WorkflowState.Settled;

        emit Settled(runId, amount);
    }
}