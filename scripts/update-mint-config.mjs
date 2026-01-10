import fs from "fs";
import path from "path";

const chainId = process.env.CHAIN_ID || "8453";
const broadcastFile =
  process.env.BROADCAST_FILE ||
  path.join("broadcast", "DeploySculptureMint.s.sol", chainId, "run-latest.json");

if (!fs.existsSync(broadcastFile)) {
  console.error(`Broadcast file not found: ${broadcastFile}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(broadcastFile, "utf8"));
const transactions = payload.transactions || [];
const deployTx = transactions.find(
  (tx) =>
    tx.contractName === "SculptureMint" ||
    (tx.transactionType === "CREATE" && tx.contractAddress)
);

if (!deployTx || !deployTx.contractAddress) {
  console.error("No deployment address found in broadcast file.");
  process.exit(1);
}

const address = deployTx.contractAddress;
if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
  console.error(`Invalid contract address: ${address}`);
  process.exit(1);
}

const configPath = path.join("js", "mint-config.js");
const configSource = fs.readFileSync(configPath, "utf8");
const updated = configSource.replace(
  /contractAddress:\s*\"0x[a-fA-F0-9]{40}\"/,
  `contractAddress: "${address}"`
);

if (updated === configSource) {
  console.error("Failed to update contractAddress in mint-config.js.");
  process.exit(1);
}

fs.writeFileSync(configPath, updated);
console.log(`Updated mint-config.js with contract address ${address}`);
