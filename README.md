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
