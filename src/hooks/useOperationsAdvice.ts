import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from './useUser'
import { useHasPermission } from './usePermission'
import { useReportScope } from './useReportScope'
import { supabase } from '@/integrations/supabase/client'
import { runtimeConfig } from '@/lib/runtime-config'
import { roomCommandRuntimeScope } from '@/lib/room-transition-client'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { AdviceClientError, createOperationsAdviceClient, type AdviceContext, type AdviceReceipt, type PendingAdvice } from '@/lib/operations-advice-client'
import type { OperationsInsightsData } from './useOperationsInsights'

const pendingEvent = 'roomqc-operations-advice-pending'
type Action = 'generate' | 'lookup' | 'resume' | 'cancel' | 'close'
export function useOperationsAdvice(insights: OperationsInsightsData | undefined) {
  const auth = useAuth(), { tenantId } = useUser(), permission = useHasPermission('reports', 'view')
  const start = insights ? format(insights.dateRange.start, 'yyyy-MM-dd') : '', end = insights ? format(insights.dateRange.end, 'yyyy-MM-dd') : ''
  const timezone = insights?.recognitionTimezone ?? ''
  // A source refresh may invalidate displayed advice, but never creates a request.
  const selection = useReportScope('advice:' + JSON.stringify(insights)), runtime = roomCommandRuntimeScope()
  const target = { start, end, hotel: selection.hotelId ?? null, timezone }
  let context: AdviceContext | null = null
  try {
    const native = staffInvitationSession(auth.session)
    if (tenantId && native.actorId === auth.user?.id && (!runtimeConfig.workspace || runtimeConfig.workspace.workspace.tenantId === tenantId)) {
      context = { ...native, tenantId, runtime }
    }
  } catch { /* Incomplete identity cannot send or recover advice. */ }
  const enabled = !!insights && selection.enabled && !!context && permission.hasPermission === true && !permission.isLoading
  const publicKey = runtimeConfig.supabasePublishableKey, identity = JSON.stringify([selection.key, enabled, publicKey])
  const latest = useRef({ identity, epoch: 0 })
  if (latest.current.identity !== identity) latest.current = { identity, epoch: latest.current.epoch + 1 }
  const epoch = latest.current.epoch, scope = JSON.stringify([identity, epoch]), mounted = useRef(true)
  const controllers = useRef(new Set<AbortController>()), flight = useRef<symbol | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ scope: string; text: string } | null>(null)
  const [stored, setStored] = useState<{ scope: string; item: PendingAdvice | null; error: string | null } | null>(null)
  const [outcome, setOutcome] = useState<{ scope: string; receipt: AdviceReceipt } | null>(null)
  const current = () => enabled && mounted.current && latest.current.identity === identity && latest.current.epoch === epoch
    && runtime === roomCommandRuntimeScope() && publicKey === runtimeConfig.supabasePublishableKey
  const client = useMemo(() => createOperationsAdviceClient({ endpoint: runtimeConfig.supabaseUrl, publishableKey: publicKey,
    storage: () => localStorage, getSession: () => supabase.auth.getSession(),
    isRuntimeCurrent: () => runtime === roomCommandRuntimeScope() && publicKey === runtimeConfig.supabasePublishableKey,
    onPendingChange: () => window.dispatchEvent(new Event(pendingEvent)),
  }), [runtime, publicKey])
  const refreshPending = () => {
    if (!current() || !context) return
    try {
      const item = client.pending(context, target); setStored({ scope, item, error: null })
      if (item) setOutcome(previous => previous?.scope === scope && previous.receipt.command_id !== item.request.command_id ? null : previous)
    } catch (e) { setStored({ scope, item: null, error: e instanceof Error ? e.message : 'Không thể đọc yêu cầu trước.' }) }
  }
  useEffect(() => {
    mounted.current = true; flight.current = null
    const active = controllers.current
    refreshPending()
    const external = (event: StorageEvent) => {
      if (event.key && !event.key.startsWith('roomqc:operations-advice:v1:')) return
      if (current()) setOutcome(null)
      refreshPending()
    }
    window.addEventListener('storage', external); window.addEventListener(pendingEvent, refreshPending)
    return () => {
      mounted.current = false; for (const controller of active) controller.abort(); active.clear()
      window.removeEventListener('storage', external); window.removeEventListener(pendingEvent, refreshPending)
    }
    // Scope includes the source, authority and identity epoch. Callbacks must retain their captured identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, client])
  async function run(action: Action) {
    if (!context || !current()) throw new AdviceClientError('identity_changed', 'Phiên hoặc quyền tư vấn đã thay đổi.')
    if (flight.current) throw new AdviceClientError('flow_busy', 'Yêu cầu đang được xử lý. Vui lòng chờ.')
    const token = Symbol(), controller = new AbortController(); flight.current = token; controllers.current.add(controller)
    setBusy(scope); setNotice(null); setOutcome(null)
    try {
      const receipt = await client[action]({ ...context }, target, { signal: controller.signal, isCurrent: current })
      if (!current()) throw new AdviceClientError('identity_changed', 'Phiên hoặc phạm vi tư vấn đã thay đổi.')
      setOutcome({ scope, receipt }); return receipt
    } catch (e) {
      if (!current()) throw new AdviceClientError('identity_changed', 'Phiên hoặc phạm vi tư vấn đã thay đổi.')
      const safe = e instanceof AdviceClientError ? e : new AdviceClientError('outcome_unknown', 'Chưa xác nhận được kết quả. Hãy kiểm tra yêu cầu cũ.')
      setNotice({ scope, text: safe.message }); throw safe
    } finally {
      controllers.current.delete(controller)
      if (flight.current === token) { flight.current = null; if (current()) { setBusy(null); refreshPending() } }
    }
  }
  const local = enabled && stored?.scope === scope ? stored : null
  const receipt = enabled && outcome?.scope === scope ? outcome.receipt : null
  return {
    scope, scopeEnabled: enabled, isBusy: busy === scope && enabled,
    pendingReady: !!local && !local.error, pending: local?.item ?? null, receipt,
    data: receipt?.state === 'completed' ? receipt.advice ?? [] : [],
    notice: enabled ? local?.error ?? (notice?.scope === scope ? notice.text : null) : null,
    generate: () => run('generate'), lookup: () => run('lookup'), resume: () => run('resume'), cancel: () => run('cancel'), close: () => run('close'),
  }
}
