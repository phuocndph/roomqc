import { CheckCircle2, Circle, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface MaintenanceTimelineProps {
  request: any
}

export const MaintenanceTimeline = ({ request }: MaintenanceTimelineProps) => {
  const steps = [
    {
      label: 'Đang chờ',
      date: request.reported_at,
      completed: request.status !== 'waiting',
      current: request.status === 'waiting',
    },
    {
      label: 'Tiếp nhận',
      date: request.accepted_at,
      completed: ['pending', 'in_progress', 'completed'].includes(request.status),
      current: request.status === 'pending',
    },
    {
      label: 'Đang kiểm tra',
      date: request.started_at,
      completed: ['in_progress', 'completed'].includes(request.status),
      current: request.status === 'in_progress',
    },
    {
      label: 'Hoàn thành',
      date: request.completed_at,
      completed: request.status === 'completed',
      current: false,
    },
  ]

  if (request.status === 'cancelled') {
    return (
      <div className="flex items-center gap-3 text-destructive">
        <Circle className="h-5 w-5" />
        <div>
          <p className="font-medium">Đã hủy</p>
          {request.completed_at && (
            <p className="text-xs text-muted-foreground">
              {format(new Date(request.completed_at), 'PPp', { locale: vi })}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <div key={index} className="flex gap-3">
          <div className="flex flex-col items-center">
            {step.completed ? (
              <CheckCircle2 className={cn("h-5 w-5", step.current ? "text-primary" : "text-muted-foreground")} />
            ) : (
              <Circle className={cn("h-5 w-5", step.current ? "text-primary" : "text-muted-foreground")} />
            )}
            {index < steps.length - 1 && (
              <div className={cn("w-px h-8 mt-2", step.completed ? "bg-muted-foreground" : "bg-muted")} />
            )}
          </div>
          <div className="flex-1 pb-4">
            <p className={cn("font-medium text-sm", step.current && "text-primary")}>
              {step.label}
            </p>
            {step.date && (
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(step.date), 'PPp', { locale: vi })}
              </p>
            )}
            {step.current && !step.date && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Clock className="h-3 w-3" />
                <span>Đang chờ</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
