import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Download, FileSpreadsheet, FileText, Package, Users, WashingMachine, Wrench, Trash2, MoreHorizontal } from 'lucide-react'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { vi } from 'date-fns/locale'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { useOutboundReport } from '@/hooks/useOutboundReport'
import { useBreakpoint } from '@/lib/breakpoints'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { cn, formatCurrency as formatCurrencyUtil } from '@/lib/utils'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { downloadWorkbook } from '@/lib/excelUtils'

const CATEGORY_ICONS = {
  room_assign: Package,
  staff_assign: Users,
  laundry: WashingMachine,
  maintenance: Wrench,
  disposal: Trash2,
  other: MoreHorizontal
}

const CATEGORY_COLORS = {
  room_assign: 'hsl(var(--chart-1))',
  staff_assign: 'hsl(var(--chart-2))',
  laundry: 'hsl(var(--chart-3))',
  maintenance: 'hsl(var(--chart-4))',
  disposal: 'hsl(var(--chart-5))',
  other: 'hsl(var(--muted-foreground))'
}

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))']

export function OutboundReportPage() {
  const { t, i18n } = useTranslation(['outboundReport', 'common', 'inventory'])
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(subMonths(new Date(), 2)),
    to: endOfMonth(new Date())
  })
  const [activeTab, setActiveTab] = useState('overview')
  
  const { data, isLoading } = useOutboundReport({
    startDate: dateRange.from,
    endDate: dateRange.to
  })
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
  }
  
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('vi-VN').format(value)
  }
  
  const pieData = data?.summary
    .filter(s => s.transaction_count > 0)
    .map((s, index) => ({
      name: t(`categories.${s.category}`),
      value: s.total_quantity,
      color: CHART_COLORS[index % CHART_COLORS.length]
    })) || []

  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        {/* Mobile Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="flex items-center gap-3 p-4">
            <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/reports')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="font-semibold">{t('title')}</h1>
              <p className="text-xs text-muted-foreground">{t('description')}</p>
            </div>
          </div>
        </div>
        
        {/* Date Filter */}
        <div className="p-4 border-b">
          <p className="text-sm text-muted-foreground">
            {format(dateRange.from, 'dd/MM/yyyy')} - {format(dateRange.to, 'dd/MM/yyyy')}
          </p>
        </div>
        
        {/* Summary Cards */}
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{t('summary.totalTransactions')}</p>
                <p className="text-2xl font-bold">{formatNumber(data?.totalTransactions || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{t('summary.totalQuantity')}</p>
                <p className="text-2xl font-bold">{formatNumber(data?.totalQuantity || 0)}</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('summary.totalValue')}</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(data?.totalValue || 0)}</p>
            </CardContent>
          </Card>
        </div>
        
        {/* Category Breakdown */}
        <div className="p-4">
          <h3 className="font-medium mb-3">{t('description')}</h3>
          <div className="space-y-2">
            {data?.summary.map(cat => {
              const Icon = CATEGORY_ICONS[cat.category as keyof typeof CATEGORY_ICONS] || Package
              return (
                <Card key={cat.category} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setActiveTab(cat.category)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: `${CATEGORY_COLORS[cat.category as keyof typeof CATEGORY_COLORS]}20` }}>
                      <Icon className="h-5 w-5" style={{ color: CATEGORY_COLORS[cat.category as keyof typeof CATEGORY_COLORS] }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{t(`categories.${cat.category}`)}</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(cat.transaction_count)} giao dịch</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatNumber(cat.total_quantity)}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(cat.total_value)}</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const handleExportPDF = () => {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('Báo cáo Xuất kho', 14, 15)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Từ ${format(dateRange.from, 'dd/MM/yyyy')} đến ${format(dateRange.to, 'dd/MM/yyyy')}`, 14, 22)
    
    // Summary
    doc.setFontSize(12)
    doc.text('Tổng quan', 14, 35)
    autoTable(doc, {
      startY: 40,
      head: [['Loại', 'Số GD', 'Số lượng', 'Giá trị']],
      body: data?.summary.map(s => [
        t(`categories.${s.category}`),
        String(s.transaction_count),
        String(s.total_quantity),
        formatCurrency(s.total_value),
      ]) || [],
      styles: { fontSize: 10 },
    })
    
    doc.save(`bao-cao-xuat-kho_${format(new Date(), 'yyyyMMdd')}.pdf`)
    toast.success('Xuất PDF thành công')
  }

  const handleExportExcel = async () => {
    const sheets: { name: string; rows: (string | number)[][] }[] = []

    // Summary sheet
    const summaryData = [
      ['Loại', 'Số giao dịch', 'Số lượng', 'Giá trị'],
      ...(data?.summary.map(s => [
        t(`categories.${s.category}`),
        s.transaction_count,
        s.total_quantity,
        s.total_value,
      ]) || [])
    ]
    sheets.push({ name: 'Tổng quan', rows: summaryData })
    
    // Top items per category
    Object.entries(data?.byCategory || {}).forEach(([cat, catData]) => {
      if (catData.topItems.length > 0) {
        const itemsData = [
          ['Mã SP', 'Tên SP', 'Số lượt', 'Số lượng', 'Giá trị'],
          ...catData.topItems.map(item => [
            item.item_code,
            item.item_name,
            item.count,
            item.quantity,
            item.value,
          ])
        ]
        sheets.push({ name: t(`categories.${cat}`).slice(0, 31), rows: itemsData })
      }
    })
    
    await downloadWorkbook(sheets, `bao-cao-xuat-kho_${format(new Date(), 'yyyyMMdd')}.xlsx`)
    toast.success('Xuất Excel thành công')
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {format(dateRange.from, 'dd/MM/yyyy')} - {format(dateRange.to, 'dd/MM/yyyy')}
          </span>
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
            {t('back')}
          </Button>
        </div>
      </PageHeader>
      
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('summary.totalTransactions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatNumber(data?.totalTransactions || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('summary.totalQuantity')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatNumber(data?.totalQuantity || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('summary.totalValue')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{formatCurrency(data?.totalValue || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('summary.avgPerTransaction')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {data?.totalTransactions ? formatCurrency(data.totalValue / data.totalTransactions) : '0'}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Tabs for each category */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="room_assign">{t('categories.room_assign')}</TabsTrigger>
          <TabsTrigger value="staff_assign">{t('categories.staff_assign')}</TabsTrigger>
          <TabsTrigger value="laundry">{t('categories.laundry')}</TabsTrigger>
          <TabsTrigger value="maintenance">{t('categories.maintenance')}</TabsTrigger>
          <TabsTrigger value="disposal">{t('categories.disposal')}</TabsTrigger>
          <TabsTrigger value="other">{t('categories.other')}</TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Phân bố theo loại xuất kho</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatNumber(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            {/* Category Summary Table */}
            <Card>
              <CardHeader>
                <CardTitle>Chi tiết theo loại</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data?.summary.map(cat => {
                    const Icon = CATEGORY_ICONS[cat.category as keyof typeof CATEGORY_ICONS] || Package
                    const percentage = data.totalQuantity > 0 
                      ? ((cat.total_quantity / data.totalQuantity) * 100).toFixed(1)
                      : '0'
                    return (
                      <div key={cat.category} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer" onClick={() => setActiveTab(cat.category)}>
                        <div className="p-2 rounded-lg" style={{ backgroundColor: `${CATEGORY_COLORS[cat.category as keyof typeof CATEGORY_COLORS]}20` }}>
                          <Icon className="h-5 w-5" style={{ color: CATEGORY_COLORS[cat.category as keyof typeof CATEGORY_COLORS] }} />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{t(`categories.${cat.category}`)}</p>
                          <p className="text-sm text-muted-foreground">{formatNumber(cat.transaction_count)} giao dịch</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatNumber(cat.total_quantity)}</p>
                          <p className="text-sm text-muted-foreground">{percentage}%</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Category Tabs */}
        {['room_assign', 'staff_assign', 'laundry', 'maintenance', 'disposal', 'other'].map(category => (
          <TabsContent key={category} value={category} className="space-y-6">
            <CategoryReport 
              category={category} 
              data={data?.byCategory[category]} 
              t={t} 
              formatNumber={formatNumber}
              formatCurrency={formatCurrency}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

interface CategoryReportProps {
  category: string
  data?: {
    transactions: number
    quantity: number
    value: number
    topItems: Array<{
      item_id: string
      item_name: string
      item_code: string
      count: number
      quantity: number
      value: number
    }>
    monthlyTrend: Array<{
      month: string
      count: number
      quantity: number
      value: number
    }>
  }
  t: (key: string) => string
  formatNumber: (value: number) => string
  formatCurrency: (value: number) => string
}

function CategoryReport({ category, data, t, formatNumber, formatCurrency }: CategoryReportProps) {
  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t('noData')}
        </CardContent>
      </Card>
    )
  }
  
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle>{t(`categories.${category}`)}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-accent/50">
            <p className="text-sm text-muted-foreground">{t('summary.totalTransactions')}</p>
            <p className="text-2xl font-bold">{formatNumber(data.transactions)}</p>
          </div>
          <div className="p-4 rounded-lg bg-accent/50">
            <p className="text-sm text-muted-foreground">{t('summary.totalQuantity')}</p>
            <p className="text-2xl font-bold">{formatNumber(data.quantity)}</p>
          </div>
          <div className="col-span-2 p-4 rounded-lg bg-primary/10">
            <p className="text-sm text-muted-foreground">{t('summary.totalValue')}</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(data.value)}</p>
          </div>
        </CardContent>
      </Card>
      
      {/* Monthly Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Xu hướng theo tháng</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            {data.monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => formatNumber(value)} />
                  <Bar dataKey="quantity" fill="hsl(var(--primary))" name={t('chart.quantity')} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                {t('noData')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Top Items */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Đồ dùng xuất nhiều nhất</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">{t('table.rank')}</th>
                    <th className="text-left py-2 px-3">{t('table.name')}</th>
                    <th className="text-right py-2 px-3">Số lượt</th>
                    <th className="text-right py-2 px-3">{t('table.count')}</th>
                    <th className="text-right py-2 px-3">{t('table.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topItems.map((item, index) => (
                    <tr key={item.item_id} className="border-b hover:bg-accent/50">
                      <td className="py-3 px-3 font-medium">{index + 1}</td>
                      <td className="py-3 px-3">
                        <div>
                          <p className="font-medium">{item.item_name}</p>
                          <p className="text-sm text-muted-foreground">{item.item_code}</p>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">{formatNumber(item.count)}</td>
                      <td className="py-3 px-3 text-right font-medium">{formatNumber(item.quantity)}</td>
                      <td className="py-3 px-3 text-right text-muted-foreground">{formatCurrency(item.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              {t('noData')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
