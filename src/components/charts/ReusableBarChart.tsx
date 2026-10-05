import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface BarData {
  dataKey: string
  name: string
  color: string
  stackId?: string
}

interface ReusableBarChartProps {
  data: any[]
  bars: BarData[]
  xAxisKey: string
  height?: number
  layout?: 'horizontal' | 'vertical'
  yAxisFormatter?: (value: number) => string
  tooltipFormatter?: (value: number, name: string) => [string, string]
}

export function ReusableBarChart({
  data,
  bars,
  xAxisKey,
  height = 300,
  layout = 'horizontal',
  yAxisFormatter,
  tooltipFormatter,
}: ReusableBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        {layout === 'horizontal' ? (
          <>
            <XAxis
              dataKey={xAxisKey}
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={yAxisFormatter}
            />
          </>
        ) : (
          <>
            <XAxis
              type="number"
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={yAxisFormatter}
            />
            <YAxis
              dataKey={xAxisKey}
              type="category"
              className="text-xs"
              width={100}
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
          </>
        )}
        <Tooltip
          formatter={tooltipFormatter}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
        <Legend />
        {bars.map((bar) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            name={bar.name}
            fill={bar.color}
            stackId={bar.stackId}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
