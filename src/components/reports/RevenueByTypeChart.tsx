import { RevenueByType } from '@/hooks/useRevenueReport'
import { formatCurrency } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Props {
  data: RevenueByType[]
}

const formatCompact = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
  return value.toString()
}

export function RevenueByTypeChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu theo loại hình
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-3 font-medium text-xs text-muted-foreground">Loại hình</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">Bookings</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">Doanh thu</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">%</th>
            </tr>
          </thead>
          <tbody>
            {data.map(item => (
              <tr key={item.type} className="border-b last:border-0">
                <td className="p-3 font-medium">{item.label}</td>
                <td className="p-3 text-right">{item.bookings}</td>
                <td className="p-3 text-right font-mono text-xs">{formatCurrency(item.revenue)}</td>
                <td className="p-3 text-right text-muted-foreground">{item.percentage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bar Chart */}
      <div className="border rounded-lg p-3">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value), 'Doanh thu']}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
