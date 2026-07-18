<script setup lang="ts">
// Landing page AND a P1 control (no route rule of its own; served via '/**').
// The DebugInfo table at the bottom is what makes a poisoned cache entry
// self-describing — see docs/test-bed.md.
const routes = {
  'Cause P1 — carrier-loss shape variants': [
    ['/schedule', 'static baseline'],
    ['/users/42', 'dynamic param'],
    ['/catchall/foo/bar', 'catch-all'],
    ['/catchall/special', 'overlapping override'],
    ['/nested/deep', 'nested function dir'],
    ['/schedule-pq', 'passQuery carrier-switch'],
    ['/query?lang=es', 'passQuery + allowQuery'],
  ],
  'Cause P2 — app-rendered 404': [
    ['/flaky', 'isr: true — a bad render sticks forever (may 404 by design)'],
    ['/flaky-ttl', 'isr: 60 — identical page, self-heals'],
  ],
  'Cause P3 — auth on the ISR path': [
    ['/secret', 'isr: true behind basic auth (401 unless armed + authed)'],
  ],
  Controls: [['/about', 'plain SSR, no ISR']],
}
</script>

<template>
  <div>
    <h1>Nuxt ISR-on-Vercel test bed</h1>
    <p>
      Reproduces the <code>-isr</code> / cached-error symptom family — three
      independent causes behind one user-visible failure. Full analysis is in
      the repository <strong>docs/</strong> (start at the README).
    </p>
    <template v-for="(group, title) in routes" :key="title">
      <h3>{{ title }}</h3>
      <ul>
        <li v-for="[path, note] in group" :key="path">
          <NuxtLink :to="path">{{ path }}</NuxtLink> — {{ note }}
        </li>
      </ul>
    </template>
    <h3>This request (SSR diagnostics)</h3>
    <DebugInfo />
  </div>
</template>
