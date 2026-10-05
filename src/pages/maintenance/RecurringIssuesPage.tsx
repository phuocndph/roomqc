import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecurringIssuesTable } from '@/components/maintenance/RecurringIssuesTable'
import { useRecurringIssues } from '@/hooks/useRecurringIssues'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MobileRecurringIssuesPage } from '@/components/maintenance/MobileRecurringIssuesPage'
import { useBreakpoint } from '@/lib/breakpoints'
import { Loader2, AlertTriangle, DollarSign, TrendingUp, Wrench, CheckCircle2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'

export default function RecurringIssuesPage() {
  const { isMobile } = useBreakpoint()
  const navigate = useNavigate()
  const [period, setPeriod] = useState(90)
  const { data: issues, isLoading } = useRecurringIssues(period)

  if (isMobile) {
    return <MobileRecurringIssuesPage />
  }

  const totalIssues = issues?.length || 0
  const criticalIssues = issues?.filter(i => i.count30d >= 3).length || 0
  const total30d = issues?.reduce((sum, i) => sum + i.count30d, 0) || 0
  const totalCost = issues?.reduce((sum, i) => sum + i.totalCost, 0) || 0

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', notation: 'compact' }).format(value)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vấn đề lặp lại"
        description="Phân tích thiết bị và phòng có sự cố thường xuyên"
      >
        <Button variant="outline" size="sm" onClick={() => navigateBack(navigate, '/maintenance')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Quay lại
        </Button>
      </PageHeader>

      {/* Stats Row */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Thiết bị/Phòng</p>
            <p className="text-xl font-bold">{totalIssues}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <div>
            <p className="text-xs text-muted-foreground">Nghiêm trọng (≥3 lần)</p>
            <p className="text-xl font-bold text-red-600">{criticalIssues}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <TrendingUp className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-xs text-muted-foreground">Tổng sự cố (30 ngày)</p>
            <p className="text-xl font-bold text-amber-600">{total30d}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <DollarSign className="h-5 w-5 text-purple-600" />
          <div>
            <p className="text-xs text-muted-foreground">Tổng chi phí</p>
            <p className="text-xl font-bold text-purple-600">{formatCurrency(totalCost)}</p>
          </div>
        </div>
      </div>

      {/* Period Tabs */}
      <Tabs value={period.toString()} onValueChange={(v) => setPeriod(Number(v))}>
        <TabsList className="h-9 bg-muted/50">
          <TabsTrigger value="30" className="text-xs h-7 data-[state=active]:bg-background">
            30 ngày
          </TabsTrigger>
          <TabsTrigger value="90" className="text-xs h-7 data-[state=active]:bg-background">
            90 ngày
          </TabsTrigger>
          <TabsTrigger value="180" className="text-xs h-7 data-[state=active]:bg-background">
            6 tháng
          </TabsTrigger>
          <TabsTrigger value="365" className="text-xs h-7 data-[state=active]:bg-background">
            1 năm
          </TabsTrigger>
        </TabsList>

        <TabsContent value={period.toString()} className="mt-3">
          {isLoading ? (
            <div className="border rounded-lg">
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            </div>
          ) : issues && issues.length > 0 ? (
            <RecurringIssuesTable issues={issues} />
          ) : (
            <div className="border rounded-lg">
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center mb-3">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <p className="font-medium mb-1">Không có vấn đề lặp lại</p>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Trong {period} ngày qua, không có thiết bị hoặc phòng nào gặp sự cố lặp lại (≥2 lần)
                </p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
