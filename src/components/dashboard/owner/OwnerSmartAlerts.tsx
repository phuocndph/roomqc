import { AlertTriangle, Clock, CreditCard, Package, ChevronRight, AlertCircle, AlertOctagon } from 'lucide-react'
import { useOwnerAlerts } from '@/hooks/useRevenueReport'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { useLowStockItems } from '@/hooks/useInventoryDashboard'
import { useBookingConflicts } from '@/hooks/useBookingConflicts'

export function OwnerSmartAlerts() {
  const { data: ownerAlerts, isLoading: alertsLoading } = useOwnerAlerts()
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: lowStockItems, isLoading: lowStockLoading } = useLowStockItems()
  const { data: bookingConflicts, isLoading: conflictsLoading } = useBookingConflicts()

  const isLoading = alertsLoading || statsLoading || lowStockLoading || conflictsLoading

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg p-4">
        <Skeleton className="h-5 w-32 mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    )
  }

  const alerts = [
    // Booking conflicts - highest priority
    {
      id: 'booking-conflict',
      label: 'Xung đột lịch phòng',
      count: bookingConflicts?.length || 0,
      icon: AlertOctagon,
      color: 'text-red-600',
      bgColor: 'bg-background',
      borderColor: 'border-l-4 border-l-red-600 border-y-border border-r-border',
      link: '/bookings?filter=conflict',
      description: 'Khách mới đang chờ',
      show: (bookingConflicts?.length || 0) > 0,
    },
    {
      id: 'overdue-checkout',
      label: 'Quá hạn checkout',
      count: ownerAlerts?.overdueCheckouts.length || 0,
      icon: Clock,
      color: 'text-red-600',
      bgColor: 'bg-background',
      borderColor: 'border-l-4 border-l-red-600 border-y-border border-r-border',
      link: '/bookings?filter=overdue',
      description: 'Khách chưa trả phòng',
      show: (ownerAlerts?.overdueCheckouts.length || 0) > 0,
    },
    {
      id: 'unpaid',
      label: 'Chưa thanh toán',
      count: ownerAlerts?.unpaidBookings.length || 0,
      icon: CreditCard,
      color: 'text-amber-600',
      bgColor: 'bg-background',
      borderColor: 'border-l-4 border-l-amber-600 border-y-border border-r-border',
      link: '/bookings?filter=unpaid',
      description: 'Booking đã checkout',
      show: (ownerAlerts?.unpaidBookings.length || 0) > 0,
    },
    {
      id: 'damages',
      label: 'Đồ hỏng/mất',
      count: ownerAlerts?.unresolvedDamages.length || 0,
      icon: AlertCircle,
      color: 'text-orange-600',
      bgColor: 'bg-background',
      borderColor: 'border-l-4 border-l-orange-600 border-y-border border-r-border',
      link: '/reports/inventory?tab=damages',
      description: 'Chưa xử lý',
      show: (ownerAlerts?.unresolvedDamages.length || 0) > 0,
    },
    {
      id: 'low-stock',
      label: 'Tồn kho thấp',
      count: stats?.low_stock_count || 0,
      icon: Package,
      color: 'text-blue-600',
      bgColor: 'bg-background',
      borderColor: 'border-l-4 border-l-blue-600 border-y-border border-r-border',
      link: '/items?stockStatus=low_stock',
      description: 'Cần bổ sung',
      show: (stats?.low_stock_count || 0) > 0,
    },
    {
      id: 'critical-items',
      label: 'Cần bổ sung gấp',
      count: lowStockItems?.filter(item => (item.quantity_in_stock || 0) <= 5).length || 0,
      icon: AlertTriangle,
      color: 'text-red-700',
      bgColor: 'bg-background',
      borderColor: 'border-l-4 border-l-red-700 border-y-border border-r-border',
      link: '/items?stockStatus=low_stock',
      show: false,
    },
  ]

  const visibleAlerts = alerts.filter((a) => a.show)

  if (visibleAlerts.length === 0) {
    return (
      <div className="border border-l-4 border-l-green-600 border-y-border border-r-border bg-background rounded-lg p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full border border-green-600 flex items-center justify-center">
            <svg className="h-4 w-4 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-green-800 dark:text-green-200">Mọi thứ ổn!</h3>
            <p className="text-xs text-muted-foreground">Không có cảnh báo cần xử lý</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-medium text-foreground">Cảnh báo cần chú ý</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {visibleAlerts.reduce((sum, a) => sum + a.count, 0)} vấn đề
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {visibleAlerts.map((alert) => (
          <Link
            key={alert.id}
            to={alert.link}
            className={cn(
              'flex items-center justify-between p-3 rounded-lg border transition-colors',
              alert.bgColor,
              alert.borderColor,
              'hover:opacity-80'
            )}
          >
            <div className="flex items-center gap-3">
              <alert.icon className={cn('h-5 w-5', alert.color)} />
              <div>
                <p className="text-sm font-medium text-foreground">{alert.label}</p>
                <p className="text-xs text-muted-foreground">{alert.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className={cn('text-lg font-semibold', alert.color)}>{alert.count}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
