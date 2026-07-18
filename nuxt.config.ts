// Minimal reproduction of cause P3: basic auth on the ISR render path.
// See README.md on this branch; full symptom-family analysis lives on main.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  // arms server/middleware/basic-auth.ts when both are set on the deployment
  runtimeConfig: {
    basicAuthUser: '',
    basicAuthPassword: '',
  },
  routeRules: {
    // every page ISR, never expires — the incident shape: entries that fail
    // to populate stay dead, entries that populate stay public, forever
    '/**': { isr: true },
    // keep the purge endpoint out of ISR (and out of auth, see middleware)
    '/api/**': { isr: false },
  },
})
