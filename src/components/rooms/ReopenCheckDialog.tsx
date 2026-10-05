import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useReopenRoomCheck } from '@/hooks/useRoomCheckLean'

interface Props {
  checkId: string
  checkedByName?: string
  checkedAt?: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onReopened?: () => void
}

/**
 * Dialog cho Manager/Owner mở lại 1 lần kiểm phòng đã gửi.
 * Bắt buộc nhập lý do (>= 5 ký tự) để có audit trail rõ ràng.
 */
export function ReopenCheckDialog({
  checkId,
  checkedByName,
  open,
  onOpenChange,
  onReopened,
}: Props) {
  const [reason, setReason] = useState('')
  const reopen = useReopenRoomCheck()

  const trimmed = reason.trim()
  const canSubmit = trimmed.length >= 5 && !reopen.isPending

  const handleSubmit = async () => {
    if (!canSubmit) return
    try {
      await reopen.mutateAsync({ checkId, reason: trimmed })
      setReason('')
      onOpenChange(false)
      onReopened?.()
    } catch {
      // toast đã handle trong hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!reopen.isPending) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mở lại bản kiểm phòng</DialogTitle>
          <DialogDescription>
            {checkedByName
              ? `Bản kiểm của ${checkedByName} sẽ được đánh dấu là cần kiểm lại.`
              : 'Bản kiểm này sẽ được đánh dấu là cần kiểm lại.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reopen-reason" className="text-sm">
            Lý do mở lại <span className="text-red-600">*</span>
          </Label>
          <Textarea
            id="reopen-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VD: Thiếu ảnh bằng chứng, ghi nhận chưa đúng số lượng minibar..."
            rows={4}
            maxLength={500}
            disabled={reopen.isPending}
          />
          <p className="text-xs text-muted-foreground">
            Tối thiểu 5 ký tự. Lý do sẽ được lưu vào ghi chú và nhật ký hệ thống.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={reopen.isPending}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {reopen.isPending ? 'Đang mở lại...' : 'Xác nhận mở lại'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
