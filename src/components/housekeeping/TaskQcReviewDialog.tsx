import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useTaskTransition } from '@/hooks/useTaskTransition'
import type { HousekeepingTask } from '@/types/housekeeping.types'

interface Props {
  task: HousekeepingTask | null
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Mặc định mở ở chế độ Approve. Ấn "Trả lại" sẽ chuyển sang reject. */
  defaultMode?: 'approve' | 'reject'
}

/**
 * Dialog duyệt/từ chối công việc đang ở `completed_pending_review`.
 * Bất kỳ user có quyền `manage_housekeeping` đều dùng được — backend tự kiểm tra quyền.
 */
export function TaskQcReviewDialog({ task, open, onOpenChange, defaultMode = 'approve' }: Props) {
  const [mode, setMode] = useState<'approve' | 'reject'>(defaultMode)
  const [reason, setReason] = useState('')
  const transition = useTaskTransition()

  if (!task) return null

  const handleSubmit = async () => {
    if (mode === 'reject' && !reason.trim()) return
    await transition.mutateAsync({
      taskId: task.id,
      toStatus: mode === 'approve' ? 'approved' : 'rejected_rework',
      reason: reason.trim() || undefined,
    })
    setReason('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'approve' ? 'Duyệt công việc' : 'Trả về làm lại'}</DialogTitle>
          <DialogDescription>
            {mode === 'approve'
              ? 'Xác nhận công việc đã đạt chất lượng và đóng phiếu.'
              : 'Ghi rõ lý do để nhân viên thực hiện hiểu và làm lại.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm">
            <div className="font-medium">{task.title || 'Công việc'}</div>
            {task.notes && <div className="text-xs text-muted-foreground mt-1">{task.notes}</div>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="qc-reason">
              {mode === 'approve' ? 'Ghi chú (tuỳ chọn)' : 'Lý do trả lại'}
              {mode === 'reject' && <span className="text-red-600"> *</span>}
            </Label>
            <Textarea
              id="qc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={mode === 'approve' ? 'VD: phòng đạt chuẩn' : 'VD: gối chưa thẳng, sàn còn tóc'}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMode(mode === 'approve' ? 'reject' : 'approve')}
            className="text-xs"
          >
            {mode === 'approve' ? 'Đổi sang Trả lại' : 'Đổi sang Duyệt'}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={transition.isPending || (mode === 'reject' && !reason.trim())}
              className={mode === 'approve' ? '' : 'bg-red-600 hover:bg-red-700 text-white'}
            >
              {mode === 'approve' ? 'Duyệt' : 'Trả lại làm lại'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
