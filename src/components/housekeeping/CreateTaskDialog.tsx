import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  ClipboardCheck, 
  Sparkles, 
  DoorOpen, 
  Package, 
  MoreHorizontal,
  Loader2
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { useCreateTask } from '@/hooks/useHousekeepingTasks'
import { useOnShiftStaffList } from '@/hooks/useOnShiftStaffList'
import { cn } from '@/lib/utils'
import type { TaskType, TaskPriority, DuplicateTaskInfo } from '@/types/housekeeping.types'
import { TASK_TYPE_LABELS, PRIORITY_LABELS, parseDuplicateTaskError } from '@/types/housekeeping.types'

const TASK_ICONS: Record<TaskType, typeof ClipboardCheck> = {
  checkout_inspection: ClipboardCheck,
  cleaning: Sparkles,
  checkin_prep: DoorOpen,
  amenity_request: Package,
  delivery_confirmation: Package, // System-created task
  other: MoreHorizontal
}

// Task types available for manual creation (excludes system-created types)
const MANUAL_TASK_TYPES: TaskType[] = ['checkout_inspection', 'cleaning', 'checkin_prep', 'amenity_request', 'other']

const formSchema = z.object({
  task_type: z.enum(['checkout_inspection', 'cleaning', 'checkin_prep', 'amenity_request', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  assigned_to: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

// Task types that can be manually created
type ManualTaskType = 'checkout_inspection' | 'cleaning' | 'checkin_prep' | 'amenity_request' | 'other'

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: string
  roomNumber: string
  hotelId: string
  bookingId?: string
  defaultTaskType?: ManualTaskType
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  roomId,
  roomNumber,
  hotelId,
  bookingId,
  defaultTaskType = 'cleaning'
}: CreateTaskDialogProps) {
  const navigate = useNavigate()
  const { mutateAsync: createTask, isPending } = useCreateTask()
  const { data: staffList = [], isLoading: staffLoading } = useOnShiftStaffList(hotelId)
  const [duplicateTask, setDuplicateTask] = useState<DuplicateTaskInfo | null>(null)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      task_type: defaultTaskType,
      priority: 'medium',
      assigned_to: '',
      title: '',
      description: '',
      notes: '',
    }
  })

  const selectedTaskType = form.watch('task_type')

  const onSubmit = async (data: FormData) => {
    setDuplicateTask(null)
    
    try {
      await createTask({
        hotel_id: hotelId,
        room_id: roomId,
        booking_id: bookingId,
        task_type: data.task_type as TaskType,
        priority: data.priority as TaskPriority,
        assigned_to: data.assigned_to || undefined,
        title: data.title || undefined,
        description: data.description || undefined,
        notes: data.notes || undefined,
      })
      
      form.reset()
      onOpenChange(false)
    } catch (error) {
      // Check for duplicate task error
      const duplicateInfo = parseDuplicateTaskError(error as Error)
      if (duplicateInfo) {
        setDuplicateTask(duplicateInfo)
        return
      }
      // Other errors handled in hook
    }
  }

  const handleViewExistingTask = () => {
    onOpenChange(false)
    navigate(`/my-tasks?task=${duplicateTask?.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo yêu cầu công việc - P.{roomNumber}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Duplicate Task Warning */}
            {duplicateTask && (
              <Alert variant="destructive" className="border-amber-500 bg-amber-50 text-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="ml-2">
                  <p className="font-medium">Phòng này đã có công việc "{TASK_TYPE_LABELS[selectedTaskType]}"</p>
                  <p className="text-sm mt-1">
                    Trạng thái: {duplicateTask.status === 'in_progress' ? 'Đang thực hiện' : 'Chờ xử lý'}
                    {duplicateTask.assignedName && ` • ${duplicateTask.assignedName}`}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button 
                      type="button" 
                      size="sm" 
                      variant="outline" 
                      onClick={handleViewExistingTask}
                      className="h-7 text-xs"
                    >
                      Xem công việc
                    </Button>
                    <Button 
                      type="button" 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setDuplicateTask(null)}
                      className="h-7 text-xs"
                    >
                      Đóng
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Task Type */}
            <FormField
              control={form.control}
              name="task_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại công việc</FormLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {MANUAL_TASK_TYPES.map((type) => {
                      const Icon = TASK_ICONS[type]
                      const isSelected = field.value === type
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => field.onChange(type)}
                          className={cn(
                            'flex items-center gap-2 p-2.5 rounded-lg border text-left transition-colors',
                            isSelected 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:bg-muted/50'
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
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Priority */}
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mức độ ưu tiên</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex gap-2"
                    >
                      {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
                        <div key={priority} className="flex items-center">
                          <RadioGroupItem
                            value={priority}
                            id={`priority-${priority}`}
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor={`priority-${priority}`}
                            className={cn(
                              'cursor-pointer px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
                              'peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5',
                              priority === 'urgent' && 'peer-data-[state=checked]:border-red-500 peer-data-[state=checked]:bg-red-50 peer-data-[state=checked]:text-red-700',
                              priority === 'high' && 'peer-data-[state=checked]:border-orange-500 peer-data-[state=checked]:bg-orange-50 peer-data-[state=checked]:text-orange-700',
                              priority === 'medium' && 'peer-data-[state=checked]:border-amber-500 peer-data-[state=checked]:bg-amber-50 peer-data-[state=checked]:text-amber-700',
                              priority === 'low' && 'peer-data-[state=checked]:border-muted-foreground peer-data-[state=checked]:bg-muted'
                            )}
                          >
                            {PRIORITY_LABELS[priority]}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Assign to */}
            <FormField
              control={form.control}
              name="assigned_to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    Giao cho
                    <span className="text-muted-foreground text-xs font-normal">(đang trong ca)</span>
                  </FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={staffLoading}>
                    <FormControl>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={staffLoading ? 'Đang tải...' : 'Chọn nhân viên'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
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
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Title (optional) */}
            {selectedTaskType === 'other' && (
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tiêu đề</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nhập tiêu đề công việc" className="h-9" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ghi chú chi tiết</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Mô tả chi tiết yêu cầu..."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 h-9"
              >
                Hủy
              </Button>
              <Button type="submit" disabled={isPending} className="flex-1 h-9">
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Gửi yêu cầu
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
