# P2 demo: app-rendered 404s, cached permanently under `isr: true`

Minimal reproduction of one cause of the Nuxt-ISR-on-Vercel "broken route
with `x-vercel-cache: HIT`" symptom family — the **application-level** one
([P2](../../blob/main/docs/p2-app-404.md)). No Nitro or Vercel bug involved.

- Full picture (all three causes, the shared mechanism, amplifiers):
  [main branch](../../tree/main) ·
  [P2 in depth](../../blob/main/docs/p2-app-404.md) ·
  [fixes](../../blob/main/docs/fixes.md) ·
  [for maintainers](../../blob/main/docs/maintainers.md)
- Sibling demos: [`demo/p1-deterministic`](../../tree/demo/p1-deterministic) ·
  [`demo/p3-sitewide`](../../tree/demo/p3-sitewide)

## The mechanism

1. A page converts a **transient** failure (CMS rate limit, timeout) into a
   fatal 404 — the ubiquitous pattern:
   ```ts
   if (!story.value) throw createError({ statusCode: 404, fatal: true })
   ```
2. Vercel treats **404 as a valid, cacheable ISR outcome** (unlike 5xx).
3. Under `isr: true` (`expiration: false`) the entry **never expires** — the
   stored 404 never self-heals; only a purge or redeploy removes it.

Observed in a live production project where CMS-publish webhooks purged
entries by cache tag: each purge forced a re-population, and any
re-population that failed transiently stored a 404 **forever**.

## What's in this branch

- `app/components/FlakyCms.vue` — SSR fails ~50% of the time → fatal 404
  (simulating a flaky CMS fetch).
- `/flaky` (`isr: true`) and `/flaky-ttl` (`isr: 60`) — identical page,
  different expiration.
- `server/middleware/cache-tags.ts` + `POST /api/invalidate {"tags":[…]}` —
  Vercel cache tags via `@vercel/functions`, simulating CMS-publish purges.
- `scripts/poison-demo.sh` — drives the whole cycle.

## Run it

```sh
bun install
# deploy: connect to Vercel (zero-config) or:
NITRO_PRESET=vercel bun run build && npx vercel deploy --prebuilt --prod

./scripts/poison-demo.sh https://<deployment>.vercel.app
```

Expected (verified live 2026-07-18):

| Phase | Result |
|---|---|
| purge → re-populate cycles | within a few cycles a failed render is stored |
| `/flaky` afterwards | **`404` + `x-vercel-cache: HIT` on every request, permanently** |
| `/flaky-ttl` afterwards | 404 for ≤ a TTL cycle or two, then **heals itself** on a revalidation retry |

Both pages embed their SSR-time render state into the HTML, so the poisoned
cache entry is self-describing.

Deploy to **production** (`--prod`, or push via the Git integration), not a
preview — Vercel Deployment Protection gates preview deployments behind an SSO
login and would block the probe script.

## Takeaways

- Never combine `isr: true` with fallible rendering — use a finite
  expiration so revalidation can retry.
- **Throw 5xx, not 404, for transient upstream failures.** Vercel refuses to
  cache 5xx and keeps serving the last good copy — counter-intuitively, the
  "harsher" status is the safe one. On an ISR route, the status your code
  returns under failure is a caching-policy decision.
- The trap that makes this easy to write (`useAsyncData` collapsing "error"
  and "empty") and the concrete `error.value` branching pattern are in
  [P2 in depth](../../blob/main/docs/p2-app-404.md#the-trap-useasyncdata-collapses-error-and-empty);
  confidence-graded fixes in [fixes](../../blob/main/docs/fixes.md#p2--app-rendered-404).
