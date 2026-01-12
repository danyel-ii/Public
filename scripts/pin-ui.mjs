import fs from "fs";
import path from "path";

const PINATA_ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const UI_ROOT_NAME = "paperclips-ui";

const root = process.cwd();
const jwt = process.env.PINATA_JWT;
const gatewayBaseRaw = process.env.PINATA_GATEWAY_URL || "";

if (!jwt) {
  console.error("PINATA_JWT is not set.");
  process.exit(1);
}

const includeEntries = [
  "index.html",
  "coffee.html",
  "mint-preview.html",
  "css",
  "js",
  "assets",
  "vendor",
];

const normalizeGateway = (raw) => {
  if (!raw) return "https://gateway.pinata.cloud/ipfs/";
  let value = raw.trim();
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  if (!/\/ipfs(\/|$)/i.test(value)) {
    value = value.replace(/\/+$/, "");
    value = `${value}/ipfs/`;
  } else if (!value.endsWith("/")) {
    value = `${value}/`;
  }
  return value;
};

const collectFiles = (baseDir, relBase = "") => {
  const files = [];
  const items = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const item of items) {
    const abs = path.join(baseDir, item.name);
    const rel = path.join(relBase, item.name);
    if (item.isDirectory()) {
      files.push(...collectFiles(abs, rel));
    } else if (item.isFile()) {
      files.push({ abs, rel });
    }
  }
  return files;
};

const toBlob = (buffer, mime) => new Blob([buffer], { type: mime });

const detectMime = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html";
  if (ext === ".css") return "text/css";
  if (ext === ".js") return "application/javascript";
  if (ext === ".json") return "application/json";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
};

const files = [];
for (const entry of includeEntries) {
  const abs = path.join(root, entry);
  if (!fs.existsSync(abs)) continue;
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    files.push(...collectFiles(abs, entry));
  } else if (stat.isFile()) {
    files.push({ abs, rel: entry });
  }
}

if (!files.length) {
  console.error("No UI files found to pin.");
  process.exit(1);
}

const form = new FormData();
for (const file of files) {
  const buffer = fs.readFileSync(file.abs);
  const mime = detectMime(file.abs);
  const filePath = `${UI_ROOT_NAME}/${file.rel.replace(/\\/g, "/")}`;
  form.append("file", toBlob(buffer, mime), filePath);
}

form.append(
  "pinataMetadata",
  JSON.stringify({
    name: UI_ROOT_NAME,
    keyvalues: { collection: "paperclips", type: "ui" },
  })
);
form.append("pinataOptions", JSON.stringify({ wrapWithDirectory: true }));

const response = await fetch(PINATA_ENDPOINT, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
  },
  body: form,
});

const json = await response.json();
if (!response.ok) {
  console.error(json?.error || json?.message || "Pinata upload failed.");
  process.exit(1);
}

const cid = json.IpfsHash;
const gatewayBase = normalizeGateway(gatewayBaseRaw);
console.log(`CID: ${cid}`);
console.log(`${gatewayBase}${cid}/${UI_ROOT_NAME}/index.html`);
console.log(`https://dweb.link/ipfs/${cid}/${UI_ROOT_NAME}/index.html`);
console.log(`https://w3s.link/ipfs/${cid}/${UI_ROOT_NAME}/index.html`);
