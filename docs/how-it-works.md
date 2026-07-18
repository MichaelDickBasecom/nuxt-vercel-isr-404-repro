# How ISR works on the Vercel preset (and why it can fail)

Shared background for all three causes. If you just want to fix a broken
route, jump to [diagnosing](../README.md#which-one-am-i-hitting) then
[fixes](./fixes.md).

## The rewrite mechanism

Nitro implements `isr` route rules on Vercel — and **only** on Vercel (see
[below](#only-the-vercel-preset-is-affected)) — by *rewriting the request
path* to an internal prerender function, then reconstructing the original URL
inside that function. For `'/schedule': { isr: 300 }` the build emits (Build
Output API v3):

```
.vercel/output/functions/
  __fallback.func/                       # the real server bundle
  schedule-isr.func -> ./__fallback.func            (symlink)
  schedule-isr.prerender-config.json                {"expiration": 300}
```

```jsonc
// .vercel/output/config.json (first match wins)
{ "handle": "filesystem" },
{ "src": "(?<__isr_route>/schedule)",
  "dest": "/schedule-isr?__isr_route=$__isr_route" },
{ "src": "/(.*)", "dest": "/__fallback" }
```

`schedule-isr` is the internal name. It is what surfaces as `-isr` in logs,
cache keys, and error bodies — it is **not** something the browser is ever
redirected to.

## The five platform rules that make failure possible

1. A prerender function is invoked with `req.url` set to the **rewritten dest
   path** (`/schedule-isr`), not the original URL. The captured groups from
   the matched `src` regex arrive URL-encoded in the **undocumented
   `x-now-route-matches` header**. Reconstruction is mandatory.
2. Prerender functions **don't receive the query string** unless
   `passQuery: true`. So with a default `isr: <seconds>` rule, the
   `?__isr_route=…` param Nitro appends to the dest never reaches the
   function — the header is the *only* carrier.
3. **Only statuses {200, 301, 302, 307, 308, 404, 410} are stored**
   ([ISR docs](https://vercel.com/docs/incremental-static-regeneration), "On
   failure"). Any other status (401/403/5xx) is a *failed revalidation* and is
   **never stored**; Vercel keeps serving the last good copy with a 30-second
   retry TTL.
4. The ISR cache is **per-deployment** — a redeploy is the only guaranteed
   purge.
5. A request with a valid `x-prerender-revalidate: <bypassToken>` invokes the
   function and **stores whatever it returns** — including a 404.

The URL reconstruction in nitropack 2.13.4
(`presets/vercel/runtime/vercel.mjs`, compiled) — the two P1 gaps are visible
in the comments:

```js
const isrRoute = req.headers["x-now-route-matches"];
if (isrRoute) {
  const { __isr_route: url } = parseQuery(isrRoute);
  if (url && typeof url === "string") {
    if (getRouteRulesForPath(url).isr) req.url = url;  // ⚠ drops the query (nitro#4408)
  }
  // ⚠ no fallback to the query string when the header lacks __isr_route
} else {
  // parse __isr_route out of req.url's query instead
}
```

## The load-bearing caching facts, measured

Rule 3 is the crux of two remediations (P2's "throw 5xx not 404" and P1's
proposed fail-safe), so it was measured directly on a live deployment —
`isr: true` routes that always render a fixed status:

| Render status | Stored? | Observed |
|---|---|---|
| `200` | yes | `MISS` then `HIT` |
| `404` | **yes** | `MISS` then `HIT` — the failure sticks |
| `500` | **no** | `MISS` + `x-vercel-error: FUNCTION_INVOCATION_FAILED` every hit |
| `503` | **no** | `MISS` + `FUNCTION_INVOCATION_FAILED` every hit |

And the failed-revalidation half — a route with a good `200` entry whose
revalidation later starts returning `500`: the good entry **kept serving**
(`x-vercel-cache: STALE`, age climbing past the TTL); the `500` never
replaced it.

**Consequence:** on an ISR route, the failure status your code returns is a
caching-policy decision. A **404 is the worst** status to emit on a transient
failure (stored, and it sticks); a **5xx is the safest** (never stored, and
any existing good copy keeps serving).

## Why failures stick: the amplifiers

None of these is a bug on its own; they decide the blast radius of every
cause.

- **`isr: true`** means `expiration: false`: entries never expire, so a
  poisoned entry never self-heals. Failures become *permanent*, not
  intermittent. (Contrast: `isr: 60` lets the next revalidation retry and
  overwrite a bad entry.)
- **Per-status caching semantics** (rule 3) split failures into cacheable
  (404/410 → a sticky wrong response) and non-cacheable (401/5xx → a route
  that never populates).
- **Per-deployment cache + purge-heavy invalidation**: every deploy resets
  the cache and every CMS publish purges entries — constant re-population,
  i.e. constant chances for a cause to fire. ("Breaks after deploys" and
  "breaks after every publish" are the same story.)

## Only the Vercel preset is affected

Verified against Nitro source for every preset: only **Vercel** splits
functions, rewrites paths (`-isr` + `__isr_route`), and reconstructs URLs at
runtime. **Netlify** implements `isr` purely as SWR cache headers on one
function — no rewrite, so this failure class cannot occur. **Cloudflare / AWS**
presets ignore the rule entirely. The *platform half* (undocumented header
contract, per-status caching) is shared by any framework that builds Build
Output API prerender functions — SvelteKit and Astro have had the same class
of report (see [prior art](./maintainers.md#same-symptom-in-other-frameworks)).

---

Next: [P1 — carrier loss](./p1-carrier-loss.md) ·
[P2 — app-rendered 404](./p2-app-404.md) ·
[P3 — auth on the ISR path](./p3-auth.md) ·
[Fixes](./fixes.md) · [For maintainers](./maintainers.md)
