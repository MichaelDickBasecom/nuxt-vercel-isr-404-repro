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
      If the path above ends in <code>-isr</code>, Nitro's Vercel entrypoint
      failed to restore the original URL from the internal ISR rewrite — this
      is the bug.
    </p>
  </div>
</template>
