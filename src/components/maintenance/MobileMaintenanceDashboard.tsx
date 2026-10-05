import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MobileStatCard, StatScrollContainer } from '@/components/mobile/MobileDashboardStats'
import { SwipeableCard } from '@/components/mobile/TouchOptimized'
import { useMaintenanceDashboard } from '@/hooks/useMaintenanceDashboard'
import { useNavigate } from 'react-router-dom'
import {
  Wrench,
  Clock,
  CheckCircle,
  DollarSign,
  Calendar,
  FileText,
  Users,
  Plus,
  AlertCircle,
  Building2,
} from 'lucide-react'
import { PriorityBadge } from './PriorityBadge'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'

export const MobileMaintenanceDashboard = () => {
  const navigate = useNavigate()
  const { data: dashboard, isLoading } = useMaintenanceDashboard()

  const stats = dashboard?.stats || {
    total: 0,
    inProgress: 0,
    completed: 0,
    avgTime: 0,
    costLast30Days: 0,
  }

  const quickActions = [
    {
      icon: Plus,
      label: 'Tạo yêu cầu',
      onClick: () => navigate('/maintenance/requests/new'),
      color: 'text-primary',
    },
    {
      icon: FileText,
      label: 'Tất cả yêu cầu',
      onClick: () => navigate('/maintenance/requests'),
      color: 'text-blue-600',
    },
  ]

  const activeRequests = dashboard?.activeRequests || {
    urgent: [],
    high: [],
    medium: [],
    low: [],
  }

  const allActive = [
    ...activeRequests.urgent,
    ...activeRequests.high,
    ...activeRequests.medium,
    ...activeRequests.low,
  ].slice(0, 5)

  return (
    <div className="pb-20">
      <div className="space-y-4">
        {/* Stats */}
        <StatScrollContainer>
          <MobileStatCard
            title="Tổng yêu cầu"
            value={stats.total.toString()}
            icon={Wrench}
            variant="default"
          />
          <MobileStatCard
            title="Đang xử lý"
            value={stats.inProgress.toString()}
            icon={AlertCircle}
            variant="warning"
          />
          <MobileStatCard
            title="Hoàn thành"
            value={stats.completed.toString()}
            icon={CheckCircle}
            variant="success"
          />
          <MobileStatCard
            title="Thời gian TB"
            value={`${stats.avgTime}h`}
            icon={Clock}
            variant="default"
          />
          <MobileStatCard
            title="Chi phí (30d)"
            value={new Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
              notation: 'compact',
            }).format(stats.costLast30Days)}
            icon={DollarSign}
            variant="default"
          />
        </StatScrollContainer>

        {/* Quick Actions */}
        <div className="px-4 space-y-3">
          <h2 className="text-lg font-semibold">Thao tác nhanh</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {quickActions.map((action) => (
              <Card
                key={action.label}
                className="cursor-pointer active:scale-[0.97] transition-all duration-150"
                onClick={action.onClick}
              >
                <CardContent className="flex flex-col items-center justify-center p-4 min-h-[100px]">
                  <action.icon className={cn('h-7 w-7 mb-2', action.color)} />
                  <span className="text-xs font-medium text-center leading-tight">
                    {action.label}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Active Requests */}
        <div className="px-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Yêu cầu đang xử lý</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/maintenance/requests')}
            >
              Xem tất cả
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-16 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : allActive.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Không có yêu cầu đang xử lý
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {allActive.map((request: any) => (
                <SwipeableCard
                  key={request.id}
                  onSwipeLeft={() => navigate(`/maintenance/requests/${request.id}`)}
                >
                  <Card
                    className="cursor-pointer active:scale-[0.98] transition-transform"
                    onClick={() => navigate(`/maintenance/requests/${request.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <PriorityBadge priority={request.priority} />
                            <span className="text-xs text-muted-foreground">
                              {request.request_code}
                            </span>
                          </div>
                          <p className="font-medium truncate mb-1">{request.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{request.location}</span>
                            <span>•</span>
                            <span>
                              {formatDistanceToNow(new Date(request.reported_at), {
                                addSuffix: true,
                                locale: vi,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </SwipeableCard>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
