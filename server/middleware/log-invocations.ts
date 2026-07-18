// Logs one compact JSON line per function invocation so Vercel runtime logs
// show the exact shape of every request that reaches the server — including
// ISR revalidations, which are invisible from outside. Note: Nitro's Vercel
// entrypoint rewrites req.url BEFORE this runs, so `url` is post-restoration;
// a failed restoration is visible as a url still carrying the `-isr` suffix,
// and `matches` preserves the raw carrier header either way.
export default defineEventHandler((event) => {
  const h = event.node.req.headers
  console.log(
    'ISRDBG-REQ',
    JSON.stringify({
      url: event.node.req.url,
      matches: h['x-now-route-matches'] ?? null,
      id: h['x-vercel-id'] ?? null,
      ua: h['user-agent'] ?? null,
      monitor: h['x-isr-monitor'] ?? null,
    }),
  )
})
