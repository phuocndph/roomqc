import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  useQcStaffStats,
  useQcFloorStats,
  useStaffReworkTasks,
  useQcDailyTrend,
} from '@/hooks/useQcStats'
import { usePendingReviewCount } from '@/hooks/usePendingReviewCount'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { downloadCsv } from '@/lib/csv'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'

const RANGE_OPTIONS = [
  { value: '7', label: '7 ngày' },
  { value: '30', label: '30 ngày' },
  { value: '90', label: '90 ngày' },
]

/**
 * Dashboard QC — tổng quan chất lượng buồng phòng.
 * Cho phép chọn range 7/30/90 ngày, click nhân viên xem chi tiết task rework.
 */
export default function QcDashboardPage({ embedded }: { embedded?: boolean } = {}) {
  const [days, setDays] = useState<number>(30)
  const [drillUserId, setDrillUserId] = useState<string | null>(null)
  const [drillUserName, setDrillUserName] = useState<string>('')

  const { data: staffStats, isLoading: loadingStaff } = useQcStaffStats(days)
  const { data: floorStats, isLoading: loadingFloor } = useQcFloorStats(days)
  const { data: trend, isLoading: loadingTrend } = useQcDailyTrend(days)
  const { data: pendingCount = 0 } = usePendingReviewCount()

  const totals = useMemo(() => {
    const s = staffStats ?? []
    const totalCompleted = s.reduce((a, x) => a + (x.total_completed ?? 0), 0)
    const totalRework = s.reduce((a, x) => a + (x.rework_count ?? 0), 0)
    const reworkRate = totalCompleted > 0 ? (totalRework / totalCompleted) * 100 : 0
    return { totalCompleted, totalRework, reworkRate }
  }, [staffStats])

  const chartData = useMemo(
    () =>
      (trend ?? []).map((d) => ({
        ...d,
        label: format(new Date(d.day), 'dd/MM', { locale: vi }),
      })),
    [trend]
  )

  const handleExportStaff = () => {
    if (!staffStats?.length) return
    downloadCsv(
      staffStats.map((s) => ({
        full_name: s.full_name ?? '',
        total_completed: s.total_completed,
        approved_count: s.approved_count,
        pending_count: s.pending_count,
        rework_count: s.rework_count,
        rework_rate_pct: s.rework_rate_pct ?? 0,
      })),
      `qc-nhan-vien-${days}d-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      {
        full_name: 'Nhân viên',
        total_completed: 'Hoàn thành',
        approved_count: 'Đã duyệt',
        pending_count: 'Chờ duyệt',
        rework_count: 'Làm lại',
        rework_rate_pct: 'Tỉ lệ rework (%)',
      }
    )
  }

  const handleExportFloor = () => {
    if (!floorStats?.length) return
    downloadCsv(
      floorStats.map((f) => ({
        floor: f.floor ?? '',
        total_tasks: f.total_tasks,
        pending_tasks: f.pending_tasks,
        rework_tasks: f.rework_tasks,
        rework_rate_pct: f.rework_rate_pct ?? 0,
      })),
      `qc-tang-${days}d-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      {
        floor: 'Tầng',
        total_tasks: 'Tổng task',
        pending_tasks: 'Chờ duyệt',
        rework_tasks: 'Làm lại',
        rework_rate_pct: 'Tỉ lệ rework (%)',
      }
    )
  }

  return (
    <div className={embedded ? 'space-y-6' : 'p-4 space-y-6 max-w-6xl mx-auto'}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-bold">Dashboard QC</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Chất lượng dọn phòng {days} ngày gần nhất
            </p>
          </div>
        )}
        <div className={`flex items-center gap-2 ${embedded ? 'ml-auto' : ''}`}>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="h-9 w-28 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild size="sm" variant="outline">
            <Link to="/housekeeping/review">
              Chờ duyệt {pendingCount > 0 && `(${pendingCount})`}
            </Link>
          </Button>
        </div>
      </header>

      {/* KPI tổng */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox label="Đã hoàn thành" value={totals.totalCompleted} />
        <KpiBox label="Đang chờ duyệt" value={pendingCount} tone={pendingCount > 0 ? 'warn' : undefined} />
        <KpiBox label="Phải làm lại" value={totals.totalRework} tone={totals.totalRework > 0 ? 'bad' : undefined} />
        <KpiBox
          label="Tỉ lệ rework"
          value={`${totals.reworkRate.toFixed(1)}%`}
          tone={totals.reworkRate > 10 ? 'bad' : totals.reworkRate > 5 ? 'warn' : 'good'}
        />
      </div>

      {/* Trend chart */}
      <section className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/30">
          <h2 className="text-sm font-medium">Diễn biến theo ngày</h2>
        </div>
        <div className="p-3 h-64">
          {loadingTrend ? (
            <Skeleton className="h-full w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Chưa có dữ liệu
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  unit="%"
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="total_tasks" name="Tổng task" fill="hsl(var(--muted-foreground) / 0.4)" />
                <Bar yAxisId="left" dataKey="rework_tasks" name="Làm lại" fill="hsl(0 84% 60%)" />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="rework_rate_pct"
                  name="Tỉ lệ rework (%)"
                  stroke="hsl(38 92% 50%)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Theo nhân viên */}
      <section className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Theo nhân viên</h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={handleExportStaff}
            disabled={!staffStats?.length}
          >
            Export CSV
          </Button>
        </div>
        {loadingStaff ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (staffStats?.length ?? 0) === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Chưa có dữ liệu</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/20">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Nhân viên</th>
                  <th className="text-right px-3 py-2 font-medium">Hoàn thành</th>
                  <th className="text-right px-3 py-2 font-medium">Chờ duyệt</th>
                  <th className="text-right px-3 py-2 font-medium">Làm lại</th>
                  <th className="text-right px-3 py-2 font-medium">Tỉ lệ rework</th>
                </tr>
              </thead>
              <tbody>
                {staffStats!.map((s) => {
                  const rate = s.rework_rate_pct ?? 0
                  const tone = rate > 10 ? 'text-red-600' : rate > 5 ? 'text-amber-600' : 'text-green-600'
                  const canDrill = (s.rework_count ?? 0) > 0
                  return (
                    <tr
                      key={s.user_id}
                      className={`border-t ${canDrill ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                      onClick={() => {
                        if (!canDrill) return
                        setDrillUserId(s.user_id)
                        setDrillUserName(s.full_name || 'Nhân viên')
                      }}
                    >
                      <td className="px-3 py-2">
                        {s.full_name || '—'}
                        {canDrill && (
                          <span className="ml-2 text-[10px] text-muted-foreground">→ chi tiết</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{s.total_completed}</td>
                      <td className="px-3 py-2 text-right">{s.pending_count}</td>
                      <td className="px-3 py-2 text-right">{s.rework_count}</td>
                      <td className={`px-3 py-2 text-right font-medium ${tone}`}>
                        {s.rework_rate_pct == null ? '—' : `${s.rework_rate_pct}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Theo tầng */}
      <section className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Theo tầng</h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={handleExportFloor}
            disabled={!floorStats?.length}
          >
            Export CSV
          </Button>
        </div>
        {loadingFloor ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (floorStats?.length ?? 0) === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Chưa có dữ liệu</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/20">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Tầng</th>
                  <th className="text-right px-3 py-2 font-medium">Tổng task</th>
                  <th className="text-right px-3 py-2 font-medium">Chờ duyệt</th>
                  <th className="text-right px-3 py-2 font-medium">Làm lại</th>
                  <th className="text-right px-3 py-2 font-medium">Tỉ lệ rework</th>
                </tr>
              </thead>
              <tbody>
                {floorStats!.map((f, idx) => {
                  const rate = f.rework_rate_pct ?? 0
                  const tone = rate > 10 ? 'text-red-600' : rate > 5 ? 'text-amber-600' : 'text-green-600'
                  return (
                    <tr key={`${f.floor}-${idx}`} className="border-t">
                      <td className="px-3 py-2">Tầng {f.floor ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{f.total_tasks}</td>
                      <td className="px-3 py-2 text-right">{f.pending_tasks}</td>
                      <td className="px-3 py-2 text-right">{f.rework_tasks}</td>
                      <td className={`px-3 py-2 text-right font-medium ${tone}`}>
                        {f.rework_rate_pct == null ? '—' : `${f.rework_rate_pct}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <StaffReworkDialog
        userId={drillUserId}
        userName={drillUserName}
        days={days}
        onClose={() => setDrillUserId(null)}
      />
    </div>
  )
}

function KpiBox({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: 'good' | 'warn' | 'bad'
}) {
  const colorClass =
    tone === 'bad'
      ? 'text-red-600'
      : tone === 'warn'
      ? 'text-amber-600'
      : tone === 'good'
      ? 'text-green-600'
      : ''
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${colorClass}`}>{value}</div>
    </div>
  )
}

function StaffReworkDialog({
  userId,
  userName,
  days,
  onClose,
}: {
  userId: string | null
  userName: string
  days: number
  onClose: () => void
}) {
  const { data: tasks, isLoading } = useStaffReworkTasks(userId, days)
  const open = !!userId

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Task bị làm lại — {userName}</DialogTitle>
          <DialogDescription className="text-xs">
            {days} ngày gần nhất • {tasks?.length ?? 0} task
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (tasks?.length ?? 0) === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Không có task nào</div>
        ) : (
          <div className="border rounded-lg divide-y">
            {tasks!.map((t: any) => (
              <div key={t.id} className="p-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium">
                    P.{t.room?.room_number ?? '?'}
                    {t.room?.floor != null && (
                      <span className="text-xs text-muted-foreground ml-1">• Tầng {t.room.floor}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t.rejected_at
                      ? format(new Date(t.rejected_at), 'dd/MM HH:mm', { locale: vi })
                      : format(new Date(t.created_at), 'dd/MM HH:mm', { locale: vi })}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px]">
                  <span className="text-red-600 font-medium">
                    Làm lại{(t.rework_count ?? 0) > 0 ? ` ×${t.rework_count}` : ''}
                  </span>
                  {t.status === 'rejected_rework' && (
                    <span className="text-amber-600">Chờ làm lại</span>
                  )}
                  {t.status === 'approved' && (
                    <span className="text-green-600">Đã duyệt sau rework</span>
                  )}
                </div>
                {t.rejection_reason && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Lý do: {t.rejection_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
