import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { PullToRefresh } from '@/components/mobile/TouchOptimized'
import { useMaintenanceRequests } from '@/hooks/useMaintenanceRequests'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Plus } from 'lucide-react'
import { PriorityBadge } from './PriorityBadge'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'

const STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'waiting', label: 'Đang chờ' },
  { value: 'pending', label: 'Tiếp nhận' },
  { value: 'in_progress', label: 'Đang xử lý' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Đang chờ',
  pending: 'Tiếp nhận',
  in_progress: 'Đang xử lý',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  waiting: 'outline',
  pending: 'secondary',
  in_progress: 'default',
  completed: 'outline',
  cancelled: 'destructive',
}

export const MobileMaintenanceRequestList = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const priorityFilter = searchParams.get('priority') || undefined
  const [statusFilter, setStatusFilter] = useState(() => {
    const requested = searchParams.get('status')
    return requested && STATUS_FILTERS.some((filter) => filter.value === requested) ? requested : 'all'
  })
  const [search, setSearch] = useState('')

  const filters = {
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(search && { search }),
    ...(priorityFilter && { priority: priorityFilter }),
  }

  const { data: requests = [], isLoading, refetch } = useMaintenanceRequests(filters)

  const handleRefresh = async () => {
    await refetch()
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title="Yêu cầu bảo trì"
        showBack
        action={{
          icon: Plus,
          onClick: () => navigate('/maintenance/requests/new'),
        }}
      />

      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm yêu cầu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Status Filter Chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                statusFilter === filter.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Requests List */}
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="space-y-3">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-20 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))
            ) : requests.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Không tìm thấy yêu cầu bảo trì
                  </p>
                </CardContent>
              </Card>
            ) : (
              requests.map((request: any) => (
                <Card
                  key={request.id}
                  className="cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => navigate(`/maintenance/requests/${request.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <PriorityBadge priority={request.priority} />
                          <Badge variant={STATUS_VARIANTS[request.status]}>
                            {STATUS_LABELS[request.status]}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {request.request_code}
                        </span>
                      </div>

                      <div>
                        <p className="font-medium mb-1 line-clamp-1">{request.title}</p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {request.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{request.location}</span>
                        <span>•</span>
                        <span>
                          {formatDistanceToNow(new Date(request.reported_at), {
                            addSuffix: true,
                            locale: vi,
                          })}
                        </span>
                        {request.reporter && (
                          <>
                            <span>•</span>
                            <span>{request.reporter.full_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </PullToRefresh>
      </div>
    </div>
  )
}
