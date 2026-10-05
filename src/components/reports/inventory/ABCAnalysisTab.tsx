import { TrendingUp, AlertCircle, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useABCAnalysis } from '@/hooks/useReports'
import { formatCurrency } from '@/lib/utils'

const classConfig = {
  A: {
    color: 'bg-red-100 text-red-800',
    icon: AlertCircle,
    description: '70% giá trị - Quan trọng nhất',
  },
  B: {
    color: 'bg-yellow-100 text-yellow-800',
    icon: TrendingUp,
    description: '20% giá trị - Quan trọng trung bình',
  },
  C: {
    color: 'bg-green-100 text-green-800',
    icon: CheckCircle,
    description: '10% giá trị - Ít quan trọng',
  },
}

export function ABCAnalysisTab() {
  const { data: items, isLoading } = useABCAnalysis()
  
  if (isLoading) {
    return <div>Loading...</div>
  }
  
  if (!items || items.length === 0) {
    return <div>Không có dữ liệu</div>
  }
  
  const classA = items.filter(i => i.abc_class === 'A')
  const classB = items.filter(i => i.abc_class === 'B')
  const classC = items.filter(i => i.abc_class === 'C')
  
  // Prepare Pareto chart data
  const paretoData = items.slice(0, 20).map(item => ({
    name: item.item_code,
    value: item.total_value,
    cumulative: item.cumulative_percentage,
  }))
  
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-red-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-red-600">Class A</CardTitle>
              <Badge className={classConfig.A.color}>{classA.length} items</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              {classConfig.A.description}
            </p>
            <p className="text-2xl font-bold">
              {formatCurrency(
                classA.reduce((sum, item) => sum + item.total_value, 0)
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ~{Math.round((classA.length / items.length) * 100)}% số items
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-yellow-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-yellow-600">Class B</CardTitle>
              <Badge className={classConfig.B.color}>{classB.length} items</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              {classConfig.B.description}
            </p>
            <p className="text-2xl font-bold">
              {formatCurrency(
                classB.reduce((sum, item) => sum + item.total_value, 0)
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ~{Math.round((classB.length / items.length) * 100)}% số items
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-green-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-green-600">Class C</CardTitle>
              <Badge className={classConfig.C.color}>{classC.length} items</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              {classConfig.C.description}
            </p>
            <p className="text-2xl font-bold">
              {formatCurrency(
                classC.reduce((sum, item) => sum + item.total_value, 0)
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ~{Math.round((classC.length / items.length) * 100)}% số items
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Pareto Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Biểu đồ Pareto (Top 20 items)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={paretoData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={100}
                className="text-xs"
              />
              <YAxis 
                yAxisId="left"
                className="text-xs"
                tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                domain={[0, 100]}
                className="text-xs"
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === 'cumulative') return [`${value.toFixed(1)}%`, 'Tích lũy']
                  return [formatCurrency(value), 'Giá trị']
                }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="value" name="Giá trị" fill="#3b82f6" />
              <Line 
                yAxisId="right" 
                type="monotone" 
                dataKey="cumulative" 
                name="Tích lũy (%)" 
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      {/* Class A Items */}
      <Card className="border-red-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <CardTitle className="text-red-600">Class A Items ({classA.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4 border-red-200 bg-red-50">
            <AlertDescription>
              <strong>📌 ĐỀ XUẤT CHO CLASS A:</strong>
              <ul className="mt-2 space-y-1 text-sm">
                <li>• Kiểm kê mỗi tuần</li>
                <li>• Đặt mức tồn kho an toàn cao</li>
                <li>• Theo dõi sát sao nhập/xuất</li>
                <li>• Có dự phòng từ nhiều nhà cung cấp</li>
              </ul>
            </AlertDescription>
          </Alert>
          
          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Đồ dùng</TableHead>
                    <TableHead>Danh mục</TableHead>
                    <TableHead className="text-right">Giá trị</TableHead>
                    <TableHead className="text-right">% Giá trị</TableHead>
                    <TableHead className="text-right">% Tích lũy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classA.map((item) => (
                    <TableRow key={item.item_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.item_name}</p>
                          <p className="text-xs text-muted-foreground">{item.item_code}</p>
                        </div>
                      </TableCell>
                      <TableCell>{item.category_name}</TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(item.total_value)}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.percentage.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {item.cumulative_percentage.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Class B & C - Similar structure but collapsible */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-yellow-200">
          <CardHeader>
            <CardTitle className="text-yellow-600">Class B Items ({classB.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Kiểm kê 2 tuần/lần, giám sát định kỳ
            </p>
            <p className="text-lg font-bold">
              {formatCurrency(classB.reduce((sum, i) => sum + i.total_value, 0))}
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="text-green-600">Class C Items ({classC.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Kiểm kê hàng tháng, quản lý đơn giản
            </p>
            <p className="text-lg font-bold">
              {formatCurrency(classC.reduce((sum, i) => sum + i.total_value, 0))}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
