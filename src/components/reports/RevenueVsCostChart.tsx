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
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns'
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
  days?: number
}

/**
 * Biểu đồ kết hợp: Doanh thu (cột) vs Chi phí (line) N ngày gần nhất.
 * Tự fill ngày trống = 0 để trục thời gian liên tục.
 */
export function RevenueVsCostChart({ data, loading, days = 30 }: Props) {
  const filled = useMemo(() => {
    const end = startOfDay(new Date())
    const start = subDays(end, days - 1)
    const map = new Map((data ?? []).map((d) => [d.date, d]))
    return eachDayOfInterval({ start, end }).map((d) => {
      const key = format(d, 'yyyy-MM-dd')
      const found = map.get(key)
      return {
        date: key,
        label: format(d, 'd/M'),
        revenue: found?.revenue ?? 0,
        cost: found?.cost ?? 0,
      }
    })
  }, [data, days])

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-4">
        <Skeleton className="h-[220px] w-full" />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Doanh thu vs Chi phí — {days} ngày</h3>
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
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="revenue" name="Doanh thu" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
            <Line
              type="monotone"
              dataKey="cost"
              name="Chi phí"
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
