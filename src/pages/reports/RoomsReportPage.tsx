import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { ArrowLeft, Download, FileText, Home, CheckCircle, AlertTriangle, Wrench, TrendingUp, TrendingDown, Users, DollarSign, BarChart3, Calendar } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { HotelFilterCard } from '@/components/reports/HotelFilterCard'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import { Progress } from '@/components/ui/progress'
import { useReportExport } from '@/hooks/useReportExport'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileRoomsReportPage } from '@/components/reports/MobileRoomsReportPage'
import { useRoomsReportData } from '@/hooks/useRoomsReportData'
import { subDays, format } from 'date-fns'

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}

export function RoomsReportPage() {
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()
  const chartRefs = useRef<HTMLElement[]>([])
  
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date(),
  })
  
  const { data, isLoading, error } = useRoomsReportData(dateRange)
  const { exportToPDF, exportToExcel, isExporting } = useReportExport()

  const dateRangeStr = `${format(dateRange.start, 'dd/MM/yyyy')} - ${format(dateRange.end, 'dd/MM/yyyy')}`

  const handleExportPDF = () => {
    if (!data) return
    
    const rs = data.roomStats
    const os = data.occupancyStats
    const cs = data.checkStats
    
    exportToPDF(
      {
        title: 'Báo cáo Phòng',
        dateRange: dateRangeStr,
        summary: {
          total_rooms: rs.total,
          vacant_rooms: rs.vacant,
          cleaning_rooms: rs.cleaning,
          maintenance_rooms: rs.maintenance,
          occupancy_rate: `${os.occupancy_rate}%`,
          total_revenue: os.total_revenue,
          total_bookings: os.total_bookings,
          total_checks: cs.total_checks,
          avg_score: cs.avg_score,
          issues_found: cs.issues_found,
        },
        tables: [
          {
            title: 'Sử dụng theo loại phòng',
            headers: ['Loại phòng', 'Tổng', 'Đang dùng', 'Trống', 'Tỷ lệ', 'Doanh thu'],
            rows: data.utilizationByType?.map(room => [
              room.room_type,
              room.total,
              room.occupied,
              room.vacant,
              `${room.rate}%`,
              formatCurrency(room.revenue),
            ]) || [],
          },
          {
            title: 'Top phòng theo doanh thu',
            headers: ['Phòng', 'Loại', 'Bookings', 'Đêm', 'Doanh thu'],
            rows: data.revenueByRoom?.slice(0, 10).map(room => [
              room.room_number,
              room.room_type,
              room.total_bookings,
              room.occupancy_days,
              formatCurrency(room.total_revenue),
            ]) || [],
          },
          {
            title: 'Vấn đề thường gặp',
            headers: ['Đồ dùng', 'Loại', 'Số lượng', 'Giá trị'],
            rows: data.topIssues?.map(issue => [
              issue.item_name,
              issue.issue_type === 'missing' ? 'Thiếu' : issue.issue_type === 'damaged' ? 'Hỏng' : 'Mất',
              issue.count,
              formatCurrency(issue.total_value),
            ]) || [],
          },
          {
            title: 'Hiệu suất nhân viên kiểm tra',
            headers: ['Nhân viên', 'Số kiểm tra', 'Điểm TB', 'Vấn đề phát hiện'],
            rows: data.staffPerformance?.map(staff => [
              staff.user_name,
              staff.checks_count,
              staff.avg_score.toFixed(1),
              staff.issues_found,
            ]) || [],
          },
        ],
        notes: data.periodComparison ? [
          `So với kỳ trước: Tỷ lệ lấp đầy ${data.periodComparison.changes.occupancy_rate_change >= 0 ? '+' : ''}${data.periodComparison.changes.occupancy_rate_change}%`,
          `Doanh thu ${data.periodComparison.changes.revenue_change >= 0 ? '+' : ''}${data.periodComparison.changes.revenue_change}%`,
          `Số booking ${data.periodComparison.changes.bookings_change >= 0 ? '+' : ''}${data.periodComparison.changes.bookings_change}%`,
        ] : [],
      },
      'rooms_report',
      chartRefs.current.filter(Boolean)
    )
  }

  const handleExportExcel = () => {
    if (!data) return
    
    const rs = data.roomStats
    const os = data.occupancyStats
    const cs = data.checkStats
    
    exportToExcel(
      {
        title: 'Báo cáo Phòng',
        dateRange: dateRangeStr,
        summary: {
          total_rooms: rs.total,
          vacant_rooms: rs.vacant,
          cleaning_rooms: rs.cleaning,
          maintenance_rooms: rs.maintenance,
          occupancy_rate: `${os.occupancy_rate}%`,
          total_revenue: os.total_revenue,
          total_bookings: os.total_bookings,
          total_checks: cs.total_checks,
          avg_score: cs.avg_score,
          issues_found: cs.issues_found,
        },
        tables: [
          {
            title: 'Sử dụng theo loại phòng',
            headers: ['Loại phòng', 'Tổng', 'Đang dùng', 'Trống', 'Tỷ lệ', 'Doanh thu'],
            rows: data.utilizationByType?.map(room => [
              room.room_type,
              room.total,
              room.occupied,
              room.vacant,
              `${room.rate}%`,
              formatCurrency(room.revenue),
            ]) || [],
          },
          {
            title: 'Doanh thu theo phòng',
            headers: ['Phòng', 'Loại', 'Bookings', 'Đêm', 'Doanh thu'],
            rows: data.revenueByRoom?.map(room => [
              room.room_number,
              room.room_type,
              room.total_bookings,
              room.occupancy_days,
              formatCurrency(room.total_revenue),
            ]) || [],
          },
          {
            title: 'Vấn đề thường gặp',
            headers: ['Đồ dùng', 'Loại', 'Số lượng', 'Giá trị'],
            rows: data.topIssues?.map(issue => [
              issue.item_name,
              issue.issue_type === 'missing' ? 'Thiếu' : issue.issue_type === 'damaged' ? 'Hỏng' : 'Mất',
              issue.count,
              formatCurrency(issue.total_value),
            ]) || [],
          },
          {
            title: 'Hiệu suất nhân viên',
            headers: ['Nhân viên', 'Số kiểm tra', 'Điểm TB', 'Vấn đề phát hiện'],
            rows: data.staffPerformance?.map(staff => [
              staff.user_name,
              staff.checks_count,
              staff.avg_score.toFixed(1),
              staff.issues_found,
            ]) || [],
          },
        ],
        chartData: data.occupancyTrend,
      },
      'rooms_report'
    )
  }

  if (isMobile) {
    return <MobileRoomsReportPage dateRange={dateRange} />
  }

  const roomStats = data?.roomStats || {
    total: 0,
    vacant: 0,
    occupied: 0,
    cleaning: 0,
    maintenance: 0,
  }

  const occupancyStats = data?.occupancyStats || {
    total_room_nights: 0,
    total_revenue: 0,
    total_bookings: 0,
    occupancy_rate: 0,
    avg_revenue_per_room: 0,
    avg_revenue_per_booking: 0,
  }

  const roomStatusData = [
    { name: 'Trống', value: roomStats.vacant, color: '#10b981' },
    { name: 'Đang sử dụng', value: roomStats.occupied, color: '#3b82f6' },
    { name: 'Đang dọn', value: roomStats.cleaning, color: '#f59e0b' },
    { name: 'Bảo trì', value: roomStats.maintenance, color: '#ef4444' },
  ].filter(item => item.value > 0)

  const utilizationChartData = data?.utilizationByType?.map(item => ({
    type: item.room_type,
    rate: item.rate || 0,
    revenue: item.revenue || 0,
  })) || []

  const checkStats = data?.checkStats || {
    total_checks: 0,
    avg_score: 0,
    issues_found: 0,
    daily_checks: 0,
    checkout_checks: 0,
    checkin_checks: 0,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo Phòng"
        description="Phân tích sử dụng, doanh thu và thiếu hụt đồ dùng phòng"
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigateBack(navigate, '/reports')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại
          </Button>
          <Button variant="outline" disabled={isExporting} onClick={handleExportPDF}>
            <FileText className="mr-2 h-4 w-4" />
            Xuất PDF
          </Button>
          <Button variant="outline" disabled={isExporting} onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Xuất Excel
          </Button>
        </div>
      </PageHeader>
      
      {/* Hotel Filter */}
      <HotelFilterCard />
      
      {/* Date Range */}
      <Card>
        <CardContent className="pt-6">
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
        </CardContent>
      </Card>
      
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="utilization">Sử dụng</TabsTrigger>
          <TabsTrigger value="revenue">Doanh thu</TabsTrigger>
          <TabsTrigger value="deficiency">Thiếu hụt</TabsTrigger>
          <TabsTrigger value="checks">Kiểm tra</TabsTrigger>
        </TabsList>
        
        {/* TAB 1: Overview */}
        <TabsContent value="overview" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2 bg-blue-50">
                    <Home className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tổng phòng</p>
                    {isLoading ? <Skeleton className="h-8 w-16" /> : (
                      <p className="text-2xl font-bold">{roomStats.total}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2 bg-green-50">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phòng trống</p>
                    {isLoading ? <Skeleton className="h-8 w-16" /> : (
                      <p className="text-2xl font-bold text-green-600">{roomStats.vacant}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2 bg-orange-50">
                    <AlertTriangle className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Đang dọn</p>
                    {isLoading ? <Skeleton className="h-8 w-16" /> : (
                      <p className="text-2xl font-bold text-orange-600">{roomStats.cleaning}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2 bg-red-50">
                    <Wrench className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Bảo trì</p>
                    {isLoading ? <Skeleton className="h-8 w-16" /> : (
                      <p className="text-2xl font-bold text-red-600">{roomStats.maintenance}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2 bg-purple-50">
                    <TrendingUp className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tỷ lệ lấp đầy</p>
                    {isLoading ? <Skeleton className="h-8 w-16" /> : (
                      <p className="text-3xl font-bold text-purple-600">{occupancyStats.occupancy_rate}%</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Period Comparison Cards */}
          {data?.periodComparison && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Tỷ lệ lấp đầy</p>
                      <p className="text-xl font-bold">{data.periodComparison.current_period.occupancy_rate}%</p>
                      <p className="text-xs text-muted-foreground">Kỳ trước: {data.periodComparison.previous_period.occupancy_rate}%</p>
                    </div>
                    <div className={`flex items-center gap-1 text-sm font-medium ${data.periodComparison.changes.occupancy_rate_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {data.periodComparison.changes.occupancy_rate_change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {data.periodComparison.changes.occupancy_rate_change >= 0 ? '+' : ''}{data.periodComparison.changes.occupancy_rate_change}%
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-green-500">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Doanh thu</p>
                      <p className="text-xl font-bold">{formatCurrency(data.periodComparison.current_period.total_revenue)}</p>
                      <p className="text-xs text-muted-foreground">Kỳ trước: {formatCurrency(data.periodComparison.previous_period.total_revenue)}</p>
                    </div>
                    <div className={`flex items-center gap-1 text-sm font-medium ${data.periodComparison.changes.revenue_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {data.periodComparison.changes.revenue_change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {data.periodComparison.changes.revenue_change >= 0 ? '+' : ''}{data.periodComparison.changes.revenue_change}%
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Số booking</p>
                      <p className="text-xl font-bold">{data.periodComparison.current_period.total_bookings}</p>
                      <p className="text-xs text-muted-foreground">Kỳ trước: {data.periodComparison.previous_period.total_bookings}</p>
                    </div>
                    <div className={`flex items-center gap-1 text-sm font-medium ${data.periodComparison.changes.bookings_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {data.periodComparison.changes.bookings_change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {data.periodComparison.changes.bookings_change >= 0 ? '+' : ''}{data.periodComparison.changes.bookings_change}%
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-orange-500">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Điểm kiểm tra TB</p>
                      <p className="text-xl font-bold">{data.periodComparison.current_period.avg_score.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">Kỳ trước: {data.periodComparison.previous_period.avg_score.toFixed(1)}</p>
                    </div>
                    <div className={`flex items-center gap-1 text-sm font-medium ${data.periodComparison.changes.score_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {data.periodComparison.changes.score_change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      {data.periodComparison.changes.score_change >= 0 ? '+' : ''}{data.periodComparison.changes.score_change}%
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Occupancy Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Xu hướng lấp đầy
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : data?.occupancyTrend && data.occupancyTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data.occupancyTrend.slice(-14)}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                        tickFormatter={(value) => format(new Date(value), 'dd/MM')}
                      />
                      <YAxis 
                        domain={[0, 100]}
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === 'occupancy_rate' ? `${value}%` : formatCurrency(value),
                          name === 'occupancy_rate' ? 'Tỷ lệ lấp đầy' : 'Doanh thu'
                        ]}
                        labelFormatter={(label) => format(new Date(label), 'dd/MM/yyyy')}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="occupancy_rate" 
                        name="Tỷ lệ lấp đầy"
                        stroke="#8b5cf6" 
                        strokeWidth={2}
                        dot={{ fill: '#8b5cf6', r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Không có dữ liệu xu hướng
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Room Status Pie Chart */}
            <Card ref={(el) => el && (chartRefs.current[0] = el)}>
              <CardHeader>
                <CardTitle>Trạng thái phòng</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : roomStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={roomStatusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {roomStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Không có dữ liệu phòng
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Issues */}
          <Card>
            <CardHeader>
              <CardTitle>Vấn đề thường gặp</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : data?.topIssues && data.topIssues.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                  {data.topIssues.slice(0, 5).map((issue, index) => {
                    const totalIssues = data.topIssues.reduce((sum, i) => sum + i.count, 0)
                    const percentage = totalIssues > 0 ? Math.round((issue.count / totalIssues) * 100) : 0
                    return (
                      <div key={index} className="space-y-2 p-3 rounded-lg border">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium truncate max-w-[120px]">
                            {issue.item_name || 'Không xác định'}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {issue.issue_type === 'missing' ? 'Thiếu' : 
                             issue.issue_type === 'damaged' ? 'Hỏng' : 'Mất'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{issue.count} lần</span>
                          <span>{percentage}%</span>
                        </div>
                        <Progress value={percentage} className="h-1.5" />
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-[100px] text-muted-foreground">
                  Không có vấn đề nào được ghi nhận
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* TAB 2: Utilization */}
        <TabsContent value="utilization" className="space-y-6">
          <Card ref={(el) => el && (chartRefs.current[1] = el)}>
            <CardHeader>
              <CardTitle>Tỷ lệ sử dụng theo loại phòng</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[350px] w-full" />
              ) : utilizationChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={utilizationChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis dataKey="type" type="category" width={100} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      formatter={(value: number) => `${value}%`}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="rate" name="Tỷ lệ sử dụng" fill="#3b82f6" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  Không có dữ liệu loại phòng
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Chi tiết theo loại phòng</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <div className="rounded-md border">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Loại phòng</TableHead>
                          <TableHead className="text-center">Tổng</TableHead>
                          <TableHead className="text-center">Đang dùng</TableHead>
                          <TableHead className="text-center">Trống</TableHead>
                          <TableHead className="text-center">Tỷ lệ</TableHead>
                          <TableHead className="text-right">Doanh thu</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data?.utilizationByType && data.utilizationByType.length > 0 ? (
                          data.utilizationByType.map((room) => (
                            <TableRow key={room.room_type_id}>
                              <TableCell className="font-medium">{room.room_type}</TableCell>
                              <TableCell className="text-center">{room.total}</TableCell>
                              <TableCell className="text-center text-blue-600">{room.occupied}</TableCell>
                              <TableCell className="text-center text-green-600">{room.vacant}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant={room.rate >= 80 ? 'default' : 'secondary'}>
                                  {room.rate}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(room.revenue)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              Không có dữ liệu
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Revenue - NEW */}
        <TabsContent value="revenue" className="space-y-6">
          {/* Revenue Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2 bg-green-50">
                    <DollarSign className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tổng doanh thu</p>
                    {isLoading ? <Skeleton className="h-8 w-24" /> : (
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(occupancyStats.total_revenue)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2 bg-blue-50">
                    <BarChart3 className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Số đêm bán</p>
                    {isLoading ? <Skeleton className="h-8 w-16" /> : (
                      <p className="text-2xl font-bold">{occupancyStats.total_room_nights}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2 bg-purple-50">
                    <TrendingUp className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">TB/phòng</p>
                    {isLoading ? <Skeleton className="h-8 w-20" /> : (
                      <p className="text-2xl font-bold">
                        {formatCurrency(occupancyStats.avg_revenue_per_room)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-2 bg-orange-50">
                    <Users className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Số booking</p>
                    {isLoading ? <Skeleton className="h-8 w-16" /> : (
                      <p className="text-2xl font-bold">{occupancyStats.total_bookings}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue by Room Type Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Doanh thu theo loại phòng</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[350px] w-full" />
              ) : utilizationChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={utilizationChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="type" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis 
                      tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`} 
                      tick={{ fill: 'hsl(var(--muted-foreground))' }} 
                    />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="revenue" name="Doanh thu" fill="#10b981" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                  Không có dữ liệu doanh thu
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Profitable Rooms Table */}
          <Card>
            <CardHeader>
              <CardTitle>Top phòng sinh lợi</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : (
                <div className="rounded-md border">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Phòng</TableHead>
                          <TableHead>Loại</TableHead>
                          <TableHead className="text-center">Số booking</TableHead>
                          <TableHead className="text-center">Ngày sử dụng</TableHead>
                          <TableHead className="text-right">Doanh thu</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data?.revenueByRoom && data.revenueByRoom.length > 0 ? (
                          data.revenueByRoom.map((room, index) => (
                            <TableRow key={room.room_id}>
                              <TableCell className="font-bold">
                                <div className="flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                                    {index + 1}
                                  </span>
                                  {room.room_number}
                                </div>
                              </TableCell>
                              <TableCell>{room.room_type || '-'}</TableCell>
                              <TableCell className="text-center">{room.total_bookings}</TableCell>
                              <TableCell className="text-center">{room.occupancy_days}</TableCell>
                              <TableCell className="text-right font-bold text-green-600">
                                {formatCurrency(room.total_revenue)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              Không có dữ liệu doanh thu
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* TAB 4: Deficiency */}
        <TabsContent value="deficiency" className="space-y-6">
          {/* Damage Statistics */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Tổng giá trị thiệt hại</p>
                {isLoading ? <Skeleton className="h-8 w-24" /> : (
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(
                      data?.topIssues?.reduce((sum, i) => sum + (i.total_value || 0), 0) || 0
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Số phòng có vấn đề</p>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold text-orange-600">
                    {data?.deficiencies?.length || 0}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Tổng số vấn đề</p>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-2xl font-bold">
                    {data?.deficiencies?.reduce((sum, d) => sum + d.total_issues, 0) || 0}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Phòng thiếu/hỏng đồ dùng</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <div className="rounded-md border">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Phòng</TableHead>
                          <TableHead>Loại</TableHead>
                          <TableHead className="text-center">Thiếu</TableHead>
                          <TableHead className="text-center">Hỏng</TableHead>
                          <TableHead className="text-center">Mất</TableHead>
                          <TableHead className="text-center">Tổng</TableHead>
                          <TableHead>Kiểm tra gần nhất</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data?.deficiencies && data.deficiencies.length > 0 ? (
                          data.deficiencies.map((room) => (
                            <TableRow key={room.room_id}>
                              <TableCell className="font-bold">{room.room_number}</TableCell>
                              <TableCell>{room.room_type || '-'}</TableCell>
                              <TableCell className="text-center">
                                {room.missing_count > 0 && (
                                  <Badge variant="secondary">{room.missing_count}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {room.damaged_count > 0 && (
                                  <Badge variant="outline" className="border-orange-500 text-orange-600">
                                    {room.damaged_count}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {room.lost_count > 0 && (
                                  <Badge variant="destructive">{room.lost_count}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center font-bold">
                                {room.total_issues}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {room.last_check_date ? format(new Date(room.last_check_date), 'dd/MM/yyyy') : '-'}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              Không có phòng nào thiếu/hỏng đồ dùng
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Affected Items */}
          <Card>
            <CardHeader>
              <CardTitle>Items bị ảnh hưởng nhiều nhất</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <div className="rounded-md border">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tên item</TableHead>
                          <TableHead>Loại vấn đề</TableHead>
                          <TableHead className="text-center">Số lần</TableHead>
                          <TableHead className="text-right">Đơn giá</TableHead>
                          <TableHead className="text-right">Tổng thiệt hại</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data?.topIssues && data.topIssues.length > 0 ? (
                          data.topIssues.map((issue, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{issue.item_name || 'Không xác định'}</TableCell>
                              <TableCell>
                                <Badge variant={
                                  issue.issue_type === 'lost' ? 'destructive' :
                                  issue.issue_type === 'damaged' ? 'outline' : 'secondary'
                                }>
                                  {issue.issue_type === 'missing' ? 'Thiếu' :
                                   issue.issue_type === 'damaged' ? 'Hỏng' : 'Mất'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center font-bold">{issue.count}</TableCell>
                              <TableCell className="text-right">{formatCurrency(issue.unit_price)}</TableCell>
                              <TableCell className="text-right font-bold text-red-600">
                                {formatCurrency(issue.total_value)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              Không có dữ liệu
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* TAB 5: Checks */}
        <TabsContent value="checks" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Tổng kiểm tra</p>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-3xl font-bold">{checkStats.total_checks}</p>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Điểm TB</p>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-3xl font-bold text-green-600">{checkStats.avg_score}</p>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Vấn đề phát hiện</p>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <p className="text-3xl font-bold text-orange-600">{checkStats.issues_found}</p>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Check theo loại</p>
                {isLoading ? <Skeleton className="h-8 w-full" /> : (
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline">Daily: {checkStats.daily_checks}</Badge>
                    <Badge variant="outline">C/O: {checkStats.checkout_checks}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Checks by Type Chart */}
          {data?.checksByType && data.checksByType.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Số lần kiểm tra theo tuần</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.checksByType}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="week_start" 
                      tickFormatter={(value) => format(new Date(value), 'dd/MM')}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      labelFormatter={(value) => `Tuần ${format(new Date(value), 'dd/MM/yyyy')}`}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="daily" name="Daily" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="checkout" name="Checkout" stroke="#f59e0b" strokeWidth={2} />
                    <Line type="monotone" dataKey="checkin" name="Checkin" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Staff Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle>Hiệu suất nhân viên kiểm tra</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <div className="rounded-md border">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nhân viên</TableHead>
                          <TableHead className="text-center">Số lần kiểm tra</TableHead>
                          <TableHead className="text-center">Điểm TB</TableHead>
                          <TableHead className="text-center">Vấn đề phát hiện</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data?.staffPerformance && data.staffPerformance.length > 0 ? (
                          data.staffPerformance.map((staff) => (
                            <TableRow key={staff.user_id}>
                              <TableCell className="font-medium">{staff.user_name || 'Không xác định'}</TableCell>
                              <TableCell className="text-center">{staff.checks_count}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant={staff.avg_score >= 80 ? 'default' : 'secondary'}>
                                  {staff.avg_score}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">{staff.issues_found}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                              Không có dữ liệu hiệu suất
                            </TableCell>
                          </TableRow>
                        )}
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
