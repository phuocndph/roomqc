import { useState } from 'react'
import { PackageCheck, AlertCircle, Loader2, Check, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useConfirmDeliveryFromRoomCheck } from '@/hooks/usePendingDeliveries'
import { useUpdateTaskStatus } from '@/hooks/useHousekeepingTasks'

interface DeliveryItem {
  item_id: string
  item_name: string
  item_code: string
  quantity: number
}

interface DeliveryConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  roomOrderId: string
  roomNumber: string
  orderCode: string
  items: DeliveryItem[]
  onSuccess?: () => void
}

export function DeliveryConfirmationModal({
  open,
  onOpenChange,
  taskId,
  roomOrderId,
  roomNumber,
  orderCode,
  items,
  onSuccess,
}: DeliveryConfirmationModalProps) {
  const [mode, setMode] = useState<'confirm' | 'reject' | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  
  const { mutateAsync: confirmDelivery, isPending: isConfirming } = useConfirmDeliveryFromRoomCheck()
  const { mutateAsync: updateTaskStatus, isPending: isUpdating } = useUpdateTaskStatus()
  
  const isLoading = isConfirming || isUpdating

  const handleConfirm = async () => {
    try {
      // 1. Confirm delivery (updates inventory)
      await confirmDelivery({ roomOrderId })
      
      // 2. Complete the task
      await updateTaskStatus({ taskId, status: 'completed' })
      
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      // Error handled in hooks
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) return
    
    try {
      // Cancel the task with reason saved in notes
      await updateTaskStatus({ 
        taskId, 
        status: 'cancelled',
        notes: `Thiếu hàng: ${rejectReason.trim()}`
      })
      
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      // Error handled in hooks
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setMode(null)
      setRejectReason('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" />
            Xác nhận nhận hàng - P.{roomNumber}
          </DialogTitle>
          <DialogDescription>
            Phiếu giao: {orderCode}
          </DialogDescription>
        </DialogHeader>

        {/* Items list */}
        <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item.item_name}</p>
                <p className="text-xs text-muted-foreground font-mono">{item.item_code}</p>
              </div>
              <span className="text-sm font-medium shrink-0 ml-3">
                x{item.quantity}
              </span>
            </div>
          ))}
        </div>

        {/* Action selection */}
        {mode === null && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              className="h-12 flex-col gap-1"
              onClick={() => setMode('reject')}
              disabled={isLoading}
            >
              <X className="h-4 w-4 text-red-600" />
              <span className="text-xs">Thiếu hàng</span>
            </Button>
            <Button
              className="h-12 flex-col gap-1"
              onClick={() => setMode('confirm')}
              disabled={isLoading}
            >
              <Check className="h-4 w-4" />
              <span className="text-xs">Nhận đủ hàng</span>
            </Button>
          </div>
        )}

        {/* Confirm mode */}
        {mode === 'confirm' && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <Check className="h-5 w-5 text-green-600" />
              <p className="text-sm text-green-700 dark:text-green-400">
                Xác nhận đã nhận đủ {items.length} loại đồ dùng
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode(null)}
                disabled={isLoading}
                className="flex-1"
              >
                Quay lại
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Xác nhận
              </Button>
            </div>
          </div>
        )}

        {/* Reject mode */}
        {mode === 'reject' && (
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">
                Vui lòng mô tả chi tiết vấn đề để thông báo cho quản lý
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Lý do từ chối</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="VD: Thiếu 2 khăn tắm, chai dầu gội bị hỏng..."
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode(null)}
                disabled={isLoading}
                className="flex-1"
              >
                Quay lại
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={isLoading || !rejectReason.trim()}
                className="flex-1"
              >
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Gửi báo cáo
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
