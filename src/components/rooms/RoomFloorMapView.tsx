import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, formatCurrency } from '@/lib/utils'
import { getRoomStatusMeta, getRoomStatusTextClass } from '@/lib/roomStatus'
import { useFloorPlanLive, type FloorPlanRoom, type FloorPlanBooking } from '@/hooks/useFloorPlanLive'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUser } from '@/hooks/useUser'
import { hasPermission } from '@/lib/permissions'
import { BookingDetailDialog } from '@/components/bookings/BookingDetailDialog'
import { RoomBookingDialog } from './RoomBookingDialog'
import { RoomAuditLogDialog } from './RoomAuditLogDialog'
import { ReceptionQuickDialog } from './ReceptionQuickDialog'
import { useRoomTransition } from '@/hooks/useRoomTransition'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNowStrict, parseISO, differenceInHours, format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Search, Plus, FileSpreadsheet, History, Unlock, Maximize2, Check, RotateCcw } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { getPresetCellSize, useFloorMapCellSize, type CellSizeState } from '@/hooks/useFloorMapCellSize'
import { useFloorMapCellSizeRemote } from '@/hooks/useFloorMapCellSizeRemote'
import { toast } from 'sonner'
import { useTodayPricesByHotel } from '@/hooks/usePricingDaily'


// "Bucket" hiển thị cho lễ tân — gom 11 trạng thái nội bộ vào 5 nhóm dễ hiểu
type ReceptionBucket = 'sellable' | 'due_out' | 'dirty' | 'occupied' | 'blocked'

const BUCKET_META: Record<ReceptionBucket, { label: string; short: string; dot: string; ring: string; bg: string; text: string; solid: string; badge: string }> = {
  sellable: { label: 'Bán được',        short: 'Trống',    dot: 'bg-emerald-500', ring: 'ring-emerald-300', bg: 'bg-emerald-50',  text: 'text-emerald-700', solid: 'bg-emerald-600',  badge: 'Trống' },
  due_out:  { label: 'Checkout hôm nay', short: 'Sắp trả',  dot: 'bg-amber-500',   ring: 'ring-amber-300',   bg: 'bg-amber-50',    text: 'text-amber-700',   solid: 'bg-amber-600',    badge: 'Sắp trả' },
  dirty:    { label: 'Đang dọn',         short: 'Bẩn',      dot: 'bg-rose-500',    ring: 'ring-rose-300',    bg: 'bg-rose-50',     text: 'text-rose-700',    solid: 'bg-rose-600',     badge: 'Bẩn' },
  occupied: { label: 'Có khách',         short: 'Đang ở',   dot: 'bg-sky-500',     ring: 'ring-sky-300',     bg: 'bg-sky-50',      text: 'text-sky-700',     solid: 'bg-sky-700',      badge: 'Đang ở' },
  blocked:  { label: 'Khoá / Bảo trì',   short: 'Khoá',     dot: 'bg-slate-500',   ring: 'ring-slate-300',   bg: 'bg-slate-50',    text: 'text-slate-700',   solid: 'bg-slate-700',    badge: 'Khoá' },
}

function getBucket(room: FloorPlanRoom): ReceptionBucket {
  const s = room.status
  if (s === 'out_of_order' || s === 'out_of_service' || s === 'dnd' || s === 'skipper') return 'blocked'
  if (s === 'vacant_dirty' || s === 'occupied_dirty' || s === 'cleaning') return 'dirty'
  if (room.current_booking) {
    const today = format(new Date(), 'yyyy-MM-dd')
    if (room.current_booking.check_out_date === today) return 'due_out'
    return 'occupied'
  }
  if (s === 'occupied' || s === 'occupied_clean') return 'occupied'
  return 'sellable'
}

// Nhãn ngắn cụ thể cho góc trên-trái — chi tiết hơn bucket khi có thể
function getStatusBadgeLabel(room: FloorPlanRoom, bucket: ReceptionBucket): string {
  const s = room.status
  if (s === 'out_of_order') return 'OOO'
  if (s === 'out_of_service') return 'OOS'
  if (s === 'dnd') return 'DND'
  if (s === 'skipper') return 'Bỏ trốn'
  if (s === 'occupied_dirty') return 'Cần dọn'
  if (s === 'vacant_inspected') return 'QC ✓'
  return BUCKET_META[bucket].badge
}

// Số đêm còn lại tính từ hôm nay đến ngày trả phòng
function getNightsLeft(checkOutDate?: string | null): number {
  if (!checkOutDate) return 0
  try {
    const out = parseISO(checkOutDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffMs = out.getTime() - today.getTime()
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  } catch {
    return 0
  }
}

// Lấy 2 từ cuối của tên (họ + tên)
function getShortName(name: string | null | undefined): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 2) return name
  return parts.slice(-2).join(' ')
}


const LIFTABLE_STATUSES = new Set(['dnd', 'out_of_service', 'out_of_order'])

// Stable color per booking group (chỉ tô viền nhóm nếu có nhiều hơn 1 phòng cùng nhóm)
const GROUP_RING_COLORS = [
  'ring-fuchsia-400',
  'ring-cyan-400',
  'ring-lime-400',
  'ring-rose-400',
  'ring-violet-400',
  'ring-teal-400',
  'ring-yellow-400',
]
function ringForGroup(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return GROUP_RING_COLORS[h % GROUP_RING_COLORS.length]
}

function formatStayDuration(checkIn: string | null | undefined): string {
  if (!checkIn) return ''
  try {
    const d = parseISO(checkIn)
    const hrs = Math.abs(differenceInHours(new Date(), d))
    if (hrs < 1) return 'Vừa vào'
    if (hrs < 24) return `${hrs} giờ`
    return formatDistanceToNowStrict(d, { locale: vi, addSuffix: false })
  } catch {
    return ''
  }
}

function formatArriveIn(checkInDate: string, time: string | null | undefined): string {
  try {
    const t = (time || '14:00').slice(0, 5)
    const d = parseISO(`${checkInDate}T${t}:00`)
    const hrs = differenceInHours(d, new Date())
    if (hrs < 0) return 'Trễ giờ'
    if (hrs < 1) return 'Sắp đến'
    if (hrs < 24) return `${hrs}h nữa`
    return formatDistanceToNowStrict(d, { locale: vi, addSuffix: false })
  } catch {
    return ''
  }
}

export function RoomFloorMapView({
  onAddRoom,
  onBulkImport,
}: {
  onAddRoom?: () => void
  onBulkImport?: () => void
} = {}) {
  const { t: _t } = useTranslation(['rooms'])
  const { selectedHotel } = useHotelContext()
  const { role, tenantId } = useUser()
  const navigate = useNavigate()
  const { data, isLoading } = useFloorPlanLive()
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null)
  const [bookingDialog, setBookingDialog] = useState<{ roomId: string; roomNumber: string } | null>(null)
  const [auditDialog, setAuditDialog] = useState<{ roomId: string; roomNumber: string } | null>(null)
  const [quickRoom, setQuickRoom] = useState<FloorPlanRoom | null>(null)
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [bucketFilter, setBucketFilter] = useState<ReceptionBucket | 'all'>('all')
  const [floorFilter, setFloorFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sizePopoverOpen, setSizePopoverOpen] = useState(false)
  const transitionRoom = useRoomTransition()
  const { remote: remoteCellSize, save: saveCellSize } = useFloorMapCellSizeRemote(selectedHotel?.id)
  const cellSize = useFloorMapCellSize(selectedHotel?.id, remoteCellSize)
  const { data: todayPrices } = useTodayPricesByHotel(selectedHotel?.id)


  const handleLiftStatus = (e: React.MouseEvent, room: FloorPlanRoom) => {
    e.stopPropagation()
    if (!confirm(`Gỡ trạng thái "${room.status.toUpperCase()}" của phòng ${room.room_number}?\nPhòng sẽ chuyển về "Trống – đã dọn".`)) return
    transitionRoom.mutate({
      roomId: room.id,
      toStatus: 'vacant_clean',
      reason: `Gỡ thủ công từ sơ đồ phòng (was ${room.status})`,
    })
  }

  const handleShowHistory = (e: React.MouseEvent, room: FloorPlanRoom) => {
    e.stopPropagation()
    setAuditDialog({ roomId: room.id, roomNumber: room.room_number })
  }

  const { floors, bucketCounts, types, groupCounts } = useMemo(() => {
    const _floors = data ? Object.keys(data).sort((a, b) => parseInt(b) - parseInt(a)) : []
    const _bucketCounts: Record<ReceptionBucket, number> = { sellable: 0, due_out: 0, dirty: 0, occupied: 0, blocked: 0 }
    const _types = new Set<string>()
    const _groupCounts: Record<string, number> = {}
    if (data) {
      for (const f of _floors) {
        for (const r of data[f]) {
          _bucketCounts[getBucket(r)] += 1
          if (r.room_type) _types.add(r.room_type)
          const gid = r.current_booking?.booking_group_id || r.next_booking?.booking_group_id
          if (gid) _groupCounts[gid] = (_groupCounts[gid] || 0) + 1
        }
      }
    }
    return {
      floors: _floors,
      bucketCounts: _bucketCounts,
      types: Array.from(_types).sort(),
      groupCounts: _groupCounts,
    }
  }, [data])

  const canBook = hasPermission(role, 'manage_rooms')

  const saveSizeValue = (value: CellSizeState, successMessage?: string, onSaved?: () => void) => {
    if (!selectedHotel?.id) {
      cellSize.markSynced(value)
      toast.success('Đã lưu trên thiết bị này')
      onSaved?.()
      return
    }
    saveCellSize.mutate(value, {
      onSuccess: (savedValue) => {
        cellSize.markSynced(savedValue)
        toast.success(successMessage || `Đã lưu vĩnh viễn cho ${selectedHotel.name}`)
        onSaved?.()
      },
      onError: (err: unknown) => {
        console.error('[saveCellSize]', err)
        toast.error('Lưu thất bại, thay đổi vẫn chỉ là bản xem thử')
      },
    })
  }

  const savePresetImmediately = (preset: 'sm' | 'md' | 'lg') => {
    const next = getPresetCellSize(preset, cellSize.getCurrentSize().fontScale)
    cellSize.setPreset(preset)
    saveSizeValue(next, `Đã lưu chế độ ${preset === 'sm' ? 'Nhỏ' : preset === 'lg' ? 'Lớn' : 'Vừa'}`)
  }

  // Click phòng → mở Reception Quick Dialog cho mọi trạng thái.
  // Dialog sẽ render khác nhau dựa trên có booking hay không.
  const handleRoomClick = (room: FloorPlanRoom) => {
    setQuickRoom(room)
  }


  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-6 md:grid-cols-10 gap-1.5">
              {Array.from({ length: 10 }).map((_, j) => <Skeleton key={j} className="h-20" />)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!floors.length) {
    return (
      <div className="border rounded-lg p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Chưa có phòng nào để hiển thị sơ đồ. Hãy thêm phòng để bắt đầu.
        </p>
        <div className="flex items-center justify-center gap-2">
          {onAddRoom && (
            <Button size="sm" onClick={onAddRoom}>
              <Plus className="mr-2 h-4 w-4" />
              Thêm phòng
            </Button>
          )}
          {onBulkImport && (
            <Button size="sm" variant="outline" onClick={onBulkImport}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Import từ Excel
            </Button>
          )}
        </div>
      </div>
    )
  }

  const allFloorNums = floors.slice()

  // Áp filter floor + search + bucket
  const visibleFloors = floors
    .filter((f) => floorFilter === 'all' || f === floorFilter)
    .map((f) => ({
      floor: f,
      rooms: data![f].filter((r) => {
        if (bucketFilter !== 'all' && getBucket(r) !== bucketFilter) return false
        if (search.trim() && !r.room_number.toLowerCase().includes(search.trim().toLowerCase())) return false
        return true
      }),
    }))
    .filter((g) => g.rooms.length > 0)

  // 4 KPI chính cho lễ tân — Khoá/bảo trì gom vào "Khác"
  const KPI_ORDER: ReceptionBucket[] = ['sellable', 'due_out', 'dirty', 'occupied']

  return (
    <div className="space-y-3">
      {/* === KPI BAR — Lễ tân nhìn 3 giây là biết còn phòng nào để bán === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {KPI_ORDER.map((b) => {
          const m = BUCKET_META[b]
          const active = bucketFilter === b
          const count = bucketCounts[b]
          return (
            <button
              key={b}
              type="button"
              onClick={() => setBucketFilter(active ? 'all' : b)}
              className={cn(
                'flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-all hover:shadow-sm',
                active && `ring-2 ${m.ring} ${m.bg}`,
              )}
            >
              <span className={cn('inline-block h-4 w-4 rounded-full shrink-0', m.dot)} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground truncate">{m.label}</div>
                <div className={cn('text-2xl font-bold leading-tight', m.text)}>{count}</div>
              </div>
              <div className="text-[10px] text-muted-foreground self-end">phòng</div>
            </button>
          )
        })}
      </div>

      {/* Hàng thứ cấp: Khoá/Bảo trì + Toolbar filter */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        {bucketCounts.blocked > 0 && (
          <button
            type="button"
            onClick={() => setBucketFilter(bucketFilter === 'blocked' ? 'all' : 'blocked')}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted',
              bucketFilter === 'blocked' && `ring-2 ${BUCKET_META.blocked.ring}`,
            )}
          >
            <span className={cn('inline-block h-2.5 w-2.5 rounded-full', BUCKET_META.blocked.dot)} />
            <span className="font-medium">{BUCKET_META.blocked.label}</span>
            <span className="text-muted-foreground">{bucketCounts.blocked}</span>
          </button>
        )}
        <div className="relative flex-1 min-w-[160px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm số phòng..."
            className="h-8 pl-7 text-sm"
          />
        </div>
        <Select value={floorFilter} onValueChange={setFloorFilter}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi tầng</SelectItem>
            {allFloorNums.map((f) => (
              <SelectItem key={f} value={f}>Tầng {f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {types.length > 1 && types.map((tp) => {
          const active = typeFilter.length === 0 || typeFilter.includes(tp)
          return (
            <button
              key={tp}
              type="button"
              onClick={() =>
                setTypeFilter((prev) =>
                  prev.includes(tp) ? prev.filter((x) => x !== tp) : [...prev, tp],
                )
              }
              className={cn(
                'h-7 rounded border px-2 text-[11px] font-medium transition-colors',
                active ? 'bg-foreground text-background' : 'bg-background text-muted-foreground',
              )}
            >
              {tp}
            </button>
          )
        })}
        {(search || bucketFilter !== 'all' || floorFilter !== 'all' || typeFilter.length) ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setSearch('')
              setBucketFilter('all')
              setFloorFilter('all')
              setTypeFilter([])
            }}
          >
            Xoá lọc
          </Button>
        ) : null}

        {/* Cell size control */}
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden lg:flex items-center rounded-md border bg-background p-0.5">
            {(['sm', 'md', 'lg'] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={saveCellSize.isPending}
                onClick={() => savePresetImmediately(p)}
                className={cn(
                  'h-6 rounded px-2 text-[11px] font-medium transition-colors',
                  cellSize.size.preset === p
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground',
                  saveCellSize.isPending && 'cursor-not-allowed opacity-60',
                )}
                title={p === 'sm' ? 'Lưu cỡ nhỏ' : p === 'lg' ? 'Lưu cỡ lớn' : 'Lưu cỡ vừa'}
              >
                {p === 'sm' ? 'Nhỏ' : p === 'lg' ? 'Lớn' : 'Vừa'}
              </button>
            ))}
          </div>
          <Popover
            open={sizePopoverOpen}
            onOpenChange={(open) => {
              setSizePopoverOpen(open)
              if (!open && cellSize.isDirty && !saveCellSize.isPending) {
                cellSize.discardDraft()
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2 text-xs"
                title="Tuỳ chỉnh kích thước ô phòng"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{cellSize.summaryLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold">Kích thước ô phòng</div>
                  {cellSize.isDirty && <span className="text-[10px] font-medium text-amber-600">Chưa lưu</span>}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(['sm', 'md', 'lg'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => cellSize.setPreset(p)}
                      className={cn(
                        'rounded-md border py-1.5 text-xs font-medium transition-colors',
                        cellSize.size.preset === p
                          ? 'border-foreground bg-foreground text-background'
                          : 'hover:bg-muted',
                      )}
                    >
                      {p === 'sm' ? 'Nhỏ' : p === 'lg' ? 'Lớn' : 'Vừa'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Chiều cao ô</span>
                  <span className="font-mono font-medium">{cellSize.size.height}px</span>
                </div>
                <Slider
                  min={64}
                  max={220}
                  step={4}
                  value={[cellSize.size.height]}
                  onValueChange={([v]) => cellSize.setCustom({ height: v })}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Số cột (màn rộng)</span>
                  <span className="font-mono font-medium">{cellSize.size.cols} cột</span>
                </div>
                <Slider
                  min={4}
                  max={16}
                  step={2}
                  value={[cellSize.size.cols]}
                  onValueChange={([v]) => cellSize.setCustom({ cols: v })}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Cỡ chữ</span>
                  <span className="font-mono font-medium">{Math.round(cellSize.size.fontScale * 100)}%</span>
                </div>
                <Slider
                  min={70}
                  max={180}
                  step={5}
                  value={[Math.round(cellSize.size.fontScale * 100)]}
                  onValueChange={([v]) => cellSize.setFontScale(v / 100)}
                />
              </div>
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => {
                    cellSize.discardDraft()
                    setSizePopoverOpen(false)
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Hủy
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={cellSize.reset}
                >
                  Mặc định
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 px-3 text-xs"
                  disabled={saveCellSize.isPending || !cellSize.isDirty}
                  onClick={() => {
                    const currentSize = cellSize.getCurrentSize()
                    saveSizeValue(currentSize, undefined, () => setSizePopoverOpen(false))
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  {saveCellSize.isPending ? 'Đang lưu…' : 'Lưu'}
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground">
                Phím tắt: <kbd className="rounded border px-1">Ctrl</kbd> + <kbd className="rounded border px-1">+</kbd> / <kbd className="rounded border px-1">-</kbd> / <kbd className="rounded border px-1">0</kbd>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>


      {/* Floor panels */}
      {visibleFloors.length === 0 ? (
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Không có phòng nào khớp với bộ lọc hiện tại.
        </div>
      ) : (
        <TooltipProvider delayDuration={300}>
          {visibleFloors.map(({ floor, rooms }) => {
            // D1 — Lazy render per-floor via CSS `content-visibility: auto`.
            // Trình duyệt tự skip render khi tầng nằm ngoài viewport (≥200 phòng vẫn mượt).
            // Ước tính số dòng theo container width ~1200px và cell width (cellSize.size.width + gap 8px).
            // Ước tính số dòng theo cols & height của preset đang dùng.
            const approxCols = cellSize.size.cols || 12
            const approxRows = Math.ceil(rooms.length / approxCols)
            const intrinsicH = 40 /* header */ + approxRows * (cellSize.size.height + 8) + 16
            return (
            <div
              key={floor}
              className="rounded-lg border bg-card"
              style={{ contentVisibility: 'auto' as any, containIntrinsicSize: `${intrinsicH}px` }}
            >
              <div className="flex items-center justify-between border-b px-3 py-1.5">
                <div className="text-sm font-semibold">Tầng {floor}</div>
                <div className="text-xs text-muted-foreground">{rooms.length} phòng</div>
              </div>
              <div className="p-2 grid gap-2" style={cellSize.classes.gridStyle}>
                {rooms.map((room) => {
                  const bucket = getBucket(room)
                  const m = BUCKET_META[bucket]
                  const dim = typeFilter.length > 0 && !typeFilter.includes(room.room_type)
                  const bk = room.current_booking
                  const gid = bk?.booking_group_id || room.next_booking?.booking_group_id
                  const showGroupRing = gid && (groupCounts[gid] || 0) > 1
                  const openTasks = room.open_tasks || 0
                  const canLift = LIFTABLE_STATUSES.has(room.status)

                  // Countdown chỉ hiện khi sắp checkout (bucket due_out hoặc còn <12h)
                  let countdown = ''
                  if (bk?.check_out_date) {
                    try {
                      const t = (bk.expected_check_out_time || '12:00').slice(0, 5)
                      const out = parseISO(`${bk.check_out_date}T${t}:00`)
                      const hrs = differenceInHours(out, new Date())
                      if (hrs < 0) countdown = 'Trễ'
                      else if (hrs < 24) countdown = `${hrs}h`
                    } catch {
                      // Ignore malformed checkout time and hide countdown.
                    }
                  }

                  const statusLabel = getStatusBadgeLabel(room, bucket)
                  const nightsLeft = bk ? getNightsLeft(bk.check_out_date) : 0
                  const h = cellSize.size.height
                  const compact = h < 90

                  return (
                    <Tooltip key={room.id}>
                      <TooltipTrigger asChild>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => handleRoomClick(room)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              handleRoomClick(room)
                            }
                          }}
                          className={cn(
                            'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            'group relative flex flex-col items-stretch justify-between rounded-lg border border-black/10 p-2 text-center text-white shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95',
                            m.solid,
                            showGroupRing && cn('ring-2 ring-offset-1', ringForGroup(gid!)),
                            dim && 'opacity-40',
                          )}
                          style={{ height: cellSize.size.height }}
                        >
                          {/* Badge trạng thái góc trên-trái */}
                          <span
                            className={cn('absolute left-1 top-1 z-10 rounded bg-black/25 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-white backdrop-blur-sm', cellSize.classes.badgeCls)}
                            style={cellSize.classes.badgeStyle}
                          >
                            {statusLabel}
                          </span>

                          {/* Badge "việc cần làm" — góc trên-phải */}
                          {openTasks > 0 && (
                            <span
                              className="absolute -right-1.5 -top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow ring-2 ring-card"
                              title={`${openTasks} việc cần làm`}
                            >
                              {openTasks}
                            </span>
                          )}

                          {/* Quick actions (hover) */}
                          <span className="pointer-events-none absolute right-1 top-6 z-10 flex gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                            {canLift && (
                              <button
                                type="button"
                                onClick={(e) => handleLiftStatus(e, room)}
                                disabled={transitionRoom.isPending}
                                className="rounded bg-white/90 p-0.5 text-emerald-700 shadow hover:bg-white disabled:opacity-50"
                                title="Gỡ DND/OOS · về Trống sạch"
                              >
                                <Unlock className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => handleShowHistory(e, room)}
                              className="rounded bg-white/90 p-0.5 text-slate-700 shadow hover:bg-white"
                              title="Lịch sử trạng thái"
                            >
                              <History className="h-3 w-3" />
                            </button>
                          </span>

                          {/* Số phòng to ở giữa-trên */}
                          <div className={cn('mt-3 font-bold leading-none text-white drop-shadow-sm', cellSize.classes.numberCls)} style={cellSize.classes.numberStyle}>
                            {room.room_number}
                          </div>

                          {/* Khối thông tin trung tâm */}
                          {bk?.guest_name ? (
                            <div className="flex flex-col items-center leading-tight">
                              <div className={cn('w-full truncate font-semibold text-white', cellSize.classes.bodyCls)} style={cellSize.classes.bodyStyle}>
                                {getShortName(bk.guest_name)}
                              </div>
                              {!compact && (
                                <div className={cn('text-white/85', cellSize.classes.captionCls)} style={cellSize.classes.captionStyle}>
                                  {bk.guest_count ? `${bk.guest_count} khách` : ''}
                                  {bk.guest_count && nightsLeft > 0 ? ' · ' : ''}
                                  {nightsLeft > 0
                                    ? `còn ${nightsLeft} đêm`
                                    : bucket === 'due_out' ? 'Trả hôm nay' : ''}
                                </div>
                              )}
                              {countdown && (
                                <div className={cn('font-bold text-white', cellSize.classes.captionCls)} style={cellSize.classes.captionStyle}>
                                  {bucket === 'due_out' ? `← ${countdown}` : countdown}
                                </div>
                              )}
                            </div>
                          ) : room.next_booking?.guest_name ? (
                            <div className="flex flex-col items-center leading-tight">
                              <div className={cn('w-full truncate font-semibold text-white', cellSize.classes.bodyCls)} style={cellSize.classes.bodyStyle}>
                                {getShortName(room.next_booking.guest_name)}
                              </div>
                              {!compact && (
                                <div className={cn('text-white/85', cellSize.classes.captionCls)} style={cellSize.classes.captionStyle}>
                                  Sắp đến · {formatArriveIn(room.next_booking.check_in_date, room.next_booking.expected_check_in_time)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center leading-tight">
                              <div className={cn('uppercase tracking-wide text-white/85 truncate w-full', cellSize.classes.captionCls)} style={cellSize.classes.captionStyle}>
                                {room.room_type}
                              </div>
                              {!compact && (() => {
                                const tp = todayPrices?.get((room.room_type ?? '').toLowerCase())
                                if (tp && !tp.is_closed && tp.final_price > 0) {
                                  return (
                                    <div className={cn('font-bold text-white drop-shadow-sm flex items-center gap-0.5', cellSize.classes.bodyCls)} style={cellSize.classes.bodyStyle}>
                                      {formatCurrency(tp.final_price)}
                                      {tp.has_seasonal && <span className="text-amber-200" title="Có quy tắc mùa">●</span>}
                                    </div>
                                  )
                                }
                                if (tp?.is_closed) {
                                  return <div className={cn('text-white/90', cellSize.classes.captionCls)} style={cellSize.classes.captionStyle}>Đóng bán</div>
                                }
                                if (bucket === 'sellable') {
                                  return <div className={cn('font-semibold text-white', cellSize.classes.captionCls)} style={cellSize.classes.captionStyle}>Sẵn sàng bán</div>
                                }
                                return null
                              })()}
                            </div>
                          )}

                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <RoomTooltip
                          room={room}
                          bk={bk || room.next_booking}
                          isArriving={!bk && !!room.next_booking}
                          isGroup={!!showGroupRing}
                        />
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
            )
          })}

        </TooltipProvider>
      )}



      {/* Booking detail popup */}
      <BookingDetailDialog
        bookingId={detailBookingId}
        open={!!detailBookingId}
        onOpenChange={(v) => !v && setDetailBookingId(null)}
      />
      {/* Quick new booking */}
      {bookingDialog && selectedHotel && tenantId && (
        <RoomBookingDialog
          open={!!bookingDialog}
          onOpenChange={(v) => !v && setBookingDialog(null)}
          roomId={bookingDialog.roomId}
          roomNumber={bookingDialog.roomNumber}
          hotelId={selectedHotel.id}
          tenantId={tenantId}
        />
      )}

      {/* Room audit log */}
      {auditDialog && (
        <RoomAuditLogDialog
          open={!!auditDialog}
          onOpenChange={(v) => !v && setAuditDialog(null)}
          roomId={auditDialog.roomId}
          roomNumber={auditDialog.roomNumber}
        />
      )}

      {/* Reception quick action popup — focus của lễ tân */}
      <ReceptionQuickDialog
        open={!!quickRoom}
        onOpenChange={(v) => !v && setQuickRoom(null)}
        room={quickRoom}
        onBookRoom={(roomId, roomNumber) => setBookingDialog({ roomId, roomNumber })}
        onOpenBookingDetail={(bookingId) => setDetailBookingId(bookingId)}
      />
    </div>

  )
}

function RoomTooltip({
  room,
  bk,
  isArriving,
  isGroup,
}: {
  room: FloorPlanRoom
  bk: FloorPlanBooking | null
  isArriving: boolean
  isGroup: boolean
}) {
  const meta = getRoomStatusMeta(room.status)
  return (
    <div className="space-y-1 text-xs">
      <div className="font-semibold">
        Phòng {room.room_number} · {room.room_type}
      </div>
      <div className={cn('font-medium', getRoomStatusTextClass(room.status))}>{meta.label}</div>
      {(room.open_hk_tasks || room.open_maintenance) ? (
        <div className="text-red-600">
          {room.open_hk_tasks ? `${room.open_hk_tasks} buồng phòng` : ''}
          {room.open_hk_tasks && room.open_maintenance ? ' · ' : ''}
          {room.open_maintenance ? `${room.open_maintenance} bảo trì` : ''}
        </div>
      ) : null}
      {bk && (
        <>
          <div className="border-t pt-1 font-medium">
            {isArriving ? 'Sắp đến: ' : 'Khách: '}
            {bk.guest_name}
            {bk.guest_count ? ` (${bk.guest_count})` : ''}
            {isGroup && <span className="ml-1 text-fuchsia-600">· Nhóm</span>}
          </div>
          {bk.guest_phone && <div>SĐT: {bk.guest_phone}</div>}
          <div className="text-muted-foreground">
            {bk.check_in_date} {(bk.expected_check_in_time || '14:00').slice(0, 5)}
            {bk.check_out_date && ` → ${bk.check_out_date} ${(bk.expected_check_out_time || '12:00').slice(0, 5)}`}
          </div>
          {bk.total_amount != null && (
            <div>
              Tổng: {formatCurrency(Number(bk.total_amount) || 0)}
              {(() => {
                const remaining = (Number(bk.total_amount) || 0) - (Number(bk.amount_paid) || 0) - (Number(bk.deposit_amount) || 0)
                return remaining > 1000 ? (
                  <span className="ml-1 text-red-600">· Còn {formatCurrency(remaining)}</span>
                ) : null
              })()}
            </div>
          )}
        </>
      )}
      <div className="border-t pt-1 text-[10px] text-muted-foreground">Bấm để mở chi tiết</div>
    </div>
  )
}
