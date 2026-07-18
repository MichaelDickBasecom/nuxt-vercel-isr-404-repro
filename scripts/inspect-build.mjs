// Shows the Vercel-preset build-generation side-findings (docs/maintainers.md) in the
// actual build output — run after: NITRO_PRESET=vercel bun run build
//   1. dangling config.json routes: dest points at no function/static file
//      (observability routes emitted for ISR-ruled paths whose function
//      creation was skipped)
//   2. competing outputs: a plain o11y function AND an ISR function for the
//      same route pattern (the ISR-skip check matches route rules against
//      the compiled regex string instead of a path, so it misses dynamic
//      routes)
import { readFileSync, readdirSync, existsSync, lstatSync } from 'node:fs'
import { join } from 'node:path'

const out = '.vercel/output'
if (!existsSync(join(out, 'config.json'))) {
  console.error('No build found — run: NITRO_PRESET=vercel bun run build')
  process.exit(1)
}

const config = JSON.parse(readFileSync(join(out, 'config.json'), 'utf8'))
const fsIdx = config.routes.findIndex((r) => r.handle === 'filesystem')
const routes = config.routes.slice(fsIdx + 1).filter((r) => r.dest)

function collectFuncs(dir, prefix = '') {
  const found = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix + e.name
    if (e.name.endsWith('.func')) {
      const p = join(dir, e.name)
      found.push({
        name: rel.slice(0, -5),
        symlink: lstatSync(p).isSymbolicLink(),
      })
    } else if (e.isDirectory()) {
      found.push(...collectFuncs(join(dir, e.name), rel + '/'))
    }
  }
  return found
}
const funcs = collectFuncs(join(out, 'functions'))
const funcNames = new Set(funcs.map((f) => f.name))

const staticExists = (p) => {
  const s = join(out, 'static', p)
  return existsSync(s) || existsSync(s + '.html') || existsSync(join(s, 'index.html'))
}

console.log('== functions emitted (name → symlink?):')
for (const f of funcs.sort((a, b) => a.name.localeCompare(b.name)))
  console.log(`  ${f.name}${f.symlink ? '  -> symlink' : ''}`)

console.log('\n== DANGLING routes (dest resolves to no function/static output):')
console.log('   (observability routes emitted for paths whose function creation')
console.log('    was skipped. In a `/**: isr` config every o11y route is shadowed')
console.log('    by the preceding wildcard ISR route, so they 404 only if reached —')
console.log('    remove `/**` and the per-route ones below become live 404 risks.)')
let dangling = 0
for (const r of routes) {
  const dest = r.dest.split('?')[0].replace(/^\//, '')
  if (dest && !funcNames.has(dest) && !staticExists(dest)) {
    dangling++
    console.log(`  ${JSON.stringify(r)}`)
  }
}
if (!dangling) console.log('  (none)')

console.log('\n== COMPETING outputs (plain o11y function alongside -isr function):')
console.log('   (the ISR-skip check matches route rules against the compiled regex')
console.log('    STRING, not a path — so dynamic routes like /users/:id slip through')
console.log('    and get BOTH a plain function and an -isr function. Masked by `/**`')
console.log('    here since the wildcard makes the skip apply; flip `/**` off to see it.)')
let competing = 0
for (const f of funcNames) {
  if (funcNames.has(`${f}-isr`)) {
    competing++
    console.log(`  ${f}.func  AND  ${f}-isr.func`)
  }
}
if (!competing) console.log('  (none in this config — see note above)')