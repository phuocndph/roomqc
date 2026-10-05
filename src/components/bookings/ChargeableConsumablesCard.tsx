import { Wallet, Check, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  useBookingChargeableConsumptions, 
  useMarkChargeableAsBilled,
  ChargeableConsumptionWithItem 
} from '@/hooks/useChargeableConsumptions'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ChargeableConsumablesCardProps {
  bookingId: string
  showBillAction?: boolean
}

export function ChargeableConsumablesCard({ bookingId, showBillAction = true }: ChargeableConsumablesCardProps) {
  const { data: consumptions, isLoading } = useBookingChargeableConsumptions(bookingId)
  const markAsBilled = useMarkChargeableAsBilled()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!consumptions || consumptions.length === 0) {
    return null // Don't show card if no chargeable items
  }

  const unbilledItems = consumptions.filter(c => !c.is_billed)
  const billedItems = consumptions.filter(c => c.is_billed)
  const totalUnbilled = unbilledItems.reduce((sum, c) => sum + (c.total_amount || 0), 0)
  const totalBilled = billedItems.reduce((sum, c) => sum + (c.total_amount || 0), 0)
  const grandTotal = totalUnbilled + totalBilled

  const handleMarkAllAsBilled = () => {
    const ids = unbilledItems.map(c => c.id)
    if (ids.length > 0) {
      markAsBilled.mutate({ ids, bookingId })
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-amber-700">
            <Wallet className="h-4 w-4" />
            Phụ thu Minibar/Dịch vụ
          </CardTitle>
          {showBillAction && unbilledItems.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-amber-300 hover:bg-amber-100"
              onClick={handleMarkAllAsBilled}
              disabled={markAsBilled.isPending}
            >
              <Check className="h-3 w-3 mr-1" />
              Đánh dấu đã thu
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="divide-y divide-amber-200">
          {/* Header */}
          <div className="grid grid-cols-5 gap-2 py-2 text-xs font-medium text-amber-700">
            <span className="col-span-2">Tên đồ</span>
            <span className="text-center">SL</span>
            <span className="text-right">Đ.Giá</span>
            <span className="text-right">T.Tiền</span>
          </div>

          {/* Unbilled Items */}
          {unbilledItems.map((item) => (
            <ConsumptionRow key={item.id} item={item} isBilled={false} />
          ))}

          {/* Billed Items */}
          {billedItems.length > 0 && (
            <>
              <div className="py-2 text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Check className="h-3 w-3" />
                Đã thu tiền
              </div>
              {billedItems.map((item) => (
                <ConsumptionRow key={item.id} item={item} isBilled={true} />
              ))}
            </>
          )}
        </div>

        {/* Summary */}
        <div className="mt-4 pt-3 border-t border-amber-200 space-y-1">
          {totalUnbilled > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-1 text-amber-700">
                <Clock className="h-3 w-3" />
                Chưa thu:
              </span>
              <span className="text-lg font-bold text-amber-700">
                {formatCurrency(totalUnbilled)}
              </span>
            </div>
          )}
          {totalBilled > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-sm flex items-center gap-1">
                <Check className="h-3 w-3" />
                Đã thu:
              </span>
              <span className="text-sm font-medium">
                {formatCurrency(totalBilled)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-amber-200">
            <span className="text-sm font-medium">Tổng phụ thu:</span>
            <span className="text-lg font-bold text-primary">
              {formatCurrency(grandTotal)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ConsumptionRow({ item, isBilled }: { item: ChargeableConsumptionWithItem, isBilled: boolean }) {
  return (
    <div className={cn(
      "grid grid-cols-5 gap-2 py-2 text-sm",
      isBilled && "opacity-60"
    )}>
      <div className="col-span-2">
        <p className="font-medium truncate">{item.item_name}</p>
        <p className="text-xs text-muted-foreground">{item.item_code}</p>
      </div>
      <span className="text-center font-medium">
        {item.quantity}
      </span>
      <span className="text-right text-muted-foreground text-xs">
        {formatCurrency(item.unit_price)}
      </span>
      <span className={cn(
        "text-right font-medium",
        isBilled ? "text-muted-foreground" : "text-amber-700"
      )}>
        {formatCurrency(item.total_amount)}
      </span>
    </div>
  )
}
