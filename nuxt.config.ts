// Minimal reproduction of cause P1's deterministic variant: ISR carrier
// loss on nitropack 2.12.6–2.12.9 (pinned via package.json overrides).
// See README.md on this branch; full symptom-family analysis lives on main.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  routeRules: {
    // passQuery makes Vercel omit x-now-route-matches, and 2.12.6-2.12.9
    // runtimes have no other URL carrier → every direct browser visit to /
    // renders "Page not found: /index-isr" and Vercel caches the 404.
    // Fixed in nitropack 2.13.0 (nitro#3539).
    '/': { isr: { expiration: 300, passQuery: true } },
  },
})
