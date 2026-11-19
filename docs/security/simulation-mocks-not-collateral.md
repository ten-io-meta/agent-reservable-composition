# Agent composition mock trust boundaries

## No native ETH economic guarantee

ERC8060ReservableMock.sol is a **mock ledger**, not a production NFT, not ERC-721 compliant and not a strict ERC-8060 backing vault. Its mintToken operation can be called by anyone for an unallocated token ID, while mintValue records a positive claim without transferring any native ETH to the contract. withdraw decreases a variable, NOT a real ETH payment.

CompositionAccountingDemo.sol likewise models numeric authority/reserve/settlement counters, not an authenticated ETH custody or creditor payout mechanism. No demo with this mock is eligible to represent actual solvency.

Do NOT allow an OECL gate or a lending interface to take these counters as evidence of backed ETH, owner rights, or executable creditor claims. Use the independently authenticated strict ETH-backed reference and enforceable conditional loan reference in erc8060-reservable PRs instead; those are still research prototypes and require audit.

Historical test suites that exercise this mock can remain as **negative/control fixtures**, with naming that always states their simulated-only scope.

## Release requirements

- Keep all contract signatures and test fixtures stable while clarifying risk.
- Require a real ETH-funded vault, independently verifiable provenance, per-token collateral conservation and payment settlement before describing assets as backed.
- Avoid implying ERC-8098 conformance: it is an independent ERC-20 supply profile; the mocks do not address token supply irreversibility.
- Preserve historical research results without adding unsound production claims.

No live deployment, ETH movement or code logic change is authorized by this documentation.
