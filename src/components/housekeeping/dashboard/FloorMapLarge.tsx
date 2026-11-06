import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Brush, Check, ChevronRight, DoorOpen, Search, Sparkles, Wrench } from 'lucide-react'
import { useFloorPlanLive, type FloorPlanRoom } from '@/hooks/useFloorPlanLive'
import type { CleaningProgress } from '@/hooks/useHousekeepingDashboardPanels'
import { useHotelContext } from '@/contexts/HotelContext'
import { useHasPermission } from '@/hooks/usePermission'
import { CreateTaskDialog } from '@/components/housekeeping/CreateTaskDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getOperationalLabel, getOperationalStatus, isRoomReady } from '@/lib/rooms/operations'
import { cn } from '@/lib/utils'
import { PanelError } from './PanelError'

type RoomFilter = 'all' | 'dirty' | 'cleaning' | 'review' | 'ready' | 'occupied' | 'blocked'

const STATES = {
  dirty: { label: 'Chờ dọn', badge: 'bg-orange-700 text-white', border: 'border-l-orange-700', icon: Brush },
  cleaning: { label: 'Đang dọn', badge: 'bg-blue-700 text-white', border: 'border-l-blue-700', icon: Sparkles },
  review: { label: 'Chờ kiểm tra', badge: 'bg-purple-700 text-white', border: 'border-l-purple-700', icon: Check },
  ready: { label: 'Trống sạch', badge: 'bg-green-700 text-white', border: 'border-l-green-700', icon: Check },
  occupied: { label: 'Có khách', badge: 'bg-blue-700 text-white', border: 'border-l-blue-700', icon: DoorOpen },
  blocked: { label: 'Tạm ngừng / Khác', badge: 'bg-slate-700 text-white', border: 'border-l-slate-700', icon: Wrench },
} as const

function roomState(room: FloorPlanRoom, work?: CleaningProgress): Exclude<RoomFilter, 'all'> {
  if (['maintenance', 'out_of_order', 'out_of_service', 'skipper'].includes(room.status)) return 'blocked'
  if (!['dnd', 'service_refused'].includes(room.status)) {
    if (work?.inProgressRoomIds.includes(room.id)) return 'cleaning'
    if (work?.reworkRoomIds.includes(room.id)) return 'dirty'
    if (work?.awaitingReviewRoomIds.includes(room.id)) return 'review'
  }
  if (room.status === 'cleaning') return 'cleaning'
  if (isRoomReady(room)) return 'ready'
  const state = getOperationalStatus(room)
  return state === 'available' ? 'ready' : state
}

export function FloorMapLarge({ work, workLoading = false, workError = false, onRetryWork }: { work?: CleaningProgress; workLoading?: boolean; workError?: boolean; onRetryWork?: () => void } = {}) {
  const { selectedHotel } = useHotelContext()
  const query = useFloorPlanLive()
  const { data, isFetching, refetch } = query
  const isLoading = query.isLoading || workLoading
  const isError = query.isError || workError
  const { hasPermission: canAssign } = useHasPermission('rooms', 'manage')
  const [status, setStatus] = useState<RoomFilter>('all')
  const [floor, setFloor] = useState('all')
  const [type, setType] = useState('all')
  const [search, setSearch] = useState('')
  const [taskRoom, setTaskRoom] = useState<FloorPlanRoom | null>(null)

  const floors = useMemo(() => Object.entries(data || {}).sort(([a], [b]) => a.localeCompare(b, 'vi', { numeric: true })), [data])
  const rooms = useMemo(() => floors.flatMap(([, list]) => list), [floors])
  const types = useMemo(() => [...new Set(rooms.map(room => room.room_type).filter(Boolean))].sort(), [rooms])
  const counts = useMemo(() => {
    const result = { dirty: 0, cleaning: 0, review: 0, ready: 0, occupied: 0, blocked: 0 }
    rooms.forEach(room => result[roomState(room, work)]++)
    return result
  }, [rooms, work])
  const visible = useMemo(() => floors
    .filter(([name]) => floor === 'all' || name === floor)
    .map(([name, list]) => ({
      name,
      rooms: list.filter(room => (status === 'all' || roomState(room, work) === status)
        && (type === 'all' || room.room_type === type)
        && (!search.trim() || room.room_number.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
        .sort((a, b) => a.room_number.localeCompare(b.room_number, 'vi', { numeric: true })),
    })).filter(group => group.rooms.length), [floors, floor, status, type, search, work])
  const hasFilters = status !== 'all' || floor !== 'all' || type !== 'all' || !!search
  const reset = () => { setStatus('all'); setFloor('all'); setType('all'); setSearch('') }
  const filterStatus = (next: RoomFilter) => { setStatus(next); setFloor('all'); setType('all'); setSearch('') }

  return (
    <section id="housekeeping-floor-map" aria-label="Tình trạng buồng phòng" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['dirty', 'cleaning', 'review', 'ready'] as const).map(key => {
          const meta = STATES[key]
          const Icon = meta.icon
          return <button key={key} type="button" aria-pressed={status === key} onClick={() => filterStatus(status === key ? 'all' : key)}
            className={cn('flex min-w-0 items-center gap-3 border border-l-4 bg-background p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4', meta.border, status === key && 'ring-2 ring-primary')}>
            <Icon className="hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
            <span className="min-w-0"><span className="block text-sm font-medium">{meta.label}</span><span className="mt-1 block text-3xl font-bold tabular-nums">{isLoading ? '…' : isError ? '—' : counts[key]}</span></span>
          </button>
        })}
      </div>

      <div className="min-w-0 border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <div><h2 className="font-semibold">Phòng theo tầng</h2><p className="mt-1 text-sm text-muted-foreground">Chọn phòng để xem chi tiết hoặc giao việc.</p></div>
          <Button asChild variant="outline" size="sm"><Link to="/rooms?view=list">Quản lý phòng<ChevronRight className="h-4 w-4" /></Link></Button>
        </div>
        <div className="space-y-3 border-b p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <div className="relative col-span-2 min-w-0 sm:min-w-[150px] sm:flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Tìm số phòng" placeholder="Tìm số phòng..." value={search} onChange={event => setSearch(event.target.value)} className="pl-9" /></div>
            <select aria-label="Lọc theo tầng" value={floor} onChange={event => setFloor(event.target.value)} className="h-10 w-full min-w-0 border bg-background px-3 text-sm sm:w-auto">
              <option value="all">Tất cả tầng</option>{floors.map(([name]) => <option key={name} value={name}>Tầng {name}</option>)}
            </select>
            <select aria-label="Lọc theo hạng phòng" value={type} onChange={event => setType(event.target.value)} className="h-10 w-full min-w-0 max-w-full border bg-background px-3 text-sm sm:w-auto">
              <option value="all">Mọi hạng phòng</option>{types.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <select aria-label="Lọc theo tình trạng" value={status} onChange={event => setStatus(event.target.value as RoomFilter)} className="col-span-2 h-10 w-full min-w-0 border bg-background px-3 text-sm sm:w-auto">
              <option value="all">Tất cả tình trạng</option>{(Object.keys(STATES) as Exclude<RoomFilter, 'all'>[]).map(key => <option key={key} value={key}>{STATES[key].label}</option>)}
            </select>
            {hasFilters && <Button variant="ghost" onClick={reset}>Xóa lọc</Button>}
          </div>
        </div>
        <div className="p-4" aria-busy={isFetching}>
          {isError ? <PanelError onRetry={() => { void refetch(); onRetryWork?.() }} /> : isLoading ? (
            <div aria-label="Đang tải phòng" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
          ) : !rooms.length ? (
            <div className="space-y-3 py-5 text-center"><DoorOpen className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="font-semibold">Khách sạn chưa có phòng</h3><p className="text-sm text-muted-foreground">Thêm phòng hoặc nhập file Excel để bắt đầu.</p><Button asChild><Link to="/rooms?view=list">Thêm phòng / Nhập Excel</Link></Button></div>
          ) : !visible.length ? (
            <div className="space-y-3 py-5 text-center"><p className="text-sm">Không có phòng phù hợp.</p><Button variant="outline" onClick={reset}>Xóa bộ lọc</Button></div>
          ) : <div className="space-y-5">
            <p role="status" className="text-sm text-muted-foreground">Hiển thị {visible.reduce((sum, group) => sum + group.rooms.length, 0)}/{rooms.length} phòng</p>
            {visible.map(group => <div key={group.name}>
              <h3 className="mb-2 text-sm font-semibold">Tầng {group.name}<span className="ml-2 font-normal text-muted-foreground">{group.rooms.length} phòng</span></h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {group.rooms.map(room => {
                  const state = roomState(room, work)
                  const meta = STATES[state]
                  const label = state === 'cleaning' ? 'Đang dọn' : state === 'review' ? 'Chờ kiểm tra' : work?.reworkRoomIds.includes(room.id) && state === 'dirty' ? 'Cần làm lại' : room.status === 'reserved' ? 'Đặt trước' : getOperationalLabel(room)
                  return <article key={room.id} aria-label={`Phòng ${room.room_number}`} className={cn('min-w-0 border border-l-4', meta.border)}>
                    <Link to={`/rooms/${room.id}`} className="block space-y-2 p-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex items-center justify-between gap-2"><span className="text-xl font-bold">{room.room_number}</span><ChevronRight className="h-4 w-4 shrink-0" /></span>
                      <span className={cn('inline-block px-2 py-1 text-xs font-medium', meta.badge)}>{label}</span>
                      <span className="block truncate text-xs text-muted-foreground" title={room.room_type}>{room.room_type || 'Chưa có hạng phòng'}</span>
                      {['cleaning', 'review'].includes(state) && (room.current_booking || room.status.startsWith('occupied')) && <span className="block text-xs font-medium">Phòng đang có khách</span>}
                      {!!room.open_hk_tasks && <span className="block text-xs font-medium">{room.open_hk_tasks} việc buồng phòng đang mở</span>}
                    </Link>
                    {canAssign && !['blocked', 'review', 'cleaning'].includes(state) && !['dnd', 'service_refused'].includes(room.status) && <button type="button" className="w-full border-t px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Giao việc phòng ${room.room_number}`} onClick={() => setTaskRoom(room)}>Giao việc</button>}
                  </article>
                })}
              </div>
            </div>)}
          </div>}
        </div>
      </div>
      {taskRoom && selectedHotel && <CreateTaskDialog key={taskRoom.id} open onOpenChange={open => { if (!open) setTaskRoom(null) }} roomId={taskRoom.id} roomNumber={taskRoom.room_number} hotelId={selectedHotel.id} />}
    </section>
  )
}
