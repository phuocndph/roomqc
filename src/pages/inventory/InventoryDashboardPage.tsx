import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  GitCompare,
  ClipboardCheck,
  Plus,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollableTabsList } from '@/components/shared/ScrollableTabsList'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useBreakpoint } from '@/lib/breakpoints'
import { useUser } from '@/hooks/useUser'
import type { AppRole } from '@/types/database.types'
import { AccessDenied } from '@/components/auth/AccessDenied'
import { useCanAccess } from '@/components/auth/PermissionRoute'
import { InventoryOverviewSection } from '@/components/inventory/InventoryOverviewSection'
import { MobileInventoryDashboard } from '@/components/inventory/MobileInventoryDashboard'
import { InventoryQuickSearch } from '@/components/inventory/hub/InventoryQuickSearch'
import { useInventoryHubBadges } from '@/hooks/useInventoryHubBadges'
import { useInventoryHubShortcuts } from '@/hooks/useInventoryHubShortcuts'

const TransactionListPage = lazy(() => import('./TransactionListPage').then(m => ({ default: m.TransactionListPage })))
const AdjustmentListPage = lazy(() => import('./AdjustmentListPage').then(m => ({ default: m.AdjustmentListPage })))
const DistributionOrdersPage = lazy(() => import('./DistributionOrdersPage'))
const ReorderSuggestionsPage = lazy(() => import('./ReorderSuggestionsPage'))
const DeadStockPage = lazy(() => import('./DeadStockPage'))
const InventoryAnalyticsPage = lazy(() => import('./InventoryAnalyticsPage'))
const ItemsPage = lazy(() => import('../items/ItemsPage').then(m => ({ default: m.ItemsPage })))
const CategoriesPage = lazy(() => import('../items/CategoriesPage').then(m => ({ default: m.CategoriesPage })))
const SupplementsPage = lazy(() => import('../supplements/SupplementsPage').then(m => ({ default: m.SupplementsPage })))
const WarehouseListPage = lazy(() => import('../settings/WarehouseListPage'))
const InboundPage = lazy(() => import('./InboundPage').then(m => ({ default: m.InboundPage })))
const OutboundPage = lazy(() => import('./OutboundPage').then(m => ({ default: m.OutboundPage })))
const TransferPage = lazy(() => import('./TransferPage'))



const TabFallback = () => (
  <div className="space-y-3 py-6">
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-64 w-full" />
  </div>
)

type MainTab = 'overview' | 'assets' | 'operations' | 'analytics' | 'settings'
type OpSub = 'transactions' | 'inbound' | 'outbound' | 'transfer' | 'adjustments' | 'distributions' | 'reorder'
type AssetsSub = 'items' | 'categories'
type AnalyticsSub = 'consumption' | 'dead-stock'
type SettingsSub = 'supplements' | 'warehouses'

const defaultSubByTab: Partial<Record<MainTab, OpSub | AssetsSub | AnalyticsSub | SettingsSub>> = {
  assets: 'items',
  operations: 'transactions',
  analytics: 'consumption',
  settings: 'supplements',
}

export function InventoryDashboardPage() {
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasAnyRole } = useUser()
  const inventoryAccess = useCanAccess('inventory', ['view', 'create', 'update', 'manage'])
  const itemsAccess = useCanAccess('items', ['create'])
  const tab = (searchParams.get('tab') as MainTab) || 'overview'
  const sub = searchParams.get('sub') || ''
  const searchRef = useRef<HTMLInputElement>(null)

  const canManageSettings = useMemo(
    () => hasAnyRole(['super_admin', 'owner', 'hotel_manager', 'department_manager'] as AppRole[]),
    [hasAnyRole]
  )

  const canInventoryView = inventoryAccess.canView
  const canInventoryCreate = inventoryAccess.canCreate
  const canItemsCreate = itemsAccess.canCreate

  const { data: badges } = useInventoryHubBadges()

  // Legacy redirect: ?sub=distributions → ?sub=outbound&view=list
  // Legacy redirect: ?view=from-requests → ?view=list (flow giờ inline trong banner)
  // Sprint 2: ref guard để chỉ chạy 1 lần, tránh effect loop khi user back/forward
  const legacyRedirected = useRef(false)
  useEffect(() => {
    if (legacyRedirected.current) return
    if (tab === 'operations' && sub === 'distributions') {
      legacyRedirected.current = true
      const next = new URLSearchParams(searchParams)
      next.set('sub', 'outbound')
      if (!next.get('view')) next.set('view', 'list')
      setSearchParams(next, { replace: true })
      return
    }
    if (tab === 'operations' && sub === 'outbound' && searchParams.get('view') === 'from-requests') {
      legacyRedirected.current = true
      const next = new URLSearchParams(searchParams)
      next.set('view', 'list')
      setSearchParams(next, { replace: true })
      return
    }
    // Legacy: ?tab=assets&sub=new → mở form qua route /items/new, fallback sub=items
    if (tab === 'assets' && sub === 'new') {
      legacyRedirected.current = true
      const next = new URLSearchParams(searchParams)
      next.set('sub', 'items')
      setSearchParams(next, { replace: true })
      navigate('/items/new')
    }
  }, [tab, sub, searchParams, setSearchParams, navigate])

  const outboundView = (searchParams.get('view') as 'list' | 'manual' | 'from-requests') || 'list'
  const setOutboundView = (next: 'list' | 'manual' | 'from-requests') => {
    const params = new URLSearchParams(searchParams)
    params.set('tab', 'operations')
    params.set('sub', 'outbound')
    params.set('view', next)
    setSearchParams(params)
  }

  const setTab = useCallback((next: MainTab, nextSub?: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    if (nextSub) params.set('sub', nextSub)
    else if (defaultSubByTab[next]) params.set('sub', defaultSubByTab[next]!)
    else params.delete('sub')
    setSearchParams(params)
  }, [searchParams, setSearchParams])

  useInventoryHubShortcuts(useCallback((key) => {
    if (key === 'search') {
      searchRef.current?.focus()
    } else if (key === 'overview') setTab('overview')
    else if (key === 'inbound') setTab('operations', 'inbound')
    else if (key === 'outbound') setTab('operations', 'outbound')
    else if (key === 'adjustments') setTab('operations', 'adjustments')
  }, [setTab]))

  const settingsSubValue: SettingsSub = canManageSettings && sub === 'warehouses' ? 'warehouses' : 'supplements'

  const setSub = (next: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('sub', next)
    setSearchParams(params)
  }

  // 2 primary CTAs (Nhập / Xuất) + "Khác" dropdown — same on desktop & mobile.
  const primaryActions = (
    <>
      {canInventoryCreate && (
        <>
          <Button
            size="sm"
            variant="default"
            className="h-10 lg:h-9 font-body"
            onClick={() => navigate('/inventory/inbound/new')}
          >
            <ArrowDownToLine className="h-4 w-4 mr-1.5" />
            Nhập kho
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-10 lg:h-9 font-body"
            onClick={() => navigate('/inventory/outbound/new')}
          >
            <ArrowUpFromLine className="h-4 w-4 mr-1.5" />
            Xuất kho
          </Button>
        </>
      )}
      {(canInventoryCreate || canItemsCreate) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-10 lg:h-9 font-body">
              Khác
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canInventoryCreate && (
              <>
                <DropdownMenuItem onClick={() => navigate('/inventory/transfer/new')}>
                  <GitCompare className="h-4 w-4 mr-2" /> Chuyển kho
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/inventory/adjustments/new')}>
                  <ClipboardCheck className="h-4 w-4 mr-2" /> Kiểm kê
                </DropdownMenuItem>
              </>
            )}
            {canItemsCreate && (
              <DropdownMenuItem onClick={() => navigate('/items/new')}>
                <Plus className="h-4 w-4 mr-2" /> Thêm tài sản
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )

  return (
    <div className="font-body space-y-3 lg:space-y-4">
      {/* Compact topbar on laptop, classic PageHeader on smaller */}
      <div className="hidden lg:flex items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Kho</h1>
        </div>
        <div className="flex items-center gap-2">
          <InventoryQuickSearch ref={searchRef} />
          {primaryActions}
        </div>
      </div>

      <div className="lg:hidden">
        <PageHeader
          title="Kho & Tài sản"
          description="Chọn chức năng Kho từ menu chính"
        >
          <div className="flex items-center gap-2">{primaryActions}</div>
        </PageHeader>
      </div>

      {/* Mobile/tablet: search */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex-1">
          <InventoryQuickSearch ref={searchRef} />
        </div>
      </div>

      <div className="grid gap-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as MainTab)} className="min-w-0">
          <TabsContent value="overview" className="mt-4">
            {isMobile ? <MobileInventoryDashboard /> : <InventoryOverviewSection onNavigate={setTab as (t: string, s?: string) => void} />}
          </TabsContent>

        <TabsContent value="assets" className="mt-4">
          <Tabs
            value={(sub as AssetsSub) || 'items'}
            onValueChange={setSub}
          >
            <ScrollableTabsList className="hidden">
              <TabsList>
                <TabsTrigger value="items">Danh sách tài sản</TabsTrigger>
                <TabsTrigger value="categories">Danh mục</TabsTrigger>
              </TabsList>
            </ScrollableTabsList>
            <TabsContent value="items" className="mt-4">
              <Suspense fallback={<TabFallback />}>
                <ItemsPage />
              </Suspense>
            </TabsContent>
            <TabsContent value="categories" className="mt-4">
              <Suspense fallback={<TabFallback />}>
                <CategoriesPage />
              </Suspense>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="operations" className="mt-4">
          <Tabs
            value={(sub as OpSub) || 'transactions'}
            onValueChange={setSub}
          >
            <ScrollableTabsList className="hidden">
              <TabsList>
                {canInventoryView && <TabsTrigger value="transactions">Lịch sử giao dịch</TabsTrigger>}
                {canInventoryCreate && <TabsTrigger value="inbound">+ Nhập kho</TabsTrigger>}
                {(canInventoryView || canInventoryCreate) && (
                  <TabsTrigger value="outbound">
                    Xuất kho
                    {(badges?.distributionsPending ?? 0) > 0 && (
                      <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[10px]">
                        {badges?.distributionsPending}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
                {canInventoryCreate && <TabsTrigger value="transfer">+ Chuyển kho</TabsTrigger>}
                {canInventoryView && (
                  <TabsTrigger value="adjustments">
                    Kiểm kê
                    {(badges?.adjustmentsPending ?? 0) > 0 && (
                      <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[10px]">
                        {badges?.adjustmentsPending}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
                {canInventoryView && (
                  <TabsTrigger value="reorder">
                    Đề xuất bổ sung
                    {(badges?.reorderPending ?? 0) > 0 && (
                      <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[10px]">
                        {badges?.reorderPending}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
              </TabsList>
            </ScrollableTabsList>
            <TabsContent value="transactions" className="mt-4">
              {canInventoryView ? (
                <Suspense fallback={<TabFallback />}>
                  <TransactionListPage />
                </Suspense>
              ) : <AccessDenied module="inventory" action="view" />}
            </TabsContent>
            <TabsContent value="inbound" className="mt-4">
              {canInventoryCreate ? (
                <Suspense fallback={<TabFallback />}>
                  <InboundPage />
                </Suspense>
              ) : <AccessDenied module="inventory" action="create" />}
            </TabsContent>
            <TabsContent value="outbound" className="mt-4">
              <Tabs value={outboundView === 'from-requests' ? 'list' : outboundView} onValueChange={(v) => setOutboundView(v as 'list' | 'manual')}>
                <ScrollableTabsList className="-mx-1 px-1">
                  <TabsList>
                    {(canInventoryView || canInventoryCreate) && <TabsTrigger value="list">Danh sách phiếu</TabsTrigger>}
                    {canInventoryCreate && <TabsTrigger value="manual">+ Tạo phiếu mới</TabsTrigger>}
                  </TabsList>
                </ScrollableTabsList>
                <TabsContent value="list" className="mt-4">
                  {(canInventoryView || canInventoryCreate) ? (
                    <Suspense fallback={<TabFallback />}>
                      <DistributionOrdersPage />
                    </Suspense>
                  ) : <AccessDenied module="inventory" action="view" />}
                </TabsContent>
                <TabsContent value="manual" className="mt-4">
                  {canInventoryCreate ? (
                    <Suspense fallback={<TabFallback />}>
                      <OutboundPage />
                    </Suspense>
                  ) : <AccessDenied module="inventory" action="create" />}
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="transfer" className="mt-4">
              {canInventoryCreate ? (
                <Suspense fallback={<TabFallback />}>
                  <TransferPage />
                </Suspense>
              ) : <AccessDenied module="inventory" action="create" />}
            </TabsContent>
            <TabsContent value="adjustments" className="mt-4">
              {canInventoryView ? (
                <Suspense fallback={<TabFallback />}>
                  <AdjustmentListPage />
                </Suspense>
              ) : <AccessDenied module="inventory" action="view" />}
            </TabsContent>
            <TabsContent value="reorder" className="mt-4">
              {canInventoryView ? (
                <Suspense fallback={<TabFallback />}>
                  <ReorderSuggestionsPage />
                </Suspense>
              ) : <AccessDenied module="inventory" action="view" />}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <Tabs
            value={(sub as AnalyticsSub) || 'consumption'}
            onValueChange={setSub}
          >
            <ScrollableTabsList className="hidden">
              <TabsList>
                <TabsTrigger value="dead-stock">Tồn kho ứ đọng</TabsTrigger>
                <TabsTrigger value="consumption">Phân tích tiêu thụ</TabsTrigger>
              </TabsList>
            </ScrollableTabsList>
            <TabsContent value="consumption" className="mt-4">
              <Suspense fallback={<TabFallback />}>
                <InventoryAnalyticsPage />
              </Suspense>
            </TabsContent>
            <TabsContent value="dead-stock" className="mt-4">
              <Suspense fallback={<TabFallback />}>
                <DeadStockPage />
              </Suspense>
            </TabsContent>
          </Tabs>
        </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <Tabs
              value={settingsSubValue}
              onValueChange={setSub}
            >
              <ScrollableTabsList className="hidden">
                <TabsList>
                  <TabsTrigger value="supplements">Yêu cầu bổ sung</TabsTrigger>
                  {canManageSettings && <TabsTrigger value="warehouses">Quản lý kho</TabsTrigger>}
                </TabsList>
              </ScrollableTabsList>
              <TabsContent value="supplements" className="mt-4">
                <Suspense fallback={<TabFallback />}>
                  <SupplementsPage />
                </Suspense>
              </TabsContent>
              {canManageSettings && (
                <TabsContent value="warehouses" className="mt-4">
                  <Suspense fallback={<TabFallback />}>
                    <WarehouseListPage />
                  </Suspense>
                </TabsContent>
              )}
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
