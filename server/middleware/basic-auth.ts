// Cause P3 (docs/p3-auth.md): auth on the ISR render path. ISR
// cache-population requests carry no Authorization header, so this 401s them;
// 401 is not a cacheable ISR status → nothing is ever stored → the route is
// permanently dead for unauthenticated traffic (and once an authenticated
// visitor populates it, the shared cache serves it to everyone — auth bypass).
//
// Scoped to /secret/** here so the rest of the test bed stays reachable; the
// branch demo/p3-sitewide gates the whole site (the original incident shape).
// Enabled only when NUXT_BASIC_AUTH_USER / NUXT_BASIC_AUTH_PASSWORD are set.
export default defineEventHandler((event) => {
  const { basicAuthUser, basicAuthPassword } = useRuntimeConfig(event)
  if (!basicAuthUser || !basicAuthPassword) return

  const { pathname } = getRequestURL(event)
  if (pathname !== '/secret' && !pathname.startsWith('/secret/')) return

  const authorization = getRequestHeader(event, 'authorization')
  const expected = `Basic ${Buffer.from(`${basicAuthUser}:${basicAuthPassword}`).toString('base64')}`
  if (authorization === expected) return

  setResponseHeader(event, 'WWW-Authenticate', 'Basic realm="Access Control"')
  throw createError({ statusCode: 401, statusMessage: 'Access Control' })
})
