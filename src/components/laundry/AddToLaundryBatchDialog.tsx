import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, Package, DoorOpen } from 'lucide-react'
import type { LaundryRequest, LaundryRequestItem } from '@/hooks/useLaundryRequests'

interface DraftBatch {
  id: string
  batch_code: string
  total_items: number | null
}

interface AddToLaundryBatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: LaundryRequest | null
  draftBatch: DraftBatch | null
  onConfirm: () => void
  isLoading: boolean
}

export function AddToLaundryBatchDialog({
  open,
  onOpenChange,
  request,
  draftBatch,
  onConfirm,
  isLoading,
}: AddToLaundryBatchDialogProps) {
  if (!request) return null

  const items = (request.items || []) as LaundryRequestItem[]
  const currentItems = draftBatch?.total_items || 0
  const afterItems = currentItems + request.total_quantity

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Xác nhận thêm vào lô giặt</AlertDialogTitle>
          <AlertDialogDescription>
            Kiểm tra thông tin trước khi thêm vào lô giặt nháp
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* Request info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <DoorOpen className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <div className="font-medium font-mono text-sm">{request.request_code}</div>
              <div className="text-sm text-muted-foreground">
                Phòng {request.room?.room_number || 'N/A'}
              </div>
            </div>
          </div>

          {/* Items list */}
          <div className="border rounded-lg">
            <div className="p-2 border-b bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground uppercase">
                Danh sách đồ giặt
              </span>
            </div>
            <div className="divide-y max-h-48 overflow-y-auto">
              {items.map((item, index) => (
                <div
                  key={`${item.item_id}-${index}`}
                  className="flex items-center justify-between p-2 text-sm"
                >
                  <span>{item.item_name}</span>
                  <Badge variant="secondary" className="font-mono">
                    x{item.quantity}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="p-2 border-t bg-muted/30 flex items-center justify-between">
              <span className="text-sm font-medium">Tổng cộng</span>
              <span className="font-bold">{request.total_quantity} món</span>
            </div>
          </div>

          {/* Draft batch info */}
          {draftBatch ? (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-primary" />
                <span className="font-medium">
                  Lô giặt nháp: {draftBatch.batch_code}
                </span>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Hiện có:</span>
                  <span className="font-mono">{currentItems} món</span>
                </div>
                <div className="flex justify-between font-medium text-foreground">
                  <span>Sau khi thêm:</span>
                  <span className="font-mono">{afterItems} món</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-muted border">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Sẽ tạo lô giặt nháp mới
                </span>
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Hủy</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Xác nhận thêm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
