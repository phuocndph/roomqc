import { useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useRoomTransition } from '@/hooks/useRoomTransition'
import { ROOM_STATUS_META_V2 } from '@/lib/roomStatus'
import type { RoomStatusV2 } from '@/types/rooms.types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: string
  targetStatus: RoomStatusV2
  onDone?: () => void
}

/** Khoảng giờ mặc định cho từng trạng thái (giờ kể từ now) */
const DEFAULT_HOURS: Partial<Record<RoomStatusV2, number>> = {
  dnd: 4,
  out_of_service: 8,
  out_of_order: 24,
  sleep_out: 12,
}

const REQUIRES_REASON: RoomStatusV2[] = ['skipper', 'out_of_order', 'out_of_service']
const HAS_UNTIL: RoomStatusV2[] = ['dnd', 'out_of_service', 'out_of_order', 'sleep_out']

function toLocalInput(date: Date): string {
  const off = date.getTimezoneOffset()
  const local = new Date(date.getTime() - off * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

/**
 * Dialog nhập lý do/thời hạn cho các transition đặc biệt
 * (DND, OOS, OOO, sleep_out, skipper).
 *
 * - Single-page form (theo Forms standard memory).
 * - Mobile-first: input lớn, button full-width trên mobile.
 */
export function RoomTransitionDialog({ open, onOpenChange, roomId, targetStatus, onDone }: Props) {
  const meta = ROOM_STATUS_META_V2[targetStatus]
  const transition = useRoomTransition()

  const defaultUntil = useMemo(() => {
    const hours = DEFAULT_HOURS[targetStatus]
    if (!hours) return ''
    return toLocalInput(new Date(Date.now() + hours * 3600 * 1000))
  }, [targetStatus])

  const [reason, setReason] = useState('')
  const [until, setUntil] = useState(defaultUntil)
  const [notes, setNotes] = useState('')

  const reasonRequired = REQUIRES_REASON.includes(targetStatus)
  const showUntil = HAS_UNTIL.includes(targetStatus)

  const handleSubmit = async () => {
    if (reasonRequired && !reason.trim()) return

    const payloadReason = [reason.trim(), notes.trim()].filter(Boolean).join(' — ') || null
    const untilIso = showUntil && until ? new Date(until).toISOString() : null

    try {
      await transition.mutateAsync({
        roomId,
        toStatus: targetStatus,
        reason: payloadReason,
        dndUntil: targetStatus === 'dnd' ? untilIso : null,
        oosUntil: targetStatus === 'out_of_service' ? untilIso : null,
      })
      onDone?.()
      onOpenChange(false)
      // reset
      setReason(''); setNotes(''); setUntil(defaultUntil)
    } catch {
      /* toast đã hiển thị trong hook */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chuyển sang: {meta.label}</DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rt-reason">
              Lý do {reasonRequired && <span className="text-red-600">*</span>}
            </Label>
            <Input
              id="rt-reason"
              placeholder={
                targetStatus === 'skipper' ? 'VD: Khách rời lúc 02:00, không thanh toán'
                  : targetStatus === 'out_of_order' ? 'VD: Vỡ kính cửa sổ, chờ thợ'
                  : targetStatus === 'out_of_service' ? 'VD: Deep cleaning theo lịch tháng'
                  : targetStatus === 'dnd' ? 'VD: Khách yêu cầu không làm phiền'
                  : 'Nhập lý do (không bắt buộc)'
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>

          {showUntil && (
            <div className="space-y-1.5">
              <Label htmlFor="rt-until">Tự động gỡ trạng thái lúc</Label>
              <Input
                id="rt-until"
                type="datetime-local"
                value={until}
                min={toLocalInput(new Date(Date.now() + 5 * 60 * 1000))}
                onChange={(e) => setUntil(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Hệ thống sẽ tự gỡ trạng thái sau thời điểm này (cron 5 phút).
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rt-notes">Ghi chú nội bộ</Label>
            <Textarea
              id="rt-notes"
              placeholder="Thông tin thêm cho ca sau hoặc Quản lý"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={transition.isPending}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={transition.isPending || (reasonRequired && !reason.trim())}
            className={
              targetStatus === 'skipper' || targetStatus === 'out_of_order'
                ? 'bg-red-600 hover:bg-red-700 text-white' : ''
            }
          >
            {transition.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
