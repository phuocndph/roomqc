import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { FileText, Clock, CheckCircle, XCircle, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

type FilterStatus = 'all' | 'pending' | 'approved' | 'completed' | 'cancelled'

const STATUS_CONFIG = {
  pending: { label: 'Chờ duyệt', icon: Clock, color: 'bg-yellow-500' },
  approved: { label: 'Đã duyệt', icon: CheckCircle, color: 'bg-blue-500' },
  completed: { label: 'Hoàn thành', icon: CheckCircle, color: 'bg-green-500' },
  cancelled: { label: 'Đã hủy', icon: XCircle, color: 'bg-red-500' },
}

export const MobilePOListPage = () => {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterStatus>('all')
  const { data: orders = [], isLoading, refetch } = usePurchaseOrders()

  const filteredOrders = filter === 'all' 
    ? orders 
    : orders.filter((o: any) => o.status === filter)

  const handleRefresh = async () => {
    await refetch()
  }

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || {
      label: status,
      icon: FileText,
      color: 'bg-gray-500'
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount)
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title="Đơn đặt hàng"
        showBack
      />

      {/* Add Button */}
      <PermissionGate module="purchase_orders" action="create">
        <div className="p-4">
          <Button
            className="w-full"
            onClick={() => navigate('/purchase-orders/new')}
          >
            <Plus className="h-4 w-4 mr-2" />
            Tạo đơn đặt hàng mới
          </Button>
        </div>
      </PermissionGate>

      {/* Filter Tabs */}
      <div className="sticky top-14 bg-background border-b z-10 px-4 py-3 overflow-x-auto">
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'completed', 'cancelled'] as FilterStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                filter === status
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              )}
            >
              {status === 'all' ? 'Tất cả' : STATUS_CONFIG[status].label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="p-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-24 bg-muted rounded" />
                </CardContent>
              </Card>
            ))
          ) : filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {filter === 'all' ? 'Chưa có đơn đặt hàng nào' : 'Không có đơn đặt hàng nào'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map((order: any) => {
              const statusConfig = getStatusConfig(order.status)
              const StatusIcon = statusConfig.icon

              return (
                <Card
                  key={order.id}
                  className="cursor-pointer active:scale-98 transition-transform"
                  onClick={() => navigate(`/purchase-orders/${order.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-lg">
                            {order.po_number}
                          </span>
                          <Badge variant="outline" className={cn('text-xs', statusConfig.color)}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {order.vendor?.name || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Tổng tiền</p>
                        <p className="font-semibold text-primary">
                          {formatCurrency(order.total_amount || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Ngày đặt</p>
                        <p className="font-medium">
                          {format(new Date(order.order_date), 'dd/MM/yyyy')}
                        </p>
                      </div>
                    </div>

                    {order.expected_delivery_date && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Dự kiến giao:</span>
                          <span className="font-medium">
                            {format(new Date(order.expected_delivery_date), 'dd/MM/yyyy')}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </PullToRefresh>
    </div>
  )
}
