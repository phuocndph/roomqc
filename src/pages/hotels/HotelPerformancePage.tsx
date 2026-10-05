import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, TrendingUp, TrendingDown, Package, Wrench, Wind, ShoppingCart, DollarSign, Target, Award } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useHotelPerformanceStats, useHotelsPerformanceComparison } from '@/hooks/useHotelPerformance'
import { useHotels } from '@/hooks/useHotels'
import { formatCurrency } from '@/lib/utils'
import { navigateBack } from '@/lib/navigation'
import { subDays, subMonths, format, parseISO } from 'date-fns'
import { useRoomsReportData } from '@/hooks/useRoomsReportData'
import {
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'

export default function HotelPerformancePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedHotelId = searchParams.get('hotelId') || ''
  const [selectedHotelId, setSelectedHotelId] = useState<string>(requestedHotelId)
  const [dateRange, setDateRange] = useState({
    start: subMonths(new Date(), 1),
    end: new Date(),
  })

  const { data: hotels } = useHotels({})
  const { data: performanceStats, isLoading: statsLoading } = useHotelPerformanceStats(
    selectedHotelId,
    dateRange
  )
  const { data: comparison, isLoading: comparisonLoading } = useHotelsPerformanceComparison(dateRange)
  const { data: reportData, isLoading: trendLoading } = useRoomsReportData({
    start: subDays(new Date(), 30),
    end: new Date(),
  })

  // Prefer a hotel passed by dashboard deep links, then fall back to the first hotel.
  useEffect(() => {
    if (!hotels || hotels.length === 0) return
    if (requestedHotelId && hotels.some((hotel) => hotel.id === requestedHotelId)) {
      setSelectedHotelId(requestedHotelId)
    } else if (!selectedHotelId || !hotels.some((hotel) => hotel.id === selectedHotelId)) {
      setSelectedHotelId(hotels[0].id)
    }
  }, [hotels, requestedHotelId, selectedHotelId])

  const selectedHotel = hotels?.find((h) => h.id === selectedHotelId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hiệu suất Khách sạn"
        description="Phân tích và so sánh hiệu suất hoạt động"
      >
          <Button variant="outline" onClick={() => navigateBack(navigate, '/hotels')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Quay lại
        </Button>
      </PageHeader>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Chọn khách sạn</label>
              <Select value={selectedHotelId} onValueChange={setSelectedHotelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn khách sạn" />
                </SelectTrigger>
                <SelectContent>
                  {hotels?.map((hotel) => (
                    <SelectItem key={hotel.id} value={hotel.id}>
                      {hotel.name} ({hotel.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Kỳ phân tích</label>
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
        </CardContent>
      </Card>

      {statsLoading || !performanceStats ? (
        <div>Đang tải...</div>
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Tổng quan</TabsTrigger>
            <TabsTrigger value="comparison">So sánh</TabsTrigger>
            <TabsTrigger value="trends">Xu hướng</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            {/* Hotel Info Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{performanceStats.hotel.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Mã: {performanceStats.hotel.code} • {performanceStats.hotel.total_rooms} phòng
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-lg px-4 py-2">
                    {formatCurrency(performanceStats.cost_per_room_per_month)}/phòng/tháng
                  </Badge>
                </div>
              </CardHeader>
            </Card>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      <p className="text-sm text-muted-foreground">Giá trị kho</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {formatCurrency(performanceStats.inventory.value)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={performanceStats.inventory.utilization_rate} className="h-2" />
                    <span className="text-xs text-muted-foreground">
                      {performanceStats.inventory.utilization_rate.toFixed(1)}% sử dụng
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wind className="h-4 w-4 text-blue-500" />
                      <p className="text-sm text-muted-foreground">Giặt là</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {formatCurrency(performanceStats.laundry.cost)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Award className="h-4 w-4 text-yellow-500" />
                    <span className="text-xs text-muted-foreground">
                      Chất lượng: {performanceStats.laundry.avg_quality.toFixed(1)}/5.0
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-orange-500" />
                      <p className="text-sm text-muted-foreground">Bảo trì</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {formatCurrency(performanceStats.maintenance.cost)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Target className="h-4 w-4 text-green-500" />
                    <span className="text-xs text-muted-foreground">
                      {performanceStats.maintenance.completion_rate.toFixed(0)}% hoàn thành
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-green-500" />
                      <p className="text-sm text-muted-foreground">Mua sắm</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold mt-2">
                    {formatCurrency(performanceStats.purchases.value)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {performanceStats.purchases.orders} đơn hàng
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Operating Cost Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Phân bổ Chi phí Vận hành</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Giặt là</span>
                      <span className="text-sm font-bold">
                        {formatCurrency(performanceStats.laundry.cost)} (
                        {((performanceStats.laundry.cost / performanceStats.total_operating_cost) * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <Progress
                      value={(performanceStats.laundry.cost / performanceStats.total_operating_cost) * 100}
                      className="h-2"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Bảo trì</span>
                      <span className="text-sm font-bold">
                        {formatCurrency(performanceStats.maintenance.cost)} (
                        {((performanceStats.maintenance.cost / performanceStats.total_operating_cost) * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <Progress
                      value={(performanceStats.maintenance.cost / performanceStats.total_operating_cost) * 100}
                      className="h-2"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Mua sắm</span>
                      <span className="text-sm font-bold">
                        {formatCurrency(performanceStats.purchases.value)} (
                        {((performanceStats.purchases.value / performanceStats.total_operating_cost) * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <Progress
                      value={(performanceStats.purchases.value / performanceStats.total_operating_cost) * 100}
                      className="h-2"
                    />
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Tổng chi phí vận hành</span>
                      <span className="text-lg font-bold">
                        {formatCurrency(performanceStats.total_operating_cost)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance Metrics Grid */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tồn kho</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Tổng items</span>
                    <span className="font-semibold">{performanceStats.inventory.total_items}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Trong kho</span>
                    <span className="font-semibold">{performanceStats.inventory.in_stock}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Cảnh báo thấp</span>
                    <Badge variant="destructive">{performanceStats.inventory.low_stock_count}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Tỷ lệ sử dụng</span>
                    <Badge variant="secondary">{performanceStats.inventory.utilization_rate.toFixed(1)}%</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Giặt là</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Số lô</span>
                    <span className="font-semibold">{performanceStats.laundry.batches}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Chi phí/phòng</span>
                    <span className="font-semibold">{formatCurrency(performanceStats.laundry.cost_per_room)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Chất lượng TB</span>
                    <Badge variant="secondary">{performanceStats.laundry.avg_quality.toFixed(1)}/5.0</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Đúng giờ TB</span>
                    <Badge variant="secondary">{performanceStats.laundry.avg_timeliness.toFixed(1)}/5.0</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Bảo trì</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Tổng yêu cầu</span>
                    <span className="font-semibold">{performanceStats.maintenance.total_requests}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Hoàn thành</span>
                    <span className="font-semibold">{performanceStats.maintenance.completed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Đang chờ</span>
                    <Badge variant="secondary">{performanceStats.maintenance.pending}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Thời gian TB</span>
                    <Badge variant="secondary">{performanceStats.maintenance.avg_resolution_hours.toFixed(1)}h</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* COMPARISON TAB */}
          <TabsContent value="comparison" className="space-y-6">
            {comparisonLoading || !comparison ? (
              <div>Đang tải...</div>
            ) : (
              <>
                {/* Efficiency Score Comparison */}
                <Card>
                  <CardHeader>
                    <CardTitle>Điểm Hiệu suất So sánh</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={comparison}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="hotel_code"
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          domain={[0, 100]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Bar dataKey="efficiency_score" name="Điểm hiệu suất" fill="hsl(var(--primary))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Cost per Room Comparison */}
                <Card>
                  <CardHeader>
                    <CardTitle>Chi phí/Phòng So sánh</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={comparison} layout="horizontal">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          type="number"
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(value) => formatCurrency(value)}
                        />
                        <YAxis
                          type="category"
                          dataKey="hotel_code"
                          className="text-xs"
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
                        <Bar dataKey="cost_per_room" name="Chi phí/phòng" fill="hsl(var(--chart-2))" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Detailed Comparison Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Bảng So sánh Chi tiết</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Khách sạn</th>
                            <th className="text-right py-2">Điểm HQ</th>
                            <th className="text-right py-2">Giá trị kho</th>
                            <th className="text-right py-2">Tỷ lệ vòng quay</th>
                            <th className="text-right py-2">Chi phí/phòng</th>
                            <th className="text-right py-2">CL Giặt</th>
                            <th className="text-right py-2">TL Bảo trì</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.map((hotel) => (
                            <tr key={hotel.hotel_id} className="border-b">
                              <td className="py-2 font-medium">{hotel.hotel_name}</td>
                              <td className="text-right">
                                <Badge
                                  variant={hotel.efficiency_score >= 70 ? 'default' : 'secondary'}
                                >
                                  {hotel.efficiency_score.toFixed(1)}
                                </Badge>
                              </td>
                              <td className="text-right">{formatCurrency(hotel.inventory_value)}</td>
                              <td className="text-right">{hotel.inventory_turnover_rate.toFixed(1)}%</td>
                              <td className="text-right">{formatCurrency(hotel.cost_per_room)}</td>
                              <td className="text-right">{hotel.laundry_quality.toFixed(1)}/5.0</td>
                              <td className="text-right">{hotel.maintenance_completion_rate.toFixed(0)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* TRENDS TAB */}
          <TabsContent value="trends" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tỷ lệ lấp đầy theo ngày (30 ngày gần nhất)</CardTitle>
              </CardHeader>
              <CardContent>
                {trendLoading ? (
                  <div className="h-[250px] flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : !reportData?.occupancyTrend || reportData.occupancyTrend.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Chưa có dữ liệu</p>
                ) : (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reportData.occupancyTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(d) => format(parseISO(d), 'dd/MM')}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis
                          tickFormatter={(v) => `${v}%`}
                          domain={[0, 100]}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          labelFormatter={(d) => format(parseISO(d as string), 'dd/MM/yyyy')}
                          formatter={(v: number) => [`${v}%`, 'Tỷ lệ lấp đầy']}
                        />
                        <Line
                          type="monotone"
                          dataKey="occupancy_rate"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Doanh thu theo ngày (30 ngày gần nhất)</CardTitle>
              </CardHeader>
              <CardContent>
                {trendLoading ? (
                  <div className="h-[250px] flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : !reportData?.occupancyTrend || reportData.occupancyTrend.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Chưa có dữ liệu</p>
                ) : (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reportData.occupancyTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(d) => format(parseISO(d), 'dd/MM')}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis
                          tickFormatter={(v) =>
                            new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(Number(v))
                          }
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          labelFormatter={(d) => format(parseISO(d as string), 'dd/MM/yyyy')}
                          formatter={(v: number) => [
                            new Intl.NumberFormat('vi-VN', {
                              style: 'currency',
                              currency: 'VND',
                            }).format(v),
                            'Doanh thu',
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
