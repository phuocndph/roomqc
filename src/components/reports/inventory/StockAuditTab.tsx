import { useNavigate } from 'react-router-dom'
import { ClipboardCheck, TrendingDown, AlertTriangle, Scale } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStockAuditReport } from '@/hooks/useStockAuditReport'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'

interface StockAuditTabProps {
  dateRange: { start: Date; end: Date }
}

export function StockAuditTab({ dateRange }: StockAuditTabProps) {
  const navigate = useNavigate()
  const { t } = useTranslation('reports')
  const { data: reportData, isLoading } = useStockAuditReport(dateRange)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="outline" className="text-green-600 border-green-200">Đã duyệt</Badge>
      case 'completed':
        return <Badge variant="outline" className="text-blue-600 border-blue-200">Hoàn thành</Badge>
      case 'in_progress':
        return <Badge variant="outline" className="text-amber-600 border-amber-200">Đang kiểm</Badge>
      case 'draft':
        return <Badge variant="outline" className="text-gray-600 border-gray-200">Nháp</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const pieColors = ['#22c55e', '#ef4444']

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('stockAudit.stats.totalAudits')}</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold">{reportData?.summary?.total_audits || 0}</div>
          )}
          <div className="text-xs text-muted-foreground mt-1">
            {reportData?.summary?.total_items_checked || 0} items đã kiểm
          </div>
        </div>
        
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('stockAudit.stats.accuracyRate')}</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className={`text-2xl font-bold ${
              (reportData?.summary?.accuracy_rate || 0) >= 95 ? 'text-green-600' :
              (reportData?.summary?.accuracy_rate || 0) >= 80 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {reportData?.summary?.accuracy_rate || 0}%
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-1">
            {reportData?.summary?.match_count || 0} khớp / {reportData?.summary?.discrepancy_count || 0} lệch
          </div>
        </div>
        
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('stockAudit.stats.discrepancyValue')}</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(reportData?.summary?.total_discrepancy_value || 0)}
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-1">
            Thiếu: {reportData?.summary?.total_shortage_qty || 0} | Thừa: {reportData?.summary?.total_excess_qty || 0}
          </div>
        </div>
        
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('stockAudit.stats.investigation')}</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className="text-2xl font-bold">
              {reportData?.investigation_summary?.total_investigations || 0}
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-1">
            {reportData?.investigation_summary?.resolved_count || 0} đã xử lý
          </div>
        </div>
      </div>
      
      {/* Report Content */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">{t('stockAudit.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="audits">{t('stockAudit.tabs.audits')}</TabsTrigger>
          <TabsTrigger value="discrepancy">{t('stockAudit.tabs.discrepancy')}</TabsTrigger>
          <TabsTrigger value="investigation">{t('stockAudit.tabs.investigation')}</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Accuracy Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{t('stockAudit.charts.accuracyDistribution')}</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[200px]" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Khớp', value: reportData?.summary?.match_count || 0 },
                          { name: 'Lệch', value: reportData?.summary?.discrepancy_count || 0 },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieColors.map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            
            {/* Monthly Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{t('stockAudit.charts.monthlyTrend')}</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[200px]" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={reportData?.monthly_trend || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="audits" stroke="#3b82f6" name="Phiếu kiểm" />
                      <Line type="monotone" dataKey="accuracy_rate" stroke="#22c55e" name="Tỷ lệ khớp %" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Discrepancy by Category */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('stockAudit.charts.discrepancyByCategory')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px]" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={reportData?.discrepancy_by_category || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="category_name" tick={{ fontSize: 12 }} width={120} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="shortage_qty" fill="#ef4444" name="Thiếu" stackId="a" />
                    <Bar dataKey="excess_qty" fill="#22c55e" name="Thừa" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="audits">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('stockAudit.tables.auditsList')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium">Mã phiếu</th>
                        <th className="text-left py-2 px-2 font-medium">Loại</th>
                        <th className="text-left py-2 px-2 font-medium">Trạng thái</th>
                        <th className="text-left py-2 px-2 font-medium">Ngày</th>
                        <th className="text-left py-2 px-2 font-medium">Người tạo</th>
                        <th className="text-right py-2 px-2 font-medium">Items</th>
                        <th className="text-right py-2 px-2 font-medium">Khớp</th>
                        <th className="text-right py-2 px-2 font-medium">Lệch</th>
                        <th className="text-right py-2 px-2 font-medium">Giá trị</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData?.audits_list?.map((audit) => (
                        <tr key={audit.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/inventory/adjustments/${audit.id}`)}>
                          <td className="py-2 px-2 font-mono text-xs">{audit.adjustment_code}</td>
                          <td className="py-2 px-2 capitalize">{audit.adjustment_type}</td>
                          <td className="py-2 px-2">{getStatusBadge(audit.status)}</td>
                          <td className="py-2 px-2">{format(new Date(audit.scheduled_date), 'dd/MM/yyyy', { locale: vi })}</td>
                          <td className="py-2 px-2">{audit.created_by_name}</td>
                          <td className="py-2 px-2 text-right">{audit.items_count}</td>
                          <td className="py-2 px-2 text-right text-green-600">{audit.match_count}</td>
                          <td className="py-2 px-2 text-right text-red-600">{audit.discrepancy_count}</td>
                          <td className="py-2 px-2 text-right font-medium">{formatCurrency(audit.adjustment_value)}</td>
                        </tr>
                      ))}
                      {(!reportData?.audits_list || reportData.audits_list.length === 0) && (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-muted-foreground">
                            Không có dữ liệu kiểm kê trong kỳ này
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="discrepancy">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{t('stockAudit.tables.discrepancyByCategory')}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium">Danh mục</th>
                        <th className="text-right py-2 px-2 font-medium">Số lần kiểm</th>
                        <th className="text-right py-2 px-2 font-medium">Thiếu</th>
                        <th className="text-right py-2 px-2 font-medium">Thừa</th>
                        <th className="text-right py-2 px-2 font-medium">Giá trị điều chỉnh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData?.discrepancy_by_category?.map((cat) => (
                        <tr key={cat.category_id} className="border-b">
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: cat.category_color }}
                              />
                              {cat.category_name}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right">{cat.audit_count}</td>
                          <td className="py-2 px-2 text-right text-red-600">-{cat.shortage_qty}</td>
                          <td className="py-2 px-2 text-right text-green-600">+{cat.excess_qty}</td>
                          <td className="py-2 px-2 text-right font-medium">{formatCurrency(cat.adjustment_value)}</td>
                        </tr>
                      ))}
                      {(!reportData?.discrepancy_by_category || reportData.discrepancy_by_category.length === 0) && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-muted-foreground">
                            Không có chênh lệch trong kỳ này
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="investigation">
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <div className="border rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">Tổng điều tra</div>
              <div className="text-xl font-bold">{reportData?.investigation_summary?.total_investigations || 0}</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">Đã xử lý</div>
              <div className="text-xl font-bold text-green-600">{reportData?.investigation_summary?.resolved_count || 0}</div>
            </div>
            <div className="border rounded-lg p-4">
              <div className="text-xs text-muted-foreground mb-1">Chờ xử lý</div>
              <div className="text-xl font-bold text-amber-600">{reportData?.investigation_summary?.pending_count || 0}</div>
            </div>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Bồi thường</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Tổng giá trị bồi thường</span>
                    <span className="font-medium">{formatCurrency(reportData?.investigation_summary?.compensation_total || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Đã thu hồi</span>
                    <span className="font-medium text-green-600">{formatCurrency(reportData?.investigation_summary?.compensation_collected || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Chưa thu hồi</span>
                    <span className="font-medium text-red-600">
                      {formatCurrency((reportData?.investigation_summary?.compensation_total || 0) - (reportData?.investigation_summary?.compensation_collected || 0))}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Tiến độ thu hồi</CardTitle>
              </CardHeader>
              <CardContent>
                {(reportData?.investigation_summary?.compensation_total || 0) > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Đã thu hồi</span>
                      <span>
                        {Math.round(((reportData?.investigation_summary?.compensation_collected || 0) / (reportData?.investigation_summary?.compensation_total || 1)) * 100)}%
                      </span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ 
                          width: `${((reportData?.investigation_summary?.compensation_collected || 0) / (reportData?.investigation_summary?.compensation_total || 1)) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    Không có bồi thường trong kỳ này
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
