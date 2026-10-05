import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useInventoryValueOverTime } from '@/hooks/useInventoryDashboard'
import { format } from 'date-fns'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatCompact(amount: number) {
  if (amount >= 1000000000) {
    return `${(amount / 1000000000).toFixed(1)}B`
  }
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(0)}M`
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}K`
  }
  return amount.toString()
}

export function InventoryValueChart() {
  const [months, setMonths] = useState(6)
  const { data: valueData, isLoading } = useInventoryValueOverTime(months)
  
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    )
  }
  
  const chartData = valueData?.map(item => ({
    month: format(new Date(item.month), 'MMM'),
    value: item.stock_value,
    inbound: item.value_in,
    outbound: item.value_out,
  })) || []
  
  const totalInbound = chartData.reduce((sum, item) => sum + item.inbound, 0)
  const totalOutbound = chartData.reduce((sum, item) => sum + item.outbound, 0)
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background/95 backdrop-blur-sm px-3 py-2 shadow-lg text-xs">
          <p className="font-medium mb-1">{label}</p>
          <div className="space-y-0.5">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Tồn kho:</span>
              <span className="font-medium">{formatCurrency(payload[0]?.value || 0)}</span>
            </div>
          </div>
        </div>
      )
    }
    return null
  }
  
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Biến động giá trị kho</CardTitle>
          <Select value={months.toString()} onValueChange={(v) => setMonths(parseInt(v))}>
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 tháng</SelectItem>
              <SelectItem value="6">6 tháng</SelectItem>
              <SelectItem value="12">12 tháng</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="flex-1 min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="stockValueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={formatCompact}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#stockValueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        {/* Summary stats below chart */}
        <div className="grid grid-cols-2 gap-3 pt-3 mt-2 border-t">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tổng nhập</p>
            <p className="text-sm font-bold text-green-600">
              +{formatCompact(totalInbound)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tổng xuất</p>
            <p className="text-sm font-bold text-orange-600">
              -{formatCompact(totalOutbound)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
