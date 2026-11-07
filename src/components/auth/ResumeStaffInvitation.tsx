import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { runtimeConfig } from '@/lib/runtime-config'
import { createRuntimeStaffInvitationClient, staffInvitationQueryKey, staffInvitationRuntimeScope } from '@/lib/staff-invitation-client'
import { staffInvitationSession, type StaffInvitation } from '@/lib/staff-invitation'

export function ResumeStaffInvitation({ invitation }: { invitation: StaffInvitation }) {
  const cache = useQueryClient(), navigate = useNavigate(), { user, session, signOut } = useAuth()
  let sessionId: string | undefined
  try { sessionId = staffInvitationSession(session).sessionId } catch { /* fail closed on submit */ }
  const actorId = user?.id, runtimeScope = staffInvitationRuntimeScope()
  const scope = JSON.stringify([runtimeScope, actorId, sessionId, invitation.id, invitation.tenantId, invitation.hotelId])
  const latest = useRef(scope); latest.current = scope
  const client = useMemo(() => createRuntimeStaffInvitationClient(runtimeScope), [runtimeScope])
  const lifecycle = useMemo(() => ({ scope, active: true, busy: false, controller: null as AbortController | null }), [scope])
  const [state, setState] = useState({ scope, busy: false, error: '', uncertain: false })
  const view = state.scope === scope ? state : { scope, busy: false, error: '', uncertain: false }
  useEffect(() => {
    lifecycle.active = true
    return () => { lifecycle.active = false; lifecycle.controller?.abort() }
  }, [lifecycle])
  const accept = async () => {
    if (lifecycle.busy || invitation.revoked || invitation.expired) return
    if (!actorId || !sessionId) { setState({ scope, busy: false, error: 'Vui lòng đăng nhập lại để tiếp tục lời mời.', uncertain: false }); return }
    lifecycle.busy = true
    const controller = new AbortController(); lifecycle.controller = controller
    const isCurrent = () => lifecycle.active && latest.current === scope && !controller.signal.aborted && runtimeScope === staffInvitationRuntimeScope()
    const options = { signal: controller.signal, sessionId, isCurrent }
    setState({ scope, busy: true, error: '', uncertain: view.uncertain })
    try {
      // Always read first: remount/lost response can already have committed.
      const status = await client.status(actorId, invitation, options)
      if (!isCurrent()) return
      if (status.status !== 'accepted' && (status.status === 'revoked' || status.expired)) throw new Error('Unavailable invitation')
      const receipt = status.status === 'accepted' ? status.receipt : await client.accept(actorId, invitation, options)
      if (!isCurrent()) return
      const userKey = ['user', actorId, runtimeConfig.workspace?.workspace.id]
      await cache.invalidateQueries({ queryKey: userKey, exact: true, refetchType: 'none' })
      if (!isCurrent()) return
      await cache.refetchQueries({ queryKey: userKey, exact: true, type: 'active' }, { throwOnError: true })
      if (!isCurrent()) return
      const profile = cache.getQueryData<{ id: string; tenant_id: string; hotel_id: string }>(userKey)
      if (profile?.id !== actorId || profile.tenant_id !== receipt.tenantId || profile.hotel_id !== receipt.hotelId) throw new Error('Profile not confirmed')
      cache.setQueryData(staffInvitationQueryKey(actorId, sessionId), null)
      navigate('/auth/callback', { replace: true })
    } catch {
      if (isCurrent()) setState({ scope, busy: false, uncertain: true,
        error: 'Chưa xác nhận được quyền truy cập. Hãy kiểm tra kết quả hoặc liên hệ quản lý. Không cần đặt lại mật khẩu.' })
    } finally {
      lifecycle.busy = false
      if (isCurrent()) setState(previous => previous.scope === scope ? { ...previous, busy: false } : previous)
    }
  }
  return <main className="min-h-screen p-6 flex items-center justify-center"><div className="max-w-md space-y-4 text-center">
    <h1 className="text-xl font-semibold">Hoàn tất lời mời nhân viên</h1>
    <p>{invitation.revoked ? 'Lời mời đã bị thu hồi. Vui lòng liên hệ quản lý khách sạn để được cấp lại quyền truy cập.' : invitation.expired ? 'Lời mời đã hết hạn. Hãy nhờ quản lý gửi lại; tài khoản hiện tại được giữ nguyên.'
      : invitation.passwordReady ? 'Bạn đã đặt mật khẩu. Bấm nhận lời mời để hoàn tất quyền truy cập khách sạn.' : 'Tài khoản này được mời làm nhân viên. Hãy xác minh mã trong email và tự đặt mật khẩu để tham gia.'}</p>
    {view.error && <p role="alert" className="text-sm text-red-700">{view.error}</p>}
    {!invitation.revoked && !invitation.expired && (invitation.passwordReady ? <Button onClick={() => void accept()} disabled={view.busy}>{view.busy ? 'Đang xử lý…' : view.uncertain ? 'Kiểm tra kết quả / tiếp tục' : 'Nhận lời mời'}</Button>
      : <Button asChild><Link to="/auth/accept-invite">Mở màn hình nhận lời mời</Link></Button>)}
    <Button variant="outline" className="ml-2" disabled={view.busy} onClick={() => { void signOut().catch(() => {
      if (latest.current === scope && lifecycle.active) setState({ scope, busy: false, uncertain: view.uncertain, error: 'Chưa đăng xuất được. Vui lòng thử lại.' })
    }) }}>Đăng xuất</Button>
  </div></main>
}
