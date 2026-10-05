import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

interface PieData {
  name: string
  value: number
  color?: string
}

interface ReusablePieChartProps {
  data: PieData[]
  height?: number
  innerRadius?: number
  outerRadius?: number
  showLabel?: boolean
  colors?: string[]
  tooltipFormatter?: (value: number, name: string) => [string, string]
}

const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
]

export function ReusablePieChart({
  data,
  height = 300,
  innerRadius = 0,
  outerRadius = 100,
  showLabel = true,
  colors = DEFAULT_COLORS,
  tooltipFormatter,
}: ReusablePieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={showLabel}
          label={showLabel ? ({ name, percent }) => 
            `${name}: ${(percent * 100).toFixed(0)}%`
          : undefined}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.color || colors[index % colors.length]} 
            />
          ))}
        </Pie>
        <Tooltip
          formatter={tooltipFormatter}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
