import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Package, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { ItemFilters } from '@/components/items/ItemFilters'
import { ItemTable } from '@/components/items/ItemTable'
import { ItemTabs } from '@/components/items/ItemTabs'
import { BulkActionsBar } from '@/components/items/BulkActionsBar'
import { MobileItemsPage } from '@/components/items/MobileItemsPage'
import { ServiceListTab } from '@/components/services/ServiceListTab'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { useItems } from '@/hooks/useItems'
import { useBreakpoint } from '@/lib/breakpoints'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { ItemFilters as IItemFilters } from '@/types/items.types'

export function ItemsPage() {
  const { t } = useTranslation('items')
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [mainTab, setMainTab] = useState<string>('items')
  
  // Khai báo TẤT CẢ hooks trước điều kiện isMobile
  const [filters, setFilters] = useState<IItemFilters>(() => ({
    // Accept `q` as a legacy alias so bookmarked quick-search links still work.
    search: searchParams.get('search') || searchParams.get('q') || undefined,
    categoryId: searchParams.get('categoryId') || undefined,
    stockStatus: (searchParams.get('stockStatus') as any) || undefined,
    status: (searchParams.get('status') as any) || 'active',
  }))
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1)
  const [pageSize, setPageSize] = useState(() => Number(searchParams.get('pageSize')) || 25)
  
  // Sync URL params với state - skip khi mobile
  useEffect(() => {
    if (isMobile) return
    
    const params = new URLSearchParams(searchParams)
    ;['search', 'categoryId', 'stockStatus', 'status', 'page', 'pageSize'].forEach((key) => params.delete(key))
    if (filters.search) params.set('search', filters.search)
    if (filters.categoryId) params.set('categoryId', filters.categoryId)
    if (filters.stockStatus) params.set('stockStatus', filters.stockStatus)
    if (filters.status) params.set('status', filters.status)
    if (page !== 1) params.set('page', page.toString())
    if (pageSize !== 25) params.set('pageSize', pageSize.toString())
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true })
    }
  }, [filters, page, pageSize, setSearchParams, isMobile, searchParams])
  
  const { data, isLoading, error } = useItems(filters, page, pageSize)
  
  // Log for debugging
  if (error) {
    console.error('Items loading error:', error)
  }
  
  const handleFilterChange = (newFilters: Partial<IItemFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
    setPage(1) // Reset to first page
  }
  
  // SAU KHI tất cả hooks đã được gọi, mới kiểm tra mobile
  if (isMobile) {
    return <MobileItemsPage />
  }
  
  return (
    <div className="space-y-4">
      <PageHeader
        title={t('title')}
        description={t('description', 'Quản lý tất cả tài sản và đồ dùng trong khách sạn')}
      >
        {mainTab === 'items' && (
          <PermissionGate module="items" action="create">
            <Button onClick={() => navigate('/items/new')}>
              <Plus className="mr-2 h-4 w-4" />
              {t('addNew')}
            </Button>
          </PermissionGate>
        )}
      </PageHeader>
      
      {/* Main tabs: Items vs Services */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="h-9">
          <TabsTrigger value="items" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Tài sản
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Dịch vụ
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="items" className="space-y-4 mt-3">
          <ItemTabs
            activeTab={filters.categoryId || 'all'}
            onTabChange={(categoryId) => 
              handleFilterChange({ categoryId: categoryId === 'all' ? undefined : categoryId })
            }
          />
          
          <ItemFilters
            filters={filters}
            onFilterChange={handleFilterChange}
          />
          
          <ItemTable
            items={data?.items || []}
            isLoading={isLoading}
            selectedItems={selectedItems}
            onSelectionChange={setSelectedItems}
            page={page}
            pageSize={pageSize}
            total={data?.total || 0}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
          
          {selectedItems.length > 0 && (
            <BulkActionsBar
              selectedCount={selectedItems.length}
              selectedItems={selectedItems}
              onClearSelection={() => setSelectedItems([])}
            />
          )}
        </TabsContent>
        
        <TabsContent value="services" className="mt-3">
          <ServiceListTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
