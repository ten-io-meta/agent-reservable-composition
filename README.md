[![CI](https://github.com/ten-io-meta/agent-reservable-composition/actions/workflows/ci.yml/badge.svg)](https://github.com/ten-io-meta/agent-reservable-composition/actions/workflows/ci.yml)

![License](https://img.shields.io/badge/license-MIT-green.svg)

# Agent Reservable Composition

This repository is an experimental composition and validation suite exploring interoperability between **ERC-8060 Reservable** and complementary Ethereum protocol proposals.

Its purpose is to empirically validate that independent protocol layers—including authority delegation, provenance, workflow execution, settlement and reservable accounting—can compose while preserving deterministic accounting invariants.

It is intended as a research and validation suite rather than a production implementation or reference implementation of any individual ERC.

---

# Overview

This repository demonstrates how **ERC-8060 Reservable** can be composed with higher-level protocol layers while preserving strict accounting invariants and separation of responsibilities.


The composition includes the following layers:

| Layer              | Purpose                       |
| ------------------ | ----------------------------- |
| ERC-8004           | Agent identity binding        |
| ERC-8217           | Identity binding              |
| ERC-8281           | Input provenance              |
| ERC-8299           | WYRIWE-style spine commitment |
| ERC-8001           | Authority envelope            |
| ERC-8312           | Consumption cursor            |
| ERC-8301           | Workflow state machine        |
| ERC-8263           | Commitment anchoring          |
| ERC-8274           | Verification                  |
| ReceiptOS          | Eligibility                   |
| ERC-8275           | Settlement                    |
| ERC-8060           | Embedded native value         |
| IERC8060Reservable | Reservable accounting layer   |

The goal is to demonstrate that these layers remain logically independent while composing into a deterministic workflow.

---

# Repository Structure

```
contracts/
    AgentIdentityProvenanceHarness.sol
    AgentReservableIntegrationHarness.sol
    AgentWorkflowCompositionHarness.sol
    CompositionAccountingDemo.sol
    CompositionInvariantChecker.sol
    ERC8060ReservableMock.sol
    IERC8060Reservable.sol
    MinimalReservableEscrow.sol
    ReservableNFTDemo.sol
    TimedReservableEscrow.sol

test/
    ...
```

---

# Validation Suite

The repository contains a comprehensive empirical validation suite including:

* Full lifecycle execution
* Differential testing
* Global invariant checking
* Accounting verification
* Identity stability
* Authority cursor validation
* Settlement validation
* Escrow composition
* Timed escrow composition
* Multi-domain isolation
* Replay determinism
* Long-chain execution
* Stress simulations
* Manual fuzz testing
* Invalid sequence testing
* Adversarial bypass attempts

---

# Test Results

Current validation status:

```
251 passing
0 failing
```

Coverage:

```
Statements : 100%
Functions  : 100%
Lines      : 100%
Branches   : 77.72%
```

The remaining uncovered branches correspond primarily to defensive and revert-only execution paths typical of Solidity contracts.

---

# Accounting Invariants

The following invariants are continuously verified throughout the suite.

## Embedded Value

```
lockedValue + availableValue == totalValue
```

## Authority

```
consumed <= authorityLimit
```

## Settlement

```
settled <= reserved
```

## Identity

Workflow settlement never mutates:

* consumer
* provider
* asset
* token
* identity bindings

---

# Composition Properties

The suite demonstrates:

* Reservation does not mutate authority accounting.
* Consumption does not mutate reservable accounting.
* Settlement remains bounded by reserved value.
* Workflow state progresses monotonically.
* Identity remains immutable throughout settlement.
* Independent workflows remain isolated.
* Independent token/asset domains remain isolated.
* Replay produces deterministic logical results.
* Long-running executions preserve accounting invariants.

---

# Escrow Examples

Included examples:

* Minimal Reservable Escrow
* Timed Reservable Escrow

Both compose directly with IERC8060Reservable without modifying the reservable accounting model.

---

# Gas Report

Gas usage is automatically generated using:

```
hardhat-gas-reporter
```

Optimizer configuration:

```
Solidity 0.8.20
Optimizer enabled
Runs: 200
```

---

# Running the Suite

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npx hardhat test
```

Generate coverage:

```bash
npx hardhat coverage
```

Generate gas report:

```bash
npx hardhat test
```

---

# Design Philosophy

ERC-8060 Reservable intentionally separates:

* reservation
* consumption
* settlement

Reservation is an accounting primitive.

Consumption is measured independently.

Settlement is an application-layer decision.

This separation allows higher-level protocols to compose safely while preserving deterministic accounting.

---

# License

MIT
