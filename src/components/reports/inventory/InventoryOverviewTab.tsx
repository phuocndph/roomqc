import { Package, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import type { InventoryReportData } from '@/types/reports.types'

interface InventoryOverviewTabProps {
  data?: InventoryReportData
  isLoading: boolean
  chartRefs: React.MutableRefObject<HTMLElement[]>
}

export function InventoryOverviewTab({ data, isLoading, chartRefs }: InventoryOverviewTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }
  
  if (!data) return null
  
  const { summary, by_category, top_items_by_value, stock_status_distribution } = data
  
  // Prepare chart data
  const categoryChartData = by_category.map(cat => ({
    name: cat.category_name,
    value: cat.total_value,
    percentage: cat.percentage,
  }))
  
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
  
  const statusChartData = [
    { name: 'Trong kho', value: stock_status_distribution.in_stock },
    { name: 'Đang dùng', value: stock_status_distribution.in_use },
    { name: 'Đang giặt', value: stock_status_distribution.in_laundry },
    { name: 'Hư hỏng', value: stock_status_distribution.damaged },
    { name: 'Mất', value: stock_status_distribution.lost },
  ].filter(item => item.value > 0)
  
  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <Package className="h-8 w-8 text-blue-600" />
            </div>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">Tổng giá trị kho</p>
              <p className="text-2xl font-bold">{formatCurrency(summary.total_value)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.total_types} loại sản phẩm
              </p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <Activity className="h-8 w-8 text-green-600" />
            </div>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">Tổng items</p>
              <p className="text-2xl font-bold">{summary.total_items.toLocaleString('vi-VN')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Trong {summary.total_types} loại
              </p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">Tỷ lệ sử dụng</p>
              <p className="text-2xl font-bold">{summary.utilization_rate}%</p>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-600 transition-all"
                  style={{ width: `${summary.utilization_rate}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <TrendingDown className="h-8 w-8 text-orange-600" />
            </div>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">Tồn kho TB</p>
              <p className="text-2xl font-bold">{summary.avg_days_in_stock} ngày</p>
              <p className="text-xs text-muted-foreground mt-1">
                Thời gian lưu kho
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Inventory Composition */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Horizontal Bar Chart */}
        <Card ref={(el) => el && (chartRefs.current[0] = el)}>
          <CardHeader>
            <CardTitle>Phân bổ theo danh mục (Giá trị)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(300, categoryChartData.length * 40)}>
              <BarChart data={categoryChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis 
                  type="number" 
                  className="text-xs"
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={100}
                  className="text-xs"
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={(label) => label}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar 
                  dataKey="value" 
                  name="Giá trị"
                  radius={[0, 4, 4, 0]}
                >
                  {categoryChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        {/* Category Table */}
        <Card>
          <CardHeader>
            <CardTitle>Chi tiết theo danh mục</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Danh mục</TableHead>
                      <TableHead className="text-center">Loại</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-right">Giá trị</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {by_category.map((cat) => (
                      <TableRow key={cat.category_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: cat.category_color }}
                            />
                            <span className="font-medium">{cat.category_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{cat.item_count}</TableCell>
                        <TableCell className="text-center">{cat.total_stock}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(cat.total_value)}
                        </TableCell>
                        <TableCell className="text-right">{cat.percentage}%</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell>TỔNG</TableCell>
                      <TableCell className="text-center">{summary.total_types}</TableCell>
                      <TableCell className="text-center">{summary.total_items}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(summary.total_value)}
                      </TableCell>
                      <TableCell className="text-right">100%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Stock Status Distribution */}
      <Card ref={(el) => el && (chartRefs.current[1] = el)}>
        <CardHeader>
          <CardTitle>Phân bổ trạng thái tồn kho</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={by_category} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" className="text-xs" />
              <YAxis 
                dataKey="category_name" 
                type="category" 
                width={100}
                className="text-xs"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey="total_stock" name="Trong kho" stackId="a" fill="#10b981" />
              <Bar dataKey="in_use" name="Đang dùng" stackId="a" fill="#3b82f6" />
              <Bar dataKey="in_laundry" name="Đang giặt" stackId="a" fill="#06b6d4" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      {/* Top 10 Items by Value */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Items theo giá trị</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Đồ dùng</TableHead>
                    <TableHead>Danh mục</TableHead>
                    <TableHead className="text-center">Tồn kho</TableHead>
                    <TableHead className="text-right">Đơn giá</TableHead>
                    <TableHead className="text-right">Tổng giá trị</TableHead>
                    <TableHead className="text-right">% Tổng kho</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top_items_by_value.map((item, index) => (
                    <TableRow key={item.item_id}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.item_name}</p>
                          <p className="text-xs text-muted-foreground">{item.item_code}</p>
                        </div>
                      </TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(item.total_value)}
                      </TableCell>
                      <TableCell className="text-right">{item.percentage}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
