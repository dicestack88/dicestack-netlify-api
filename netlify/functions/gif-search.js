const ALLOWED_ORIGIN = "https://dicestack88.github.io";
const TENOR_API = "https://tenor.googleapis.com/v2";

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=60, s-maxage=60",
    "Vary": "Origin"
  };
  const origin = event.headers?.origin || event.headers?.Origin || "";
  if (origin && origin !== ALLOWED_ORIGIN) return { statusCode: 403, headers, body: JSON.stringify({ error: "Origin not allowed" }) };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const apiKey = process.env.TENOR_API_KEY;
  if (!apiKey) return { statusCode: 503, headers, body: JSON.stringify({ error: "GIF search is not configured yet." }) };

  const query = String(event.queryStringParameters?.q || "").trim().slice(0, 80);
  const limit = Math.min(20, Math.max(1, Number.parseInt(event.queryStringParameters?.limit || "12", 10) || 12));
  const endpoint = query
    ? TENOR_API + "/search?q=" + encodeURIComponent(query) + "&key=" + encodeURIComponent(apiKey) + "&client_key=dicestack_dimension&limit=" + limit + "&media_filter=tinygif,gif&contentfilter=medium"
    : TENOR_API + "/featured?key=" + encodeURIComponent(apiKey) + "&client_key=dicestack_dimension&limit=" + limit + "&media_filter=tinygif,gif&contentfilter=medium";

  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error("GIF provider returned HTTP " + response.status);
    const data = await response.json();
    const results = (data.results || []).flatMap(item => {
      const media = item.media_formats || {};
      const format = media.tinygif || media.gif;
      if (!item.id || !format?.dims || !Array.isArray(format.dims)) return [];
      const [width, height] = format.dims.map(Number);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 640 || height > 640) return [];
      return [{
        id: String(item.id),
        title: String(item.content_description || item.title || "GIF").slice(0, 100),
        width,
        height,
        preview: format.url ? "/.netlify/functions/gif-media?id=" + encodeURIComponent(item.id) : null
      }];
    }).filter(item => item.preview);
    return { statusCode: 200, headers, body: JSON.stringify({ results, next: data.next || null }) };
  } catch (error) {
    console.error("GIF search failed:", error.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: "GIF search is temporarily unavailable." }) };
  }
};
