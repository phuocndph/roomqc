import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { StaffPerf } from '@/hooks/useHousekeepingDashboardPanels'

interface Props {
  data?: StaffPerf[]
  loading?: boolean
}

export function StaffPerformancePanel({ data, loading }: Props) {
  const list = data || []
  return (
    <div className="border rounded-lg flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-medium">Hiệu suất nhân viên</h3>
        <Link to="/staff" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
          Xem tất cả <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="flex-1 p-2">
        {loading ? (
          <div className="h-32 animate-pulse bg-muted/30 rounded" />
        ) : list.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground py-6">
            Chưa giao việc hôm nay
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left font-normal px-2 py-1">Nhân viên</th>
                <th className="text-right font-normal px-2 py-1">Hoàn thành</th>
                <th className="text-right font-normal px-2 py-1 w-24">%</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const pct = s.total ? Math.round((s.completed / s.total) * 100) : 0
                return (
                  <tr key={s.userId} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={s.avatarUrl || undefined} />
                          <AvatarFallback className="text-[10px]">{s.fullName.slice(0, 2)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate">{s.fullName}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{s.completed}/{s.total}</td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className="h-1.5 w-14 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium tabular-nums w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
