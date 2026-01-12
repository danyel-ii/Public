const DEFAULT_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

const allowOrigin = (req, res) => {
  const raw = process.env.PIN_API_ORIGINS || "*";
  if (raw === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return;
  }
  const origins = raw.split(",").map((value) => value.trim()).filter(Boolean);
  const requestOrigin = req.headers.origin;
  if (requestOrigin && origins.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  }
};

const normalizeGateway = (raw) => {
  if (!raw) return DEFAULT_GATEWAY;
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

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

const handler = async (req, res) => {
  allowOrigin(req, res);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    sendJson(res, 500, { error: "PINATA_JWT is not configured." });
    return;
  }

  let dataUrl = "";
  let fileName = "";
  let svg = "";
  let metadata = null;
  let kind = "png";
  let wrapWithDirectory = false;
  let tokenId = "";
  let packedHash = "";
  let network = "";
  let contract = "";
  try {
    const body = req.body || {};
    dataUrl = body.dataUrl || "";
    fileName = body.fileName || "";
    svg = body.svg || "";
    metadata = body.metadata ?? null;
    kind = String(body.kind || "png").toLowerCase();
    wrapWithDirectory = Boolean(body.wrapWithDirectory);
    tokenId = body.tokenId ?? "";
    packedHash = body.packedHash ?? "";
    network = body.network ?? "";
    contract = body.contract ?? "";
  } catch (err) {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const sanitizeName = (value) => value.replace(/[^a-zA-Z0-9._-]/g, "");
  let buffer;
  let contentType = "application/octet-stream";
  let typeLabel = kind;
  let name = sanitizeName(fileName);

  if (kind === "png") {
    if (!dataUrl.startsWith("data:image/png;base64,")) {
      sendJson(res, 400, { error: "dataUrl must be a PNG data URL." });
      return;
    }
    const base64 = dataUrl.split(",", 2)[1];
    buffer = Buffer.from(base64, "base64");
    contentType = "image/png";
    typeLabel = "png";
    name = name || `sculpture-${Date.now()}.png`;
  } else if (kind === "svg") {
    if (!svg || typeof svg !== "string") {
      sendJson(res, 400, { error: "svg must be a non-empty string." });
      return;
    }
    buffer = Buffer.from(svg, "utf8");
    contentType = "image/svg+xml";
    typeLabel = "svg";
    name = name || `sculpture-${Date.now()}.svg`;
  } else if (kind === "json") {
    if (!metadata) {
      sendJson(res, 400, { error: "metadata is required for json pinning." });
      return;
    }
    const json = typeof metadata === "string" ? metadata : JSON.stringify(metadata);
    buffer = Buffer.from(json, "utf8");
    contentType = "application/json";
    typeLabel = "json";
    name = name || `metadata-${Date.now()}`;
  } else {
    sendJson(res, 400, { error: "Unsupported pin kind. Use png, svg, or json." });
    return;
  }

  const keyvalues = {
    collection: "paperclips",
    type: typeLabel,
  };
  if (tokenId !== "" && tokenId !== null && tokenId !== undefined) {
    keyvalues.tokenId = String(tokenId);
  }
  if (packedHash) {
    keyvalues.packedHash = String(packedHash).slice(0, 66);
  }
  if (network) {
    keyvalues.network = String(network).slice(0, 64);
  }
  if (contract) {
    keyvalues.contract = String(contract).slice(0, 64);
  }

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), name);
  form.append(
    "pinataMetadata",
    JSON.stringify({
      name,
      keyvalues,
    })
  );
  if (wrapWithDirectory) {
    form.append("pinataOptions", JSON.stringify({ wrapWithDirectory: true }));
  }

  const logPin = async (entry) => {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    if (!kvUrl || !kvToken) {
      return { ok: false, error: "KV is not configured." };
    }
    const fallbackPrefix =
      process.env.VERCEL_PROJECT_ID ||
      process.env.VERCEL_GIT_REPO_SLUG ||
      "PaperClips";
    const prefix = String(fallbackPrefix || "PaperClips").trim().replace(/\s+/g, "-");
    const key = process.env.PIN_LOG_KEY || `${prefix}:pinlog:entries`;
    const cidsKey = process.env.PIN_LOG_CIDS_KEY || `${prefix}:pinlog:cids`;
    const response = await fetch(`${kvUrl}/lpush/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kvToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([JSON.stringify(entry)]),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      return { ok: false, error: json?.error || json?.message || "KV log failed." };
    }
    const cidsResponse = await fetch(`${kvUrl}/sadd/${encodeURIComponent(cidsKey)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kvToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([entry.cid]),
    });
    if (!cidsResponse.ok) {
      const json = await cidsResponse.json().catch(() => ({}));
      return { ok: false, error: json?.error || json?.message || "KV CID log failed." };
    }
    return { ok: true };
  };

  try {
    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: form,
    });
    const json = await response.json();
    if (!response.ok) {
      sendJson(res, 500, { error: json?.error || json?.message || "Pinata upload failed." });
      return;
    }

    const cid = json.IpfsHash;
    const gateway = normalizeGateway(
      process.env.PINATA_GATEWAY_URL || process.env.PINATA_GATEWAY || ""
    );
    const path = wrapWithDirectory ? `${cid}/${name}` : cid;
    const logEntry = {
      cid,
      ipfsUri: `ipfs://${path}`,
      gatewayUrl: `${gateway}${path}`,
      fileName: name,
      kind: typeLabel,
      tokenId: keyvalues.tokenId || "",
      packedHash: keyvalues.packedHash || "",
      network: keyvalues.network || "",
      contract: keyvalues.contract || "",
      createdAt: new Date().toISOString(),
    };
    const logResult = await logPin(logEntry);
    sendJson(res, 200, {
      cid,
      ipfsUri: `ipfs://${path}`,
      gatewayUrl: `${gateway}${path}`,
      baseUri: wrapWithDirectory ? `ipfs://${cid}/` : "",
      fileName: name,
      logError: logResult.ok ? "" : logResult.error || "KV log failed.",
    });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || "Pinata request failed." });
  }
};

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "6mb",
    },
  },
};
