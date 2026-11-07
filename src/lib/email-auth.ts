import { createClient } from '@supabase/supabase-js'
import { runtimeConfig } from './runtime-config'
import { authRedirectUrl } from './native/auth-links'
import { createEmailAuthCoordinator } from './email-auth-flow'
import { clearIsolatedEmailSession } from './email-auth-session'
export type { EmailAuthMode } from './email-auth-flow'

/** OTP sessions are isolated from the app client, including cleanup on unmount. */
export function createEmailAuthFlow() {
  const endpoint = runtimeConfig.supabaseUrl, publishableKey = runtimeConfig.supabasePublishableKey
  const tenantId = runtimeConfig.workspace?.workspace.tenantId || null
  const resetRedirect = authRedirectUrl('/auth/change-password'), signupRedirect = authRedirectUrl('/auth/callback')
  const client = createClient(endpoint, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return createEmailAuthCoordinator({
    endpoint, publishableKey, tenantId, storage: localStorage,
    getSession: () => client.auth.getSession(),
    verifyOtp: input => client.auth.verifyOtp(input),
    clearSession: () => clearIsolatedEmailSession(client.auth),
    send: async (mode, email) => {
      const result = mode === 'recovery'
        ? await client.auth.resetPasswordForEmail(email, { redirectTo: resetRedirect })
        : mode === 'signup'
          ? await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: signupRedirect } })
          : null
      if (!result || result.error) throw new Error('email_send_failed')
    },
  })
}
