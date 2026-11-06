import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from './useUser'
import { useReportScope } from './useReportScope'
import { supabase } from '@/integrations/supabase/client'
import { runtimeConfig } from '@/lib/runtime-config'
import { roomCommandRuntimeScope } from '@/lib/room-transition-client'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { createReportTargetClient, TargetError, type PendingTargetCommand, type TargetContext, type TargetKind } from '@/lib/report-targets'
import { toast } from 'sonner'

const pendingEvent = 'roomqc-report-targets-pending'
export function useReportTargets(kind: TargetKind, month: string, allow = true) {
  const auth = useAuth(), { tenantId } = useUser(), cache = useQueryClient()
  const selection = useReportScope(`targets:${kind}:${month}`), runtime = roomCommandRuntimeScope()
  const target = { kind, month, hotelId: selection.hotelId ?? null }
  let context: TargetContext | null = null
  try {
    const native = staffInvitationSession(auth.session)
    if (tenantId && native.actorId === auth.user?.id && (!runtimeConfig.workspace || runtimeConfig.workspace.workspace.tenantId === tenantId)) {
      context = { ...native, tenantId, runtime }
    }
  } catch { /* Incomplete identity cannot read or recover commands. */ }
  const enabled = allow && selection.enabled && !!context && (kind !== 'monthly' || !!target.hotelId)
  const identity = JSON.stringify([selection.key, enabled, runtimeConfig.supabasePublishableKey])
  const latest = useRef({ identity, epoch: 0 })
  if (latest.current.identity !== identity) latest.current = { identity, epoch: latest.current.epoch + 1 }
  const epoch = latest.current.epoch, mounted = useRef(true), controllers = useRef(new Set<AbortController>())
  const flight = useRef<symbol | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ scope: string; text: string } | null>(null)
  const [stored, setStored] = useState<{ scope: string; items: PendingTargetCommand[]; error: string | null } | null>(null)
  const scope = JSON.stringify([identity, epoch]), publicKey = runtimeConfig.supabasePublishableKey
  const current = () => enabled && mounted.current && latest.current.identity === identity && latest.current.epoch === epoch
    && runtime === roomCommandRuntimeScope() && publicKey === runtimeConfig.supabasePublishableKey
  const queryKey = ['report-targets', ...selection.key, epoch] as const
  const client = useMemo(() => createReportTargetClient({ endpoint: runtimeConfig.supabaseUrl, publishableKey: publicKey,
    storage: () => localStorage, getSession: () => supabase.auth.getSession(),
    isRuntimeCurrent: () => runtime === roomCommandRuntimeScope() && publicKey === runtimeConfig.supabasePublishableKey,
    onPendingChange: () => window.dispatchEvent(new Event(pendingEvent)),
  }), [runtime, publicKey])
  const refreshPending = () => {
    if (!current() || !context) return
    try { setStored({ scope, items: client.pending(context, target), error: null }) }
    catch (error) { setStored({ scope, items: [], error: error instanceof TargetError ? error.message : 'Không thể đọc lần lưu trước.' }) }
  }
  useEffect(() => {
    mounted.current = true; flight.current = null
    const active = controllers.current
    refreshPending()
    window.addEventListener('storage', refreshPending); window.addEventListener(pendingEvent, refreshPending)
    return () => {
      mounted.current = false; for (const c of active) c.abort(); active.clear()
      window.removeEventListener('storage', refreshPending); window.removeEventListener(pendingEvent, refreshPending)
    }
    // Context, target and epoch are represented by scope. Old handlers must retain their identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, client])
  const query = useQuery({ queryKey, enabled, retry: false, staleTime: 0, gcTime: 0,
    queryFn: async ({ signal }) => {
      const assertCurrent = selection.capture()
      if (!context || !current()) throw new TargetError('identity_changed', 'Phiên đã thay đổi.')
      const report = await client.read(context, target, { signal, isCurrent: current }); assertCurrent(); return report
    },
  })
  async function run(operation: (captured: TargetContext, options: { signal: AbortSignal; isCurrent: () => boolean }) => ReturnType<typeof client.recover>) {
    if (!context || !current()) throw new TargetError('identity_changed', 'Phiên đã thay đổi.')
    if (flight.current) throw new TargetError('flow_busy', 'Lần lưu trước đang xử lý. Vui lòng chờ.')
    const token = Symbol(), controller = new AbortController(); flight.current = token; controllers.current.add(controller)
    setBusy(scope)
    try {
      const result = await operation({ ...context }, { signal: controller.signal, isCurrent: current })
      if (!current()) throw new TargetError('identity_changed', 'Phiên đã thay đổi.')
      // A receipt is historical. Refetch current configuration instead of caching its old report.
      void cache.invalidateQueries({ queryKey: ['report-targets'] })
      for (const prefix of ['operations-insights', 'overview-kpi-strip', 'monthly-target', 'financial-targets']) {
        void cache.invalidateQueries({ queryKey: [prefix] })
      }
      setNotice(null); toast.success(result.state === 'completed' ? 'Đã xác nhận lưu mục tiêu' : 'Đã hủy lần lưu chưa áp dụng. Mục tiêu được giữ nguyên.')
      return result
    } catch (error) {
      if (!current()) throw new TargetError('identity_changed', 'Phiên đã thay đổi.')
      const safe = error instanceof TargetError ? error : new TargetError('outcome_unknown', 'Chưa xác nhận kết quả. Kiểm tra lần lưu trước.')
      setNotice({ scope, text: safe.message }); toast.error(safe.message)
      if (['permission_denied', 'stale_revision', 'command_conflict'].includes(safe.code)) void cache.invalidateQueries({ queryKey })
      throw safe
    } finally {
      controllers.current.delete(controller)
      if (flight.current === token) { flight.current = null; if (current()) { setBusy(null); refreshPending() } }
    }
  }
  const local = stored?.scope === scope ? stored : null
  const data = enabled && !query.isError && query.isFetchedAfterMount ? query.data : undefined
  const error = enabled ? query.error : null
  return {
    ...query, data, error, scope, scopeEnabled: enabled, isCurrent: current,
    isPending: enabled && (query.isPending || !query.isFetchedAfterMount), isSaving: busy === scope,
    pendingReady: !!local && !local.error, pending: local?.items ?? [],
    notice: local?.error ?? (notice?.scope === scope ? notice.text : null)
      ?? (error ? error instanceof TargetError ? error.message : 'Không thể tải mục tiêu. Vui lòng thử lại.' : null),
    save: (values: Record<string, number>, expectedRevision: string, resolveLegacy = false) => run(
      (captured, options) => client.save(captured, target, values, expectedRevision, resolveLegacy, options)),
    recover: () => run((captured, options) => client.recover(captured, target, options)),
    cancel: () => run((captured, options) => client.cancel(captured, target, options)),
  }
}
