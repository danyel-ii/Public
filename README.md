# PaperClips

PaperClips is an interactive paper-sculpture site with on-chain SVG rendering, IPFS pinning, and a mint flow that captures the live sculptural state. The UI renders the same packed state that the Solidity renderer uses, so what you see in the preview should match what is minted.

## Structure
- `index.html`: main site UI + sculpture interaction
- `mint-preview.html`: mint preview + pinning + wallet flow
- `js/`: front-end logic (renderer, mint preview, config)
- `api/`: Vercel serverless endpoints (`pin`, `pin-log`)
- `contracts/`: Solidity renderer + mint contract, Foundry tests

## Local Development
Serve from a local HTTP server (ES modules do not load reliably from `file://`).

```sh
python -m http.server
```

Open:
- `http://localhost:8000/index.html`
- `http://localhost:8000/mint-preview.html?state=<packed>`

## Environment Variables

### Pinning + API (Vercel)
- `PINATA_JWT`: Pinata JWT used by `api/pin.js`.
- `PINATA_GATEWAY_URL`: Optional gateway base for `resolveGateway` and pin responses.
- `PIN_API_ORIGINS`: Optional comma-separated CORS allowlist.

### KV / Pin Log (Vercel)
- `KV_REST_API_URL`: REST endpoint for Vercel KV.
- `KV_REST_API_TOKEN`: Write token for KV.
- `KV_REST_API_READ_ONLY_TOKEN`: Read token for KV (optional).
- `KV_URL`, `REDIS_URL`: Provided by Vercel KV (required by some tooling).
- `PIN_LOG_KEY` / `PIN_LOG_CIDS_KEY`: Optional overrides. If unset, keys use prefix fallback:
  `VERCEL_PROJECT_ID` → `VERCEL_GIT_REPO_SLUG` → `PaperClips`.

### Contracts / Deployment
- `BASE_RPC_URL`, `BASE_RPC_SEPOLIA_URL`, `SEPOLIA_RPC_URL`, `FORK_RPC_URL`
- `BASE_DEPLOYER_PRIVATE_KEY`
- `EARNS_KEY`
- `ETHERSCAN_API_KEY`

## Pinning API

### POST `/api/pin`
Pins a PNG, SVG, or JSON to IPFS via Pinata.

Example payloads:
- PNG: `{ kind: "png", dataUrl, fileName }`
- SVG: `{ kind: "svg", svg, fileName }`
- JSON: `{ kind: "json", metadata, fileName }`

Additional metadata tags are included on each pin:
`collection`, `type`, `tokenId`, `packedHash`, `network`, `contract`.

### GET `/api/pin-log`
Reads the latest pin entries from KV.

Parameters:
- `limit` (default 50)
- `includeCids=true` to include the CID set

## Mint Flow (Preview)
`mint-preview.html` does the following:
1. Renders the packed state.
2. Pins a PNG and SVG.
3. Generates JSON metadata via `previewMetadata` and pins it.
4. Signs a summary and submits `mintWithMetadata`.

The contract stores the packed state on-chain and stores the pinned metadata URI. `tokenURI()` resolves the metadata URI via the configured gateway so marketplaces can render the image and attributes.

## CI / Testing

Run Foundry tests locally:

```sh
forge test
forge coverage --ir-minimum
```

CI runs Foundry tests and static analysis. Keep tests green before deployment.

## Deployment Notes
- Vercel serves the API and static assets.
- IPFS-hosted HTML requires a gateway that allows HTML (Pinata needs a custom domain). For public testing, `https://dweb.link/ipfs/<cid>/paperclips-ui/index.html` works.
- The mint preview uses an absolute pinning endpoint (Vercel) so it still works on IPFS.
