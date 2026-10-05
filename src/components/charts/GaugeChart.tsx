import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

interface GaugeChartProps {
  value: number // 0-100
  maxValue?: number
  size?: number
  color?: string
  label?: string
}

export function GaugeChart({
  value,
  maxValue = 100,
  size = 200,
  color = '#3b82f6',
  label,
}: GaugeChartProps) {
  const percentage = Math.min((value / maxValue) * 100, 100)
  
  const data = [
    { name: 'value', value: percentage },
    { name: 'empty', value: 100 - percentage },
  ]
  
  const getColor = (percent: number) => {
    if (percent >= 80) return '#10b981' // green
    if (percent >= 60) return '#f59e0b' // yellow
    return '#ef4444' // red
  }
  
  const gaugeColor = color === 'auto' ? getColor(percentage) : color
  
  return (
    <div className="relative" style={{ width: size, height: size / 2 + 40 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius={size * 0.35}
            outerRadius={size * 0.45}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={gaugeColor} />
            <Cell fill="#e5e7eb" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-4">
        <p className="text-3xl font-bold">{value.toFixed(1)}</p>
        {label && (
          <p className="text-xs text-muted-foreground">{label}</p>
        )}
      </div>
    </div>
  )
}
