import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'
import { runtimeConfig } from '@/lib/runtime-config'

export function ResumeStaffInvitation({ invitation }: { invitation: { passwordReady: boolean; expired: boolean; revoked?: boolean } }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const cache = useQueryClient(), navigate = useNavigate(), { signOut } = useAuth()
  const accept = async () => {
    setBusy(true); setError('')
    try {
      const { data, error } = await supabase.functions.invoke('staff-invitations', { body: { action: 'accept', tenantId: runtimeConfig.workspace?.workspace.tenantId || null } })
      if (error || !data?.success) throw new Error(data?.error || 'Không thể nhận lời mời. Hãy kiểm tra đúng khách sạn hoặc liên hệ quản lý.')
      await cache.invalidateQueries({ queryKey: ['user'] }); await cache.invalidateQueries({ queryKey: ['my-staff-invitation'] })
      navigate('/auth/callback', { replace: true })
    } catch (error) { setError(error instanceof Error ? error.message : 'Không thể nhận lời mời') }
    finally { setBusy(false) }
  }
  return <main className="min-h-screen p-6 flex items-center justify-center"><div className="max-w-md space-y-4 text-center">
    <h1 className="text-xl font-semibold">Hoàn tất lời mời nhân viên</h1>
    <p>{invitation.revoked ? 'Lời mời đã bị thu hồi. Vui lòng liên hệ quản lý khách sạn để được cấp lại quyền truy cập.' : invitation.expired ? 'Lời mời đã hết hạn. Hãy nhờ quản lý gửi lại; tài khoản hiện tại được giữ nguyên.'
      : invitation.passwordReady ? 'Bạn đã đặt mật khẩu. Bấm nhận lời mời để hoàn tất quyền truy cập khách sạn.' : 'Tài khoản này được mời làm nhân viên. Hãy xác minh mã trong email và tự đặt mật khẩu để tham gia.'}</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!invitation.revoked && (invitation.passwordReady && !invitation.expired ? <Button onClick={() => void accept()} disabled={busy}>{busy ? 'Đang xử lý…' : 'Nhận lời mời'}</Button>
      : <Button asChild><Link to="/auth/accept-invite">Mở màn hình nhận lời mời</Link></Button>)}
    <Button variant="outline" className="ml-2" disabled={busy} onClick={() => void signOut()}>Đăng xuất</Button>
  </div></main>
}
