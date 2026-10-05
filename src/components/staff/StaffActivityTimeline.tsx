import { formatDistanceToNow, format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  CheckCircle2, 
  Package, 
  Wrench, 
  Settings, 
  User, 
  FileText,
  Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StaffActivity } from '@/hooks/useStaffActivity'

interface StaffActivityTimelineProps {
  activities: StaffActivity[]
  showUserName?: boolean
}

const entityTypeIcons: Record<string, React.ElementType> = {
  room_check: CheckCircle2,
  inventory: Package,
  maintenance: Wrench,
  item: Package,
  user: User,
  hotel: Settings,
  default: FileText,
}

const actionColors: Record<string, string> = {
  create: 'text-green-600',
  update: 'text-blue-600',
  delete: 'text-red-600',
  complete: 'text-green-600',
  start: 'text-amber-600',
}

export function StaffActivityTimeline({ activities, showUserName = false }: StaffActivityTimelineProps) {
  if (!activities.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">Chưa có hoạt động nào</p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

      <div className="space-y-4">
        {activities.map((activity) => {
          const Icon = entityTypeIcons[activity.entity_type] || entityTypeIcons.default
          const timeAgo = formatDistanceToNow(new Date(activity.created_at), { 
            addSuffix: true, 
            locale: vi 
          })
          const exactTime = format(new Date(activity.created_at), 'HH:mm', { locale: vi })

          return (
            <div key={activity.id} className="relative flex gap-3 pl-2">
              {/* Icon */}
              <div className={cn(
                'relative z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background border',
                actionColors[activity.action] || 'text-muted-foreground'
              )}>
                <Icon className="h-3 w-3" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-4">
                <div className="flex items-baseline gap-2">
                  {showUserName && (
                    <span className="font-medium text-sm">{activity.user_name}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {exactTime} • {timeAgo}
                  </span>
                </div>
                <p className="text-sm text-foreground mt-0.5 line-clamp-2">
                  {activity.description}
                </p>
                {activity.entity_name && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activity.entity_name}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
