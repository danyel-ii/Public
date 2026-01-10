import { decodePacked, renderSvgFromPacked } from "./sculpture-svg.js";

const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const packedEl = document.getElementById("packed-state");
const copyButton = document.getElementById("copy-state");
const downloadLink = document.getElementById("download-svg");
const connectButton = document.getElementById("connect-wallet");
const mintButton = document.getElementById("mint-now");
const mintStatusEl = document.getElementById("mint-status");
const chainEl = document.getElementById("mint-chain");
const contractEl = document.getElementById("mint-address");
const priceEl = document.getElementById("mint-price");
const mintingStatusEl = document.getElementById("minting-status");
const metadataStatusEl = document.getElementById("metadata-status");
const walletStatusEl = document.getElementById("wallet-status");

const config = window.MINT_CONFIG || {};
const MINT_ABI = [
  "function mint(bytes packed) payable returns (uint256)",
  "function mintPriceWei() view returns (uint256)",
  "function mintPaused() view returns (bool)",
  "function metadataFrozen() view returns (bool)",
  "function useIpfsMetadata() view returns (bool)",
  "function ipfsBaseUri() view returns (string)",
];

const setStatus = (message) => {
  if (statusEl) {
    statusEl.textContent = message;
  }
};

const setMintStatus = (message) => {
  if (mintStatusEl) {
    mintStatusEl.textContent = message;
  }
};

const setWalletStatus = (message) => {
  if (walletStatusEl) {
    walletStatusEl.textContent = message;
  }
};

const getPacked = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("state") || localStorage.getItem("sculpturePackedState");
};

const formatAddress = (value) => {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const isConfigured = () =>
  config.contractAddress &&
  config.contractAddress !== "0x0000000000000000000000000000000000000000";

const showConfig = () => {
  if (chainEl) {
    chainEl.textContent = config.chainName || `Chain ${config.chainId || "—"}`;
  }
  if (contractEl) {
    contractEl.textContent = isConfigured() ? formatAddress(config.contractAddress) : "Not configured";
  }
};

const formatStatusError = (err, fallback) => {
  if (!err) return fallback;
  if (err.code === 4001 || err.code === "ACTION_REJECTED") {
    return "Wallet request was rejected.";
  }
  const message = err.shortMessage || err.message || fallback;
  if (message.includes("MintPaused")) {
    return "Minting is currently paused.";
  }
  if (message.includes("MintPriceNotMet")) {
    return "Mint price not met. Check the required amount.";
  }
  if (message.includes("InvalidPackedLength")) {
    return "Packed state is invalid. Refresh the preview.";
  }
  if (message.includes("MetadataFrozen")) {
    return "Metadata has been permanently frozen.";
  }
  return message;
};

const loadPreview = (packed) => {
  try {
    const state = decodePacked(packed);
    const svg = renderSvgFromPacked(packed);
    previewEl.innerHTML = svg;
    packedEl.value = packed;
    setStatus(`Preview loaded: Scene ${state.sceneIndex + 1}, Seed ${state.baseSeed}.`);

    if (downloadLink) {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = "paper-sculpture.svg";
    }
  } catch (err) {
    setStatus("Failed to decode packed state. Try reloading the preview.");
    if (packedEl) {
      packedEl.value = packed;
    }
  }
};

const packed = getPacked();
showConfig();

if (!packed) {
  setStatus("No packed state found. Generate one from index.html.");
  if (packedEl) {
    packedEl.value = "Missing packed state.";
  }
  if (mintButton) {
    mintButton.disabled = true;
  }
} else {
  loadPreview(packed);
}

if (copyButton) {
  copyButton.addEventListener("click", async () => {
    if (!packed) return;
    try {
      await navigator.clipboard.writeText(packed);
      setStatus("Packed state copied to clipboard.");
    } catch (err) {
      setStatus("Copy failed. Check clipboard permissions.");
    }
  });
}

let walletProvider = null;
let signer = null;
let contract = null;
let mintPriceWei = null;
let mintPaused = null;
let metadataFrozen = null;
let useIpfsMetadata = null;
let ipfsBaseUri = null;

const ensureChain = async (provider) => {
  if (!config.chainId) return;
  const target = `0x${Number(config.chainId).toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: target }],
    });
  } catch (err) {
    if (err && err.code === 4902 && config.rpcUrl && config.chainName) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: target,
            chainName: config.chainName,
            rpcUrls: [config.rpcUrl],
            blockExplorerUrls: config.blockExplorerUrl ? [config.blockExplorerUrl] : [],
            nativeCurrency: config.nativeCurrency || { name: "Ether", symbol: "ETH", decimals: 18 },
          },
        ],
      });
    } else {
      throw err;
    }
  }
};

const getWalletProvider = async () => {
  if (window.ethereum) return window.ethereum;
  if (config.walletConnectProjectId && window.EthereumProvider) {
    const wcProvider = await window.EthereumProvider.init({
      projectId: config.walletConnectProjectId,
      chains: [config.chainId || 8453],
      showQrModal: true,
    });
    await wcProvider.enable();
    return wcProvider;
  }
  return null;
};

const connectWallet = async () => {
  if (!window.ethers) {
    setMintStatus("Wallet SDK not loaded. Refresh the page.");
    return;
  }
  if (!isConfigured()) {
    setMintStatus("Mint contract not configured yet.");
    return;
  }
  try {
    walletProvider = await getWalletProvider();
    if (!walletProvider) {
      setMintStatus("No wallet found. Install MetaMask or enable WalletConnect.");
      return;
    }
    await walletProvider.request({ method: "eth_requestAccounts" });
    await ensureChain(walletProvider);
    const browserProvider = new window.ethers.BrowserProvider(walletProvider);
    signer = await browserProvider.getSigner();
    contract = new window.ethers.Contract(config.contractAddress, MINT_ABI, signer);
    [
      mintPriceWei,
      mintPaused,
      metadataFrozen,
      useIpfsMetadata,
      ipfsBaseUri,
    ] = await Promise.all([
      contract.mintPriceWei(),
      contract.mintPaused(),
      contract.metadataFrozen(),
      contract.useIpfsMetadata(),
      contract.ipfsBaseUri(),
    ]);
    if (priceEl) {
      priceEl.textContent = `${window.ethers.formatEther(mintPriceWei)} ETH`;
    }
    if (mintingStatusEl) {
      mintingStatusEl.textContent = mintPaused ? "Paused" : "Open";
    }
    if (metadataStatusEl) {
      if (useIpfsMetadata && ipfsBaseUri) {
        metadataStatusEl.textContent = metadataFrozen ? "IPFS (frozen)" : "IPFS (mutable)";
      } else {
        metadataStatusEl.textContent = metadataFrozen ? "On-chain (frozen)" : "On-chain (mutable)";
      }
    }
    if (mintButton) {
      mintButton.disabled = false;
    }
    const address = await signer.getAddress();
    setWalletStatus(`Connected: ${formatAddress(address)}`);
    setMintStatus("Wallet connected. Ready to mint.");
  } catch (err) {
    setMintStatus(formatStatusError(err, "Wallet connection failed."));
  }
};

const mintNow = async () => {
  if (!contract || !signer || !mintPriceWei || !packed) {
    setMintStatus("Connect a wallet to continue.");
    return;
  }
  try {
    if (mintPaused) {
      setMintStatus("Minting is paused.");
      return;
    }
    setMintStatus("Submitting mint transaction...");
    const tx = await contract.mint(packed, { value: mintPriceWei });
    if (config.blockExplorerUrl) {
      const base = config.blockExplorerUrl.replace(/\/$/, "");
      setMintStatus(`Transaction submitted. View on explorer: ${base}/tx/${tx.hash}`);
    } else {
      setMintStatus(`Transaction submitted: ${formatAddress(tx.hash)}`);
    }
    const receipt = await tx.wait();
    const transfer = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch (err) {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "Transfer");
    if (transfer) {
      setMintStatus(`Minted token #${transfer.args.tokenId.toString()}.`);
    } else {
      setMintStatus("Mint confirmed. Check your wallet for the token.");
    }
  } catch (err) {
    setMintStatus(formatStatusError(err, "Mint failed. Please try again."));
  }
};

if (connectButton) {
  connectButton.addEventListener("click", connectWallet);
}
if (mintButton) {
  mintButton.addEventListener("click", mintNow);
}
