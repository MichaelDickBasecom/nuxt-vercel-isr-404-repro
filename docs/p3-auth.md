# P3 — auth middleware on the ISR render path

**Whose bug:** application/architecture (+ a Nitro docs gap). **Symptom:** an
ISR route "broken 100% of the time" — `401` (or 5xx) +
`x-vercel-error: FUNCTION_INVOCATION_FAILED` + `cache: MISS`, never a cache
hit. **Deterministic and version-independent.** This was the actual cause of
the real-world incident that started this investigation.

Prerequisite reading: [how ISR works on Vercel](./how-it-works.md).

## The incident

Observed in a live production project (Nuxt 4.4.8 / nitropack 2.13.4, Bun
runtime, `'/**': { isr: true }`, CMS-webhook cache purges) whose index route
was permanently broken. The Vercel logs showed:

- `GET /` → **401**, `x-vercel-error: FUNCTION_INVOCATION_FAILED`, cache
  **MISS**, cache key `/[...]-isr` + `__isr_route=/`, ~11 ms execution, no
  outgoing requests — the request died in auth middleware before any CMS call.
- The `-isr` path humans saw was Vercel's **internal route name in the
  dashboard** (one log's referer was `https://vercel.com/` — someone clicked
  it there), plus its echo in error bodies. No redirect ever happened.

## The chain

ISR cache-population requests carry no `Authorization` header → the basic-auth
middleware throws 401 → 401 is not a cacheable ISR status
([rule 3](./how-it-works.md#the-load-bearing-caching-facts-measured)) →
`FUNCTION_INVOCATION_FAILED`, nothing stored → with publish-purges and
per-deploy cache resets, the route is perpetually in "needs population", and
population perpetually fails.

## Reproduce it

The branch [`demo/p3-sitewide`](../../tree/demo/p3-sitewide) mirrors the
incident (site-wide basic auth + `'/**': { isr: true }`). On the main branch
the same is scoped to `/secret` so the rest of the test bed stays reachable.

```sh
# requires NUXT_BASIC_AUTH_USER / NUXT_BASIC_AUTH_PASSWORD on the deployment
./scripts/auth-demo.sh https://<deployment>.vercel.app
```

| Step | Result (verified live 2026-07-18) |
|---|---|
| unauth `GET` ×3 | **401, `FUNCTION_INVOCATION_FAILED`, MISS** — never caches, never heals |
| authed `GET` | 200 (populates the shared cache) |
| unauth `GET` after | **200 HIT — the "protected" page is now public** |
| purge + unauth `GET` | 401, MISS — dead again |

## Two-sided defect

- **Availability:** the public can never populate the route → permanent
  outage; every deploy/purge re-opens it site-wide.
- **Confidentiality:** one authenticated render populates the **shared** cache
  and is then served to everyone without credentials. ISR silently defeats
  HTTP basic auth in *both* directions.

The confidentiality direction is **documented shared-cache behavior misused by
the app**, not a platform vulnerability — Vercel's CDN cache excludes
`Authorization` requests, but the ISR cache has no such documented exclusion.
See the [disclosure note and precedent](./maintainers.md#p3-confidentiality--disclosure).

## Fix

Don't gate ISR routes with per-request auth at all — the two are
architecturally incompatible on a shared cache. Move access control to the
edge (Vercel Deployment Protection), or exclude ISR routes from the
middleware. Full options, confidence levels, and the important
Hobby/production caveats:
[fixes → P3](./fixes.md#p3--auth-on-the-isr-path).

---

[← How it works](./how-it-works.md) · [P1](./p1-carrier-loss.md) ·
[P2](./p2-app-404.md) · [Fixes](./fixes.md) · [For maintainers](./maintainers.md)
