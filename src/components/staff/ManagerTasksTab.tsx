import { useState, useMemo, useEffect } from 'react'
import { 
  Clock, 
  PlayCircle, 
  CheckCircle2, 
  AlertCircle,
  UserX,
  Filter,
  Search,
  Plus,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useTaskStats, useAllHotelTasks } from '@/hooks/useHousekeepingTasks'
import { useHotelContext } from '@/contexts/HotelContext'
import { ManagerTaskCard } from './ManagerTaskCard'
import { AssignTaskDialog } from './AssignTaskDialog'
import { 
  TASK_TYPE_LABELS, 
  STATUS_LABELS,
  type TaskStatus,
  type TaskType,
  type HousekeepingTaskWithDetails
} from '@/types/housekeeping.types'
import { cn } from '@/lib/utils'

export function ManagerTasksTab() {
  const { selectedHotel } = useHotelContext()
  const hotelId = selectedHotel?.id

  // Stats
  const { data: stats, isLoading: loadingStats } = useTaskStats(hotelId)

  // Filters
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<TaskType | 'all'>('all')
  const [search, setSearch] = useState('')

  // Tasks data
  const { data: tasks, isLoading: loadingTasks } = useAllHotelTasks(hotelId, statusFilter === 'all' ? 'all' : statusFilter)

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<HousekeepingTaskWithDetails | null>(null)

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    unassigned: true,
  })

  // Group tasks by assigned user
  const groupedTasks = useMemo(() => {
    if (!tasks) return { unassigned: [], byUser: {} as Record<string, HousekeepingTaskWithDetails[]> }

    let filtered = tasks

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(t => t.task_type === typeFilter)
    }

    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(t =>
        t.room?.room_number?.toLowerCase().includes(searchLower) ||
        t.title?.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower) ||
        t.assigned_user?.full_name?.toLowerCase().includes(searchLower) ||
        TASK_TYPE_LABELS[t.task_type as TaskType]?.toLowerCase().includes(searchLower)
      )
    }

    const unassigned: HousekeepingTaskWithDetails[] = []
    const byUser: Record<string, HousekeepingTaskWithDetails[]> = {}

    filtered.forEach(task => {
      if (!task.assigned_to) {
        unassigned.push(task)
      } else {
        const userId = task.assigned_to
        const userName = task.assigned_user?.full_name || 'Không xác định'
        const key = `${userId}|${userName}`
        if (!byUser[key]) {
          byUser[key] = []
        }
        byUser[key].push(task)
      }
    })

    return { unassigned, byUser }
  }, [tasks, typeFilter, search])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const handleAssignTask = (task: HousekeepingTaskWithDetails) => {
    setSelectedTask(task)
    setAssignDialogOpen(true)
  }

  // Stats cards - minimalist style (no background colors)
  const statsCards = [
    { 
      label: 'Chờ xử lý', 
      value: stats?.pending || 0, 
      icon: Clock, 
      color: 'text-amber-600',
    },
    { 
      label: 'Đang làm', 
      value: stats?.inProgress || 0, 
      icon: PlayCircle, 
      color: 'text-blue-600',
    },
    { 
      label: 'Hoàn thành hôm nay', 
      value: stats?.completedToday || 0, 
      icon: CheckCircle2, 
      color: 'text-green-600',
    },
    { 
      label: 'Chưa giao', 
      value: stats?.unassigned || 0, 
      icon: UserX, 
      color: stats?.unassigned ? 'text-red-600' : 'text-muted-foreground',
    },
  ]

  if (loadingStats || loadingTasks) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-10" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stats Cards */}
      <div className="p-4 border-b">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statsCards.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-3 p-3 rounded-lg border"
            >
              <stat.icon className={cn('h-5 w-5', stat.color)} />
              <div>
                <p className={cn('text-xl font-semibold', stat.color)}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo phòng, loại công việc..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | 'all')}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="pending">Chờ xử lý</SelectItem>
              <SelectItem value="in_progress">Đang làm</SelectItem>
              <SelectItem value="completed">Hoàn thành</SelectItem>
              <SelectItem value="cancelled">Đã hủy</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TaskType | 'all')}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="Loại công việc" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại</SelectItem>
              {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Task List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Unassigned Section */}
          {groupedTasks.unassigned.length > 0 && (
            <Collapsible
              open={expandedSections.unassigned}
              onOpenChange={() => toggleSection('unassigned')}
            >
              <CollapsibleTrigger className="flex items-center w-full p-2 rounded-lg border hover:bg-muted/50 transition-colors">
                <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                <span className="font-medium text-red-600">Chưa giao</span>
                <span className="flex-1" />
                <span className="text-xs text-muted-foreground mr-2">
                  {groupedTasks.unassigned.length} công việc
                </span>
                {expandedSections.unassigned ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {groupedTasks.unassigned.map(task => (
                  <ManagerTaskCard
                    key={task.id}
                    task={task}
                    onAssign={() => handleAssignTask(task)}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* By User Sections */}
          {Object.entries(groupedTasks.byUser).map(([key, userTasks]) => {
            const [userId, userName] = key.split('|')
            const inProgressCount = userTasks.filter(t => t.status === 'in_progress').length
            const isExpanded = expandedSections[userId] ?? true

            return (
              <Collapsible
                key={userId}
                open={isExpanded}
                onOpenChange={() => toggleSection(userId)}
              >
                <CollapsibleTrigger className="flex items-center w-full p-2 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center mr-2">
                    <span className="text-xs font-medium text-primary">
                      {userName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="font-medium">{userName}</span>
                  <span className="flex-1" />
                  <span className="text-xs text-muted-foreground mr-2">
                    {userTasks.length} việc{inProgressCount > 0 && ` • ${inProgressCount} đang làm`}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1 ml-6">
                  {userTasks.map(task => (
                    <ManagerTaskCard
                      key={task.id}
                      task={task}
                      onAssign={() => handleAssignTask(task)}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )
          })}

          {/* Empty state */}
          {groupedTasks.unassigned.length === 0 && Object.keys(groupedTasks.byUser).length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mb-4 text-green-500" />
              <p className="text-lg font-medium">Không có công việc nào</p>
              <p className="text-sm">Tất cả công việc đã được hoàn thành</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Assign Dialog */}
      <AssignTaskDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        task={selectedTask}
        hotelId={hotelId}
      />
    </div>
  )
}
