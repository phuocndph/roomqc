import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import type { CleaningProgress } from '@/hooks/useHousekeepingDashboardPanels'

interface Props {
  data?: CleaningProgress
  loading?: boolean
}

const COLORS = {
  completed:  'hsl(142 71% 45%)', // green-500
  inProgress: 'hsl(38 92% 50%)',  // amber-500
  pending:    'hsl(0 84% 60%)',   // red-500
}

export function CleaningProgressPanel({ data, loading }: Props) {
  const total = data?.total ?? 0
  const completed = data?.completed ?? 0
  const inProgress = data?.inProgress ?? 0
  const pending = data?.pending ?? 0

  const chartData = total > 0
    ? [
        { name: 'completed',  value: completed,  color: COLORS.completed },
        { name: 'inProgress', value: inProgress, color: COLORS.inProgress },
        { name: 'pending',    value: pending,    color: COLORS.pending },
      ].filter((x) => x.value > 0)
    : [{ name: 'empty', value: 1, color: 'hsl(var(--muted))' }]

  const pct = (n: number) => (total ? ((n / total) * 100).toFixed(1) : '0.0')

  return (
    <div className="border rounded-lg flex flex-col h-full">
      <div className="flex items-baseline justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-medium">Tiến độ dọn phòng hôm nay</h3>
      </div>
      <div className="flex-1 flex items-center gap-2 p-2">
        {loading ? (
          <div className="h-32 w-full animate-pulse bg-muted/30 rounded" />
        ) : (
          <>
            <div className="relative h-[160px] w-[160px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    innerRadius={48}
                    outerRadius={70}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-xs text-muted-foreground">Tổng phòng</div>
                <div className="text-2xl font-semibold tabular-nums">{total}</div>
                <div className="text-[11px] text-muted-foreground">cần dọn</div>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5 text-sm flex-1 min-w-0">
              <LegendRow color={COLORS.completed}  label="Hoàn thành" value={completed} pct={pct(completed)} />
              <LegendRow color={COLORS.inProgress} label="Đang dọn"   value={inProgress} pct={pct(inProgress)} />
              <LegendRow color={COLORS.pending}    label="Chưa dọn"   value={pending} pct={pct(pending)} />
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function LegendRow({ color, label, value, pct }: { color: string; label: string; value: number; pct: string }) {
  return (
    <li className="flex items-center gap-2 min-w-0">
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="ml-auto tabular-nums text-xs text-muted-foreground">{value} ({pct}%)</span>
    </li>
  )
}
