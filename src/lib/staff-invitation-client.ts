import { supabase } from '@/integrations/supabase/client'
import { runtimeConfig } from './runtime-config'
import { createStaffInvitationClient } from './staff-invitation'

// Public routing identity only, never put bearer/API keys into query keys.
export function staffInvitationRuntimeScope() {
  return JSON.stringify([runtimeConfig.supabaseUrl, runtimeConfig.workspace?.cluster.id ?? null,
    runtimeConfig.workspace?.workspace.id ?? null, runtimeConfig.workspace?.workspace.tenantId ?? null,
    runtimeConfig.workspace?.workspace.routingVersion ?? null])
}

export function staffInvitationQueryKey(actorId?: string, sessionId?: string) {
  return ['my-staff-invitation', actorId ?? null, sessionId ?? null, staffInvitationRuntimeScope()] as const
}

export function createRuntimeStaffInvitationClient(scope = staffInvitationRuntimeScope()) {
  const key = runtimeConfig.supabasePublishableKey
  return createStaffInvitationClient({
    endpoint: runtimeConfig.supabaseUrl, publishableKey: runtimeConfig.supabasePublishableKey,
    tenantId: runtimeConfig.workspace?.workspace.tenantId || null,
    getSession: () => {
      if (scope !== staffInvitationRuntimeScope() || key !== runtimeConfig.supabasePublishableKey) {
        return Promise.resolve({ data: { session: null }, error: new Error('Invitation target changed') })
      }
      return supabase.auth.getSession()
    },
  })
}
