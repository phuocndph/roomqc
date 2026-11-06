import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/hooks/useUser'
import { isSuperAdmin } from '@/lib/userAccess'
import { runtimeConfig } from '@/lib/runtime-config'
import { supabase } from '@/integrations/supabase/client'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { isNativeApp, nativePublicOrigin } from '@/lib/native/platform'
import { createControlAdminClient, ControlAdminError, type ControlIdentity, type ControlReadOptions } from '@/lib/control-admin'

const client = createControlAdminClient({ getSession: () => supabase.auth.getSession() })
export { client as controlAdminClient }
const runtimeScope = () => JSON.stringify([isNativeApp() ? nativePublicOrigin() : window.location.origin, runtimeConfig.supabaseUrl, runtimeConfig.supabasePublishableKey,
  runtimeConfig.workspace?.cluster.id, runtimeConfig.workspace?.workspace.id, runtimeConfig.workspace?.workspace.routingVersion])

/** The server checks live authority on every request; this hook prevents stale UI/cache reuse. */
export function useControlAdminAccess(key: readonly unknown[], allow = true) {
  const auth = useAuth(), profile = useUser(), runtime = runtimeScope()
  let identity: ControlIdentity | null = null
  try {
    const session = staffInvitationSession(auth.session)
    if (auth.user?.id === session.actorId && profile.user?.id === session.actorId) identity = session
  } catch { /* No request without a complete correlated session. */ }
  const enabled = allow && !auth.loading && !profile.isLoading && !!identity && isSuperAdmin(profile.user)
    && profile.user.status === 'active' && !profile.user.account_locked && !profile.user.deleted_at
  const scope = JSON.stringify([enabled, runtime, identity, profile.user?.updated_at, profile.user?.roles,
    profile.user?.user_level_code, key])
  const latest = useRef({ scope, epoch: 0 }), mounted = useRef(true)
  if (latest.current.scope !== scope) latest.current = { scope, epoch: latest.current.epoch + 1 }
  const epoch = latest.current.epoch
  const current = () => enabled && mounted.current && latest.current.scope === scope && latest.current.epoch === epoch && runtimeScope() === runtime
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  return { identity, enabled, scope, epoch, current, runtime }
}

export function useControlAdmin<T>(key: readonly unknown[], read: (identity: ControlIdentity, options: ControlReadOptions) => Promise<T>, allow = true) {
  const { identity, enabled, scope, epoch, current } = useControlAdminAccess(key, allow)
  const query = useQuery({ queryKey: ['control-admin', scope, epoch], enabled, retry: false, staleTime: 0, gcTime: 0,
    refetchOnWindowFocus: false, queryFn: async ({ signal }) => {
      if (!identity || !current()) throw new ControlAdminError('identity_changed', 'Phiên quản trị đã thay đổi.')
      return read(identity, { signal, isCurrent: current })
    },
  })
  return { ...query, enabled, data: enabled && query.isFetchedAfterMount && !query.isError ? query.data : undefined,
    message: query.error instanceof ControlAdminError ? query.error.message : query.error ? 'Không thể tải dữ liệu quản trị.' : null,
    refetch: async () => { if (current()) await query.refetch() } }
}
