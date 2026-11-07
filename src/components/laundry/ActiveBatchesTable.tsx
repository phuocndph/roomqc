import { Link } from 'react-router-dom'
import { Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Skeleton } from '@/components/ui/skeleton'
import { BatchStatusBadge } from './BatchStatusBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { LaundryBatchWithVendor } from '@/types/laundry.types'

interface ActiveBatchesTableProps {
  batches: LaundryBatchWithVendor[]
  isLoading: boolean
  totalCount?: number
}

export function ActiveBatchesTable({
  batches,
  isLoading,
  totalCount,
}: ActiveBatchesTableProps) {
  if (isLoading)
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  const renderAction = (batch: LaundryBatchWithVendor) =>
    batch.status === 'ready' ? (
      <PermissionGate
        module="laundry"
        action="update"
        fallback={
          <Button asChild variant="outline" size="sm">
            <Link to={`/laundry/batches/${batch.id}`}>Chi tiết</Link>
          </Button>
        }
      >
        <Button
          asChild
          size="sm"
          className="bg-green-700 text-white hover:bg-green-800"
        >
          <Link to={`/laundry/batches/${batch.id}/receive`}>Nhận đồ</Link>
        </Button>
      </PermissionGate>
    ) : (
      <Button asChild size="sm" variant="outline">
        <Link to={`/laundry/batches/${batch.id}`}>Chi tiết</Link>
      </Button>
    )
  const isLate = (batch: LaundryBatchWithVendor) =>
    Boolean(
      batch.expected_return_date &&
        batch.expected_return_date.slice(0, 10) <
          new Date().toLocaleDateString('en-CA'),
    )

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <CardTitle className="text-base">Lô cần theo dõi</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Ưu tiên lô sẵn sàng nhận và ngày hẹn trả gần nhất.
            {totalCount != null && totalCount > batches.length
              ? ` Hiển thị ${batches.length}/${totalCount} lô.`
              : ''}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/laundry/batches">Xem tất cả</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {!batches.length ? (
          <div className="py-10 text-center">
            <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Không có lô đang giặt</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Gom yêu cầu từ phòng hoặc tạo lô gửi giặt mới.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y rounded-lg border md:hidden">
              {batches.map((batch) => (
                <div key={batch.id} className="space-y-3 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        to={`/laundry/batches/${batch.id}`}
                        className="font-semibold underline-offset-4 hover:underline"
                      >
                        {batch.batch_code}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {batch.vendor_name || 'Chưa có nhà cung cấp'}
                      </p>
                    </div>
                    <BatchStatusBadge status={batch.status as any} />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="text-sm">
                      <p>
                        {batch.total_items} món · {batch.total_weight_kg || 0}{' '}
                        kg
                      </p>
                      <p
                        className={
                          isLate(batch)
                            ? 'mt-1 font-medium text-red-700 dark:text-red-400'
                            : 'mt-1 text-muted-foreground'
                        }
                      >
                        Hẹn trả:{' '}
                        {batch.expected_return_date
                          ? formatDate(batch.expected_return_date)
                          : 'Chưa hẹn'}
                        {isLate(batch) ? ' · Quá hạn' : ''}
                      </p>
                    </div>
                    {renderAction(batch)}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
                    <TableHead>Lô gửi giặt</TableHead>
                    <TableHead>Hẹn trả</TableHead>
                    <TableHead className="text-right">Số lượng</TableHead>
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
                          className="font-semibold underline-offset-4 hover:underline"
                          to={`/laundry/batches/${batch.id}`}
                        >
                          {batch.batch_code}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {batch.vendor_name || 'Chưa có nhà cung cấp'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="whitespace-nowrap">
                          {batch.expected_return_date
                            ? formatDate(batch.expected_return_date)
                            : 'Chưa hẹn ngày'}
                        </p>
                        {isLate(batch) && (
                          <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-400">
                            Quá hạn trả
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <p>{batch.total_items} món</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {batch.total_weight_kg || 0} kg
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium">
                        {(batch.actual_cost ?? batch.estimated_cost) > 0 ? (
                          formatCurrency(
                            batch.actual_cost ?? batch.estimated_cost,
                          )
                        ) : (
                          <span className="text-sm font-normal text-muted-foreground">
                            Chưa cập nhật
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <BatchStatusBadge status={batch.status as any} />
                      </TableCell>
                      <TableCell className="text-right">
                        {renderAction(batch)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
