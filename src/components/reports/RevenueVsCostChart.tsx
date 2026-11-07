import { useMemo } from 'react'
import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  CartesianGrid,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export interface DailyPoint {
  date: string // yyyy-mm-dd
  revenue: number
  cost: number
}

interface Props {
  data: DailyPoint[] | undefined
  loading?: boolean
  period: { start: Date; end: Date }
  error?: unknown
}

/**
 * Server returns every calendar day of the selected period, including zeros.
 */
export function RevenueVsCostChart({ data, loading, period, error }: Props) {
  const filled = useMemo(() => data?.map(d => ({ ...d, label: format(parseISO(d.date), 'd/M') })), [data])

  if (error) return <div role="alert" className="rounded-lg border p-4 text-sm">Không tải được biểu đồ. Vui lòng tải lại hoặc kiểm tra quyền xem báo cáo.</div>

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-4">
        <Skeleton className="h-[220px] w-full" />
      </div>
    )
  }

  if (!filled) return <p className="text-sm text-muted-foreground">Chưa có dữ liệu biểu đồ.</p>

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold">Doanh thu ghi nhận và chi phí trực tiếp</h3>
          <p className="text-xs text-muted-foreground">{format(period.start, 'dd/MM/yyyy')} – {format(period.end, 'dd/MM/yyyy')}</p>
        </div>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={filled} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              formatter={(v: number, name: string) => [formatCurrency(v), name]}
              labelFormatter={(l) => `Ngày ${l}`}
              contentStyle={{
                background: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius-overlay)',
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="revenue" name="Doanh thu ghi nhận" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
            <Line
              type="monotone"
              dataKey="cost"
              name="Chi phí trực tiếp"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
