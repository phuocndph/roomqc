import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, Minus, Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface InsufficientItem {
  item_id: string
  item_name: string
  item_code: string
  required: number
  available: number
  shortage: number
}

export interface ItemAdjustment {
  item_id: string
  quantity_actual: number
}

interface AdjustQuantityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  insufficientItems: InsufficientItem[]
  onConfirm: (adjustments: ItemAdjustment[], reason: string) => void
  onEditOrder: () => void
  isConfirming?: boolean
}

export function AdjustQuantityDialog({
  open,
  onOpenChange,
  insufficientItems,
  onConfirm,
  onEditOrder,
  isConfirming,
}: AdjustQuantityDialogProps) {
  // Initialize quantities with available amount (max deliverable)
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    insufficientItems.forEach(item => {
      initial[item.item_id] = Math.min(item.required, item.available)
    })
    return initial
  })
  const [reason, setReason] = useState('')

  const handleQuantityChange = (itemId: string, delta: number, available: number) => {
    setQuantities(prev => {
      const current = prev[itemId] ?? 0
      const newValue = Math.max(0, Math.min(available, current + delta))
      return { ...prev, [itemId]: newValue }
    })
  }

  const handleInputChange = (itemId: string, value: string, available: number) => {
    const num = parseInt(value, 10)
    if (isNaN(num)) {
      setQuantities(prev => ({ ...prev, [itemId]: 0 }))
    } else {
      setQuantities(prev => ({ ...prev, [itemId]: Math.max(0, Math.min(available, num)) }))
    }
  }

  const handleConfirm = () => {
    const adjustments: ItemAdjustment[] = insufficientItems.map(item => ({
      item_id: item.item_id,
      quantity_actual: quantities[item.item_id] ?? 0,
    }))
    onConfirm(adjustments, reason)
  }

  const hasAdjustments = insufficientItems.some(
    item => (quantities[item.item_id] ?? 0) < item.required
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Điều chỉnh số lượng giao
          </DialogTitle>
          <DialogDescription>
            Một số mặt hàng không đủ trong kho. Bạn có thể điều chỉnh số lượng giao thực tế.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Items table */}
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr,60px,60px,100px] gap-2 p-2 bg-muted/50 text-xs font-medium text-muted-foreground">
              <span>Mặt hàng</span>
              <span className="text-center">Yêu cầu</span>
              <span className="text-center">Kho</span>
              <span className="text-center">Sẽ giao</span>
            </div>
            
            {insufficientItems.map(item => {
              const qty = quantities[item.item_id] ?? 0
              const isShortage = item.available < item.required
              const isAdjusted = qty < item.required
              
              return (
                <div
                  key={item.item_id}
                  className={cn(
                    'grid grid-cols-[1fr,60px,60px,100px] gap-2 p-2 items-center border-t',
                    isShortage && 'bg-amber-50 dark:bg-amber-950/20'
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isShortage && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">{item.item_name}</span>
                    </div>
                    {item.item_code && (
                      <span className="text-xs text-muted-foreground font-mono">{item.item_code}</span>
                    )}
                  </div>
                  
                  <span className="text-center text-sm">{item.required}</span>
                  
                  <span className={cn(
                    'text-center text-sm font-medium',
                    isShortage ? 'text-red-600' : 'text-green-600'
                  )}>
                    {item.available}
                  </span>
                  
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleQuantityChange(item.item_id, -1, item.available)}
                      disabled={qty <= 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    
                    <Input
                      type="number"
                      value={qty}
                      onChange={(e) => handleInputChange(item.item_id, e.target.value, item.available)}
                      className="h-7 w-10 text-center px-1 text-sm"
                      min={0}
                      max={item.available}
                    />
                    
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleQuantityChange(item.item_id, 1, item.available)}
                      disabled={qty >= item.available}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    
                    {!isAdjusted && (
                      <Check className="h-4 w-4 text-green-600 ml-1" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Reason input */}
          {hasAdjustments && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Lý do điều chỉnh <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="VD: Thiếu khăn tắm lớn, đợi nhập hàng ngày mai..."
                className="min-h-[60px]"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onEditOrder}
            className="sm:mr-auto"
          >
            Quay lại chỉnh sửa phiếu
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirming || (hasAdjustments && !reason.trim())}
          >
            {isConfirming ? 'Đang xử lý...' : 'Xác nhận giao thiếu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
