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

const flattenList = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenList(item));
  }
  return [value];
};

const normalizeEntries = (value) => {
  const flattened = flattenList(value);
  const entries = [];
  for (const item of flattened) {
    if (typeof item === "string") {
      try {
        const parsed = JSON.parse(item);
        if (Array.isArray(parsed)) {
          entries.push(...normalizeEntries(parsed));
        } else if (parsed && typeof parsed === "object") {
          entries.push(parsed);
        } else {
          entries.push({ raw: parsed });
        }
      } catch {
        entries.push({ raw: item });
      }
    } else if (item && typeof item === "object") {
      entries.push(item);
    } else if (item !== undefined) {
      entries.push({ raw: item });
    }
  }
  return entries;
};

const normalizeCids = (value) => {
  const flattened = flattenList(value);
  const cids = [];
  for (const item of flattened) {
    if (item === undefined || item === null) continue;
    if (typeof item === "string") {
      try {
        const parsed = JSON.parse(item);
        if (Array.isArray(parsed)) {
          parsed.forEach((cid) => {
            if (cid) cids.push(String(cid));
          });
        } else if (parsed) {
          cids.push(String(parsed));
        } else {
          cids.push(item);
        }
      } catch {
        cids.push(item);
      }
    } else if (Array.isArray(item)) {
      item.forEach((cid) => cids.push(String(cid)));
    } else {
      cids.push(String(item));
    }
  }
  return [...new Set(cids)];
};

const handler = async (req, res) => {
  allowOrigin(req, res);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) {
    sendJson(res, 500, { error: "KV is not configured." });
    return;
  }

  const fallbackPrefix =
    process.env.VERCEL_PROJECT_ID ||
    process.env.VERCEL_GIT_REPO_SLUG ||
    "PaperClips";
  const prefix = String(fallbackPrefix || "PaperClips").trim().replace(/\s+/g, "-");
  const key = process.env.PIN_LOG_KEY || `${prefix}:pinlog:entries`;
  const cidsKey = process.env.PIN_LOG_CIDS_KEY || `${prefix}:pinlog:cids`;
  const limitRaw = req.query?.limit || req.query?.n || "50";
  const limit = Math.max(1, Math.min(200, Number(limitRaw) || 50));
  const includeCids = String(req.query?.includeCids || "").toLowerCase() === "true";

  try {
    const response = await fetch(
      `${kvUrl}/lrange/${encodeURIComponent(key)}/0/${limit - 1}`,
      {
        headers: {
          Authorization: `Bearer ${kvToken}`,
        },
      }
    );
    const json = await response.json();
    if (!response.ok) {
      sendJson(res, 500, { error: json?.error || json?.message || "KV read failed." });
      return;
    }
    const rawEntries = Array.isArray(json?.result) ? json.result : [];
    const entries = normalizeEntries(rawEntries);
    if (includeCids) {
      const cidsResponse = await fetch(`${kvUrl}/smembers/${encodeURIComponent(cidsKey)}`, {
        headers: {
          Authorization: `Bearer ${kvToken}`,
        },
      });
      const cidsJson = await cidsResponse.json().catch(() => ({}));
      if (!cidsResponse.ok) {
        sendJson(res, 500, { error: cidsJson?.error || cidsJson?.message || "KV CID read failed." });
        return;
      }
      const cidsRaw = Array.isArray(cidsJson?.result) ? cidsJson.result : [];
      const cids = normalizeCids(cidsRaw);
      sendJson(res, 200, { entries, cids });
      return;
    }
    sendJson(res, 200, { entries });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || "KV request failed." });
  }
};

module.exports = handler;
