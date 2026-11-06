import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/hooks/useUser'
import { supabase } from '@/integrations/supabase/client'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { RoomCommandError, type PendingRoomCommand, type RoomCommandContext } from '@/lib/room-transition-command'
import { cancelRoomTransition, recoverRoomTransition, roomCommandClient, roomCommandPendingEvent,
  roomCommandRuntimeScope, isRoomCommandRunning } from '@/lib/room-transition-client'
import { ROOM_STATUS_META_V2 } from '@/lib/roomStatus'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function RoomCommandRecovery() {
  const auth = useAuth(), { user } = useUser(), cache = useQueryClient(), runtime = roomCommandRuntimeScope()
  let context: RoomCommandContext | null = null
  try {
    const native = staffInvitationSession(auth.session)
    if (native.actorId === auth.user?.id && user?.id === native.actorId && user.tenant_id
      && user.status === 'active' && !user.account_locked && !user.deleted_at) context = { ...native, tenantId: user.tenant_id, runtime }
  } catch { /* Never show another actor's retained commands. */ }
  const identity = JSON.stringify(context), latest = useRef({ identity, epoch: 0 }), mounted = useRef(true)
  if (latest.current.identity !== identity) latest.current = { identity, epoch: latest.current.epoch + 1 }
  const epoch = latest.current.epoch, controllers = useRef(new Set<AbortController>())
  const [view, setView] = useState<{ identity: string; epoch: number; items: PendingRoomCommand[]; error: boolean } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    mounted.current = true; setBusy(null)
    const refresh = () => {
      try { setView({ identity, epoch, items: context ? roomCommandClient().pending(context).filter(x => !isRoomCommandRunning(context!, x.command._room_id)) : [], error: false }) }
      catch { setView({ identity, epoch, items: [], error: true }) }
    }
    refresh(); window.addEventListener(roomCommandPendingEvent, refresh)
    const active = controllers.current
    return () => { mounted.current = false; for (const controller of active) controller.abort(); active.clear(); window.removeEventListener(roomCommandPendingEvent, refresh) }
    // The serialized context contains every correlation field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, epoch])
  const local = view?.identity === identity && view.epoch === epoch ? view : null, items = local?.items ?? []
  const labels = useQuery({ queryKey: ['room-command-labels', identity, epoch, items.map(x => x.command._room_id)],
    enabled: !!context && items.length > 0, retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('rooms').select('id,room_number').in('id', items.map(x => x.command._room_id)).abortSignal(signal)
      if (error) throw error; return data
    },
  })
  async function act(item: PendingRoomCommand, cancel: boolean) {
    const captured = identity, capturedEpoch = epoch, roomId = item.command._room_id
    const current = () => mounted.current && latest.current.identity === captured && latest.current.epoch === capturedEpoch
    if (busy || !context) return
    const controller = new AbortController(); controllers.current.add(controller)
    setBusy(roomId)
    try {
      const options = { signal: controller.signal, isCurrent: current }
      const result = await (cancel ? cancelRoomTransition(roomId, options) : recoverRoomTransition(roomId, options))
      if (!current()) return
      toast.success(result.replayed ? 'Đã xác nhận kết quả đổi trạng thái trước đó.' : 'Đã cập nhật trạng thái phòng.')
    } catch (error) {
      if (!current()) return
      if (error instanceof RoomCommandError && error.code === 'command_cancelled') toast.info(error.message)
      else toast.error(error instanceof RoomCommandError ? error.message : 'Chưa kiểm tra được kết quả. Vui lòng thử lại.')
    } finally {
      controllers.current.delete(controller)
      if (current()) {
        for (const key of ['rooms', 'room', 'room-detail', 'room-stats', 'floor-plan', 'floor-plan-live', 'reception-room-detail', 'audit-log']) void cache.invalidateQueries({ queryKey: [key] })
        setBusy(null)
      }
    }
  }
  if (!context || (!local?.error && items.length === 0)) return null
  return <section aria-label="Lệnh đổi trạng thái đang chờ" className="max-h-[40dvh] shrink-0 overflow-y-auto border-b-2 border-orange-600 bg-white p-3 text-slate-900">
    <p className="font-semibold">{local?.error ? 'Không đọc được lệnh đổi trạng thái đang chờ' : 'Có lệnh đổi trạng thái chưa xác nhận'}</p>
    <p className="text-sm">Kiểm tra để lấy kết quả hoặc tiếp tục lệnh trước. Dừng lệnh chưa ghi sẽ giữ nguyên mọi thay đổi đã được lưu.</p>
    {items.map(item => <div key={item.command._command_id} className="mt-2 flex flex-wrap items-center gap-2">
      <span className="mr-auto text-sm">{labels.data?.find(r => r.id === item.command._room_id)?.room_number
        ? `Phòng ${labels.data.find(r => r.id === item.command._room_id)!.room_number}` : 'Phòng đang chờ'} → {ROOM_STATUS_META_V2[item.command._to_status].label}</span>
      <Button size="sm" disabled={busy !== null} onClick={() => void act(item, false)}>Kiểm tra và tiếp tục</Button>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act(item, true)}>Dừng lệnh chưa ghi</Button>
    </div>)}
  </section>
}
