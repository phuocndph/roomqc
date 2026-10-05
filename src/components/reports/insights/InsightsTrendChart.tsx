import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface TrendPoint {
  month: string
  revenue: number
  bookings: number
}

export function InsightsTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <h3 className="text-sm font-semibold">Xu hướng doanh thu 6 tháng</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis
            className="text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
          />
          <Tooltip
            formatter={(v: number) => formatCurrency(v)}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Legend />
          <Line type="monotone" dataKey="revenue" name="Doanh thu" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
