const ALLOWED_ORIGIN = "https://dicestack88.github.io";
const TENOR_API = "https://tenor.googleapis.com/v2";
const MAX_BYTES = 3 * 1024 * 1024;

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff"
  };
  const origin = event.headers?.origin || event.headers?.Origin || "";
  if (origin && origin !== ALLOWED_ORIGIN) return { statusCode: 403, headers, body: "Origin not allowed" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: "Method not allowed" };

  const id = String(event.queryStringParameters?.id || "");
  if (!/^[0-9]{5,30}$/.test(id)) return { statusCode: 400, headers, body: "Invalid GIF id" };
  const apiKey = process.env.TENOR_API_KEY;
  if (!apiKey) return { statusCode: 503, headers, body: "GIF proxy is not configured" };

  try {
    const lookup = await fetch(TENOR_API + "/posts?ids=" + encodeURIComponent(id) + "&key=" + encodeURIComponent(apiKey) + "&client_key=dicestack_dimension&media_filter=tinygif,gif", {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(7000)
    });
    if (!lookup.ok) throw new Error("GIF lookup failed");
    const data = await lookup.json();
    const item = data.results?.[0];
    const media = item?.media_formats?.tinygif || item?.media_formats?.gif;
    const mediaUrl = media?.url;
    if (!mediaUrl) return { statusCode: 404, headers, body: "GIF not found" };

    const parsed = new URL(mediaUrl);
    if (parsed.protocol !== "https:" || !["media.tenor.com", "c.tenor.com"].includes(parsed.hostname)) {
      return { statusCode: 502, headers, body: "GIF provider returned an unsupported media host" };
    }
    const upstream = await fetch(parsed.toString(), { signal: AbortSignal.timeout(9000) });
    const type = (upstream.headers.get("content-type") || "").split(";")[0].toLowerCase();
    const length = Number(upstream.headers.get("content-length") || 0);
    if (!upstream.ok || type !== "image/gif" || (length && length > MAX_BYTES)) {
      return { statusCode: 413, headers, body: "GIF exceeds the supported size limit" };
    }
    const reader = upstream.body?.getReader();
    if (!reader) return { statusCode: 502, headers, body: "GIF media stream unavailable" };
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return { statusCode: 413, headers, body: "GIF exceeds the 3 MB limit" };
      }
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks, total);
    if (!bytes.length) return { statusCode: 404, headers, body: "GIF media is empty" };
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "image/gif", "Content-Length": String(bytes.length) },
      body: bytes.toString("base64"),
      isBase64Encoded: true
    };
  } catch (error) {
    console.error("GIF media proxy failed:", error.message);
    return { statusCode: 502, headers, body: "GIF is temporarily unavailable" };
  }
};
