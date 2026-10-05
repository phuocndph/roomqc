import { RevenueBySource } from '@/hooks/useRevenueReport'
import { formatCurrency } from '@/lib/utils'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface Props {
  data: RevenueBySource[]
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(142 76% 36%)',
  'hsl(38 92% 50%)',
  'hsl(280 65% 60%)',
  'hsl(200 80% 50%)',
]

const SOURCE_LABELS: Record<string, string> = {
  direct: 'Trực tiếp',
  'booking.com': 'Booking.com',
  agoda: 'Agoda',
  traveloka: 'Traveloka',
  expedia: 'Expedia',
}

export function RevenueBySourceTable({ data }: Props) {
  if (!data.length) {
    return (
      <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu theo nguồn
      </div>
    )
  }

  const pieData = data.map(d => ({
    name: SOURCE_LABELS[d.source.toLowerCase()] || d.source,
    value: d.grossRevenue,
  }))

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-3 font-medium text-xs text-muted-foreground">Nguồn</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">Bookings</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">Gross</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">HH OTA</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">Net</th>
            </tr>
          </thead>
          <tbody>
            {data.map(item => (
              <tr key={item.source} className="border-b last:border-0">
                <td className="p-3 font-medium">{SOURCE_LABELS[item.source.toLowerCase()] || item.source}</td>
                <td className="p-3 text-right">{item.bookings}</td>
                <td className="p-3 text-right font-mono text-xs">{formatCurrency(item.grossRevenue)}</td>
                <td className="p-3 text-right font-mono text-xs text-red-600">
                  {item.otaCommission > 0 ? `-${formatCurrency(item.otaCommission)}` : '-'}
                </td>
                <td className="p-3 text-right font-mono text-xs font-semibold">{formatCurrency(item.netRevenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pie Chart */}
      <div className="border rounded-lg p-3">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              dataKey="value"
              paddingAngle={2}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
