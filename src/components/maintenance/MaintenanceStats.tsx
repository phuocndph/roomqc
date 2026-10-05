import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Wrench, Clock, CheckCircle, DollarSign, AlertTriangle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface MaintenanceStatsProps {
  stats: {
    total: number
    totalLast30Days: number
    inProgress: number
    completed: number
    completedLast30Days: number
    completionRate: number
    avgTime: number
    costLast30Days: number
    mttr: number
    mtbf: number
    firstTimeFixRate: number
  }
  isLoading?: boolean
}

export const MaintenanceStats = ({ stats, isLoading }: MaintenanceStatsProps) => {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tổng yêu cầu</CardTitle>
          <Wrench className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
          <p className="text-xs text-muted-foreground">
            +{stats.totalLast30Days} trong 30 ngày
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Đang xử lý</CardTitle>
          <AlertTriangle className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.inProgress}</div>
          <p className="text-xs text-muted-foreground">Cần xử lý ngay</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Hoàn thành</CardTitle>
          <CheckCircle className="h-4 w-4 text-success" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.completed}</div>
          <p className="text-xs text-muted-foreground">
            {stats.completionRate}% | +{stats.completedLast30Days} (30d)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Thời gian TB</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.avgTime}h</div>
          <p className="text-xs text-muted-foreground">Thời gian xử lý trung bình</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Chi phí (30d)</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {new Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
              notation: 'compact',
            }).format(stats.costLast30Days)}
          </div>
          <p className="text-xs text-muted-foreground">Tổng chi phí 30 ngày</p>
        </CardContent>
      </Card>
    </div>

    {/* KPI Metrics */}
    <div className="grid gap-4 md:grid-cols-3 mt-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">MTTR</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.mttr}h</div>
          <p className="text-xs text-muted-foreground">
            Mean Time To Repair
          </p>
          <p className="text-xs text-success mt-1">
            Target: &lt; 3h {stats.mttr <= 3 && '✓'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">MTBF</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.mtbf} ngày</div>
          <p className="text-xs text-muted-foreground">
            Mean Time Between Failures
          </p>
          <p className="text-xs text-success mt-1">
            Target: &gt; 30 ngày {stats.mtbf >= 30 && '✓'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">First Time Fix</CardTitle>
          <CheckCircle className="h-4 w-4 text-success" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.firstTimeFixRate}%</div>
          <p className="text-xs text-muted-foreground">
            Sửa xong ngay lần đầu
          </p>
          <p className="text-xs text-success mt-1">
            Target: &gt; 85% {stats.firstTimeFixRate >= 85 && '✓'}
          </p>
        </CardContent>
      </Card>
    </div>
    </>
  )
}
