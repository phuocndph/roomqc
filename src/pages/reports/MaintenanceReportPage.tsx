import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { ArrowLeft, Download, FileText, Wrench, Clock, DollarSign, CheckCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { HotelFilterCard } from '@/components/reports/HotelFilterCard'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Progress } from '@/components/ui/progress'
import { useReportExport } from '@/hooks/useReportExport'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileMaintenanceReportPage } from '@/components/reports/MobileMaintenanceReportPage'
import { useMaintenanceDashboard } from '@/hooks/useMaintenanceDashboard'
import { useMaintenanceReport } from '@/hooks/useMaintenanceReport'
import { formatCurrency } from '@/lib/utils'
import { subDays, format } from 'date-fns'

const ISSUE_TYPE_LABELS: Record<string, string> = {
  repair: 'Sửa chữa',
  replace: 'Thay thế',
  inspection: 'Kiểm tra',
  cleaning: 'Vệ sinh',
  electrical: 'Điện',
  plumbing: 'Nước',
  hvac: 'Điều hòa',
  furniture: 'Nội thất',
  other: 'Khác',
}

const labelType = (t: string) => ISSUE_TYPE_LABELS[t] || t

export function MaintenanceReportPage() {
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()
  const chartRefs = useRef<HTMLElement[]>([])

  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date(),
  })

  const { data: maintenanceData } = useMaintenanceDashboard()
  const { data: reportData, isLoading } = useMaintenanceReport(dateRange)
  const { exportToPDF, exportToExcel, isExporting } = useReportExport()

  if (isMobile) {
    return <MobileMaintenanceReportPage />
  }

  const rawStats = maintenanceData?.stats
  const stats = {
    total_requests: reportData?.summary.total_requests ?? rawStats?.total ?? 0,
    in_progress: reportData?.summary.in_progress ?? rawStats?.inProgress ?? 0,
    completed: reportData?.summary.completed ?? rawStats?.completed ?? 0,
    pending: reportData?.summary.pending ?? 0,
    completion_rate: rawStats?.completionRate || 0,
    avg_mttr: rawStats?.mttr || 0,
    total_cost: reportData?.summary.total_cost ?? rawStats?.costLast30Days ?? 0,
    avg_cost: reportData?.summary.avg_cost ?? 0,
    avg_mtbf: rawStats?.mtbf || 0,
    first_time_fix_rate: rawStats?.firstTimeFixRate || 0,
  }

  const costByType = (reportData?.cost_by_type || []).map(c => ({
    type: labelType(c.type),
    cost: Number(c.cost) || 0,
    percentage: Number(c.percentage) || 0,
    count: c.count,
  }))

  const monthlyTrend = (reportData?.monthly_trend || []).map(m => ({
    month: m.month,
    requests: Number(m.requests) || 0,
    completed: Number(m.completed) || 0,
    cost: Number(m.cost) || 0,
  }))

  const recurringIssues = (reportData?.recurring_issues || []).map(r => ({
    issue: r.issue,
    count: Number(r.count) || 0,
    avg_time: Number(r.avg_time) || 0,
    total_cost: Number(r.total_cost) || 0,
  }))

  const statusDistribution = [
    { name: 'Hoàn thành', value: stats.completed, color: '#10b981' },
    { name: 'Đang xử lý', value: stats.in_progress, color: '#3b82f6' },
    { name: 'Chờ xử lý', value: stats.pending, color: '#f59e0b' },
  ].filter(item => item.value > 0)

  const dateRangeLabel = `${format(dateRange.start, 'dd/MM/yyyy')} - ${format(dateRange.end, 'dd/MM/yyyy')}`

  const buildExportPayload = () => ({
    title: 'Báo cáo Bảo trì',
    dateRange: dateRangeLabel,
    summary: {
      total_requests: stats.total_requests,
      completed: stats.completed,
      in_progress: stats.in_progress,
      pending: stats.pending,
      total_cost: stats.total_cost,
      avg_cost: stats.avg_cost,
      avg_mttr: `${stats.avg_mttr}h`,
      first_time_fix_rate: stats.first_time_fix_rate,
    },
    tables: [
      {
        title: 'Chi phí theo loại',
        headers: ['Loại', 'Số yêu cầu', 'Chi phí', 'Tỷ lệ %'],
        rows: costByType.map(c => [c.type, c.count, c.cost, c.percentage]),
      },
      {
        title: 'Xu hướng theo tháng',
        headers: ['Tháng', 'Yêu cầu', 'Hoàn thành', 'Chi phí'],
        rows: monthlyTrend.map(m => [m.month, m.requests, m.completed, m.cost]),
      },
      {
        title: 'Vấn đề lặp lại',
        headers: ['Vấn đề', 'Số lần', 'Thời gian TB (h)', 'Tổng chi phí'],
        rows: recurringIssues.map(r => [r.issue, r.count, r.avg_time, r.total_cost]),
      },
    ],
  })

  const handleExportPDF = () => exportToPDF(buildExportPayload(), 'bao-cao-bao-tri', chartRefs.current.filter(Boolean))
  const handleExportExcel = () => exportToExcel(buildExportPayload(), 'bao-cao-bao-tri')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo Bảo trì"
        description="Phân tích yêu cầu bảo trì và chi phí"
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigateBack(navigate, '/reports')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại
          </Button>
          <Button variant="outline" disabled={isExporting || isLoading} onClick={handleExportPDF}>
            <FileText className="mr-2 h-4 w-4" />
            Xuất PDF
          </Button>
          <Button variant="outline" disabled={isExporting || isLoading} onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Xuất Excel
          </Button>
        </div>
      </PageHeader>

      <HotelFilterCard />

      <div className="border rounded-lg p-3">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">Kỳ báo cáo:</label>
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
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="costs">Chi phí</TabsTrigger>
          <TabsTrigger value="performance">Hiệu suất</TabsTrigger>
          <TabsTrigger value="issues">Vấn đề</TabsTrigger>
        </TabsList>

        {/* TAB 1: Overview */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Wrench className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Tổng yêu cầu</p>
                  <p className="text-2xl font-semibold">{stats.total_requests}</p>
                </div>
              </div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Hoàn thành</p>
                  <p className="text-2xl font-semibold text-green-600">{stats.completed}</p>
                </div>
              </div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">MTTR (TB)</p>
                  <p className="text-2xl font-semibold">{stats.avg_mttr}h</p>
                </div>
              </div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Tổng chi phí</p>
                  <p className="text-xl font-semibold">{formatCurrency(stats.total_cost)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card ref={(el) => el && (chartRefs.current[0] = el)}>
              <CardHeader>
                <CardTitle>Phân bổ trạng thái</CardTitle>
              </CardHeader>
              <CardContent>
                {statusDistribution.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">Không có dữ liệu</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statusDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card ref={(el) => el && (chartRefs.current[1] = el)}>
              <CardHeader>
                <CardTitle>Xu hướng theo tháng</CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyTrend.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">Không có dữ liệu</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="requests" name="Yêu cầu" fill="#3b82f6" />
                      <Bar dataKey="completed" name="Hoàn thành" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: Costs */}
        <TabsContent value="costs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Chi phí theo loại bảo trì</CardTitle>
            </CardHeader>
            <CardContent>
              {costByType.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Không có dữ liệu chi phí trong kỳ</p>
              ) : (
                <div className="space-y-4">
                  {costByType.map((item, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{item.type}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {formatCurrency(item.cost)}
                          </span>
                          <Badge variant="secondary">{item.percentage}%</Badge>
                        </div>
                      </div>
                      <Progress value={item.percentage} className="h-2" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card ref={(el) => el && (chartRefs.current[2] = el)}>
            <CardHeader>
              <CardTitle>Xu hướng chi phí</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">Không có dữ liệu</p>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
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
                      dataKey="cost"
                      name="Chi phí"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ fill: '#8b5cf6', r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Performance */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Tỷ lệ hoàn thành</p>
              <p className="text-2xl font-semibold text-green-600">{stats.completion_rate}%</p>
              <Progress value={stats.completion_rate} className="h-2 mt-2" />
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">MTTR</p>
              <p className="text-2xl font-semibold">{stats.avg_mttr}h</p>
              <p className="text-xs text-muted-foreground mt-1">Thời gian sửa chữa TB</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">MTBF</p>
              <p className="text-2xl font-semibold">{stats.avg_mtbf} ngày</p>
              <p className="text-xs text-muted-foreground mt-1">Thời gian giữa các lỗi</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Sửa đúng lần đầu</p>
              <p className="text-2xl font-semibold text-blue-600">{stats.first_time_fix_rate}%</p>
              <Progress value={stats.first_time_fix_rate} className="h-2 mt-2" />
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: Issues */}
        <TabsContent value="issues" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Vấn đề thường xảy ra</CardTitle>
            </CardHeader>
            <CardContent>
              {recurringIssues.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Không có vấn đề lặp lại trong kỳ
                </p>
              ) : (
                <div className="rounded-md border">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Vấn đề</TableHead>
                          <TableHead className="text-center">Số lần</TableHead>
                          <TableHead className="text-center">Thời gian TB (h)</TableHead>
                          <TableHead className="text-right">Tổng chi phí</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recurringIssues.map((issue, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{index + 1}</TableCell>
                            <TableCell>{issue.issue}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{issue.count}</Badge>
                            </TableCell>
                            <TableCell className="text-center">{issue.avg_time}</TableCell>
                            <TableCell className="text-right">{formatCurrency(issue.total_cost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
