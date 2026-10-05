import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Package, MapPin, Phone, User, Calendar, AlertCircle, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { usePurchaseOrder } from '@/hooks/usePurchaseOrders'
import { formatCurrency, formatDate } from '@/lib/utils'
import { differenceInDays } from 'date-fns'
import { navigateBack } from '@/lib/navigation'

export function MobilePODetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: po, isLoading } = usePurchaseOrder(id!)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!po) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Không tìm thấy đơn hàng</p>
        </div>
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: any }> = {
      draft: { label: 'Nháp', variant: 'secondary' },
      submitted: { label: 'Chờ duyệt', variant: 'default' },
      approved: { label: 'Đã duyệt', variant: 'default' },
      rejected: { label: 'Từ chối', variant: 'destructive' },
      ordered: { label: 'Đã đặt', variant: 'default' },
      partial: { label: 'Nhận 1 phần', variant: 'secondary' },
      received: { label: 'Hoàn thành', variant: 'default' },
      cancelled: { label: 'Đã hủy', variant: 'destructive' }
    }
    return variants[status] || { label: status, variant: 'secondary' }
  }

  const statusBadge = getStatusBadge(po.status)
  const isOverdue = new Date(po.expected_delivery_date) < new Date() && po.status !== 'received' && po.status !== 'cancelled'
  const daysUntilDelivery = differenceInDays(new Date(po.expected_delivery_date), new Date())

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" aria-label="Quay lại" onClick={() => navigateBack(navigate, '/purchase-orders')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{po.po_code}</h1>
            <p className="text-sm text-muted-foreground">{formatDate(po.order_date)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            {isOverdue && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />Quá hạn
              </Badge>
            )}
          </div>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-80px)]">
        <div className="p-4 space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tổng tiền</p>
                  <p className="text-xl font-bold">{formatCurrency(po.total_amount)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-muted-foreground" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Số mặt hàng</p>
                  <p className="text-2xl font-bold">{po.items?.length || 0}</p>
                </div>
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
            </Card>
          </div>

          {/* Vendor Info */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Nhà cung cấp</h3>
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={po.vendor?.logo_url} alt={po.vendor?.name} />
                <AvatarFallback>{po.vendor?.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{po.vendor?.name}</p>
                <p className="text-sm text-muted-foreground">{po.vendor?.code}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {po.vendor?.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4 flex-shrink-0" />
                  <span>{po.vendor.phone}</span>
                </div>
              )}
              {po.vendor?.address && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  <span className="line-clamp-2">{po.vendor.address}</span>
                </div>
              )}
              {po.vendor?.contact_person && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-4 h-4 flex-shrink-0" />
                  <span>{po.vendor.contact_person}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Timeline */}
          <Card className="p-4 space-y-3">
            <h3 className="font-semibold">Thời gian</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Ngày đặt
              </span>
              <span className="font-medium">{formatDate(po.order_date)}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Dự kiến giao
              </span>
              <div className="text-right">
                <p className="font-medium">{formatDate(po.expected_delivery_date)}</p>
                {!isOverdue && daysUntilDelivery > 0 && (
                  <p className="text-xs text-muted-foreground">Còn {daysUntilDelivery} ngày</p>
                )}
                {isOverdue && (
                  <p className="text-xs text-destructive">Trễ {Math.abs(daysUntilDelivery)} ngày</p>
                )}
              </div>
            </div>
            {po.actual_delivery_date && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Ngày giao thực tế
                  </span>
                  <span className="font-medium">{formatDate(po.actual_delivery_date)}</span>
                </div>
              </>
            )}
          </Card>

          {/* Items List */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Danh sách hàng ({po.items?.length || 0})</h3>
            <div className="space-y-3">
              {po.items?.map((item: any, index: number) => (
                <div key={index} className="p-3 rounded-lg bg-muted/50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.item?.name}</p>
                      <p className="text-sm text-muted-foreground">{item.item?.code}</p>
                    </div>
                    <div className="text-right ml-2">
                      <p className="font-semibold">{formatCurrency(item.total_price)}</p>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {item.quantity_ordered} {item.item?.unit}
                    </span>
                    <span className="text-muted-foreground">
                      @ {formatCurrency(item.unit_price)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Cost Breakdown */}
          <Card className="p-4 space-y-3">
            <h3 className="font-semibold">Chi tiết chi phí</h3>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tạm tính</span>
              <span className="font-medium">{formatCurrency(po.subtotal)}</span>
            </div>
            {po.tax_rate > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Thuế ({po.tax_rate}%)</span>
                <span className="font-medium">{formatCurrency(po.tax_amount)}</span>
              </div>
            )}
            {po.shipping_fee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Phí vận chuyển</span>
                <span className="font-medium">{formatCurrency(po.shipping_fee)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Tổng cộng</span>
              <span className="text-lg">{formatCurrency(po.total_amount)}</span>
            </div>
          </Card>

          {/* Shipping Address */}
          {po.shipping_address && (
            <Card className="p-4">
              <h3 className="font-semibold mb-2">Địa chỉ giao hàng</h3>
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
                <p className="text-muted-foreground">{po.shipping_address}</p>
              </div>
            </Card>
          )}

          {/* Order Info */}
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold mb-2">Thông tin đơn hàng</h3>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Người tạo</span>
              <span className="font-medium">{po.requested_by}</span>
            </div>
            {po.approved_by && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Người duyệt</span>
                <span className="font-medium">{po.approved_by}</span>
              </div>
            )}
            {po.approved_at && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ngày duyệt</span>
                <span className="font-medium">{formatDate(po.approved_at)}</span>
              </div>
            )}
          </Card>

          {/* Notes */}
          {po.notes && (
            <Card className="p-4">
              <h3 className="font-semibold mb-2">Ghi chú</h3>
              <p className="text-sm text-muted-foreground">{po.notes}</p>
            </Card>
          )}

          {/* Rejection Reason */}
          {po.status === 'rejected' && po.rejection_reason && (
            <Card className="p-4 border-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-destructive mb-1">Lý do từ chối</h3>
                  <p className="text-sm">{po.rejection_reason}</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
