import { useEffect, useRef, useState } from 'react'
import { ControlAlertActionError, type ControlAlert, type ControlAlertReceipt } from '@/lib/control-admin'
import { createAlertJournal, type AlertJournalEntry } from '@/lib/control-alert-journal'
import { controlAdminClient, useControlAdminAccess } from './useControlAdmin'

const journal = createAlertJournal(() => window.localStorage)
type View = { scope: string; pending: AlertJournalEntry[]; ready: boolean; busyKey: string | null;
  message: string | null; supportId?: string | null; receipt: ControlAlertReceipt | null; absentKey: string | null }

export function useControlAlerts(onConfirmed: () => unknown) {
  const access = useControlAdminAccess(['alert-actions']), { identity, runtime } = access
  const scope = JSON.stringify([access.scope, access.epoch])
  const [view, setView] = useState<View>({ scope, pending: [], ready: false, busyKey: null, message: null, receipt: null, absentKey: null })
  const running = useRef(false), abort = useRef<AbortController | null>(null)
  const confirmed = useRef(onConfirmed); confirmed.current = onConfirmed
  const current = () => access.current()
  const context = identity ? { ...identity, runtime } : null
  const visible = view.scope === scope && access.enabled
  const refresh = () => {
    if (!context || !current()) return
    try {
      const pending = journal.list(context)
      setView(previous => ({ ...(previous.scope === scope ? previous : { scope, message: null, receipt: null, absentKey: null, busyKey: null }),
        scope, pending, ready: true }))
    } catch (error) {
      setView({ scope, pending: [], ready: false, busyKey: null, message: error instanceof ControlAlertActionError ? error.message : 'Không đọc được yêu cầu đang chờ.', receipt: null, absentKey: null })
    }
  }
  useEffect(() => {
    refresh()
    const reload = () => { if (!running.current) refresh() }
    window.addEventListener('storage', reload)
    return () => { abort.current?.abort(); window.removeEventListener('storage', reload) }
    // scope contains auth/profile/runtime epoch inputs; never preserve another actor's view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  async function run(action: 'create' | 'lookup' | 'retry' | 'dismiss', input: AlertJournalEntry | { alert: ControlAlert; reason: string }) {
    if (!identity || !context || !current() || running.current || !visible || !view.ready) return
    if (action === 'retry' && (!('request' in input) || view.absentKey !== input.request.key)) return
    running.current = true; const controller = new AbortController(); abort.current = controller
    let entry: AlertJournalEntry | null = null
    const options = { signal: controller.signal, isCurrent: current }
    try {
      if ('alert' in input) entry = journal.prepare(context, { target: input.alert.id, expectedVersion: input.alert.rowVersion, reason: input.reason })
      else entry = journal.read(context, input)
      if (!current()) return
      setView({ scope, pending: journal.list(context), ready: true, busyKey: entry.request.key, message: null, receipt: null, absentKey: null })
      if (action === 'dismiss') {
        if (entry.state !== 'not_applied') throw new ControlAlertActionError('outcome_unknown')
        journal.complete(context, entry); if (current()) { refresh(); void confirmed.current() }; return
      }
      if (entry.state !== 'pending') throw new ControlAlertActionError('not_applied')
      let receipt: ControlAlertReceipt
      if (action === 'lookup' || action === 'retry') {
        try { receipt = await controlAdminClient.alertAcknowledgement(identity, entry.request, options) }
        catch (error) {
          if (action !== 'retry' || !(error instanceof ControlAlertActionError) || error.code !== 'result_absent') throw error
          if (!current()) return
          receipt = await controlAdminClient.acknowledgeAlert(identity, entry.request, options)
        }
      } else receipt = await controlAdminClient.acknowledgeAlert(identity, entry.request, options)
      if (!current()) return
      journal.complete(context, entry)
      setView({ scope, pending: journal.list(context), ready: true, busyKey: null,
        message: 'Đã xác nhận nhận xử lý. Cảnh báo chỉ kết thúc khi hệ thống phục hồi; cụm vẫn giữ điều kiện nhận khách hiện tại.', receipt, absentKey: null })
      void confirmed.current()
    } catch (error) {
      if (!current()) return
      const failure = error instanceof ControlAlertActionError ? error : new ControlAlertActionError('outcome_unknown')
      try {
        if (failure.code === 'not_applied' && entry && failure.serverCode) journal.reject(context, entry, failure.serverCode)
        setView({ scope, pending: journal.list(context), ready: true, busyKey: null, message: failure.message, supportId: failure.supportId,
          receipt: null, absentKey: failure.code === 'result_absent' ? entry?.request.key ?? null : null })
      } catch {
        setView({ scope, pending: [], ready: false, busyKey: null, message: new ControlAlertActionError('storage_unavailable').message, receipt: null, absentKey: null })
      }
    } finally {
      running.current = false
      if (abort.current === controller) abort.current = null
      if (current()) setView(previous => previous.scope === scope ? { ...previous, busyKey: null } : previous)
    }
  }
  return { enabled: access.enabled && visible && view.ready, pending: visible ? view.pending : [], busy: visible && view.busyKey !== null,
    message: visible ? view.message : null, supportId: visible ? view.supportId : null, receipt: visible ? view.receipt : null,
    absentKey: visible ? view.absentKey : null, refresh,
    acknowledge: (alert: ControlAlert, reason: string) => run('create', { alert, reason }),
    lookup: (entry: AlertJournalEntry) => run('lookup', entry), retry: (entry: AlertJournalEntry) => run('retry', entry), dismiss: (entry: AlertJournalEntry) => run('dismiss', entry) }
}
