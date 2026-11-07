import { useEffect, useRef, useState } from 'react'
import { ControlRecheckActionError, type ControlWorkspaceRecheckRequest, type ControlWorkspaceRecheckReceipt } from '@/lib/control-admin'
import { createWorkspaceRecheckJournal, type WorkspaceRecheckJournalEntry } from '@/lib/control-workspace-recheck-journal'
import { controlAdminClient, useControlAdminAccess } from './useControlAdmin'

const journal = createWorkspaceRecheckJournal(() => window.localStorage)
type View = { scope: string; pending: WorkspaceRecheckJournalEntry[]; ready: boolean; busyKey: string | null;
  message: string | null; supportId?: string | null; receipt: ControlWorkspaceRecheckReceipt | null; absentKey: string | null }

export function useControlWorkspaceRecheck(target: string, onConfirmed: () => unknown) {
  const access = useControlAdminAccess(['workspace-recheck-actions', target]), { identity, runtime } = access
  const scope = JSON.stringify([access.scope, access.epoch])
  const [view, setView] = useState<View>({ scope, pending: [], ready: false, busyKey: null, message: null, receipt: null, absentKey: null })
  const running = useRef(false), abort = useRef<AbortController | null>(null)
  const confirmed = useRef(onConfirmed); confirmed.current = onConfirmed
  const current = () => access.current(), context = identity ? { ...identity, runtime } : null
  const visible = view.scope === scope && access.enabled
  const refresh = () => {
    if (!context || !current()) return
    try {
      const pending = journal.list(context)
      setView(previous => ({ ...(previous.scope === scope ? previous : { scope, message: null, receipt: null, absentKey: null, busyKey: null }),
        scope, pending, ready: true }))
    } catch {
      setView({ scope, pending: [], ready: false, busyKey: null, message: new ControlRecheckActionError('storage_unavailable').message, receipt: null, absentKey: null })
    }
  }
  useEffect(() => {
    refresh()
    const reload = () => { if (!running.current) refresh() }
    window.addEventListener('storage', reload)
    return () => { abort.current?.abort(); window.removeEventListener('storage', reload) }
    // scope includes target, auth/profile/runtime and epoch; stale callbacks cannot cross it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  async function run(action: 'create' | 'lookup' | 'retry' | 'dismiss', input: WorkspaceRecheckJournalEntry | { command: Omit<ControlWorkspaceRecheckRequest, 'key'> }) {
    if (!identity || !context || !current() || running.current || !visible || !view.ready) return
    if (action === 'retry' && (!('request' in input) || view.absentKey !== input.request.key)) return
    if ('command' in input && input.command.target !== target) return
    running.current = true; const controller = new AbortController(); abort.current = controller
    let entry: WorkspaceRecheckJournalEntry | null = null
    const options = { signal: controller.signal, isCurrent: current }
    try {
      entry = 'command' in input ? journal.prepare(context, input.command) : journal.read(context, input)
      if (!current()) return
      setView({ scope, pending: journal.list(context), ready: true, busyKey: entry.request.key, message: null, receipt: null, absentKey: null })
      if (action === 'dismiss') {
        if (entry.state !== 'not_applied') throw new ControlRecheckActionError('outcome_unknown')
        journal.complete(context, entry); if (current()) { refresh(); void confirmed.current() }; return
      }
      if (entry.state !== 'pending') throw new ControlRecheckActionError('not_applied')
      let receipt: ControlWorkspaceRecheckReceipt
      if (action === 'lookup' || action === 'retry') {
        try { receipt = await controlAdminClient.recheckWorkspace(identity, entry.request, true, options) }
        catch (error) {
          if (action !== 'retry' || !(error instanceof ControlRecheckActionError) || error.code !== 'result_absent') throw error
          if (!current()) return
          receipt = await controlAdminClient.recheckWorkspace(identity, entry.request, false, options)
        }
      } else receipt = await controlAdminClient.recheckWorkspace(identity, entry.request, false, options)
      if (!current()) return
      journal.complete(context, entry)
      setView({ scope, pending: journal.list(context), ready: true, busyKey: null, receipt, absentKey: null,
        message: 'Đã xác nhận kết quả yêu cầu kiểm tra. Xem trạng thái đăng ký đã tải lại để biết khách cần làm gì tiếp.' })
      void confirmed.current()
    } catch (error) {
      if (!current()) return
      const failure = error instanceof ControlRecheckActionError ? error : new ControlRecheckActionError('outcome_unknown')
      try {
        if (failure.code === 'not_applied' && entry && failure.serverCode) journal.reject(context, entry, failure.serverCode)
        setView({ scope, pending: journal.list(context), ready: true, busyKey: null, message: failure.message, supportId: failure.supportId,
          receipt: null, absentKey: failure.code === 'result_absent' ? entry?.request.key ?? null : null })
      } catch {
        setView({ scope, pending: [], ready: false, busyKey: null, message: new ControlRecheckActionError('storage_unavailable').message, receipt: null, absentKey: null })
      }
    } finally {
      running.current = false; if (abort.current === controller) abort.current = null
      if (current()) setView(previous => previous.scope === scope ? { ...previous, busyKey: null } : previous)
    }
  }
  return { scope, enabled: access.enabled && visible && view.ready, pending: visible ? view.pending : [], busy: visible && view.busyKey !== null,
    message: visible ? view.message : null, supportId: visible ? view.supportId : null, receipt: visible ? view.receipt : null,
    absentKey: visible ? view.absentKey : null, refresh,
    execute: (request: Omit<ControlWorkspaceRecheckRequest, 'key'>) => run('create', { command: request }),
    lookup: (entry: WorkspaceRecheckJournalEntry) => run('lookup', entry), retry: (entry: WorkspaceRecheckJournalEntry) => run('retry', entry), dismiss: (entry: WorkspaceRecheckJournalEntry) => run('dismiss', entry) }
}
