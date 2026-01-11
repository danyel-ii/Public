(() => {
  const configs = {
    sepolia: {
      contractAddress: "0x5bd7d5f93ba55dfcfc4aa8cfa1109314f6890129",
      chainId: 11155111,
      chainName: "Sepolia",
      rpcUrl: "https://rpc.sepolia.org",
      blockExplorerUrl: "https://sepolia.etherscan.io",
      pinningEndpoint: "https://paperclips-olive.vercel.app/api/pin",
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
      },
      walletConnectProjectId: "8640f2c711088eef523c7fd42d0cd18f",
    },
    base: {
      contractAddress: "0x0000000000000000000000000000000000000000",
      chainId: 8453,
      chainName: "Base",
      rpcUrl: "https://mainnet.base.org",
      blockExplorerUrl: "https://basescan.org",
      pinningEndpoint: "https://paperclips-olive.vercel.app/api/pin",
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
      },
      walletConnectProjectId: "8640f2c711088eef523c7fd42d0cd18f",
    },
  };

  const getPreferredKey = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const paramKey = params.get("network");
      const storedKey = window.localStorage.getItem("mintNetwork");
      const key = (paramKey || storedKey || "sepolia").toLowerCase();
      return configs[key] ? key : "sepolia";
    } catch (err) {
      return "sepolia";
    }
  };

  const activeKey = getPreferredKey();
  window.MINT_CONFIGS = configs;
  window.MINT_CONFIG_ACTIVE_KEY = activeKey;
  window.MINT_CONFIG = configs[activeKey];
  window.getMintConfig = () => window.MINT_CONFIG || {};
  window.setMintNetwork = (key) => {
    if (!configs[key]) return;
    window.localStorage.setItem("mintNetwork", key);
  };
})();
