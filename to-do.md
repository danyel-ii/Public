# PaperClips — Current Checklist

## In Progress
- [ ] Verify marketplace rendering (image + attributes) for the latest Base Sepolia contract.
- [ ] Confirm IPFS gateway strategy for HTML (Pinata requires a custom gateway for HTML; `dweb.link` works for public tests).

## Next
- [ ] Re-run full Foundry + static-analysis pipeline and keep CI green.
- [ ] Dry-run Base mainnet deployment (no broadcast) once marketplace rendering is confirmed.

## Done
- [x] On-chain SVG renderer + preview parity.
- [x] Mint preview UI with wallet status + confirmation modal.
- [x] Pinning API for PNG/SVG/JSON with metadata tags.
- [x] KV-backed pin log endpoint + latest-entry UI readout.
