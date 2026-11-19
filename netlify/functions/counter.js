const UPSTREAM = "https://fragrant-bird-c4c0.dicestack88.workers.dev/";
const ALLOWED_ORIGIN = "https://dicestack88.github.io";

exports.handler = async function (event) {
  const origin = event.headers.origin || event.headers.Origin || "";

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };

  if (origin && origin !== ALLOWED_ORIGIN) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, error: "Origin not allowed." })
    };
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...headers, Allow: "GET, POST, OPTIONS" },
      body: JSON.stringify({ success: false, error: "Method not allowed." })
    };
  }

  try {
    // The browser talks only to Netlify. Netlify calls the existing
    // Cloudflare/D1 counter server-to-server, so school filtering of
    // workers.dev does not affect visitors.
    const upstream = await fetch(UPSTREAM, {
      method: event.httpMethod,
      headers: {
        "Origin": ALLOWED_ORIGIN,
        "Cache-Control": "no-store"
      }
    });

    const body = await upstream.text();

    return {
      statusCode: upstream.status,
      headers,
      body: body || JSON.stringify({ success: upstream.ok })
    };
  } catch (error) {
    console.error("Counter upstream request failed:", error);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ success: false, error: "Counter service is temporarily unavailable." })
    };
  }
};
