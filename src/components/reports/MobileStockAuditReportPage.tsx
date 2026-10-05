import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, ClipboardCheck, Scale, TrendingDown, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigateBack } from '@/lib/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useStockAuditReport } from '@/hooks/useStockAuditReport'
import { subDays, format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'

export function MobileStockAuditReportPage() {
  const navigate = useNavigate()
  const { t } = useTranslation('reports')
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date(),
  })
  
  const { data: reportData, isLoading } = useStockAuditReport(dateRange)

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="outline" className="text-green-600 border-green-200 text-xs">Đã duyệt</Badge>
      case 'completed':
        return <Badge variant="outline" className="text-blue-600 border-blue-200 text-xs">Hoàn thành</Badge>
      case 'in_progress':
        return <Badge variant="outline" className="text-amber-600 border-amber-200 text-xs">Đang kiểm</Badge>
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/reports')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-semibold">{t('stockAudit.pageTitle')}</h1>
          </div>
          <Button variant="ghost" size="icon" aria-label="Tải xuống">
            <Download className="h-5 w-5" />
          </Button>
        </div>
        
        {/* Date Range */}
        <div className="mt-3">
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

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1 mb-1">
            <ClipboardCheck className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Tổng kiểm kê</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <div className="text-lg font-bold">{reportData?.summary?.total_audits || 0}</div>
          )}
        </div>
        
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1 mb-1">
            <Scale className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Tỷ lệ khớp</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <div className={`text-lg font-bold ${
              (reportData?.summary?.accuracy_rate || 0) >= 95 ? 'text-green-600' :
              (reportData?.summary?.accuracy_rate || 0) >= 80 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {reportData?.summary?.accuracy_rate || 0}%
            </div>
          )}
        </div>
        
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1 mb-1">
            <TrendingDown className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Giá trị lệch</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-6 w-16" />
          ) : (
            <div className="text-lg font-bold text-red-600">
              {formatCurrency(reportData?.summary?.total_discrepancy_value || 0)}
            </div>
          )}
        </div>
        
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1 mb-1">
            <AlertTriangle className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Điều tra</span>
          </div>
          {isLoading ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <div className="text-lg font-bold">{reportData?.investigation_summary?.total_investigations || 0}</div>
          )}
        </div>
      </div>

      {/* Tabs Content */}
      <Tabs defaultValue="audits" className="px-3 pb-20">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="audits" className="text-xs">Phiếu</TabsTrigger>
          <TabsTrigger value="discrepancy" className="text-xs">Chênh lệch</TabsTrigger>
          <TabsTrigger value="investigation" className="text-xs">Điều tra</TabsTrigger>
        </TabsList>
        
        <TabsContent value="audits" className="mt-3 space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : reportData?.audits_list?.length ? (
            reportData.audits_list.map((audit) => (
              <div 
                key={audit.id} 
                className="border rounded-lg p-3"
                onClick={() => navigate(`/inventory/adjustments/${audit.id}`)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-mono text-xs">{audit.adjustment_code}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(audit.scheduled_date), 'dd/MM/yyyy', { locale: vi })}
                    </div>
                  </div>
                  {getStatusBadge(audit.status)}
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Items:</span>
                    <span className="ml-1 font-medium">{audit.items_count}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Khớp:</span>
                    <span className="ml-1 font-medium text-green-600">{audit.match_count}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Lệch:</span>
                    <span className="ml-1 font-medium text-red-600">{audit.discrepancy_count}</span>
                  </div>
                </div>
                {audit.adjustment_value > 0 && (
                  <div className="mt-2 text-right text-xs font-medium">
                    {formatCurrency(audit.adjustment_value)}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Không có dữ liệu kiểm kê
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="discrepancy" className="mt-3 space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : reportData?.discrepancy_by_category?.length ? (
            reportData.discrepancy_by_category.map((cat) => (
              <div key={cat.category_id} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: cat.category_color }}
                  />
                  <span className="font-medium text-sm">{cat.category_name}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Thiếu:</span>
                    <span className="ml-1 font-medium text-red-600">-{cat.shortage_qty}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Thừa:</span>
                    <span className="ml-1 font-medium text-green-600">+{cat.excess_qty}</span>
                  </div>
                  <div className="text-right font-medium">
                    {formatCurrency(cat.adjustment_value)}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Không có chênh lệch
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="investigation" className="mt-3">
          <div className="space-y-3">
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Tổng điều tra</div>
              <div className="text-xl font-bold">{reportData?.investigation_summary?.total_investigations || 0}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {reportData?.investigation_summary?.resolved_count || 0} đã xử lý • {reportData?.investigation_summary?.pending_count || 0} chờ xử lý
              </div>
            </div>
            
            <div className="border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-2">Bồi thường</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tổng:</span>
                  <span className="font-medium">{formatCurrency(reportData?.investigation_summary?.compensation_total || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Đã thu:</span>
                  <span className="font-medium text-green-600">{formatCurrency(reportData?.investigation_summary?.compensation_collected || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Chưa thu:</span>
                  <span className="font-medium text-red-600">
                    {formatCurrency((reportData?.investigation_summary?.compensation_total || 0) - (reportData?.investigation_summary?.compensation_collected || 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
