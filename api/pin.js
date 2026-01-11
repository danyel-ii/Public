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
  try {
    const body = req.body || {};
    dataUrl = body.dataUrl || "";
    fileName = body.fileName || "";
  } catch (err) {
    sendJson(res, 400, { error: "Invalid JSON body." });
    return;
  }

  if (!dataUrl.startsWith("data:image/png;base64,")) {
    sendJson(res, 400, { error: "dataUrl must be a PNG data URL." });
    return;
  }

  const base64 = dataUrl.split(",", 2)[1];
  const buffer = Buffer.from(base64, "base64");
  const name = fileName || `sculpture-${Date.now()}.png`;

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "image/png" }), name);
  form.append(
    "pinataMetadata",
    JSON.stringify({
      name,
      keyvalues: { collection: "paperclips", type: "png" },
    })
  );

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
    const gateway = process.env.PINATA_GATEWAY || DEFAULT_GATEWAY;
    sendJson(res, 200, {
      cid,
      ipfsUri: `ipfs://${cid}`,
      gatewayUrl: `${gateway}${cid}`,
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
