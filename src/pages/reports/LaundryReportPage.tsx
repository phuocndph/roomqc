import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { ArrowLeft, Package, DollarSign, Star, Users, Download, FileSpreadsheet } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { StatCard } from '@/components/ui/stat-card'
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
  ResponsiveContainer,
} from 'recharts'
import { useLaundryReport } from '@/hooks/useReports'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileLaundryReportPage } from '@/components/reports/MobileLaundryReportPage'
import { formatCurrency } from '@/lib/utils'
import { subDays, format } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { downloadWorkbook } from '@/lib/excelUtils'

export function LaundryReportPage() {
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()
  
  const [dateRange, setDateRange] = useState({
    start: subDays(new Date(), 30),
    end: new Date(),
  })
  
  const { data: reportData, isLoading, error } = useLaundryReport(dateRange)

  if (isMobile) {
    return <MobileLaundryReportPage />
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Báo cáo Giặt là" description="Đang tải dữ liệu...">
          <Button variant="outline" onClick={() => navigateBack(navigate, '/reports')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại
          </Button>
        </PageHeader>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="border rounded-lg p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Báo cáo Giặt là" description="Lỗi khi tải dữ liệu">
          <Button variant="outline" onClick={() => navigateBack(navigate, '/reports')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại
          </Button>
        </PageHeader>
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <p>Không thể tải dữ liệu báo cáo. Vui lòng thử lại sau.</p>
        </div>
      </div>
    )
  }

  // No data state
  if (!reportData) {
    return (
      <div className="space-y-6">
        <PageHeader title="Báo cáo Giặt là" description="Phân tích chi phí và hiệu suất giặt là">
          <Button variant="outline" onClick={() => navigateBack(navigate, '/reports')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại
          </Button>
        </PageHeader>
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          Chưa có dữ liệu trong khoảng thời gian này
        </div>
      </div>
    )
  }

  const { summary, by_vendor = [], monthly_trend = [] } = reportData

  // Map monthly_trend data for chart
  const chartData = monthly_trend.map((item: any) => ({
    month: item.month,
    cost: item.total_cost || 0,
  }))

  const handleExportPDF = () => {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Báo cáo Giặt là', 14, 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Từ ${format(dateRange.start, 'dd/MM/yyyy')} đến ${format(dateRange.end, 'dd/MM/yyyy')}`, 14, 22)
    
    // Summary
    doc.setFontSize(12)
    doc.text('Tổng quan', 14, 35)
    autoTable(doc, {
      startY: 40,
      head: [['Chỉ số', 'Giá trị']],
      body: [
        ['Tổng số lô', String(summary?.total_batches || 0)],
        ['Tổng items', String(summary?.total_items || 0)],
        ['Tổng chi phí', formatCurrency(summary?.total_cost || 0)],
        ['Chi phí/kg', formatCurrency(summary?.avg_cost_per_kg || 0)],
        ['Chất lượng TB', `${(summary?.avg_quality || 0).toFixed(1)}/5`],
        ['Tỷ lệ đúng hạn', `${(summary?.on_time_rate || 0).toFixed(0)}%`],
      ],
      styles: { fontSize: 10 },
    })
    
    // Vendor table
    if (by_vendor.length > 0) {
      doc.text('Hiệu suất nhà cung cấp', 14, (doc as any).lastAutoTable.finalY + 10)
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 15,
        head: [['Nhà cung cấp', 'Số lô', 'Items', 'Chi phí', 'Đ/kg', 'Chất lượng', 'Đúng hạn']],
        body: by_vendor.map((v: any) => [
          v.vendor_name,
          String(v.total_batches),
          String(v.total_items || 0),
          formatCurrency(v.total_cost || 0),
          formatCurrency(v.avg_cost_per_kg || 0),
          (v.avg_quality_rating || 0).toFixed(1),
          `${(v.on_time_rate || 0).toFixed(0)}%`,
        ]),
        styles: { fontSize: 9 },
      })
    }
    
    doc.save(`bao-cao-giat-la_${format(new Date(), 'yyyyMMdd')}.pdf`)
    toast.success('Xuất PDF thành công')
  }

  const handleExportExcel = async () => {
    const sheets: { name: string; rows: (string | number)[][] }[] = []

    // Summary sheet
    const summaryData = [
      ['Chỉ số', 'Giá trị'],
      ['Tổng số lô', summary?.total_batches || 0],
      ['Tổng items', summary?.total_items || 0],
      ['Tổng chi phí', summary?.total_cost || 0],
      ['Chi phí/kg', summary?.avg_cost_per_kg || 0],
      ['Chất lượng TB', summary?.avg_quality || 0],
      ['Tỷ lệ đúng hạn (%)', summary?.on_time_rate || 0],
    ]
    sheets.push({ name: 'Tổng quan', rows: summaryData })
    
    // Vendor sheet
    if (by_vendor.length > 0) {
      const vendorData = [
        ['Nhà cung cấp', 'Số lô', 'Items', 'Chi phí', 'Đ/kg', 'Chất lượng', 'Đúng hạn (%)'],
        ...by_vendor.map((v: any) => [
          v.vendor_name,
          v.total_batches,
          v.total_items || 0,
          v.total_cost || 0,
          v.avg_cost_per_kg || 0,
          v.avg_quality_rating || 0,
          v.on_time_rate || 0,
        ])
      ]
      sheets.push({ name: 'Nhà cung cấp', rows: vendorData })
    }
    
    await downloadWorkbook(sheets, `bao-cao-giat-la_${format(new Date(), 'yyyyMMdd')}.xlsx`)
    toast.success('Xuất Excel thành công')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo Giặt là"
        description="Phân tích chi phí và hiệu suất dịch vụ giặt là"
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" onClick={() => navigateBack(navigate, '/reports')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại
          </Button>
        </div>
      </PageHeader>
      
      {/* Date Range */}
      <div className="border rounded-lg p-4">
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

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Tổng số lô"
          value={summary?.total_batches || 0}
          icon={Package}
          description={`${((summary?.total_batches || 0) / 30).toFixed(1)} lô/ngày`}
        />
        <StatCard
          title="Tổng items"
          value={(summary?.total_items || 0).toLocaleString()}
          icon={Package}
          description={`${summary?.total_weight?.toFixed(0) || 0} kg`}
        />
        <StatCard
          title="Tổng chi phí"
          value={formatCurrency(summary?.total_cost || 0)}
          icon={DollarSign}
          description={`${formatCurrency(summary?.avg_cost_per_kg || 0)}/kg`}
        />
        <StatCard
          title="Chất lượng TB"
          value={`${(summary?.avg_quality || 0).toFixed(1)}/5`}
          icon={Star}
          description={`${(summary?.on_time_rate || 0).toFixed(0)}% đúng hạn`}
        />
      </div>

      {/* Monthly Trend Chart */}
      {chartData.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">Xu hướng chi phí theo tháng</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis 
                tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`}
                className="text-xs"
              />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                labelFormatter={(label) => `Tháng ${label}`}
              />
              <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Vendor Performance Table */}
      {by_vendor.length > 0 && (
        <div className="border rounded-lg">
          <div className="p-4 border-b">
            <h3 className="text-sm font-medium">Hiệu suất nhà cung cấp</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhà cung cấp</TableHead>
                  <TableHead className="text-right">Số lô</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Chi phí</TableHead>
                  <TableHead className="text-right">₫/kg</TableHead>
                  <TableHead className="text-right">Chất lượng</TableHead>
                  <TableHead className="text-right">Đúng hạn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {by_vendor.map((vendor: any) => (
                  <TableRow key={vendor.vendor_id}>
                    <TableCell className="font-medium">{vendor.vendor_name}</TableCell>
                    <TableCell className="text-right">{vendor.total_batches}</TableCell>
                    <TableCell className="text-right">{(vendor.total_items || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(vendor.total_cost || 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(vendor.avg_cost_per_kg || 0)}</TableCell>
                    <TableCell className="text-right">
                      <span className="flex items-center justify-end gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {(vendor.avg_quality_rating || 0).toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={(vendor.on_time_rate || 0) >= 90 ? 'text-green-600' : (vendor.on_time_rate || 0) >= 70 ? 'text-amber-600' : 'text-red-600'}>
                        {(vendor.on_time_rate || 0).toFixed(0)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Empty state for vendor */}
      {by_vendor.length === 0 && (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Chưa có dữ liệu nhà cung cấp</p>
        </div>
      )}
    </div>
  )
}
