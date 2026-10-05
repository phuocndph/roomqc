import { Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useBookingConsumables, BookingConsumableWithItem } from '@/hooks/useBookingConsumables'
import { cn } from '@/lib/utils'

interface BookingConsumablesCardProps {
  bookingId: string
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

export function BookingConsumablesCard({ bookingId }: BookingConsumablesCardProps) {
  const { data: consumables, isLoading } = useBookingConsumables(bookingId)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!consumables || consumables.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Đồ dùng tiêu hao
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Chưa có dữ liệu đồ dùng
          </p>
        </CardContent>
      </Card>
    )
  }

  const totalConsumed = consumables.reduce((sum, c) => {
    const consumed = c.consumed_quantity || (c.initial_quantity + c.supplemented_quantity - (c.remaining_quantity || 0))
    return sum + consumed
  }, 0)

  const totalValue = consumables.reduce((sum, c) => {
    const consumed = c.consumed_quantity || (c.initial_quantity + c.supplemented_quantity - (c.remaining_quantity || 0))
    const price = c.unit_price || c.item?.unit_price || 0
    return sum + (consumed * price)
  }, 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Đồ dùng tiêu hao
          </CardTitle>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Tổng tiêu thụ</p>
            <p className="text-sm font-semibold text-primary">{formatCurrency(totalValue)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {/* Header */}
          <div className="grid grid-cols-6 gap-2 py-2 text-xs font-medium text-muted-foreground">
            <span className="col-span-2">Tên đồ</span>
            <span className="text-center">Ban đầu</span>
            <span className="text-center">Bổ sung</span>
            <span className="text-center">Đã dùng</span>
            <span className="text-right">Tiền</span>
          </div>

          {/* Items */}
          {consumables.map((consumable) => {
            const totalAvailable = consumable.initial_quantity + consumable.supplemented_quantity
            const consumed = consumable.consumed_quantity || (totalAvailable - (consumable.remaining_quantity || 0))
            const price = consumable.unit_price || consumable.item?.unit_price || 0
            const itemTotal = consumed * price

            return (
              <div key={consumable.id} className="grid grid-cols-6 gap-2 py-3 text-sm">
                <div className="col-span-2">
                  <p className="font-medium truncate">{consumable.item?.name || consumable.item_name || 'N/A'}</p>
                  <p className="text-xs text-muted-foreground">{consumable.item_code}</p>
                </div>
                <span className="text-center text-muted-foreground">
                  {consumable.initial_quantity}
                </span>
                <span className={cn(
                  'text-center',
                  consumable.supplemented_quantity > 0 ? 'text-blue-600 font-medium' : 'text-muted-foreground'
                )}>
                  {consumable.supplemented_quantity > 0 ? `+${consumable.supplemented_quantity}` : '0'}
                </span>
                <span className={cn(
                  'text-center font-medium',
                  consumed > 0 ? 'text-orange-600' : 'text-muted-foreground'
                )}>
                  {consumed}
                </span>
                <span className={cn(
                  'text-right font-medium',
                  itemTotal > 0 ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {formatCurrency(itemTotal)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Summary */}
        <div className="mt-4 pt-3 border-t flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {consumables.length} loại • {totalConsumed} sản phẩm
          </span>
          <span className="text-lg font-bold text-primary">
            {formatCurrency(totalValue)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
