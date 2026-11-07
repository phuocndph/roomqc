import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUser } from './useUser'
import { supabase } from '@/integrations/supabase/client'
import { runtimeConfig } from '@/lib/runtime-config'
import { workspacePath } from '@/lib/workspace'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { staffInvitationRuntimeScope } from '@/lib/staff-invitation-client'
import { createInvitationAdminClient, InvitationAdminError, type InvitationAdminContext,
  type InvitationAdminRow, type InvitationDraft, type InvitationPageCursor } from '@/lib/staff-invitation-admin'
import { toast } from 'sonner'

export function useStaffInvitationAdmin(includeList = true) {
  const auth = useAuth(), { user } = useUser(), hotel = useHotelContext(), cache = useQueryClient()
  const scope = staffInvitationRuntimeScope(), key = runtimeConfig.supabasePublishableKey
  let context: InvitationAdminContext | null = null
  try {
    const native = staffInvitationSession(auth.session)
    if (native.actorId === auth.user?.id && user?.id === native.actorId && user.tenant_id
      && (!runtimeConfig.workspace || runtimeConfig.workspace.workspace.tenantId === user.tenant_id)
      && user.status === 'active' && !user.account_locked && !user.deleted_at) {
      context = { ...native, tenantId: user.tenant_id }
    }
  } catch { /* No request or retained data without exact native context. */ }
  const canManage = !!context && ['tenant_owner', 'manager', 'department_manager'].includes(user?.user_level_code ?? '')
  const hotelId = hotel.isAllHotelsMode ? null : hotel.selectedHotel?.id ?? null
  const authority = JSON.stringify([user?.user_level_code, user?.hotel_id, user?.position_id,
    user?.reports_to, user?.department, user?.status, user?.account_locked, user?.deleted_at])
  const baseKey = ['staff-invitations', scope, context?.actorId ?? null, context?.sessionId ?? null,
    context?.tenantId ?? null, hotel.isAllHotelsMode ? 'all' : hotelId, authority] as const
  const baseIdentity = JSON.stringify(baseKey)
  const [paging, setPaging] = useState<{ identity: string; trail: InvitationPageCursor[] }>({ identity: baseIdentity, trail: [] })
  if (paging.identity !== baseIdentity) setPaging({ identity: baseIdentity, trail: [] })
  const trail = paging.identity === baseIdentity ? paging.trail : []
  const after = trail.at(-1) ?? null
  const queryKey = [...baseKey, after] as const
  const identity = JSON.stringify(queryKey)
  const latest = useRef(identity); latest.current = identity
  const epoch = useRef({ identity, version: 0 })
  if (epoch.current.identity !== identity) epoch.current = { identity, version: epoch.current.version + 1 }
  const version = epoch.current.version
  const mounted = useRef(true), controllers = useRef(new Set<AbortController>()), flight = useRef<symbol | null>(null)
  const [busy, setBusy] = useState<{ identity: string; id: string } | null>(null)
  const [notice, setNotice] = useState<{ identity: string; text: string } | null>(null)
  const client = useMemo(() => createInvitationAdminClient({
    endpoint: runtimeConfig.supabaseUrl, publishableKey: key, path: workspacePath('/auth/accept-invite'),
    getSession: () => supabase.auth.getSession(),
    isRuntimeCurrent: () => scope === staffInvitationRuntimeScope() && key === runtimeConfig.supabasePublishableKey,
  }), [scope, key])
  useEffect(() => {
    mounted.current = true
    const active = controllers.current
    return () => { mounted.current = false; for (const controller of active) controller.abort(); active.clear() }
  }, [identity])
  const isCurrent = () => mounted.current && latest.current === identity && epoch.current.version === version && scope === staffInvitationRuntimeScope()
    && key === runtimeConfig.supabasePublishableKey
  const enabled = includeList && canManage && (hotel.isAllHotelsMode || !!hotelId)
  const query = useQuery({
    queryKey, enabled, retry: false, staleTime: 0,
    queryFn: ({ signal }) => {
      if (!context || !isCurrent()) throw new InvitationAdminError('identity_changed', 'Phiên đã thay đổi.')
      return client.listPage(context, hotelId, after, { signal, isCurrent })
    },
  })
  const invalidateCaptured = () => cache.invalidateQueries({ predicate: q =>
    q.queryKey[0] === 'staff-invitations' && q.queryKey[1] === scope
    && q.queryKey[2] === context?.actorId && q.queryKey[3] === context?.sessionId
    && q.queryKey[4] === context?.tenantId })
  async function run<T>(id: string, operation: (captured: InvitationAdminContext, options: { signal: AbortSignal; isCurrent: () => boolean }) => Promise<T>): Promise<T> {
    if (!context || !canManage || !isCurrent()) throw new InvitationAdminError('identity_changed', 'Vui lòng đăng nhập lại để quản lý lời mời.')
    if (flight.current) throw new InvitationAdminError('flow_busy', 'Thao tác trước đang xử lý. Vui lòng chờ.')
    const captured = { ...context }, token = Symbol(), controller = new AbortController()
    flight.current = token; controllers.current.add(controller); setBusy({ identity, id })
    try {
      const result = await operation(captured, { signal: controller.signal, isCurrent })
      if (!isCurrent()) throw new InvitationAdminError('identity_changed', 'Phiên đã thay đổi.')
      await invalidateCaptured()
      if (!isCurrent()) throw new InvitationAdminError('identity_changed', 'Phiên đã thay đổi.')
      setNotice(null)
      toast.success(id === 'create' ? 'Đã gửi lời mời. Nhân viên sẽ tự đặt mật khẩu để tham gia.'
        : id.startsWith('revoke:') ? 'Đã thu hồi lời mời' : 'Đã gửi lại lời mời')
      return result
    } catch (error) {
      if (!isCurrent()) throw new InvitationAdminError('identity_changed', 'Phiên đã thay đổi.')
      const safe = error instanceof InvitationAdminError ? error : new InvitationAdminError('outcome_unknown', 'Chưa xác nhận được kết quả. Hãy kiểm tra danh sách lời mời.')
      if (safe.code !== 'identity_changed' && safe.code !== 'flow_busy') {
        setNotice({ identity, text: safe.message }); toast.error(safe.message)
        // Read back only; never replay a send/revoke after transport uncertainty.
        void invalidateCaptured()
      }
      throw safe
    } finally {
      controllers.current.delete(controller)
      if (flight.current === token) { flight.current = null; if (isCurrent()) setBusy(null) }
    }
  }
  return {
    scope: identity, canManage, isReady: enabled, data: enabled ? query.data?.rows ?? [] : [],
    isLoading: enabled && query.isLoading, isError: enabled && query.isError,
    isFetching: enabled && query.isFetching,
    busyId: busy?.identity === identity ? busy.id : null,
    notice: notice?.identity === identity ? notice.text : null,
    page: trail.length + 1, hasPrevious: enabled && trail.length > 0,
    hasNext: enabled && !!query.data?.nextCursor,
    next: () => {
      if (!enabled || !isCurrent() || flight.current || query.isFetching || query.isError || !query.data?.nextCursor) return
      setPaging({ identity: baseIdentity, trail: [...trail, query.data.nextCursor] })
    },
    previous: () => {
      if (!enabled || !isCurrent() || flight.current || query.isFetching || !trail.length) return
      setPaging({ identity: baseIdentity, trail: trail.slice(0, -1) })
    },
    refresh: () => {
      if (flight.current || !isCurrent()) return Promise.resolve()
      if (trail.length) { setPaging({ identity: baseIdentity, trail: [] }); return Promise.resolve() }
      return query.refetch()
    },
    create: (draft: InvitationDraft) => run('create', (captured, options) => client.create(captured, { ...draft }, options)),
    act: (target: InvitationAdminRow, action: 'resend' | 'revoke') => {
      // Only a row from the currently selected, verified list may dispatch.
      if (!enabled || query.isError || query.isFetching || !query.data?.rows.some(row => row.id === target.id && JSON.stringify(row) === JSON.stringify(target))) {
        return Promise.reject(new InvitationAdminError('identity_changed', 'Danh sách lời mời đã thay đổi. Vui lòng tải lại.'))
      }
      return run(action + ':' + target.id, (captured, options) => client.act(captured, { ...target }, action, options))
    },
  }
}
