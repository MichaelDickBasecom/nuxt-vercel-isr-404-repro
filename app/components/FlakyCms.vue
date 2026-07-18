<script setup lang="ts">
// Cause P2 (see README): a CMS fetch that transiently fails ~50% of the time
// (rate limit / timeout), converted into a *fatal 404* — the ubiquitous
// anti-pattern `if (!story.value) throw createError({ statusCode: 404 })`.
// On Vercel a 404 is a valid ISR outcome and gets stored; under `isr: true`
// (expiration: false) it is stored FOREVER.
const props = defineProps<{ rule: string }>()

const story = useState(`flaky-story-${props.rule}`, () => {
  if (import.meta.server) {
    return Math.random() < 0.5
      ? null
      : { loadedAt: new Date().toISOString() }
  }
  return null
})

if (import.meta.server && !story.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Story not found (simulated transient CMS failure)',
    fatal: true,
  })
}
</script>

<template>
  <div>
    <h1>flaky CMS page — {{ rule }}</h1>
    <p>CMS story loaded at <strong>{{ story?.loadedAt }}</strong></p>
    <DebugInfo />
  </div>
</template>
