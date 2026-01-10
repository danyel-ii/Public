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
const toggleNetworkButton = document.getElementById("toggle-network");
const mintModalEl = document.getElementById("mint-modal");
const mintModalStatusEl = document.getElementById("mint-modal-status");
const mintConfirmButton = document.getElementById("mint-confirm");
const mintCancelButton = document.getElementById("mint-cancel");
const summaryNetworkEl = document.getElementById("summary-network");
const summaryContractEl = document.getElementById("summary-contract");
const summaryPriceEl = document.getElementById("summary-price");
const summaryHashEl = document.getElementById("summary-hash");
const summaryRasterEl = document.getElementById("summary-raster");
const summaryNoteEl = document.getElementById("summary-note");

const config = window.getMintConfig ? window.getMintConfig() : (window.MINT_CONFIG || {});
const configKey = (window.MINT_CONFIG_ACTIVE_KEY || "sepolia").toLowerCase();
const configList = window.MINT_CONFIGS || {};
const MINT_ABI = [
  "function mint(bytes packed) payable returns (uint256)",
  "function mintWithImage(bytes packed, string rasterUri) payable returns (uint256)",
  "function mintPriceWei() view returns (uint256)",
  "function mintPaused() view returns (bool)",
  "function metadataFrozen() view returns (bool)",
  "function useIpfsMetadata() view returns (bool)",
  "function ipfsBaseUri() view returns (string)",
];

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

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
  const packedHex = normalizePackedHex(packed);
  const hash = packedHex && ethers ? ethers.keccak256(packedHex) : "—";
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
  if (summaryNoteEl) {
    summaryNoteEl.textContent = "Render & pin a PNG before signing the Mint Summary.";
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

const pickToggleTarget = () => {
  const keys = Object.keys(configList);
  if (keys.length < 2) return null;
  if (configKey === "sepolia" && configList.base) return "base";
  if (configKey === "base" && configList.sepolia) return "sepolia";
  return keys.find((key) => key !== configKey) || null;
};

const updateToggleLabel = () => {
  if (!toggleNetworkButton) return;
  const target = pickToggleTarget();
  if (!target) {
    toggleNetworkButton.disabled = true;
    toggleNetworkButton.textContent = "Network locked";
    return;
  }
  const targetName = configList[target]?.chainName || target;
  toggleNetworkButton.textContent = `Switch to ${targetName}`;
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

const getPinataJwt = () => {
  const injected = window.PINATA_JWT;
  if (typeof injected === "string" && injected.trim()) {
    return injected.trim();
  }
  const stored = window.localStorage.getItem("pinataJwt");
  return stored ? stored.trim() : "";
};

const ensurePinataJwt = () => {
  const existing = getPinataJwt();
  if (existing) return existing;
  const entered = window.prompt("Enter Pinata JWT to pin the PNG (stored locally).");
  if (entered && entered.trim()) {
    window.localStorage.setItem("pinataJwt", entered.trim());
    return entered.trim();
  }
  return "";
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

const pinPngToPinata = async (pngBlob, name) => {
  const jwt = ensurePinataJwt();
  if (!jwt) {
    throw new Error("Pinata JWT is required to pin the PNG.");
  }
  const form = new FormData();
  form.append("file", pngBlob, name);
  form.append(
    "pinataMetadata",
    JSON.stringify({
      name,
      keyvalues: { collection: "sculpture", type: "png" },
    })
  );
  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: form,
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error || data?.message || "Pinata upload failed.";
    throw new Error(message);
  }
  const cid = data.IpfsHash;
  return {
    ipfsUri: `ipfs://${cid}`,
    gatewayUrl: `${PINATA_GATEWAY}${cid}`,
  };
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
let mintSummarySignature = null;
let rasterUri = "";
let rasterGatewayUrl = "";

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
  const injected = pickInjectedProvider();
  if (injected) return injected;
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
      { name: "contract", type: "address" },
      { name: "chainId", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  };
  const message = {
    packedHash: ethers.keccak256(packedHex),
    mintPriceWei: mintPriceWei ? mintPriceWei.toString() : "0",
    rasterUri: rasterUri || "",
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
    setMintStatus("Connect a wallet to continue.");
    return;
  }
  try {
    if (mintPaused) {
      setMintStatus("Minting is paused.");
      return;
    }
    setMintStatus("Submitting mint transaction...");
    const tx = rasterUri
      ? await contract.mintWithImage(packed, rasterUri, { value: mintPriceWei })
      : await contract.mint(packed, { value: mintPriceWei });
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

const ensureRasterPinned = async () => {
  if (rasterUri) {
    return { rasterUri, rasterGatewayUrl };
  }
  if (!packed) {
    throw new Error("Missing packed state.");
  }
  const packedHex = normalizePackedHex(packed);
  const hash = window.ethers ? window.ethers.keccak256(packedHex) : "";
  const svg = renderSvgFromPacked(packed);
  setModalStatus("Rendering PNG preview...");
  const pngBlob = await renderSvgToPngBlob(svg);
  setModalStatus("Uploading PNG to Pinata...");
  const fileName = `sculpture-${hash ? hash.slice(2, 10) : Date.now()}.png`;
  const pinned = await pinPngToPinata(pngBlob, fileName);
  rasterUri = pinned.ipfsUri;
  rasterGatewayUrl = pinned.gatewayUrl;
  if (summaryRasterEl) {
    summaryRasterEl.textContent = formatShort(rasterUri);
  }
  if (summaryNoteEl) {
    summaryNoteEl.textContent = `Pinned: ${formatShort(rasterGatewayUrl)}`;
  }
  return { rasterUri, rasterGatewayUrl };
};

if (connectButton) {
  connectButton.addEventListener("click", connectWallet);
}
if (mintButton) {
  mintButton.addEventListener("click", handleMintIntent);
}
if (toggleNetworkButton && window.setMintNetwork) {
  updateToggleLabel();
  toggleNetworkButton.addEventListener("click", () => {
    const target = pickToggleTarget();
    if (!target) return;
    window.setMintNetwork(target);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("network", target);
    window.location.href = nextUrl.toString();
  });
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
      await ensureRasterPinned();
      await signMintSummary();
      await submitMint();
      closeMintModal();
    } catch (err) {
      setModalStatus(formatStatusError(err, "Mint flow cancelled or failed."));
      if (summaryNoteEl) {
        summaryNoteEl.textContent = "Resolve the error above to continue.";
      }
    }
  });
}
