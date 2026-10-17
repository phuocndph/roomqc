import { Link, useNavigate } from 'react-router-dom'
import {
  Plus,
  AlertTriangle,
  Wrench,
  CheckCircle,
  RefreshCw,
  ArrowRight,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMaintenanceDashboard } from '@/hooks/useMaintenanceDashboard'
import { ActiveRequestsSection } from '@/components/maintenance/ActiveRequestsSection'
import { MobileMaintenanceDashboard } from '@/components/maintenance/MobileMaintenanceDashboard'
import { useBreakpoint } from '@/lib/breakpoints'
import { formatCurrency } from '@/lib/utils'

export default function MaintenanceDashboard() {
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const { data, isLoading, isError, refetch } = useMaintenanceDashboard()
  if (isMobile) return <MobileMaintenanceDashboard />
  const stats = data?.stats
  return (
    <div className="space-y-5">
      <PageHeader
        title="Bảo trì"
        description="Xem sự cố cần ưu tiên và theo dõi tiến độ sửa chữa."
      >
        <Button asChild variant="outline">
          <Link to="/maintenance/requests">Tất cả yêu cầu</Link>
        </Button>
        <PermissionGate module="maintenance" action="create">
          <Button onClick={() => navigate('/maintenance/requests/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Tạo yêu cầu
          </Button>
        </PermissionGate>
      </PageHeader>
      {isError ? (
        <div role="alert" className="rounded-lg border p-8 text-center">
          <p>Không thể tải tổng quan bảo trì.</p>
          <Button variant="outline" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Thử lại
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {isLoading
              ? [0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))
              : [
                  {
                    title: 'Khẩn cấp',
                    count: data?.activeRequests.urgent.length || 0,
                    hint: 'Cần ưu tiên xử lý ngay',
                    icon: AlertTriangle,
                    color: 'text-red-700 dark:text-red-400',
                    to: '/maintenance/requests?view=urgent',
                  },
                  {
                    title: 'Cần xử lý',
                    count: stats?.inProgress || 0,
                    hint: 'Chờ tiếp nhận và đang làm',
                    icon: Wrench,
                    color: 'text-amber-700 dark:text-amber-400',
                    to: '/maintenance/requests?view=active',
                  },
                  {
                    title: 'Đã hoàn thành',
                    count: stats?.completed || 0,
                    hint: 'Xem kết quả sửa chữa',
                    icon: CheckCircle,
                    color: 'text-green-700 dark:text-green-400',
                    to: '/maintenance/requests?view=completed',
                  },
                ].map((item) => (
                  <Link
                    key={item.title}
                    to={item.to}
                    className="rounded-lg border bg-card p-4 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>{item.title}</span>
                      <item.icon className={`h-5 w-5 ${item.color}`} />
                    </div>
                    <p
                      className={`mt-2 text-3xl font-bold tabular-nums ${item.color}`}
                    >
                      {item.count}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.hint}
                    </p>
                  </Link>
                ))}
          </div>
          {data?.activeRequests && (
            <ActiveRequestsSection requests={data.activeRequests} />
          )}
          {!!data?.recentCompletions.length && (
            <section className="rounded-lg border bg-card">
              <div className="flex items-center justify-between gap-3 border-b p-4">
                <h2 className="font-semibold">Vừa hoàn thành</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/maintenance/requests?view=completed">
                    Xem tất cả
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="divide-y">
                {data.recentCompletions.slice(0, 5).map((request: any) => (
                  <Link
                    key={request.id}
                    to={`/maintenance/requests/${request.id}`}
                    className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{request.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {request.request_code} ·{' '}
                        {request.room?.room_number
                          ? `Phòng ${request.room.room_number}`
                          : request.location}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium">
                      {request.actual_cost != null
                        ? formatCurrency(request.actual_cost)
                        : 'Chưa có chi phí'}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {stats && (
            <details className="rounded-lg border bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Chi phí & hiệu suất bảo trì
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Chi phí 30 ngày
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatCurrency(stats.costLast30Days)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Thời gian xử lý trung bình
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {stats.avgTime} giờ
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Tỷ lệ hoàn thành
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {stats.completionRate}%
                  </p>
                </div>
              </div>
            </details>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/maintenance/recurring-issues">Vấn đề lặp lại</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/reports/maintenance">Báo cáo bảo trì</Link>
        </Button>
        <PermissionGate module="users" action="view">
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/users">Nhân viên kỹ thuật</Link>
          </Button>
        </PermissionGate>
      </div>
    </div>
  )
}
