import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Plus, Calendar, FileText, Users, Wrench, Clock, CheckCircle, DollarSign, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMaintenanceDashboard } from '@/hooks/useMaintenanceDashboard'
import { ActiveRequestsSection } from '@/components/maintenance/ActiveRequestsSection'
import { MobileMaintenanceDashboard } from '@/components/maintenance/MobileMaintenanceDashboard'
import { useBreakpoint } from '@/lib/breakpoints'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export default function MaintenanceDashboard() {
  const { t } = useTranslation('maintenance')
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const { data, isLoading } = useMaintenanceDashboard()

  if (isMobile) {
    return <MobileMaintenanceDashboard />
  }

  const stats = data?.stats || {
    total: 0, totalLast30Days: 0, inProgress: 0, completed: 0,
    completedLast30Days: 0, completionRate: 0, avgTime: 0,
    costLast30Days: 0, mttr: 0, mtbf: 0, firstTimeFixRate: 0,
  }

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', notation: 'compact' }).format(value)

  return (
    <div className="space-y-4">
      <PageHeader title={t('dashboard.title')} description={t('dashboard.description')}>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/maintenance/recurring-issues')}>
            <Calendar className="h-4 w-4 mr-1" />
            {t('dashboard.schedule')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/reports/maintenance')}>
            <FileText className="h-4 w-4 mr-1" />
            {t('dashboard.reports')}
          </Button>
          <Button size="sm" onClick={() => navigate('/maintenance/requests/new')}>
            <Plus className="h-4 w-4 mr-1" />
            {t('dashboard.createRequest')}
          </Button>
        </div>
      </PageHeader>

      {/* Stats Row */}
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="border rounded-lg p-3">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-5">
          <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Tổng yêu cầu</span>
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.total}</div>
            <span className="text-xs text-muted-foreground">+{stats.totalLast30Days} (30d)</span>
          </div>
          <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Đang xử lý</span>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.inProgress}</div>
            <span className="text-xs text-muted-foreground">Cần xử lý</span>
          </div>
          <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Hoàn thành</span>
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <span className="text-xs text-muted-foreground">{stats.completionRate}%</span>
          </div>
          <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Thời gian TB</span>
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.avgTime}h</div>
            <span className="text-xs text-muted-foreground">MTTR: {stats.mttr}h</span>
          </div>
          <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Chi phí (30d)</span>
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{formatCurrency(stats.costLast30Days)}</div>
            <span className="text-xs text-muted-foreground">FTF: {stats.firstTimeFixRate}%</span>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="border rounded-lg p-3">
        <div className="text-sm font-medium mb-2">{t('dashboard.quickActions')}</div>
        <div className="grid gap-2 md:grid-cols-4">
          <button 
            onClick={() => navigate('/maintenance/requests/new')}
            className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 text-left"
          >
            <Plus className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-medium">{t('dashboard.actions.createNew')}</div>
              <div className="text-xs text-muted-foreground">{t('dashboard.actions.createNewDesc')}</div>
            </div>
          </button>
          <button 
            onClick={() => navigate('/maintenance/recurring-issues')}
            className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 text-left"
          >
            <Calendar className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-medium">{t('dashboard.actions.schedule')}</div>
              <div className="text-xs text-muted-foreground">{t('dashboard.actions.scheduleDesc')}</div>
            </div>
          </button>
          <button 
            onClick={() => navigate('/reports/maintenance')}
            className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 text-left"
          >
            <FileText className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-medium">{t('dashboard.actions.viewReports')}</div>
              <div className="text-xs text-muted-foreground">{t('dashboard.actions.viewReportsDesc')}</div>
            </div>
          </button>
          <button 
            onClick={() => navigate('/settings/users')}
            className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/50 text-left"
          >
            <Users className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-medium">{t('dashboard.actions.manageTech')}</div>
              <div className="text-xs text-muted-foreground">{t('dashboard.actions.manageTechDesc')}</div>
            </div>
          </button>
        </div>
      </div>

      {data?.activeRequests && <ActiveRequestsSection requests={data.activeRequests} />}

      {/* Recent Completions */}
      {data?.recentCompletions && data.recentCompletions.length > 0 && (
        <div className="border rounded-lg">
          <div className="px-3 py-2 border-b bg-muted/30">
            <span className="text-sm font-medium">{t('dashboard.recentCompletions')}</span>
          </div>
          <div className="divide-y">
            {data.recentCompletions.slice(0, 10).map((request: any) => (
              <div key={request.id} className="flex items-center gap-3 px-3 py-2">
                <span className="text-green-600">✓</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{request.title}</p>
                  <p className="text-xs text-muted-foreground">{request.request_code} • {request.location}</p>
                </div>
                {request.actual_cost && (
                  <span className="text-xs text-muted-foreground">{formatCurrency(request.actual_cost)}</span>
                )}
                {(() => {
                  const completionDate = request.completed_at || request.updated_at || request.created_at
                  if (!completionDate) return null
                  return (
                    <span className="text-xs text-muted-foreground">
                      {new Date(completionDate).toLocaleDateString('vi-VN')}
                    </span>
                  )
                })()}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
