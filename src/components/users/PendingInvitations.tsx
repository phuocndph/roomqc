import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Button } from '@/components/ui/button'
import { workspacePath } from '@/lib/workspace'
import { toast } from 'sonner'

type Invitation = { id: string; email: string; full_name: string; user_level_code: string; expires_at: string; sent_at: string | null }
const levelNames: Record<string, string> = { manager: 'Quản lý', department_manager: 'Quản lý bộ phận', staff: 'Nhân viên' }

export function PendingInvitations() {
  const { user } = useUser(), cache = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const canManage = !!user && ['tenant_owner', 'manager', 'department_manager'].includes(user.user_level_code || '')
  const { data = [], isError, isLoading, refetch } = useQuery({
    queryKey: ['staff-invitations', user?.tenant_id, user?.id], enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('staff-invitations', { body: { action: 'list' } })
      if (error || !data?.invitations) throw new Error('Không thể tải lời mời')
      return data.invitations as Invitation[]
    },
  })
  if (!canManage) return null
  const act = async (id: string, action: 'resend' | 'revoke') => {
    if (action === 'revoke' && !window.confirm('Thu hồi lời mời này? Người nhận sẽ không thể tham gia bằng lời mời cũ.')) return
    setBusyId(id)
    try {
      const { data, error } = await supabase.functions.invoke('staff-invitations', { body: { action, id, path: workspacePath('/auth/accept-invite') } })
      if (error || !data?.success) throw new Error(data?.error || 'Không thể xử lý. Vui lòng chờ một phút hoặc kiểm tra quyền.')
      toast.success(action === 'resend' ? 'Đã gửi lại lời mời' : 'Đã thu hồi lời mời')
      await cache.invalidateQueries({ queryKey: ['staff-invitations'] })
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không thể xử lý lời mời') }
    finally { setBusyId(null) }
  }
  return <section className="rounded-lg border p-4 space-y-3" aria-label="Lời mời nhân viên">
    <h2 className="font-semibold">Lời mời đang chờ {data.length ? `(${data.length})` : ''}</h2>
    {isLoading ? <p className="text-sm">Đang tải lời mời…</p> : isError ? <div className="text-sm text-red-700">Không thể tải lời mời. <Button variant="outline" size="sm" onClick={() => void refetch()}>Thử lại</Button></div>
      : !data.length ? <p className="text-sm text-muted-foreground">Chưa có lời mời đang chờ. Nhân viên được cấp quyền sau khi xác minh email và tự đặt mật khẩu.</p>
        : <ul className="divide-y">{data.map(invite => <li key={invite.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="font-medium break-words">{invite.full_name}</p><p className="text-sm break-all">{invite.email}</p><p className="text-xs text-muted-foreground">{levelNames[invite.user_level_code]} · {Date.parse(invite.expires_at) <= Date.now() ? 'Lời mời đã hết hạn' : invite.sent_at ? 'Đã gửi — chờ chấp nhận' : 'Chưa gửi thành công'}</p></div>
          <div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" disabled={!!busyId} onClick={() => void act(invite.id, 'resend')}>Gửi lại</Button><Button size="sm" variant="outline" disabled={!!busyId} onClick={() => void act(invite.id, 'revoke')}>Thu hồi</Button></div>
        </li>)}</ul>}
  </section>
}
