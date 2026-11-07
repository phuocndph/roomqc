import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileDown, RotateCcw, RefreshCw } from 'lucide-react'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import { useUser } from '@/hooks/useUser'
import { useReportExport } from '@/hooks/useReportExport'
import type {
  POFilters as FilterValues,
  POStatus,
} from '@/types/purchase-order.types'
import {
  filterPurchaseOrders,
  PO_STATUS,
} from '@/lib/purchaseOrderPresentation'
import POTable from '@/components/purchase-orders/POTable'
import POFilters from '@/components/purchase-orders/POFilters'
import POStatsCards from '@/components/purchase-orders/POStatsCards'
import { PageHeader } from '@/components/shared/PageHeader'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobilePOListPage } from '@/components/purchase-orders/MobilePOListPage'

const DEFAULT_FILTERS: FilterValues = {
  status: 'all',
  sort_by: 'date',
  sort_order: 'desc',
}

export default function POListPage() {
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()
  const { user } = useUser()
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS)
  const [selectedPOs, setSelectedPOs] = useState<string[]>([])
  const { data: orders = [], isLoading, isError, refetch } = usePurchaseOrders()
  const { exportToExcel, isExporting } = useReportExport()
  const matchedOrders = filterPurchaseOrders(
    orders,
    { ...filters, status: 'all' },
    user?.id,
  )
  const visibleOrders = matchedOrders.filter(
    (po) => filters.status === 'all' || po.status === filters.status,
  )
  const selectedOrders = visibleOrders.filter((po) =>
    selectedPOs.includes(po.id),
  )
  const cutoff = Date.now() - 30 * 86_400_000
  const recent = orders.filter(
    (po) => new Date(po.order_date).getTime() >= cutoff,
  )
  const hasFilters = Boolean(
    filters.search ||
      filters.date_from ||
      filters.date_to ||
      filters.created_by ||
      filters.min_amount != null ||
      filters.status !== 'all',
  )
  const updateFilters = (next: Partial<FilterValues>) => {
    setFilters((prev) => ({ ...prev, ...next }))
    setSelectedPOs([])
  }

  if (isMobile) return <MobilePOListPage />

  const handleExport = () => {
    const exported = selectedOrders.length ? selectedOrders : visibleOrders
    void exportToExcel(
      {
        title: 'Đơn đặt hàng',
        dateRange: 'Theo bộ lọc đang hiển thị',
        tables: [
          {
            title: 'Danh sách đơn',
            headers: [
              'Mã đơn',
              'Nhà cung cấp',
              'Ngày đặt',
              'Ngày giao dự kiến',
              'Số mặt hàng',
              'Tổng tiền',
              'Trạng thái',
            ],
            rows: exported.map((po) => [
              po.po_code,
              po.vendor?.name || '',
              po.order_date.slice(0, 10),
              po.expected_delivery_date?.slice(0, 10) || '',
              po.items?.length || 0,
              po.total_amount,
              PO_STATUS[po.status]?.label || po.status,
            ]),
          },
        ],
      },
      'don-dat-hang',
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Đơn đặt hàng"
        description="Theo dõi đơn cần duyệt, ngày giao và tiến độ nhận hàng."
      >
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={isExporting || !visibleOrders.length}
        >
          <FileDown className="mr-2 h-4 w-4" />
          {isExporting
            ? 'Đang xuất…'
            : selectedOrders.length
              ? `Xuất ${selectedOrders.length} đơn đã chọn`
              : 'Xuất Excel'}
        </Button>
        <PermissionGate module="purchase_orders" action="create">
          <Button onClick={() => navigate('/purchase-orders/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Tạo đơn mới
          </Button>
        </PermissionGate>
      </PageHeader>
      {!isError && !isLoading && (
        <POStatsCards
          stats={{
            total_pos: orders.length,
            pending_approval: orders.filter((po) => po.status === 'submitted')
              .length,
            total_value_30d: recent
              .filter((po) => !['cancelled', 'rejected'].includes(po.status))
              .reduce((sum, po) => sum + Number(po.total_amount), 0),
            completed_30d: recent.filter((po) => po.status === 'received')
              .length,
          }}
        />
      )}
      <section
        aria-label="Lọc đơn đặt hàng"
        className="space-y-4 rounded-lg border bg-card p-4"
      >
        <div className="flex flex-wrap items-start gap-3">
          <Tabs
            value={filters.status || 'all'}
            onValueChange={(status) =>
              updateFilters({ status: status as POStatus | 'all' })
            }
          >
            <TabsList
              aria-label="Trạng thái đơn đặt hàng"
              className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0"
            >
              {['all', 'draft', 'submitted', 'ordered', 'received'].map(
                (status) => (
                  <TabsTrigger
                    key={status}
                    value={status}
                    className="min-h-10 gap-2 border border-transparent px-3 text-sm text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 data-[state=active]:border-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white dark:data-[state=active]:border-slate-300 dark:data-[state=active]:bg-slate-200 dark:data-[state=active]:text-slate-950"
                  >
                    {status === 'all'
                      ? 'Tất cả'
                      : PO_STATUS[status as POStatus].label}
                    <span className="tabular-nums">
                      {status === 'all'
                        ? matchedOrders.length
                        : matchedOrders.filter((po) => po.status === status)
                            .length}
                    </span>
                  </TabsTrigger>
                ),
              )}
            </TabsList>
          </Tabs>
          <Select
            value={
              ['approved', 'partial', 'rejected', 'cancelled'].includes(
                filters.status || '',
              )
                ? filters.status
                : 'more'
            }
            onValueChange={(status) =>
              updateFilters({ status: status as POStatus })
            }
          >
            <SelectTrigger
              aria-label="Trạng thái khác của đơn"
              className="h-10 w-[205px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="more" disabled>
                Trạng thái khác
              </SelectItem>
              {(
                ['approved', 'partial', 'rejected', 'cancelled'] as POStatus[]
              ).map((status) => (
                <SelectItem key={status} value={status}>
                  {PO_STATUS[status].label} (
                  {matchedOrders.filter((po) => po.status === status).length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <POFilters filters={filters} onChange={updateFilters} />
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={filters.created_by === 'me'}
            className={
              filters.created_by === 'me'
                ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800 hover:text-white'
                : ''
            }
            onClick={() =>
              updateFilters({
                created_by: filters.created_by ? undefined : 'me',
              })
            }
          >
            Do tôi tạo
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={filters.min_amount != null}
            className={
              filters.min_amount != null
                ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800 hover:text-white'
                : ''
            }
            onClick={() =>
              updateFilters({
                min_amount: filters.min_amount != null ? undefined : 10_000_000,
              })
            }
          >
            Từ 10 triệu đồng
          </Button>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters(DEFAULT_FILTERS)
                setSelectedPOs([])
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Xóa bộ lọc
            </Button>
          )}
          <span role="status" className="ml-auto text-sm text-muted-foreground">
            {visibleOrders.length} đơn
            {selectedOrders.length > 0
              ? ` · Đã chọn ${selectedOrders.length}`
              : ''}
          </span>
        </div>
      </section>
      {isError ? (
        <div role="alert" className="rounded-lg border p-6 text-center">
          <p>Không thể tải đơn đặt hàng.</p>
          <Button className="mt-3" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Thử lại
          </Button>
        </div>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : (
        <POTable
          purchaseOrders={visibleOrders}
          selectedPOs={selectedOrders.map((po) => po.id)}
          onSelectionChange={setSelectedPOs}
        />
      )}
    </div>
  )
}
