import { Vendor } from '@/types/vendor.types';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  MapPin, 
  Phone, 
  User, 
  Package, 
  Star,
  DollarSign,
  Truck,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface VendorCardProps {
  vendor: Vendor;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
}

export function VendorCard({ vendor, onSelect, isSelected }: VendorCardProps) {
  const navigate = useNavigate();

  const getCategoryBadge = () => {
    const variants: Record<string, any> = {
      supplier: { label: 'Nhà cung cấp', variant: 'default' },
      service_provider: { label: 'Dịch vụ', variant: 'secondary' },
      contractor: { label: 'Thầu phụ', variant: 'outline' }
    };
    return variants[vendor.category] || { label: 'Khác', variant: 'outline' };
  };

  const categoryBadge = getCategoryBadge();

  return (
    <Card className="hover:shadow-lg transition-shadow relative group">
      {onSelect && (
        <div className="absolute top-4 left-4 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onSelect(vendor.id)}
          />
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="w-12 h-12">
            <AvatarImage src={vendor.logo_url} />
            <AvatarFallback>
              {vendor.name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">
              {vendor.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {vendor.code}
              </span>
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-medium">
                  {(vendor.rating ?? 0).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 mt-2">
          <Badge variant={categoryBadge.variant}>
            {categoryBadge.label}
          </Badge>
          {vendor.rating >= 4.5 && (
            <Badge variant="secondary">TOP RATED</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start gap-2">
          <Package className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-muted-foreground line-clamp-2">
            {(vendor.products_services || []).slice(0, 3).join(', ') || 'Chưa có'}
            {(vendor.products_services?.length || 0) > 3 && ` +${vendor.products_services!.length - 3}`}
          </span>
        </div>

        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-muted-foreground line-clamp-2">
            {vendor.address}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">{vendor.phone}</span>
        </div>

        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">{vendor.contact_person}</span>
        </div>

        <div className="pt-3 border-t space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              Điều khoản
            </span>
            <span className="font-medium">{vendor.payment_terms}</span>
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Truck className="w-3 h-3" />
              Giao hàng
            </span>
            <span className="font-medium">{vendor.delivery_time || 'N/A'}</span>
          </div>
          
          {vendor.minimum_order_value && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Đơn TT</span>
              <span className="font-medium">
                {formatCurrency(vendor.minimum_order_value)}
              </span>
            </div>
          )}
        </div>

        <div className="pt-3 border-t space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Tổng đơn</span>
            <span className="font-semibold">{vendor.total_orders}</span>
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Tổng GT</span>
            <span className="font-semibold">
              {formatCurrency(vendor.total_value)}
            </span>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">On-time</span>
              <span className="font-medium">
                {vendor.on_time_delivery_rate ?? 0}%
              </span>
            </div>
            <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full ${
                  (vendor.on_time_delivery_rate ?? 0) >= 95 
                    ? 'bg-green-500' 
                    : (vendor.on_time_delivery_rate ?? 0) >= 90 
                    ? 'bg-yellow-500' 
                    : 'bg-red-500'
                }`}
                style={{ width: `${vendor.on_time_delivery_rate ?? 0}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        <Button 
          variant="outline" 
          className="flex-1"
          onClick={() => navigate(`/vendors/${vendor.id}`)}
        >
          Chi tiết
        </Button>
        <Button 
          className="flex-1"
          onClick={() => navigate(`/purchase-orders/new?vendor=${vendor.id}`)}
        >
          Tạo đơn
        </Button>
      </CardFooter>
    </Card>
  );
}
