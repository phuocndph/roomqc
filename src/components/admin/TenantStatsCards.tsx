import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, Clock, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react'
import { SuperAdminStats } from '@/hooks/useSuperAdminStats'
import { formatCurrency } from '@/lib/utils'

interface TenantStatsCardsProps {
  stats: SuperAdminStats | undefined
}

export function TenantStatsCards({ stats }: TenantStatsCardsProps) {
  if (!stats) {
    return null
  }

  const cards = [
    {
      title: 'Tổng số Tenant',
      value: stats.total_tenants,
      icon: Building2,
      description: `${stats.active_tenants} đang hoạt động`,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Tenant dùng thử',
      value: stats.trial_tenants,
      icon: Clock,
      description: 'Đang trong giai đoạn thử nghiệm',
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-950',
    },
    {
      title: 'Sắp hết hạn (7 ngày)',
      value: stats.expiring_7_days,
      icon: AlertTriangle,
      description: `${stats.expiring_today} hết hạn hôm nay`,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-950',
    },
    {
      title: 'Tenant bị tạm ngưng',
      value: stats.suspended_tenants,
      icon: AlertTriangle,
      description: `${stats.in_grace_period} trong grace period`,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-950',
    },
    {
      title: 'Doanh thu tháng này',
      value: formatCurrency(stats.revenue_this_month),
      icon: DollarSign,
      description: `MRR: ${formatCurrency(stats.mrr)}`,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950',
    },
    {
      title: 'Đăng ký mới tháng này',
      value: stats.new_signups_this_month,
      icon: TrendingUp,
      description: `${stats.churned_this_month} khách hàng rời đi`,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card, index) => {
        const Icon = card.icon
        return (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <div className={`p-2 rounded-md ${card.bgColor}`}>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
