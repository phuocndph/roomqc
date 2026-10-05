import { useNavigate } from 'react-router-dom'
import { PullToRefresh } from '@/components/mobile/TouchOptimized'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAccessibleReports } from '@/hooks/useAccessibleReports'

export function MobileReportsDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation('reports')
  const { sections, role, department } = useAccessibleReports()

  const roleLabel = (() => {
    if (role === 'department_manager' && department) {
      const map: Record<string, string> = {
        housekeeping: 'Trưởng buồng phòng',
        laundry: 'Trưởng giặt là',
        inventory: 'Trưởng kho',
        maintenance: 'Trưởng bảo trì',
      }
      return map[department] ?? 'Trưởng bộ phận'
    }
    if (role === 'hotel_manager') return 'Quản lý khách sạn'
    if (role === 'owner') return 'Chủ khách sạn'
    if (role === 'super_admin') return 'Super Admin'
    return null
  })()

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['quick-report'] })
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-5 pb-20">
        <div className="px-4 pt-2">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {roleLabel ? `${roleLabel} · ` : ''}{t('description')}
          </p>
        </div>

        {sections.length === 0 ? (
          <div className="px-4">
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Bạn chưa được phân quyền xem báo cáo nào. Liên hệ quản trị viên để được cấp quyền.
              </CardContent>
            </Card>
          </div>
        ) : (
          sections.map(({ section, reports }) => (
            <div key={section.id} className="px-4 space-y-2">
              <div className="flex items-end justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </h2>
                <span className="text-[11px] text-muted-foreground">{reports.length} báo cáo</span>
              </div>
              <div className="grid gap-2">
                {reports.map((report) => (
                  <Card
                    key={report.id}
                    className="cursor-pointer active:scale-[0.98] transition-transform"
                    onClick={() => navigate(report.path)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm">{report.title}</h3>
                        {report.isNew && (
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5">Mới</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {report.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </PullToRefresh>
  )
}
