import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Wind, DollarSign, Package, Star, Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/ui/stat-card'
import { LaundryExpenseChart } from '@/components/laundry/LaundryExpenseChart'
import { ActiveBatchesTable } from '@/components/laundry/ActiveBatchesTable'
import { VendorPerformanceTable } from '@/components/laundry/VendorPerformanceTable'
import { LaundryRequestsTab } from '@/components/laundry/LaundryRequestsTab'
import { MobileLaundryDashboard } from '@/components/laundry/MobileLaundryDashboard'
import { useLaundryDashboardStats } from '@/hooks/useLaundryDashboard'
import { useLaundryBatches } from '@/hooks/useLaundryBatches'
import { usePendingLaundryRequestsCount } from '@/hooks/useLaundryRequests'
import { useBreakpoint } from '@/lib/breakpoints'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

export function LaundryDashboardPage() {
  const { t } = useTranslation('laundry')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isMobile } = useBreakpoint()
  
  const activeTab = searchParams.get('tab') || 'batches'
  const sendBatchId = searchParams.get('sendBatch')
  
  // Gọi TẤT CẢ hooks trước điều kiện isMobile
  const { data: stats, isLoading: statsLoading } = useLaundryDashboardStats()
  const { data: activeBatches, isLoading: batchesLoading } = useLaundryBatches({})
  const { data: pendingRequestsCount } = usePendingLaundryRequestsCount()
  
  // Auto switch to requests tab when sendBatch param exists
  useEffect(() => {
    if (sendBatchId && activeTab !== 'requests') {
      const newParams = new URLSearchParams(searchParams)
      newParams.set('tab', 'requests')
      setSearchParams(newParams)
    }
  }, [sendBatchId, activeTab, searchParams, setSearchParams])
  
  // Kiểm tra mobile SAU KHI tất cả hooks đã được gọi
  if (isMobile) {
    return <MobileLaundryDashboard />
  }
  
  const activeBatchesData = activeBatches?.batches.filter(
    b => ['delivered', 'washing', 'ready'].includes(b.status)
  ) || []
  
  const handleTabChange = (value: string) => {
    const newParams = new URLSearchParams()
    if (value !== 'batches') {
      newParams.set('tab', value)
    }
    // Clear sendBatch param when switching tabs
    setSearchParams(newParams)
  }
  
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        action={{
          label: t('newBatch'),
          icon: Plus,
          onClick: () => navigate('/laundry/batches/new'),
        }}
      />
      
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('dashboard.itemsInLaundry')}
          value={stats ? formatNumber(stats.items_in_laundry) : '0'}
          icon={Wind}
          description={stats ? t('dashboard.batchesProcessing', { count: stats.active_batches }) : undefined}
          isLoading={statsLoading}
        />
        
        <StatCard
          title={t('dashboard.monthCost')}
          value={stats ? formatCurrency(stats.current_month_cost) : '0 ₫'}
          icon={DollarSign}
          change={stats ? {
            value: stats.cost_change_percent,
            label: t('dashboard.comparedToLastMonth'),
          } : undefined}
          isLoading={statsLoading}
        />
        
        <StatCard
          title={t('dashboard.activeBatches')}
          value={stats ? stats.active_batches : '0'}
          icon={Package}
          description={t('dashboard.batch')}
          isLoading={statsLoading}
        />
        
        <StatCard
          title={t('dashboard.avgQuality')}
          value={stats ? `${stats.avg_quality_rating.toFixed(1)}/5.0` : '0/5.0'}
          icon={Star}
          description={t('dashboard.last30Days')}
          isLoading={statsLoading}
        />
      </div>
      
      {/* Tabs: Active Batches / Pending Requests */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="batches" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            {t('dashboard.activeBatches')}
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Yêu cầu từ phòng
            {pendingRequestsCount !== undefined && pendingRequestsCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {pendingRequestsCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="batches" className="mt-4">
          <ActiveBatchesTable
            batches={activeBatchesData}
            isLoading={batchesLoading}
          />
        </TabsContent>
        
        <TabsContent value="requests" className="mt-4">
          <LaundryRequestsTab />
        </TabsContent>
      </Tabs>
      
      {/* Charts & Performance */}
      <div className="grid gap-6 lg:grid-cols-2">
        <LaundryExpenseChart />
        <VendorPerformanceTable />
      </div>
    </div>
  )
}
