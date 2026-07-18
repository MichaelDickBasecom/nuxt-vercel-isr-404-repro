# For Nitro / Nuxt / Vercel maintainers

Everything here is demonstrated in this repo; statuses checked 2026-07-18.

## Actionable upstream items

### 1. Make ISR URL restoration fail-safe

**Filed 2026-07-18: [nitro#4446](https://github.com/nitrojs/nitro/issues/4446).**
Add a fallback chain — the P1 gap, previously with no existing issue or PR
anywhere, including nitro v3 `main`.
Today the runtime trusts a single carrier and gives up *silently*: header
present but missing `__isr_route` → the query is never consulted; bare
invocation → no recovery at all. In priority order:

1. **Fail safe (highest value).** When restoration cannot recover the
   original URL, respond **`503`** instead of rendering the app's 404 page. A
   503 is never cached and preserves any existing good copy
   ([measured](./how-it-works.md#the-load-bearing-caching-facts-measured)) —
   so an unrecognised future carrier shape degrades to a *transient miss*, not
   *permanent cache poisoning*. This is the only measure that defends against
   invocation shapes nobody has enumerated yet.
2. **Consult the query string when the header lacks `__isr_route`.** Strictly
   additive (the query carries the identical value the same rewrite wrote); it
   fixes the exact failing case in `scripts/local-repro.mjs` without touching
   the working paths.
3. *(weakest)* strip the `-isr` suffix as a last resort — but only works for
   **static** routes; a dynamic dest (`/users/[id]-isr`, `/[...]-isr`) strips
   to a route *pattern*, not a concrete URL.

Deterministic repro: `node scripts/local-repro.mjs` (needs one route rule).
Prior art for a hardened design: Astro's
[astro#17370](https://github.com/withastro/astro/pull/17370) (per-build token
+ internal-param stripping). Related open items:
[nitro#4408](https://github.com/nitrojs/nitro/issues/4408) /
[PR#4409](https://github.com/nitrojs/nitro/pull/4409) (header branch drops the
query string), [nitro#4047](https://github.com/nitrojs/nitro/issues/4047)
(payload-function variant).

### 2. Fix observability-routes generation for ISR rules

**Filed 2026-07-18: [nitro#4447](https://github.com/nitrojs/nitro/issues/4447).**
Previously no existing issue post-2.12.6. `generateFunctionFiles` decides whether to skip
an o11y function by calling `_getRouteRules(route.src)` where `route.src` is
the *compiled regex string* (e.g. `/users/(?<id>[^/]+)`), not a request path —
so dynamic routes get **both** a plain function and an `-isr` function for the
same pattern, and skipped paths leave **dangling `config.json` routes** whose
dest resolves to nothing. Evidence:
`NITRO_PRESET=vercel bun run build && node scripts/inspect-build.mjs`. Details
in [side-findings](#side-findings-build-generation).

### 3. Document the failure-status contract for ISR routes

P2/P3 are docs gaps. On Vercel the status an app returns under failure *is* a
caching decision: 404/410 are stored (a transient failure becomes a sticky
wrong response — P2), 401/403/5xx are never stored (the route becomes
unpopulatable — P3). Neither is in the Nitro docs; both bit a real production
app. Also worth documenting: `'/**': { isr }` silently ISR-caches `/api/**`
(closest existing issue: [nuxt#19353](https://github.com/nuxt/nuxt/issues/19353),
closed 2023), and per-request auth cannot safely coexist with ISR (P3,
including the auth-bypass direction).

### 4. Catch-all rules generate no payload ISR rule

Client-nav payload requests fall into the page's ISR rewrite instead. Fits as
evidence on the already-open
[nitro#4047](https://github.com/nitrojs/nitro/issues/4047).

## Side-findings (build generation)

```sh
NITRO_PRESET=vercel bun run build && node scripts/inspect-build.mjs
```

- **Dangling routes.** The observability-routes feature
  (`compatibilityDate >= 2025-07-15`) emits per-route `config.json` entries
  whose function creation was *skipped* for ISR-ruled paths — dests pointing
  at nothing. Currently shadowed by route ordering; per Build Output API
  semantics, a matched dangling dest hard-404s without falling through.
- **Competing functions.** See item 2 — the regex-string-vs-path skip check.
- **`'/**': { isr }` silently ISR-caches `/api/**`.** This repo's own monitor
  endpoint froze for an hour before `'/api/**': { isr: false }` was added.
- **No payload ISR rule for catch-all rules** (item 4).

## What we ruled out (negative results worth keeping)

Each was a serious suspect and was **ruled out empirically** — recorded so the
next investigator doesn't restart from here.

- **Symlinked `.func` directories are fine.** They are the documented Build
  Output API pattern (Next.js ships the same at scale). The once-proposed
  `vercel.functionRules` copy-path experiment is impossible on any *released*
  nitropack — that option exists only on unreleased branches.
- **The Bun runtime (`bun1.x`) is not the trigger** — it delivers the carrier
  correctly (the P3 incident merely ran on it).
- **Observability routes are not the 404 trigger** — the dangling/competing
  entries they generate are shadowed by route ordering; disabling them
  (`compatibilityDate: '2025-07-14'`) changes nothing about P1–P3.
- **Cache-tag purges and `x-prerender-revalidate` flows are healthy per se** —
  they are churn *amplifiers*, not causes.
- **Cold-cache races don't trigger P1** — 8-way concurrent first-hits
  populated correctly every time.
- **`'/': { prerender: true }` + `'/**': { isr }` doesn't 404** — it serves a
  *frozen* prerendered index (never revalidates). That's
  [nitro#4041](https://github.com/nitrojs/nitro/issues/4041)'s staleness
  problem, a different failure.

## P3 confidentiality — disclosure

The auth-bypass direction of P3 is **documented shared-cache behavior misused
by the app**, not a platform vulnerability: Vercel's
[CDN cache](https://vercel.com/docs/caching/cdn-cache) excludes requests
bearing `Authorization` (and responses bearing `set-cookie`), but the
ISR/prerender cache has **no such documented exclusion** — it is keyed by
path/deployment and shared across visitors. Publishing the pattern is
legitimate (no specific target, documented behavior). A courtesy heads-up to
`vercel.com/abuse` — framed "believed working-as-documented, flagging for a
possible guardrail" — is reasonable, given Vercel has shipped platform-side
guardrails for cache/auth interactions before
([SvelteSpill / CVE-2026-27118](https://www.aikido.dev/blog/sveltespill-cache-deception-sveltekit-vercel)).
(Note: next.js discussion #19589 is about the *self-hosted* ISR cache handler,
not auth — don't cite it for this.)

## Known issues & related reports

### P1 lineage (Nitro carrier handling)

| Reference | Status | Notes |
|---|---|---|
| [nitro#1287](https://github.com/nitrojs/nitro/issues/1287), [nitro#1880](https://github.com/nitrojs/nitro/issues/1880) | closed | earliest ancestors (2023): ISR 404 on `/`; query never reaches the render |
| [nuxt#33316](https://github.com/nuxt/nuxt/issues/33316) → [nitro#3595](https://github.com/nitrojs/nitro/pull/3595) | fixed, **2.12.7** | the original "`/{url}-isr`" report: missing capture group for non-wildcard rules |
| [nitro#3594](https://github.com/nitrojs/nitro/issues/3594), [nitro#3651](https://github.com/nitrojs/nitro/issues/3651) → [nitro#3539](https://github.com/nitrojs/nitro/pull/3539) | fixed, **2.13.0** | `passQuery`/`allowQuery` → Vercel omits `x-now-route-matches`; 2.12.6–2.12.9 had no other carrier. #3651 is confirmed-fixed yet still open |
| [nitro#3844](https://github.com/nitrojs/nitro/issues/3844) | fixed, 2.13.0 | ISR cache ignored dynamic route params |
| [nitro#4408](https://github.com/nitrojs/nitro/issues/4408) + [PR#4409](https://github.com/nitrojs/nitro/pull/4409) | **open**, PR unreviewed | header branch drops the entire query string |
| [nitro#4047](https://github.com/nitrojs/nitro/issues/4047) | **open** | `_payload.json-isr` 404s in console on ISR routes |
| nitro v3 `main` (`presets/vercel/runtime/isr.ts`, via [PR#3851](https://github.com/nitrojs/nitro/pull/3851)) | **gap persists** | header-without-`__isr_route` returns no result, **no fallback**; PR#4409 doesn't add one — tracked in [nitro#4446](https://github.com/nitrojs/nitro/issues/4446) |

### Build generation / observability routes

- [PR#3474](https://github.com/nitrojs/nitro/pull/3474) introduced o11y
  routes; first ISR clashes fixed in **2.12.6** via
  [PR#3560](https://github.com/nitrojs/nitro/pull/3560) /
  [#3562](https://github.com/nitrojs/nitro/pull/3562) /
  [#3563](https://github.com/nitrojs/nitro/pull/3563) (and
  [nuxt#33140](https://github.com/nuxt/nuxt/issues/33140)).
- [nitro#1540](https://github.com/nitrojs/nitro/issues/1540) (**open**) —
  route-rule symlink `EEXIST` build failures;
  [nitro#4233](https://github.com/nitrojs/nitro/issues/4233) (**open**) —
  `functionRules` full-copy size blow-up, reflink fix
  ([PR#4373](https://github.com/nitrojs/nitro/pull/4373)) merged to v3 `main`
  only, unreleased.

### Adjacent open Nitro / Nuxt ISR issues

[nitro#4041](https://github.com/nitrojs/nitro/issues/4041) (prerender+isr =
frozen content) ·
[nitro#3322](https://github.com/nitrojs/nitro/issues/3322) (prerender/ISR
interplay) ·
[nitro#2515](https://github.com/nitrojs/nitro/issues/2515) (vercel-edge i18n
param leak) ·
[nitro#889](https://github.com/nitrojs/nitro/issues/889) /
[#1694](https://github.com/nitrojs/nitro/issues/1694) (on-demand revalidation
FR) ·
[nuxt#35352](https://github.com/nuxt/nuxt/issues/35352) (stale payload after
ISR revalidation)

### Platform behavior (Vercel / Next.js)

- [next.js#34006](https://github.com/vercel/next.js/issues/34006),
  [next.js#66540](https://github.com/vercel/next.js/issues/66540) — ISR caching
  404s (long-standing, by design).
- [Vercel ISR docs](https://vercel.com/docs/incremental-static-regeneration)
  (valid-status set, failed-revalidation behavior, per-deployment cache) ·
  [CDN cache](https://vercel.com/docs/caching/cdn-cache) (Authorization
  exclusion) ·
  [Deployment Protection](https://vercel.com/docs/deployment-protection) ·
  [FUNCTION_INVOCATION_FAILED](https://vercel.com/docs/errors/FUNCTION_INVOCATION_FAILED).

### Community field reports

The original thread ([Nuxt Discord mirror](https://www.answeroverflow.com/m/1420680318196650035),
same reporter as nuxt#33316) has the canonical `curl -I` evidence: `HTTP/2
404` + `x-vercel-cache: HIT`. Independent recurrences:
[SWR/ISR issues](https://www.answeroverflow.com/m/1417548252638740541); and —
from 2024, showing the class predates the `-isr` naming — a visible
[`?url=` param leaking into browser URLs](https://www.answeroverflow.com/m/1216682782106058772).

### Same symptom in other frameworks

- **SvelteKit**: [kit#15085](https://github.com/sveltejs/kit/issues/15085) —
  exact carrier-loss analog (ISR strips a required query param), fixed in
  adapter-vercel 6.3.1; [kit#12690](https://github.com/sveltejs/kit/issues/12690)
  (ISR symlinks, open).
- **Astro**: [astro#16079](https://github.com/withastro/astro/pull/16079) —
  "Fix ISR path rewrite to prevent 404" (identical symptom, fixed 10.0.3);
  [astro#17370](https://github.com/withastro/astro/pull/17370) — hardens the
  internal ISR rewrite with a per-build token + internal-param stripping —
  **prior art for the fallback the Nitro fix needs**.

## Gaps — findings here with no existing issue (verified by search)

1. ~~**No issue/PR anywhere adds a fallback chain** (header → query →
   `-isr`-strip) to Nitro's ISR URL restoration — the P1 gap on 2.13.4 *and*
   v3 `main`.~~ **Filed 2026-07-18:
   [nitro#4446](https://github.com/nitrojs/nitro/issues/4446)** (item 1).
2. **No issue for auth/401 breaking ISR population** (P3 availability) **nor
   for the ISR shared cache serving auth-gated content** (P3 confidentiality)
   — in nitro, nuxt, or next.js. → item 3.
3. **No current issue for `'/**': { isr }` ISR-caching `/api/**`** (closest:
   [nuxt#19353](https://github.com/nuxt/nuxt/issues/19353), closed 2023).
4. ~~**No issue for the post-2.12.6 o11y generation bugs**~~ **Filed
   2026-07-18: [nitro#4447](https://github.com/nitrojs/nitro/issues/4447)**
   (item 2; `scripts/inspect-build.mjs` is the evidence).

---

[← Back to README](../README.md) · [How it works](./how-it-works.md) ·
[Fixes](./fixes.md)
