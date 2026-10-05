import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Coffee, AlertTriangle, Wrench, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { ConsumedItem, LostItem } from '@/types/rooms.types'

interface CheckoutReportCardProps {
  items_consumed?: ConsumedItem[]
  items_lost?: LostItem[]
  items_damaged?: any[]
}

export function CheckoutReportCard({ 
  items_consumed = [], 
  items_lost = [], 
  items_damaged = [] 
}: CheckoutReportCardProps) {
  const hasConsumed = items_consumed.length > 0
  const hasLost = items_lost.length > 0
  const hasDamaged = items_damaged.length > 0
  
  if (!hasConsumed && !hasLost && !hasDamaged) {
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
        <CardContent className="p-4 text-center">
          <p className="text-green-700 dark:text-green-300 text-sm">
            ✓ Không có đồ dùng, mất mát hay hư hỏng
          </p>
        </CardContent>
      </Card>
    )
  }
  
  // Calculate total damage value
  const totalLostValue = items_lost.reduce((sum, item) => {
    return sum + ((item.estimated_value || 0) * (item.quantity || 1))
  }, 0)
  
  return (
    <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          📋 Báo cáo Checkout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Đồ khách đã dùng */}
        {hasConsumed && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Coffee className="h-4 w-4 text-blue-500" />
              <span>Đồ khách đã dùng ({items_consumed.length})</span>
            </div>
            <div className="pl-6 space-y-1">
              {items_consumed.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{item.item_name}</span>
                  <Badge variant="secondary" className="text-xs">
                    x{item.quantity}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {hasConsumed && (hasLost || hasDamaged) && <Separator />}
        
        {/* Đồ bị mất */}
        {hasLost && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span>Đồ bị mất ({items_lost.length})</span>
            </div>
            <div className="pl-6 space-y-1">
              {items_lost.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-muted-foreground">{item.item_name}</span>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground">{item.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">
                      x{item.quantity}
                    </Badge>
                    {item.estimated_value && (
                      <span className="text-xs text-red-600">
                        ~{formatCurrency(item.estimated_value * item.quantity)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {hasLost && hasDamaged && <Separator />}
        
        {/* Đồ bị hỏng */}
        {hasDamaged && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-yellow-600">
              <Wrench className="h-4 w-4" />
              <span>Đồ bị hỏng ({items_damaged.length})</span>
            </div>
            <div className="pl-6 space-y-1">
              {items_damaged.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-muted-foreground">{item.item_name || item.name}</span>
                    {item.notes && (
                      <p className="text-xs text-muted-foreground">{item.notes}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">
                    x{item.quantity || 1}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Tổng giá trị thiệt hại */}
        {totalLostValue > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between bg-red-100 dark:bg-red-950/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
                <DollarSign className="h-4 w-4" />
                <span>Tổng giá trị thiệt hại ước tính</span>
              </div>
              <span className="font-bold text-red-700 dark:text-red-300">
                {formatCurrency(totalLostValue)}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
