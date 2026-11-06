import { staffInvitationSession } from './staff-invitation'

export type AdvicePolicy = { enabled: boolean; daily_limit: number; daily_budget_units: number;
  units_per_request: number; valid_until: string; reason: string }
export type PolicyContext = { actorId: string; sessionId: string; tenantId: string; runtime: string }
export type PolicySnapshot = { revision: number; policy: AdvicePolicy | null }
export type PolicyCommand = { p_tenant_id: string; p_command_id: string; p_expected_version: number; p_policy: AdvicePolicy }
export type PolicyOutcome = { state: 'succeeded'; command_id: string; snapshot: PolicySnapshot }
  | { state: 'cancelled' | 'not_found'; command_id: string }
type Pending = { version: 1; actorId: string; runtime: string; command: PolicyCommand }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type PolicyOptions = { signal?: AbortSignal; isCurrent?: () => boolean }
type Lock = <T>(key: string, work: () => Promise<T>, signal?: AbortSignal) => Promise<T>
export class AdvicePolicyError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'AdvicePolicyError' }
}
const invalid = () => new AdvicePolicyError('invalid_policy', 'Kiểm tra hạn mức, thời hạn và lý do thay đổi.')
const changed = () => new AdvicePolicyError('identity_changed', 'Phiên hoặc doanh nghiệp đã thay đổi. Vui lòng tải lại.')
const unknown = () => new AdvicePolicyError('outcome_unknown', 'Chưa xác nhận được kết quả. Kiểm tra lần lưu cũ trước khi tiếp tục.')
const storageError = () => new AdvicePolicyError('storage_unavailable', 'Không đọc được thông tin phục hồi trên thiết bị. Chưa gửi lần lưu mới.')
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)
const version = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalid()
  return v as Record<string, unknown>
}

/** Normalize timezone while retaining the server's microsecond precision. */
function timestamp(value: unknown): string {
  if (typeof value !== 'string') throw invalid()
  const m = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/)
  if (!m || value.startsWith('0000') || Number(m[5] || 0) > 23 || Number(m[6] || 0) > 59) throw invalid()
  const fraction = (m[2] || '').padEnd(6, '0'), local = new Date(`${m[1]}.${fraction.slice(0, 3)}Z`)
  if (!Number.isFinite(local.getTime()) || local.toISOString().slice(0, 19) !== m[1]) throw invalid()
  const offset = (Number(m[5] || 0) * 60 + Number(m[6] || 0)) * (m[4] === '-' ? -1 : 1)
  const utc = new Date(local.getTime() - offset * 60000).toISOString()
  if (!/^\d{4}-/.test(utc)) throw invalid()
  return utc.replace(/Z$/, fraction.slice(3) + 'Z')
}
export function advicePolicy(value: unknown): AdvicePolicy {
  const p = object(value), keys = ['daily_budget_units', 'daily_limit', 'enabled', 'reason', 'units_per_request', 'valid_until']
  if (Object.keys(p).sort().join(',') !== keys.join(',') || typeof p.enabled !== 'boolean'
    || !Number.isInteger(p.daily_limit) || Number(p.daily_limit) < 1 || Number(p.daily_limit) > 100000
    || !Number.isInteger(p.daily_budget_units) || Number(p.daily_budget_units) < 1 || Number(p.daily_budget_units) > 100000000
    || !Number.isInteger(p.units_per_request) || Number(p.units_per_request) < 1 || Number(p.units_per_request) > Number(p.daily_budget_units)
    || typeof p.reason !== 'string' || Array.from(p.reason.trim()).length < 5 || Array.from(p.reason.trim()).length > 1000) throw invalid()
  return { enabled: p.enabled, daily_limit: Number(p.daily_limit), daily_budget_units: Number(p.daily_budget_units),
    units_per_request: Number(p.units_per_request), valid_until: timestamp(p.valid_until), reason: p.reason.trim() }
}
function snapshot(value: unknown, tenantId: string): PolicySnapshot {
  const x = object(value)
  if (x.tenant_id !== tenantId || !version(x.revision)) throw unknown()
  if (x.policy === null) { if (x.revision !== 0) throw unknown(); return { revision: 0, policy: null } }
  const p = object(x.policy)
  if (x.revision === 0 || p.tenant_id !== tenantId || p.version !== x.revision) throw unknown()
  return { revision: x.revision, policy: advicePolicy(Object.fromEntries(
    ['enabled', 'daily_limit', 'daily_budget_units', 'units_per_request', 'valid_until', 'reason'].map(k => [k, p[k]]))) }
}
function command(value: unknown): PolicyCommand {
  const x = object(value)
  if (Object.keys(x).sort().join(',') !== 'p_command_id,p_expected_version,p_policy,p_tenant_id'
    || !uuid(x.p_command_id) || !uuid(x.p_tenant_id) || !version(x.p_expected_version)) throw invalid()
  return { p_tenant_id: x.p_tenant_id, p_command_id: x.p_command_id,
    p_expected_version: x.p_expected_version, p_policy: advicePolicy(x.p_policy) }
}
function outcome(value: unknown, c: PolicyCommand): PolicyOutcome {
  const x = object(value)
  if (x.version !== 1 || x.tenant_id !== c.p_tenant_id || x.command_id !== c.p_command_id) throw unknown()
  if (x.state === 'not_found' || x.state === 'cancelled') return { state: x.state, command_id: c.p_command_id }
  if (x.state !== 'succeeded') throw unknown()
  const s = snapshot(x.result, c.p_tenant_id)
  if (s.revision !== c.p_expected_version + 1 || JSON.stringify(s.policy) !== JSON.stringify(c.p_policy)) throw unknown()
  return { state: 'succeeded', command_id: c.p_command_id, snapshot: s }
}
async function locked<T>(key: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    throw new AdvicePolicyError('locking_unavailable', 'Trình duyệt chưa hỗ trợ khóa giữa các tab. Dùng trình duyệt khác để lưu an toàn.')
  }
  return navigator.locks.request(key, { mode: 'exclusive', ...(signal ? { signal } : {}) }, work)
}
function wait<T>(task: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(unknown())
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(task).then(v => { signal.removeEventListener('abort', abort); resolve(v) },
      e => { signal.removeEventListener('abort', abort); reject(e) })
  })
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw unknown()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await wait(reader.read(), signal); if (done) break
      size += value.byteLength; if (size > 32768) throw unknown(); chunks.push(value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } finally { void reader.cancel().catch(() => {}) }
}
export function createAdvicePolicyClient(deps: {
  endpoint: string; publishableKey: string; storage: () => Store;
  getSession: () => Promise<{ data: { session: { access_token: string; user: { id: string } } | null }; error: unknown }>;
  isRuntimeCurrent?: () => boolean; onPendingChange?: () => void; fetch?: typeof fetch; newId?: () => string; lock?: Lock;
}) {
  const endpoint = deps.endpoint.replace(/\/$/, ''), fetcher = deps.fetch ?? fetch
  const current = (c: PolicyContext, o: PolicyOptions = {}) => {
    if (!uuid(c.actorId) || !uuid(c.sessionId) || !uuid(c.tenantId) || !c.runtime || c.runtime.length > 4096
      || o.signal?.aborted || o.isCurrent?.() === false || deps.isRuntimeCurrent?.() === false) throw changed()
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw changed()
  }
  const key = (c: PolicyContext) => {
    current(c)
    return 'roomqc:advice-policy:v1:' + encodeURIComponent(JSON.stringify([c.runtime, c.actorId, c.tenantId]))
  }
  const notify = () => { try { deps.onPendingChange?.() } catch { /* Notification cannot alter a committed receipt. */ } }
  const pending = (c: PolicyContext): Pending | null => {
    current(c)
    try {
      const raw = deps.storage().getItem(key(c)); if (raw === null) return null
      if (!raw || raw.length > 16384) throw storageError()
      const x = object(JSON.parse(raw)), cmd = command(x.command)
      if (Object.keys(x).length !== 4 || x.version !== 1 || x.actorId !== c.actorId || x.runtime !== c.runtime || cmd.p_tenant_id !== c.tenantId) throw storageError()
      return { version: 1, actorId: c.actorId, runtime: c.runtime, command: cmd }
    } catch { throw storageError() }
  }
  async function execute(c: PolicyContext, rpc: string, body: unknown, o: PolicyOptions = {}) {
    const controller = new AbortController(), abort = () => controller.abort(), timer = setTimeout(abort, 20000)
    o.signal?.addEventListener('abort', abort, { once: true })
    const session = async () => {
      const auth = await wait(deps.getSession(), controller.signal); current(c, o)
      if (auth.error || !auth.data.session) throw changed()
      let identity: ReturnType<typeof staffInvitationSession>
      try { identity = staffInvitationSession(auth.data.session) } catch { throw changed() }
      if (identity.actorId !== c.actorId || identity.sessionId !== c.sessionId) throw changed()
      return auth.data.session.access_token
    }
    try {
      current(c, o); const token = await session(); current(c, o)
      const response = await wait(fetcher(`${endpoint}/rest/v1/rpc/${rpc}`, { method: 'POST',
        headers: { apikey: deps.publishableKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal }), controller.signal)
      const data = await boundedJson(response, controller.signal); await session(); current(c, o)
      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw new AdvicePolicyError('permission_denied', 'Phiên hoặc quyền quản trị không còn hiệu lực.')
        if (response.status === 409) throw new AdvicePolicyError(object(data).message === 'ADVICE_POLICY_VERSION_CONFLICT' ? 'version_conflict' : 'command_conflict',
          'Cấu hình đã thay đổi hoặc lần lưu bị xung đột. Kiểm tra lần lưu cũ; bản nháp vẫn được giữ.')
        if (response.status === 400) throw invalid()
        if (response.status === 429) throw new AdvicePolicyError('rate_limited', 'Quá nhiều yêu cầu. Chờ một lúc rồi kiểm tra lần lưu cũ.')
        throw unknown()
      }
      return data
    } catch (e) { current(c, o); if (e instanceof AdvicePolicyError) throw e; throw unknown() }
    finally { clearTimeout(timer); o.signal?.removeEventListener('abort', abort) }
  }
  const finish = (c: PolicyContext, cmd: PolicyCommand, data: unknown) => {
    let result: PolicyOutcome
    try { result = outcome(data, cmd) } catch { throw unknown() }
    if (result.state !== 'not_found') {
      try { if (pending(c)?.command.p_command_id === cmd.p_command_id) deps.storage().removeItem(key(c)) }
      catch { /* A retained record can be recovered again using the same receipt. */ }
      notify()
    }
    return result
  }
  const inLock = <T>(c: PolicyContext, o: PolicyOptions, work: () => Promise<T>) => {
    current(c, o)
    return (deps.lock ?? locked)(key(c), async () => { current(c, o); return work() }, o.signal)
  }
  const existing = (c: PolicyContext) => {
    const item = pending(c); if (!item) throw new AdvicePolicyError('no_pending', 'Không có lần lưu cần kiểm tra. Tải lại cấu hình.')
    return item.command
  }
  return {
    pending,
    read: async (c: PolicyContext, o: PolicyOptions = {}): Promise<PolicySnapshot> => {
      const data = object(await execute(c, 'get_operations_advice_policy', { p_tenant_id: c.tenantId }, o))
      if (data.version !== 1) throw unknown()
      return snapshot(data, c.tenantId)
    },
    save: (c: PolicyContext, policy: AdvicePolicy, expectedVersion: number, o: PolicyOptions = {}) => inLock(c, o, async () => {
      if (pending(c)) throw new AdvicePolicyError('pending_command', 'Có lần lưu chưa xác nhận. Kiểm tra hoặc hủy lần lưu cũ trước.')
      const cmd = command({ p_tenant_id: c.tenantId, p_command_id: (deps.newId ?? (() => crypto.randomUUID()))(),
        p_expected_version: expectedVersion, p_policy: policy })
      const until = Date.parse(cmd.p_policy.valid_until), now = Date.now()
      if (cmd.p_policy.enabled && (until <= now || until > now + 366 * 86400000)) throw invalid()
      const item: Pending = { version: 1, actorId: c.actorId, runtime: c.runtime, command: cmd }, raw = JSON.stringify(item)
      try { const store = deps.storage(); store.setItem(key(c), raw); if (store.getItem(key(c)) !== raw) throw storageError() }
      catch { throw storageError() }
      notify()
      return finish(c, cmd, await execute(c, 'set_operations_advice_policy', cmd, o))
    }),
    lookup: (c: PolicyContext, o: PolicyOptions = {}) => inLock(c, o, async () => {
      const cmd = existing(c)
      return finish(c, cmd, await execute(c, 'get_operations_advice_policy_command', { p_tenant_id: c.tenantId, p_command_id: cmd.p_command_id }, o))
    }),
    retry: (c: PolicyContext, o: PolicyOptions = {}) => inLock(c, o, async () => {
      const cmd = existing(c)
      return finish(c, cmd, await execute(c, 'set_operations_advice_policy', cmd, o))
    }),
    cancel: (c: PolicyContext, o: PolicyOptions = {}) => inLock(c, o, async () => {
      const cmd = existing(c)
      return finish(c, cmd, await execute(c, 'cancel_operations_advice_policy_command', cmd, o))
    }),
  }
}
