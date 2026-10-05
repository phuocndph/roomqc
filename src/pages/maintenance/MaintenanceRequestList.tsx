import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/shared/PageHeader'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Button } from '@/components/ui/button'
import { Plus, Wrench, Clock, PlayCircle, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMaintenanceRequests, type MaintenanceFilters as MaintenanceFilterValues } from '@/hooks/useMaintenanceRequests'
import { MaintenanceRequestTable } from '@/components/maintenance/MaintenanceRequestTable'
import { MaintenanceFilters } from '@/components/maintenance/MaintenanceFilters'
import { MobileMaintenanceRequestList } from '@/components/maintenance/MobileMaintenanceRequestList'
import { useBreakpoint } from '@/lib/breakpoints'

export default function MaintenanceRequestList() {
  const { t } = useTranslation('maintenance')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isMobile } = useBreakpoint()
  const [tab, setTab] = useState(() => {
    const requested = searchParams.get('status')
    return requested && ['all', 'waiting', 'pending', 'in_progress', 'completed', 'cancelled'].includes(requested)
      ? requested
      : 'all'
  })
  const [filters, setFilters] = useState<MaintenanceFilterValues>(() => ({
    priority: searchParams.get('priority') || undefined,
  }))
  
  const { data: allRequests } = useMaintenanceRequests(filters)
  
  const counts = {
    all: allRequests?.length || 0,
    waiting: allRequests?.filter((r: any) => r.status === 'waiting').length || 0,
    pending: allRequests?.filter((r: any) => r.status === 'pending').length || 0,
    in_progress: allRequests?.filter((r: any) => r.status === 'in_progress').length || 0,
    completed: allRequests?.filter((r: any) => r.status === 'completed').length || 0,
    cancelled: allRequests?.filter((r: any) => r.status === 'cancelled').length || 0,
  }

  const filteredRequests = tab === 'all' 
    ? allRequests 
    : allRequests?.filter((r: any) => r.status === tab)

  if (isMobile) {
    return <MobileMaintenanceRequestList />
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
      >
        <PermissionGate module="maintenance" action="create">
          <Button onClick={() => navigate('/maintenance/requests/new')}>
            <Plus className="mr-2 h-4 w-4" />
            {t('list.createRequest')}
          </Button>
        </PermissionGate>
      </PageHeader>

      {/* Stats Row */}
      <div className="grid gap-3 md:grid-cols-5">
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Tổng yêu cầu</p>
            <p className="text-xl font-bold">{counts.all}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-xs text-muted-foreground">Chờ tiếp nhận</p>
            <p className="text-xl font-bold text-amber-600">{counts.waiting}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <Clock className="h-5 w-5 text-blue-600" />
          <div>
            <p className="text-xs text-muted-foreground">Đã tiếp nhận</p>
            <p className="text-xl font-bold text-blue-600">{counts.pending}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <PlayCircle className="h-5 w-5 text-purple-600" />
          <div>
            <p className="text-xs text-muted-foreground">Đang xử lý</p>
            <p className="text-xl font-bold text-purple-600">{counts.in_progress}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-xs text-muted-foreground">Hoàn thành</p>
            <p className="text-xl font-bold text-green-600">{counts.completed}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <MaintenanceFilters filters={filters} onFiltersChange={setFilters} />

      {/* Tabs + Table */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9 bg-muted/50">
          <TabsTrigger value="all" className="text-xs h-7 data-[state=active]:bg-background">
            Tất cả ({counts.all})
          </TabsTrigger>
          <TabsTrigger value="waiting" className="text-xs h-7 data-[state=active]:bg-background">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
            Chờ tiếp nhận ({counts.waiting})
          </TabsTrigger>
          <TabsTrigger value="pending" className="text-xs h-7 data-[state=active]:bg-background">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5" />
            Đã tiếp nhận ({counts.pending})
          </TabsTrigger>
          <TabsTrigger value="in_progress" className="text-xs h-7 data-[state=active]:bg-background">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5" />
            Đang xử lý ({counts.in_progress})
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-xs h-7 data-[state=active]:bg-background">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />
            Hoàn thành ({counts.completed})
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="text-xs h-7 data-[state=active]:bg-background">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-1.5" />
            Đã hủy ({counts.cancelled})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-3">
          <MaintenanceRequestTable
            requests={filteredRequests || []}
            isLoading={!allRequests}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
