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
const pinningStatusEl = document.getElementById("pinning-status");
const walletStatusEl = document.getElementById("wallet-status");
const mintModalEl = document.getElementById("mint-modal");
const mintModalStatusEl = document.getElementById("mint-modal-status");
const mintConfirmButton = document.getElementById("mint-confirm");
const mintCancelButton = document.getElementById("mint-cancel");
const summaryNetworkEl = document.getElementById("summary-network");
const summaryContractEl = document.getElementById("summary-contract");
const summaryPriceEl = document.getElementById("summary-price");
const summaryHashEl = document.getElementById("summary-hash");
const summaryRasterEl = document.getElementById("summary-raster");
const summaryAnimationEl = document.getElementById("summary-animation");
const summaryMetadataEl = document.getElementById("summary-metadata");
const summaryNoteEl = document.getElementById("summary-note");
const celebrationEl = document.getElementById("mint-celebration");
const celebrationTitleEl = document.getElementById("celebration-title");
const celebrationMessageEl = document.getElementById("celebration-message");
const celebrationStatusEl = document.getElementById("celebration-status");
const celebrationHashEl = document.getElementById("celebration-hash");
const celebrationLinkEl = document.getElementById("celebration-link");
const celebrationCloseButton = document.getElementById("celebration-close");

const config = window.getMintConfig ? window.getMintConfig() : (window.MINT_CONFIG || {});
const MINT_ABI = [
  "function mint(bytes packed) payable returns (uint256)",
  "function mintWithImage(bytes packed, string rasterUri) payable returns (uint256)",
  "function mintWithMedia(bytes packed, string rasterUri, string animationUri) payable returns (uint256)",
  "function mintWithMetadata(bytes packed, string rasterUri, string animationUri, string metadataUri) payable returns (uint256)",
  "function mintPriceWei() view returns (uint256)",
  "function mintPaused() view returns (bool)",
  "function metadataFrozen() view returns (bool)",
  "function useIpfsMetadata() view returns (bool)",
  "function ipfsBaseUri() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function previewMetadata(bytes packed, string rasterUri, string animationUri) view returns (string)",
];

const pinningEndpoint = config.pinningEndpoint || "";
const TOKEN_NAME = "paper clip";

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

const setModalStatus = (message) => {
  if (mintModalStatusEl) {
    mintModalStatusEl.textContent = message;
  }
};

const WALLET_METADATA = {
  name: "PaperClips",
  description: "Paper clip sculpture mint",
  url: window.location.origin,
  icons: [],
};

const prefersWalletConnect =
  config.walletConnectProjectId &&
  window.matchMedia &&
  window.matchMedia("(pointer: coarse)").matches;

const pickInjectedProvider = () => {
  const injected = window.ethereum;
  if (!injected) return null;
  const providers = injected.providers;
  if (Array.isArray(providers) && providers.length > 0) {
    return providers.find((provider) => provider.isMetaMask) || providers[0];
  }
  return injected;
};

const getPacked = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("state") || localStorage.getItem("sculpturePackedState");
};

const formatAddress = (value) => {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const normalizePackedHex = (value) => {
  if (!value) return "";
  return value.startsWith("0x") ? value : `0x${value}`;
};

const formatShort = (value) => {
  if (!value) return "—";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
};

const getPackedHash = () => {
  if (packedHash) return packedHash;
  const packedHex = normalizePackedHex(packed);
  if (!packedHex || !window.ethers) return "";
  packedHash = window.ethers.keccak256(packedHex);
  return packedHash;
};

const getPinContext = () => ({
  tokenId: nextTokenId || "",
  packedHash: getPackedHash(),
  network: config.chainName || String(config.chainId || ""),
  contract: config.contractAddress || "",
});

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

const openMintModal = () => {
  if (!mintModalEl) return;
  const ethers = window.ethers;
  const hash = getPackedHash() || "—";
  if (summaryNetworkEl) {
    summaryNetworkEl.textContent = config.chainName || `Chain ${config.chainId || "—"}`;
  }
  if (summaryContractEl) {
    summaryContractEl.textContent = isConfigured() ? formatAddress(config.contractAddress) : "Not configured";
  }
  if (summaryPriceEl) {
    if (mintPriceWei && ethers) {
      summaryPriceEl.textContent = `${ethers.formatEther(mintPriceWei)} ${config.nativeCurrency?.symbol || "ETH"}`;
    } else {
      summaryPriceEl.textContent = "—";
    }
  }
  if (summaryHashEl) {
    summaryHashEl.textContent = hash ? formatAddress(hash) : "—";
  }
  if (summaryRasterEl) {
    summaryRasterEl.textContent = rasterUri ? formatShort(rasterUri) : "Pending";
  }
  if (summaryAnimationEl) {
    summaryAnimationEl.textContent = animationUri ? formatShort(animationUri) : "Pending";
  }
  if (summaryMetadataEl) {
    summaryMetadataEl.textContent = metadataUri ? formatShort(metadataUri) : "Pending";
  }
  if (summaryNoteEl) {
    summaryNoteEl.textContent = "Images + metadata will be pinned before you sign.";
  }
  setModalStatus("");
  mintModalEl.classList.add("is-open");
  mintModalEl.setAttribute("aria-hidden", "false");
};

const closeMintModal = () => {
  if (!mintModalEl) return;
  mintModalEl.classList.remove("is-open");
  mintModalEl.setAttribute("aria-hidden", "true");
  setModalStatus("");
};

const formatStatusError = (err, fallback) => {
  if (!err) return fallback;
  if (err.code === 4001 || err.code === "ACTION_REJECTED") {
    return "Wallet request was rejected.";
  }
  if (err.message && err.message.includes("Failed to fetch")) {
    return "Pinning endpoint unreachable. Check CORS or network.";
  }
  const message = err.shortMessage || err.message || fallback;
  if (message.includes("MintPaused")) {
    return "Minting is currently paused.";
  }
  if (message.toLowerCase().includes("coalesce")) {
    return "Transaction submitted. Confirmation pending on the explorer.";
  }
  if (message.includes("MintPriceNotMet")) {
    return "Mint price not met. Check the required amount.";
  }
  if (message.includes("EmptyAnimationUri")) {
    return "Animation SVG was missing. Re-pin and try again.";
  }
  if (message.includes("EmptyMetadataUri")) {
    return "Metadata JSON was missing. Re-pin and try again.";
  }
  if (message.includes("InvalidPackedLength")) {
    return "Packed state is invalid. Refresh the preview.";
  }
  if (message.includes("MetadataFrozen")) {
    return "Metadata has been permanently frozen.";
  }
  return message;
};

const openCelebration = ({ title, message, status, txHash, txUrl }) => {
  if (!celebrationEl) return;
  if (celebrationTitleEl) celebrationTitleEl.textContent = title || "Transaction Submitted";
  if (celebrationMessageEl) celebrationMessageEl.textContent = message || "";
  if (celebrationStatusEl) celebrationStatusEl.textContent = status || "Pending";
  if (celebrationHashEl) celebrationHashEl.textContent = txHash ? formatAddress(txHash) : "—";
  if (celebrationLinkEl) {
    if (txUrl) {
      celebrationLinkEl.href = txUrl;
      celebrationLinkEl.removeAttribute("aria-disabled");
    } else {
      celebrationLinkEl.href = "#";
      celebrationLinkEl.setAttribute("aria-disabled", "true");
    }
  }
  celebrationEl.classList.add("is-open");
  celebrationEl.setAttribute("aria-hidden", "false");
};

const updateCelebration = ({ title, message, status, txHash, txUrl }) => {
  if (!celebrationEl || !celebrationEl.classList.contains("is-open")) {
    openCelebration({ title, message, status, txHash, txUrl });
    return;
  }
  if (title && celebrationTitleEl) celebrationTitleEl.textContent = title;
  if (message && celebrationMessageEl) celebrationMessageEl.textContent = message;
  if (status && celebrationStatusEl) celebrationStatusEl.textContent = status;
  if (txHash && celebrationHashEl) celebrationHashEl.textContent = formatAddress(txHash);
  if (txUrl && celebrationLinkEl) celebrationLinkEl.href = txUrl;
};

const closeCelebration = () => {
  if (!celebrationEl) return;
  celebrationEl.classList.remove("is-open");
  celebrationEl.setAttribute("aria-hidden", "true");
};

const updatePinningStatus = () => {
  if (!pinningStatusEl) return;
  pinningStatusEl.textContent = pinningEndpoint ? "Ready" : "Not configured";
};

const renderSvgToPngBlob = (svg, size = 1200) =>
  new Promise((resolve, reject) => {
    try {
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Canvas not available."));
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (png) => {
            if (!png) {
              reject(new Error("PNG render failed."));
              return;
            }
            resolve(png);
          },
          "image/png",
          0.92
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("SVG render failed."));
      };
      img.src = url;
    } catch (err) {
      reject(err);
    }
  });

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("PNG encode failed."));
    reader.readAsDataURL(blob);
  });
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
updatePinningStatus();

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
let mintSummarySignature = null;
let rasterUri = "";
let rasterGatewayUrl = "";
let animationUri = "";
let animationGatewayUrl = "";
let metadataUri = "";
let lastMintedTokenId = null;
let nextTokenId = "";
let packedHash = "";

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

const initWalletConnect = async () => {
  if (!config.walletConnectProjectId || !window.EthereumProvider) {
    return null;
  }
  const wcProvider = await window.EthereumProvider.init({
    projectId: config.walletConnectProjectId,
    chains: [config.chainId || 8453],
    showQrModal: true,
    metadata: WALLET_METADATA,
  });
  if (typeof wcProvider.connect === "function") {
    await wcProvider.connect();
  } else if (typeof wcProvider.enable === "function") {
    await wcProvider.enable();
  }
  return wcProvider;
};

const getWalletProvider = async () => {
  if (prefersWalletConnect) {
    const wcProvider = await initWalletConnect();
    if (wcProvider) return { provider: wcProvider, type: "walletconnect" };
  }
  const injected = pickInjectedProvider();
  if (injected) return { provider: injected, type: "injected" };
  const wcProvider = await initWalletConnect();
  if (wcProvider) return { provider: wcProvider, type: "walletconnect" };
  return { provider: null, type: "none" };
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
    setMintStatus("Opening wallet connection...");
    let walletInfo = await getWalletProvider();
    if (!walletInfo.provider) {
      setMintStatus("No wallet found. Install MetaMask or enable WalletConnect.");
      return;
    }
    try {
      await walletInfo.provider.request({ method: "eth_requestAccounts" });
    } catch (err) {
      if (walletInfo.type === "injected") {
        const wcProvider = await initWalletConnect();
        if (!wcProvider) {
          throw err;
        }
        walletInfo = { provider: wcProvider, type: "walletconnect" };
        await walletInfo.provider.request({ method: "eth_requestAccounts" });
      } else {
        throw err;
      }
    }
    walletProvider = walletInfo.provider;
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
    try {
      const supply = await contract.totalSupply();
      nextTokenId = (BigInt(supply) + 1n).toString();
    } catch (err) {
      nextTokenId = "";
    }
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

const signMintSummary = async () => {
  const ethers = window.ethers;
  if (!signer || !ethers) {
    throw new Error("Signer not ready.");
  }
  const packedHex = normalizePackedHex(packed);
  const domain = {
    name: "Sculpture Mint",
    version: "1",
    chainId: Number(config.chainId),
    verifyingContract: config.contractAddress,
  };
  const types = {
    MintSummary: [
      { name: "packedHash", type: "bytes32" },
      { name: "mintPriceWei", type: "uint256" },
      { name: "rasterUri", type: "string" },
      { name: "animationUri", type: "string" },
      { name: "metadataUri", type: "string" },
      { name: "contract", type: "address" },
      { name: "chainId", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  };
  const message = {
    packedHash: ethers.keccak256(packedHex),
    mintPriceWei: mintPriceWei ? mintPriceWei.toString() : "0",
    rasterUri: rasterUri || "",
    animationUri: animationUri || "",
    metadataUri: metadataUri || "",
    contract: config.contractAddress,
    chainId: Number(config.chainId),
    timestamp: Math.floor(Date.now() / 1000),
  };
  setModalStatus("Awaiting Mint Summary signature...");
  mintSummarySignature = await signer.signTypedData(domain, types, message);
  if (summaryNoteEl) {
    summaryNoteEl.textContent = "Mint Summary signed. Submitting mint transaction...";
  }
  return mintSummarySignature;
};

const submitMint = async () => {
  if (!contract || !signer || !mintPriceWei || !packed) {
    const error = new Error("Connect a wallet to continue.");
    setMintStatus(error.message);
    throw error;
  }
  if (mintPaused) {
    const error = new Error("Minting is paused.");
    setMintStatus(error.message);
    throw error;
  }
  let txHash = "";
  let txUrl = "";
  try {
    setMintStatus("Submitting mint transaction...");
    let tx;
    if (metadataUri) {
      tx = await contract.mintWithMetadata(packed, rasterUri, animationUri, metadataUri, {
        value: mintPriceWei,
      });
    } else if (rasterUri && animationUri) {
      tx = await contract.mintWithMedia(packed, rasterUri, animationUri, { value: mintPriceWei });
    } else if (rasterUri) {
      tx = await contract.mintWithImage(packed, rasterUri, { value: mintPriceWei });
    } else {
      tx = await contract.mint(packed, { value: mintPriceWei });
    }
    txHash = tx.hash;
    if (config.blockExplorerUrl) {
      const base = config.blockExplorerUrl.replace(/\/$/, "");
      txUrl = `${base}/tx/${tx.hash}`;
      setMintStatus(`Transaction submitted. View on explorer: ${txUrl}`);
    } else {
      setMintStatus(`Transaction submitted: ${formatAddress(tx.hash)}`);
    }
    openCelebration({
      title: "Transaction Submitted",
      message: "Your mint is on the way. Confirmation can take a moment.",
      status: "Pending",
      txHash,
      txUrl,
    });
    closeMintModal();
    let receipt;
    try {
      receipt = await tx.wait();
    } catch (err) {
      updateCelebration({
        title: "Transaction Submitted",
        message: "The transaction is on-chain, but confirmation could not be fetched yet.",
        status: "Pending",
        txHash,
        txUrl,
      });
      setMintStatus("Transaction submitted. Confirmation pending.");
      return;
    }
    if (receipt && receipt.status !== 1) {
      updateCelebration({
        title: "Transaction Failed",
        message: "The transaction reverted on-chain.",
        status: "Failed",
        txHash,
        txUrl,
      });
      setMintStatus("Transaction reverted on-chain.");
      return;
    }
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
      const tokenId = transfer.args.tokenId.toString();
      lastMintedTokenId = tokenId;
      setMintStatus(`Minted token #${tokenId}.`);
      updateCelebration({
        title: "Mint Confirmed",
        message: `Your sculpture has been minted. Token #${tokenId}.`,
        status: "Confirmed",
        txHash,
        txUrl,
      });
    } else {
      setMintStatus("Mint confirmed. Check your wallet for the token.");
      updateCelebration({
        title: "Mint Confirmed",
        message: "Your sculpture has been minted.",
        status: "Confirmed",
        txHash,
        txUrl,
      });
    }
  } catch (err) {
    const message = formatStatusError(err, "Mint failed. Please try again.");
    setMintStatus(message);
    if (txHash) {
      updateCelebration({
        title: "Transaction Failed",
        message,
        status: "Failed",
        txHash,
        txUrl,
      });
    }
    throw err;
  }
};

const handleMintIntent = () => {
  if (!contract || !signer || !mintPriceWei || !packed) {
    setMintStatus("Connect a wallet to continue.");
    return;
  }
  if (mintPaused) {
    setMintStatus("Minting is paused.");
    return;
  }
  openMintModal();
};

const ensurePinnedRaster = async () => {
  if (rasterUri) {
    return rasterUri;
  }
  if (!pinningEndpoint) {
    throw new Error("Pinning endpoint is not configured.");
  }
  if (!packed) {
    throw new Error("Missing packed state.");
  }
  const packedHex = normalizePackedHex(packed);
  const hash = window.ethers ? window.ethers.keccak256(packedHex) : "";
  const svg = renderSvgFromPacked(packed);
  setModalStatus("Rendering PNG...");
  const pngBlob = await renderSvgToPngBlob(svg);
  setModalStatus("Encoding PNG...");
  const dataUrl = await blobToDataUrl(pngBlob);
  setModalStatus("Pinning PNG to IPFS...");
  const response = await fetch(pinningEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "png",
      dataUrl,
      fileName: `sculpture-${hash ? hash.slice(2, 10) : Date.now()}.png`,
      ...getPinContext(),
    }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || "Pinning failed.");
  }
  rasterUri = json.ipfsUri || "";
  rasterGatewayUrl = json.gatewayUrl || "";
  if (summaryRasterEl) {
    summaryRasterEl.textContent = formatShort(rasterUri);
  }
  if (summaryNoteEl && json.gatewayUrl) {
    summaryNoteEl.textContent = `Pinned: ${formatShort(json.gatewayUrl)}`;
  }
  return rasterUri;
};

const ensurePinnedAnimation = async () => {
  if (animationUri) {
    return animationUri;
  }
  if (!pinningEndpoint) {
    throw new Error("Pinning endpoint is not configured.");
  }
  if (!packed) {
    throw new Error("Missing packed state.");
  }
  const packedHex = normalizePackedHex(packed);
  const hash = window.ethers ? window.ethers.keccak256(packedHex) : "";
  const svg = renderSvgFromPacked(packed);
  setModalStatus("Pinning SVG to IPFS...");
  const response = await fetch(pinningEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "svg",
      svg,
      fileName: `sculpture-${hash ? hash.slice(2, 10) : Date.now()}.svg`,
      ...getPinContext(),
    }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || "SVG pinning failed.");
  }
  animationUri = json.ipfsUri || "";
  animationGatewayUrl = json.gatewayUrl || "";
  if (summaryAnimationEl) {
    summaryAnimationEl.textContent = formatShort(animationUri);
  }
  return animationUri;
};

const applyMetadataName = (metadataJson) => {
  if (!metadataJson) return metadataJson;
  if (typeof metadataJson !== "string") {
    return JSON.stringify({ ...metadataJson, name: TOKEN_NAME });
  }
  try {
    const parsed = JSON.parse(metadataJson);
    parsed.name = TOKEN_NAME;
    return JSON.stringify(parsed);
  } catch {
    return metadataJson;
  }
};

const ensurePinnedMetadata = async () => {
  if (metadataUri) {
    return metadataUri;
  }
  if (!contract || !signer) {
    throw new Error("Connect a wallet to continue.");
  }
  if (!pinningEndpoint) {
    throw new Error("Pinning endpoint is not configured.");
  }
  if (!packed) {
    throw new Error("Missing packed state.");
  }
  if (!rasterUri || !animationUri) {
    throw new Error("Pin raster + animation first.");
  }
  setModalStatus("Building metadata JSON...");
  const rawMetadata = await contract.previewMetadata(packed, rasterUri, animationUri);
  const metadataJson = applyMetadataName(rawMetadata);
  setModalStatus("Pinning metadata JSON to IPFS...");
  const packedHex = normalizePackedHex(packed);
  const hash = window.ethers ? window.ethers.keccak256(packedHex) : "";
  const response = await fetch(pinningEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "json",
      metadata: metadataJson,
      fileName: `sculpture-${hash ? hash.slice(2, 10) : Date.now()}.json`,
      ...getPinContext(),
    }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || "Metadata pinning failed.");
  }
  metadataUri = json.gatewayUrl || json.ipfsUri || "";
  if (summaryMetadataEl) {
    summaryMetadataEl.textContent = formatShort(metadataUri);
  }
  return metadataUri;
};

if (connectButton) {
  connectButton.addEventListener("click", connectWallet);
}
if (mintButton) {
  mintButton.addEventListener("click", handleMintIntent);
}
if (mintCancelButton) {
  mintCancelButton.addEventListener("click", closeMintModal);
}
if (mintModalEl) {
  mintModalEl.addEventListener("click", (event) => {
    if (event.target && event.target.hasAttribute("data-mint-close")) {
      closeMintModal();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mintModalEl.classList.contains("is-open")) {
      closeMintModal();
    }
  });
}
if (mintConfirmButton) {
  mintConfirmButton.addEventListener("click", async () => {
    try {
      await ensurePinnedRaster();
      await ensurePinnedAnimation();
      await ensurePinnedMetadata();
      await signMintSummary();
      await submitMint();
    } catch (err) {
      setModalStatus(formatStatusError(err, "Mint flow cancelled or failed."));
      if (summaryNoteEl) {
        summaryNoteEl.textContent = "Resolve the error above to continue.";
      }
    }
  });
}

if (celebrationCloseButton) {
  celebrationCloseButton.addEventListener("click", closeCelebration);
}
if (celebrationEl) {
  celebrationEl.addEventListener("click", (event) => {
    if (event.target && event.target.hasAttribute("data-celebration-close")) {
      closeCelebration();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && celebrationEl.classList.contains("is-open")) {
      closeCelebration();
    }
  });
}
