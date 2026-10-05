import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { ArrowLeft, Download, FileText, Mail } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { HotelFilterCard } from '@/components/reports/HotelFilterCard'
import { InventoryOverviewTab } from '@/components/reports/inventory/InventoryOverviewTab'
import { ABCAnalysisTab } from '@/components/reports/inventory/ABCAnalysisTab'
import { StockAuditTab } from '@/components/reports/inventory/StockAuditTab'
import { WarehouseStockTab } from '@/components/reports/inventory/WarehouseStockTab'
import { useInventoryReport } from '@/hooks/useReports'
import { useReportExport } from '@/hooks/useReportExport'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileInventoryReportPage } from '@/components/reports/MobileInventoryReportPage'
import { subDays } from 'date-fns'

export function InventoryReportPage() {
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date(),
  })
  
  const chartRefs = useRef<HTMLElement[]>([])
  
  const { data: reportData, isLoading } = useInventoryReport(dateRange)
  const { exportToPDF, exportToExcel, isExporting } = useReportExport()

  if (isMobile) {
    return <MobileInventoryReportPage />
  }
  
  const handleExportPDF = async () => {
    if (!reportData) return
    
    await exportToPDF(
      {
        title: 'Báo cáo Tồn kho',
        dateRange: `${dateRange.start.toLocaleDateString('vi-VN')} - ${dateRange.end.toLocaleDateString('vi-VN')}`,
        summary: reportData.summary as Record<string, any>,
        tables: [
          {
            title: 'Phân bổ theo danh mục',
            headers: ['Danh mục', 'Số loại', 'Tồn kho', 'Đang dùng', 'Giá trị', '% Tổng'],
            rows: reportData.by_category.map(cat => [
              cat.category_name,
              cat.item_count,
              cat.total_stock,
              cat.in_use,
              new Intl.NumberFormat('vi-VN').format(cat.total_value),
              `${cat.percentage}%`,
            ]),
          },
        ],
      },
      'inventory_report',
      chartRefs.current
    )
  }
  
  const handleExportExcel = () => {
    if (!reportData) return
    
    exportToExcel(
      {
        title: 'Báo cáo Tồn kho',
        dateRange: `${dateRange.start.toLocaleDateString('vi-VN')} - ${dateRange.end.toLocaleDateString('vi-VN')}`,
        summary: reportData.summary as Record<string, any>,
        tables: [
          {
            title: 'Theo danh mục',
            headers: ['Danh mục', 'Số loại', 'Tồn kho', 'Đang dùng', 'Đang giặt', 'Giá trị', '% Tổng'],
            rows: reportData.by_category.map(cat => [
              cat.category_name,
              cat.item_count,
              cat.total_stock,
              cat.in_use,
              cat.in_laundry,
              cat.total_value,
              cat.percentage,
            ]),
          },
          {
            title: 'Top items theo giá trị',
            headers: ['Mã', 'Tên', 'Danh mục', 'Số lượng', 'Đơn giá', 'Tổng giá trị', '% Tổng'],
            rows: reportData.top_items_by_value.map(item => [
              item.item_code,
              item.item_name,
              item.category,
              item.quantity,
              item.unit_price,
              item.total_value,
              item.percentage,
            ]),
          },
        ],
      },
      'inventory_report'
    )
  }
  
  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo Tồn kho"
        description="Phân tích chi tiết về tình trạng tồn kho"
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigateBack(navigate, '/reports')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại
          </Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={isExporting}>
            <FileText className="mr-2 h-4 w-4" />
            Xuất PDF
          </Button>
          <Button variant="outline" onClick={handleExportExcel} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            Xuất Excel
          </Button>
          <Button variant="outline">
            <Mail className="mr-2 h-4 w-4" />
            Lên lịch email
          </Button>
        </div>
      </PageHeader>
      
      {/* Hotel Filter */}
      <HotelFilterCard />
      
      {/* Date Range Selector */}
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
      
      {/* Report Content */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="warehouse">Theo kho</TabsTrigger>
          <TabsTrigger value="abc">ABC Phân tích</TabsTrigger>
          <TabsTrigger value="stock-audit">Kiểm kê</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview">
          <InventoryOverviewTab 
            data={reportData} 
            isLoading={isLoading}
            chartRefs={chartRefs}
          />
        </TabsContent>
        
        <TabsContent value="warehouse">
          <WarehouseStockTab />
        </TabsContent>
        
        <TabsContent value="abc">
          <ABCAnalysisTab />
        </TabsContent>
        
        <TabsContent value="stock-audit">
          <StockAuditTab dateRange={dateRange} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
