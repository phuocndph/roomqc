import { Link } from 'react-router-dom'
import { Copy, Eye, Package } from 'lucide-react'
import { toast } from 'sonner'
import type { PurchaseOrder } from '@/types/purchase-order.types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  PO_STATUS,
  isPurchaseOrderOverdue,
} from '@/lib/purchaseOrderPresentation'

interface POTableProps {
  purchaseOrders: PurchaseOrder[]
  selectedPOs: string[]
  onSelectionChange: (ids: string[]) => void
}

export default function POTable({
  purchaseOrders,
  selectedPOs,
  onSelectionChange,
}: POTableProps) {
  const selectedCount = purchaseOrders.filter((po) =>
    selectedPOs.includes(po.id),
  ).length
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Đã sao chép mã đơn')
    } catch {
      toast.error(
        'Không thể sao chép. Bạn có thể chọn và sao chép mã đơn trực tiếp.',
      )
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
            <TableHead className="w-12">
              <Checkbox
                aria-label="Chọn tất cả đơn đang hiển thị"
                checked={
                  selectedCount === 0
                    ? false
                    : selectedCount === purchaseOrders.length
                      ? true
                      : 'indeterminate'
                }
                onCheckedChange={(checked) =>
                  onSelectionChange(
                    checked === true ? purchaseOrders.map((po) => po.id) : [],
                  )
                }
              />
            </TableHead>
            <TableHead>Đơn đặt hàng</TableHead>
            <TableHead>Nhà cung cấp</TableHead>
            <TableHead className="text-right">Tổng tiền</TableHead>
            <TableHead>Ngày giao dự kiến</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!purchaseOrders.length ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="py-12 text-center">
                <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Chưa có đơn phù hợp</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Thử xóa bộ lọc hoặc tạo đơn đặt hàng mới.
                </p>
              </TableCell>
            </TableRow>
          ) : (
            purchaseOrders.map((po) => {
              const status = PO_STATUS[po.status]
              const overdue = isPurchaseOrderOverdue(po)
              return (
                <TableRow
                  key={po.id}
                  data-state={
                    selectedPOs.includes(po.id) ? 'selected' : undefined
                  }
                  className="hover:bg-slate-50 data-[state=selected]:bg-slate-100 dark:hover:bg-slate-800/60 dark:data-[state=selected]:bg-slate-800"
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`Chọn đơn ${po.po_code}`}
                      checked={selectedPOs.includes(po.id)}
                      onCheckedChange={(checked) =>
                        onSelectionChange(
                          checked === true
                            ? [...selectedPOs, po.id]
                            : selectedPOs.filter((id) => id !== po.id),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      className="font-mono font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"
                      to={`/purchase-orders/${po.id}`}
                    >
                      {po.po_code}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(po.order_date)} · {po.items?.length || 0} mặt
                      hàng
                    </p>
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <p className="break-words font-medium">
                      {po.vendor?.name || 'Chưa cập nhật'}
                    </p>
                    {po.vendor?.code && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {po.vendor.code}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                    {formatCurrency(po.total_amount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <p>
                      {po.expected_delivery_date
                        ? formatDate(po.expected_delivery_date)
                        : 'Chưa hẹn ngày'}
                    </p>
                    {overdue && (
                      <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-400">
                        Quá hạn giao hàng
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`whitespace-nowrap ${status?.className || 'bg-slate-600 text-white'}`}
                    >
                      {status?.label || po.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-white"
                      >
                        <Link
                          to={`/purchase-orders/${po.id}`}
                          aria-label={`Xem đơn ${po.po_code}`}
                        >
                          <Eye className="mr-1.5 h-4 w-4" />
                          Chi tiết
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Sao chép mã ${po.po_code}`}
                        className="h-9 w-9 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-white"
                        onClick={() => copyCode(po.po_code)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
