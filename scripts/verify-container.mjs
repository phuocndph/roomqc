const baseUrl = (process.env.ROOMQC_BASE_URL || 'http://127.0.0.1:8082').replace(/\/$/, '')

const failures = []
const securityHeaders = [
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
]

async function request(path) {
  try {
    return await fetch(`${baseUrl}${path}`, { redirect: 'error' })
  } catch (error) {
    failures.push(`${path} is unreachable: ${error instanceof Error ? error.message : error}`)
    return null
  }
}

function expectStatus(response, path, status = 200) {
  if (response && response.status !== status) {
    failures.push(`${path} returned HTTP ${response.status}, expected ${status}`)
  }
}

function expectSecurityHeaders(response, path) {
  if (!response) return
  for (const header of securityHeaders) {
    if (!response.headers.get(header)) failures.push(`${path} is missing ${header}`)
  }
}

const health = await request('/healthz')
expectStatus(health, '/healthz')
expectSecurityHeaders(health, '/healthz')
if (health && (await health.text()).trim() !== 'ok') failures.push('/healthz did not return "ok"')

const login = await request('/auth/login')
expectStatus(login, '/auth/login')
expectSecurityHeaders(login, '/auth/login')
const loginCache = login?.headers.get('cache-control') || ''
if (!/no-store/i.test(loginCache)) failures.push('/auth/login must use Cache-Control: no-store')
const loginHtml = login ? await login.text() : ''
if (loginHtml && !loginHtml.includes('id="root"')) failures.push('/auth/login did not return the app shell')

const serviceWorker = await request('/sw.js')
expectStatus(serviceWorker, '/sw.js')
expectSecurityHeaders(serviceWorker, '/sw.js')
const swCache = serviceWorker?.headers.get('cache-control') || ''
if (!/no-store/i.test(swCache)) failures.push('/sw.js must use Cache-Control: no-store')

const assetPath = loginHtml.match(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/)?.[1]
if (!assetPath) {
  failures.push('Could not find a hashed JS/CSS asset in the app shell')
} else {
  const asset = await request(assetPath)
  expectStatus(asset, assetPath)
  expectSecurityHeaders(asset, assetPath)
  const assetCache = asset?.headers.get('cache-control') || ''
  if (!/max-age=31536000/i.test(assetCache) || !/immutable/i.test(assetCache)) {
    failures.push(`${assetPath} must use a one-year immutable cache policy`)
  }
}

if (failures.length > 0) {
  console.error('Container verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Container verified at ${baseUrl}`)
