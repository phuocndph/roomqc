import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/hooks/useUser'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { RoomCommandError, type RoomCommandContext } from '@/lib/room-transition-command'
import type { PendingRoomOperation } from '@/lib/room-operation-command'
import { roomCommandRuntimeScope } from '@/lib/room-transition-client'
import { roomOperationClient, roomOperationPendingEvent, isRoomOperationRunning, recoverRoomOperation,
  cancelRoomOperation, roomOperationErrorMessage } from '@/lib/room-operation-client'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'

const titles = { perform_quick_room_check: 'Kiểm nhanh', undo_quick_room_check: 'Hoàn tác lần kiểm', transfer_booking_room: 'Chuyển phòng',
  perform_checkin: 'Nhận phòng', perform_checkout: 'Trả phòng', perform_group_checkout: 'Trả phòng nhóm',
  transition_booking_flag: 'Trạng thái khách lưu trú', resolve_booking_no_show: 'Khách không đến và tiền cọc' }
export function RoomOperationRecovery() {
  const auth = useAuth(), { user } = useUser(), cache = useQueryClient(), runtime = roomCommandRuntimeScope()
  let context: RoomCommandContext | null = null
  try {
    const session = staffInvitationSession(auth.session)
    if (session.actorId === auth.user?.id && user?.id === session.actorId && user.tenant_id && user.status === 'active'
      && !user.account_locked && !user.deleted_at) context = { ...session, tenantId: user.tenant_id, runtime }
  } catch { /* Another actor cannot see retained requests. */ }
  const identity = JSON.stringify(context), latest = useRef({ identity, epoch: 0 }), mounted = useRef(true)
  if (latest.current.identity !== identity) latest.current = { identity, epoch: latest.current.epoch + 1 }
  const epoch = latest.current.epoch, controllers = useRef(new Set<AbortController>())
  const [view, setView] = useState<{ identity: string; epoch: number; items: PendingRoomOperation[]; error: boolean } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    mounted.current = true; setBusy(null)
    const refresh = () => {
      try { setView({ identity, epoch, items: context ? roomOperationClient().pending(context).filter(p => !isRoomOperationRunning(context!, p.id)) : [], error: false }) }
      catch { setView({ identity, epoch, items: [], error: true }) }
    }
    refresh(); window.addEventListener(roomOperationPendingEvent, refresh)
    const active = controllers.current
    return () => { mounted.current = false; for (const c of active) c.abort(); active.clear(); window.removeEventListener(roomOperationPendingEvent, refresh) }
    // identity contains the complete correlation context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, epoch])
  const local = view?.identity === identity && view.epoch === epoch ? view : null, items = local?.items ?? []
  const roomIds = [...new Set(items.flatMap(p => p.roomIds))]
  const labels = useQuery({ queryKey: ['room-operation-labels', identity, epoch, roomIds], enabled: !!context && roomIds.length > 0, retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('rooms').select('id,room_number').in('id', roomIds).abortSignal(signal)
      if (error) throw error; return data
    } })
  async function act(item: PendingRoomOperation, cancel: boolean) {
    const captured = identity, capturedEpoch = epoch
    const current = () => mounted.current && latest.current.identity === captured && latest.current.epoch === capturedEpoch
    if (busy || !context) return
    const controller = new AbortController(); controllers.current.add(controller); setBusy(item.id)
    try {
      const options = { signal: controller.signal, isCurrent: current }
      await (cancel ? cancelRoomOperation(item.id, options) : recoverRoomOperation(item.id, options))
      if (!current()) return
      toast.success('Đã xác nhận thao tác đã lưu.', { description: item.rpc.startsWith('perform_quick') || item.rpc.startsWith('undo_')
        ? 'Danh sách kiểm phòng đã được làm mới.' : 'Kiểm tra riêng hóa đơn, ghi chú và thông báo liên quan.' })
    } catch (error) {
      if (!current()) return
      if (error instanceof RoomCommandError && error.code === 'command_cancelled') toast.info(error.message)
      else toast.error(roomOperationErrorMessage(error))
    } finally {
      controllers.current.delete(controller)
      if (current()) {
        for (const key of ['rooms', 'room', 'room-detail', 'room-checks', 'last-room-check', 'room-last-check', 'housekeeping-tasks',
          'all-bookings', 'bookings', 'booking', 'booking-detail', 'room-bookings', 'overdue-checkins', 'booking-no-show-resolution',
          'booking-stats', 'today-checkins', 'available-rooms', 'group-booking', 'audit-log', 'revenue-report']) void cache.invalidateQueries({ queryKey: [key] })
        setBusy(null)
      }
    }
  }
  if (!context || (!local?.error && !items.length)) return null
  return <section aria-label="Thao tác kiểm phòng và booking đang chờ" className="max-h-[28dvh] shrink-0 overflow-y-auto border-b-2 border-orange-600 bg-white p-3 text-slate-900">
    <p className="font-semibold">{local?.error ? 'Không đọc được thao tác đang chờ' : 'Có thao tác chưa xác nhận kết quả'}</p>
    <p className="text-sm">Kiểm tra yêu cầu trước khi nhận, trả hoặc kiểm phòng lại. Dừng yêu cầu không hoàn tác dữ liệu đã lưu.</p>
    {items.map(item => <div key={item.id} className="mt-2 flex flex-wrap items-center gap-2">
      <span className="mr-auto text-sm">{titles[item.rpc]}{item.roomIds.length ? ` · ${item.roomIds.map(id => labels.data?.find(r => r.id === id)?.room_number).filter(Boolean).join(', ') || 'đang kiểm tra phòng'}` : ''}</span>
      <Button size="sm" disabled={busy !== null} onClick={() => void act(item, false)}>Kiểm tra và tiếp tục</Button>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act(item, true)}>Dừng yêu cầu chưa ghi</Button>
      <Link className="text-sm font-medium text-blue-700 underline" to={item.rpc === 'perform_quick_room_check' || item.rpc === 'undo_quick_room_check' ? '/rooms' : '/bookings'}>Xem danh sách</Link>
    </div>)}
    {local?.error && <p className="mt-1 text-sm">Không xóa dữ liệu trình duyệt để thử lại. Cần kiểm tra yêu cầu cũ trước khi tạo thao tác mới.</p>}
  </section>
}
