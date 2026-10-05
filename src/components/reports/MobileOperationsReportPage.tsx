import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, TrendingUp, TrendingDown, Package, ClipboardCheck, Clock, CheckCircle, AlertTriangle, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigateBack } from '@/lib/navigation'
import { PullToRefresh } from '@/components/mobile/TouchOptimized'
import { useOperationsReport } from '@/hooks/useOperationsReport'
import { formatCurrency } from '@/lib/utils'
import { subDays, format } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const MobileOperationsReportPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date(),
  })

  const { data, isLoading } = useOperationsReport(dateRange)

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['operations-report'] })
  }

  const txSummary = data?.transactions

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-background pb-20">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateBack(navigate, '/reports')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-sm font-semibold">Báo cáo vận hành</h1>
                <p className="text-[10px] text-muted-foreground">
                  {format(dateRange.start, 'dd/MM')} - {format(dateRange.end, 'dd/MM/yyyy')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-3 space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="p-3 space-y-3">
            <Tabs defaultValue="transactions">
              <TabsList className="w-full h-8">
                <TabsTrigger value="transactions" className="text-xs flex-1">Giao dịch</TabsTrigger>
                <TabsTrigger value="stocktake" className="text-xs flex-1">Kiểm kê</TabsTrigger>
                <TabsTrigger value="efficiency" className="text-xs flex-1">Hiệu suất</TabsTrigger>
              </TabsList>

              {/* Transactions Tab */}
              <TabsContent value="transactions" className="space-y-3 mt-3">
                {/* Summary Grid */}
                <div className="border rounded-lg p-3">
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">Tổng quan giao dịch</h3>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="flex items-center justify-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-lg font-bold">{txSummary?.inbound_count || 0}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Nhập kho</p>
                    </div>
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="flex items-center justify-center gap-1">
                        <TrendingDown className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-lg font-bold">{txSummary?.outbound_count || 0}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Xuất kho</p>
                    </div>
                    <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <div className="flex items-center justify-center gap-1">
                        <Package className="h-3.5 w-3.5 text-amber-600" />
                        <span className="text-lg font-bold">{txSummary?.adjustment_count || 0}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Điều chỉnh</p>
                    </div>
                  </div>
                </div>

                {/* Value Summary */}
                <div className="border rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Giá trị nhập</p>
                      <p className="text-sm font-bold text-green-600">{formatCurrency(txSummary?.inbound_value || 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Giá trị xuất</p>
                      <p className="text-sm font-bold text-blue-600">{formatCurrency(txSummary?.outbound_value || 0)}</p>
                    </div>
                  </div>
                </div>

                {/* Top Items */}
                {data?.topMovingItems && data.topMovingItems.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b bg-muted/30">
                      <h3 className="text-xs font-medium">Top giao dịch nhiều nhất</h3>
                    </div>
                    <div className="divide-y">
                      {data.topMovingItems.slice(0, 5).map((item, index) => (
                        <div key={item.item_id} className="flex items-center gap-2.5 px-3 py-2">
                          <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.item_name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{item.item_code}</p>
                          </div>
                          <div className="flex gap-2.5 text-xs font-medium">
                            <span className="text-green-600">+{item.inbound}</span>
                            <span className="text-blue-600">-{item.outbound}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Stocktake Tab */}
              <TabsContent value="stocktake" className="space-y-3 mt-3">
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2">
                    <ClipboardCheck className="h-3.5 w-3.5 text-blue-600" />
                    <h3 className="text-xs font-medium">Kết quả kiểm kê</h3>
                  </div>
                  <div className="divide-y">
                    <div className="flex justify-between items-center px-3 py-2">
                      <span className="text-xs text-muted-foreground">Tổng lần kiểm kê</span>
                      <span className="text-sm font-semibold">{data?.stocktake?.total_checks || 0}</span>
                    </div>
                    <div className="flex justify-between items-center px-3 py-2">
                      <span className="text-xs text-muted-foreground">Tổng mặt hàng kiểm</span>
                      <span className="text-sm font-semibold">{data?.stocktake?.items_checked || 0}</span>
                    </div>
                    <div className="flex justify-between items-center px-3 py-2">
                      <span className="text-xs text-muted-foreground">Độ chính xác</span>
                      <span className={`text-sm font-semibold ${(data?.stocktake?.accuracy_rate || 0) >= 90 ? 'text-green-600' : 'text-amber-600'}`}>
                        {data?.stocktake?.accuracy_rate || 0}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center px-3 py-2">
                      <span className="text-xs text-muted-foreground">Giá trị điều chỉnh</span>
                      <span className="text-sm font-semibold">{formatCurrency(data?.stocktake?.total_adjusted_value || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Recent stocktakes */}
                {data?.stocktake?.recent && data.stocktake.recent.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b bg-muted/30">
                      <h3 className="text-xs font-medium">Kiểm kê gần đây</h3>
                    </div>
                    <div className="divide-y">
                      {data.stocktake.recent.map(adj => (
                        <div key={adj.id} className="px-3 py-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-mono font-medium">{adj.adjustment_code}</span>
                            <Badge variant={adj.status === 'completed' ? 'default' : 'secondary'} className="text-[10px] h-5">
                              {adj.status === 'completed' ? 'Hoàn thành' : adj.status}
                            </Badge>
                          </div>
                          <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                            <span>{format(new Date(adj.created_at), 'dd/MM/yyyy')}</span>
                            <span className="text-green-600">Khớp: {adj.matched}</span>
                            <span className="text-blue-600">Thừa: {adj.over}</span>
                            <span className="text-red-600">Thiếu: {adj.short}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Efficiency Tab */}
              <TabsContent value="efficiency" className="space-y-3 mt-3">
                <div className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-purple-600" />
                    <h3 className="text-xs font-medium">Hiệu suất vận hành</h3>
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-600" />
                          Độ chính xác kiểm kê
                        </span>
                        <span className="font-semibold text-green-600">{data?.efficiency?.accuracy_rate || 0}%</span>
                      </div>
                      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div className="bg-green-500 h-full rounded-full" style={{ width: `${data?.efficiency?.accuracy_rate || 0}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                          Tỷ lệ điều chỉnh
                        </span>
                        <span className="font-semibold text-amber-600">{data?.efficiency?.adjustment_rate || 0}%</span>
                      </div>
                      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div className="bg-amber-500 h-full rounded-full" style={{ width: `${data?.efficiency?.adjustment_rate || 0}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center p-2 bg-muted/30 rounded">
                      <p className="text-lg font-bold">{data?.efficiency?.avg_transactions_per_day || 0}</p>
                      <p className="text-[10px] text-muted-foreground">GD trung bình/ngày</p>
                    </div>
                    <div className="text-center p-2 bg-muted/30 rounded">
                      <p className="text-sm font-bold">{data?.efficiency?.busiest_day || '-'}</p>
                      <p className="text-[10px] text-muted-foreground">Ngày cao điểm</p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </PullToRefresh>
  )
}
