import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useMaintenanceRequests,
  type MaintenanceFilters as FilterValues,
} from '@/hooks/useMaintenanceRequests'
import { MaintenanceRequestTable } from '@/components/maintenance/MaintenanceRequestTable'
import { MaintenanceFilters } from '@/components/maintenance/MaintenanceFilters'
import { MobileMaintenanceRequestList } from '@/components/maintenance/MobileMaintenanceRequestList'
import { useBreakpoint } from '@/lib/breakpoints'

export default function MaintenanceRequestList() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { isMobile } = useBreakpoint()
  const view = ['all', 'urgent', 'active', 'completed'].includes(
    params.get('view') || '',
  )
    ? params.get('view')!
    : 'all'
  const filters: FilterValues = {
    search: params.get('search') || undefined,
    priority: params.get('priority') || undefined,
    issue_type: params.get('issue_type') || undefined,
    status: params.get('status') || undefined,
  }
  const {
    data: requests = [],
    isLoading,
    isError,
    refetch,
  } = useMaintenanceRequests({
    search: filters.search,
    priority: filters.priority,
    issue_type: filters.issue_type,
  })
  const matchesView = (
    request: (typeof requests)[number],
    nextView: string,
  ) => {
    if (nextView === 'urgent')
      return (
        request.priority === 'urgent' &&
        !['completed', 'cancelled'].includes(request.status)
      )
    if (nextView === 'active')
      return ['waiting', 'pending', 'in_progress'].includes(request.status)
    if (nextView === 'completed') return request.status === 'completed'
    return true
  }
  const filteredRequests = requests.filter(
    (request) =>
      matchesView(request, view) &&
      (!filters.status || request.status === filters.status),
  )
  const updateFilters = (next: FilterValues) => {
    const nextParams = new URLSearchParams(params)
    for (const key of ['search', 'priority', 'issue_type', 'status'] as const) {
      if (next[key]) nextParams.set(key, next[key]!)
      else nextParams.delete(key)
    }
    if (next.status !== filters.status || next.priority !== filters.priority)
      nextParams.delete('view')
    setParams(nextParams, { replace: true })
  }
  const updateView = (nextView: string) => {
    const nextParams = new URLSearchParams(params)
    nextParams.delete('status')
    if (nextView === 'urgent') nextParams.delete('priority')
    if (nextView === 'all') nextParams.delete('view')
    else nextParams.set('view', nextView)
    setParams(nextParams)
  }

  if (isMobile) return <MobileMaintenanceRequestList />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Yêu cầu bảo trì"
        description="Ưu tiên sự cố khẩn cấp, tiếp nhận và theo dõi việc đang xử lý."
      >
        <PermissionGate module="maintenance" action="create">
          <Button onClick={() => navigate('/maintenance/requests/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Tạo yêu cầu
          </Button>
        </PermissionGate>
      </PageHeader>
      <Tabs value={view} onValueChange={updateView} className="space-y-4">
        <TabsList
          aria-label="Nhóm yêu cầu bảo trì"
          className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 lg:grid-cols-4"
        >
          {[
            { key: 'all', label: 'Tất cả', hint: 'Bao gồm yêu cầu đã hủy' },
            { key: 'urgent', label: 'Khẩn cấp', hint: 'Sự cố cần xử lý ngay' },
            {
              key: 'active',
              label: 'Cần xử lý',
              hint: 'Chờ tiếp nhận hoặc đang làm',
            },
            { key: 'completed', label: 'Hoàn thành', hint: 'Đã xử lý xong' },
          ].map((item) => (
            <TabsTrigger
              key={item.key}
              value={item.key}
              className="flex min-h-24 flex-col items-start gap-1 whitespace-normal rounded-lg border bg-card px-4 py-3 text-left text-foreground shadow-none hover:bg-slate-50 dark:hover:bg-slate-800 data-[state=active]:border-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white dark:data-[state=active]:border-slate-300 dark:data-[state=active]:bg-slate-200 dark:data-[state=active]:text-slate-950"
            >
              <span className="flex w-full items-center justify-between gap-2 text-sm">
                {item.label}
                <span className="text-2xl font-bold tabular-nums">
                  {isLoading || isError
                    ? '—'
                    : requests.filter((request) =>
                        matchesView(request, item.key),
                      ).length}
                </span>
              </span>
              <span className="text-xs font-normal">{item.hint}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <MaintenanceFilters
            filters={filters}
            onFiltersChange={updateFilters}
          />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span role="status" className="text-muted-foreground">
              {filteredRequests.length} yêu cầu trong dữ liệu đã tải
              {requests.length === 100 ? ' (tối đa 100 yêu cầu gần nhất)' : ''}
            </span>
            {(Object.values(filters).some(Boolean) || view !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => setParams({})}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Xóa bộ lọc
              </Button>
            )}
          </div>
        </div>
        <TabsContent value={view} className="mt-0">
          {isError ? (
            <div role="alert" className="rounded-lg border p-8 text-center">
              <p>Không thể tải yêu cầu bảo trì.</p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => refetch()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Thử lại
              </Button>
            </div>
          ) : (
            <MaintenanceRequestTable
              requests={filteredRequests}
              isLoading={isLoading}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
