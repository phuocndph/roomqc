import { createClient } from '@supabase/supabase-js'
import { runtimeConfig } from './runtime-config'
import { authRedirectUrl } from './native/auth-links'

export type EmailAuthMode = 'signup' | 'recovery' | 'invite'

/** OTP verification must not replace the app session before password/role setup finishes. */
export function createEmailAuthFlow() {
  const client = createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  let verifiedMode: EmailAuthMode | null = null
  let verifiedEmail: string | null = null
  let passwordUpdated = false
  return {
    async send(mode: EmailAuthMode, email: string) {
      const normalized = email.trim().toLowerCase()
      const result = mode === 'recovery'
        ? await client.auth.resetPasswordForEmail(normalized, { redirectTo: authRedirectUrl('/auth/change-password') })
        : mode === 'signup'
          ? await client.auth.resend({ type: 'signup', email: normalized, options: { emailRedirectTo: authRedirectUrl('/auth/callback') } })
          : null
      if (!result) throw new Error('Hãy nhờ quản lý gửi lại lời mời.')
      if (result.error) throw new Error('Chưa gửi được mã. Vui lòng chờ một phút và thử lại.')
    },
    async verify(mode: EmailAuthMode, email: string, token: string) {
      if (!/^\d{6}$/.test(token)) throw new Error('Mã xác minh gồm 6 chữ số.')
      const normalized = email.trim().toLowerCase()
      let { data, error } = await client.auth.verifyOtp({ type: mode, email: normalized, token })
      // A verified recipient can receive a recovery OTP when their manager resends.
      // Membership still requires the server-owned pending invitation and password setup.
      if (mode === 'invite' && error) ({ data, error } = await client.auth.verifyOtp({ type: 'recovery', email: normalized, token }))
      if (error || !data.session || data.user?.email?.toLowerCase() !== normalized) throw new Error('Mã không hợp lệ, đã dùng hoặc đã hết hạn. Hãy yêu cầu mã mới.')
      verifiedMode = mode; verifiedEmail = normalized; passwordUpdated = false
      return data.user
    },
    async finish(mode: EmailAuthMode, password: string) {
      if (!verifiedEmail || verifiedMode !== mode || mode === 'signup') throw new Error('Vui lòng xác minh mã trước.')
      if (!passwordUpdated) {
        const { error } = await client.auth.updateUser({ password })
        if (error) throw new Error('Không thể đặt mật khẩu. Vui lòng kiểm tra yêu cầu mật khẩu hoặc yêu cầu mã mới.')
        passwordUpdated = true
      }
      if (mode === 'invite') {
        const { data, error: acceptError } = await client.functions.invoke('staff-invitations', {
          body: { action: 'accept', tenantId: runtimeConfig.workspace?.workspace.tenantId || null },
        })
        if (acceptError || !data?.success) throw new Error(data?.error || 'Chưa nhận được lời mời. Hãy kiểm tra đúng khách sạn hoặc liên hệ quản lý; quyền truy cập chưa được cấp.')
      }
      await client.auth.signOut({ scope: mode === 'recovery' ? 'global' : 'local' })
      verifiedMode = null; verifiedEmail = null
    },
    async dispose() { verifiedMode = null; verifiedEmail = null; await client.auth.signOut({ scope: 'local' }) },
  }
}
