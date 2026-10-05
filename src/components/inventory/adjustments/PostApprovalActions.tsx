import { useNavigate } from 'react-router-dom'
import { 
  ShoppingCart, 
  FileCheck, 
  TrendingDown,
  TrendingUp,
  ChevronRight,
  AlertTriangle,
  Package
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface MissingItem {
  item_id: string
  item_code: string
  item_name: string
  shortage: number
  unit_price: number
  value: number
}

interface DiscrepancySummary {
  totalMissingItems: number
  totalExcessItems: number
  totalMissingValue: number
  totalExcessValue: number
  netValue: number
  missingItems: MissingItem[]
}

interface PostApprovalActionsProps {
  adjustmentId: string
  adjustmentCode: string
  hotelId: string
  items: Array<{
    item_id: string
    item_code?: string
    item_name?: string
    item?: {
      id: string
      code: string
      name: string
    }
    system_quantity: number
    actual_quantity: number | null
    unit_price: number | null
  }>
  status: string
  className?: string
  variant?: 'desktop' | 'mobile'
}

export function PostApprovalActions({
  adjustmentId,
  adjustmentCode,
  hotelId,
  items,
  status,
  className,
  variant = 'desktop'
}: PostApprovalActionsProps) {
  const navigate = useNavigate()
  
  // Only show for approved adjustments
  if (status !== 'approved') return null
  
  // Calculate discrepancy summary
  const summary = calculateDiscrepancySummary(items)
  
  // No discrepancies = no action needed
  if (summary.totalMissingItems === 0 && summary.totalExcessItems === 0) {
    return (
      <div className={cn(
        "border rounded-lg p-4",
        "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
        className
      )}>
        <div className="flex items-center gap-2 text-green-600">
          <FileCheck className="h-5 w-5" />
          <span className="font-medium">Kiểm kê hoàn tất - Không có chênh lệch</span>
        </div>
      </div>
    )
  }
  
  const handleCreateInbound = () => {
    // Create query params to pre-fill inbound form
    const missingItemsData = summary.missingItems.map(item => ({
      item_id: item.item_id,
      quantity: item.shortage,
    }))
    
    // Navigate to inbound page with pre-filled data
    navigate('/inventory/inbound', {
      state: {
        prefillFromAdjustment: {
          adjustmentId,
          adjustmentCode,
          hotelId,
          items: missingItemsData,
          notes: `Bổ sung từ kiểm kê ${adjustmentCode}`
        }
      }
    })
  }
  
  if (variant === 'mobile') {
    return (
      <div className={cn("border rounded-lg p-4 space-y-3", className)}>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Package className="h-4 w-4" />
          Tổng kết kiểm kê
        </div>
        
        {/* Summary Stats */}
        <div className="space-y-2">
          {summary.totalMissingItems > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span>Thiếu {summary.totalMissingItems} items</span>
              </div>
              <span className="text-red-600 font-medium">
                -{formatCurrency(summary.totalMissingValue)}
              </span>
            </div>
          )}
          
          {summary.totalExcessItems > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span>Thừa {summary.totalExcessItems} items</span>
              </div>
              <span className="text-green-600 font-medium">
                +{formatCurrency(summary.totalExcessValue)}
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-between text-sm border-t pt-2">
            <span className="font-medium">Chênh lệch ròng</span>
            <span className={cn(
              "font-bold",
              summary.netValue >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {summary.netValue >= 0 ? '+' : ''}{formatCurrency(Math.abs(summary.netValue))}
            </span>
          </div>
        </div>
        
        {/* Action Button */}
        {summary.totalMissingItems > 0 && (
          <Button 
            onClick={handleCreateInbound}
            className="w-full"
            size="sm"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Tạo phiếu nhập bổ sung ({summary.totalMissingItems} items)
            <ChevronRight className="h-4 w-4 ml-auto" />
          </Button>
        )}
      </div>
    )
  }
  
  // Desktop variant
  return (
    <div className={cn("border rounded-lg p-4 space-y-4", className)}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h3 className="font-medium">Tổng kết sau kiểm kê</h3>
      </div>
      
      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span>Items thiếu</span>
          </div>
          <p className="text-xl font-bold">{summary.totalMissingItems}</p>
          <p className="text-sm text-red-600">
            -{formatCurrency(summary.totalMissingValue)}
          </p>
        </div>
        
        <div className="rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span>Items thừa</span>
          </div>
          <p className="text-xl font-bold">{summary.totalExcessItems}</p>
          <p className="text-sm text-green-600">
            +{formatCurrency(summary.totalExcessValue)}
          </p>
        </div>
      </div>
      
      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">Chênh lệch ròng:</span>
        <span className={cn(
          "text-lg font-bold",
          summary.netValue >= 0 ? "text-green-600" : "text-red-600"
        )}>
          {summary.netValue >= 0 ? '+' : ''}{formatCurrency(Math.abs(summary.netValue))}
        </span>
      </div>
      
      {/* Missing Items List (collapsible) */}
      {summary.missingItems.length > 0 && summary.missingItems.length <= 5 && (
        <div className="border-t pt-3">
          <p className="text-sm text-muted-foreground mb-2">Chi tiết items thiếu:</p>
          <div className="space-y-1">
            {summary.missingItems.map((item) => (
              <div key={item.item_id} className="flex justify-between text-sm">
                <span className="text-muted-foreground truncate max-w-[200px]">
                  {item.item_name || item.item_code}
                </span>
                <span className="text-red-600 font-medium">
                  -{item.shortage} ({formatCurrency(item.value)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Actions */}
      {summary.totalMissingItems > 0 && (
        <div className="border-t pt-3">
          <p className="text-sm text-muted-foreground mb-2">Đề xuất xử lý:</p>
          <Button onClick={handleCreateInbound} className="w-full">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Tạo phiếu nhập bổ sung {summary.totalMissingItems} items thiếu
          </Button>
        </div>
      )}
    </div>
  )
}

function calculateDiscrepancySummary(items: PostApprovalActionsProps['items']): DiscrepancySummary {
  const missingItems: MissingItem[] = []
  let totalMissingItems = 0
  let totalExcessItems = 0
  let totalMissingValue = 0
  let totalExcessValue = 0
  
  for (const item of items) {
    if (item.actual_quantity === null) continue
    
    const diff = item.actual_quantity - item.system_quantity
    const unitPrice = item.unit_price || 0
    const value = Math.abs(diff) * unitPrice
    
    if (diff < 0) {
      // Missing
      totalMissingItems++
      totalMissingValue += value
      missingItems.push({
        item_id: item.item_id,
        item_code: item.item_code || item.item?.code || '',
        item_name: item.item_name || item.item?.name || '',
        shortage: Math.abs(diff),
        unit_price: unitPrice,
        value
      })
    } else if (diff > 0) {
      // Excess
      totalExcessItems++
      totalExcessValue += value
    }
  }
  
  return {
    totalMissingItems,
    totalExcessItems,
    totalMissingValue,
    totalExcessValue,
    netValue: totalExcessValue - totalMissingValue,
    missingItems
  }
}
