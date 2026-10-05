import { useState } from 'react'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { Package, DollarSign, Star } from 'lucide-react'
import { useLaundryReport } from '@/hooks/useReports'
import { formatCurrency } from '@/lib/utils'
import { subDays } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { Skeleton } from '@/components/ui/skeleton'

export const MobileLaundryReportPage = () => {
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date(),
  })

  const { data: reportData, isLoading } = useLaundryReport(dateRange)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <MobileDetailHeader title="Báo cáo giặt là" showBack />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="border rounded-lg p-3">
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!reportData) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <MobileDetailHeader title="Báo cáo giặt là" showBack />
        <div className="p-4">
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            Không có dữ liệu
          </div>
        </div>
      </div>
    )
  }

  const { summary, by_vendor = [], monthly_trend = [] } = reportData

  // Map monthly_trend data for chart
  const chartData = monthly_trend.map((item: any) => ({
    month: item.month,
    cost: item.total_cost || 0,
  }))

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader title="Báo cáo giặt là" showBack />

      <div className="p-4 space-y-4">
        {/* Date Range */}
        <div className="border rounded-lg p-3">
          <DateRangePicker
            value={{ from: dateRange.start, to: dateRange.end }}
            onChange={(range) => 
              setDateRange({
                start: range.from || new Date(),
                end: range.to || new Date(),
              })
            }
          />
        </div>

        {/* Stats Summary - 2x2 Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Tổng lô</span>
            </div>
            <p className="text-xl font-bold">{summary?.total_batches || 0}</p>
          </div>
          
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Tổng items</span>
            </div>
            <p className="text-xl font-bold">{(summary?.total_items || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{summary?.total_weight?.toFixed(0) || 0} kg</p>
          </div>
          
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Chi phí</span>
            </div>
            <p className="text-xl font-bold">{formatCurrency(summary?.total_cost || 0)}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary?.avg_cost_per_kg || 0)}/kg</p>
          </div>
          
          <div className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Star className="h-4 w-4 text-yellow-500" />
              <span className="text-xs text-muted-foreground">Chất lượng</span>
            </div>
            <p className="text-xl font-bold">{(summary?.avg_quality || 0).toFixed(1)}/5</p>
            <p className="text-xs text-muted-foreground">{(summary?.on_time_rate || 0).toFixed(0)}% đúng hạn</p>
          </div>
        </div>

        {/* Cost Trend Mini Chart */}
        {chartData.length > 0 && (
          <div className="border rounded-lg p-3">
            <h3 className="text-sm font-medium mb-3">Xu hướng chi phí</h3>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={chartData.slice(-6)}>
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Vendor List */}
        {by_vendor.length > 0 && (
          <div className="border rounded-lg">
            <div className="p-3 border-b">
              <h3 className="text-sm font-medium">Nhà cung cấp</h3>
            </div>
            <div className="divide-y">
              {by_vendor.map((vendor: any) => (
                <div key={vendor.vendor_id} className="p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">{vendor.vendor_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{vendor.total_batches} lô</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <div className="flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        <span className="text-xs">{(vendor.avg_quality_rating || 0).toFixed(1)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className={`text-xs ${(vendor.on_time_rate || 0) >= 90 ? 'text-green-600' : (vendor.on_time_rate || 0) >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                        {(vendor.on_time_rate || 0).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-primary">{formatCurrency(vendor.total_cost || 0)}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(vendor.avg_cost_per_kg || 0)}/kg</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {by_vendor.length === 0 && (
          <div className="border rounded-lg p-8 text-center text-muted-foreground">
            <p>Chưa có dữ liệu nhà cung cấp</p>
          </div>
        )}
      </div>
    </div>
  )
}
