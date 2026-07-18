// Mirrors a live production project's cache-tag usage: every ISR page response gets
// Vercel cache tags via @vercel/functions, so entries can be purged with
// invalidateByTag (their CMS-webhook publish flow). The purge → re-populate
// cycle is a distinct invocation shape we're testing for carrier loss.
import { addCacheTag } from '@vercel/functions'

const SKIP_PREFIXES = ['/api/', '/_nuxt/', '/__', '/favicon', '/robots']

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return
  try {
    await addCacheTag(['all', `page:${path}`])
  } catch (error) {
    console.warn('ISRDBG addCacheTag failed:', error)
  }
})
