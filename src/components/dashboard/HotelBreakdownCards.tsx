import { Building2, Package, TrendingUp, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useHotelsBreakdownStats } from '@/hooks/useDashboardStats'
import { Skeleton } from '@/components/ui/skeleton'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function HotelBreakdownCards() {
  const { t } = useTranslation('dashboard')
  const { data: hotels, isLoading } = useHotelsBreakdownStats()
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('hotelBreakdown.title', 'Phân bổ theo khách sạn')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!hotels || hotels.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('hotelBreakdown.title', 'Phân bổ theo khách sạn')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('hotelBreakdown.noData', 'Chưa có dữ liệu khách sạn')}</p>
        </CardContent>
      </Card>
    )
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('hotelBreakdown.title', 'Phân bổ theo khách sạn')}</CardTitle>
        <Badge variant="secondary" className="gap-1">
          <Building2 className="h-3 w-3" />
          {hotels.length} {t('hotelBreakdown.hotels', 'khách sạn')}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {hotels.map((hotel) => (
            <Card
              key={hotel.hotel_id}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
              onClick={() => navigate(`/hotels/performance?hotelId=${encodeURIComponent(hotel.hotel_id)}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{hotel.hotel_name}</CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {hotel.hotel_code}
                    </Badge>
                  </div>
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-sm text-muted-foreground">{t('hotelBreakdown.value', 'Giá trị')}</span>
                  </div>
                  <span className="font-semibold text-sm">
                    {formatCurrency(hotel.total_value)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('hotelBreakdown.total', 'Tổng')}:</span>
                    <span className="font-medium">{hotel.total_items}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3.5 w-3.5 rounded-full border border-green-600 flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-green-600" />
                    </div>
                    <span className="text-muted-foreground">{t('hotelBreakdown.stock', 'Kho')}:</span>
                    <span className="font-medium">{hotel.in_stock}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3.5 w-3.5 rounded-full border border-blue-600 flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                    </div>
                    <span className="text-muted-foreground">{t('hotelBreakdown.inUse', 'Đang dùng')}:</span>
                    <span className="font-medium">{hotel.in_use}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3.5 w-3.5 rounded-full border border-slate-500 flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                    </div>
                    <span className="text-muted-foreground">{t('hotelBreakdown.laundry', 'Giặt')}:</span>
                    <span className="font-medium">{hotel.in_laundry}</span>
                  </div>
                </div>

                {hotel.low_stock_count > 0 && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-xs text-muted-foreground">
                      {hotel.low_stock_count} {t('hotelBreakdown.needRestock', 'tài sản cần bổ sung')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
