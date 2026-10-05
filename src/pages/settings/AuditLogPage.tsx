import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getRoomStatusMeta } from '@/lib/roomStatus'

interface AuditLogRow {
  id: number
  tenant_id: string | null
  hotel_id: string | null
  table_name: string
  record_id: string
  action: 'insert' | 'update' | 'delete' | 'state_change' | 'qc_action'
  actor_id: string | null
  actor_role: string | null
  old_data: any
  new_data: any
  changed_fields: string[] | null
  context: any
  created_at: string
}

const TABLE_LABELS: Record<string, string> = {
  rooms: 'Phòng',
  housekeeping_tasks: 'Công việc HK',
  room_checks: 'Kiểm tra phòng',
  qc_reviews: 'Duyệt QC',
}

const ACTION_LABELS: Record<string, string> = {
  insert: 'Tạo mới',
  update: 'Cập nhật',
  delete: 'Xóa',
  state_change: 'Đổi trạng thái',
  qc_action: 'Hành động QC',
}

const ACTION_COLOR: Record<string, string> = {
  insert: 'text-emerald-700 border-emerald-200 bg-emerald-50',
  update: 'text-blue-700 border-blue-200 bg-blue-50',
  delete: 'text-red-700 border-red-200 bg-red-50',
  state_change: 'text-violet-700 border-violet-200 bg-violet-50',
  qc_action: 'text-amber-700 border-amber-200 bg-amber-50',
}

function StatusDelta({ row }: { row: AuditLogRow }) {
  if (row.table_name !== 'rooms' || row.action !== 'state_change') return null
  const from = row.old_data?.status as string | undefined
  const to = row.new_data?.status as string | undefined
  if (!from || !to) return null
  const fromMeta = getRoomStatusMeta(from)
  const toMeta = getRoomStatusMeta(to)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`px-2 py-0.5 rounded border ${fromMeta.text} ${fromMeta.bg} ${fromMeta.border}`}>
        {fromMeta.short}
      </span>
      <span className="text-muted-foreground">→</span>
      <span className={`px-2 py-0.5 rounded border ${toMeta.text} ${toMeta.bg} ${toMeta.border}`}>
        {toMeta.short}
      </span>
    </div>
  )
}

function Row({ row }: { row: AuditLogRow }) {
  const [open, setOpen] = useState(false)
  const reason = row.context?.reason as string | undefined
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        className="w-full px-3 py-2 hover:bg-muted/50 flex items-start gap-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="mt-0.5 text-muted-foreground">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-xs ${ACTION_COLOR[row.action] ?? ''}`}>
              {ACTION_LABELS[row.action] ?? row.action}
            </Badge>
            <span className="text-sm font-medium">{TABLE_LABELS[row.table_name] ?? row.table_name}</span>
            <span className="font-mono text-xs text-muted-foreground truncate">
              {row.record_id.slice(0, 8)}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {format(new Date(row.created_at), 'dd/MM HH:mm:ss', { locale: vi })}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <StatusDelta row={row} />
            {reason && <span className="text-xs text-muted-foreground italic">"{reason}"</span>}
          </div>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pl-10 grid gap-2 md:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Trước</div>
            <pre className="text-xs font-mono bg-muted/50 p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(row.old_data ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Sau</div>
            <pre className="text-xs font-mono bg-muted/50 p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(row.new_data ?? {}, null, 2)}
            </pre>
          </div>
          {row.context && Object.keys(row.context).length > 0 && (
            <div className="md:col-span-2">
              <div className="text-xs text-muted-foreground mb-1">Ngữ cảnh</div>
              <pre className="text-xs font-mono bg-muted/50 p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(row.context, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AuditLogPage() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const selectedHotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null
  const [tableFilter, setTableFilter] = useState<string>('all')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['audit-log', tenantId, selectedHotelId, tableFilter, actionFilter],
    queryFn: async () => {
      if (!tenantId) return [] as AuditLogRow[]
      let q = supabase
        .from('audit_log' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200)

      if (selectedHotelId) {
        q = q.eq('hotel_id', selectedHotelId)
      }
      if (tableFilter !== 'all') q = q.eq('table_name', tableFilter)
      if (actionFilter !== 'all') q = q.eq('action', actionFilter)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as AuditLogRow[]
    },
    enabled: !!tenantId,
  })

  const filtered = (data ?? []).filter((r) => {
    if (!search.trim()) return true
    const s = search.trim().toLowerCase()
    return (
      r.record_id.toLowerCase().includes(s) ||
      JSON.stringify(r.context ?? {}).toLowerCase().includes(s) ||
      JSON.stringify(r.new_data ?? {}).toLowerCase().includes(s)
    )
  })

  return (
    <div className="container max-w-5xl py-4 space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Nhật ký thay đổi</h1>
          <p className="text-sm text-muted-foreground">
            Lịch sử mọi thay đổi quan trọng (state machine, QC, room check). Hiển thị 200 dòng gần nhất.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
          Làm mới
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <Select value={tableFilter} onValueChange={setTableFilter}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Loại" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            <SelectItem value="rooms">Phòng</SelectItem>
            <SelectItem value="housekeeping_tasks">Công việc HK</SelectItem>
            <SelectItem value="room_checks">Kiểm tra phòng</SelectItem>
            <SelectItem value="qc_reviews">Duyệt QC</SelectItem>
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Hành động" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả hành động</SelectItem>
            <SelectItem value="state_change">Đổi trạng thái</SelectItem>
            <SelectItem value="qc_action">Hành động QC</SelectItem>
            <SelectItem value="update">Cập nhật</SelectItem>
            <SelectItem value="insert">Tạo mới</SelectItem>
            <SelectItem value="delete">Xóa</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Tìm theo ID, lý do…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9"
        />
      </div>

      <div className="border rounded-lg overflow-hidden bg-background">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Chưa có thay đổi nào khớp bộ lọc.
          </div>
        ) : (
          filtered.map((row) => <Row key={row.id} row={row} />)
        )}
      </div>
    </div>
  )
}
