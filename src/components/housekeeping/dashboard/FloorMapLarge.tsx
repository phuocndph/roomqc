import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useRooms } from '@/hooks/useRooms'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Mapping trạng thái → màu nền card + chấm + label rút gọn
const STATUS_STYLE: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  vacant_clean:     { dot: 'bg-green-600',   bg: 'bg-background border-green-600',     text: 'text-green-700 dark:text-green-400',   label: 'Trống - sạch' },
  vacant_inspected: { dot: 'bg-green-700',   bg: 'bg-background border-green-700',     text: 'text-green-700 dark:text-green-400',   label: 'Đã kiểm tra' },
  vacant:           { dot: 'bg-green-600',   bg: 'bg-background border-green-600',     text: 'text-green-700 dark:text-green-400',   label: 'Trống' },
  reserved:         { dot: 'bg-zinc-500',    bg: 'bg-background border-zinc-500',       text: 'text-zinc-600 dark:text-zinc-400',     label: 'Đặt trước' },
  cleaning:         { dot: 'bg-blue-600',    bg: 'bg-background border-blue-600',       text: 'text-blue-700 dark:text-blue-400',     label: 'Đang dọn' },
  vacant_dirty:     { dot: 'bg-red-600',     bg: 'bg-background border-red-600',         text: 'text-red-700 dark:text-red-400',       label: 'Bẩn - chờ dọn' },
  check_out:        { dot: 'bg-red-600',     bg: 'bg-background border-red-600',         text: 'text-red-700 dark:text-red-400',       label: 'Đang trả' },
  occupied:         { dot: 'bg-amber-600',   bg: 'bg-background border-amber-600',     text: 'text-amber-700 dark:text-amber-400',   label: 'Đang có khách' },
  occupied_clean:   { dot: 'bg-amber-600',   bg: 'bg-background border-amber-600',     text: 'text-amber-700 dark:text-amber-400',   label: 'Đang có khách' },
  occupied_dirty:   { dot: 'bg-orange-600',  bg: 'bg-background border-orange-600',   text: 'text-orange-700 dark:text-orange-400', label: 'Có khách - bẩn' },
  dnd:              { dot: 'bg-purple-600',  bg: 'bg-background border-purple-600',   text: 'text-purple-700 dark:text-purple-400', label: 'DND' },
  sleep_out:        { dot: 'bg-indigo-600',  bg: 'bg-background border-indigo-600',   text: 'text-indigo-700 dark:text-indigo-400', label: 'Vắng đêm' },
  service_refused:  { dot: 'bg-pink-600',    bg: 'bg-background border-pink-600',       text: 'text-pink-700 dark:text-pink-400',     label: 'Từ chối dọn' },
  out_of_order:     { dot: 'bg-zinc-700',    bg: 'bg-background border-zinc-700',       text: 'text-zinc-700 dark:text-zinc-300',     label: 'Bảo trì' },
  out_of_service:   { dot: 'bg-zinc-700',    bg: 'bg-background border-zinc-700',       text: 'text-zinc-700 dark:text-zinc-300',     label: 'Tạm khóa' },
  maintenance:      { dot: 'bg-zinc-600',    bg: 'bg-background border-zinc-600',       text: 'text-zinc-700 dark:text-zinc-300',     label: 'Bảo trì' },
}

function styleFor(s?: string | null) {
  return STATUS_STYLE[s || ''] || { dot: 'bg-zinc-300', bg: 'bg-muted/30', text: 'text-muted-foreground', label: s || '—' }
}

const LEGEND = [
  { key: 'vacant_clean',  label: 'Trống - sạch' },
  { key: 'cleaning',      label: 'Đang dọn' },
  { key: 'vacant_dirty',  label: 'Bẩn - chờ dọn' },
  { key: 'occupied',      label: 'Đang có khách' },
  { key: 'maintenance',   label: 'Bảo trì' },
  { key: 'reserved',      label: 'Đặt trước' },
]

export function FloorMapLarge() {
  const { data: rooms, isLoading } = useRooms()
  const [floor, setFloor] = useState<string>('all')
  const [type, setType] = useState<string>('all')

  const allFloors = useMemo(() => {
    const set = new Set<number>()
    for (const r of rooms || []) set.add((r.floor ?? 0) as number)
    return Array.from(set).sort((a, b) => a - b)
  }, [rooms])

  const allTypes = useMemo(() => {
    const set = new Set<string>()
    for (const r of rooms || []) if (r.room_type) set.add(r.room_type as string)
    return Array.from(set).sort()
  }, [rooms])

  const filtered = useMemo(() => {
    return (rooms || []).filter((r) => {
      if (floor !== 'all' && String(r.floor ?? 0) !== floor) return false
      if (type !== 'all' && r.room_type !== type) return false
      return true
    })
  }, [rooms, floor, type])

  const byFloor = useMemo(() => {
    const m = new Map<number, typeof filtered>()
    for (const r of filtered) {
      const f = (r.floor ?? 0) as number
      if (!m.has(f)) m.set(f, [])
      m.get(f)!.push(r)
    }
    for (const l of m.values()) {
      l.sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }))
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0])
  }, [filtered])

  return (
    <div id="housekeeping-floor-map" className="border rounded-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2 border-b gap-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h3 className="text-sm font-medium">Sơ đồ phòng</h3>
          <Select value={floor} onValueChange={setFloor}>
            <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Tất cả tầng" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả tầng</SelectItem>
              {allFloors.map((f) => <SelectItem key={f} value={String(f)}>Tầng {f || '—'}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Tất cả loại phòng" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại phòng</SelectItem>
              {allTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex max-w-full items-center gap-x-3 gap-y-1 overflow-x-auto pb-0.5">
          {LEGEND.map((it) => (
            <span key={it.key} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full', styleFor(it.key).dot)} />
              {it.label}
            </span>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="p-4 grid grid-cols-10 gap-2">
          {Array.from({ length: 30 }).map((_, i) => <div key={i} className="h-14 bg-muted/30 animate-pulse rounded" />)}
        </div>
      ) : byFloor.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground text-center">Không có phòng phù hợp bộ lọc.</div>
      ) : (
        <div className="p-3 flex flex-col gap-2">
          {byFloor.map(([f, list]) => (
            <div key={f} className="flex items-start gap-3">
              <div className="w-14 shrink-0 pt-2 text-xs text-muted-foreground">Tầng {f || '—'}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-2 flex-1">
                {list.map((r) => {
                  const s = styleFor(r.status as string)
                  return (
                    <Link
                      key={r.id}
                      to={`/rooms/${r.id}`}
                      className={cn('border rounded-md px-2 py-1.5 hover:shadow-sm transition', s.bg)}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
                        <span className="text-sm font-semibold tabular-nums">{r.room_number}</span>
                      </div>
                      <div className={cn('text-[11px] truncate mt-0.5', s.text)}>{s.label}</div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
