<script setup lang="ts">
import type { NuxtError } from '#app'

defineProps<{ error: NuxtError }>()

const errorInfo = useState('error-info', () => {
  if (import.meta.server) {
    const event = useRequestEvent()
    return {
      renderedAt: new Date().toISOString(),
      serverSawPath: event?.path,
      rawUrl: event?.node.req.url,
      routeMatches: event?.node.req.headers['x-now-route-matches'] ?? null,
    }
  }
  return null
})
</script>

<template>
  <div style="font-family: monospace; padding: 2rem; background: #fdd">
    <h1>ERROR {{ error.statusCode }}</h1>
    <p>
      This error page was server-rendered for path
      <strong>{{ errorInfo?.serverSawPath }}</strong>
      (raw req.url: <strong>{{ errorInfo?.rawUrl }}</strong>) at
      {{ errorInfo?.renderedAt }}.
    </p>
    <p>x-now-route-matches: {{ errorInfo?.routeMatches ?? '(absent)' }}</p>
    <p>
      Reading this page: if the path above ends in <code>-isr</code>, Nitro
      failed to restore the URL from the internal ISR rewrite — <strong>cause
      P1</strong> (docs/p1-carrier-loss.md). If it is a real route path, the
      app itself rendered this 404 — <strong>cause P2</strong>
      (docs/p2-app-404.md). Either way, on Vercel a 404 is a cacheable ISR
      outcome, so this response may be served from cache to every visitor.
    </p>
  </div>
</template>
