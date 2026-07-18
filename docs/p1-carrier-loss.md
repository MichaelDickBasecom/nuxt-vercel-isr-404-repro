# P1 — Nitro carrier-loss

**Whose bug:** Nitro. **Symptom:** a 404 whose body names a `/<route>-isr`
path, served with `x-vercel-cache: HIT`. **Status:** deterministic on
nitropack 2.12.6–2.12.9; a latent single-point-of-failure on 2.13.4 and
v3 `main`.

Prerequisite reading: [how ISR works on Vercel](./how-it-works.md).

## The mechanism, deterministically (local, no deploy)

```sh
bun install
NITRO_PRESET=vercel bun run build
node scripts/local-repro.mjs
```

The script serves the built Vercel function exactly as the platform's runtime
would and invokes it with the request shapes Vercel produces:

| Invocation shape | Result |
|---|---|
| header carries `__isr_route` (normal) | 200, correct page |
| no header, `__isr_route` in the query (`passQuery` shape) | 200, correct page |
| **header present but without `__isr_route`** — even with the correct query param also present | **404 "Page not found: /schedule-isr"** |
| **bare invocation** (no header, no query) | **404 "Page not found: /schedule-isr"** |

Two code gaps (see the [runtime snippet](./how-it-works.md#the-five-platform-rules-that-make-failure-possible)):
the header branch never falls back to the query string, and there is no
last-resort recovery. Because 404s are cached
([rule 3](./how-it-works.md#the-load-bearing-caching-facts-measured)), any such
invocation poisons the route. Worse: we verified live that revalidation of a
poisoned entry re-invokes the function bare, **re-caching the 404
indefinitely** — a poisoned route does not heal until redeploy.

## Version history: the same weakness, three times

| nitropack | What happened | Status |
|---|---|---|
| 2.12.6 | the `<route>-isr` rename exposed a missing capture group for non-wildcard rules → the internal path leaked | fixed in **2.12.7** ([nitro#3595](https://github.com/nitrojs/nitro/pull/3595)) |
| 2.12.6–2.12.9 | with `passQuery`/`allowQuery`, **Vercel stops sending `x-now-route-matches`** — and these runtimes had no other carrier → **every direct hit fails** | fixed in **2.13.0** ([nitro#3539](https://github.com/nitrojs/nitro/pull/3539)) |
| 2.13.4 & v3 `main` | single-carrier dependency, no fallback chain (the gaps above) | **open** — no upstream issue yet; adjacent: [nitro#4408](https://github.com/nitrojs/nitro/issues/4408), [nitro#4047](https://github.com/nitrojs/nitro/issues/4047) |

Full lineage with fix commits and open PRs:
[references](./maintainers.md#p1-lineage-nitro-carrier-handling).

## See it in a browser

The branch [`demo/p1-deterministic`](../../tree/demo/p1-deterministic) pins
nitropack 2.12.9 and sets `'/': { isr: { passQuery: true } }`:

```sh
git checkout demo/p1-deterministic
# deploy, then open / in a browser:
# → "Page not found: /index-isr"; second visit: x-vercel-cache: HIT
```

Verified live 2026-07-18: three browser-shaped visits returned `404` — first
`MISS` (the poisoning population), then `HIT`. This also confirmed that
**Vercel still omits the header when `passQuery` is set** — current nitropack
survives that only through its query-string fallback, a single point of
failure.

## How often does it fire on current versions?

We monitored the live deployment for ~2 days: ~318 observed revalidation
boundaries, cold-cache races, purge cycles, buildId-style payload queries, Bun
and Node runtimes. **Vercel delivered a well-formed carrier every time.**

- Normal revalidation:
  `x-now-route-matches: 1=%2Fusers%2F42&2=42&id=42&__isr_route=%2Fusers%2F42`
  — positional *and* named groups. Reconstruction survives **only** because
  the named group is present; a serialization variant emitting only positional
  groups is exactly the poisonous third row of the table above.
- `passQuery` routes: header absent; Vercel switches the carrier entirely to
  the (passed-through) query string.

So the natural 2.13.4 trigger — a carrier misdelivery in the wild — is
unobserved here. The most plausible explanation for genuine-P1 reports on
≥ 2.13.0 is **temporal/regional variance in the undocumented header
contract**, which has demonstrably changed before (that change created the
2.12.x variant). The [test bed](./test-bed.md) keeps hunting it.

**No external poisoning vector.** Outside requests to internal paths
(`/schedule-isr`, even with the byte-identical `?__isr_route=` query) land on
*separate* cache keys — the prerender cache is keyed on the original request
path, not the rewritten dest. Third parties cannot poison a real route from
outside; poisoning requires a cause firing on a legitimate
population/revalidation.

## If you hit this in production

**Check the lockfile-resolved `nitropack` version, not the Nuxt version.**
Lockfiles from ~Sept 2025–Jan 2026 resolve into 2.12.6–2.12.9, where
`passQuery`/`allowQuery` fails deterministically. See
[fixes → P1](./fixes.md#p1--carrier-loss) for the confidence-graded options
(upgrade, redeploy, the `passQuery`+`allowQuery: []` workaround) and
[the upstream fix proposal](./maintainers.md#1-make-isr-url-restoration-fail-safe).

---

[← How it works](./how-it-works.md) · [P2](./p2-app-404.md) ·
[P3](./p3-auth.md) · [Fixes](./fixes.md) · [For maintainers](./maintainers.md)
