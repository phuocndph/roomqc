import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from './useUser'
import { supabase } from '@/integrations/supabase/client'
import { runtimeConfig } from '@/lib/runtime-config'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { AuthorityError, createEmployeeAuthorityClient, type AdditionalGrant, type AuthorityConfiguration,
  type AuthorityContext, type AuthorityKind, type HotelGrant, type PendingAuthorityCommand } from '@/lib/employee-authority'
import { toast } from 'sonner'

const pendingEvent = 'roomqc-authority-pending'
export function employeeAuthorityRuntimeScope() {
  return JSON.stringify([runtimeConfig.supabaseUrl, runtimeConfig.workspace?.cluster.id ?? null,
    runtimeConfig.workspace?.workspace.id ?? null, runtimeConfig.workspace?.workspace.tenantId ?? null,
    runtimeConfig.workspace?.workspace.routingVersion ?? null])
}
export function useEmployeeAuthority(targetId?: string, allow = true, targetRevision?: string) {
  const auth = useAuth(), { user } = useUser(), cache = useQueryClient()
  const runtime = employeeAuthorityRuntimeScope(), publicKey = runtimeConfig.supabasePublishableKey
  let context: AuthorityContext | null = null
  try {
    const native = staffInvitationSession(auth.session)
    if (native.actorId === auth.user?.id && user?.id === native.actorId && user.tenant_id
      && user.status === 'active' && !user.account_locked && !user.deleted_at
      && ['tenant_owner', 'manager', 'department_manager'].includes(user.user_level_code)
      && (!runtimeConfig.workspace || runtimeConfig.workspace.workspace.tenantId === user.tenant_id)) {
      context = { ...native, tenantId: user.tenant_id, runtime }
    }
  } catch { /* No retained data or request without a coherent current identity. */ }
  const authority = JSON.stringify([user?.user_level_code, user?.status, user?.account_locked, user?.deleted_at,
    user?.hotel_id, user?.department, user?.position_id, user?.reports_to, user?.updated_at,
    user?.roles?.map(role => role.role).sort()])
  const queryKey = ['employee-authority', runtime, context?.actorId ?? null, context?.sessionId ?? null,
    context?.tenantId ?? null, authority, targetId ?? null, allow, targetRevision ?? null] as const
  const identity = JSON.stringify(queryKey), latest = useRef(identity), epoch = useRef({ identity, value: 0 })
  latest.current = identity
  if (epoch.current.identity !== identity) epoch.current = { identity, value: epoch.current.value + 1 }
  const capturedEpoch = epoch.current.value, mounted = useRef(true), controllers = useRef(new Set<AbortController>())
  const flight = useRef<symbol | null>(null)
  const [busy, setBusy] = useState<{ identity: string; epoch: number } | null>(null)
  const [notice, setNotice] = useState<{ identity: string; epoch: number; message: string } | null>(null)
  const [stored, setStored] = useState<{ identity: string; epoch: number; grants: PendingAuthorityCommand[]; hotels: PendingAuthorityCommand[]; error: string | null } | null>(null)
  const client = useMemo(() => createEmployeeAuthorityClient({ endpoint: runtimeConfig.supabaseUrl, publishableKey: publicKey,
    storage: () => localStorage, getSession: () => supabase.auth.getSession(),
    isRuntimeCurrent: () => runtime === employeeAuthorityRuntimeScope() && publicKey === runtimeConfig.supabasePublishableKey,
    onPendingChange: () => window.dispatchEvent(new Event(pendingEvent)),
  }), [runtime, publicKey])
  const current = () => mounted.current && latest.current === identity && epoch.current.value === capturedEpoch
    && runtime === employeeAuthorityRuntimeScope() && publicKey === runtimeConfig.supabasePublishableKey
  const enabled = allow && !!context && !!targetId && targetId !== context.actorId
  const refreshPending = () => {
    if (!current()) return
    try { setStored({ identity, epoch: capturedEpoch, grants: enabled ? client.pending(context!, targetId!, 'grants') : [],
      hotels: enabled ? client.pending(context!, targetId!, 'hotels') : [], error: null }) }
    catch (error) { setStored({ identity, epoch: capturedEpoch, grants: [], hotels: [], error: error instanceof AuthorityError ? error.message : 'Không thể đọc trạng thái lần lưu trước.' }) }
  }
  useEffect(() => {
    mounted.current = true; flight.current = null
    const active = controllers.current
    refreshPending()
    window.addEventListener('storage', refreshPending); window.addEventListener(pendingEvent, refreshPending)
    return () => {
      mounted.current = false; for (const controller of active) controller.abort(); active.clear()
      window.removeEventListener('storage', refreshPending); window.removeEventListener(pendingEvent, refreshPending)
    }
    // Identity captures actor/session/authority/runtime/target and the epoch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, client])
  const query = useQuery({ queryKey, enabled, retry: false, staleTime: 0,
    queryFn: ({ signal }) => {
      if (!context || !targetId || !current()) throw new AuthorityError('identity_changed', 'Phiên đã thay đổi.')
      return client.read(context, targetId, { signal, isCurrent: current })
    },
  })
  async function run(kind: AuthorityKind, operation: (captured: AuthorityContext, options: { signal: AbortSignal; isCurrent: () => boolean }) => ReturnType<typeof client.recover>) {
    if (!enabled || !context || !current()) throw new AuthorityError('identity_changed', 'Vui lòng kiểm tra lại tài khoản và nhân viên.')
    if (flight.current) throw new AuthorityError('flow_busy', 'Lần lưu trước đang xử lý. Vui lòng chờ.')
    const token = Symbol(), controller = new AbortController(); flight.current = token; controllers.current.add(controller)
    setBusy({ identity, epoch: capturedEpoch })
    try {
      const result = await operation({ ...context }, { signal: controller.signal, isCurrent: current })
      if (!current()) throw new AuthorityError('identity_changed', 'Phiên đã thay đổi.')
      cache.setQueryData<AuthorityConfiguration>(queryKey, before => {
        if (!before) return before
        const grants = result.kind === 'grants' ? result.entries as AdditionalGrant[] : before.grants
        return { ...before, [result.kind]: result.entries, versions: { ...before.versions, [result.kind]: result.version },
          actions: before.actions.map(action => {
            const custom = grants.some(g => g.module === action.module && g.action === action.action && g.enabled)
            return { ...action, custom, effective: custom || action.inherited }
          }) }
      })
      void cache.invalidateQueries({ queryKey })
      for (const key of ['user-hotels', 'user-permissions', 'user-permissions-summary', 'user-permissions-with-source',
        'user-module-permissions', 'route-permission', 'check-permission']) void cache.invalidateQueries({ queryKey: [key] })
      setNotice(null); toast.success(kind === 'grants' ? 'Đã lưu quyền bổ sung' : 'Đã lưu khách sạn và các quyền tương ứng')
      return result
    } catch (error) {
      if (!current()) throw new AuthorityError('identity_changed', 'Phiên đã thay đổi.')
      const safe = error instanceof AuthorityError ? error : new AuthorityError('outcome_unknown', 'Chưa xác nhận được kết quả. Hãy kiểm tra lần lưu trước.')
      setNotice({ identity, epoch: capturedEpoch, message: safe.message }); toast.error(safe.message)
      if (safe.code === 'stale_version' || safe.code === 'command_cancelled') void cache.invalidateQueries({ queryKey })
      throw safe
    } finally {
      controllers.current.delete(controller)
      if (flight.current === token) { flight.current = null; if (current()) { setBusy(null); refreshPending() } }
    }
  }
  const local = stored?.identity === identity && stored.epoch === capturedEpoch ? stored : null
  return {
    scope: JSON.stringify([identity, capturedEpoch]), data: enabled && !query.isError ? query.data : undefined,
    isReady: enabled, isLoading: enabled && query.isLoading, isFetching: enabled && query.isFetching,
    isSaving: busy?.identity === identity && busy.epoch === capturedEpoch, pendingReady: !!local && !local.error,
    pending: { grants: local?.grants ?? [], hotels: local?.hotels ?? [] },
    notice: local?.error ?? (notice?.identity === identity && notice.epoch === capturedEpoch ? notice.message : null)
      ?? (enabled && query.isError ? (query.error instanceof AuthorityError ? query.error.message : 'Không thể tải cấu hình quyền. Vui lòng thử lại.') : null),
    refresh: () => query.refetch(),
    save: (kind: AuthorityKind, values: AdditionalGrant[] | HotelGrant[], expectedVersion: string) => run(kind,
      (captured, options) => client.save(captured, targetId!, kind, values, expectedVersion, options)),
    recover: (kind: AuthorityKind) => run(kind, (captured, options) => client.recover(captured, targetId!, kind, options)),
  }
}
