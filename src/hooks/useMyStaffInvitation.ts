import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createRuntimeStaffInvitationClient, staffInvitationQueryKey, staffInvitationRuntimeScope } from '@/lib/staff-invitation-client'
import { staffInvitationSession } from '@/lib/staff-invitation'

export function useMyStaffInvitation(enabled: boolean) {
  const { user, session } = useAuth()
  let sessionId: string | undefined
  try { sessionId = staffInvitationSession(session).sessionId } catch { /* query fails closed below */ }
  const scope = staffInvitationRuntimeScope(), actorId = user?.id
  const identity = JSON.stringify([actorId, sessionId, scope])
  const latest = useRef(identity); latest.current = identity
  const client = useMemo(() => createRuntimeStaffInvitationClient(scope), [scope])
  const query = useQuery({
    queryKey: staffInvitationQueryKey(actorId, sessionId), enabled: enabled && !!user,
    retry: 1, staleTime: 0,
    queryFn: async ({ signal }) => {
      if (!actorId || !sessionId) throw new Error('Vui lòng đăng nhập lại để kiểm tra lời mời.')
      return client.mine(actorId, { signal, sessionId, isCurrent: () => latest.current === identity && scope === staffInvitationRuntimeScope() })
    },
  })
  // React Query retains cached data when disabled. Once the profile exists,
  // an old pending-invitation result must not block normal app navigation.
  return { ...query, data: enabled ? query.data : null, isLoading: enabled && query.isLoading, isError: enabled && query.isError }
}
