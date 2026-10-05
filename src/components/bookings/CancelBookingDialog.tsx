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
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { formatCurrency } from '@/lib/utils'
import { mapDbError } from '@/lib/dbErrors'

interface CancelBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  roomId?: string | null
  guestName: string
  roomNumber: string
  checkInDate: string
  depositAmount: number
  onSuccess?: () => void
}

export function CancelBookingDialog({
  open,
  onOpenChange,
  bookingId,
  roomId,
  guestName,
  roomNumber,
  checkInDate,
  depositAmount,
  onSuccess,
}: CancelBookingDialogProps) {
  const { tenant } = useTenant()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [refund, setRefund] = useState<'keep' | 'refund'>('keep')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setReason('')
      setRefund('keep')
    }
  }, [open])

  const handleSubmit = async () => {
    if (reason.trim().length < 3) return
    if (!tenant?.id) {
      toast.error('Không xác định được khách sạn')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('cancel_booking', {
        p_booking_id: bookingId,
        p_room_id: roomId ?? null,
        p_reason: reason.trim(),
        p_refund_deposit: refund === 'refund',
      })
      if (error) throw error

      toast.success('Đã hủy đặt phòng')
      queryClient.invalidateQueries({ queryKey: ['all-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['room-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['available-rooms'] })
      onSuccess?.()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(mapDbError(err?.message ?? String(err)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hủy đặt phòng</DialogTitle>
          <DialogDescription>
            Khách <b>{guestName}</b> — Phòng <b>{roomNumber}</b>, nhận phòng{' '}
            <b>{checkInDate}</b>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {depositAmount > 0 && (
            <div className="space-y-2">
              <Label className="text-sm">
                Xử lý tiền cọc {formatCurrency(depositAmount)}
              </Label>
              <RadioGroup value={refund} onValueChange={(v) => setRefund(v as any)}>
                <div className="flex items-start gap-2 border rounded-lg p-3">
                  <RadioGroupItem value="keep" id="cancel-keep" className="mt-0.5" />
                  <Label htmlFor="cancel-keep" className="font-normal cursor-pointer flex-1">
                    <div className="text-sm font-medium">Giữ làm phí hủy</div>
                    <div className="text-xs text-muted-foreground">
                      Không hoàn lại cọc cho khách
                    </div>
                  </Label>
                </div>
                <div className="flex items-start gap-2 border rounded-lg p-3">
                  <RadioGroupItem value="refund" id="cancel-refund" className="mt-0.5" />
                  <Label htmlFor="cancel-refund" className="font-normal cursor-pointer flex-1">
                    <div className="text-sm font-medium">Hoàn lại khách</div>
                    <div className="text-xs text-muted-foreground">
                      Ghi nhận cần hoàn {formatCurrency(depositAmount)} — xử lý thủ công
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cancel-reason" className="text-sm">
              Lý do hủy <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Khách đổi kế hoạch, đặt nhầm phòng..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleSubmit}
            disabled={reason.trim().length < 3 || submitting}
          >
            {submitting ? 'Đang xử lý...' : 'Xác nhận hủy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
