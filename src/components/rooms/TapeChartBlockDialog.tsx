/**
 * Dialog tạo block phòng cho Tape Chart — Phase 2b
 */
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTapeChartMutations } from '@/hooks/useTapeChartMutations'
import type { RoomBlockType, TapeChartRoom } from '@/hooks/useTapeChart'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  room: TapeChartRoom | null
  defaultStart: Date | null
}

const TYPE_OPTIONS: { value: RoomBlockType; label: string }[] = [
  { value: 'maintenance', label: 'Bảo trì' },
  { value: 'ooo', label: 'OOO – hỏng' },
  { value: 'oos', label: 'OOS – tạm ngừng' },
  { value: 'vip_hold', label: 'Giữ VIP' },
  { value: 'other', label: 'Khác' },
]

export function TapeChartBlockDialog({ open, onOpenChange, room, defaultStart }: Props) {
  const { createBlock } = useTapeChartMutations()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [type, setType] = useState<RoomBlockType>('maintenance')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open && defaultStart) {
      const s = format(defaultStart, 'yyyy-MM-dd')
      const e = format(new Date(defaultStart.getTime() + 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
      setStartDate(s)
      setEndDate(e)
      setType('maintenance')
      setReason('')
    }
  }, [open, defaultStart])

  const submit = () => {
    if (!room) return
    createBlock.mutate(
      {
        room_id: room.id,
        start_date: startDate,
        end_date: endDate,
        block_type: type,
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chặn phòng {room?.room_number}</DialogTitle>
          <DialogDescription className="text-xs">
            Phòng bị chặn sẽ không cho tạo booking trong khoảng ngày đã chọn.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Từ ngày</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Đến ngày (không tính)</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Loại</Label>
            <Select value={type} onValueChange={(v) => setType(v as RoomBlockType)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Lý do (tùy chọn)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Ví dụ: thay máy lạnh, sơn lại phòng…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={submit}
            disabled={!startDate || !endDate || !room || createBlock.isPending}
          >
            {createBlock.isPending ? 'Đang chặn…' : 'Chặn phòng'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
