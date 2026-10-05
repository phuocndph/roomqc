import { DollarSign, TrendingUp, Receipt, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useBookingStats, useTodayCheckouts } from '@/hooks/useBookingStats'
import { formatCurrency, cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'

export function OwnerRevenueOverview() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const { data: stats, isLoading: statsLoading } = useBookingStats()
  const { data: checkouts, isLoading: checkoutsLoading } = useTodayCheckouts()

  // Query all pending/partial bookings for accurate pending payment
  const { data: pendingBookings, isLoading: pendingLoading } = useQuery({
    queryKey: ['all-pending-payments', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      let query = supabase
        .from('room_bookings')
        .select('id, total_amount, amount_paid, deposit_amount, payment_status')
        .eq('tenant_id', tenantId!)
        .in('payment_status', ['pending', 'partial'])

      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id)
  })

  const isLoading = statsLoading || checkoutsLoading || pendingLoading

  // Calculate pending payment from all unpaid bookings (remaining amount)
  const pendingPayment = pendingBookings?.reduce((sum, b) => {
    const remaining = (b.total_amount || 0) - (b.amount_paid || 0) - (b.deposit_amount || 0)
    return sum + Math.max(0, remaining)
  }, 0) || 0

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Doanh thu hôm nay
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Revenue Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-l-4 border-l-green-600 bg-background">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <Receipt className="h-4 w-4" />
              <span className="text-xs font-medium">Đã thu</span>
            </div>
            <p className="text-xl font-bold text-green-700 dark:text-green-400 mt-1">
              {formatCurrency(stats?.todayRevenue || 0)}
            </p>
          </div>
          
          <div className="p-4 rounded-lg border border-l-4 border-l-orange-600 bg-background">
            <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Chờ thanh toán</span>
            </div>
            <p className="text-xl font-bold text-orange-700 dark:text-orange-400 mt-1">
              {formatCurrency(pendingPayment)}
            </p>
          </div>
          
          <div className="p-4 rounded-lg border border-l-4 border-l-primary bg-background col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 text-primary">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium">Doanh thu dự kiến</span>
            </div>
            <p className="text-xl font-bold text-primary mt-1">
              {formatCurrency(stats?.projectedRevenue || 0)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Từ {stats?.occupiedRooms || 0} phòng đang có khách
            </p>
          </div>
        </div>

        {/* Checkout Payment Status List */}
        {checkouts && checkouts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Trạng thái thanh toán checkout</h4>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {checkouts.map((checkout) => (
                <Link
                  key={checkout.id}
                  to={`/rooms/${checkout.room_id}`}
                  className="flex items-center justify-between p-2 rounded bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium bg-muted px-1.5 py-0.5 rounded">
                      P.{checkout.room_number}
                    </span>
                    <span className="text-sm truncate max-w-[100px]">{checkout.guest_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{formatCurrency(checkout.total_amount)}</span>
                    <Badge 
                      variant={checkout.payment_status === 'paid' ? 'default' : 'secondary'}
                      className={cn(
                        'text-[10px]',
                        checkout.payment_status === 'paid' 
                          ? 'bg-green-500 hover:bg-green-600' 
                          : checkout.payment_status === 'partial'
                          ? 'bg-amber-500 text-white hover:bg-amber-600'
                          : 'bg-orange-500 text-white hover:bg-orange-600'
                      )}
                    >
                      {checkout.payment_status === 'paid' 
                        ? 'Đã thanh toán' 
                        : checkout.payment_status === 'partial'
                        ? 'Thanh toán một phần'
                        : 'Chờ thanh toán'}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Link to Reports */}
        <Link
          to="/reports/finance?tab=costs"
          className="flex items-center justify-between p-3 rounded-lg border border-l-4 border-l-primary bg-background hover:bg-muted/30 transition-colors"
        >
          <span className="text-sm font-medium">Xem báo cáo tài chính chi tiết</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </CardContent>
    </Card>
  )
}
