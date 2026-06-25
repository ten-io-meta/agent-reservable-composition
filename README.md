# Agent Reservable Composition

> Research validation suite for deterministic protocol composition around **ERC-8060 Reservable** and interoperable Ethereum protocol layers.

**CI** • **MIT License** • **DOI (coming soon via Zenodo)**

---

# Status

**Project status:** Active research

This repository is actively maintained as an empirical validation suite exploring deterministic protocol composition around ERC-8060 Reservable.

---

# Overview

This repository is a research and validation suite exploring how **ERC-8060 Reservable** composes with complementary Ethereum protocol proposals while preserving deterministic accounting.

Its purpose is to empirically validate that logically independent protocol layers—including authority delegation, provenance, workflow execution, settlement and reservable accounting—can compose without violating accounting invariants.

This repository is intended as a research and validation suite, **not** as a production implementation or canonical reference implementation of any individual ERC.

---

# Why this repository?

Many Ethereum proposals define protocol layers independently.

This repository explores whether independent protocol abstractions can compose while preserving deterministic accounting, workflow isolation, replay safety and modularity.

Rather than defining new protocol behavior, it provides empirical evidence that independent protocol layers can interoperate safely.

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

```text
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
   Deterministic Accounting
                │
 Composition Invariant Checker
```

Every layer owns its own state while exposing deterministic interfaces to adjacent layers.

---

# Repository Structure

```text
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

docs/
├── architecture.md
├── accounting.md
└── workflow.md

.github/workflows/
└── ci.yml
```

---

# Documentation

Additional technical documentation is available under the `docs/` directory.

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

```text
251 passing
0 failing
```

Coverage:

```text
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

```text
lockedValue + availableValue == totalValue
```

## Authority

```text
consumed <= authorityLimit
```

## Settlement

```text
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

```text
hardhat-gas-reporter
```

Compiler configuration:

```text
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
