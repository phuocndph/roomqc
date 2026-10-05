import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { useSubscriptionDistribution } from '@/hooks/useSuperAdminStats'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const COLORS = {
  free: '#94a3b8',
  basic: '#3b82f6',
  professional: '#8b5cf6',
  enterprise: '#f59e0b',
  trial: '#10b981',
}

const TIER_NAMES: Record<string, string> = {
  free: 'Miễn phí',
  basic: 'Cơ bản',
  professional: 'Chuyên nghiệp',
  enterprise: 'Doanh nghiệp',
  trial: 'Dùng thử',
}

export function SubscriptionDistributionChart() {
  const { data: distribution, isLoading } = useSubscriptionDistribution()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Phân bố gói đăng ký</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <LoadingSpinner size="lg" />
        </CardContent>
      </Card>
    )
  }

  const chartData = distribution?.map(item => ({
    name: TIER_NAMES[item.tier] || item.tier,
    value: item.count,
    tier: item.tier,
  })) || []

  const total = chartData.reduce((sum, item) => sum + item.value, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phân bố gói đăng ký</CardTitle>
        <CardDescription>
          Tổng số tenant: <span className="font-semibold text-foreground">{total}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={COLORS[entry.tier as keyof typeof COLORS] || '#94a3b8'} 
                />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
