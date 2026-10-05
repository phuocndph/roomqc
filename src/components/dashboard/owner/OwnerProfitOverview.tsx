import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useRevenueReport } from '@/hooks/useRevenueReport'
import { useBookingStats } from '@/hooks/useBookingStats'
import { TrendingUp, TrendingDown, DollarSign, CreditCard, Clock, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

const formatCompact = (value: number) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`
  }
  return value.toString()
}

export function OwnerProfitOverview() {
  const { data: report, isLoading } = useRevenueReport()
  const { data: bookingStats } = useBookingStats()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-48" />
        </CardContent>
      </Card>
    )
  }

  if (!report) return null

  const stats = [
    {
      label: 'Doanh thu tháng này',
      value: report.currentPeriod.paidRevenue,
      icon: DollarSign,
      color: 'text-green-700 dark:text-green-500',
      bgColor: 'border border-l-4 border-l-green-600 bg-background',
    },
    {
      label: 'Chờ thanh toán',
      value: report.currentPeriod.pendingRevenue,
      icon: Clock,
      color: 'text-amber-700 dark:text-amber-500',
      bgColor: 'border border-l-4 border-l-amber-600 bg-background',
    },
    {
      label: 'Số booking',
      value: report.currentPeriod.bookingsCount,
      icon: CreditCard,
      color: 'text-blue-700 dark:text-blue-500',
      bgColor: 'border border-l-4 border-l-blue-600 bg-background',
      isCurrency: false,
    },
    {
      label: 'TB/booking',
      value: report.currentPeriod.averageBookingValue,
      icon: Wallet,
      color: 'text-slate-700 dark:text-slate-300',
      bgColor: 'border border-l-4 border-l-slate-600 bg-background',
    },
  ]

  const growthPositive = report.revenueGrowth >= 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-600" />
          Doanh thu & Lợi nhuận
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-full',
            growthPositive ? 'border border-green-600 text-green-700' : 'border border-red-600 text-red-700'
          )}>
            {growthPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(report.revenueGrowth).toFixed(1)}%
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/reports/finance?tab=room-revenue">Chi tiết</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={cn('p-3 rounded-lg', stat.bgColor)}
            >
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className={cn('h-4 w-4', stat.color)} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className={cn('text-lg font-semibold', stat.color)}>
                {stat.isCurrency === false 
                  ? stat.value 
                  : formatCurrency(stat.value)}
              </p>
            </div>
          ))}
        </div>

        {/* Revenue Trend Chart */}
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={report.monthlyTrends}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickFormatter={formatCompact}
                className="text-muted-foreground"
              />
              <Tooltip 
                formatter={(value: number) => [formatCurrency(value), 'Doanh thu']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#revenueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Comparison */}
        <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-3">
          <span>Tháng trước: {formatCurrency(report.previousPeriod.paidRevenue)}</span>
          <span>Hôm nay: {formatCurrency(bookingStats?.todayRevenue || 0)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
