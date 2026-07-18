<script setup lang="ts">
// Captured once during SSR and embedded in the payload, so a cached ISR page
// permanently shows what the *cache-populating* request looked like.
const info = useState('debug-info', () => {
  if (import.meta.server) {
    const event = useRequestEvent()
    return {
      renderedAt: new Date().toISOString(),
      serverSawPath: event?.path,
      rawUrl: event?.node.req.url,
      routeMatches: event?.node.req.headers['x-now-route-matches'] ?? null,
      isrParamInUrl: event?.node.req.url?.includes('__isr_route') ?? false,
    }
  }
  return null
})
const route = useRoute()
</script>

<template>
  <table border="1" cellpadding="6" style="border-collapse: collapse">
    <tbody>
      <tr><td>SSR rendered at</td><td>{{ info?.renderedAt }}</td></tr>
      <tr><td>server saw path (event.path)</td><td><strong>{{ info?.serverSawPath }}</strong></td></tr>
      <tr><td>raw req.url</td><td>{{ info?.rawUrl }}</td></tr>
      <tr><td>x-now-route-matches</td><td>{{ info?.routeMatches ?? '(absent)' }}</td></tr>
      <tr><td>__isr_route in raw req.url</td><td>{{ info?.isrParamInUrl }}</td></tr>
      <tr><td>client route.path</td><td>{{ route.path }}</td></tr>
    </tbody>
  </table>
</template>
