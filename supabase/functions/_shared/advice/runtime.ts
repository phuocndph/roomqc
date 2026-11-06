import { AdviceError, adviceUuid, object, readBoundedJson } from './contracts.ts'
import { createAdviceProvider } from './provider.ts'
import type { AdviceDependencies } from './handler.ts'

export function readAdviceConfig(env: (key: string) => string | undefined) {
  const provider = env('ROOMQC_ADVICE_PROVIDER')?.trim() || 'disabled'
  const environment = env('ROOMQC_ADVICE_ENVIRONMENT')?.trim() || 'local'
  const fixtureOwner = env('ROOMQC_ADVICE_FIXTURE_OWNER')?.trim() || ''
  if (!['disabled', 'lovable', 'fixture'].includes(provider) || !['local', 'staging', 'production', 'fixture'].includes(environment)
    || (provider === 'fixture' && (environment !== 'fixture' || !/^[a-f0-9]{12}$/.test(fixtureOwner)))
    || (environment === 'fixture' && provider === 'lovable')) throw new AdviceError(503, 'ADVICE_UNAVAILABLE')
  return { provider: provider as 'disabled' | 'lovable' | 'fixture', environment, fixtureOwner,
    key: env('LOVABLE_API_KEY')?.trim() || '', url: env('SUPABASE_URL')?.trim() || '',
    anonKey: env('SUPABASE_ANON_KEY')?.trim() || '', serviceKey: env('SUPABASE_SERVICE_ROLE_KEY')?.trim() || '' }
}
function failure(status: number, body: unknown): never {
  const x = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const code = typeof x.code === 'string' ? x.code : '', message = typeof x.message === 'string' ? x.message : ''
  if (status === 401 || message === 'ADVICE_SESSION_REQUIRED') throw new AdviceError(401, 'ADVICE_SESSION_REQUIRED')
  if (code === '42501' || status === 403) throw new AdviceError(403, 'ADVICE_NOT_ALLOWED')
  if (code === 'PT429' && message === 'ADVICE_QUOTA_EXCEEDED') throw new AdviceError(429, 'ADVICE_QUOTA_EXCEEDED')
  if (code === 'PT409' && message === 'ADVICE_STILL_RUNNING') throw new AdviceError(409, 'ADVICE_STILL_RUNNING')
  if (code === 'PT409') throw new AdviceError(409, 'ADVICE_CONFLICT')
  if (code === '22023' && message === 'INVALID_ADVICE_REQUEST') throw new AdviceError(400, 'ADVICE_INVALID_REQUEST')
  throw new AdviceError(503, 'ADVICE_UNAVAILABLE')
}
export function createAdviceDependencies(env: (key: string) => string | undefined, cors: AdviceDependencies['cors'], request: typeof fetch = fetch,
  now: () => number = Date.now): AdviceDependencies {
  const config = readAdviceConfig(env)
  const origin = () => {
    let url: URL
    try { url = new URL(config.url) } catch { throw new AdviceError(503, 'ADVICE_UNAVAILABLE') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || (config.environment === 'production' && url.protocol !== 'https:') || !config.anonKey || !config.serviceKey) throw new AdviceError(503, 'ADVICE_UNAVAILABLE')
    return url.origin
  }
  const call = async (pathname: string, token: string, key: string, args?: Record<string, unknown>) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await request(origin() + pathname, { method: args ? 'POST' : 'GET', redirect: 'error', signal: controller.signal,
        headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(args ? { body: JSON.stringify(args) } : {}) })
      let result: unknown
      try { result = await readBoundedJson(response, 49152) } catch { throw new AdviceError(503, 'ADVICE_UNAVAILABLE') }
      if (!response.ok) failure(response.status, result)
      if (controller.signal.aborted) throw new AdviceError(503, 'ADVICE_UNAVAILABLE')
      return result
    } catch (e) { if (e instanceof AdviceError) throw e; throw new AdviceError(503, 'ADVICE_UNAVAILABLE') }
    finally { clearTimeout(timer) }
  }
  const rpc = (token: string, key: string) => (name: string, args: Record<string, unknown>) => {
    if (!['get_operations_advice_command', 'prepare_operations_advice', 'cancel_operations_advice', 'close_operations_advice', 'dispatch_operations_advice', 'finish_operations_advice'].includes(name)) throw new AdviceError(503, 'ADVICE_UNAVAILABLE')
    return call('/rest/v1/rpc/' + name, token, key, args)
  }
  return { cors, available: () => config.provider === 'fixture' || (config.provider === 'lovable' && !!config.key),
    worker: rpc(config.serviceKey, config.serviceKey), provider: createAdviceProvider(config, request, now),
    user: async token => {
      // Auth verifies the bearer before claims bind the verified identity to a DB session.
      let verified: Record<string, unknown>
      try { verified = object(await call('/auth/v1/user', token, config.anonKey)) }
      catch (e) { if (e instanceof AdviceError && e.status === 503) throw e; throw new AdviceError(401, 'ADVICE_SESSION_REQUIRED') }
      try {
        const parts = token.split('.'); if (parts.length !== 3 || parts[1].length > 16000) throw new Error()
        const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const claims = object(JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))))
        if (!adviceUuid(verified.id) || claims.sub !== verified.id || claims.role !== 'authenticated' || claims.is_anonymous === true
          || !adviceUuid(claims.session_id) || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= now()) throw new Error()
        return { actorId: verified.id, sessionId: claims.session_id, rpc: rpc(token, config.anonKey) }
      } catch { throw new AdviceError(401, 'ADVICE_SESSION_REQUIRED') }
    } }
}
