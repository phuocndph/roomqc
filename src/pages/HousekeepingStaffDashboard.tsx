import { useState, useMemo } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { StaffTaskRow } from '@/components/housekeeping/StaffTaskRow'
import { FloorFilter } from '@/components/housekeeping/FloorFilter'
import { TaskDetailDialog } from '@/components/housekeeping/TaskDetailDialog'
import { useUnifiedTasks } from '@/hooks/useUnifiedTasks'
import { useCompletedTasksToday } from '@/hooks/useCompletedTasksToday'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { TASK_TYPE_LABELS } from '@/types/housekeeping.types'
import type { HousekeepingTaskWithDetails } from '@/types/housekeeping.types'
import { useSearchParams } from 'react-router-dom'

export default function HousekeepingStaffDashboard() {
  const [searchParams] = useSearchParams()
  const initialTaskId = searchParams.get('task')

  const { data: unifiedTasks, isLoading } = useUnifiedTasks()
  const { data: completedToday = [] } = useCompletedTasksToday()
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId)
  const [completedOpen, setCompletedOpen] = useState(false)

  // Only housekeeping tasks for this dashboard
  const housekeepingTasks = useMemo(() =>
    (unifiedTasks || [])
      .filter(t => t.source === 'housekeeping' && t.originalHousekeepingTask)
      .map(t => t.originalHousekeepingTask!),
    [unifiedTasks]
  )

  // Floor data
  const { floors, taskCountByFloor } = useMemo(() => {
    const countMap: Record<number, number> = {}
    housekeepingTasks.forEach(t => {
      const f = t.room?.floor
      if (f != null) countMap[f] = (countMap[f] || 0) + 1
    })
    return {
      floors: Object.keys(countMap).map(Number).sort((a, b) => a - b),
      taskCountByFloor: countMap,
    }
  }, [housekeepingTasks])

  // Filter by floor
  const filtered = selectedFloor != null
    ? housekeepingTasks.filter(t => t.room?.floor === selectedFloor)
    : housekeepingTasks

  // Group by status & priority
  const urgent = filtered.filter(t => t.status === 'pending' && (t.priority === 'urgent' || t.priority === 'high'))
  const pending = filtered.filter(t => t.status === 'pending' && t.priority !== 'urgent' && t.priority !== 'high')
  const inProgress = filtered.filter(t => t.status === 'in_progress')

  const activeCount = urgent.length + pending.length + inProgress.length

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-3">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header — minimal */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Công việc</h1>
            <p className="text-xs text-muted-foreground">
              {activeCount > 0
                ? `${activeCount} việc cần làm`
                : 'Không có việc nào'}
            </p>
          </div>
          {completedToday.length > 0 && (
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">{completedToday.length} xong</span>
            </div>
          )}
        </div>
      </div>

      {/* Floor filter */}
      <div className="pt-3">
        <FloorFilter
          floors={floors}
          taskCountByFloor={taskCountByFloor}
          totalCount={housekeepingTasks.length}
          selectedFloor={selectedFloor}
          onSelect={setSelectedFloor}
        />
      </div>

      {/* Empty state */}
      {activeCount === 0 && completedToday.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center px-6">
          <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-3">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <p className="text-base font-medium">Tuyệt vời!</p>
          <p className="text-sm text-muted-foreground mt-1">Không có công việc nào cần xử lý</p>
        </div>
      )}

      {/* Urgent section */}
      {urgent.length > 0 && (
        <Section title="Cần làm gấp" count={urgent.length} color="text-red-600" className="mt-2">
          {urgent.map(t => (
            <StaffTaskRow key={t.id} task={t} onTap={() => setSelectedTaskId(t.id)} />
          ))}
        </Section>
      )}

      {/* In progress */}
      {inProgress.length > 0 && (
        <Section title="Đang làm" count={inProgress.length} color="text-blue-600" className="mt-2">
          {inProgress.map(t => (
            <StaffTaskRow key={t.id} task={t} onTap={() => setSelectedTaskId(t.id)} />
          ))}
        </Section>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <Section title="Chưa làm" count={pending.length} color="text-muted-foreground" className="mt-2">
          {pending.map(t => (
            <StaffTaskRow key={t.id} task={t} onTap={() => setSelectedTaskId(t.id)} />
          ))}
        </Section>
      )}

      {/* Completed today — collapsible */}
      {completedToday.length > 0 && (
        <div className="mt-4">
          <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-medium text-green-600 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Đã xong hôm nay ({completedToday.length})
                </span>
                <span className="text-xs text-muted-foreground">
                  {completedOpen ? 'Thu gọn' : 'Xem'}
                </span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t">
                {completedToday.map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 opacity-60">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-sm font-medium">
                      P.{t.room?.room_number || '?'}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {TASK_TYPE_LABELS[t.task_type as keyof typeof TASK_TYPE_LABELS] || t.task_type}
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Task detail dialog */}
      <TaskDetailDialog
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onOpenChange={open => !open && setSelectedTaskId(null)}
      />
    </div>
  )
}

// Section component
function Section({
  title,
  count,
  color,
  className,
  children,
}: {
  title: string
  count: number
  color: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <div className={cn('flex items-center gap-2 px-4 py-2 text-sm font-medium', color)}>
        {title} ({count})
      </div>
      <div className="border-t">{children}</div>
    </div>
  )
}
