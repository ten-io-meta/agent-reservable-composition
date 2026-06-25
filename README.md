# Agent Reservable Composition

> Experimental validation suite for deterministic protocol composition around **ERC-8060 Reservable** and interoperable Ethereum protocol layers.

[![CI](https://github.com/ten-io-meta/agent-reservable-composition/actions/workflows/ci.yml/badge.svg)](../../actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

# Overview

This repository is an experimental research and validation suite exploring how **ERC-8060 Reservable** composes with complementary Ethereum protocol proposals while preserving deterministic accounting.

Its purpose is to empirically validate that logically independent protocol layers—including authority delegation, provenance, workflow execution, settlement and reservable accounting—can compose without violating accounting invariants.

This repository is intended as a **research and validation suite**, not as a production implementation or canonical reference implementation of any individual ERC.

---

# Goals

The primary objective is to demonstrate that protocol composition can remain:

* Deterministic
* Modular
* Verifiable
* Accounting-safe
* Replay-safe
* Layer-independent

while allowing higher-level protocols to interoperate through well-defined interfaces.

---

# Protocol Stack

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

Each layer is intentionally designed to remain logically independent while participating in a deterministic workflow.

---

# Composition Architecture

```
                 Agent Identity
                       │
               Authority Envelope
                       │
               Workflow Execution
                       │
                 Settlement Layer
                       │
               ERC-8060 Reservable
                       │
         Deterministic Accounting Layer
                       │
          Composition Invariant Checker
```

Every layer owns its own state while exposing deterministic interfaces to adjacent layers.

---

# Repository Structure

```
contracts/
├── AgentIdentityProvenanceHarness.sol
├── AgentReservableIntegrationHarness.sol
├── AgentWorkflowCompositionHarness.sol
├── CompositionAccountingDemo.sol
├── CompositionInvariantChecker.sol
├── ERC8060ReservableMock.sol
├── IERC8060Reservable.sol
├── MinimalReservableEscrow.sol
├── ReservableNFTDemo.sol
├── TimedReservableEscrow.sol

test/
├── accounting
├── adversarial
├── composition
├── escrow
├── workflow
└── integration

.github/workflows/
└── ci.yml
```

---

# Validation Suite

The repository includes a comprehensive empirical validation suite covering:

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

# Validation Results

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

The remaining uncovered branches correspond primarily to defensive and revert-only execution paths commonly found in Solidity contracts.

---

# Accounting Invariants

The validation suite continuously verifies the following invariants.

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

The suite demonstrates that:

* Reservation does not mutate authority accounting.
* Consumption does not mutate reservable accounting.
* Settlement remains bounded by reserved value.
* Workflow progresses monotonically.
* Identity remains immutable throughout settlement.
* Independent workflows remain isolated.
* Independent assets remain isolated.
* Replay execution produces deterministic results.
* Long-running executions preserve accounting invariants.

---

# Escrow Examples

Included reference implementations:

* Minimal Reservable Escrow
* Timed Reservable Escrow

Both examples compose directly with `IERC8060Reservable` without modifying the reservable accounting model.

---

# Gas Reporting

Gas usage is automatically generated through:

```
hardhat-gas-reporter
```

Compiler configuration:

```
Solidity 0.8.20
Optimizer enabled
Runs: 200
```

---

# Running Locally

Install dependencies:

```bash
npm install
```

Run the validation suite:

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

ERC-8060 Reservable intentionally separates four independent concerns:

* Reservation
* Consumption
* Settlement
* Accounting

Reservation is an accounting primitive.

Consumption is measured independently.

Settlement is an application-layer decision.

Accounting remains deterministic throughout the entire workflow.

This separation enables protocol composition without coupling independent layers or violating accounting guarantees.

---

# Research Scope

This repository explores interoperability between reservable accounting and higher-level protocol layers.

It does **not** define normative behavior for the referenced ERC proposals.

Instead, it provides empirical evidence that independent protocol layers can compose while preserving deterministic accounting invariants.

---

# Citation

If this repository contributes to academic or technical work, please cite it using the included `CITATION.cff` metadata.

---

# License

Released under the MIT License.
