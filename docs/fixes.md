# Fixes & workarounds, with confidence

If a Nuxt ISR route on Vercel is serving a cached error, **identify the cause
first** ([which one am I hitting?](../README.md#which-one-am-i-hitting)) — the
remedies differ. Confidence is graded from what this repo actually verified;
**high** = mechanism reproduced end-to-end, **inferred** = reasoned from
documented platform behavior but not directly tested here.

## P1 — carrier loss

See [P1 in depth](./p1-carrier-loss.md).

| Action | Confidence | Notes |
|---|---|---|
| Upgrade so `nitropack >= 2.13.0` resolves | **very high** | root-caused, fixed upstream ([nitro#3539](https://github.com/nitrojs/nitro/pull/3539)); rebuilt on demand by pinning 2.12.9 |
| Redeploy to purge a poisoned cache | **very high** | per-deployment cache; observed live |
| `isr: { expiration: N, passQuery: true, allowQuery: [] }` | **high today / medium long-term** | switches the carrier to the query-string branch. `allowQuery: []` is written as `["__isr_route"]`, so the cache key is just the carrier — no per-query fragmentation. Caveat: it trades one undocumented contract ("header is sent") for its mirror ("header is omitted under `passQuery`"), and query-dependent pages hit open bug [nitro#4408](https://github.com/nitrojs/nitro/issues/4408) |
| Trailing-slash URLs | mechanism high / **as advice low** | bypasses ISR entirely (silently disables the feature); untested against `vercel.json` `trailingSlash` |

**Triage tip:** check the *lockfile-resolved* `nitropack` version, not the
Nuxt version. 2.12.6–2.12.9 + `passQuery`/`allowQuery` fails deterministically.

## P2 — app-rendered 404

See [P2 in depth](./p2-app-404.md).

| Action | Confidence | Notes |
|---|---|---|
| Finite `isr` expiration, never `isr: true`, on fallible pages | **very high** | the `/flaky-ttl` twin healed on camera |
| Throw 5xx (not 404) on transient failures | **very high (mechanism)** | 5xx is never cached and the stale copy survives — [measured](./how-it-works.md#the-load-bearing-caching-facts-measured) |
| The `error.value` branching pattern | **high** | makes the above actionable; the `useAsyncData` null-collapse trap is why it's usually gotten wrong — see [P2](./p2-app-404.md#the-trap-useasyncdata-collapses-error-and-empty) |

## P3 — auth on the ISR path

See [P3 in depth](./p3-auth.md).

| Action | Confidence | Notes |
|---|---|---|
| Don't gate ISR routes with per-request auth (architecturally incompatible) | **high** | shared cache ⇒ the gate either blocks population or is defeated by it |
| Exclude ISR routes from the auth middleware | **high** | correct when auth was accidental (the likely real cause); those routes then become public by definition |
| Edge auth (Vercel Deployment Protection) instead | **medium-high, partly inferred** | *verified* it gates at the proxy (a preview 302-redirects to Vercel SSO before the function runs); *inferred* (from Vercel's documented request flow, not vendor-documented) that the ISR entry is therefore never publicly served. **Hobby protects previews only — production stays public**; protecting production is a Pro add-on (~$150/mo) or Enterprise |

## Cross-cutting

- Exempt `/api/**` from wildcard ISR rules (`'/api/**': { isr: false }`) —
  **high**. A bare `'/**': { isr }` silently ISR-caches API responses.
- Trailing-slash URLs "work around" every cause — because they bypass ISR
  entirely. Fine as a stopgap, never a fix.

### The one principle behind P2 and P3

An ISR route's render path must deterministically produce a **cacheable,
correct** response, and every failure on it must be **transient** (5xx, never
stored). Therefore:

- nothing **conditional** (auth, geo, feature flags) belongs on it — it makes
  the stored response wrong for someone (P3);
- nothing that emits a **cacheable error** (404) on failure belongs on it — it
  stores the failure (P2);
- when the framework itself can't produce the correct response (P1), it should
  fail **transient** (5xx), not render a cacheable 404 — see the
  [upstream fix proposal](./maintainers.md#1-make-isr-url-restoration-fail-safe).

---

[← Back to README](../README.md) · [How it works](./how-it-works.md) ·
[For maintainers](./maintainers.md)
