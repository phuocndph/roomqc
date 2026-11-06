import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/hooks/useUser'
import { isSuperAdmin } from '@/lib/userAccess'
import { supabase } from '@/integrations/supabase/client'
import { runtimeConfig } from '@/lib/runtime-config'
import { roomCommandRuntimeScope } from '@/lib/room-transition-client'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { AdvicePolicyError, createAdvicePolicyClient, type AdvicePolicy, type PolicyContext, type PolicyOptions } from '@/lib/advice-policy'

const event = 'roomqc-advice-policy-pending'
export function useAdvicePolicy(tenantId: string, allow = true) {
  const auth = useAuth(), profile = useUser(), cache = useQueryClient()
  const runtime = roomCommandRuntimeScope(), publicKey = runtimeConfig.supabasePublishableKey
  let context: PolicyContext | null = null
  try {
    const identity = staffInvitationSession(auth.session)
    if (identity.actorId === auth.user?.id && profile.user?.id === identity.actorId) context = { ...identity, tenantId, runtime }
  } catch { /* A partial session cannot manage policy. */ }
  const enabled = allow && !auth.loading && !profile.isLoading && isSuperAdmin(profile.user) && !!context
    && profile.user.status === 'active' && !profile.user.account_locked && !profile.user.deleted_at
  const identity = JSON.stringify([enabled, runtime, publicKey, context?.actorId, context?.sessionId, tenantId,
    profile.user?.updated_at, profile.user?.roles, profile.user?.user_level_code])
  const latest = useRef({ identity, epoch: 0 })
  if (latest.current.identity !== identity) latest.current = { identity, epoch: latest.current.epoch + 1 }
  const epoch = latest.current.epoch, scope = JSON.stringify([identity, epoch])
  const mounted = useRef(true), controllers = useRef(new Set<AbortController>()), flight = useRef<symbol | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [stored, setStored] = useState<{ scope: string; item: ReturnType<ReturnType<typeof createAdvicePolicyClient>['pending']>; error: string | null } | null>(null)
  const [notice, setNotice] = useState<{ scope: string; text: string } | null>(null)
  const current = () => enabled && mounted.current && latest.current.identity === identity && latest.current.epoch === epoch
    && runtime === roomCommandRuntimeScope() && publicKey === runtimeConfig.supabasePublishableKey
  const client = useMemo(() => createAdvicePolicyClient({ endpoint: runtimeConfig.supabaseUrl, publishableKey: publicKey,
    storage: () => localStorage, getSession: () => supabase.auth.getSession(),
    isRuntimeCurrent: () => runtime === roomCommandRuntimeScope() && publicKey === runtimeConfig.supabasePublishableKey,
    onPendingChange: () => window.dispatchEvent(new Event(event)),
  }), [runtime, publicKey])
  const refreshPending = () => {
    if (!context || !current()) return
    try { setStored({ scope, item: client.pending(context), error: null }) }
    catch (error) { setStored({ scope, item: null, error: error instanceof AdvicePolicyError ? error.message : 'Không thể đọc lần lưu cũ.' }) }
  }
  useEffect(() => {
    mounted.current = true; flight.current = null
    const active = controllers.current
    refreshPending(); window.addEventListener('storage', refreshPending); window.addEventListener(event, refreshPending)
    return () => {
      mounted.current = false; for (const c of active) c.abort(); active.clear()
      window.removeEventListener('storage', refreshPending); window.removeEventListener(event, refreshPending)
    }
    // Scope includes an epoch so A -> B -> A cannot revive old handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, client])
  const queryKey = ['advice-policy-admin', scope] as const
  const query = useQuery({ queryKey, enabled, retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false,
    queryFn: ({ signal }) => {
      if (!context || !current()) throw new AdvicePolicyError('identity_changed', 'Phiên đã thay đổi.')
      return client.read({ ...context }, { signal, isCurrent: current })
    },
  })
  async function run(operation: (c: PolicyContext, o: PolicyOptions) => ReturnType<typeof client.lookup>) {
    if (!context || !current()) throw new AdvicePolicyError('identity_changed', 'Phiên đã thay đổi.')
    if (flight.current) throw new AdvicePolicyError('flow_busy', 'Lần thao tác trước đang xử lý.')
    const token = Symbol(), controller = new AbortController(); flight.current = token; controllers.current.add(controller)
    setBusy(scope); setNotice(null)
    try {
      const result = await operation({ ...context }, { signal: controller.signal, isCurrent: current })
      if (!current()) throw new AdvicePolicyError('identity_changed', 'Phiên đã thay đổi.')
      // Historical receipts never overwrite the current configuration.
      if (result.state !== 'not_found') void cache.invalidateQueries({ queryKey })
      setNotice({ scope, text: result.state === 'succeeded' ? 'Đã xác nhận lưu. Đang tải cấu hình hiện tại.'
        : result.state === 'cancelled' ? 'Đã hủy lần lưu chưa áp dụng. Cấu hình không bị thay đổi bởi lần lưu này.'
          : 'Chưa có biên nhận. Lần lưu vẫn được giữ; bạn có thể tiếp tục hoặc hủy lần lưu đó.' })
      return result
    } catch (error) {
      if (!current()) throw new AdvicePolicyError('identity_changed', 'Phiên đã thay đổi.')
      const safe = error instanceof AdvicePolicyError ? error : new AdvicePolicyError('outcome_unknown', 'Chưa xác nhận kết quả. Kiểm tra lần lưu cũ.')
      if (['permission_denied', 'version_conflict', 'command_conflict'].includes(safe.code)) void cache.invalidateQueries({ queryKey })
      setNotice({ scope, text: safe.message }); throw safe
    } finally {
      controllers.current.delete(controller)
      if (flight.current === token) { flight.current = null; if (current()) { setBusy(null); refreshPending() } }
    }
  }
  const local = stored?.scope === scope ? stored : null
  const data = enabled && query.isFetchedAfterMount && !query.isError ? query.data : undefined
  return { ...query, data, scope, enabled, isCurrent: current,
    isSaving: enabled && busy === scope, pendingReady: !!local && !local.error, pending: local?.item ?? null,
    notice: enabled ? local?.error ?? (notice?.scope === scope ? notice.text : null)
      ?? (query.error ? query.error instanceof AdvicePolicyError ? query.error.message : 'Không thể tải cấu hình tư vấn.' : null) : null,
    save: (policy: AdvicePolicy, revision: number) => run((c, o) => client.save(c, policy, revision, o)),
    lookup: () => run((c, o) => client.lookup(c, o)), retry: () => run((c, o) => client.retry(c, o)),
    cancel: () => run((c, o) => client.cancel(c, o)),
  }
}
