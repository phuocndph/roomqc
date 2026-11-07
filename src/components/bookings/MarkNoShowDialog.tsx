import { useState, useEffect } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useMarkBookingNoShow } from '@/hooks/useMarkBookingNoShow'
import { formatCurrency } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  guestName: string
  roomNumber: string
  roomId?: string
  depositAmount: number
  hoursOverdue: number
  onSuccess?: () => void
}

export function MarkNoShowDialog({
  open,
  onOpenChange,
  bookingId,
  guestName,
  roomNumber,
  roomId,
  depositAmount,
  hoursOverdue,
  onSuccess,
}: Props) {
  const [reason, setReason] = useState('')
  const [refund, setRefund] = useState<'keep' | 'refund'>('keep')
  const mutation = useMarkBookingNoShow(JSON.stringify([bookingId, open]))

  // Reset state whenever dialog closes
  useEffect(() => {
    if (!open) {
      setReason('')
      setRefund('keep')
    }
  }, [open])

  const handleSubmit = async () => {
    if (reason.trim().length < 3) return
    try {
      await mutation.mutateAsync({ bookingId, roomId, reason: reason.trim(), refundDeposit: refund === 'refund' })
      if (!mutation.isCurrent()) return
      onOpenChange(false)
      onSuccess?.()
    } catch { /* The hook reports the error; uncertain commands remain in recovery. */ }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Đánh dấu khách No-Show</DialogTitle>
          <DialogDescription>
            Khách <b>{guestName}</b> đặt phòng <b>{roomNumber}</b> đã quá giờ check-in{' '}
            <span className="text-red-600 font-medium">
              {hoursOverdue.toFixed(1)} giờ
            </span>
            . Đơn đặt phòng sẽ được đánh dấu khách không đến và ngừng giữ chỗ.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {depositAmount > 0 && (
            <div className="space-y-2">
              <Label className="text-sm">
                Xử lý tiền cọc {formatCurrency(depositAmount)}
              </Label>
              <RadioGroup value={refund} onValueChange={v => { if (v === 'keep' || v === 'refund') setRefund(v) }} disabled={mutation.isPending}>
                <div className="flex items-start gap-2 border rounded-lg p-3">
                  <RadioGroupItem value="keep" id="keep" className="mt-0.5" />
                  <Label htmlFor="keep" className="font-normal cursor-pointer flex-1">
                    <div className="text-sm font-medium">Giữ làm phí No-Show</div>
                    <div className="text-xs text-muted-foreground">
                      Chuyển khoản cọc đã nhận thành phí no-show
                    </div>
                  </Label>
                </div>
                <div className="flex items-start gap-2 border rounded-lg p-3">
                  <RadioGroupItem value="refund" id="refund" className="mt-0.5" />
                  <Label htmlFor="refund" className="font-normal cursor-pointer flex-1">
                    <div className="text-sm font-medium">Đánh dấu cần hoàn cọc</div>
                    <div className="text-xs text-muted-foreground">
                      Khách sạn cần thực hiện hoàn tiền và đối soát riêng
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm">
              Lý do <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Khách không liên lạc được, không đến nhận phòng..."
              rows={3}
              maxLength={4000}
              disabled={mutation.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleSubmit}
            disabled={reason.trim().length < 3 || mutation.isPending}
          >
            {mutation.isPending ? 'Đang xử lý...' : 'Xác nhận No-Show'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
