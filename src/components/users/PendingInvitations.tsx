import { useStaffInvitationAdmin } from '@/hooks/useStaffInvitationAdmin'
import type { InvitationAdminRow } from '@/lib/staff-invitation-admin'
import { Button } from '@/components/ui/button'

const levelNames: Record<string, string> = { manager: 'Quản lý', department_manager: 'Quản lý bộ phận', staff: 'Nhân viên' }

export function PendingInvitations() {
  const { canManage, data, isError, isLoading, isReady, isFetching, busyId, notice, refresh, act: action,
    page, hasPrevious, hasNext, previous, next } = useStaffInvitationAdmin()
  if (!canManage) return null
  const act = async (target: InvitationAdminRow, kind: 'resend' | 'revoke') => {
    if (kind === 'revoke' && !window.confirm('Thu hồi lời mời này? Người nhận sẽ không thể tham gia bằng lời mời cũ.')) return
    try { await action(target, kind) } catch { /* Hook owns safe, context-fenced feedback. */ }
  }
  return <section className="rounded-lg border p-4 space-y-3" aria-label="Lời mời nhân viên">
    <h2 className="font-semibold">Lời mời đang chờ</h2>
    <Button variant="outline" size="sm" disabled={!isReady || isFetching || !!busyId} onClick={() => void refresh()}>Kiểm tra lời mời</Button>
    {notice && <p role="status" className="text-sm text-amber-900">{notice} Danh sách không còn lời mời cũng chưa đủ để xác nhận thao tác đã thành công.</p>}
    {!isReady ? <p className="text-sm">Chọn một khách sạn hoặc chế độ tất cả khách sạn để xem lời mời.</p> : isLoading ? <p className="text-sm">Đang tải lời mời…</p> : isError ? <div className="text-sm text-red-700">Không thể tải lời mời. <Button variant="outline" size="sm" onClick={() => void refresh()}>Thử lại</Button></div>
      : !data.length ? <p className="text-sm text-muted-foreground">{page > 1 ? 'Trang này không còn lời mời. Quay về trang trước hoặc kiểm tra lại từ đầu.' : 'Chưa có lời mời đang chờ. Nhân viên được cấp quyền sau khi xác minh email và tự đặt mật khẩu.'}</p>
        : <ul className="divide-y">{data.map(invite => <li key={invite.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="font-medium break-words">{invite.full_name}</p><p className="text-sm break-all">{invite.email}</p><p className="text-xs text-muted-foreground">{levelNames[invite.user_level_code]} · {Date.parse(invite.expires_at) <= Date.now() ? 'Lời mời đã hết hạn' : invite.sent_at ? 'Đã yêu cầu gửi — chờ chấp nhận' : 'Chưa có lượt gửi'}</p></div>
          <div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" disabled={!!busyId || isFetching} onClick={() => void act(invite, 'resend')}>Gửi lại</Button><Button size="sm" variant="outline" disabled={!!busyId || isFetching} onClick={() => void act(invite, 'revoke')}>Thu hồi</Button></div>
        </li>)}</ul>}
    {isReady && <nav aria-label="Phân trang lời mời" className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" disabled={!hasPrevious || isFetching || !!busyId} onClick={previous}>Trang trước</Button>
      <span role="status" className="text-sm">Trang {page} · {data.length} lời mời trên trang</span>
      <Button variant="outline" size="sm" disabled={!hasNext || isFetching || isError || !!busyId} onClick={next}>Trang sau</Button>
      {page > 1 && <p className="text-xs text-muted-foreground">“Kiểm tra lời mời” tải lại từ trang đầu để thấy lời mời mới.</p>}
    </nav>}
  </section>
}
