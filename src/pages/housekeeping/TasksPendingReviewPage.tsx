import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useHotelQcMode, QC_MODE_LABELS } from '@/hooks/useHotelQcMode'
import { useApproveTask, useRejectTask } from '@/hooks/useTaskQc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import type { HousekeepingTaskWithDetails } from '@/types/housekeeping.types'

/**
 * Trang QC Review — danh sách công việc đang ở `completed_pending_review`.
 * Dùng cho qc_mode = peer hoặc strict.
 */
export default function TasksPendingReviewPage() {
  const { user } = useUser()
  const { selectedHotel } = useHotelContext()
  const tenantId = user?.tenant_id
  const hotelId = selectedHotel?.id ?? user?.hotel_id ?? null

  const { data: qcMode } = useHotelQcMode(hotelId)
  const [search, setSearch] = useState('')
  const [floorFilter, setFloorFilter] = useState<string>('all')

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks-pending-review', tenantId, hotelId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from('housekeeping_tasks')
        .select(`
          *,
          room:rooms!housekeeping_tasks_room_id_fkey(id, room_number, floor, room_type),
          assigned_user:users!housekeeping_tasks_assigned_to_fkey(id, full_name, avatar_url)
        `)
        .eq('tenant_id', tenantId!)
        .eq('status', 'completed_pending_review')
        .order('awaiting_review_at', { ascending: true })

      if (hotelId) q = q.eq('hotel_id', hotelId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as HousekeepingTaskWithDetails[]
    },
  })

  const filtered = useMemo(() => {
    let list = tasks ?? []
    if (floorFilter !== 'all') list = list.filter((t) => String(t.room?.floor ?? '') === floorFilter)
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      list = list.filter(
        (t) =>
          (t.room?.room_number ?? '').toLowerCase().includes(s) ||
          (t.assigned_user?.full_name ?? '').toLowerCase().includes(s) ||
          (t.title ?? '').toLowerCase().includes(s),
      )
    }
    return list
  }, [tasks, search, floorFilter])

  const floors = useMemo(() => {
    const set = new Set<string>()
    ;(tasks ?? []).forEach((t) => t.room?.floor != null && set.add(String(t.room.floor)))
    return Array.from(set).sort()
  }, [tasks])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div>
          <h1 className="text-xl font-bold">Công việc chờ duyệt</h1>
          <p className="text-[11px] text-muted-foreground">
            Chế độ QC hiện tại: <span className="font-medium">{qcMode ? QC_MODE_LABELS[qcMode] : '—'}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20">
        <Input
          placeholder="Tìm phòng / nhân viên / tiêu đề"
          className="h-8 max-w-xs text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={floorFilter} onValueChange={setFloorFilter}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="Tầng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả tầng</SelectItem>
            {floors.map((f) => (
              <SelectItem key={f} value={f}>
                Tầng {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">{filtered.length} công việc</div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Không có công việc nào chờ duyệt.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((t) => (
              <ReviewRow key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewRow({ task }: { task: HousekeepingTaskWithDetails }) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const approve = useApproveTask()
  const reject = useRejectTask()

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-xs px-1.5 py-0.5 border rounded">
            {task.room?.room_number ?? '—'}
          </span>
          <span className="font-medium truncate">{task.title ?? 'Công việc dọn phòng'}</span>
          {(task.rework_count ?? 0) > 0 && (
            <span className="text-[10px] text-amber-600">Làm lại lần {task.rework_count}</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {task.assigned_user?.full_name ?? 'Chưa gán'} ·{' '}
          {task.awaiting_review_at ? format(new Date(task.awaiting_review_at), 'HH:mm dd/MM') : '—'}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs text-red-600 hover:text-red-700"
          onClick={() => setRejectOpen(true)}
        >
          Trả lại
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={approve.isPending}
          onClick={() => approve.mutate({ taskId: task.id })}
        >
          Duyệt
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trả lại làm lại</DialogTitle>
            <DialogDescription>Ghi rõ lý do để nhân viên hiểu và chỉnh sửa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="r">Lý do *</Label>
            <Textarea id="r" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Hủy
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={reason.trim().length < 3 || reject.isPending}
              onClick={async () => {
                await reject.mutateAsync({ taskId: task.id, reason: reason.trim() })
                setReason('')
                setRejectOpen(false)
              }}
            >
              Trả lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
