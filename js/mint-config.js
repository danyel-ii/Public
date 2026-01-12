(() => {
  const configs = {
    base: {
      contractAddress: "0xd20E49e96df454174083baC7BAe8ccb483B3489e",
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

  const activeKey = "base";
  window.MINT_CONFIGS = configs;
  window.MINT_CONFIG_ACTIVE_KEY = activeKey;
  window.MINT_CONFIG = configs[activeKey];
  window.getMintConfig = () => window.MINT_CONFIG || {};
  window.setMintNetwork = () => {};
})();
