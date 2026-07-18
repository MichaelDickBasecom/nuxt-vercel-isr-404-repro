# Nuxt ISR on Vercel: the `-isr` / cached-error symptom family

Reports of *"my ISR route serves a 404 naming `/<route>-isr`, and the 404 is
cached (`x-vercel-cache: HIT`)"* keep appearing against Nuxt and Nitro. This
repo reproduces that symptom and takes it apart. The central finding:

> **It is not one bug.** Three *independent* causes produce the same
> user-visible failure — and only one of them is a Nitro bug. They look
> identical from the outside because `-isr` is just Nitro's internal
> function/cache-key name leaking into logs, cache keys, and error bodies.

- Stack: Nuxt `4.4.8` → `@nuxt/nitro-server@4.4.8` → `nitropack@2.13.4`
  (latest at time of writing).
- Live deployment: **https://nuxt-vercel-isr-404-repro.vercel.app**
- New here? Read [how ISR works on Vercel](./docs/how-it-works.md) first — the
  three causes all build on the same rewrite mechanism.

## The three causes

| | Cause | Whose bug? | One line | Deep dive |
|---|---|---|---|---|
| **P1** | Nitro loses the original URL ("carrier loss") | **Nitro** | URL restoration depends on one undocumented header with no fallback; a carrier-less invocation renders — and Vercel caches — a 404 for the internal `-isr` path | [docs/p1-carrier-loss.md](./docs/p1-carrier-loss.md) |
| **P2** | The app renders a 404 and Vercel stores it | app code | `throw createError({ statusCode: 404 })` on a transient failure — 404 is a *valid, cacheable* ISR outcome | [docs/p2-app-404.md](./docs/p2-app-404.md) |
| **P3** | Auth middleware blocks ISR population | app code | population requests carry no credentials → middleware 401s them → 401 is *never* cached → route permanently unservable (and one authed render makes the page public) | [docs/p3-auth.md](./docs/p3-auth.md) |

## Which one am I hitting?

Classify from a single failing response:

| Observation | Cause |
|---|---|
| `404` + `x-vercel-cache: HIT`, error body names a **`-isr` path** | **P1** — Nitro failed to restore the URL |
| `404` + `HIT`, error body names the **real path** | **P2** — the app itself rendered the 404 |
| `401`/`5xx` + `x-vercel-error: FUNCTION_INVOCATION_FAILED` + `cache: MISS` | **P3** — non-cacheable render; nothing was ever stored |
| works only after an **authenticated** visit | **P3** |

Two things every report in the wild shares, both explained by the rewrite
mechanism (not extra bugs):

- **Client-side navigation always works** — client nav fetches
  `/route/_payload.json?<buildId>`, a *separate* ISR function (its own variant:
  [nitro#4047](https://github.com/nitrojs/nitro/issues/4047)).
- **A trailing slash appears to "fix" it** — `/schedule/` misses the anchored
  `src` regex and falls through to plain uncached SSR. It works, but it
  **silently disables ISR**.

→ Found your cause? Go to **[fixes & workarounds](./docs/fixes.md)** (graded by
confidence).

## Documentation

| Doc | For |
|---|---|
| [How ISR works on Vercel](./docs/how-it-works.md) | the shared mechanism: rewrite, platform caching rules, the measured facts, amplifiers |
| [P1 — carrier loss](./docs/p1-carrier-loss.md) · [P2 — app 404](./docs/p2-app-404.md) · [P3 — auth](./docs/p3-auth.md) | each cause in depth, with its repro |
| [Fixes & workarounds](./docs/fixes.md) | the way out, per cause, confidence-graded |
| [For maintainers](./docs/maintainers.md) | upstream action items, side-findings, the full issue/PR index, gaps with no existing issue |
| [The test bed](./docs/test-bed.md) | how this repo reproduces & self-monitors; how to run it |

## Demo branches

Standalone minimal reproductions, one per cause, each with its own README:

- [`demo/p1-deterministic`](../../tree/demo/p1-deterministic) — see the `-isr`
  404 live in a browser (pinned nitropack 2.12.9 + `passQuery`).
- [`demo/p2-app-404`](../../tree/demo/p2-app-404) — flaky SSR + `isr: true`.
- [`demo/p3-sitewide`](../../tree/demo/p3-sitewide) — site-wide basic auth +
  `isr: true`.

## Quick start

```sh
bun install
NITRO_PRESET=vercel bun run build
node scripts/local-repro.mjs           # prove P1 locally, no deploy
```

Deploying, monitoring, and the full route/script map: [the test
bed](./docs/test-bed.md).
