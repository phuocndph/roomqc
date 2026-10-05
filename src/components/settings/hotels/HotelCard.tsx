import { Hotel } from '@/hooks/useHotels'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  Users, 
  Bed, 
  Package,
  Wrench,
  Shirt,
  MoreVertical, 
  Edit, 
  Eye, 
  XCircle,
  Trash2,
  Globe,
  User
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface HotelCardProps {
  hotel: Hotel
  onEdit: (hotel: Hotel) => void
  onDelete: (hotel: Hotel) => void
  onView?: (hotel: Hotel) => void
  onDeactivate?: (hotel: Hotel) => void
}

export function HotelCard({ hotel, onEdit, onDelete, onView, onDeactivate }: HotelCardProps) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'active':
        return { label: 'Hoạt động', color: 'text-green-600', dot: 'bg-green-500' }
      case 'inactive':
        return { label: 'Tạm ngưng', color: 'text-red-600', dot: 'bg-red-500' }
      case 'maintenance':
        return { label: 'Bảo trì', color: 'text-amber-600', dot: 'bg-amber-500' }
      default:
        return { label: status, color: 'text-muted-foreground', dot: 'bg-muted' }
    }
  }

  const getTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      hotel: 'Khách sạn',
      resort: 'Resort',
      apartment: 'Căn hộ',
      hostel: 'Hostel',
      other: 'Khác'
    }
    return types[type] || type
  }

  const statusConfig = getStatusConfig(hotel.status)

  return (
    <div className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Icon + Content */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Logo/Icon */}
          {hotel.logo_url ? (
            <img
              src={hotel.logo_url}
              alt={hotel.name}
              className="h-9 w-9 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
          )}
          
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header Row */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm truncate">{hotel.name}</h3>
                  <span className="text-xs text-muted-foreground font-mono">{hotel.code}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground">{getTypeLabel(hotel.type)}</span>
                  <div className="flex items-center gap-1">
                    <div className={cn("w-1.5 h-1.5 rounded-full", statusConfig.dot)} />
                    <span className={cn("text-xs font-medium", statusConfig.color)}>
                      {statusConfig.label}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Location & Contact - Compact Row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {hotel.address && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate max-w-[200px]">
                    {hotel.city || hotel.address}
                  </span>
                </div>
              )}
              {hotel.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <span>{hotel.phone}</span>
                </div>
              )}
              {hotel.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <span className="truncate max-w-[150px]">{hotel.email}</span>
                </div>
              )}
              {hotel.website && (
                <a 
                  href={hotel.website} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Globe className="h-3 w-3" />
                  <span>Website</span>
                </a>
              )}
            </div>

            {/* Stats Row - Compact */}
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t text-xs">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">{hotel._count?.users || 0}</span>
                <span className="text-muted-foreground">NV</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Bed className="h-3.5 w-3.5 text-blue-600" />
                <span className="font-medium">{hotel._count?.rooms || 0}</span>
                <span className="text-muted-foreground">Phòng thực tế</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-orange-600" />
                <span className="font-medium">{hotel._count?.items || 0}</span>
                <span className="text-muted-foreground">Đồ</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shirt className="h-3.5 w-3.5 text-purple-600" />
                <span className="font-medium">{hotel._count?.laundry_batches || 0}</span>
                <span className="text-muted-foreground">Giặt</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-amber-600" />
                <span className="font-medium">{hotel._count?.maintenance_requests || 0}</span>
                <span className="text-muted-foreground">Bảo trì</span>
              </div>
              
              {/* Manager info */}
              {hotel.manager_name && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">QL:</span>
                  <span className="font-medium">{hotel.manager_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" aria-label="Thêm tùy chọn">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onView && (
              <DropdownMenuItem onClick={() => onView(hotel)}>
                <Eye className="h-4 w-4 mr-2" />
                Xem chi tiết
              </DropdownMenuItem>
            )}
            <PermissionGate module="hotels" action="update">
              <DropdownMenuItem onClick={() => onEdit(hotel)}>
                <Edit className="h-4 w-4 mr-2" />
                Chỉnh sửa
              </DropdownMenuItem>
              {hotel.status === 'active' && onDeactivate && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => onDeactivate(hotel)}
                    className="text-amber-600"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Tạm ngưng
                  </DropdownMenuItem>
                </>
              )}
            </PermissionGate>
            <PermissionGate module="hotels" action="delete">
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onDelete(hotel)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Xóa
              </DropdownMenuItem>
            </PermissionGate>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
