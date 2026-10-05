import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Package, ChevronLeft, ChevronRight, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DistributionOrderCard } from '@/components/distribution/components/DistributionOrderCard'
import { DistributionOrderTable } from '@/components/distribution/components/DistributionOrderTable'
import { RouteFiltersCard } from '@/components/distribution/components/RouteFiltersCard'
import { PendingSupplementsBanner } from '@/components/distribution/components/PendingSupplementsBanner'
import { DistributionOrderQuickDialog } from '@/components/distribution/dialogs/DistributionOrderQuickDialog'
import { useRoutesWithFilters, useAvailableFloors } from '@/hooks/useRouteFilters'
import { usePendingSupplementCount } from '@/hooks/useSupplementRequests'
import { useIsMobile } from '@/hooks/use-mobile'
import { useUser } from '@/hooks/useUser'
import { useQueryClient } from '@tanstack/react-query'
import { getPendingTask } from '@/components/distribution/utils/orderPresentation'
import type { RouteFilters } from '@/types/route-batch.types'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25
const STOREKEEPER_LEVELS = ['tenant_owner', 'manager', 'warehouse_manager', 'storekeeper', 'hotel_manager', 'supervisor']

type TabValue = 'todo' | 'delivering' | 'done' | 'all'

export default function DistributionOrdersPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const { user } = useUser()

  const switchView = (view: 'manual' | 'from-requests') => {
    const p = new URLSearchParams(searchParams)
    p.set('tab', 'operations')
    p.set('sub', 'outbound')
    p.set('view', view)
    setSearchParams(p, { replace: true })
  }


  const [filters, setFilters] = useState<RouteFilters>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [tab, setTab] = useState<TabValue>('todo')
  const [quickOrderId, setQuickOrderId] = useState<string | null>(null)

  const { data, isLoading } = useRoutesWithFilters(filters, page, PAGE_SIZE)
  const { data: availableFloors = [] } = useAvailableFloors()
  const { data: pendingSupplementCount = 0 } = usePendingSupplementCount()

  const orders = useMemo(() => data?.data ?? [], [data?.data])
  const totalCount = data?.totalCount || 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const userLevel = (user as any)?.position?.user_level_code || (user as any)?.user_level_code || ''
  const isCurrentUserStorekeeper = STOREKEEPER_LEVELS.includes(userLevel)
  const currentUserId = user?.id ?? null

  // Compute task per order, then split into tabs
  const enriched = useMemo(() => {
    return orders.map(o => {
      const task = getPendingTask({
        status: o.status,
        hasAssignee: !!o.assigned_to,
        assignedToName: o.assigned_to_name,
        isCurrentUserAssignee: !!currentUserId && o.assigned_to === currentUserId,
        isCurrentUserStorekeeper,
        isCurrentUserCreator: !!currentUserId && o.created_by === currentUserId,
        totalRooms: o.total_rooms,
        completedRooms: o.rooms_completed,
      })
      return { order: o, task }
    })
  }, [orders, currentUserId, isCurrentUserStorekeeper])

  const counts = useMemo(() => {
    let todo = 0
    let delivering = 0
    let done = 0
    enriched.forEach(({ order, task }) => {
      if (task.priority >= 3) todo++
      if (order.status === 'in_progress') delivering++
      if (order.status === 'completed' || (order.status as string) === 'closed') done++
    })
    return { todo, delivering, done }
  }, [enriched])

  const filteredByTab = useMemo(() => {
    let list = enriched
    if (tab === 'todo') list = enriched.filter(e => e.task.priority >= 3).sort((a, b) => b.task.priority - a.task.priority)
    else if (tab === 'delivering') list = enriched.filter(e => e.order.status === 'in_progress')
    else if (tab === 'done') list = enriched.filter(e => e.order.status === 'completed' || (e.order.status as string) === 'closed')
    return list
  }, [enriched, tab])

  const filteredOrders = (
    searchQuery
      ? filteredByTab.filter(e => e.order.order_code.toLowerCase().includes(searchQuery.toLowerCase()))
      : filteredByTab
  ).map(e => e.order)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: ['distribution-routes'] })
    setIsRefreshing(false)
  }

  const handleFiltersChange = (newFilters: RouteFilters) => {
    setFilters(newFilters)
    setPage(1)
  }

  const handleOrderClick = (orderId: string) => {
    setQuickOrderId(orderId)
  }

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Package className="h-10 w-10 text-muted-foreground/50 mb-2" />
      <p className="text-sm text-muted-foreground">
        {tab === 'todo' ? 'Không có việc nào cần xử lý ngay' : 'Không có phiếu giao hàng nào'}
      </p>
      <Button size="sm" className="mt-3" onClick={() => switchView('manual')}>
        <Plus className="h-4 w-4 mr-1" />
        Tạo phiếu mới
      </Button>
    </div>
  )

  const Pagination = () => {
    if (totalPages <= 1) return null
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground">{page}/{totalPages}</span>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  const TabsBar = (
    <Tabs value={tab} onValueChange={(v) => { setTab(v as TabValue); setPage(1) }}>
      <TabsList className="h-9">
        <TabsTrigger value="todo" className="gap-1.5 text-xs">
          Cần làm ngay
          {counts.todo > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{counts.todo}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="delivering" className="gap-1.5 text-xs">
          Đang giao
          {counts.delivering > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{counts.delivering}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="done" className="text-xs">Hoàn thành</TabsTrigger>
        <TabsTrigger value="all" className="text-xs">Tất cả</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const QuickDialog = (
    <DistributionOrderQuickDialog
      orderId={quickOrderId}
      open={!!quickOrderId}
      onOpenChange={(o) => !o && setQuickOrderId(null)}
    />
  )

  // Mobile view
  if (isMobile) {
    return (
      <>
      <div className="flex flex-col h-full">
        <div className="sticky top-0 z-10 bg-background border-b px-3 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold">Phiếu giao hàng</h1>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} disabled={isRefreshing} aria-label="Làm mới">
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>
          </div>
          {TabsBar}
          <RouteFiltersCard
            filters={filters}
            onFiltersChange={handleFiltersChange}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            floors={availableFloors}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            isMobile
          />
        </div>

        {pendingSupplementCount > 0 && (
          <div className="px-3 pt-2">
            <PendingSupplementsBanner />
          </div>
        )}

        <div className="flex-1 overflow-auto px-3 py-2 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {filteredOrders.map(order => (
                <DistributionOrderCard
                  key={order.id}
                  order={order as any}
                  onClick={() => handleOrderClick(order.id)}
                  currentUserId={currentUserId}
                  isCurrentUserStorekeeper={isCurrentUserStorekeeper}
                />
              ))}
              {totalPages > 1 && (
                <div className="flex justify-center pt-2">
                  <Pagination />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {QuickDialog}
      </>
    )
  }

  // Desktop
  return (
    <>
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Phiếu giao hàng</h1>
          <p className="text-sm text-muted-foreground">Quản lý các phiếu giao đồ đến phòng</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleRefresh} disabled={isRefreshing} aria-label="Làm mới">
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      <PendingSupplementsBanner />

      {TabsBar}

      <RouteFiltersCard
        filters={filters}
        onFiltersChange={handleFiltersChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        floors={availableFloors}
      />

      <div className="border rounded-lg">
        <DistributionOrderTable
          orders={filteredOrders as any}
          onRowClick={(order) => handleOrderClick(order.id)}
          isLoading={isLoading}
          emptyMessage={<EmptyState />}
          currentUserId={currentUserId}
          isCurrentUserStorekeeper={isCurrentUserStorekeeper}
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t">
            <span className="text-xs text-muted-foreground">
              {filteredOrders.length}/{totalCount} phiếu
            </span>
            <Pagination />
          </div>
        )}
      </div>
    </div>
    {QuickDialog}
    </>
  )
}
