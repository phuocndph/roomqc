import { useNavigate } from 'react-router-dom'
import { Plus, Wind, DollarSign, Package, Star, Truck, CheckCircle, Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PullToRefresh } from '@/components/mobile/TouchOptimized'
import { StatScrollContainer, MobileStatCard } from '@/components/mobile/MobileDashboardStats'
import { SwipeableCard } from '@/components/mobile/TouchOptimized'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MobileLaundryExpenseChart } from '@/components/laundry/MobileLaundryExpenseChart'
import { MobileLaundryVendorPerformance } from '@/components/laundry/MobileLaundryVendorPerformance'
import { useLaundryDashboardStats } from '@/hooks/useLaundryDashboard'
import { useLaundryBatches } from '@/hooks/useLaundryBatches'
import { usePendingLaundryRequestsCount } from '@/hooks/useLaundryRequests'
import { useQueryClient } from '@tanstack/react-query'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { format } from 'date-fns'
import { vi, enUS } from 'date-fns/locale'

const statusColors = {
  delivered: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  washing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  ready: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  received: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
} as const

export function MobileLaundryDashboard() {
  const { t, i18n } = useTranslation('laundry')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const dateLocale = i18n.language === 'vi' ? vi : enUS
  const { data: stats, isLoading: statsLoading } = useLaundryDashboardStats()
  const { data: batchesData, isLoading: batchesLoading } = useLaundryBatches({})
  const { data: pendingRequestsCount } = usePendingLaundryRequestsCount()

  const activeBatches = batchesData?.batches.filter(
    b => ['delivered', 'washing', 'ready'].includes(b.status)
  ) || []

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['laundry-dashboard-stats'] })
    await queryClient.invalidateQueries({ queryKey: ['laundry-batches'] })
    await queryClient.invalidateQueries({ queryKey: ['laundry-requests-pending-count'] })
  }

  const handleQuickReceive = (batchId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(`/laundry/batches/${batchId}/receive`)
  }

  const statusLabels: Record<string, string> = {
    delivered: t('statusBadge.delivered'),
    washing: t('statusBadge.washing'),
    ready: t('statusBadge.ready'),
    received: t('statusBadge.received'),
  }

  const quickActions = [
    {
      icon: Plus,
      label: t('dashboard.createBatch'),
      onClick: () => navigate('/laundry/batches/new'),
      color: 'text-cyan-600 dark:text-cyan-400',
    },
    {
      icon: Inbox,
      label: 'Đồ giặt từ phòng',
      onClick: () => navigate('/laundry?tab=requests'),
      color: 'text-amber-600 dark:text-amber-400',
      badge: pendingRequestsCount && pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
    },
    {
      icon: Truck,
      label: t('dashboard.viewVendors'),
      onClick: () => navigate('/laundry/vendors'),
      color: 'text-purple-600 dark:text-purple-400',
    },
    {
      icon: Package,
      label: t('dashboard.viewAllBatches'),
      onClick: () => navigate('/laundry/batches'),
      color: 'text-blue-600 dark:text-blue-400',
    },
  ]

  if (statsLoading || batchesLoading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-4 pb-20">
        {/* Stats Overview */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold px-4">{t('dashboard.overview')}</h2>
          <StatScrollContainer>
            <MobileStatCard
              icon={Wind}
              title={t('dashboard.itemsInLaundry')}
              value={formatNumber(stats?.items_in_laundry || 0)}
              variant="default"
            />
            <MobileStatCard
              icon={DollarSign}
              title={t('dashboard.monthCost')}
              value={formatCurrency(stats?.current_month_cost || 0)}
              trend={stats?.cost_change_percent ? `${stats.cost_change_percent > 0 ? '+' : ''}${stats.cost_change_percent.toFixed(1)}%` : undefined}
              variant="default"
            />
            <MobileStatCard
              icon={Package}
              title={t('dashboard.activeBatches')}
              value={stats?.active_batches || 0}
              variant="default"
            />
            <MobileStatCard
              icon={Star}
              title={t('dashboard.avgQuality')}
              value={`${stats?.avg_quality_rating.toFixed(1) || 0}/5.0`}
              variant="success"
            />
          </StatScrollContainer>
        </div>

        {/* Quick Actions */}
        <div className="px-4 space-y-3">
          <h2 className="text-lg font-semibold">{t('dashboard.quickActions')}</h2>
          <div className="grid grid-cols-2 xs:grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <Card
                key={action.label}
                className="cursor-pointer active:scale-95 transition-transform relative"
                onClick={action.onClick}
              >
                <CardContent className="flex flex-col items-center justify-center p-4 space-y-2">
                  <div className="relative">
                    <action.icon className={`h-6 w-6 ${action.color}`} />
                    {action.badge && (
                      <Badge 
                        variant="destructive" 
                        className="absolute -top-2 -right-3 h-4 min-w-4 px-1 text-[10px]"
                      >
                        {action.badge}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs font-medium text-center">{action.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Active Batches */}
        {activeBatches.length > 0 && (
          <div className="px-4 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">{t('dashboard.processingBatches')}</h2>
              <button
                onClick={() => navigate('/laundry/batches')}
                className="text-sm text-primary hover:underline"
              >
                {t('dashboard.viewAll')}
              </button>
            </div>
            <div className="space-y-2">
              {activeBatches.slice(0, 5).map((batch) => (
                <SwipeableCard
                  key={batch.id}
                  onSwipeLeft={() => navigate(`/laundry/batches/${batch.id}`)}
                  onSwipeRight={() => navigate(`/laundry/batches/${batch.id}/receive`)}
                >
                  <Card className="relative overflow-hidden">
                    {/* Swipe hint */}
                    <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-r from-primary/30 to-transparent" />
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{batch.batch_code}</p>
                            <p className="text-sm text-muted-foreground">
                              {batch.vendor_name}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={statusColors[batch.status as keyof typeof statusColors]}>
                              {statusLabels[batch.status]}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {batch.total_items} {t('units.items')} • {batch.total_weight_kg}{t('units.kg')}
                          </span>
                          {batch.expected_return_date && (
                            <span className="text-muted-foreground">
                              {t('dashboard.returnDate')}: {format(new Date(batch.expected_return_date), 'dd/MM', { locale: dateLocale })}
                            </span>
                          )}
                        </div>
                        {/* Quick Receive Button - only show for ready batches */}
                        {batch.status === 'ready' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full mt-2 text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-950"
                            onClick={(e) => handleQuickReceive(batch.id, e)}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Nhận hàng nhanh
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </SwipeableCard>
              ))}
            </div>
          </div>
        )}

        {/* No Active Batches */}
        {activeBatches.length === 0 && (
          <div className="px-4">
            <Card className="bg-muted/50">
              <CardContent className="p-6 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {t('dashboard.noActiveBatches')}
                </p>
                <button
                  onClick={() => navigate('/laundry/batches/new')}
                  className="mt-3 text-sm text-primary hover:underline"
                >
                  {t('dashboard.createNewBatch')}
                </button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Expense Chart */}
        <div className="px-4">
          <MobileLaundryExpenseChart />
        </div>

        {/* Vendor Performance */}
        <div className="px-4">
          <MobileLaundryVendorPerformance />
        </div>

        {/* Tips */}
        <div className="px-4 pb-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex items-center gap-1 text-primary">
                <span className="text-lg">👆</span>
                <span className="text-xs font-medium">Vuốt</span>
              </div>
              <div className="flex-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">← Trái:</span> Xem chi tiết • 
                <span className="font-medium text-foreground ml-1">Phải →:</span> Nhận hàng
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PullToRefresh>
  )
}
