import { useState, useMemo } from 'react'
import { Search, User, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useReassignTask } from '@/hooks/useHousekeepingTasks'
import { useOnShiftStaffList } from '@/hooks/useOnShiftStaffList'
import { 
  TASK_TYPE_LABELS,
  type TaskType,
  type HousekeepingTaskWithDetails 
} from '@/types/housekeeping.types'
import { cn } from '@/lib/utils'

interface AssignTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: HousekeepingTaskWithDetails | null
  hotelId?: string
}

export function AssignTaskDialog({ open, onOpenChange, task, hotelId }: AssignTaskDialogProps) {
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const { data: staffList, isLoading: loadingStaff } = useOnShiftStaffList(hotelId)
  const reassignTask = useReassignTask()

  // Filter and sort staff
  const filteredStaff = useMemo(() => {
    if (!staffList) return []

    let result = staffList

    // Filter by search
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      result = result.filter(s =>
        s.full_name.toLowerCase().includes(searchLower) ||
        s.position_name?.toLowerCase().includes(searchLower)
      )
    }

    // Sort: available first, then by name
    const statusOrder: Record<string, number> = {
      available: 0,
      busy: 1,
      break: 2,
      offline: 3,
    }
    result.sort((a, b) => {
      const statusDiff = (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4)
      if (statusDiff !== 0) return statusDiff
      return a.full_name.localeCompare(b.full_name)
    })

    return result
  }, [staffList, search])

  const handleSubmit = async () => {
    if (!task || !selectedUserId) return

    await reassignTask.mutateAsync({
      taskId: task.id,
      newAssigneeId: selectedUserId,
      reason: reason.trim() || undefined
    })

    // Reset and close
    setSelectedUserId(null)
    setReason('')
    setSearch('')
    onOpenChange(false)
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedUserId(null)
      setReason('')
      setSearch('')
    }
    onOpenChange(open)
  }

  const isReassignment = !!task?.assigned_to

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isReassignment ? 'Chuyển công việc' : 'Giao công việc'}
          </DialogTitle>
          <DialogDescription>
            {task?.room?.room_number && (
              <span className="font-mono font-medium">
                Phòng {task.room.room_number}
              </span>
            )}
            {' - '}
            {TASK_TYPE_LABELS[task?.task_type as TaskType] || task?.task_type}
            {task?.title && ` - ${task.title}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm nhân viên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Staff List */}
          <ScrollArea className="h-[200px] border rounded-lg">
            {loadingStaff ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Đang tải...
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Không tìm thấy nhân viên
              </div>
            ) : (
              <div className="p-1">
                {filteredStaff.map((staff) => {
                  const isCurrentAssignee = task?.assigned_to === staff.id
                  const isSelected = selectedUserId === staff.id

                  return (
                    <button
                      key={staff.id}
                      type="button"
                      disabled={isCurrentAssignee}
                      onClick={() => setSelectedUserId(staff.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-2 rounded-lg transition-colors',
                        'hover:bg-muted/50 text-left',
                        isSelected && 'bg-primary/10 border border-primary',
                        isCurrentAssignee && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={staff.avatar_url || ''} />
                        <AvatarFallback className="text-xs">
                          {staff.full_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {staff.full_name}
                          {isCurrentAssignee && (
                            <span className="text-muted-foreground font-normal">
                              {' '}(đang làm)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {staff.position_name || 'Nhân viên'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Status indicator */}
                        <span
                          className={cn(
                            'h-2 w-2 rounded-full',
                            staff.status === 'available' && 'bg-green-500',
                            staff.status === 'busy' && 'bg-amber-500',
                            staff.status === 'break' && 'bg-blue-500',
                            staff.status === 'offline' && 'bg-gray-300'
                          )}
                        />
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </ScrollArea>

          {/* Reason (optional) */}
          {isReassignment && (
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm">
                Lý do chuyển việc (không bắt buộc)
              </Label>
              <Textarea
                id="reason"
                placeholder="Ví dụ: Nhân viên cũ bận, cần người hỗ trợ..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedUserId || reassignTask.isPending}
          >
            {reassignTask.isPending ? 'Đang xử lý...' : (isReassignment ? 'Chuyển việc' : 'Giao việc')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
