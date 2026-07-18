// Minimal reproduction of cause P2: app-rendered 404s stored permanently
// into never-expiring Vercel ISR entries. See README.md on this branch; full
// symptom-family analysis lives on the main branch.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  routeRules: {
    // never expires → one bad re-population poisons the route PERMANENTLY…
    '/flaky': { isr: true },
    // …while the identical page under a finite TTL heals within a cycle
    '/flaky-ttl': { isr: 60 },
  },
})
