import { useState } from 'react'
import { Loader2, ClipboardCheck, Sparkles, DoorOpen, Package, MoreHorizontal } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateTask } from '@/hooks/useHousekeepingTasks'
import { useOnShiftStaffList } from '@/hooks/useOnShiftStaffList'
import { cn } from '@/lib/utils'
import type { TaskType, TaskPriority } from '@/types/housekeeping.types'
import { TASK_TYPE_LABELS, PRIORITY_LABELS } from '@/types/housekeeping.types'

const TASK_ICONS: Record<TaskType, typeof ClipboardCheck> = {
  checkout_inspection: ClipboardCheck,
  cleaning: Sparkles,
  checkin_prep: DoorOpen,
  amenity_request: Package,
  delivery_confirmation: Package,
  other: MoreHorizontal
}

// Task types available for manual creation
const MANUAL_TASK_TYPES: TaskType[] = ['checkout_inspection', 'cleaning', 'checkin_prep', 'amenity_request', 'other']

interface RoomInfo {
  id: string
  room_number: string
  hotel_id: string
}

interface BulkCreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rooms: RoomInfo[]
  onSuccess?: () => void
}

export function BulkCreateTaskDialog({
  open,
  onOpenChange,
  rooms,
  onSuccess
}: BulkCreateTaskDialogProps) {
  const { mutateAsync: createTask } = useCreateTask()
  
  const [taskType, setTaskType] = useState<TaskType>('cleaning')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [assignedTo, setAssignedTo] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [skippedRooms, setSkippedRooms] = useState<string[]>([])

  // Get hotel ID from first room (all rooms should be from same hotel)
  const hotelId = rooms[0]?.hotel_id || ''
  const { data: staffList = [], isLoading: staffLoading } = useOnShiftStaffList(hotelId)

  const handleSubmit = async () => {
    if (rooms.length === 0) return
    
    setIsSubmitting(true)
    setSkippedRooms([])
    setProgress({ current: 0, total: rooms.length })

    // Pre-check for existing tasks to avoid duplicates
    const { data: existingTasks } = await supabase
      .from('housekeeping_tasks')
      .select('room_id')
      .in('room_id', rooms.map(r => r.id))
      .eq('task_type', taskType)
      .in('status', ['pending', 'in_progress'])
    
    const existingRoomIds = new Set(existingTasks?.map(t => t.room_id) || [])
    const roomsToCreate = rooms.filter(r => !existingRoomIds.has(r.id))
    const skipped = rooms.filter(r => existingRoomIds.has(r.id)).map(r => r.room_number)
    
    if (skipped.length > 0) {
      setSkippedRooms(skipped)
      toast.warning(`Bỏ qua ${skipped.length} phòng đã có công việc "${TASK_TYPE_LABELS[taskType]}"`)
    }
    
    if (roomsToCreate.length === 0) {
      setIsSubmitting(false)
      return
    }
    
    setProgress({ current: 0, total: roomsToCreate.length })

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < roomsToCreate.length; i++) {
      const room = roomsToCreate[i]
      try {
        await createTask({
          hotel_id: room.hotel_id,
          room_id: room.id,
          task_type: taskType,
          priority,
          assigned_to: assignedTo || undefined,
          notes: notes || undefined,
          skipDuplicateCheck: true, // Already checked above
        })
        successCount++
      } catch (error) {
        console.error(`Failed to create task for room ${room.room_number}:`, error)
        failCount++
      }
      setProgress({ current: i + 1, total: roomsToCreate.length })
    }

    setIsSubmitting(false)
    
    if (failCount === 0) {
      if (successCount > 0) {
        toast.success(`Đã tạo ${successCount} yêu cầu công việc`)
      }
      onSuccess?.()
      onOpenChange(false)
      // Reset form
      setTaskType('cleaning')
      setPriority('medium')
      setAssignedTo('')
      setNotes('')
      setSkippedRooms([])
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false)
      setSkippedRooms([])
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo yêu cầu cho {rooms.length} phòng</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Room list */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Phòng đã chọn</Label>
            <div className="flex flex-wrap gap-1.5">
              {rooms.slice(0, 10).map((room) => (
                <Badge key={room.id} variant="secondary" className="text-xs">
                  {room.room_number}
                </Badge>
              ))}
              {rooms.length > 10 && (
                <Badge variant="outline" className="text-xs">
                  +{rooms.length - 10} phòng khác
                </Badge>
              )}
            </div>
          </div>

          {/* Skipped rooms warning */}
          {skippedRooms.length > 0 && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="ml-2 text-amber-800 text-sm">
                Đã bỏ qua {skippedRooms.length} phòng có công việc trùng: {skippedRooms.slice(0, 5).join(', ')}
                {skippedRooms.length > 5 && ` và ${skippedRooms.length - 5} phòng khác`}
              </AlertDescription>
            </Alert>
          )}

          {/* Task Type */}
          <div>
            <Label className="mb-2 block">Loại công việc</Label>
            <div className="grid grid-cols-2 gap-2">
              {MANUAL_TASK_TYPES.map((type) => {
                const Icon = TASK_ICONS[type]
                const isSelected = taskType === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTaskType(type)}
                    disabled={isSubmitting}
                    className={cn(
                      'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors',
                      isSelected 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:bg-muted/50',
                      isSubmitting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Icon className={cn(
                      'h-4 w-4 shrink-0',
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    )} />
                    <span className="text-sm truncate">{TASK_TYPE_LABELS[type]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Priority */}
          <div>
            <Label className="mb-2 block">Mức độ ưu tiên</Label>
            <RadioGroup
              value={priority}
              onValueChange={(v) => setPriority(v as TaskPriority)}
              className="flex gap-2"
              disabled={isSubmitting}
            >
              {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => (
                <div key={p} className="flex items-center">
                  <RadioGroupItem
                    value={p}
                    id={`bulk-priority-${p}`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`bulk-priority-${p}`}
                    className={cn(
                      'cursor-pointer px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
                      'peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5',
                      p === 'urgent' && 'peer-data-[state=checked]:border-red-500 peer-data-[state=checked]:bg-red-50 peer-data-[state=checked]:text-red-700',
                      p === 'high' && 'peer-data-[state=checked]:border-orange-500 peer-data-[state=checked]:bg-orange-50 peer-data-[state=checked]:text-orange-700',
                      p === 'medium' && 'peer-data-[state=checked]:border-amber-500 peer-data-[state=checked]:bg-amber-50 peer-data-[state=checked]:text-amber-700',
                      p === 'low' && 'peer-data-[state=checked]:border-muted-foreground peer-data-[state=checked]:bg-muted',
                      isSubmitting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {PRIORITY_LABELS[p]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Assign to */}
          <div>
            <Label className="mb-2 flex items-center gap-1">
              Giao cho
              <span className="text-muted-foreground text-xs font-normal">(đang trong ca)</span>
            </Label>
            <Select 
              value={assignedTo} 
              onValueChange={setAssignedTo} 
              disabled={staffLoading || isSubmitting}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={staffLoading ? 'Đang tải...' : 'Chọn nhân viên (tùy chọn)'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Không chỉ định</SelectItem>
                {staffList.length === 0 ? (
                  <div className="py-2 px-3 text-sm text-muted-foreground">
                    Không có nhân viên đang trong ca
                  </div>
                ) : (
                  staffList.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.full_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label className="mb-2 block">Ghi chú</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú áp dụng cho tất cả phòng..."
              rows={2}
              disabled={isSubmitting}
            />
          </div>

          {/* Progress */}
          {isSubmitting && (
            <div className="text-sm text-muted-foreground text-center">
              Đang tạo: {progress.current}/{progress.total}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1 sm:flex-none"
          >
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || rooms.length === 0}
            className="flex-1 sm:flex-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Đang tạo...
              </>
            ) : (
              `Tạo ${rooms.length} yêu cầu`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
