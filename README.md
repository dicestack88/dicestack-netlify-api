# Dicestack Netlify API

This lightweight Netlify site hosts shared server-side endpoints for the Dicestack ecosystem.

## Functions

- `/.netlify/functions/counter` — existing visitor-counter proxy. Kept unchanged.
- `/.netlify/functions/ping` — existing deployment health check. Kept unchanged.
- `/.netlify/functions/server-status` — allowlisted live status proxy for Eaglercraft and Java Minecraft servers.

## Server status API

Call:

```
GET /.netlify/functions/server-status?servers=eagler:arch.mc,java:mc.hypixel.net
```

The response contains a `results` object keyed by hostname, with online state, current/max players when supplied by the upstream, version, and source.

The function only accepts the server hostnames maintained in its allowlists. It does not accept arbitrary URLs or hostnames, which prevents it from becoming an open proxy. It checks at most 30 entries per request, runs up to five upstream checks concurrently, times out each upstream request after eight seconds, and sets short shared-cache headers.

### Upstream sources

- Eaglercraft: TopEaglerServers status endpoint. Its current response format still needs a live deployment test.
- Java Minecraft: MCSrvStat API.

## Deployment

The repository's existing `netlify.toml` already points Netlify at `netlify/functions`; no second Netlify site or repository is needed. Deploy this branch through the existing Netlify-connected site, then use the deployed function URL from the Launcher.

The existing visitor counter and ping functions remain in place.


## Dimension GIF comments

The original Netlify GIF functions are a legacy Tenor integration. Tenor's API has been decommissioned, so these endpoints are not a working search provider and should not be configured with a new key.

Dimension now includes a direct-from-browser GIPHY fallback. GIPHY requires search and media requests to be made directly by the client; its content must not be proxied, cached, or stored as media by Netlify. Dimension stores only the GIPHY provider ID and retrieves its media metadata directly from GIPHY when comments load.

The Netlify GIF functions remain in the repository as legacy code for reference. A future Netlify-backed provider must explicitly permit server-side API/media proxying before it is integrated, and the 3 MB streaming limit must remain in place.

## Cross-device web push

- `/.netlify/functions/push-config` — returns the public VAPID key used by browsers when subscribing.
- `/.netlify/functions/push-deliver` — private endpoint called by a Supabase database trigger. It checks `PUSH_WEBHOOK_SECRET` before loading the notification and sending Web Push messages.

Set these Netlify environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never add this to Dimension's browser configuration)
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (for example, `mailto:admin@your-domain.example`)
- `PUSH_WEBHOOK_SECRET` (a long random secret)

Generate a VAPID key pair with `npx web-push generate-vapid-keys`. Keep the private key and webhook secret in Netlify environment variables only.

### Supabase setup

1. Enable the Supabase Vault and `pg_net` extensions.
2. Run Dimension's `supabase/migrations/020_gif_comments_and_device_push.sql` in the Supabase SQL editor.
3. Add two Vault secrets:
   - `dimension_push_webhook_url`: `https://dicestack-netlify-api.netlify.app/.netlify/functions/push-deliver`
   - `dimension_push_webhook_secret`: exactly the same value as Netlify's `PUSH_WEBHOOK_SECRET`
4. Ensure the `notifications` table is included in the `supabase_realtime` publication. Migration 020 adds it when that publication exists.

Push requires browser/OS support and user permission. iPhone and iPad users must install Dimension to the Home Screen and open the installed web app before subscribing. Unsupported devices continue to receive in-app notifications.
