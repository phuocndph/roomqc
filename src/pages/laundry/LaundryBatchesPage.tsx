import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Download, Eye, Filter, Loader2 } from 'lucide-react'
import { useReportExport } from '@/hooks/useReportExport'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileLaundryBatchesPage } from '@/components/laundry/MobileLaundryBatchesPage'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { BatchStatusBadge } from '@/components/laundry/BatchStatusBadge'
import { VendorSelect } from '@/components/laundry/VendorSelect'
import { useLaundryBatches } from '@/hooks/useLaundryBatches'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DashboardStatCard } from '@/components/dashboard/DashboardStatCard'
import { Package, Clock, CheckCircle } from 'lucide-react'

export function LaundryBatchesPage() {
  const { t } = useTranslation('laundry')
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedStatus = searchParams.get('status')
  const initialStatus = requestedStatus === 'in_progress' ? 'washing' : requestedStatus
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<{
    vendorId?: string
    status?: 'draft' | 'delivered' | 'washing' | 'ready' | 'received' | 'cancelled' | ''
    search?: string
  }>({
    vendorId: '',
    status: initialStatus && ['draft', 'delivered', 'washing', 'ready', 'received', 'cancelled'].includes(initialStatus)
      ? initialStatus as 'draft' | 'delivered' | 'washing' | 'ready' | 'received' | 'cancelled'
      : '',
    search: '',
  })
  const [showFilters, setShowFilters] = useState(false)
  const { exportToExcel, isExporting } = useReportExport()
  
  // Gọi hook trước điều kiện isMobile
  const { data, isLoading } = useLaundryBatches(
    {
      vendorId: filters.vendorId || undefined,
      status: filters.status as any,
      search: filters.search || undefined,
    },
    page,
    20
  )

  // Kiểm tra mobile SAU KHI tất cả hooks đã được gọi
  if (isMobile) {
    return <MobileLaundryBatchesPage />
  }
  
  const batches = data?.batches || []
  const totalPages = data?.totalPages || 1
  
  // Quick stats
  const totalBatches = data?.total || 0
  const inProgress = batches.filter((b) => 
    b.status === 'delivered' || b.status === 'washing'
  ).length
  const completedThisMonth = batches.filter((b) => 
    b.status === 'received' && 
    new Date(b.actual_return_date!).getMonth() === new Date().getMonth()
  ).length
  
  const handleExport = () => {
    exportToExcel(
      {
        title: 'Danh sách lô giặt',
        dateRange: 'Tất cả',
        summary: {
          total_batches: batches.length,
        },
        tables: [
          {
            title: 'Lô giặt',
            headers: ['Mã lô', 'Nhà cung cấp', 'Ngày gửi', 'Ngày dự kiến trả', 'Số items', 'Chi phí dự kiến', 'Trạng thái'],
            rows: batches.map(b => [
              b.batch_code,
              (b as any).vendor_name ?? '',
              b.delivery_date ? new Date(b.delivery_date).toLocaleDateString('vi-VN') : '',
              b.expected_return_date ? new Date(b.expected_return_date).toLocaleDateString('vi-VN') : '',
              b.total_items,
              b.estimated_cost,
              b.status,
            ]),
          },
        ],
      },
      'laundry_batches'
    )
  }
  
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('batches.title')}
        description={t('batches.list')}
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            {isExporting
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Download className="mr-2 h-4 w-4" />}
            {isExporting ? t('common:exporting', 'Đang xuất...') : t('actions.exportExcel')}
          </Button>
          <PermissionGate module="laundry" action="create">
            <Button onClick={() => navigate('/laundry/batches/new')}>
              <Plus className="mr-2 h-4 w-4" />
              {t('batches.new')}
            </Button>
          </PermissionGate>
        </div>
      </PageHeader>
      
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <DashboardStatCard
          title={t('stats.totalBatches')}
          value={totalBatches}
          icon={Package}
          description={t('stats.totalBatchesDesc')}
        />
        <DashboardStatCard
          title={t('stats.inProgress')}
          value={inProgress}
          icon={Clock}
          description={t('stats.inProgressDesc')}
        />
        <DashboardStatCard
          title={t('stats.completedThisMonth')}
          value={completedThisMonth}
          icon={CheckCircle}
          description={t('stats.completedThisMonthDesc')}
        />
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('batches.list')}</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="mr-2 h-4 w-4" />
              {showFilters ? t('filters.hideFilters') : t('filters.showFilters')}
            </Button>
          </div>
          
          {showFilters && (
            <div className="grid gap-4 md:grid-cols-3 mt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{t('filters.search')}</label>
                <Input
                  placeholder={t('filters.searchPlaceholder')}
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">{t('fields.vendor')}</label>
                <VendorSelect
                  value={filters.vendorId}
                  onChange={(value) => setFilters({ ...filters, vendorId: value })}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">{t('fields.status')}</label>
                <Select
                  value={filters.status}
                  onValueChange={(value) => setFilters({ ...filters, status: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('filters.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('filters.all')}</SelectItem>
                    <SelectItem value="draft">{t('status.draft', 'Nháp')}</SelectItem>
                    <SelectItem value="delivered">{t('status.sent')}</SelectItem>
                    <SelectItem value="washing">{t('status.processing')}</SelectItem>
                    <SelectItem value="ready">{t('status.ready')}</SelectItem>
                    <SelectItem value="received">{t('status.received')}</SelectItem>
                    <SelectItem value="cancelled">{t('status.cancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">{t('common:loading')}</div>
          ) : batches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('messages.noBatches')}
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('fields.batchCode')}</TableHead>
                        <TableHead>{t('fields.vendor')}</TableHead>
                        <TableHead>{t('fields.deliveryDate')}</TableHead>
                        <TableHead>{t('fields.expectedReturnDate')}</TableHead>
                        <TableHead className="text-center">{t('fields.totalItems')}</TableHead>
                        <TableHead className="text-right">{t('fields.estimatedCost')}</TableHead>
                        <TableHead>{t('fields.status')}</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batches.map((batch) => (
                        <TableRow
                          key={batch.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/laundry/batches/${batch.id}`)}
                        >
                          <TableCell className="font-medium">{batch.batch_code}</TableCell>
                          <TableCell>{(batch as any).vendor_name || 'N/A'}</TableCell>
                          <TableCell>{formatDate(batch.delivery_date)}</TableCell>
                          <TableCell>{formatDate(batch.expected_return_date)}</TableCell>
                          <TableCell className="text-center">{batch.total_items}</TableCell>
                          <TableCell className="text-right">
                            {(batch.actual_cost || batch.estimated_cost) > 0
                              ? formatCurrency(batch.actual_cost || batch.estimated_cost)
                              : <span className="text-muted-foreground italic">{t('batchDetail.notUpdated')}</span>
                            }
                          </TableCell>
                          <TableCell>
                            <BatchStatusBadge status={batch.status as any} />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/laundry/batches/${batch.id}`)
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setPage(Math.max(1, page - 1))}
                          className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <PaginationItem key={p}>
                          <PaginationLink
                            onClick={() => setPage(p)}
                            isActive={p === page}
                            className="cursor-pointer"
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setPage(Math.min(totalPages, page + 1))}
                          className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
