import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Download, FileText, ArrowRightLeft, TrendingUp, Package, ClipboardCheck, Clock, CheckCircle, AlertTriangle, Users, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { HotelFilterCard } from '@/components/reports/HotelFilterCard'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Progress } from '@/components/ui/progress'
import { useOperationsReport } from '@/hooks/useOperationsReport'
import { useReportExport } from '@/hooks/useReportExport'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileOperationsReportPage } from '@/components/reports/MobileOperationsReportPage'
import { formatCurrency } from '@/lib/utils'
import { subDays, format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export function OperationsReportPage() {
  const { t } = useTranslation('reports')
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()
  const chartRefs = useRef<HTMLElement[]>([])

  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date(),
  })

  const { data: reportData, isLoading } = useOperationsReport(dateRange)
  const { exportToPDF, exportToExcel, isExporting } = useReportExport()

  if (isMobile) {
    return <MobileOperationsReportPage />
  }

  const txSummary = reportData?.transactions
  const dateRangeStr = `${format(dateRange.start, 'dd/MM/yyyy')} - ${format(dateRange.end, 'dd/MM/yyyy')}`

  const handleExportPDF = () => {
    if (!reportData) return
    exportToPDF({
      title: t('operations.pageTitle'),
      dateRange: dateRangeStr,
      summary: {
        'Nhập kho': `${txSummary?.inbound_count} (${formatCurrency(txSummary?.inbound_value || 0)})`,
        'Xuất kho': `${txSummary?.outbound_count} (${formatCurrency(txSummary?.outbound_value || 0)})`,
        'Tổng giao dịch': txSummary?.total_transactions,
        'Giá trị ròng': formatCurrency(txSummary?.net_change_value || 0),
      },
      tables: [{
        title: 'Top mặt hàng giao dịch nhiều nhất',
        headers: ['#', 'Tên', 'Mã', 'Nhập', 'Xuất', 'Tổng'],
        rows: reportData.topMovingItems.map((item, i) => [
          String(i + 1), item.item_name, item.item_code,
          String(item.inbound), String(item.outbound), String(item.turnover),
        ]),
      }],
    }, 'operations-report', chartRefs.current.filter(Boolean))
  }

  const handleExportExcel = () => {
    if (!reportData) return
    exportToExcel({
      title: t('operations.pageTitle'),
      dateRange: dateRangeStr,
      summary: {
        'Nhập kho': txSummary?.inbound_count,
        'Xuất kho': txSummary?.outbound_count,
        'Tổng giao dịch': txSummary?.total_transactions,
        'Giá trị nhập': txSummary?.inbound_value,
        'Giá trị xuất': txSummary?.outbound_value,
      },
      tables: [{
        title: 'Top mặt hàng',
        headers: ['#', 'Tên', 'Mã', 'Nhập', 'Xuất', 'Tổng'],
        rows: reportData.topMovingItems.map((item, i) => [
          String(i + 1), item.item_name, item.item_code,
          String(item.inbound), String(item.outbound), String(item.turnover),
        ]),
      }],
      chartData: reportData.monthlyTrend,
    }, 'operations-report')
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-3 md:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateBack(navigate, '/reports')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{t('operations.pageTitle')}</h1>
            <p className="text-xs text-muted-foreground">{t('operations.pageDescription')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={isExporting} className="h-8 text-xs" onClick={handleExportPDF}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            PDF
          </Button>
          <Button variant="outline" size="sm" disabled={isExporting} className="h-8 text-xs" onClick={handleExportExcel}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Excel
          </Button>
        </div>
      </div>

      <HotelFilterCard />

      {/* Date Range */}
      <div className="border rounded-lg p-3 flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">{t('operations.reportPeriod')}</span>
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

      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList className="h-8">
          <TabsTrigger value="transactions" className="text-xs h-7 px-3">{t('operations.tabs.transactions')}</TabsTrigger>
          <TabsTrigger value="stocktake" className="text-xs h-7 px-3">{t('operations.tabs.stocktake')}</TabsTrigger>
          <TabsTrigger value="efficiency" className="text-xs h-7 px-3">{t('operations.tabs.efficiency')}</TabsTrigger>
        </TabsList>

        {/* TAB 1: Transactions */}
        <TabsContent value="transactions" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="border rounded-lg p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('operations.stats.inbound')}</p>
                <p className="text-xl font-bold">{txSummary?.inbound_count || 0}</p>
                <p className="text-[10px] text-green-600 truncate">{formatCurrency(txSummary?.inbound_value || 0)}</p>
              </div>
            </div>
            <div className="border rounded-lg p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <ArrowRightLeft className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('operations.stats.outbound')}</p>
                <p className="text-xl font-bold">{txSummary?.outbound_count || 0}</p>
                <p className="text-[10px] text-blue-600 truncate">{formatCurrency(txSummary?.outbound_value || 0)}</p>
              </div>
            </div>
            <div className="border rounded-lg p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Package className="h-4 w-4 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('operations.stats.totalTransactions')}</p>
                <p className="text-xl font-bold">{txSummary?.total_transactions || 0}</p>
                <p className="text-[10px] text-muted-foreground">{t('operations.stats.transactions')}</p>
              </div>
            </div>
            <div className="border rounded-lg p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('operations.stats.netChange')}</p>
                <p className="text-xl font-bold">{formatCurrency(txSummary?.net_change_value || 0)}</p>
                <p className="text-[10px] text-muted-foreground">{t('operations.stats.inPeriod')}</p>
              </div>
            </div>
          </div>

          {/* Transaction Trend Chart */}
          {reportData?.monthlyTrend && reportData.monthlyTrend.length > 0 && (
            <div className="border rounded-lg p-4" ref={(el) => el && (chartRefs.current[0] = el)}>
              <h3 className="text-sm font-medium mb-3">{t('operations.chart.title')}</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={reportData.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="inbound" name={t('operations.chart.inbound')} fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="outbound" name={t('operations.chart.outbound')} fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="adjustment" name={t('operations.chart.adjustment')} fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top Moving Items */}
          <div className="border rounded-lg overflow-hidden">
            <div className="p-3 border-b bg-muted/30">
              <h3 className="text-sm font-medium">{t('operations.topItems.title')}</h3>
            </div>
            {reportData?.topMovingItems && reportData.topMovingItems.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs h-9 w-12">#</TableHead>
                      <TableHead className="text-xs h-9">{t('operations.topItems.item')}</TableHead>
                      <TableHead className="text-xs h-9 text-center w-20">{t('operations.topItems.inbound')}</TableHead>
                      <TableHead className="text-xs h-9 text-center w-20">{t('operations.topItems.outbound')}</TableHead>
                      <TableHead className="text-xs h-9 text-center w-24">{t('operations.topItems.turnover')}</TableHead>
                      <TableHead className="text-xs h-9 w-28">{t('operations.topItems.trend')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.topMovingItems.map((item, index) => {
                      const maxTurnover = reportData.topMovingItems[0]?.turnover || 1
                      return (
                        <TableRow key={item.item_id} className="hover:bg-muted/30">
                          <TableCell className="text-xs py-2 font-medium text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="py-2">
                            <p className="text-sm font-medium">{item.item_name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{item.item_code}</p>
                          </TableCell>
                          <TableCell className="text-xs py-2 text-center text-green-600 font-medium">+{item.inbound}</TableCell>
                          <TableCell className="text-xs py-2 text-center text-blue-600 font-medium">-{item.outbound}</TableCell>
                          <TableCell className="text-xs py-2 text-center">
                            <span className="font-semibold">{item.turnover}</span>
                          </TableCell>
                          <TableCell className="py-2">
                            <Progress value={(item.turnover / maxTurnover) * 100} className="h-1.5" />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Không có dữ liệu giao dịch trong kỳ này
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 2: Stocktake */}
        <TabsContent value="stocktake" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="border rounded-lg p-3 flex items-center gap-3">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('operations.stocktake.checkCount')}</p>
                <p className="text-xl font-bold">{reportData?.stocktake?.total_checks || 0}</p>
              </div>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('operations.stocktake.itemsChecked')}</p>
              <p className="text-xl font-bold">{reportData?.stocktake?.items_checked || 0}</p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('operations.stocktake.accuracy')}</p>
              <p className={`text-xl font-bold ${(reportData?.stocktake?.accuracy_rate || 0) >= 90 ? 'text-green-600' : (reportData?.stocktake?.accuracy_rate || 0) >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                {reportData?.stocktake?.accuracy_rate || 0}%
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('operations.stocktake.adjustmentValue')}</p>
              <p className="text-xl font-bold">{formatCurrency(reportData?.stocktake?.total_adjusted_value || 0)}</p>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="p-3 border-b bg-muted/30">
              <h3 className="text-sm font-medium">{t('operations.stocktake.recentResults')}</h3>
            </div>
            {reportData?.stocktake?.recent && reportData.stocktake.recent.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs h-9">Mã kiểm kê</TableHead>
                      <TableHead className="text-xs h-9">Ngày</TableHead>
                      <TableHead className="text-xs h-9 text-center">Tổng SP</TableHead>
                      <TableHead className="text-xs h-9 text-center">Khớp</TableHead>
                      <TableHead className="text-xs h-9 text-center">Thừa</TableHead>
                      <TableHead className="text-xs h-9 text-center">Thiếu</TableHead>
                      <TableHead className="text-xs h-9">Trạng thái</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.stocktake.recent.map(adj => (
                      <TableRow key={adj.id}>
                        <TableCell className="text-xs font-mono">{adj.adjustment_code}</TableCell>
                        <TableCell className="text-xs">{format(new Date(adj.created_at), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="text-xs text-center">{adj.total_items}</TableCell>
                        <TableCell className="text-xs text-center text-green-600">{adj.matched}</TableCell>
                        <TableCell className="text-xs text-center text-blue-600">{adj.over}</TableCell>
                        <TableCell className="text-xs text-center text-red-600">{adj.short}</TableCell>
                        <TableCell>
                          <Badge variant={adj.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">
                            {adj.status === 'completed' ? 'Hoàn thành' : adj.status === 'draft' ? 'Nháp' : adj.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {t('operations.stocktake.noData')}
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 3: Efficiency */}
        <TabsContent value="efficiency" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="border rounded-lg p-3 flex items-center gap-3">
              <Activity className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">GD trung bình/ngày</p>
                <p className="text-xl font-bold">{reportData?.efficiency?.avg_transactions_per_day || 0}</p>
              </div>
            </div>
            <div className="border rounded-lg p-3 flex items-center gap-3">
              <Clock className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ngày cao điểm</p>
                <p className="text-sm font-bold">{reportData?.efficiency?.busiest_day || '-'}</p>
              </div>
            </div>
            <div className="border rounded-lg p-3 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Độ chính xác kiểm kê</p>
                <p className="text-xl font-bold text-green-600">{reportData?.efficiency?.accuracy_rate || 0}%</p>
              </div>
            </div>
            <div className="border rounded-lg p-3 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tỷ lệ điều chỉnh</p>
                <p className="text-xl font-bold text-amber-600">{reportData?.efficiency?.adjustment_rate || 0}%</p>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-medium">Chi tiết hiệu suất</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Độ chính xác kiểm kê</span>
                  <span className="font-medium text-green-600">{reportData?.efficiency?.accuracy_rate || 0}%</span>
                </div>
                <Progress value={reportData?.efficiency?.accuracy_rate || 0} className="h-1.5" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Tỷ lệ điều chỉnh (thấp = tốt)</span>
                  <span className="font-medium text-amber-600">{reportData?.efficiency?.adjustment_rate || 0}%</span>
                </div>
                <Progress value={reportData?.efficiency?.adjustment_rate || 0} className="h-1.5" />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
