const ALLOWED_ORIGIN = "https://dicestack88.github.io";
exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300",
    "Vary": "Origin"
  };
  const origin = event.headers?.origin || event.headers?.Origin || "";
  if (origin && origin !== ALLOWED_ORIGIN) return { statusCode: 403, headers, body: JSON.stringify({ error: "Origin not allowed" }) };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return { statusCode: 503, headers, body: JSON.stringify({ enabled: false, error: "Push notifications are not configured yet." }) };
  return { statusCode: 200, headers, body: JSON.stringify({ enabled: true, publicKey }) };
};
