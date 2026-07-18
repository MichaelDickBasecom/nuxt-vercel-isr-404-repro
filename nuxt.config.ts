// Test bed for the Nuxt-ISR-on-Vercel `-isr` / cached-error symptom family.
// Full analysis in docs/ (start at README.md). Each route below demonstrates
// one cause or one P1 route-shape variant; the monitor (server/api/monitor)
// validates the healthy routes continuously.
export default defineNuxtConfig({
  // >= 2025-07-15 enables Nitro's Vercel "observability routes" generation.
  // That feature has build-output bugs (docs/maintainers.md, item 2) but is
  // NOT a 404 trigger; set '2025-07-14' to disable it as an experiment.
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  nitro: {
    vercel: {
      // Mirrors the production incident's runtime. Ruled out as a trigger —
      // Bun delivers the x-now-route-matches carrier correctly — kept for
      // fidelity (docs/maintainers.md, "What we ruled out").
      functions: { runtime: 'bun1.x' },
      config: {
        // Enables on-demand revalidation (x-prerender-revalidate); used by
        // the P2/P3 purge demos. Public repro token, intentionally committed.
        bypassToken: 'reproBypassToken0123456789abcdef',
      },
    },
  },
  // Arms server/middleware/basic-auth.ts (cause P3) when both are set on the
  // deployment via NUXT_BASIC_AUTH_USER / NUXT_BASIC_AUTH_PASSWORD.
  runtimeConfig: {
    basicAuthUser: '',
    basicAuthPassword: '',
  },
  routeRules: {
    // Self-healing default (finite TTL); per-cause permanence (isr: true) is
    // isolated to /flaky and /secret so the rest of the test bed stays live.
    '/**': { isr: 60 },
    // A bare '/**' ISR rule would silently cache API responses too
    // (docs/maintainers.md); send /api/** to the uncached __fallback instead.
    '/api/**': { isr: false },

    // ── cause P1 route-shape variants (docs/p1-carrier-loss.md) ──
    '/schedule': { isr: 300 }, // static baseline (nuxt#33316)
    '/users/:id': { isr: 60 }, // dynamic param → extra named capture group
    '/catchall/**': { isr: 60 }, // catch-all + …
    '/catchall/special': { isr: 120 }, // … a more-specific override
    '/nested/deep': { isr: 60 }, // nested path → nested .func dir
    '/schedule-pq': { isr: { expiration: 60, passQuery: true } }, // passQuery carrier-switch (P1 workaround, docs/fixes.md)
    '/query': { isr: { expiration: 60, passQuery: true, allowQuery: ['lang'] } }, // passQuery + allowQuery (nitro#4408 shape)

    // ── cause P2: app-rendered 404 stored forever vs. healed by a TTL ──
    '/flaky': { isr: true }, // never expires → a bad render sticks (docs/p2-app-404.md)
    '/flaky-ttl': { isr: 60 }, // identical page, finite TTL → self-heals

    // ── cause P3: auth on the ISR render path (docs/p3-auth.md) ──
    '/secret': { isr: true }, // isr:true behind basic auth → unpopulatable + auth bypass
  },
})
