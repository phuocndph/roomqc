import { DollarSign, TrendingDown, ShoppingCart, Wrench, Wind } from 'lucide-react'
import { useFinancialReport } from '@/hooks/useReports'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface FinancialOverviewProps {
  dateRange: { start: Date; end: Date }
}

export function FinancialOverview({ dateRange }: FinancialOverviewProps) {
  const financial = useFinancialReport(dateRange)
  const { data: stats, isLoading: statsLoading, error: statsError } = useDashboardStats()
  const totals = financial.data?.cost_summary
  const isLoading = financial.isPending || statsLoading

  if (financial.isError || statsError) return <p role="alert">Không tải được tổng quan tài chính. Vui lòng tải lại hoặc kiểm tra quyền xem.</p>

  if (isLoading) {
    return (
      <div className="border border-border rounded-none p-4">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    )
  }

  if (!totals || !stats) return <p role="status">Chưa có dữ liệu tổng quan tài chính.</p>

  const metrics = [
    {
      label: 'Tồn kho hiện tại',
      value: stats?.total_value || 0,
      icon: DollarSign,
      color: 'text-primary',
      bgColor: 'border-l-primary',
    },
    {
      label: 'Chi phí trực tiếp trong kỳ',
      value: totals.total_cost,
      icon: TrendingDown,
      color: 'text-destructive',
      bgColor: 'border-l-destructive',
    },
    {
      label: 'Chi phí mua sắm',
      value: totals.purchase_cost,
      icon: ShoppingCart,
      color: 'text-chart-1',
      bgColor: 'border-l-chart-1',
    },
    {
      label: 'Chi phí giặt là',
      value: totals.laundry_cost,
      icon: Wind,
      color: 'text-chart-2',
      bgColor: 'border-l-chart-2',
    },
    {
      label: 'Chi phí bảo trì',
      value: totals.maintenance_cost,
      icon: Wrench,
      color: 'text-chart-3',
      bgColor: 'border-l-chart-3',
    },
  ]

  return (
    <div className="border border-border rounded-none p-4">
      <h3 className="text-sm font-medium text-foreground mb-4">Tổng quan tài chính</h3>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className={`flex items-start gap-3 p-3 rounded-none border border-l-4 bg-background ${metric.bgColor}`}>
            <div className={`p-2 rounded-md ${metric.bgColor}`}>
              <metric.icon className={`h-4 w-4 ${metric.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{metric.label}</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {formatCurrency(metric.value)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
