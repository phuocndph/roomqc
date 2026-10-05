import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { subDays } from 'date-fns'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Package, TrendingUp, AlertCircle, Download, ClipboardCheck, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReportExport } from '@/hooks/useReportExport'
import { useInventoryReport, useABCAnalysis } from '@/hooks/useReports'
import { formatNumber } from '@/lib/utils'

const REPORT_TYPES = [
  { id: 'current', label: 'Tồn kho hiện tại' },
  { id: 'abc', label: 'Phân tích ABC' },
  { id: 'stock-audit', label: 'Kiểm kê' },
]

export const MobileInventoryReportPage = () => {
  const navigate = useNavigate()
  const [reportType, setReportType] = useState('current')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const dateRange = useMemo(() => {
    if (dateFrom && dateTo) {
      return { start: new Date(dateFrom), end: new Date(dateTo) }
    }
    const end = new Date()
    const start = subDays(end, 30)
    return { start, end }
  }, [dateFrom, dateTo])

  const { data: reportData, isLoading: isReportLoading } = useInventoryReport(dateRange)
  const { data: abcData, isLoading: isABCLoading } = useABCAnalysis()

  const abcCounts = useMemo(() => {
    if (!abcData) return { a: 0, b: 0, c: 0, total: 0 }
    const a = abcData.filter(i => i.abc_class === 'A').length
    const b = abcData.filter(i => i.abc_class === 'B').length
    const c = abcData.filter(i => i.abc_class === 'C').length
    return { a, b, c, total: abcData.length }
  }, [abcData])

  const { exportToExcel, isExporting } = useReportExport()

  const handleExport = () => {
    exportToExcel(
      {
        title: 'Báo cáo tồn kho',
        dateRange: dateFrom && dateTo ? `${dateFrom} - ${dateTo}` : 'Tất cả thời gian',
        summary: {
          report_type: REPORT_TYPES.find(t => t.id === reportType)?.label ?? reportType,
        },
      },
      'inventory_report'
    )
  }

  const handleReportTypeChange = (typeId: string) => {
    if (typeId === 'stock-audit') {
      navigate('/reports/stock-audit')
    } else {
      setReportType(typeId)
    }
  }

  const isLoading = isReportLoading || isABCLoading

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title="Báo cáo tồn kho"
        showBack
      />

      <div className="p-4 space-y-4">
        {/* Date Range */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-2">
              <Label>Từ ngày</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Đến ngày</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Report Type Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {REPORT_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => handleReportTypeChange(type.id)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                reportType === type.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <Package className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">
                {isLoading ? '—' : formatNumber(reportData?.summary.total_types ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">Tổng mặt hàng</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <TrendingUp className="h-5 w-5 mx-auto mb-1 text-green-500" />
              <p className="text-2xl font-bold">
                {isLoading ? '—' : formatNumber(reportData?.summary.total_items ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">Tổng số lượng</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <AlertCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
              <p className="text-2xl font-bold">
                {isLoading ? '—' : formatNumber(reportData?.summary.low_stock_count ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">Dưới tối thiểu</p>
            </CardContent>
          </Card>
        </div>

        {/* Report Content */}
        {reportType === 'current' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tồn kho hiện tại theo danh mục</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              {isReportLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-6 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : (
                reportData?.by_category.map((cat) => (
                  <div key={cat.category_id} className="flex justify-between items-center py-2 border-b last:border-0">
                    <span className="font-medium">{cat.category_name}</span>
                    <span className="text-primary font-semibold">{formatNumber(cat.total_stock)}</span>
                  </div>
                ))
              )}
              {!isReportLoading && (!reportData?.by_category || reportData.by_category.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">Không có dữ liệu danh mục</p>
              )}
            </CardContent>
          </Card>
        )}

        {reportType === 'abc' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phân tích ABC</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              {isABCLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Nhóm A (80% giá trị)</span>
                      <span className="text-primary">
                        {abcCounts.total > 0 ? `${abcCounts.a} mặt hàng` : '—'}
                      </span>
                    </div>
                    <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-primary h-full"
                        style={{ width: abcCounts.total > 0 ? `${(abcCounts.a / abcCounts.total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Nhóm B (15% giá trị)</span>
                      <span className="text-blue-500">
                        {abcCounts.total > 0 ? `${abcCounts.b} mặt hàng` : '—'}
                      </span>
                    </div>
                    <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full"
                        style={{ width: abcCounts.total > 0 ? `${(abcCounts.b / abcCounts.total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Nhóm C (5% giá trị)</span>
                      <span className="text-gray-500">
                        {abcCounts.total > 0 ? `${abcCounts.c} mặt hàng` : '—'}
                      </span>
                    </div>
                    <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-gray-500 h-full"
                        style={{ width: abcCounts.total > 0 ? `${(abcCounts.c / abcCounts.total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}


        {/* Export Button */}
        <Button
          className="w-full"
          variant="outline"
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            : <Download className="h-4 w-4 mr-2" />}
          {isExporting ? 'Đang xuất...' : 'Xuất báo cáo Excel'}
        </Button>
      </div>
    </div>
  )
}
