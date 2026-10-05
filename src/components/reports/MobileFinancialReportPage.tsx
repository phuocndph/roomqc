import { useState } from 'react'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DollarSign, TrendingUp, TrendingDown, Download, RefreshCw, PieChart, BarChart3, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFinancialReport } from '@/hooks/useReports'
import { useMonthlyExpenses } from '@/hooks/useMonthlyExpenses'
import { useReportExport } from '@/hooks/useReportExport'
import { formatCurrency } from '@/lib/utils'
import { subDays, subMonths, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns'
import { Progress } from '@/components/ui/progress'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const PERIODS = [
  { id: 'month', label: 'Tháng này' },
  { id: 'last-month', label: 'Tháng trước' },
  { id: 'quarter', label: 'Quý này' },
  { id: 'year', label: 'Năm nay' },
]

function getDateRangeForPeriod(periodId: string) {
  const now = new Date()
  
  switch (periodId) {
    case 'month':
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      }
    case 'last-month': {
      const lastMonth = subMonths(now, 1)
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
      }
    }
    case 'quarter':
      return {
        start: startOfQuarter(now),
        end: endOfQuarter(now),
      }
    case 'year':
      return {
        start: startOfYear(now),
        end: endOfYear(now),
      }
    default:
      return {
        start: subDays(now, 30),
        end: now,
      }
  }
}

export const MobileFinancialReportPage = () => {
  const [period, setPeriod] = useState('month')
  const dateRange = getDateRangeForPeriod(period)
  const queryClient = useQueryClient()
  
  const { data: reportData, isLoading, refetch } = useFinancialReport(dateRange)
  const { data: monthlyExpenses } = useMonthlyExpenses(12)
  const { exportToExcel, isExporting } = useReportExport()

  const handleRefresh = async () => {
    await refetch()
    queryClient.invalidateQueries({ queryKey: ['monthly-expenses'] })
    toast.success('Đã cập nhật dữ liệu')
  }

  const handleExport = () => {
    if (!reportData) return
    
    exportToExcel({
      title: 'Báo cáo Tài chính',
      dateRange: `${dateRange.start.toLocaleDateString('vi-VN')} - ${dateRange.end.toLocaleDateString('vi-VN')}`,
      summary: reportData.summary,
    }, 'financial')
    
    toast.success('Đang xuất báo cáo Excel...')
  }

  // Calculate summary data
  const summary = reportData?.summary
  const totalCost = summary?.total_cost || 0
  const purchaseCost = summary?.purchase_cost || 0
  const laundryCost = summary?.laundry_cost || 0
  const maintenanceCost = summary?.maintenance_cost || 0
  
  // Calculate percentages safely
  const purchasePercent = totalCost > 0 ? (purchaseCost / totalCost) * 100 : 0
  const laundryPercent = totalCost > 0 ? (laundryCost / totalCost) * 100 : 0
  const maintenancePercent = totalCost > 0 ? (maintenanceCost / totalCost) * 100 : 0

  // Cost breakdown items for display
  const costBreakdown = [
    { name: 'Mua sắm', amount: purchaseCost, percent: purchasePercent, color: 'bg-emerald-500' },
    { name: 'Giặt là', amount: laundryCost, percent: laundryPercent, color: 'bg-blue-500' },
    { name: 'Bảo trì', amount: maintenanceCost, percent: maintenancePercent, color: 'bg-orange-500' },
  ].sort((a, b) => b.amount - a.amount)

  // Monthly trend data for chart
  const trendData = monthlyExpenses?.slice(0, 7).reverse() || []

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title="Báo cáo tài chính"
        showBack
        action={{
          icon: RefreshCw,
          onClick: handleRefresh,
          label: 'Làm mới'
        }}
      />

      <div className="p-4 space-y-4">
        {/* Period Selector */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                period === p.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
            <Skeleton className="h-32" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-l-4 border-l-primary">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <p className="text-xs text-muted-foreground">Tổng chi phí</p>
                  </div>
                  <p className="text-xl font-bold text-primary">
                    {formatCurrency(totalCost)}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <Calculator className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Tổng 3 danh mục</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-emerald-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                    <p className="text-xs text-muted-foreground">Mua sắm</p>
                  </div>
                  <p className="text-xl font-bold text-emerald-600">
                    {formatCurrency(purchaseCost)}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-emerald-600 font-medium">{purchasePercent.toFixed(1)}%</span>
                    <span className="text-xs text-muted-foreground">tổng chi</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <PieChart className="h-4 w-4 text-blue-500" />
                    <p className="text-xs text-muted-foreground">Giặt là</p>
                  </div>
                  <p className="text-xl font-bold text-blue-600">
                    {formatCurrency(laundryCost)}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-blue-600 font-medium">{laundryPercent.toFixed(1)}%</span>
                    <span className="text-xs text-muted-foreground">tổng chi</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-orange-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-orange-500" />
                    <p className="text-xs text-muted-foreground">Bảo trì</p>
                  </div>
                  <p className="text-xl font-bold text-orange-600">
                    {formatCurrency(maintenanceCost)}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-orange-600 font-medium">{maintenancePercent.toFixed(1)}%</span>
                    <span className="text-xs text-muted-foreground">tổng chi</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Cost Breakdown with Progress Bars */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="h-4 w-4" />
                  Chi phí theo danh mục
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-4">
                {costBreakdown.map((item) => (
                  <div key={item.name} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-primary font-semibold">{formatCurrency(item.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted h-2.5 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full transition-all", item.color)}
                          style={{ width: `${Math.min(item.percent, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-12 text-right">{item.percent.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Trend Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Xu hướng chi phí
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {trendData.length > 0 ? (
                  <div className="h-48 flex items-end justify-between gap-2">
                    {trendData.map((data: any, i) => {
                      const maxValue = Math.max(...trendData.map((d: any) => d.total_expense || 0))
                      const heightPercent = maxValue > 0 ? ((data.total_expense || 0) / maxValue) * 100 : 0
                      
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs text-muted-foreground">
                            {formatCurrency(data.total_expense || 0).replace('₫', '').trim()}
                          </span>
                          <div
                            className="w-full bg-primary rounded-t transition-all"
                            style={{ height: `${Math.max(heightPercent, 5)}%` }}
                          />
                          <span className="text-xs text-muted-foreground font-medium">
                            T{data.month}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    Chưa có dữ liệu xu hướng
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Insights */}
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
              <CardContent className="p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Nhận xét nhanh
                </h4>
                <div className="space-y-2 text-sm">
                  {purchasePercent > 50 && (
                    <p className="text-muted-foreground">
                      • Chi phí mua sắm chiếm <span className="text-emerald-600 font-medium">{purchasePercent.toFixed(1)}%</span> tổng chi
                    </p>
                  )}
                  {laundryPercent > 30 && (
                    <p className="text-muted-foreground">
                      • Chi phí giặt là cao, cân nhắc tối ưu hóa
                    </p>
                  )}
                  {maintenancePercent < 20 && (
                    <p className="text-muted-foreground">
                      • Chi phí bảo trì ở mức thấp <span className="text-green-600 font-medium">({maintenancePercent.toFixed(1)}%)</span>
                    </p>
                  )}
                  {totalCost === 0 && (
                    <p className="text-muted-foreground">
                      • Chưa có dữ liệu chi phí trong kỳ này
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Export Button */}
            <Button
              className="w-full"
              variant="outline"
              onClick={handleExport}
              disabled={isExporting || !reportData}
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Đang xuất...' : 'Xuất báo cáo Excel'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
