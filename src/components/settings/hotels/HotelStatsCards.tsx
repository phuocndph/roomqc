import { Building2, CheckCircle2, XCircle, Bed, Users, Package } from 'lucide-react'
import { Hotel } from '@/hooks/useHotels'
import { cn } from '@/lib/utils'

interface HotelStatsCardsProps {
  hotels: Hotel[]
  viewMode?: 'all' | 'focus'
}

export function HotelStatsCards({ hotels, viewMode = 'all' }: HotelStatsCardsProps) {
  const stats = {
    total: hotels.length,
    active: hotels.filter(h => h.status === 'active').length,
    inactive: hotels.filter(h => h.status === 'inactive').length,
    totalRooms: hotels.reduce((sum, h) => sum + h.total_rooms, 0),
    totalStaff: hotels.reduce((sum, h) => sum + (h._count?.users || 0), 0),
    totalItems: hotels.reduce((sum, h) => sum + (h._count?.items || 0), 0),
  }

  const statItems = [
    {
      label: 'Tổng KS',
      value: stats.total,
      icon: Building2,
      color: 'text-primary',
    },
    {
      label: 'Hoạt động',
      value: stats.active,
      icon: CheckCircle2,
      color: 'text-green-600',
    },
    {
      label: 'Tạm ngưng',
      value: stats.inactive,
      icon: XCircle,
      color: 'text-red-600',
    },
    {
      label: 'Phòng đăng ký',
      value: stats.totalRooms,
      icon: Bed,
      color: 'text-blue-600',
    },
    {
      label: 'Nhân viên',
      value: stats.totalStaff,
      icon: Users,
      color: 'text-purple-600',
    },
    {
      label: 'Tài sản',
      value: stats.totalItems,
      icon: Package,
      color: 'text-orange-600',
    },
  ]

  return (
    <div className="grid gap-2 grid-cols-3 lg:grid-cols-6">
      {statItems.map((item) => (
        <div 
          key={item.label}
          className="flex items-center gap-2 p-3 border rounded-lg"
        >
          <item.icon className={cn("h-4 w-4", item.color)} />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-none">{item.value}</p>
            <p className="text-[10px] text-muted-foreground truncate">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
