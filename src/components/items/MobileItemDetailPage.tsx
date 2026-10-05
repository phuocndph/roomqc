import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { navigateBack } from '@/lib/navigation'
import { useItem } from '@/hooks/useItems'
import {
  Package,
  Check,
  Copy,
  Edit,
  QrCode,
  TrendingUp,
  TrendingDown,
  Boxes,
  Home,
  ShoppingCart,
  Shirt,
  AlertTriangle,
  MapPin,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { QRCodeDisplay } from '@/components/shared/QRCodeDisplay'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useHasPermission } from '@/hooks/usePermission'

const STATUS_CONFIG = {
  in_stock: { label: 'Còn hàng', variant: 'default' as const },
  low_stock: { label: 'Sắp hết', variant: 'secondary' as const },
  out_of_stock: { label: 'Hết hàng', variant: 'destructive' as const },
}

const TRANSACTION_ICONS = {
  in: TrendingUp,
  out: TrendingDown,
  adjustment: Package,
}

export const MobileItemDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useItem(id)
  const [showQR, setShowQR] = useState(false)
  const [copied, setCopied] = useState(false)
  const { hasPermission: canEdit } = useHasPermission('items', 'update')

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <MobileDetailHeader title="Chi tiết tài sản" showBack />
        <div className="p-4 space-y-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-32 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const detailData = data as any
  if (!detailData?.item) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <MobileDetailHeader title="Chi tiết tài sản" showBack />
        <div className="p-4">
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium mb-2">Không tìm thấy tài sản</p>
              <Button onClick={() => navigateBack(navigate, '/items')}>Quay lại</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const item = detailData.item
  const category = detailData.category
  const hotel = detailData.hotel
  const recentTransactions = detailData.recent_transactions || []
  const roomAllocations = detailData.room_allocations || []

  const stockStatus =
    item.quantity_in_stock === 0
      ? 'out_of_stock'
      : item.quantity_in_stock < item.minimum_stock
      ? 'low_stock'
      : 'in_stock'

  const { label, variant } = STATUS_CONFIG[stockStatus]

  const handleCopyQr = async () => {
    if (!item.qr_code) return
    try {
      await navigator.clipboard.writeText(item.qr_code)
      setCopied(true)
      toast.success('Đã sao chép mã QR')
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Không thể sao chép mã QR')
    }
  }

  // Get primary image
  const primaryImage = item.item_images?.find((img: any) => img.is_primary)?.url

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title={item.code}
        showBack
        action={canEdit ? {
          icon: Edit,
          onClick: () => navigate(`/items/${id}/edit`),
        } : undefined}
      />

      <div className="p-4 space-y-4">
        {/* Hero Image */}
        {primaryImage && (
          <Card className="overflow-hidden">
            <img
              src={primaryImage}
              alt={item.name}
              className="w-full h-48 object-cover"
            />
          </Card>
        )}

        {/* Basic Info */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold mb-1">{item.name}</h1>
                {item.name_en && (
                  <p className="text-sm text-muted-foreground">{item.name_en}</p>
                )}
              </div>
              <Badge variant={variant}>{label}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Mã tài sản</p>
                <p className="font-medium">{item.code}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Danh mục</p>
                <p className="font-medium">{category?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đơn vị</p>
                <p className="font-medium">{item.unit}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Đơn giá</p>
                <p className="font-medium">
                  {new Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: 'VND',
                  }).format(item.unit_price || 0)}
                </p>
              </div>
              {hotel?.name && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Khách sạn</p>
                  <p className="font-medium">{hotel.name}</p>
                </div>
              )}
            </div>

            {item.description && (
              <div className="pt-3 border-t">
                <p className="text-xs text-muted-foreground mb-1">Mô tả</p>
                <p className="text-sm">{item.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stock Levels */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Boxes className="h-5 w-5" />
              Tồn kho
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Boxes className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Tổng số</span>
                </div>
                <p className="text-2xl font-bold">{item.quantity_total || 0}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Home className="h-4 w-4 text-blue-600" />
                  <span className="text-xs text-muted-foreground">Trong kho</span>
                </div>
                <p className="text-2xl font-bold">{item.quantity_in_stock || 0}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-muted-foreground">Đang dùng</span>
                </div>
                <p className="text-2xl font-bold">{item.quantity_in_use || 0}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Shirt className="h-4 w-4 text-purple-600" />
                  <span className="text-xs text-muted-foreground">Đang giặt</span>
                </div>
                <p className="text-2xl font-bold">{item.quantity_in_laundry || 0}</p>
              </div>
            </div>

            {stockStatus !== 'in_stock' && (
              <div className={cn(
                'flex items-start gap-2 rounded-lg border p-3',
                stockStatus === 'out_of_stock'
                  ? 'border-destructive/20 bg-destructive/10'
                  : 'border-warning/20 bg-warning/10'
              )}>
                <AlertTriangle className={cn(
                  'h-4 w-4 flex-shrink-0 mt-0.5',
                  stockStatus === 'out_of_stock' ? 'text-destructive' : 'text-warning'
                )} />
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm font-medium',
                    stockStatus === 'out_of_stock' ? 'text-destructive' : 'text-warning'
                  )}>
                    {stockStatus === 'out_of_stock' ? 'Đã hết hàng' : 'Sắp hết hàng'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stockStatus === 'out_of_stock'
                      ? 'Cần bổ sung tồn kho trước khi phân bổ.'
                      : `Tồn kho thấp hơn mức tối thiểu (${item.minimum_stock} ${item.unit})`}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* QR Code */}
        {item.qr_code && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowQR(true)}
              >
                <QrCode className="h-4 w-4 mr-2" />
                Xem mã QR
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Dùng mã này để tra cứu nhanh tài sản
              </p>
            </CardContent>
          </Card>
        )}

        {/* Room allocations */}
        {roomAllocations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Đang phân bổ tại phòng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {roomAllocations.slice(0, 5).map((allocation: any) => (
                <Link
                  key={allocation.id}
                  to={`/rooms/${allocation.room_id}`}
                  className="flex items-center justify-between rounded-md border p-3 text-sm transition-colors hover:bg-muted"
                >
                  <span className="font-medium">Phòng {allocation.room_number}</span>
                  <span className="text-muted-foreground">{allocation.quantity} {item.unit}</span>
                </Link>
              ))}
              {roomAllocations.length > 5 && (
                <p className="pt-1 text-center text-xs text-muted-foreground">
                  Và {roomAllocations.length - 5} phòng khác
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Transactions */}
        {recentTransactions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Giao dịch gần đây</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentTransactions.slice(0, 5).map((transaction: any) => {
                const Icon = TRANSACTION_ICONS[transaction.transaction_type] || Package
                return (
                  <div
                    key={transaction.id}
                    className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0"
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                        transaction.transaction_type === 'in'
                          ? 'bg-success/10'
                          : transaction.transaction_type === 'out'
                          ? 'bg-destructive/10'
                          : 'bg-muted'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-5 w-5',
                          transaction.transaction_type === 'in'
                            ? 'text-success'
                            : transaction.transaction_type === 'out'
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {transaction.transaction_type === 'in'
                          ? `+${transaction.quantity}`
                          : transaction.quantity}{' '}
                        {item.unit}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {transaction.transaction_code}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {transaction.created_at && !isNaN(new Date(transaction.created_at).getTime())
                          ? formatDistanceToNow(new Date(transaction.created_at), {
                              addSuffix: true,
                              locale: vi,
                            })
                          : 'Không xác định'}
                      </p>
                    </div>
                    {transaction.from_location && (
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {transaction.from_location}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {/* QR Dialog */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mã QR - {item.name}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <QRCodeDisplay value={item.qr_code || item.id} size={200} />
          </div>
          <p className="text-center text-sm text-muted-foreground">{item.code}</p>
          {item.qr_code && (
            <Button type="button" variant="outline" onClick={handleCopyQr}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Đã sao chép' : 'Sao chép mã'}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
