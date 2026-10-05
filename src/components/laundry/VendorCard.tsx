import { Star, MapPin, Phone, User, DollarSign, Package } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatCurrency } from '@/lib/utils'
import type { LaundryVendor } from '@/types/laundry.types'

interface VendorCardProps {
  vendor: LaundryVendor
  onClick?: () => void
}

export function VendorCard({ vendor, onClick }: VendorCardProps) {
  const logo = (vendor.contract_info as any)?.logo_url
  const pricePerKg = (vendor.contract_info as any)?.price_per_kg || 0
  const minOrder = (vendor.contract_info as any)?.minimum_order_kg || 0
  
  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-lg" onClick={onClick}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={logo} alt={vendor.name} />
              <AvatarFallback>{vendor.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold">{vendor.name}</h3>
              <div className="flex items-center gap-1 text-sm">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="font-medium">{(vendor.rating || 0).toFixed(1)}</span>
                <span className="text-muted-foreground">/5.0</span>
              </div>
            </div>
          </div>
          <Badge variant={vendor.type === 'external' ? 'default' : 'secondary'}>
            {vendor.type === 'external' ? 'Ngoài' : 'Nội bộ'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span className="line-clamp-1">{vendor.address}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4" />
            <span>{vendor.phone}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            <span>{vendor.contact_person}</span>
          </div>
        </div>
        
        <div className="border-t pt-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                <span>Giá/kg</span>
              </div>
              <p className="font-semibold">{formatCurrency(pricePerKg)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Package className="h-3 w-3" />
                <span>Tối thiểu</span>
              </div>
              <p className="font-semibold">{minOrder} kg</p>
            </div>
          </div>
        </div>
        
        <div className="border-t pt-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground">Tổng đơn</p>
              <p className="font-semibold">{vendor.total_orders || 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Tổng giá trị</p>
              <p className="font-semibold">
                {formatCurrency(vendor.total_value || 0)}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={(e) => {
            e.stopPropagation()
            onClick?.()
          }}>
            Xem chi tiết
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
