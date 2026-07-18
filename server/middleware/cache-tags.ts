// Tags every ISR page response with Vercel cache tags (@vercel/functions) so
// entries can be purged by tag via POST /api/invalidate — mirroring a
// CMS-webhook publish flow. The purge → re-populate cycle it enables drives
// the P2 (docs/p2-app-404.md) and P3 (docs/p3-auth.md) demos.
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
