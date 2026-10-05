import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { format, parseISO } from 'date-fns'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { OccupancyTrend } from '@/hooks/useRoomsReportData'

interface Props {
  data: OccupancyTrend[]
  loading?: boolean
}

/** Biểu đồ kép: Công suất % (bar) + RevPAR/ngày (line). */
export function OccupancyRevparChart({ data, loading }: Props) {
  if (loading) return <Skeleton className="h-64 w-full" />
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-muted-foreground border rounded-lg">
        Chưa có dữ liệu trong kỳ này
      </div>
    )
  }

  const chartData = data.map((d) => ({
    date: format(parseISO(d.date), 'dd/MM'),
    occupancy: d.occupancy_rate,
    revpar: d.revenue, // proxy doanh thu/ngày (đã có sẵn từ hook)
  }))

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Xu hướng theo ngày</h3>
        <span className="text-xs text-muted-foreground">Công suất % • Doanh thu/ngày</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="%" />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
            tickFormatter={(v) => `${Math.round(v / 1_000_000)}tr`}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6 }}
            formatter={(value: number, name: string) =>
              name === 'Công suất' ? `${value.toFixed(1)}%` : formatCurrency(value)
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="occupancy" name="Công suất" fill="hsl(var(--primary) / 0.6)" radius={[3, 3, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="revpar"
            name="Doanh thu/ngày"
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
