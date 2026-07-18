// Purge Vercel cache entries by tag — mirrors a live production
// project's CMS-webhook invalidation endpoint.
// POST { "tags": ["all"] }
import { invalidateByTag } from '@vercel/functions'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const tags: string[] = Array.isArray(body?.tags) ? body.tags : []
  if (tags.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'tags[] required' })
  }
  const results = []
  for (const tag of tags) {
    try {
      await invalidateByTag(tag)
      results.push({ tag, ok: true })
    } catch (error) {
      results.push({ tag, ok: false, error: String(error) })
    }
  }
  console.log('ISRDBG-INVALIDATE', JSON.stringify(results))
  setResponseHeader(event, 'cache-control', 'no-store')
  return { at: new Date().toISOString(), results }
})
