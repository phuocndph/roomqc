import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, X, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface AdjustmentItem {
  id: string
  item_id: string
  system_quantity: number
  actual_quantity: number | null
  checked_at: string | null
  unit_price?: number
  item?: {
    name: string
    code: string
    unit_price?: number
  }
}

interface CompletionSummaryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: AdjustmentItem[]
  onConfirm: () => void
  isLoading?: boolean
}

export function CompletionSummaryDialog({
  open,
  onOpenChange,
  items,
  onConfirm,
  isLoading,
}: CompletionSummaryDialogProps) {
  // Calculate summary
  const checkedItems = items.filter(i => i.checked_at !== null)
  const uncheckedItems = items.filter(i => i.checked_at === null)
  
  const matchingItems = checkedItems.filter(i => 
    (i.actual_quantity ?? i.system_quantity) === i.system_quantity
  )
  
  const excessItems = checkedItems.filter(i => {
    const actual = i.actual_quantity ?? i.system_quantity
    return actual > i.system_quantity
  })
  
  const shortageItems = checkedItems.filter(i => {
    const actual = i.actual_quantity ?? i.system_quantity
    return actual < i.system_quantity && actual > 0
  })
  
  const lostItems = checkedItems.filter(i => 
    i.actual_quantity === 0 && i.system_quantity > 0
  )
  
  // Calculate value differences
  const totalExcessQty = excessItems.reduce((sum, i) => {
    const diff = (i.actual_quantity ?? i.system_quantity) - i.system_quantity
    return sum + diff
  }, 0)
  
  const totalShortageQty = shortageItems.reduce((sum, i) => {
    const diff = i.system_quantity - (i.actual_quantity ?? i.system_quantity)
    return sum + diff
  }, 0)
  
  const totalLostQty = lostItems.reduce((sum, i) => sum + i.system_quantity, 0)
  
  const excessValue = excessItems.reduce((sum, i) => {
    const diff = (i.actual_quantity ?? i.system_quantity) - i.system_quantity
    const price = i.unit_price || i.item?.unit_price || 0
    return sum + (diff * price)
  }, 0)
  
  const shortageValue = shortageItems.reduce((sum, i) => {
    const diff = i.system_quantity - (i.actual_quantity ?? i.system_quantity)
    const price = i.unit_price || i.item?.unit_price || 0
    return sum + (diff * price)
  }, 0)
  
  const lostValue = lostItems.reduce((sum, i) => {
    const price = i.unit_price || i.item?.unit_price || 0
    return sum + (i.system_quantity * price)
  }, 0)
  
  const netValueChange = excessValue - shortageValue - lostValue
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(value)
  }
  
  const canComplete = uncheckedItems.length === 0
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            Xác nhận hoàn thành kiểm kê
          </DialogTitle>
          <DialogDescription>
            Vui lòng kiểm tra tổng kết trước khi gửi phiếu để duyệt
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4">
            {/* Progress */}
            <div className="rounded-lg border p-4">
              <h4 className="font-medium mb-3">Tiến độ kiểm kê</h4>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Đã kiểm tra</span>
                <Badge variant={canComplete ? 'default' : 'destructive'}>
                  {checkedItems.length}/{items.length} items
                </Badge>
              </div>
              {!canComplete && (
                <p className="text-sm text-red-600 mt-2">
                  <AlertTriangle className="inline h-4 w-4 mr-1" />
                  Còn {uncheckedItems.length} items chưa kiểm tra
                </p>
              )}
            </div>
            
            {/* Summary */}
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="font-medium">Kết quả kiểm kê</h4>
              
              {/* Matching */}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Minus className="h-4 w-4 text-muted-foreground" />
                  Khớp (Đủ)
                </span>
                <span className="text-green-600 font-medium">
                  {matchingItems.length} items
                </span>
              </div>
              
              {/* Excess */}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  Thừa
                </span>
                <span className="text-blue-600 font-medium">
                  {excessItems.length} items (+{totalExcessQty})
                </span>
              </div>
              
              {/* Shortage */}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-amber-600" />
                  Thiếu
                </span>
                <span className="text-amber-600 font-medium">
                  {shortageItems.length} items (-{totalShortageQty})
                </span>
              </div>
              
              {/* Lost */}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <X className="h-4 w-4 text-red-600" />
                  Mất
                </span>
                <span className="text-red-600 font-medium">
                  {lostItems.length} items (-{totalLostQty})
                </span>
              </div>
            </div>
            
            {/* Value Summary */}
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="font-medium">Giá trị chênh lệch</h4>
              
              {excessValue > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span>Giá trị thừa</span>
                  <span className="text-blue-600 font-medium">
                    +{formatCurrency(excessValue)}
                  </span>
                </div>
              )}
              
              {(shortageValue > 0 || lostValue > 0) && (
                <div className="flex items-center justify-between text-sm">
                  <span>Giá trị thiếu/mất</span>
                  <span className="text-red-600 font-medium">
                    -{formatCurrency(shortageValue + lostValue)}
                  </span>
                </div>
              )}
              
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Tổng chênh lệch</span>
                  <span className={`font-bold text-lg ${
                    netValueChange > 0 
                      ? 'text-blue-600' 
                      : netValueChange < 0 
                        ? 'text-red-600' 
                        : 'text-muted-foreground'
                  }`}>
                    {netValueChange >= 0 ? '+' : ''}{formatCurrency(netValueChange)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Items with discrepancy */}
            {(excessItems.length > 0 || shortageItems.length > 0 || lostItems.length > 0) && (
              <div className="rounded-lg border p-4">
                <h4 className="font-medium mb-3">Chi tiết chênh lệch</h4>
                <div className="space-y-2 text-sm">
                  {[...excessItems, ...shortageItems, ...lostItems].slice(0, 5).map(item => {
                    const actual = item.actual_quantity ?? item.system_quantity
                    const diff = actual - item.system_quantity
                    return (
                      <div 
                        key={item.id} 
                        className="flex items-center justify-between py-1 border-b last:border-0"
                      >
                        <span className="truncate max-w-[200px]">
                          {item.item?.name || item.item_id}
                        </span>
                        <span className={`font-mono ${
                          diff > 0 ? 'text-blue-600' : 'text-red-600'
                        }`}>
                          {item.system_quantity} → {actual}
                          <span className="ml-2">
                            ({diff > 0 ? '+' : ''}{diff})
                          </span>
                        </span>
                      </div>
                    )
                  })}
                  {(excessItems.length + shortageItems.length + lostItems.length) > 5 && (
                    <p className="text-muted-foreground text-center pt-2">
                      ...và {(excessItems.length + shortageItems.length + lostItems.length) - 5} items khác
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Quay lại kiểm tra
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={!canComplete || isLoading}
          >
            {isLoading ? 'Đang xử lý...' : 'Xác nhận gửi duyệt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
