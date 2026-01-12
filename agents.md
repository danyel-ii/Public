# agents.md — Codex Roles & Working Agreement (PaperClips)

This project builds a paper-sculpture UI with on-chain SVG rendering, IPFS pinning, and a mint flow that preserves the live sculptural state.

## Shared Principles
- **Do not break existing pages.** Prefer additive changes and keep HTML structure stable.
- **Determinism matters.** Same packed state must render the same SVG on-chain and in the preview.
- **No secrets in the client.** Pinata JWT and KV tokens stay in serverless envs only.
- **Readable UX.** Wallet and mint statuses must be human-friendly.
- **Performance and accessibility.** Keep animations subtle and honor reduced motion.

---

## Agent Overview

### Agent A — Frontend & UX (index.html + mint-preview.html)
**Mission**
Own layout, UI state, and user messaging.

**Responsibilities**
- Maintain the mint-preview flow and status UI.
- Keep pinning status, mint status, and error states clear.
- Ensure mobile layout and scroll behaviors remain stable.

**Deliverables**
- Updated HTML/CSS for the mint preview and story UI.

---

### Agent B — Visual Systems (WebGL / p5.js)
**Mission**
Maintain the sculpture visuals and background effects.

**Responsibilities**
- Preserve the paper stack renderer and its motion behavior.
- Keep visual parity with the on-chain SVG output where possible.
- Maintain performance (avoid heavy per-frame work).

**Deliverables**
- Updated rendering logic and palette handling.

---

### Agent C — Contracts & Renderer (Solidity)
**Mission**
Ensure minting correctness and SVG rendering parity.

**Responsibilities**
- Maintain `SculptureRenderer.sol` and `SculptureMint.sol`.
- Keep tokenURI compatible with marketplaces (metadataUri + gateway resolution).
- Add tests for edge cases and parity guarantees.

**Deliverables**
- Contracts, tests, and parity fixtures updated.

---

### Agent D — Pinning & Metadata (API + Pinata)
**Mission**
Keep pinning reliable and auditable.

**Responsibilities**
- Maintain `api/pin.js` and `api/pin-log.js`.
- Tag pins with metadata key-values (collection, type, tokenId, etc.).
- Log pin events to KV for auditing.

**Deliverables**
- Stable pin endpoints, readable logs, and verified CIDs.

---

### Agent E — QA & DevOps
**Mission**
Make sure the pipeline is deployable and testable.

**Responsibilities**
- Keep Foundry tests and static analysis green.
- Validate Vercel envs and IPFS gateway behavior.
- Verify end-to-end mint flow on Base Sepolia.

**Deliverables**
- CI updates, release notes, and verification steps.

---

## Working Agreement
1. **Small, testable diffs.** Each change should be verifiable locally or via a single endpoint.
2. **Document any schema changes.** If tokenURI or pin payloads change, update README + tests.
3. **Prefer absolute endpoints for pinning.** IPFS-hosted UI cannot call relative API routes.
4. **No silent failures.** Any mint or pin error must surface in the UI.

---

## Verification Checklist (Minimum)
- [ ] Mint preview renders the packed state without console errors.
- [ ] Pinning endpoint returns CID and gateway URL.
- [ ] Pin log endpoint returns readable JSON entries.
- [ ] Mint flow shows success/failure with a transaction link.
- [ ] Marketplace rendering shows image + attributes for a fresh mint.
