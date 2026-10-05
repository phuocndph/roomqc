import { Clock, Calendar, Users, TrendingUp } from 'lucide-react'
import type { ShiftHistoryStats as Stats } from '@/hooks/useShiftHistory'

interface ShiftHistoryStatsProps {
  stats: Stats
  isLoading?: boolean
}

export function ShiftHistoryStats({ stats, isLoading }: ShiftHistoryStatsProps) {
  const items = [
    {
      label: 'Tổng ca',
      value: stats.totalShifts,
      icon: Calendar,
      color: 'text-blue-600',
    },
    {
      label: 'Tổng giờ',
      value: `${stats.totalHours}h`,
      icon: Clock,
      color: 'text-green-600',
    },
    {
      label: 'TB/ca',
      value: `${stats.averageHoursPerShift}h`,
      icon: TrendingUp,
      color: 'text-amber-600',
    },
    {
      label: 'Nhân viên',
      value: stats.uniqueStaffCount,
      icon: Users,
      color: 'text-purple-600',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="border rounded-lg p-3 bg-background"
        >
          <div className="flex items-center gap-2 mb-1">
            <item.icon className={`h-4 w-4 ${item.color}`} />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
          <div className="text-xl font-semibold">
            {isLoading ? (
              <span className="text-muted-foreground">...</span>
            ) : (
              item.value
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
