import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, RefreshCw } from 'lucide-react'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import {
  filterPurchaseOrders,
  PO_STATUS,
  isPurchaseOrderOverdue,
} from '@/lib/purchaseOrderPresentation'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { POStatus } from '@/types/purchase-order.types'

export const MobilePOListPage = () => {
  const [filter, setFilter] = useState<POStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const { data: orders = [], isLoading, isError, refetch } = usePurchaseOrders()
  const filteredOrders = filterPurchaseOrders(orders, {
    status: filter,
    search,
  })
  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader title="Đơn đặt hàng" showBack />
      <div className="space-y-3 p-4">
        <PermissionGate module="purchase_orders" action="create">
          <Button asChild className="w-full">
            <Link to="/purchase-orders/new">
              <Plus className="mr-2 h-4 w-4" />
              Tạo đơn đặt hàng
            </Link>
          </Button>
        </PermissionGate>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Tìm đơn đặt hàng"
            placeholder="Mã đơn hoặc nhà cung cấp"
            className="pl-9"
          />
        </div>
        <div
          className="flex gap-2 overflow-x-auto pb-2"
          aria-label="Trạng thái đơn đặt hàng"
        >
          {(['all', ...Object.keys(PO_STATUS)] as Array<POStatus | 'all'>).map(
            (status) => (
              <button
                key={status}
                type="button"
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
                className={`min-h-10 shrink-0 rounded-md border px-3 text-sm font-medium ${filter === status ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-950' : 'bg-card text-foreground'}`}
              >
                {status === 'all' ? 'Tất cả' : PO_STATUS[status].label}
              </button>
            ),
          )}
        </div>
      </div>
      <PullToRefresh
        onRefresh={async () => {
          await refetch()
        }}
      >
        <div className="space-y-3 px-4">
          {isError ? (
            <div role="alert" className="rounded-lg border p-6 text-center">
              <p>Không thể tải đơn đặt hàng.</p>
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => refetch()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Thử lại
              </Button>
            </div>
          ) : isLoading ? (
            <div role="status" className="p-8 text-center">
              Đang tải đơn đặt hàng…
            </div>
          ) : !filteredOrders.length ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="font-medium">Không có đơn phù hợp</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Thử đổi trạng thái hoặc từ khóa tìm kiếm.
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map((order) => (
              <Link
                key={order.id}
                to={`/purchase-orders/${order.id}`}
                className="block rounded-lg border bg-card p-4 active:bg-slate-100 dark:active:bg-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-mono text-base font-semibold">
                    {order.po_code}
                  </span>
                  <Badge className={PO_STATUS[order.status]?.className}>
                    {PO_STATUS[order.status]?.label || order.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {order.vendor?.name || 'Chưa có nhà cung cấp'}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {formatCurrency(order.total_amount)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(order.order_date)}
                  </span>
                </div>
                {order.expected_delivery_date && (
                  <p
                    className={`mt-3 border-t pt-3 text-sm ${isPurchaseOrderOverdue(order) ? 'font-medium text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}
                  >
                    Hẹn giao: {formatDate(order.expected_delivery_date)}
                    {isPurchaseOrderOverdue(order) ? ' · Quá hạn' : ''}
                  </p>
                )}
              </Link>
            ))
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
