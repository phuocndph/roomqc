import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface VendorPerformanceChartsProps {
  vendorId: string
}

export function VendorPerformanceCharts({ vendorId }: VendorPerformanceChartsProps) {
  const [period, setPeriod] = useState('6m')
  
  // Mock data - replace with real API call
  const ratingData = [
    { month: 'T1', quality: 4.2, timeliness: 4.5, average: 4.35 },
    { month: 'T2', quality: 4.5, timeliness: 4.3, average: 4.4 },
    { month: 'T3', quality: 4.3, timeliness: 4.6, average: 4.45 },
    { month: 'T4', quality: 4.7, timeliness: 4.4, average: 4.55 },
    { month: 'T5', quality: 4.4, timeliness: 4.7, average: 4.55 },
    { month: 'T6', quality: 4.6, timeliness: 4.5, average: 4.55 },
  ]
  
  const issuesData = [
    { month: 'T1', lost: 2, damaged: 1 },
    { month: 'T2', lost: 1, damaged: 2 },
    { month: 'T3', lost: 0, damaged: 1 },
    { month: 'T4', lost: 1, damaged: 0 },
    { month: 'T5', lost: 0, damaged: 0 },
    { month: 'T6', lost: 0, damaged: 1 },
  ]
  
  const costData = [
    { month: 'T1', estimated: 15000000, actual: 14500000 },
    { month: 'T2', estimated: 18000000, actual: 17800000 },
    { month: 'T3', estimated: 16500000, actual: 16200000 },
    { month: 'T4', estimated: 19000000, actual: 19500000 },
    { month: 'T5', estimated: 17500000, actual: 17000000 },
    { month: 'T6', estimated: 20000000, actual: 19800000 },
  ]
  
  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex justify-end">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3m">3 tháng</SelectItem>
            <SelectItem value="6m">6 tháng</SelectItem>
            <SelectItem value="12m">12 tháng</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Rating Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Đánh giá theo thời gian</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={ratingData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="month"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                domain={[0, 5]}
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="quality"
                name="Chất lượng"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="timeliness"
                name="Đúng giờ"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="average"
                name="Trung bình"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#f59e0b', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      {/* Issues Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Vấn đề phát sinh</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={issuesData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="month"
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey="lost" name="Items mất" fill="#ef4444" />
              <Bar dataKey="damaged" name="Items hỏng" fill="#f97316" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      {/* Cost Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Phân tích chi phí</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={costData}>
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
              <Area
                type="monotone"
                dataKey="estimated"
                name="Ước tính"
                stroke="#93c5fd"
                fill="#93c5fd"
                fillOpacity={0.3}
              />
              <Area
                type="monotone"
                dataKey="actual"
                name="Thực tế"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      {/* Recent Reviews */}
      <Card>
        <CardHeader>
          <CardTitle>Đánh giá gần đây</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              {
                batchCode: 'LB-20250107-0001',
                date: '07/01/2025',
                quality: 5,
                timeliness: 5,
                comment: 'Giặt rất sạch, giao đúng hạn',
              },
              {
                batchCode: 'LB-20250105-0003',
                date: '05/01/2025',
                quality: 4,
                timeliness: 4,
                comment: 'Tốt, có 1 khăn còn vết bẩn nhẹ',
              },
            ].map((review, index) => (
              <div key={index} className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{review.batchCode}</p>
                    <p className="text-sm text-muted-foreground">{review.date}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">Chất lượng:</span>
                      <span className="text-yellow-400">{'★'.repeat(review.quality)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">Đúng giờ:</span>
                      <span className="text-yellow-400">{'★'.repeat(review.timeliness)}</span>
                    </div>
                  </div>
                </div>
                {review.comment && (
                  <p className="mt-2 text-sm">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
