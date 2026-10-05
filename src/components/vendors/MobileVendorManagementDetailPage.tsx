import { useNavigate, useParams } from 'react-router-dom'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useVendor } from '@/hooks/useVendors'
import { Building2, Phone, Mail, MapPin, Star, Package, Edit } from 'lucide-react'

export const MobileVendorManagementDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: vendor, isLoading } = useVendor(id || '')

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <MobileDetailHeader title="Chi tiết nhà cung cấp" showBack />
        <div className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
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

  if (!vendor) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <MobileDetailHeader title="Chi tiết nhà cung cấp" showBack />
        <div className="p-4">
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Không tìm thấy nhà cung cấp</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title={vendor.name}
        showBack
      />

      <div className="p-4 space-y-4">
        {/* Info Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                <span className="font-semibold text-lg">{vendor.name}</span>
              </div>
              {vendor.code && <Badge variant="outline">{vendor.code}</Badge>}
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{vendor.phone || 'Chưa có'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{vendor.email || 'Chưa có'}</span>
              </div>
              {vendor.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span>{vendor.address}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats Card */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Thống kê</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                  <p className="text-2xl font-bold">{vendor.rating || 0}</p>
                </div>
                <p className="text-xs text-muted-foreground">Đánh giá</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Package className="h-4 w-4 text-primary" />
                  <p className="text-2xl font-bold">{vendor.total_orders || 0}</p>
                </div>
                <p className="text-xs text-muted-foreground">Đơn hàng</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">
                  {(vendor.total_value || 0).toLocaleString('vi-VN')}
                </p>
                <p className="text-xs text-muted-foreground">Tổng giá trị</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Person */}
        {vendor.contact_person && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2">Người liên hệ</h3>
              <p className="text-sm">{vendor.contact_person}</p>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {vendor.notes && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2">Ghi chú</h3>
              <p className="text-sm text-muted-foreground">{vendor.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={() => navigate(`/vendors/${id}/edit`)}
          >
            <Edit className="h-4 w-4 mr-2" />
            Chỉnh sửa
          </Button>
        </div>
      </div>
    </div>
  )
}
