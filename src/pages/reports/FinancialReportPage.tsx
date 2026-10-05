import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { ArrowLeft, Download, FileText, AlertTriangle, Info } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { HotelFilterCard } from '@/components/reports/HotelFilterCard'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Progress } from '@/components/ui/progress'
import { useFinancialReport } from '@/hooks/useReports'
import { useRevenueReport } from '@/hooks/useRevenueReport'
import { useFixedExpenses } from '@/hooks/useFixedExpenses'
import { useReportExport } from '@/hooks/useReportExport'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileFinancialReportPage } from '@/components/reports/MobileFinancialReportPage'
import { cn, formatCurrency } from '@/lib/utils'
import { subDays } from 'date-fns'
import { OperationsInsightsTab } from './components/OperationsInsightsTab'
import type { PeriodRangeWithPrevious } from '@/lib/reportPeriods'

interface Props {
  /** Khi render trong Hub: nhận period từ chip. Standalone: undefined → tự quản. */
  period?: PeriodRangeWithPrevious
  /** Hub đã có PageHeader & Export riêng → ẩn của trang. */
  embedded?: boolean
}

export function FinancialReportPage({ period: embeddedPeriod, embedded }: Props = {}) {
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()

  const [standaloneRange, setStandaloneRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date(),
  })
  const dateRange = embeddedPeriod
    ? { start: embeddedPeriod.current.start, end: embeddedPeriod.current.end }
    : standaloneRange

  const { data: reportData, isLoading } = useFinancialReport(dateRange)
  const { data: revenueData } = useRevenueReport('custom', { start: dateRange.start, end: dateRange.end })
  const { exportToPDF, exportToExcel, isExporting } = useReportExport()
  const fixedQ = useFixedExpenses(dateRange.start)

  if (isMobile && !embedded) return <MobileFinancialReportPage />

  if (isLoading || !reportData) {
    return (
      <div className="space-y-4">
        {!embedded && <PageHeader title="Báo cáo Tài chính" description="Phân tích chi phí và hiệu quả tài chính" />}
        <Skeleton className="h-72" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    )
  }

  const summary = (reportData as any).cost_summary || (reportData as any).summary || {
    total_cost: 0,
    purchase_cost: 0,
    laundry_cost: 0,
    maintenance_cost: 0,
  }
  const monthly_trend = reportData.monthly_trend || []

  const totalCost = summary.total_cost || 0
  const purchasePercent = totalCost > 0 ? (summary.purchase_cost / totalCost) * 100 : 0
  const laundryPercent = totalCost > 0 ? (summary.laundry_cost / totalCost) * 100 : 0
  const maintenancePercent = totalCost > 0 ? (summary.maintenance_cost / totalCost) * 100 : 0

  const totalRevenue = revenueData?.currentPeriod?.totalRevenue ?? 0
  const grossProfit = totalRevenue - totalCost
  const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  const totalFixed = (fixedQ.data || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  const netProfit = grossProfit - totalFixed
  const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
  const hasFixedCosts = totalFixed > 0


  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader title="Báo cáo Tài chính" description="Phân tích chi phí và hiệu quả tài chính">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigateBack(navigate, '/reports')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Quay lại
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportToPDF(
                  {
                    title: 'Báo cáo Tài chính',
                    dateRange: `${dateRange.start.toLocaleDateString('vi-VN')} - ${dateRange.end.toLocaleDateString('vi-VN')}`,
                    summary,
                  },
                  'financial',
                )
              }
              disabled={isExporting}
            >
              <FileText className="mr-2 h-4 w-4" />
              Xuất PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportToExcel(
                  {
                    title: 'Báo cáo Tài chính',
                    dateRange: `${dateRange.start.toLocaleDateString('vi-VN')} - ${dateRange.end.toLocaleDateString('vi-VN')}`,
                    summary,
                  },
                  'financial',
                )
              }
              disabled={isExporting}
            >
              <Download className="mr-2 h-4 w-4" />
              Xuất Excel
            </Button>
          </div>
        </PageHeader>
      )}

      {!embedded && (
        <>
          <HotelFilterCard />
          <div className="border rounded-lg p-4">
            <DateRangePicker
              value={{ from: dateRange.start, to: dateRange.end }}
              onChange={(range) =>
                setStandaloneRange({
                  start: range.from || new Date(),
                  end: range.to || new Date(),
                })
              }
            />
          </div>
        </>
      )}

      <Tabs defaultValue="insights" className="space-y-6">
        <TabsList className="h-9">
          <TabsTrigger value="insights" className="text-xs">
            Đánh giá vận hành
          </TabsTrigger>
          <TabsTrigger value="overview" className="text-xs">
            Cơ cấu chi phí
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="space-y-6">
          <OperationsInsightsTab dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="overview" className="space-y-4">
          {/* Cơ cấu chi phí theo nhóm — KPI tổng đã có ở strip Hub */}
          <div className="border rounded-lg">
            <div className="p-3 border-b">
              <h3 className="text-sm font-medium">Cơ cấu chi phí kỳ này</h3>
            </div>
            <div className="divide-y">
              <CostRow label="Chi phí mua sắm" value={summary.purchase_cost} percent={purchasePercent} />
              <CostRow label="Chi phí giặt là" value={summary.laundry_cost} percent={laundryPercent} />
              <CostRow label="Chi phí bảo trì" value={summary.maintenance_cost} percent={maintenancePercent} />
              <div className="p-3 flex items-center justify-between bg-muted/30">
                <span className="text-sm font-medium">Tổng chi phí</span>
                <span className="text-sm font-semibold font-mono">{formatCurrency(totalCost)}</span>
              </div>
            </div>
          </div>

          {/* Lợi nhuận gộp */}
          <div className="border rounded-lg">
            <div className="p-3 border-b">
              <h3 className="text-sm font-medium">Lợi nhuận vận hành</h3>
              <p className="text-xs text-muted-foreground/80 mt-0.5">Doanh thu phòng trừ chi phí vận hành trực tiếp. Chưa bao gồm: lương nhân viên, tiền thuê mặt bằng, điện nước.</p>
            </div>
            <div className="divide-y">
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Doanh thu</span>
                <span className="text-sm font-mono tabular-nums">{formatCurrency(totalRevenue)}</span>
              </div>
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Chi phí</span>
                <span className="text-sm font-mono tabular-nums">{formatCurrency(totalCost)}</span>
              </div>
              <div className="p-3 flex items-center justify-between bg-muted/30">
                <span className="text-sm font-medium">Lợi nhuận gộp</span>
                <div className="text-right">
                  <span className={cn("text-sm font-semibold font-mono tabular-nums", grossProfit >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatCurrency(grossProfit)}
                  </span>
                  <div className={cn("text-xs mt-0.5", grossProfit >= 0 ? "text-green-600" : "text-red-600")}>
                    Margin: {grossMarginPct.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
            {grossProfit < 0 && (
              <div className="p-3 bg-red-50 border-t flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">Chi phí vượt doanh thu trong kỳ này. Kiểm tra lại chi phí mua hàng và bảo trì.</p>
              </div>
            )}
          </div>

          {/* Tầng 2: Lợi nhuận thực sau khi trừ chi phí cố định */}
          {hasFixedCosts ? (
            <div className="border rounded-lg divide-y">
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Chi phí cố định tháng (lương, thuê, điện…)</span>
                <span className="text-sm font-mono tabular-nums text-red-600">−{formatCurrency(totalFixed)}</span>
              </div>
              <div className="p-3 flex items-center justify-between bg-muted/30">
                <span className="text-sm font-medium">Lợi nhuận thực ước tính</span>
                <div className="text-right">
                  <span className={cn("text-sm font-semibold font-mono tabular-nums", netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatCurrency(netProfit)}
                  </span>
                  <div className={cn("text-xs mt-0.5", netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                    Margin: {netMarginPct.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground px-1 flex items-start gap-1.5">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                Nhập chi phí cố định (lương, thuê, điện) trong{' '}
                <Link to="/settings/fixed-costs" className="underline text-primary">Cài đặt → Chi phí & Mục tiêu</Link>{' '}
                để xem lợi nhuận thực.
              </span>
            </p>
          )}


          {/* Xu hướng chi phí */}
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-3">Xu hướng chi phí theo tháng</h3>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={monthly_trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
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
                <Line type="monotone" dataKey="purchase" name="Mua sắm" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="laundry" name="Giặt là" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="maintenance" name="Bảo trì" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Stack chi phí theo danh mục */}
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-3">Chi phí cộng dồn theo danh mục</h3>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={monthly_trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
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
                <Area type="monotone" dataKey="purchase" name="Mua sắm" stackId="1" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.4} />
                <Area type="monotone" dataKey="laundry" name="Giặt là" stackId="1" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.4} />
                <Area type="monotone" dataKey="maintenance" name="Bảo trì" stackId="1" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3))" fillOpacity={0.4} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CostRow({ label, value, percent }: { label: string; value: number; percent: number }) {
  return (
    <div className="p-3 flex items-center gap-4">
      <div className="w-40 text-sm text-muted-foreground">{label}</div>
      <div className="flex-1">
        <Progress value={percent} className="h-2" />
      </div>
      <div className="w-12 text-right text-xs text-muted-foreground tabular-nums">{percent.toFixed(1)}%</div>
      <div className="w-32 text-right text-sm font-mono tabular-nums">{formatCurrency(value)}</div>
    </div>
  )
}

export default FinancialReportPage
