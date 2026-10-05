import { CheckCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BatchConfirmBarProps {
  selectedCount: number
  totalPending: number
  onConfirmAll: () => void
  onClearSelection: () => void
  onSelectAll: () => void
  isConfirming: boolean
}

export function BatchConfirmBar({
  selectedCount,
  totalPending,
  onConfirmAll,
  onClearSelection,
  onSelectAll,
  isConfirming
}: BatchConfirmBarProps) {
  if (selectedCount === 0) return null
  
  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 z-50",
      "bg-background/95 backdrop-blur-sm border-t shadow-lg",
      "animate-in slide-in-from-bottom-2 duration-200"
    )}>
      <div className="max-w-lg mx-auto p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onClearSelection}
             aria-label="Đóng">
              <X className="h-4 w-4" />
            </Button>
            <div className="text-sm">
              <span className="font-medium">{selectedCount}</span>
              <span className="text-muted-foreground">/{totalPending} đơn đã chọn</span>
            </div>
            {selectedCount < totalPending && (
              <Button 
                variant="link" 
                size="sm" 
                className="text-xs p-0 h-auto"
                onClick={onSelectAll}
              >
                Chọn tất cả
              </Button>
            )}
          </div>
          
          <Button 
            onClick={onConfirmAll}
            disabled={isConfirming}
            className="shrink-0"
          >
            <CheckCircle className="h-4 w-4 mr-1.5" />
            {isConfirming ? 'Đang xử lý...' : 'Xác nhận tất cả'}
          </Button>
        </div>
      </div>
    </div>
  )
}
