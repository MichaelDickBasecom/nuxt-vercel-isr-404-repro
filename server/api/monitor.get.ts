// Self-monitor: fetches the project's own public routes through Vercel's
// full routing/caching layer and validates status + content. Invoked by a
// daily Vercel Cron (see vercel.json) and every 10 min by the GitHub Action
// (.github/workflows/isr-monitor.yml), and on demand via GET /api/monitor.
//
// On anomaly it returns the *evidence embedded in the poisoned page itself*
// (the pages capture SSR-time req.url + x-now-route-matches into their HTML).
// This matters because Vercel Hobby runtime logs only survive ~1h, so the
// ISRDBG-REQ invocation lines are gone by the next day — but the GitHub
// Action captures this JSON in its run log, which persists ~90 days. So the
// smoking gun (the malformed header that poisoned the cache) is preserved
// without any paid log-drain / storage.
const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

// Pulls the smoking gun out of an anomalous response. Handles all three
// shapes the app can return: the healthy DebugInfo table, the error.vue HTML
// error page (both embed SSR-time req.url + x-now-route-matches), and Nitro's
// JSON error body (which carries the leaked path in statusMessage/data.path).
// `isrLeak` is the definitive signature: any captured path ending in `-isr`
// means the function was invoked on its internal rewrite target and never
// restored the original URL.
function extractEvidence(body: string) {
  const grab = (...res: RegExp[]) => {
    for (const re of res) {
      const m = body.match(re)
      if (m) return decode(m[1].trim())
    }
    return null
  }
  let json: any = null
  try {
    json = JSON.parse(body)
  } catch {}
  const ev = {
    serverSaw: grab(
      /server saw path \(event\.path\)<\/td><td><strong>([^<]*)<\/strong>/,
      /server-rendered for path\s*<strong>([^<]*)<\/strong>/,
    ),
    rawReqUrl: grab(
      /raw req\.url<\/td><td>([^<]*)<\/td>/,
      /raw req\.url:\s*<strong>([^<]*)<\/strong>/,
    ),
    routeMatches: grab(
      /x-now-route-matches<\/td><td>([^<]*)<\/td>/,
      /x-now-route-matches:\s*([^<]*)<\/p>/,
    ),
    renderedAt: grab(/SSR rendered at<\/td><td>([^<]*)<\/td>/),
    // JSON-error shape (Nitro default error body)
    jsonStatusMessage: json?.statusMessage ?? null,
    jsonErrorPath: json?.data?.path ?? null,
  }
  const isrLeak = [ev.serverSaw, ev.rawReqUrl, ev.jsonErrorPath, ev.jsonStatusMessage]
    .some((v) => typeof v === 'string' && /-isr(\b|\/|\?|$)/.test(v))
  return { isrLeak, ...ev }
}

const CHECKS: Array<{ path: string; mustContain: string }> = [
  // index route under the global '/**' rule — reported 100%-broken shape
  { path: '/', mustContain: 'Nuxt ISR-on-Vercel test bed' },
  { path: '/schedule', mustContain: 'isr: 300' },
  { path: '/schedule-pq', mustContain: 'isr: 60 + passQuery' },
  { path: '/users/42', mustContain: '/users/42 — isr: 60' },
  { path: '/users/43', mustContain: '/users/43 — isr: 60' },
  { path: '/catchall/foo', mustContain: 'catch-all' },
  { path: '/catchall/foo/bar', mustContain: 'catch-all' },
  { path: '/catchall/special', mustContain: 'catch-all' },
  { path: '/query?lang=es', mustContain: '— lang: es' },
  { path: '/query?lang=de', mustContain: '— lang: de' },
  { path: '/query', mustContain: '— lang: (none)' },
  { path: '/nested/deep', mustContain: 'nested function dir' },
  { path: '/about', mustContain: 'plain SSR' },
]

export default defineEventHandler(async (event) => {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || getRequestHost(event)
  const base = `https://${host}`
  const results = []
  for (const c of CHECKS) {
    const started = Date.now()
    try {
      const res = await fetch(base + c.path, {
        headers: { accept: 'text/html', 'x-isr-monitor': '1' },
      })
      const body = await res.text()
      const notFound = body.match(/Page not found: [^<"]*/)?.[0] ?? null
      const ok =
        res.status === 200 && !notFound && body.includes(c.mustContain)
      results.push({
        path: c.path,
        ok,
        status: res.status,
        cache: res.headers.get('x-vercel-cache'),
        age: res.headers.get('age'),
        ms: Date.now() - started,
        ...(notFound ? { notFound } : {}),
        // On anomaly, preserve the durable evidence: response identifiers +
        // the SSR-time request state the poisoned page embedded in its HTML,
        // plus a trimmed body snippet as a catch-all.
        ...(ok
          ? {}
          : {
              vercelId: res.headers.get('x-vercel-id'),
              evidence: extractEvidence(body),
              bodySnippet: body.replace(/\s+/g, ' ').slice(0, 1500),
            }),
      })
    } catch (e) {
      results.push({ path: c.path, ok: false, error: String(e) })
    }
  }
  const anomalies = results.filter((r) => !r.ok)
  const summary = {
    at: new Date().toISOString(),
    base,
    ok: anomalies.length === 0,
    anomalyCount: anomalies.length,
    results,
  }
  console.log(
    'ISRDBG-MONITOR',
    JSON.stringify({ at: summary.at, ok: summary.ok, anomalyCount: anomalies.length }),
  )
  if (anomalies.length > 0) {
    console.error('ISRDBG-ANOMALY', JSON.stringify(anomalies))
  }
  setResponseHeader(event, 'cache-control', 'no-store')
  return summary
})
