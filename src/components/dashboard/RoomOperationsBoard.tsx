import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BedDouble, Brush, Check, ChevronRight, DoorOpen, LogIn, LogOut, Search, Wrench } from 'lucide-react'
import { format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useFloorPlanLive } from '@/hooks/useFloorPlanLive'
import { useTodayCheckins } from '@/hooks/useBookingStats'
import { useRoomTransition } from '@/hooks/useRoomTransition'
import { useUserModulePermissions } from '@/hooks/useUserModulePermissions'
import { useUser } from '@/hooks/useUser'
import { useRoomTypePricing } from '@/hooks/useRoomTypePricing'
import { useHotelContext } from '@/contexts/HotelContext'
import { RoomBookingDialog } from '@/components/rooms/RoomBookingDialog'
import { hasPermission } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { getOperationalLabel, getOperationalStatus, hasRoomGuest, isRoomReady, matchesOperationalFilter, needsRoomCleaning, type OperationalStatus } from '@/lib/rooms/operations'

const statusStyles = {
  available: { label: 'Trống sạch', color: 'text-green-700 dark:text-green-400', border: 'border-l-green-700', badge: 'bg-green-700 text-white' },
  occupied: { label: 'Đang có khách', color: 'text-blue-700 dark:text-blue-400', border: 'border-l-blue-700', badge: 'bg-blue-700 text-white' },
  dirty: { label: 'Cần dọn', color: 'text-orange-700 dark:text-orange-400', border: 'border-l-orange-700', badge: 'bg-orange-700 text-white' },
  blocked: { label: 'Tạm ngừng / Khác', color: 'text-slate-700 dark:text-slate-300', border: 'border-l-slate-700', badge: 'bg-slate-700 text-white' },
} as const

export function RoomOperationsBoard() {
  const { selectedHotel } = useHotelContext()
  // Remount filters and any open room action when switching hotels.
  return selectedHotel ? <HotelRoomBoard key={selectedHotel.id} hotelId={selectedHotel.id} /> : null
}

function HotelRoomBoard({ hotelId }: { hotelId: string }) {
  const { data, isLoading, isError, refetch } = useFloorPlanLive()
  const { data: arrivals, isLoading: arrivalsLoading, isError: arrivalsError } = useTodayCheckins()
  const { role, tenantId } = useUser()
  const { data: permissions } = useUserModulePermissions()
  const queryClient = useQueryClient()
  const transition = useRoomTransition()
  const [search, setSearch] = useState('')
  const [floor, setFloor] = useState('all')
  const [status, setStatus] = useState<OperationalStatus | 'all'>('all')
  const [openRoom, setOpenRoom] = useState<string | null>(null)
  const [bookingRoom, setBookingRoom] = useState<{ id: string; number: string; type: string } | null>(null)
  const canUpdate = permissions
    ? permissions.some(p => p.module === 'rooms' && (p.can_update || p.can_manage))
    : hasPermission(role, 'manage_rooms')
  const canBook = permissions
    ? permissions.some(p => p.module === 'bookings' && (p.can_create || p.can_manage))
    : hasPermission(role, 'manage_rooms')
  const canMaintain = permissions
    ? permissions.some(p => p.module === 'maintenance' && (p.can_create || p.can_manage))
    : hasPermission(role, 'manage_maintenance')
  const canCheckout = permissions
    ? permissions.some(p => p.module === 'bookings' && (p.can_update || p.can_manage))
    : hasPermission(role, 'manage_rooms')
  const floors = useMemo(() => Object.keys(data || {}).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })), [data])
  const rooms = useMemo(() => Object.values(data || {}).flat(), [data])
  const occupied = rooms.filter(hasRoomGuest).length
  const today = format(new Date(), 'yyyy-MM-dd')
  const dueOut = rooms.filter(room => room.current_booking?.check_out_date === today).length
  const hasFilters = !!search || floor !== 'all' || status !== 'all'
  const visibleFloors = floors.filter(f => floor === 'all' || f === floor).map(f => ({
    floor: f,
    rooms: (data?.[f] || []).filter(room => {
      const term = search.trim().toLocaleLowerCase('vi')
      return matchesOperationalFilter(room, status) && (!term || [room.room_number, room.room_type, room.current_booking?.guest_name, room.next_booking?.guest_name].some(value => value?.toLocaleLowerCase('vi').includes(term)))
    }),
  })).filter(group => group.rooms.length)
  const resetFilters = () => { setSearch(''); setFloor('all'); setStatus('all') }
  const metrics = [
    { label: 'Trống sạch', value: rooms.filter(isRoomReady).length, description: 'Sẵn sàng nhận khách', icon: DoorOpen, filter: 'available' as const, ...statusStyles.available },
    { label: 'Đang có khách', value: occupied, description: `${rooms.length ? Math.round(occupied / rooms.length * 100) : 0}% công suất · ${rooms.length} phòng`, icon: BedDouble, filter: 'occupied' as const, ...statusStyles.occupied },
    { label: 'Cần dọn', value: rooms.filter(needsRoomCleaning).length, description: 'Gồm cả phòng đang có khách', icon: Brush, filter: 'dirty' as const, ...statusStyles.dirty },
  ]

  return (
    <section aria-label="Tổng quan và sơ đồ phòng" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map(metric => (
          <button key={metric.filter} type="button" aria-pressed={status === metric.filter} onClick={() => setStatus(status === metric.filter ? 'all' : metric.filter)}
            className={cn('border border-l-4 bg-card p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4', metric.border, status === metric.filter && 'ring-2 ring-foreground')}>
            <span className="flex items-center justify-between gap-2 text-sm font-medium"><span>{metric.label}</span><metric.icon className={cn('h-4 w-4 shrink-0', metric.color)} /></span>
            {isLoading || isError ? <span className="mt-2 block text-3xl font-semibold">—</span> : <span className={cn('mt-2 block text-3xl font-semibold tabular-nums', metric.color)}>{metric.value}</span>}
            <span className="mt-1 block text-xs text-muted-foreground">{metric.description}</span>
          </button>
        ))}
        <Link to="/bookings?status=confirmed" className="border border-l-4 border-l-foreground bg-card p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4">
          <span className="flex items-center justify-between gap-2 text-sm font-medium">Khách đến hôm nay<LogIn className="h-4 w-4" /></span>
          <span className="mt-2 block text-3xl font-semibold tabular-nums">{arrivalsLoading || arrivalsError ? '—' : (arrivals?.length || 0)}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{arrivalsError ? 'Chưa tải được lịch khách đến' : `${dueOut} phòng dự kiến trả hôm nay`}</span>
        </Link>
      </div>

      <div className="border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div><h2 className="text-base font-semibold">Sơ đồ phòng</h2><p className="mt-0.5 text-xs text-muted-foreground">Chọn phòng để nhận khách, trả phòng hoặc cập nhật tình trạng.</p></div>
          <Button asChild variant="outline" size="sm"><Link to="/rooms?view=list">Quản lý phòng<ChevronRight className="h-4 w-4" /></Link></Button>
        </div>
        <div data-room-filters className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b bg-card p-3 shadow-sm">
          <div className="relative w-full sm:w-auto sm:min-w-[180px] sm:flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Tìm phòng hoặc tên khách" placeholder="Tìm phòng, hạng phòng, tên khách..." value={search} onChange={event => setSearch(event.target.value)} className="h-10 pl-9" />
          </div>
          <select aria-label="Lọc theo tầng" value={floor} onChange={event => setFloor(event.target.value)} className="h-10 max-w-full rounded-control border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="all">Tất cả tầng</option>{floors.map(f => <option key={f} value={f}>Tầng {f}</option>)}
          </select>
          <select aria-label="Lọc tình trạng phòng" value={status} onChange={event => setStatus(event.target.value as OperationalStatus | 'all')} className="h-10 max-w-full rounded-control border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="all">Tất cả tình trạng</option>{Object.entries(statusStyles).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
          {hasFilters && <Button variant="ghost" onClick={resetFilters}>Xóa lọc</Button>}
        </div>
        <div className="p-4">
          {isError ? (
            <div role="alert" className="space-y-3 py-6 text-center"><p className="text-sm">Chưa tải được tình trạng phòng. Vui lòng thử lại.</p><Button variant="outline" onClick={() => void refetch()}>Thử lại</Button></div>
          ) : isLoading ? (
            <div aria-label="Đang tải phòng" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
          ) : !rooms.length ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center"><DoorOpen className="h-8 w-8 text-muted-foreground" /><div><h3 className="text-sm font-semibold">Chưa có phòng</h3><p className="mt-1 text-sm text-muted-foreground">Thêm phòng hoặc nhập file Excel để bắt đầu vận hành.</p></div><Button asChild><Link to="/rooms?view=list">Thêm phòng / Nhập Excel</Link></Button></div>
          ) : !visibleFloors.length ? (
            <div className="space-y-3 py-8 text-center"><p className="text-sm">Không có phòng khớp với bộ lọc.</p><Button variant="outline" onClick={resetFilters}>Xóa bộ lọc</Button></div>
          ) : (
            <div className="space-y-5">
              <p role="status" className="text-xs text-muted-foreground">Hiển thị {visibleFloors.reduce((sum, group) => sum + group.rooms.length, 0)}/{rooms.length} phòng</p>
              {visibleFloors.map(group => (
                <div key={group.floor}><h3 className="mb-2 text-sm font-semibold">Tầng {group.floor}<span className="ml-2 font-normal text-muted-foreground">{group.rooms.length} phòng</span></h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
                    {group.rooms.map(room => {
                      const meta = statusStyles[getOperationalStatus(room)]
                      const booking = room.current_booking
                      const next = room.next_booking
                      const cleanTarget = !hasRoomGuest(room) && ['vacant_dirty', 'cleaning', 'check_out'].includes(room.status) ? 'vacant_clean' : room.status === 'occupied_dirty' ? 'occupied_clean' : null
                      const dirtyTarget = isRoomReady(room) ? 'vacant_dirty' : room.status === 'occupied_clean' || room.status === 'occupied' ? 'occupied_dirty' : null
                      return <Popover key={room.id} open={openRoom === room.id} onOpenChange={open => setOpenRoom(open ? room.id : null)}>
                        <PopoverTrigger asChild><button type="button" aria-label={`Phòng ${room.room_number}, ${getOperationalLabel(room)}`} className={cn('min-w-0 space-y-2 border border-l-4 bg-background p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', meta.border)}>
                          <span className="flex items-center justify-between gap-2"><span className="text-xl font-bold tabular-nums">{room.room_number}</span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></span>
                          <span className={cn('inline-block max-w-full rounded-badge px-2 py-1 text-xs font-medium', meta.badge)}>{getOperationalLabel(room)}</span>
                          <span className="block truncate text-xs text-muted-foreground" title={room.room_type}>{room.room_type || 'Chưa có hạng phòng'}</span>
                          {booking?.guest_name && <span className="block truncate text-sm" title={booking.guest_name}>{booking.guest_name}</span>}
                          {booking?.check_out_date === today && <span className="block text-xs font-semibold text-orange-700 dark:text-orange-400">Trả hôm nay</span>}
                        </button></PopoverTrigger>
                        <PopoverContent align="start" className="w-64 max-w-[calc(100vw-2rem)] space-y-2">
                          <p className="border-b pb-2 font-semibold">Phòng {room.room_number}</p>
                          {canCheckout && booking && <Button asChild className="w-full justify-start"><Link to={`/bookings?action=checkout&bookingId=${booking.id}`}><LogOut />Trả phòng</Link></Button>}
                          {canBook && isRoomReady(room) && next?.status === 'confirmed' && <Button asChild className="w-full justify-start"><Link to={`/bookings?action=checkin&bookingId=${next.id}`}><LogIn />Nhận khách đã đặt</Link></Button>}
                          {canBook && isRoomReady(room) && <Button className="w-full justify-start" variant={next ? 'outline' : 'default'} onClick={() => { setOpenRoom(null); setBookingRoom({ id: room.id, number: room.room_number, type: room.room_type }) }}><LogIn />Nhận khách / Đặt phòng</Button>}
                          {canUpdate && (cleanTarget || dirtyTarget) && <Button variant="outline" className="w-full justify-start" disabled={transition.isPending} onClick={() => transition.mutate({ roomId: room.id, toStatus: cleanTarget || dirtyTarget!, reason: 'Cập nhật từ trang tổng quan' }, { onSuccess: () => { setOpenRoom(null); void queryClient.invalidateQueries({ queryKey: ['floor-plan-live', hotelId] }) } })}>{cleanTarget ? <Check /> : <Brush />}{transition.isPending ? 'Đang cập nhật...' : cleanTarget ? 'Đánh dấu đã dọn' : 'Đánh dấu cần dọn'}</Button>}
                          {canMaintain && <Button asChild variant="outline" className="w-full justify-start"><Link to={`/maintenance/requests/new?roomId=${room.id}`}><Wrench />Báo bảo trì</Link></Button>}
                          <Button asChild variant="ghost" className="w-full justify-start"><Link to={`/rooms/${room.id}`}>Xem chi tiết phòng<ChevronRight /></Link></Button>
                        </PopoverContent>
                      </Popover>
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {bookingRoom && tenantId && <DashboardRoomBooking room={bookingRoom} hotelId={hotelId} tenantId={tenantId} onClose={() => { setBookingRoom(null); void queryClient.invalidateQueries({ queryKey: ['floor-plan-live', hotelId] }) }} />}
    </section>
  )
}

function DashboardRoomBooking({ room, hotelId, tenantId, onClose }: {
  room: { id: string; number: string; type: string }
  hotelId: string
  tenantId: string
  onClose: () => void
}) {
  const pricing = useRoomTypePricing(room.type, hotelId)
  return <RoomBookingDialog open onOpenChange={open => { if (!open) onClose() }} roomId={room.id} roomNumber={room.number} hotelId={hotelId} tenantId={tenantId} defaultRoomPrice={pricing.nightly || 0} />
}
