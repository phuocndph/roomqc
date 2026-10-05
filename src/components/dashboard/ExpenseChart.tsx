import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts'
import { useMonthlyExpenses } from '@/hooks/useMonthlyExpenses'
import { formatCurrency } from '@/lib/utils'
import { EmptyState } from '@/components/shared/EmptyState'
import { TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ExpenseChartProps {
  months?: number
  showBarChart?: boolean
}

export function ExpenseChart({ months = 12, showBarChart = false }: ExpenseChartProps) {
  const { t } = useTranslation('dashboard')
  const { data: expenses, isLoading, error } = useMonthlyExpenses(months)
  
  const chartData = useMemo(() => {
    if (!expenses) return []
    return expenses.map(exp => ({
      month: exp.month,
      [t('charts.purchase', 'Mua sắm')]: exp.purchase,
      [t('charts.laundry', 'Giặt là')]: exp.laundry,
      [t('charts.maintenance', 'Bảo trì')]: exp.maintenance,
    }))
  }, [expenses, t])
  
  const purchaseKey = t('charts.purchase', 'Mua sắm')
  const laundryKey = t('charts.laundry', 'Giặt là')
  const maintenanceKey = t('charts.maintenance', 'Bảo trì')
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    )
  }
  
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('charts.operatingExpenses', 'Chi phí vận hành')}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={TrendingUp}
            title={t('charts.loadError', 'Không thể tải dữ liệu')}
            description={t('charts.loadErrorDesc', 'Đã xảy ra lỗi khi tải biểu đồ chi phí')}
          />
        </CardContent>
      </Card>
    )
  }
  
  if (!chartData || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('charts.operatingExpenses', 'Chi phí vận hành')}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={TrendingUp}
            title={t('charts.noData', 'Chưa có dữ liệu')}
            description={t('charts.noDataDesc', 'Chưa có dữ liệu chi phí để hiển thị')}
          />
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('charts.operatingExpenses', 'Chi phí vận hành')}</CardTitle>
        <CardDescription>
          {t('charts.lastMonths', '{{count}} tháng gần nhất', { count: months })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          {showBarChart ? (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
              />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey={purchaseKey} fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
              <Bar dataKey={laundryKey} fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              <Bar dataKey={maintenanceKey} fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
              />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey={purchaseKey}
                stroke="hsl(var(--chart-1))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-1))', r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey={laundryKey}
                stroke="hsl(var(--chart-2))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-2))', r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey={maintenanceKey}
                stroke="hsl(var(--chart-3))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-3))', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
