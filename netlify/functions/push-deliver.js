const webpush = require("web-push");
const ALLOWED_ORIGIN = "https://dicestack88.github.io";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || event.headers?.["x-dimension-webhook-secret"] !== secret) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@dicestack88.github.io";
  if (!supabaseUrl || !serviceKey || !publicKey || !privateKey) {
    return { statusCode: 503, body: "Push delivery is not configured" };
  }

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "Invalid JSON" }; }
  const notificationId = String(payload.notification_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(notificationId)) return { statusCode: 400, body: "Invalid notification id" };

  const rest = (path, options = {}) => fetch(supabaseUrl + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(9000)
  });

  try {
    const notificationResponse = await rest("notifications?id=eq." + encodeURIComponent(notificationId) + "&select=id,recipient_id,actor_id,type,clip_id,comment_id,conversation_id,created_at");
    if (!notificationResponse.ok) throw new Error("Could not load notification");
    const rows = await notificationResponse.json();
    const notification = rows[0];
    if (!notification) return { statusCode: 200, body: "Notification no longer exists" };

    const [profileResponse, subscriptionsResponse] = await Promise.all([
      rest("profiles?id=eq." + encodeURIComponent(notification.actor_id) + "&select=display_name,username"),
      rest("push_subscriptions?user_id=eq." + encodeURIComponent(notification.recipient_id) + "&select=endpoint,p256dh,auth")
    ]);
    if (!profileResponse.ok || !subscriptionsResponse.ok) throw new Error("Could not load push recipients");
    const profiles = await profileResponse.json();
    const subscriptions = await subscriptionsResponse.json();
    const actor = profiles[0];
    const name = actor?.display_name || "A Dimension member";
    const verbs = {
      clip_like: "liked your clip", comment: "commented on your clip",
      comment_reply: "replied to your comment", comment_like: "hearted your comment",
      clip_repost: "reposted your clip", follow: "started following you",
      message: "sent you a message", message_request: "sent you a message request"
    };
    const destination = notification.conversation_id
      ? "messages.html?c=" + encodeURIComponent(notification.conversation_id)
      : notification.clip_id
        ? "clips.html#clip-" + encodeURIComponent(notification.clip_id)
        : "notifications.html";
    const message = JSON.stringify({
      title: "Dimension",
      body: name + " " + (verbs[notification.type] || "interacted with you"),
      url: destination,
      tag: "dimension-" + notification.id
    });

    webpush.setVapidDetails(subject, publicKey, privateKey);
    const expired = [];
    await Promise.all(subscriptions.map(async row => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, message, { TTL: 60 * 60 * 24 });
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) expired.push(row.endpoint);
        else console.warn("Push delivery failed for one subscription:", error.statusCode || "network error");
      }
    }));

    if (expired.length) {
      await rest("push_subscriptions?endpoint=in.(" + expired.map(value => encodeURIComponent(value)).join(",") + ")", { method: "DELETE" });
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": ALLOWED_ORIGIN }, body: JSON.stringify({ delivered: subscriptions.length - expired.length, expired: expired.length }) };
  } catch (error) {
    console.error("Push delivery failed:", error.message);
    return { statusCode: 502, body: "Push delivery failed" };
  }
};
