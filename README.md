# P1 demo: deterministic ISR carrier-loss (nitropack 2.12.6–2.12.9)

Minimal reproduction of one cause of the Nuxt-ISR-on-Vercel "`-isr` 404"
symptom family — **Nitro's carrier-loss** ([P1](../../blob/main/docs/p1-carrier-loss.md)),
in its historical, 100%-deterministic form.

- Full picture (all three causes, the shared mechanism, amplifiers):
  [main branch](../../tree/main) ·
  [P1 in depth](../../blob/main/docs/p1-carrier-loss.md) ·
  [fixes](../../blob/main/docs/fixes.md) ·
  [for maintainers](../../blob/main/docs/maintainers.md)
- Sibling demos: [`demo/p2-app-404`](../../tree/demo/p2-app-404) ·
  [`demo/p3-sitewide`](../../tree/demo/p3-sitewide)

## What you see

Deploy this branch to Vercel and open `/` in a browser:

- the page renders Nuxt's 404: **"Page not found: /index-isr"**
- `curl -I` shows `HTTP/2 404` with `x-vercel-cache: MISS` on the first hit,
  then **`HIT`** — the 404 is cached and served to every visitor

This matches the original field reports
([nuxt#33316](https://github.com/nuxt/nuxt/issues/33316),
[nitro#3651](https://github.com/nitrojs/nitro/issues/3651)) byte for byte.

## The mechanism

On Vercel, Nitro implements `isr` route rules by rewriting the request to an
internal prerender function (`/` → `/index-isr`) and reconstructing the
original URL inside the function. The reconstruction in nitropack
2.12.6–2.12.9 is, in its entirety:

```js
const query = req.headers["x-now-route-matches"];
if (query) {
  const { url } = parseQuery(query);
  if (url) req.url = url;
}
```

The undocumented `x-now-route-matches` header is the **only** carrier of the
original URL — and with `passQuery: true` on the rule, **Vercel stops sending
that header** (and prerender functions never receive the query string's
`?url=` parameter either, before 2.13.0's `allowQuery` handling). Zero
carriers → the function renders the app's 404 for the internal path
`/index-isr` → Vercel stores it, because **404 is a valid, cacheable ISR
outcome**. Every direct visit fails; the cached 404 makes even lucky ones
fail.

Fixed in **nitropack 2.13.0** via
[nitro#3539](https://github.com/nitrojs/nitro/pull/3539) (a query-string
fallback + `__isr_route` carrier param). This branch pins `2.12.9` via
`package.json` `overrides` to preserve the bug. If your production project
shows this behavior: **check the lockfile-resolved `nitropack` version, not
the Nuxt version** — lockfiles from ~Sept 2025–Jan 2026 resolve into the
broken window.

Note: the current-version (≥ 2.13.0) runtime still has *no fallback* when
the header is present but lacks its param, and none for bare invocations —
the fragile-but-not-yet-deterministic variant of the same cause, with a
local deterministic harness, is documented in
[P1 in depth](../../blob/main/docs/p1-carrier-loss.md#how-often-does-it-fire-on-current-versions)
and the [upstream fix proposal](../../blob/main/docs/maintainers.md#1-make-isr-url-restoration-fail-safe).

## What's in this branch

- `'/': { isr: { expiration: 300, passQuery: true } }` — the one route rule.
- `package.json` `overrides`: `nitropack: 2.12.9` (the bug),
  `estree-walker: 2.0.2` (only to make clean installs deterministic across
  bun versions under the old dependency tree).
- `app/error.vue` + `DebugInfo` embed the SSR-time `req.url` and
  `x-now-route-matches` into every response — the cached 404 tells you
  exactly which request poisoned it.

## Run it

```sh
bun install
# deploy: connect to Vercel (zero-config) or:
NITRO_PRESET=vercel bun run build && npx vercel deploy --prebuilt --prod

# then, in a browser: open /   → "Page not found: /index-isr"
curl -I -H 'accept: text/html' https://<deployment>.vercel.app/
# → HTTP/2 404 … x-vercel-cache: MISS, then HIT on repeat
```

Deploy to **production** (`--prod`, or push via the Git integration), not a
preview — Vercel Deployment Protection gates preview deployments behind an SSO
login and would block direct access to `/`.

Verified live 2026-07-18: three browser-shaped visits — `404 MISS` (the
poisoning population), then `404 HIT`, `404 HIT` (the cached poison).
