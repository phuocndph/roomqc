import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { departmentLabel } from '@/lib/industryBenchmarks'

interface Slice {
  key: string
  label: string
  value: number
}

interface Props {
  slices: Slice[]
}

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#84cc16', '#6366f1']

export function CostBreakdownChart({ slices }: Props) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const data = slices.filter(s => s.value > 0)

  if (total === 0) {
    return (
      <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu chi phí để phân tích.
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Cơ cấu chi phí theo bộ phận</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => formatCurrency(v)}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-1.5">
          {data
            .sort((a, b) => b.value - a.value)
            .map((s, i) => {
              const pct = (s.value / total) * 100
              return (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: COLORS[data.indexOf(s) % COLORS.length] }}
                  />
                  <span className="flex-1 truncate">{s.label.startsWith('dept:') ? departmentLabel(s.label.slice(5)) : s.label}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{pct.toFixed(1)}%</span>
                  <span className="font-mono tabular-nums font-medium w-24 text-right">{formatCurrency(s.value)}</span>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
