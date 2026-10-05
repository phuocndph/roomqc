import { useMemo } from 'react'
import { DollarSign, TrendingDown, ShoppingCart, Wrench, Wind, AlertTriangle, Package, ChevronRight, BarChart3, FileText, Settings, Building2, Users, Receipt, TrendingUp, Clock } from 'lucide-react'
import { useMonthlyExpenses } from '@/hooks/useMonthlyExpenses'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { useLowStockItems } from '@/hooks/useInventoryDashboard'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUser } from '@/hooks/useUser'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useBookingStats } from '@/hooks/useBookingStats'
import { SetupChecklist } from './SetupChecklist'

type DateRangePreset = '1m' | '3m' | '6m' | '12m'

interface MobileOwnerDashboardProps {
  dateRange: { start: Date; end: Date }
  datePreset: DateRangePreset
  onDatePresetChange: (preset: DateRangePreset) => void
}

export function MobileOwnerDashboard({ dateRange, datePreset, onDatePresetChange }: MobileOwnerDashboardProps) {
  const { user, tenantId } = useUser()
  const { isAllHotelsMode, selectedHotel } = useHotelContext()
  const monthsDiff = Math.max(1, Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24 * 30)))
  
  const { data: expenses, isLoading: expensesLoading } = useMonthlyExpenses(monthsDiff)
  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: lowStockItems, isLoading: lowStockLoading } = useLowStockItems()
  const { data: bookingStats, isLoading: bookingStatsLoading } = useBookingStats()

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

  // Calculate pending payment from all unpaid bookings (subtract deposit)
  const pendingPayment = pendingBookings?.reduce((sum, b) => {
    const remaining = (b.total_amount || 0) - (b.amount_paid || 0) - (b.deposit_amount || 0)
    return sum + Math.max(0, remaining)
  }, 0) || 0

  const isLoading = expensesLoading || statsLoading || lowStockLoading || bookingStatsLoading || pendingLoading

  const totals = useMemo(() => {
    if (!expenses) return { purchase: 0, laundry: 0, maintenance: 0, total: 0 }
    return expenses.reduce(
      (acc, exp) => ({
        purchase: acc.purchase + exp.purchase,
        laundry: acc.laundry + exp.laundry,
        maintenance: acc.maintenance + exp.maintenance,
        total: acc.total + exp.purchase + exp.laundry + exp.maintenance,
      }),
      { purchase: 0, laundry: 0, maintenance: 0, total: 0 }
    )
  }, [expenses])

  const alerts = [
    {
      id: 'low-stock',
      label: 'Tồn kho thấp',
      count: stats?.low_stock_count || 0,
      icon: Package,
      color: 'text-amber-600',
      link: '/items?stockStatus=low_stock',
      show: (stats?.low_stock_count || 0) > 0,
    },
    {
      id: 'critical-items',
      label: 'Cần bổ sung gấp',
      count: lowStockItems?.filter(item => (item.quantity_in_stock || 0) <= 5).length || 0,
      icon: AlertTriangle,
      color: 'text-red-600',
      link: '/items?stockStatus=low_stock',
      show: false,
    },
  ]

  const visibleAlerts = alerts.filter((a) => a.show)

  const quickLinks = [
    { label: 'Báo cáo', icon: BarChart3, href: '/reports', color: 'text-chart-1' },
    { label: 'Tài chính', icon: FileText, href: '/reports/finance', color: 'text-chart-2' },
    { label: 'Khách sạn', icon: Building2, href: '/settings/hotels', color: 'text-chart-3' },
    { label: 'Nhân sự', icon: Users, href: '/settings/users', color: 'text-chart-4' },
  ]

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Xin chào, {user?.full_name?.split(' ').pop() || 'Owner'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isAllHotelsMode ? 'Toàn hệ thống' : selectedHotel?.name}
          </p>
        </div>
        <Select value={datePreset} onValueChange={(v) => onDatePresetChange(v as DateRangePreset)}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1m">1 tháng</SelectItem>
            <SelectItem value="3m">3 tháng</SelectItem>
            <SelectItem value="6m">6 tháng</SelectItem>
            <SelectItem value="12m">12 tháng</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Setup Checklist */}
      <SetupChecklist />

      {/* Critical Alerts */}
      {visibleAlerts.length > 0 && (
        <div className="space-y-2">
          {visibleAlerts.map((alert) => (
            <Link
              key={alert.id}
              to={alert.link}
              className="flex items-center justify-between p-3 rounded-lg border border-l-4 border-l-amber-600 bg-background"
            >
              <div className="flex items-center gap-2">
                <alert.icon className={cn('h-4 w-4', alert.color)} />
                <span className="text-sm text-foreground">{alert.label}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={cn('text-sm font-semibold', alert.color)}>{alert.count}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Revenue Section - Today */}
      <div className="border border-border rounded-lg divide-y divide-border">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-green-600" />
            <span className="text-xs text-muted-foreground">Đã thu hôm nay</span>
          </div>
          <span className="text-sm font-semibold text-green-600">
            {formatCurrency(bookingStats?.todayRevenue || 0)}
          </span>
        </div>
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-600" />
            <span className="text-xs text-muted-foreground">Chờ thanh toán</span>
          </div>
          <span className="text-sm font-semibold text-orange-600">
            {formatCurrency(pendingPayment)}
          </span>
        </div>
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Doanh thu dự kiến</span>
          </div>
          <span className="text-sm font-semibold text-primary">
            {formatCurrency(bookingStats?.projectedRevenue || 0)}
          </span>
        </div>
      </div>

      {/* Financial Overview */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Giá trị tồn kho</span>
            </div>
            <span className="text-sm font-semibold text-foreground">
              {formatCurrency(stats?.total_value || 0)}
            </span>
          </div>
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Tổng chi phí</span>
            </div>
            <span className="text-sm font-semibold text-destructive">
              {formatCurrency(totals.total)}
            </span>
          </div>
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-chart-1" />
              <span className="text-xs text-muted-foreground">Mua sắm</span>
            </div>
            <span className="text-sm font-medium text-foreground">
              {formatCurrency(totals.purchase)}
            </span>
          </div>
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <Wind className="h-4 w-4 text-chart-2" />
              <span className="text-xs text-muted-foreground">Giặt là</span>
            </div>
            <span className="text-sm font-medium text-foreground">
              {formatCurrency(totals.laundry)}
            </span>
          </div>
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-chart-3" />
              <span className="text-xs text-muted-foreground">Bảo trì</span>
            </div>
            <span className="text-sm font-medium text-foreground">
              {formatCurrency(totals.maintenance)}
            </span>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-4 gap-2">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-background border border-border"
          >
            <link.icon className={cn('h-5 w-5', link.color)} />
            <span className="text-[10px] font-medium text-foreground text-center">{link.label}</span>
          </Link>
        ))}
      </div>

      {/* Link to Reports */}
      <Link
        to="/reports"
        className="flex items-center justify-between p-4 rounded-lg border border-l-4 border-l-primary bg-background"
      >
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Xem báo cáo chi tiết</p>
            <p className="text-xs text-muted-foreground">Phân tích hiệu suất toàn diện</p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </Link>
    </div>
  )
}
