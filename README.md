# P3 demo: basic auth on the ISR render path (site-wide)

Minimal reproduction of one cause of the Nuxt-ISR-on-Vercel "broken route"
symptom family — the **auth-interaction** one
([P3](../../blob/main/docs/p3-auth.md)), observed as a 100%-broken homepage
in a live production project. No Nitro bug involved; version-independent.

- Full picture (all three causes, the shared mechanism, amplifiers):
  [main branch](../../tree/main) ·
  [P3 in depth](../../blob/main/docs/p3-auth.md) ·
  [fixes](../../blob/main/docs/fixes.md) ·
  [for maintainers](../../blob/main/docs/maintainers.md)
- Sibling demos: [`demo/p1-deterministic`](../../tree/demo/p1-deterministic) ·
  [`demo/p2-app-404`](../../tree/demo/p2-app-404)

## The mechanism — a two-sided defect

Server middleware throws `401` for requests without credentials, and every
page is ISR (`'/**': { isr: true }`):

1. **Availability:** ISR cache-population requests carry no `Authorization`
   header → the middleware 401s them → 401 is **not** in Vercel's set of
   cacheable ISR statuses {200, 301, 302, 307, 308, 404, 410} → the render
   counts as `FUNCTION_INVOCATION_FAILED` and **nothing is stored**. The
   route can never populate: permanently dead for the public, on every
   request (`cache: MISS` forever). Every deploy and every cache purge
   re-opens the wound site-wide.
2. **Confidentiality:** the moment one *authenticated* visitor renders the
   page, the response is stored in the **shared** ISR cache — and served to
   everyone without credentials (`200` + `cache: HIT`). ISR silently defeats
   HTTP basic auth in both directions.

In the incident logs this looked like: `GET /` → `401`,
`x-vercel-error: FUNCTION_INVOCATION_FAILED`, cache `MISS`, cache key
`/[...]-isr` + `__isr_route=/`, ~11 ms, no outgoing requests (the request
died in the auth middleware). The `-isr` path is Vercel's internal route
name for the ISR rewrite — not a redirect.

## What's in this branch

- `server/middleware/basic-auth.ts` — site-wide 401 middleware (excludes
  `/api/*`, `/robots.txt`), armed by env vars.
- `'/**': { isr: true }` — the incident's never-expiring wildcard.
- `server/middleware/cache-tags.ts` + `POST /api/invalidate` — purge by
  cache tag, simulating CMS-publish invalidation.
- `scripts/auth-demo.sh` — drives the full cycle against `/`.

## Run it

```sh
bun install
# arm the middleware on your Vercel project:
#   NUXT_BASIC_AUTH_USER=repro
#   NUXT_BASIC_AUTH_PASSWORD=repro-password-401
# deploy: connect to Vercel (zero-config) or:
NITRO_PRESET=vercel bun run build && npx vercel deploy --prebuilt --prod

./scripts/auth-demo.sh https://<deployment>.vercel.app
```

Deploy to **production** (`--prod`, or push via the Git integration), not a
preview — so the only gate is *this app's* basic auth (the thing being
demonstrated). Vercel Deployment Protection would otherwise SSO-gate a preview
before the app runs, hiding the effect.

Expected (verified live 2026-07-18):

| Step | Result |
|---|---|
| unauth `GET /` ×3 | **401, `FUNCTION_INVOCATION_FAILED`, `MISS`** — never caches, never heals |
| authed `GET /` | 200 (populates the shared cache) |
| unauth `GET /` after | **200 `HIT` — the "protected" page is now public** |
| purge + unauth `GET /` | 401, `MISS` — dead again, permanently |

## Takeaways

- **Never gate ISR routes behind per-request auth.** Use edge auth (Vercel
  Deployment Protection) that runs before the prerender layer, or exclude
  ISR routes from the middleware.
- More generally: middleware on an ISR route's render path must never return
  a non-{200, 3xx, 404, 410} status — anything else makes the route
  unpopulatable for the affected requests.

Confidence-graded options (including the important Hobby/production caveats
of edge auth) and the disclosure note for the confidentiality direction:
[fixes → P3](../../blob/main/docs/fixes.md#p3--auth-on-the-isr-path) ·
[for maintainers](../../blob/main/docs/maintainers.md#p3-confidentiality--disclosure).
