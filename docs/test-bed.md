# The test bed: how this repo reproduces and hunts the bugs

The main branch runs all three causes and every P1 route-shape variant side by
side, and monitors itself — P1 on current versions is intermittent and may
only fire on a background revalidation nobody is watching.

## Self-describing responses (the reusable technique)

Every page embeds its **SSR-time** `event.path`, raw `req.url`, and
`x-now-route-matches` value into the rendered HTML (see
`app/components/DebugInfo.vue`, `app/error.vue`). Because ISR caches the HTML,
a poisoned cache entry **permanently shows the exact request that poisoned
it** — the difference between "a route is 404ing" and "here is the malformed
invocation that populated the 404". This is the single most useful diagnostic
if you are chasing an intermittent ISR failure of your own: make the error
page print what the server saw.

## Routes

| Path | Purpose |
|---|---|
| `/` `/about` | controls (`/` = wildcard-ISR shape from the field reports; `/about` = plain SSR, exempted via `isr: false`) |
| `/schedule` `/users/:id` `/catchall/**` + `/catchall/special` `/nested/deep` | P1 route-shape variants (static, dynamic, catch-all, overlapping, nested) |
| `/schedule-pq` `/query` | `passQuery` / `allowQuery` variants |
| `/flaky` `/flaky-ttl` | [P2](./p2-app-404.md) (`isr: true` vs finite TTL) |
| `/secret` | [P3](./p3-auth.md) (auth-gated `isr: true`) |
| `/api/monitor` `/api/invalidate` | tooling (self-monitor, tag purge) |

## Scripts

| Script | What it does |
|---|---|
| `scripts/local-repro.mjs` | drives the built Vercel function with platform-shaped requests — proves [P1](./p1-carrier-loss.md) deterministically, no deploy. Exits non-zero if any case diverges from the documented behavior; CI (`.github/workflows/local-repro.yml`) runs it on every push and weekly, so a nitropack bump that changes the mechanism can't land unnoticed |
| `scripts/poison-demo.sh <url>` | populate → purge → re-populate cycles — [P2](./p2-app-404.md) |
| `scripts/auth-demo.sh <url>` | availability + confidentiality failure — [P3](./p3-auth.md) |
| `scripts/probe.sh <url> [--burst\|--watch N]` | cold-cache race / revalidation hunt for P1 in the wild |
| `scripts/inspect-build.mjs` | dangling routes + competing functions ([side-findings](./maintainers.md#side-findings-build-generation)) |

## Monitoring

`GET /api/monitor` sweeps all routes through Vercel's public cache layer,
validates status + content, and returns a JSON verdict. On anomaly it captures
the evidence embedded in the poisoned page itself (`isrLeak` flag, SSR-time
`serverSaw`/`rawReqUrl`/`routeMatches`, body snippet).
`server/middleware/0.log-invocations.ts` logs one `ISRDBG-REQ` line per
invocation (post-restoration URL + raw carrier header), making revalidation
invocations visible; the `0.` prefix makes it run before `basic-auth.ts` can
401-abort the chain, so P3 population attempts are logged too. `.github/workflows/isr-monitor.yml` probes every 10 min
and fails the run (→ email) on any anomaly.

```sh
curl https://nuxt-vercel-isr-404-repro.vercel.app/api/monitor | jq .
```

Debugging tip that costs time otherwise: `vercel logs` truncates lines at
~200 chars, cutting off the logged carrier header — use `vercel logs <url>
--json`. Log delivery also lags ~30–40 s, so an immediate pull looks
deceptively empty.

## Run / deploy your own

```sh
bun install
NITRO_PRESET=vercel bun run build
npx vercel deploy --prebuilt --prod    # deploy to production, see the note below
```

> **Deploy to production, not a preview.** Vercel **Deployment Protection**
> gates *preview* deployments behind an SSO login (a `302` to `vercel.com`
> before your function runs), which blocks every probe script here. Use
> `--prod` (or push to the default branch via the Git integration — production
> is public by default), or disable Deployment Protection on the project. This
> is also why validating the demo branches means deploying them to the
> production alias, not opening them as PR previews.

Set `NUXT_BASIC_AUTH_USER` / `NUXT_BASIC_AUTH_PASSWORD` env vars to arm the P3
demo. The original field reports ran with Fluid compute enabled.

**Experiments:** `compatibilityDate: '2025-07-14'` disables the observability
routes; pinning `nitropack` `2.12.7` / `2.13.0` via `overrides` separates P1's
sub-variants.

## Demo branches

Standalone minimal repros, one per cause, each with its own README:

- [`demo/p1-deterministic`](../../tree/demo/p1-deterministic) — pinned
  nitropack 2.12.9 + `passQuery`; the `-isr` 404 live in a browser.
- [`demo/p2-app-404`](../../tree/demo/p2-app-404) — flaky SSR + `isr: true`.
- [`demo/p3-sitewide`](../../tree/demo/p3-sitewide) — site-wide basic auth +
  `isr: true`.

---

[← Back to README](../README.md) · [How it works](./how-it-works.md) ·
[For maintainers](./maintainers.md)
