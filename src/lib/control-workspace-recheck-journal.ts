import { z } from 'zod'
import { workspaceRecheckRequestSchema, ControlRecheckActionError, type ControlWorkspaceRecheckRequest, type ControlIdentity } from './control-admin'

export type WorkspaceRecheckJournalContext = ControlIdentity & { runtime: string }
const entrySchema = z.object({ version: z.literal(1), actorId: z.string().uuid(), originSessionId: z.string().uuid(), runtime: z.string().min(1).max(8192),
  createdAt: z.string().refine(v => Number.isFinite(Date.parse(v))), request: workspaceRecheckRequestSchema,
  state: z.enum(['pending', 'not_applied']), rejectionCode: z.enum(['WORKSPACE_SNAPSHOT_CHANGED', 'WORKSPACE_NOT_FOUND']).nullable() }).strict()
export type WorkspaceRecheckJournalEntry = z.infer<typeof entrySchema>
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
const failure = () => new ControlRecheckActionError('storage_unavailable')

/** A pending workspace recheck retains its exact key and payload until its outcome is known. */
export function createWorkspaceRecheckJournal(storage: () => Store, newKey: () => string = () => crypto.randomUUID()) {
  function prefix(context: WorkspaceRecheckJournalContext) {
    if (!z.string().uuid().safeParse(context.actorId).success || !z.string().uuid().safeParse(context.sessionId).success
      || !context.runtime || context.runtime.length > 8192) throw failure()
    return 'roomqc:control-workspace-recheck:v1:' + encodeURIComponent(context.runtime) + ':' + context.actorId + ':'
  }
  const location = (context: WorkspaceRecheckJournalContext, entry: WorkspaceRecheckJournalEntry) => prefix(context) + entry.request.key
  function decode(value: string | null, context: WorkspaceRecheckJournalContext, key: string) {
    if (!value || value.length > 16000) throw failure()
    let entry: WorkspaceRecheckJournalEntry
    try { entry = entrySchema.parse(JSON.parse(value)) } catch { throw failure() }
    if (entry.actorId !== context.actorId || entry.runtime !== context.runtime || key !== location(context, entry)
      || (entry.state === 'pending') !== (entry.rejectionCode === null)) throw failure()
    return entry
  }
  function list(context: WorkspaceRecheckJournalContext): WorkspaceRecheckJournalEntry[] {
    try {
      const store = storage(), scope = prefix(context), entries: WorkspaceRecheckJournalEntry[] = []
      if (store.length > 10000) throw failure()
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i)
        if (!key?.startsWith(scope)) continue
        entries.push(decode(store.getItem(key), context, key)); if (entries.length > 200) throw failure()
      }
      return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.request.key.localeCompare(b.request.key))
    } catch { throw failure() }
  }
  function assertEntry(context: WorkspaceRecheckJournalContext, entry: WorkspaceRecheckJournalEntry) {
    const key = location(context, entry), current = decode(storage().getItem(key), context, key)
    if (JSON.stringify(current) !== JSON.stringify(entry)) throw failure()
    return current
  }
  function write(context: WorkspaceRecheckJournalContext, entry: WorkspaceRecheckJournalEntry) {
    const key = location(context, entry), value = JSON.stringify(entry), store = storage()
    store.setItem(key, value); if (store.getItem(key) !== value) throw failure()
  }
  return {
    list,
    prepare(context: WorkspaceRecheckJournalContext, request: Omit<ControlWorkspaceRecheckRequest, 'key'>): WorkspaceRecheckJournalEntry {
      try {
        if (list(context).some(entry => entry.request.target === request.target)) throw new ControlRecheckActionError('outcome_unknown')
        const parsed = workspaceRecheckRequestSchema.safeParse({ ...request, key: newKey() })
        if (!parsed.success) throw new ControlRecheckActionError('invalid_request')
        const entry: WorkspaceRecheckJournalEntry = { version: 1, actorId: context.actorId, originSessionId: context.sessionId, runtime: context.runtime,
          createdAt: new Date().toISOString(), request: parsed.data, state: 'pending', rejectionCode: null }
        if (storage().getItem(location(context, entry)) !== null) throw failure()
        write(context, entry); return entry
      } catch (error) { if (error instanceof ControlRecheckActionError) throw error; throw failure() }
    },
    read(context: WorkspaceRecheckJournalContext, entry: WorkspaceRecheckJournalEntry) {
      try { return assertEntry(context, entry) } catch { throw failure() }
    },
    reject(context: WorkspaceRecheckJournalContext, entry: WorkspaceRecheckJournalEntry, rejectionCode: string): WorkspaceRecheckJournalEntry {
      try {
        assertEntry(context, entry)
        const next = entrySchema.parse({ ...entry, state: 'not_applied', rejectionCode }); write(context, next); return next
      } catch { throw failure() }
    },
    complete(context: WorkspaceRecheckJournalContext, entry: WorkspaceRecheckJournalEntry) {
      try {
        const key = location(context, entry), store = storage()
        if (store.getItem(key) === null) return
        assertEntry(context, entry); store.removeItem(key); if (store.getItem(key) !== null) throw failure()
      } catch { throw failure() }
    },
  }
}
