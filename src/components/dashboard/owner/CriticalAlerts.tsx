import { AlertTriangle, Package, Wind, Wrench, ChevronRight } from 'lucide-react'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { useLowStockItems } from '@/hooks/useInventoryDashboard'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function CriticalAlerts() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: lowStockItems, isLoading: lowStockLoading } = useLowStockItems()

  const isLoading = statsLoading || lowStockLoading

  if (isLoading) {
    return (
      <div className="border border-border rounded-lg p-4">
        <Skeleton className="h-5 w-32 mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    )
  }

  const alerts = [
    {
      id: 'low-stock',
      label: 'Tồn kho thấp',
      count: stats?.low_stock_count || 0,
      icon: Package,
      color: 'text-amber-600',
      bgColor: 'bg-background border-l-4 border-l-amber-600',
      borderColor: 'border-amber-200 dark:border-amber-800',
      link: '/items?stockStatus=low_stock',
      show: (stats?.low_stock_count || 0) > 0,
    },
    {
      id: 'in-laundry',
      label: 'Đang giặt',
      count: stats?.in_laundry || 0,
      icon: Wind,
      color: 'text-blue-600',
      bgColor: 'bg-background border-l-4 border-l-blue-600',
      borderColor: 'border-blue-200 dark:border-blue-800',
      link: '/laundry',
      description: `${stats?.active_laundry_batches || 0} lô đang xử lý`,
      show: (stats?.in_laundry || 0) > 0,
    },
    {
      id: 'critical-items',
      label: 'Cần bổ sung gấp',
      count: lowStockItems?.filter(item => (item.quantity_in_stock || 0) <= 5).length || 0,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-background border-l-4 border-l-red-600',
      borderColor: 'border-red-200 dark:border-red-800',
      link: '/items?stockStatus=low_stock',
      show: (lowStockItems?.filter(item => (item.quantity_in_stock || 0) <= 5).length || 0) > 0,
    },
  ]

  const visibleAlerts = alerts.filter((a) => a.show)

  if (visibleAlerts.length === 0) {
    return null
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-medium text-foreground">Cảnh báo cần chú ý</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                {alert.description && (
                  <p className="text-xs text-muted-foreground">{alert.description}</p>
                )}
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
