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

const config = window.MINT_CONFIG || {};
const MINT_ABI = [
  "function mint(bytes packed) payable returns (uint256)",
  "function mintPriceWei() view returns (uint256)",
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

const loadPreview = (packed) => {
  try {
    const state = decodePacked(packed);
    const svg = renderSvgFromPacked(packed);
    previewEl.innerHTML = svg;
    packedEl.value = packed;
    setStatus(`Scene ${state.sceneIndex + 1} · Seed ${state.baseSeed}`);

    if (downloadLink) {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = "paper-sculpture.svg";
    }
  } catch (err) {
    setStatus("Failed to decode packed state.");
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
      setStatus("Packed state copied.");
    } catch (err) {
      setStatus("Copy failed.");
    }
  });
}

let walletProvider = null;
let signer = null;
let contract = null;
let mintPriceWei = null;

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
    setMintStatus("Wallet SDK not loaded.");
    return;
  }
  if (!isConfigured()) {
    setMintStatus("Mint contract not configured.");
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
    mintPriceWei = await contract.mintPriceWei();
    if (priceEl) {
      priceEl.textContent = `${window.ethers.formatEther(mintPriceWei)} ETH`;
    }
    if (mintButton) {
      mintButton.disabled = false;
    }
    setMintStatus(`Connected: ${formatAddress(await signer.getAddress())}`);
  } catch (err) {
    setMintStatus("Wallet connection failed.");
  }
};

const mintNow = async () => {
  if (!contract || !signer || !mintPriceWei || !packed) {
    setMintStatus("Connect a wallet first.");
    return;
  }
  try {
    setMintStatus("Submitting mint...");
    const tx = await contract.mint(packed, { value: mintPriceWei });
    setMintStatus(`Minting: ${tx.hash}`);
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
      setMintStatus(`Minted token #${transfer.args.tokenId.toString()}`);
    } else {
      setMintStatus("Mint confirmed.");
    }
  } catch (err) {
    setMintStatus("Mint failed.");
  }
};

if (connectButton) {
  connectButton.addEventListener("click", connectWallet);
}
if (mintButton) {
  mintButton.addEventListener("click", mintNow);
}
