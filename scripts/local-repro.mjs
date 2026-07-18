// Demonstrates the ISR URL-restoration failure in Nitro's Vercel entrypoint
// WITHOUT deploying: it serves the built Vercel function
// (.vercel/output/functions/__fallback.func) like Vercel's Node runtime would,
// then sends it the request shapes Vercel's router/prerender-cache produce.
//
// Run:  NITRO_PRESET=vercel bun run build && node scripts/local-repro.mjs
//
// Exit code: 0 only when every case matches its documented expectation
// (CI runs this — .github/workflows/local-repro.yml). A BUG case suddenly
// returning 200 also fails the run: it means upstream changed behavior and
// the docs' version-anchored claims need re-verifying.
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const fnEntry = resolve(
  import.meta.dirname,
  '../.vercel/output/functions/__fallback.func/index.mjs',
)
if (!existsSync(fnEntry)) {
  console.error('No Vercel build found — run: NITRO_PRESET=vercel bun run build')
  process.exit(1)
}
const listener = (await import(pathToFileURL(fnEntry).href)).default
const server = createServer(listener)
await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`

// On a real deployment the function is invoked with req.url = the REWRITTEN
// dest path (/schedule-isr). With default `isr: <number>` rules passQuery is
// unset, so Vercel strips the query — the ONLY carrier of the original URL is
// the undocumented `x-now-route-matches` header.
const cases = [
  {
    name: 'control: /schedule via catch-all (trailing-slash workaround path)',
    url: '/schedule',
    expect200: true,
  },
  {
    name: 'header carries __isr_route (normal prerender invocation)',
    url: '/schedule-isr',
    headers: { 'x-now-route-matches': '__isr_route=%2Fschedule' },
    expect200: true,
  },
  {
    name: 'no header, query carries __isr_route (passQuery-style invocation)',
    url: '/schedule-isr?__isr_route=%2Fschedule',
    expect200: true,
  },
  {
    name: 'BUG: header present WITHOUT __isr_route (query fallback shadowed)',
    url: '/schedule-isr?__isr_route=%2Fschedule',
    headers: { 'x-now-route-matches': '1=schedule' },
    expect200: false,
  },
  {
    name: 'BUG: no header, no query (bare prerender invocation)',
    url: '/schedule-isr',
    expect200: false,
  },
  {
    name: 'BUG: payload fn, bare invocation',
    url: '/schedule/_payload.json-isr',
    expect200: false,
  },
]

let mechanismConfirmed = false
let unexpected = 0
for (const c of cases) {
  const res = await fetch(base + c.url, { headers: c.headers })
  const body = await res.text()
  const notFound = body.match(/Page not found: [^<"]*/)?.[0]
  const ok = res.status === 200
  if (!ok && !c.expect200) mechanismConfirmed = true
  if (ok !== c.expect200) unexpected++
  console.log(
    `${ok === c.expect200 ? 'as-expected' : 'UNEXPECTED '} ` +
      `status=${res.status}  ${c.name}` +
      (notFound ? `\n            → server rendered "${notFound}"` : ''),
  )
}

console.log(
  mechanismConfirmed
    ? '\nMechanism confirmed: when the function cannot recover the original ' +
        'URL it renders a 404 for the internal /…-isr path. On Vercel, 404 is ' +
        'a *valid, cacheable* ISR outcome → it is stored and replayed with ' +
        'x-vercel-cache: HIT until expiration.'
    : '\nMechanism NOT reproduced — URL restoration succeeded in every case.',
)
if (unexpected > 0) {
  console.error(
    `\n${unexpected} case(s) diverged from the documented behavior — ` +
      're-verify the docs against the lockfile-resolved nitropack version.',
  )
}
server.close()
process.exit(unexpected > 0 ? 1 : 0)
