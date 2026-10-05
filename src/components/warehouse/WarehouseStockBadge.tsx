import { useWarehouseStockByItem } from '@/hooks/useWarehouseStock'
import { cn } from '@/lib/utils'
import { Package } from 'lucide-react'

interface WarehouseStockBadgeProps {
  warehouseId: string | undefined
  itemId: string | undefined
  showMinimum?: boolean
  className?: string
}

export function WarehouseStockBadge({ 
  warehouseId, 
  itemId, 
  showMinimum = false,
  className 
}: WarehouseStockBadgeProps) {
  const { data: stock, isLoading } = useWarehouseStockByItem(warehouseId, itemId)

  if (!warehouseId || !itemId) return null

  if (isLoading) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>
        ...
      </span>
    )
  }

  const quantity = stock?.quantity || 0
  const minimumStock = stock?.minimum_stock || 0
  const isLowStock = quantity > 0 && quantity <= minimumStock
  const isOutOfStock = quantity === 0

  return (
    <div className={cn('flex items-center gap-1 text-xs', className)}>
      <Package className="h-3 w-3" />
      <span
        className={cn(
          'font-medium',
          isOutOfStock && 'text-red-600',
          isLowStock && 'text-amber-600',
          !isOutOfStock && !isLowStock && 'text-muted-foreground'
        )}
      >
        Tồn: {quantity}
      </span>
      {showMinimum && minimumStock > 0 && (
        <span className="text-muted-foreground">
          (min: {minimumStock})
        </span>
      )}
    </div>
  )
}
