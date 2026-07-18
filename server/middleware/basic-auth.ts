// Cause P3 (see README), site-wide — a mirror of a real-world
// middleware. ISR cache-population requests carry no Authorization header,
// so this 401s them; 401 is not a cacheable ISR status →
// FUNCTION_INVOCATION_FAILED, nothing is ever stored: the whole site is
// permanently dead for unauthenticated traffic — until one authenticated
// visitor populates an entry, which is then served to EVERYONE (auth
// bypass). Enabled only when both env vars are set.
const EXCLUDED = ['/robots.txt']

const isExcluded = (pathname: string): boolean =>
  EXCLUDED.includes(pathname) || pathname === '/api' || pathname.startsWith('/api/')

export default defineEventHandler((event) => {
  const { basicAuthUser, basicAuthPassword } = useRuntimeConfig(event)
  if (!basicAuthUser || !basicAuthPassword) return

  const { pathname } = getRequestURL(event)
  if (isExcluded(pathname)) return

  const authorization = getRequestHeader(event, 'authorization')
  const expected = `Basic ${Buffer.from(`${basicAuthUser}:${basicAuthPassword}`).toString('base64')}`
  if (authorization === expected) return

  setResponseHeader(event, 'WWW-Authenticate', 'Basic realm="Access Control"')
  throw createError({ statusCode: 401, statusMessage: 'Access Control' })
})
