import { z } from 'zod'
import { clusterRequestSchema, ControlClusterActionError, type ControlClusterCommand, type ControlIdentity } from './control-admin'

export type ClusterJournalContext = ControlIdentity & { runtime: string }
const entrySchema = z.object({ version: z.literal(1), actorId: z.string().uuid(), originSessionId: z.string().uuid(), runtime: z.string().min(1).max(8192),
  createdAt: z.string().refine(v => Number.isFinite(Date.parse(v))), request: clusterRequestSchema,
  state: z.enum(['pending', 'not_applied']), rejectionCode: z.enum(['VERSION_CONFLICT', 'ADMISSION_BLOCKED', 'CLUSTER_NOT_FOUND', 'CLUSTER_ALREADY_REGISTERED', 'INVENTORY_REQUIRED', 'INVALID_COMMAND', 'DEPLOYMENT_QUEUE_BLOCKED', 'DEPLOYMENT_SPEC_UNAVAILABLE']).nullable() }).strict()
export type ClusterJournalEntry = z.infer<typeof entrySchema>
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
const failure = () => new ControlClusterActionError('storage_unavailable')

/** A pending cluster command blocks another operation on that target until its outcome is known. */
export function createClusterJournal(storage: () => Store, newKey = () => crypto.randomUUID()) {
  function prefix(context: ClusterJournalContext) {
    if (!z.string().uuid().safeParse(context.actorId).success || !z.string().uuid().safeParse(context.sessionId).success
      || !context.runtime || context.runtime.length > 8192) throw failure()
    return 'roomqc:control-cluster:v1:' + encodeURIComponent(context.runtime) + ':' + context.actorId + ':'
  }
  const location = (context: ClusterJournalContext, entry: ClusterJournalEntry) => prefix(context) + entry.request.key
  function decode(value: string | null, context: ClusterJournalContext, key: string) {
    if (!value || value.length > 16000) throw failure()
    let entry: ClusterJournalEntry
    try { entry = entrySchema.parse(JSON.parse(value)) } catch { throw failure() }
    if (entry.actorId !== context.actorId || entry.runtime !== context.runtime || key !== location(context, entry)
      || (entry.state === 'pending') !== (entry.rejectionCode === null)) throw failure()
    return entry
  }
  function list(context: ClusterJournalContext): ClusterJournalEntry[] {
    try {
      const store = storage(), scope = prefix(context), entries: ClusterJournalEntry[] = []
      if (store.length > 10000) throw failure()
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i)
        if (!key?.startsWith(scope)) continue
        entries.push(decode(store.getItem(key), context, key)); if (entries.length > 200) throw failure()
      }
      return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.request.key.localeCompare(b.request.key))
    } catch { throw failure() }
  }
  function assertEntry(context: ClusterJournalContext, entry: ClusterJournalEntry) {
    const key = location(context, entry), current = decode(storage().getItem(key), context, key)
    if (JSON.stringify(current) !== JSON.stringify(entry)) throw failure()
    return current
  }
  function write(context: ClusterJournalContext, entry: ClusterJournalEntry) {
    const key = location(context, entry), value = JSON.stringify(entry), store = storage()
    store.setItem(key, value); if (store.getItem(key) !== value) throw failure()
  }
  return {
    list,
    prepare(context: ClusterJournalContext, request: ControlClusterCommand): ClusterJournalEntry {
      try {
        if (list(context).some(entry => entry.request.target === request.target)) throw new ControlClusterActionError('outcome_unknown')
        const parsed = clusterRequestSchema.safeParse({ ...request, key: newKey() })
        if (!parsed.success) throw new ControlClusterActionError('invalid_request')
        const entry: ClusterJournalEntry = { version: 1, actorId: context.actorId, originSessionId: context.sessionId, runtime: context.runtime,
          createdAt: new Date().toISOString(), request: parsed.data, state: 'pending', rejectionCode: null }
        if (storage().getItem(location(context, entry)) !== null) throw failure()
        write(context, entry); return entry
      } catch (error) { if (error instanceof ControlClusterActionError) throw error; throw failure() }
    },
    read(context: ClusterJournalContext, entry: ClusterJournalEntry) {
      try { return assertEntry(context, entry) } catch { throw failure() }
    },
    reject(context: ClusterJournalContext, entry: ClusterJournalEntry, rejectionCode: string): ClusterJournalEntry {
      try {
        assertEntry(context, entry)
        const next = entrySchema.parse({ ...entry, state: 'not_applied', rejectionCode }); write(context, next); return next
      } catch { throw failure() }
    },
    complete(context: ClusterJournalContext, entry: ClusterJournalEntry) {
      try {
        const key = location(context, entry), store = storage()
        if (store.getItem(key) === null) return
        assertEntry(context, entry); store.removeItem(key); if (store.getItem(key) !== null) throw failure()
      } catch { throw failure() }
    },
  }
}
