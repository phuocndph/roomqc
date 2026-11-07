import { z } from 'zod'
import { alertRequestSchema, ControlAlertActionError, type ControlAlertRequest, type ControlIdentity } from './control-admin'

export type AlertJournalContext = ControlIdentity & { runtime: string }
const entrySchema = z.object({ version: z.literal(1), actorId: z.string().uuid(), originSessionId: z.string().uuid(), runtime: z.string().min(1).max(8192),
  createdAt: z.string().refine(v => Number.isFinite(Date.parse(v))), request: alertRequestSchema,
  state: z.enum(['pending', 'not_applied']), rejectionCode: z.enum(['VERSION_CONFLICT', 'ALERT_ALREADY_HANDLED', 'ALERT_NOT_FOUND']).nullable() }).strict()
export type AlertJournalEntry = z.infer<typeof entrySchema>
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
const failure = () => new ControlAlertActionError('storage_unavailable')

/** Immutable per-command entries prevent two tabs overwriting each other's unknown outcome. */
export function createAlertJournal(storage: () => Store, newKey = () => crypto.randomUUID()) {
  function prefix(context: AlertJournalContext) {
    if (!z.string().uuid().safeParse(context.actorId).success || !z.string().uuid().safeParse(context.sessionId).success
      || !context.runtime || context.runtime.length > 8192) throw failure()
    return 'roomqc:control-alert:v1:' + encodeURIComponent(context.runtime) + ':' + context.actorId + ':'
  }
  const location = (context: AlertJournalContext, entry: AlertJournalEntry) => prefix(context) + entry.request.key
  function decode(value: string | null, context: AlertJournalContext, key: string) {
    if (!value || value.length > 16000) throw failure()
    let entry: AlertJournalEntry
    try { entry = entrySchema.parse(JSON.parse(value)) } catch { throw failure() }
    if (entry.actorId !== context.actorId || entry.runtime !== context.runtime || key !== location(context, entry)
      || (entry.state === 'pending') !== (entry.rejectionCode === null)) throw failure()
    return entry
  }
  function list(context: AlertJournalContext): AlertJournalEntry[] {
    try {
      const store = storage(), scope = prefix(context), entries: AlertJournalEntry[] = []
      if (store.length > 10000) throw failure()
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i)
        if (!key?.startsWith(scope)) continue
        entries.push(decode(store.getItem(key), context, key))
        if (entries.length > 200) throw failure()
      }
      return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.request.key.localeCompare(b.request.key))
    } catch { throw failure() }
  }
  function assertEntry(context: AlertJournalContext, entry: AlertJournalEntry) {
    const key = location(context, entry), current = decode(storage().getItem(key), context, key)
    if (JSON.stringify(current) !== JSON.stringify(entry)) throw failure()
    return current
  }
  function write(context: AlertJournalContext, entry: AlertJournalEntry) {
    const key = location(context, entry), value = JSON.stringify(entry), store = storage()
    store.setItem(key, value)
    if (store.getItem(key) !== value) throw failure()
  }
  return {
    list,
    prepare(context: AlertJournalContext, request: Omit<ControlAlertRequest, 'key'>): AlertJournalEntry {
      try {
        const existing = list(context).find(entry => entry.request.target === request.target.toLowerCase())
        if (existing) throw new ControlAlertActionError('outcome_unknown')
        const parsed = alertRequestSchema.safeParse({ ...request, key: newKey() })
        if (!parsed.success) throw new ControlAlertActionError('invalid_request')
        const entry: AlertJournalEntry = { version: 1, actorId: context.actorId, originSessionId: context.sessionId, runtime: context.runtime,
          createdAt: new Date().toISOString(), request: parsed.data, state: 'pending', rejectionCode: null }
        // Never replace an existing delivery journal, even if a faulty RNG repeats.
        if (storage().getItem(location(context, entry)) !== null) throw failure()
        write(context, entry); return entry
      } catch (error) { if (error instanceof ControlAlertActionError) throw error; throw failure() }
    },
    read(context: AlertJournalContext, entry: AlertJournalEntry) {
      try { return assertEntry(context, entry) } catch { throw failure() }
    },
    reject(context: AlertJournalContext, entry: AlertJournalEntry, rejectionCode: string): AlertJournalEntry {
      try {
        assertEntry(context, entry)
        const next = entrySchema.parse({ ...entry, state: 'not_applied', rejectionCode })
        write(context, next); return next
      } catch { throw failure() }
    },
    complete(context: AlertJournalContext, entry: AlertJournalEntry) {
      try {
        const key = location(context, entry), store = storage()
        // Another tab may already have confirmed and removed this exact receipt.
        // Verify any existing value before deleting; absence is idempotent success.
        const value = store.getItem(key)
        if (value === null) return
        assertEntry(context, entry); store.removeItem(key)
        if (store.getItem(key) !== null) throw failure()
      } catch { throw failure() }
    },
  }
}
