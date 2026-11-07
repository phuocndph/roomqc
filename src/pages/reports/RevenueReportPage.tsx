import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { useRevenueReport, ReportPeriod, recognizedRevenue, recognizedRevenueGrowth } from '@/hooks/useRevenueReport'
import { NoShowFinanceSummary } from '@/components/reports/NoShowFinanceSummary'
import { Skeleton } from '@/components/ui/skeleton'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileRevenueReportPage } from '@/components/reports/MobileRevenueReportPage'
import { RevenueByTypeChart } from '@/components/reports/RevenueByTypeChart'
import { RevenueBySourceTable } from '@/components/reports/RevenueBySourceTable'
import { TopRoomsRevenueTable } from '@/components/reports/TopRoomsRevenueTable'
import { useRevenueExport } from '@/components/reports/useRevenueExport'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { TrendingUp, TrendingDown, Download, Calendar, FileSpreadsheet, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { PeriodRangeWithPrevious } from '@/lib/reportPeriods'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)

const formatCompact = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
  return value.toString()
}

interface Props {
  /** Khi render trong Hub: nhận period từ chip. Standalone: undefined → tự quản. */
  period?: PeriodRangeWithPrevious
  /** Hub có PageHeader riêng; vẫn giữ nút xuất trong tab. */
  embedded?: boolean
}

export function RevenueReportPage({ period: embeddedPeriod, embedded }: Props = {}) {
  const { isMobile } = useBreakpoint()
  if (isMobile && !embedded) return <MobileRevenueReportPage />
  return <DesktopRevenueReportPage period={embeddedPeriod} embedded={embedded} />
}

function DesktopRevenueReportPage({ period: embeddedPeriod, embedded }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [customRange, setCustomRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null })

  // Trong Hub: dùng period từ Hub (qua 'custom' + range).
  const customRangeReady = period === 'custom' && customRange.from && customRange.to
  const { data: report, isLoading, isError } = useRevenueReport(
    embeddedPeriod ? 'custom' : period,
    embeddedPeriod
      ? { start: embeddedPeriod.current.start, end: embeddedPeriod.current.end }
      : customRangeReady
        ? { start: customRange.from!, end: customRange.to! }
        : undefined,
  )
  const { exportExcel, exportPDF, canExport, isExporting } = useRevenueExport(JSON.stringify([embeddedPeriod?.current, period, customRange]))

  if (isError) return <p role="alert">Không tải được báo cáo. Vui lòng tải lại hoặc kiểm tra quyền xem.</p>

  if (isLoading) {
    return (
      <div className="space-y-4">
        {!embedded && <PageHeader title="Báo cáo Doanh thu" description="Phân tích chi tiết doanh thu" />}
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="space-y-4">
        {!embedded && <PageHeader title="Báo cáo Doanh thu" description="Phân tích chi tiết doanh thu" />}
        <div className="border rounded-lg p-10 text-center text-muted-foreground">
          Chưa có dữ liệu doanh thu
        </div>
      </div>
    )
  }

  const growth = recognizedRevenueGrowth(report)
  const growthPositive = growth >= 0
  const currentRecognized = recognizedRevenue(report, 'currentPeriod')
  const previousRecognized = recognizedRevenue(report, 'previousPeriod')

  // Embedded uses the exact dates selected in the hub.
  const exportPeriod: ReportPeriod = embeddedPeriod ? 'custom' : period

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader title="Báo cáo Doanh thu" description="Phân tích chi tiết doanh thu">
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
              <SelectTrigger className="w-[140px] h-8">
                <Calendar className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Tuần này</SelectItem>
                <SelectItem value="month">Tháng này</SelectItem>
                <SelectItem value="quarter">Quý này</SelectItem>
                <SelectItem value="year">Năm nay</SelectItem>
                <SelectItem value="custom">Tùy chọn…</SelectItem>
              </SelectContent>
            </Select>
            {period === 'custom' && (
              <DateRangePicker value={customRange} onChange={setCustomRange} className="h-8 text-xs" />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8" disabled={!canExport || isExporting}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Xuất
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => exportExcel(report, exportPeriod)}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportPDF(report, exportPeriod)}>
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </PageHeader>
      )}

      {embedded && <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={!canExport || isExporting} onClick={() => exportExcel(report, exportPeriod)}>Xuất Excel</Button>
        <Button variant="outline" size="sm" disabled={!canExport || isExporting} onClick={() => exportPDF(report, exportPeriod)}>Xuất PDF</Button>
      </div>}
      {!embedded && <NoShowFinanceSummary report={report} />}
      {/* Recognition includes no-show fees; room metrics retain room-only data. */}
      <div className="border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-3">Doanh thu ghi nhận 6 tháng · gồm phí khách không đến</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={report.recognizedMonthlyTrends}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), 'Doanh thu']}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius-overlay)' }}
              />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revenueGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section: So sánh + Hôm nay */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border rounded-lg">
          <div className="p-3 border-b">
            <h3 className="text-sm font-medium">So sánh với kỳ trước</h3>
          </div>
          <div className="divide-y">
            <div className="p-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Kỳ trước</span>
              <span className="font-medium">{formatCurrency(previousRecognized)}</span>
            </div>
            <div className="p-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Kỳ này</span>
              <span className="font-medium">{formatCurrency(currentRecognized)}</span>
            </div>
            <div className="p-3 flex justify-between text-sm">
              <span>Chênh lệch</span>
              <span className={cn('font-semibold flex items-center gap-1', growthPositive ? 'text-green-600' : 'text-red-600')}>
                {growthPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {formatCurrency(Math.abs(currentRecognized - previousRecognized))}
                <span className="text-xs">({Math.abs(growth).toFixed(1)}%)</span>
              </span>
            </div>
          </div>
        </div>

        <div className="border rounded-lg">
          <div className="p-3 border-b">
            <h3 className="text-sm font-medium">Hôm nay</h3>
          </div>
          <div className="divide-y">
            <div className="p-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Đã thanh toán của lượt trả phòng</span>
              <span className="font-medium text-green-600">{formatCurrency(report.today.paidRevenue)}</span>
            </div>
            <div className="p-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Chờ TT</span>
              <span className="font-medium text-amber-600">{formatCurrency(report.today.pendingRevenue)}</span>
            </div>
            <div className="p-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Bookings</span>
              <span className="font-medium">{report.today.bookingsCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Phụ thu */}
      {report.currentPeriod.surcharges.total > 0 && (
        <div className="border rounded-lg">
          <div className="p-3 border-b">
            <h3 className="text-sm font-medium">Phụ thu</h3>
          </div>
          <div className="divide-y">
            {report.currentPeriod.surcharges.earlyCheckin > 0 && (
              <div className="p-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Check-in sớm</span>
                <span className="font-mono text-xs">{formatCurrency(report.currentPeriod.surcharges.earlyCheckin)}</span>
              </div>
            )}
            {report.currentPeriod.surcharges.lateCheckout > 0 && (
              <div className="p-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Checkout trễ</span>
                <span className="font-mono text-xs">{formatCurrency(report.currentPeriod.surcharges.lateCheckout)}</span>
              </div>
            )}
            {report.currentPeriod.surcharges.serviceCharges > 0 && (
              <div className="p-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Phí dịch vụ</span>
                <span className="font-mono text-xs">{formatCurrency(report.currentPeriod.surcharges.serviceCharges)}</span>
              </div>
            )}
            {report.currentPeriod.surcharges.extraCharges > 0 && (
              <div className="p-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Phí phát sinh (minibar, tiêu hao)</span>
                <span className="font-mono text-xs">{formatCurrency(report.currentPeriod.surcharges.extraCharges)}</span>
              </div>
            )}
            {report.currentPeriod.surcharges.damageCharges > 0 && (
              <div className="p-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Hư hỏng</span>
                <span className="font-mono text-xs">{formatCurrency(report.currentPeriod.surcharges.damageCharges)}</span>
              </div>
            )}
            <div className="p-3 flex justify-between text-sm bg-muted/30">
              <span className="font-medium">Tổng phụ thu</span>
              <span className="font-mono text-xs font-semibold">{formatCurrency(report.currentPeriod.surcharges.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Section: Doanh thu theo loại hình */}
      <div>
        <h3 className="text-sm font-medium mb-2">Doanh thu theo loại hình</h3>
        <RevenueByTypeChart data={report.byType} />
      </div>

      {/* Section: Doanh thu theo nguồn */}
      <div>
        <h3 className="text-sm font-medium mb-2">Doanh thu theo nguồn</h3>
        <RevenueBySourceTable data={report.bySource} />
      </div>

      {/* Section: Top phòng */}
      <div>
        <h3 className="text-sm font-medium mb-2">Top phòng theo doanh thu</h3>
        <TopRoomsRevenueTable data={report.topRooms} />
      </div>
    </div>
  )
}

export default RevenueReportPage
