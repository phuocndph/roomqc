import { createHmac } from 'node:crypto'

const memory = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const header = encode({ alg: 'HS256', typ: 'JWT' })
const payload = encode({
  aud: 'authenticated',
  role: 'authenticated',
  sub: 'af661737-a116-4c76-8580-07e80f7293fe',
  iss: 'supabase-demo',
  iat: now,
  exp: now + 3600,
})
const accessToken = `${header}.${payload}.${createHmac('sha256', 'super-secret-jwt-token-with-at-least-32-characters-long').update(`${header}.${payload}`).digest('base64url')}`

const { supabase } = await import('../src/integrations/supabase/client')
const { seedDemoData } = await import('../src/lib/seedDemoData')
const sessionResult = await supabase.auth.setSession({ access_token: accessToken, refresh_token: 'local-demo-refresh' })
console.log('session', sessionResult.error?.message ?? 'ok')
const result = await supabase.from('users').select('id,email,tenant_id,hotel_id').limit(1)
console.log('query', result.error?.message ?? result.data)

if (!sessionResult.error) {
  const user = result.data?.[0]
  if (!user) throw new Error('No local demo user found')
  const seedResult = await seedDemoData(
    user.tenant_id,
    user.hotel_id,
    user.id,
    (progress) => console.log(`${progress.current}/${progress.total} ${progress.step}: ${progress.message}`),
  )
  console.log('seed', JSON.stringify(seedResult.summary))
}
