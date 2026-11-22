const ALLOWED_ORIGIN = "https://dicestack88.github.io";

const EAGLER_HOSTS = new Set([
  "arch.mc", "mc.voidsent.net", "esl.bagelsmp.com", "tuff.ws",
  "pcsmp.net", "eagler.carrot-craft.org", "zentic.cc",
  "play.heartsmp.net", "mercurymc.net", "eaglercraft.co.uk",
  "mc.zyth.me", "eagler.totalfreedom.tf", "krypticmc.net",
  "aeon-network.net", "play.mytheriamc.net", "ggsmp.net",
  "wanderwoodsmp.com", "play.shadownetwork.shop", "ethereal.mov",
  "ragepvp.us"
]);

const JAVA_HOSTS = new Set([
  "mc.hypixel.net", "play.wynncraft.com", "play.cubecraft.net",
  "play.mccisland.net", "play.pvplegacy.net", "play.jartexnetwork.com",
  "donutsmp.net", "minehut.com", "minemen.club", "hub.mc-complex.com",
  "hub.manacube.net", "play.pika-network.net", "play.opblocks.com",
  "purpleprison.net", "play.earthmc.net", "mccentral.org",
  "sm.vortexnetwork.net", "go.mineberry.org", "mbs.fadecloud.com",
  "jms.enchantedmc.net", "mbs.wildnetwork.net", "play.freshsmp.fun",
  "go.minepeak.org", "play.hoplite.gg"
]);

function numberAt(object, paths) {
  for (const path of paths) {
    let value = object;
    for (const key of path) value = value && value[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function normalizeEagler(data) {
  // TopEaglerServers currently wraps the actual status inside { server: ... }.
  // Keep the older direct/data-wrapped shapes supported as fallbacks.
  const root = data && data.data && typeof data.data === "object" ? data.data : data;
  const payload = root && root.server && typeof root.server === "object"
    ? root.server
    : root;

  const players = numberAt(payload, [
    ["players", "online"], ["players", "current"], ["playerCount"],
    ["onlinePlayers"], ["playersOnline"]
  ]) ?? numberAt(root, [
    ["players", "online"], ["playerCount"], ["onlinePlayers"]
  ]) ?? numberAt(data, [["players", "online"], ["playerCount"], ["onlinePlayers"]]);

  const max = numberAt(payload, [
    ["players", "max"], ["maxPlayers"], ["max"]
  ]) ?? numberAt(root, [
    ["players", "max"], ["maxPlayers"]
  ]) ?? numberAt(data, [["players", "max"], ["maxPlayers"]]);

  const online = payload.online === true || payload.status === "online" ||
    payload.isOnline === true || root.online === true || root.status === "online" ||
    data.online === true || data.status === "online";

  return {
    online,
    players,
    max,
    version: String(payload.version || root.version || data.version || ""),
    source: "TopEaglerServers"
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function checkEaglerWithDiagnostics(host) {
  const url = `https://topeaglerservers.com/api/status/${encodeURIComponent(host)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    let data = null;
    let parseError = "";

    try {
      data = JSON.parse(body);
    } catch (error) {
      parseError = error.message || "Response was not valid JSON";
    }

    const result = data && response.ok
      ? normalizeEagler(data)
      : {
          online: false,
          players: null,
          max: null,
          version: "",
          source: "TopEaglerServers",
          error: `Upstream returned HTTP ${response.status}`
        };

    return {
      result,
      diagnostic: {
        upstreamStatus: response.status,
        upstreamOk: response.ok,
        contentType,
        parseError: parseError || null,
        bodyPreview: body.slice(0, 2000)
      }
    };
  } catch (error) {
    return {
      result: {
        online: false,
        players: null,
        max: null,
        version: "",
        source: "TopEaglerServers",
        error: error.name === "AbortError" ? "Upstream timed out" : "Upstream status unavailable"
      },
      diagnostic: {
        requestError: error.name === "AbortError" ? "Upstream timed out" : (error.message || "Fetch failed")
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkServer(edition, host) {
  const url = edition === "eagler"
    ? `https://topeaglerservers.com/api/status/${encodeURIComponent(host)}`
    : `https://api.mcsrvstat.us/3/${encodeURIComponent(host)}`;

  try {
    const data = await fetchJson(url);
    if (edition === "eagler") return normalizeEagler(data);
    return {
      online: data.online === true,
      players: numberAt(data, [["players", "online"]]),
      max: numberAt(data, [["players", "max"]]),
      version: String(data.version || ""),
      source: "MCSrvStat"
    };
  } catch (error) {
    return {
      online: false,
      players: null,
      max: null,
      version: "",
      source: edition === "eagler" ? "TopEaglerServers" : "MCSrvStat",
      error: error.name === "AbortError" ? "Upstream timed out" : "Upstream status unavailable"
    };
  }
}

exports.handler = async function (event) {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
    "Vary": "Origin"
  };

  if (origin && origin !== ALLOWED_ORIGIN) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: "Origin not allowed" }) };
  }
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Netlify's v1 function event exposes queryStringParameters. rawQuery is
  // not consistently present, so use the documented parsed parameter first.
  const requested = event.queryStringParameters?.servers || "";
  const entries = requested.split(",").filter(Boolean);
  if (!entries.length || entries.length > 50) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Request 1–50 known servers" }) };
  }

  const parsed = [];
  for (const entry of entries) {
    const separator = entry.indexOf(":");
    if (separator < 1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid server entry" }) };
    }
    const edition = entry.slice(0, separator);
    const host = entry.slice(separator + 1).toLowerCase();
    const allowed = edition === "eagler" ? EAGLER_HOSTS : edition === "java" ? JAVA_HOSTS : null;
    if (!allowed || !allowed.has(host)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown server in request" }) };
    }
    parsed.push({ edition, host });
  }

  const debugEagler = event.queryStringParameters?.debug === "eagler";
  const results = {};
  const diagnostics = {};
  let cursor = 0;
  async function worker() {
    while (cursor < parsed.length) {
      const item = parsed[cursor++];
      if (debugEagler && item.edition === "eagler") {
        const checked = await checkEaglerWithDiagnostics(item.host);
        results[item.host] = {
          ...checked.result,
          checkedAt: new Date().toISOString()
        };
        diagnostics[item.host] = checked.diagnostic;
      } else {
        results[item.host] = {
          ...(await checkServer(item.edition, item.host)),
          checkedAt: new Date().toISOString()
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(5, parsed.length) }, worker));
  if (debugEagler) headers["Cache-Control"] = "no-store";
  const responseBody = { results, generatedAt: new Date().toISOString() };
  if (debugEagler) responseBody.diagnostics = diagnostics;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(responseBody)
  };
};
