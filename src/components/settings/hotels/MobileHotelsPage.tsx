import { useState } from 'react'
import { Building2, Plus, MapPin, Users, RefreshCw, ChevronRight, Layers, Bed, Package, Phone } from 'lucide-react'
import { useHotels } from '@/hooks/useHotels'
import { HotelFormDialog } from '@/components/settings/hotels/HotelFormDialog'
import { HotelDetailDialog } from '@/components/settings/hotels/HotelDetailDialog'
import { useHotelContext } from '@/contexts/HotelContext'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Hotel } from '@/hooks/useHotels'
import { Button } from '@/components/ui/button'
import { PullToRefresh } from '@/components/mobile/TouchOptimized'
import { cn } from '@/lib/utils'

export function MobileHotelsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  const { data: hotels, isLoading } = useHotels({})
  const { selectedHotel: currentHotel, isAllHotelsMode } = useHotelContext()
  const queryClient = useQueryClient()

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: ['hotels'] })
    toast.success('Đã làm mới danh sách')
    setIsRefreshing(false)
  }

  const handleAddNew = () => {
    setSelectedHotel(null)
    setIsFormOpen(true)
  }

  const handleView = (hotel: Hotel) => {
    setSelectedHotel(hotel)
    setIsDetailOpen(true)
  }

  const handleEdit = (hotel: Hotel) => {
    setSelectedHotel(hotel)
    setIsFormOpen(true)
  }

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

  // Stats
  const stats = hotels ? {
    total: hotels.length,
    active: hotels.filter(h => h.status === 'active').length,
    rooms: hotels.reduce((sum, h) => sum + (h._count?.rooms || 0), 0),
  } : { total: 0, active: 0, rooms: 0 }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Compact Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h1 className="text-base font-semibold">Khách sạn</h1>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              <span>{stats.total} KS</span>
              <span className="text-green-600">{stats.active} hoạt động</span>
              <span>{stats.rooms} phòng</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRefresh}
              disabled={isRefreshing}
             aria-label="Làm mới">
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
            <Button size="sm" className="h-8" onClick={handleAddNew}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="flex-1 p-3 space-y-2">
          {isLoading ? (
            // Skeleton loading
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="border rounded-lg p-3 animate-pulse">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 bg-muted rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-2/3" />
                      <div className="h-3 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : hotels && hotels.length > 0 ? (
            <div className="space-y-2">
              {hotels.map((hotel) => {
                const statusConfig = getStatusConfig(hotel.status || 'active')
                const isSelected = hotel.id === currentHotel?.id
                
                return (
                  <div 
                    key={hotel.id}
                    className={cn(
                      "border rounded-lg p-3 transition-all active:scale-[0.98]",
                      isSelected && "ring-2 ring-primary"
                    )}
                    onClick={() => handleView(hotel)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Logo/Icon */}
                      {hotel.logo_url ? (
                        <img
                          src={hotel.logo_url}
                          alt={hotel.name}
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-medium text-sm truncate">{hotel.name}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground font-mono">{hotel.code}</span>
                              <div className="flex items-center gap-1">
                                <div className={cn("w-1.5 h-1.5 rounded-full", statusConfig.dot)} />
                                <span className={cn("text-xs", statusConfig.color)}>
                                  {statusConfig.label}
                                </span>
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <span className="text-[10px] text-primary font-medium shrink-0">
                              Đang chọn
                            </span>
                          )}
                        </div>

                        {/* Location */}
                        {(hotel.city || hotel.address) && (
                          <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{hotel.city || hotel.address}</span>
                          </div>
                        )}

                        {/* Stats Row */}
                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <div className="flex items-center gap-1">
                            <Bed className="h-3 w-3 text-blue-600" />
                            <span className="font-medium">{hotel._count?.rooms || 0}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-purple-600" />
                            <span className="font-medium">{hotel._count?.users || 0}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Package className="h-3 w-3 text-orange-600" />
                            <span className="font-medium">{hotel._count?.items || 0}</span>
                          </div>
                        </div>
                      </div>

                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-3" />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Empty state
            <div className="flex flex-col items-center justify-center py-12 border border-dashed rounded-lg">
              <Building2 className="h-10 w-10 text-muted-foreground" />
              <h3 className="mt-3 text-sm font-medium">Chưa có khách sạn</h3>
              <p className="mt-1 text-xs text-muted-foreground text-center">
                Thêm khách sạn đầu tiên để bắt đầu
              </p>
              <Button className="mt-3" size="sm" onClick={handleAddNew}>
                <Plus className="mr-1 h-4 w-4" />
                Thêm khách sạn
              </Button>
            </div>
          )}
        </div>
      </PullToRefresh>

      {/* Dialogs */}
      <HotelFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        hotel={selectedHotel}
      />

      <HotelDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        hotel={selectedHotel}
        onEdit={(hotel) => {
          setIsDetailOpen(false)
          handleEdit(hotel)
        }}
      />
    </div>
  )
}
