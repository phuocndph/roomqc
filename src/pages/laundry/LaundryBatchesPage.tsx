import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Download, RefreshCw, RotateCcw, Search } from 'lucide-react'
import { useReportExport } from '@/hooks/useReportExport'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { BatchStatusBadge } from '@/components/laundry/BatchStatusBadge'
import { VendorSelect } from '@/components/laundry/VendorSelect'
import { useLaundryBatches } from '@/hooks/useLaundryBatches'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { BatchStatus } from '@/types/laundry.types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const STATUSES: Record<BatchStatus, string> = {
  draft: 'Nháp',
  delivered: 'Đã gửi giặt',
  washing: 'Đang giặt',
  ready: 'Sẵn sàng nhận',
  received: 'Đã nhận về',
  stocked: 'Đã nhập kho',
  cancelled: 'Đã hủy',
}

export function LaundryBatchesPage() {
  const [params, setParams] = useSearchParams()
  const requested =
    params.get('status') === 'in_progress' ? 'washing' : params.get('status')
  const status =
    requested && Object.prototype.hasOwnProperty.call(STATUSES, requested)
      ? (requested as BatchStatus)
      : undefined
  const rawPage = Number(params.get('page') || 1)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const search = params.get('search') || ''
  const vendorId = params.get('vendor') || ''
  const { data, isLoading, isError, isFetching, refetch } = useLaundryBatches(
    { status, search, vendorId },
    page,
    20,
  )
  const { exportToExcel, isExporting } = useReportExport()
  const batches = data?.batches || []
  const totalPages = Math.max(1, data?.totalPages || 1)
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.delete('page')
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(params)
    next.set('page', String(nextPage))
    setParams(next)
  }
  const handleExport = () =>
    void exportToExcel(
      {
        title: 'Danh sách lô giặt',
        dateRange: `Trang ${page}, theo bộ lọc đang hiển thị`,
        tables: [
          {
            title: 'Lô giặt',
            headers: [
              'Mã lô',
              'Nhà cung cấp',
              'Ngày gửi',
              'Ngày hẹn trả',
              'Số món',
              'Chi phí',
              'Trạng thái',
            ],
            rows: batches.map((batch) => [
              batch.batch_code,
              batch.vendor_name || '',
              batch.delivery_date,
              batch.expected_return_date || '',
              batch.total_items,
              batch.actual_cost ?? batch.estimated_cost,
              STATUSES[batch.status as BatchStatus] || batch.status,
            ]),
          },
        ],
      },
      'lo-giat',
    )

  return (
    <div className="space-y-5 px-4 py-4 md:p-0">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold lg:text-3xl">Lô giặt</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tìm lô đã gửi và nhận đồ khi nhà cung cấp trả về.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || isFetching || isError || !batches.length}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Đang xuất…' : 'Xuất trang này'}
          </Button>
          <PermissionGate module="laundry" action="create">
            <Button asChild>
              <Link to="/laundry/batches/new">
                <Plus className="mr-2 h-4 w-4" />
                Tạo lô gửi giặt
              </Link>
            </Button>
          </PermissionGate>
        </div>
      </div>
      <section
        aria-label="Lọc lô giặt"
        className="space-y-3 rounded-lg border bg-card p-4"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Tìm lô giặt"
              placeholder="Mã lô hoặc nhà cung cấp"
              className="pl-9"
              value={search}
              onChange={(event) => setFilter('search', event.target.value)}
            />
          </div>
          <VendorSelect
            value={vendorId}
            onChange={(value) => setFilter('vendor', value)}
          />
          <Select
            value={status || 'all'}
            onValueChange={(value) => setFilter('status', value)}
          >
            <SelectTrigger aria-label="Trạng thái lô giặt">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              {Object.entries(STATUSES).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span role="status" className="text-muted-foreground">
            {isFetching
              ? 'Đang tải…'
              : isError
                ? 'Chưa tải được dữ liệu'
                : `${data?.total || 0} lô phù hợp`}
          </span>
          {(search || vendorId || status) && (
            <Button variant="ghost" size="sm" onClick={() => setParams({})}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Xóa bộ lọc
            </Button>
          )}
        </div>
      </section>
      {isError ? (
        <div role="alert" className="rounded-lg border p-8 text-center">
          <p>Không thể tải danh sách lô giặt.</p>
          <Button variant="outline" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Thử lại
          </Button>
        </div>
      ) : isLoading ? (
        <div role="status" className="p-8 text-center">
          Đang tải lô giặt…
        </div>
      ) : !batches.length ? (
        <div className="rounded-lg border bg-card p-10 text-center">
          <p className="font-medium">Không có lô giặt phù hợp</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Thử đổi trạng thái hoặc xóa bộ lọc.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900">
                <TableHead>Lô giặt</TableHead>
                <TableHead>Ngày gửi / Hẹn trả</TableHead>
                <TableHead className="text-right">Số món</TableHead>
                <TableHead className="text-right">Chi phí</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow
                  key={batch.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <TableCell>
                    <Link
                      to={`/laundry/batches/${batch.id}`}
                      className="font-semibold underline-offset-4 hover:underline"
                    >
                      {batch.batch_code}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {batch.vendor_name || 'Chưa có nhà cung cấp'}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <p className="text-xs text-muted-foreground">
                      Gửi: {formatDate(batch.delivery_date)}
                    </p>
                    <p className="mt-1">
                      Trả:{' '}
                      {batch.expected_return_date
                        ? formatDate(batch.expected_return_date)
                        : 'Chưa hẹn'}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {batch.total_items}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {(batch.actual_cost ?? batch.estimated_cost) > 0
                      ? formatCurrency(
                          batch.actual_cost ?? batch.estimated_cost,
                        )
                      : 'Chưa cập nhật'}
                  </TableCell>
                  <TableCell>
                    <BatchStatusBadge status={batch.status as BatchStatus} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/laundry/batches/${batch.id}`}>
                          Chi tiết
                        </Link>
                      </Button>
                      {batch.status === 'ready' && (
                        <PermissionGate module="laundry" action="update">
                          <Button
                            asChild
                            size="sm"
                            className="bg-green-700 text-white hover:bg-green-800"
                          >
                            <Link to={`/laundry/batches/${batch.id}/receive`}>
                              Nhận đồ
                            </Link>
                          </Button>
                        </PermissionGate>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {totalPages > 1 && (
        <nav
          aria-label="Phân trang lô giặt"
          className="flex flex-wrap items-center justify-center gap-3"
        >
          <Button
            variant="outline"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage(page - 1)}
          >
            Trang trước
          </Button>
          <span className="text-sm">
            Trang {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage(page + 1)}
          >
            Trang sau
          </Button>
        </nav>
      )}
    </div>
  )
}
