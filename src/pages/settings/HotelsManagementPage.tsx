import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Building2, Plus, Search } from 'lucide-react'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { useHotels, useDeleteHotel, Hotel } from '@/hooks/useHotels'
import { HotelCard } from '@/components/settings/hotels/HotelCard'
import { HotelFormDialog } from '@/components/settings/hotels/HotelFormDialog'
import { HotelDetailDialog } from '@/components/settings/hotels/HotelDetailDialog'
import { DeactivateHotelDialog } from '@/components/settings/hotels/DeactivateHotelDialog'
import { HotelStatsCards } from '@/components/settings/hotels/HotelStatsCards'
import { HotelFilters, HotelFiltersState } from '@/components/settings/hotels/HotelFilters'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MobileHotelManagementPage } from '@/components/settings/MobileHotelManagementPage'
import { useBreakpoint } from '@/lib/breakpoints'

export default function HotelsManagementPage() {
  const { isMobile } = useBreakpoint()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false)
  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [hotelToDelete, setHotelToDelete] = useState<Hotel | null>(null)
  const [filters, setFilters] = useState<HotelFiltersState>({
    status: 'all',
    type: 'all',
    city: 'all',
    manager_id: 'all',
    search: '',
  })

  const { data: hotels, isLoading } = useHotels(filters)
  const deleteHotel = useDeleteHotel()

  if (isMobile) {
    return <MobileHotelManagementPage />
  }

  const cities = [...new Set(hotels?.map(h => h.city).filter(Boolean))] as string[]
  const managers = [...new Set(hotels?.map(h => 
    h.manager_id && h.manager_name ? { id: h.manager_id, name: h.manager_name } : null
  ).filter(Boolean))] as Array<{ id: string; name: string }>

  const handleEdit = (hotel: Hotel) => {
    setSelectedHotel(hotel)
    setDialogOpen(true)
  }

  const handleDelete = (hotel: Hotel) => {
    setHotelToDelete(hotel)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (hotelToDelete) {
      await deleteHotel.mutateAsync(hotelToDelete.id)
      setDeleteDialogOpen(false)
      setHotelToDelete(null)
    }
  }

  const handleAddNew = () => {
    setSelectedHotel(null)
    setDialogOpen(true)
  }

  const handleView = (hotel: Hotel) => {
    setSelectedHotel(hotel)
    setDetailDialogOpen(true)
  }

  const handleDeactivate = (hotel: Hotel) => {
    setSelectedHotel(hotel)
    setDeactivateDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-6 w-40 bg-muted animate-pulse rounded" />
            <div className="h-4 w-60 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        </div>
        {/* Stats skeleton */}
        <div className="grid gap-3 grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded border" />
          ))}
        </div>
        {/* List skeleton */}
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded border" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Quản lý khách sạn</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hotels?.length || 0} khách sạn trong hệ thống
          </p>
        </div>
        <PermissionGate module="hotels" action="create">
          <Button size="sm" onClick={handleAddNew} className="h-8">
            <Plus className="h-4 w-4 mr-1" />
            Thêm mới
          </Button>
        </PermissionGate>
      </div>

      {/* Stats Row */}
      {hotels && hotels.length > 0 && <HotelStatsCards hotels={hotels} />}

      {/* Filters */}
      <HotelFilters 
        filters={filters}
        onFiltersChange={(f) => setFilters(prev => ({ ...prev, ...f }))}
        cities={cities}
        managers={managers}
      />

      {/* Hotel List */}
      {hotels && hotels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border border-dashed rounded-lg">
          <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-3">Chưa có khách sạn nào</p>
          <Button size="sm" onClick={handleAddNew}>
            <Plus className="h-4 w-4 mr-1" />
            Thêm khách sạn đầu tiên
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {hotels?.map((hotel) => (
            <HotelCard
              key={hotel.id}
              hotel={hotel}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onView={handleView}
              onDeactivate={handleDeactivate}
            />
          ))}
        </div>
      )}

      <HotelFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        hotel={selectedHotel}
      />

      <HotelDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        hotel={selectedHotel}
        onEdit={handleEdit}
      />

      <DeactivateHotelDialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
        hotel={selectedHotel}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa khách sạn</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa "{hotelToDelete?.name}"? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
