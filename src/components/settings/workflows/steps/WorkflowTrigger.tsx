import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Zap, Clock, MousePointerClick } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WorkflowTriggerForm {
  trigger_type: 'event' | 'schedule' | 'manual'
  trigger_event?: string
  trigger_schedule?: string
}

interface WorkflowTriggerProps {
  form: WorkflowTriggerForm
  onChange: (updates: Partial<WorkflowTriggerForm>) => void
}

const TRIGGER_EVENTS = [
  // Room events
  { value: 'room_status_change', label: 'Thay đổi trạng thái phòng', group: 'Phòng' },
  { value: 'room_check_completed', label: 'Kiểm tra phòng hoàn thành', group: 'Phòng' },
  { value: 'room_standards_applied', label: 'Setup phòng hoàn thành', group: 'Phòng' },
  { value: 'room.checkout', label: 'Checkout phòng', group: 'Phòng' },
  
  // Housekeeping Task events
  { value: 'housekeeping_task_created', label: 'Công việc mới được tạo', group: 'Công việc' },
  { value: 'housekeeping_task_started', label: 'Nhân viên bắt đầu công việc', group: 'Công việc' },
  { value: 'housekeeping_task_completed', label: 'Công việc hoàn thành', group: 'Công việc' },
  { value: 'housekeeping_task_overdue', label: 'Công việc quá hạn', group: 'Công việc' },
  
  // Stock Adjustment events
  { value: 'adjustment_created', label: 'Phiếu kiểm kê được tạo', group: 'Kiểm kê' },
  { value: 'adjustment_started', label: 'Bắt đầu kiểm kê', group: 'Kiểm kê' },
  { value: 'adjustment_completed', label: 'Hoàn thành kiểm kê (Chờ duyệt)', group: 'Kiểm kê' },
  { value: 'adjustment_approved', label: 'Phiếu kiểm kê được duyệt', group: 'Kiểm kê' },
  { value: 'adjustment_rejected', label: 'Phiếu kiểm kê bị từ chối', group: 'Kiểm kê' },
  
  // Inventory events
  { value: 'inventory_low_stock', label: 'Tồn kho thấp', group: 'Kho' },
  { value: 'inventory_transaction', label: 'Giao dịch kho', group: 'Kho' },
  
  // Laundry events
  { value: 'laundry_batch_status_change', label: 'Thay đổi trạng thái giặt', group: 'Giặt ủi' },
  
  // Maintenance events
  { value: 'maintenance_request_created', label: 'Yêu cầu bảo trì mới', group: 'Bảo trì' },
  { value: 'maintenance_status_change', label: 'Thay đổi trạng thái bảo trì', group: 'Bảo trì' },
]

// Template variables for each trigger type
const TRIGGER_VARIABLES: Record<string, string[]> = {
  room_status_change: ['room_id', 'room_number', 'floor', 'old_status', 'new_status'],
  room_check_completed: ['room_id', 'room_number', 'check_type', 'staff_name', 'issue_summary'],
  room_standards_applied: ['room_id', 'room_number', 'room_type', 'items_count'],
  // Housekeeping task variables
  housekeeping_task_created: ['task_id', 'room_number', 'floor', 'task_type', 'task_type_label', 'priority', 'priority_label', 'assigned_to_name', 'requested_by_name', 'title', 'description'],
  housekeeping_task_started: ['task_id', 'room_number', 'floor', 'task_type', 'task_type_label', 'started_by_name'],
  housekeeping_task_completed: ['task_id', 'room_number', 'floor', 'task_type', 'task_type_label', 'duration_minutes', 'completed_by_name'],
  housekeeping_task_overdue: ['task_id', 'room_number', 'floor', 'task_type', 'task_type_label', 'priority', 'priority_label', 'assigned_to_name', 'overdue_minutes'],
  // Stock adjustment variables
  adjustment_created: ['adjustment_id', 'adjustment_code', 'scheduled_date', 'total_items', 'created_by_name'],
  adjustment_started: ['adjustment_id', 'adjustment_code', 'started_by_name'],
  adjustment_completed: ['adjustment_id', 'adjustment_code', 'total_items', 'completed_by_name'],
  adjustment_approved: ['adjustment_id', 'adjustment_code', 'total_items', 'discrepancy_count', 'approved_by_name'],
  adjustment_rejected: ['adjustment_id', 'adjustment_code', 'rejection_reason', 'rejected_by_name'],
  inventory_low_stock: ['item_id', 'item_name', 'item_code', 'current_stock', 'minimum_stock'],
  inventory_transaction: ['item_id', 'item_name', 'transaction_type', 'quantity'],
  laundry_batch_status_change: ['batch_id', 'batch_code', 'old_status', 'new_status', 'vendor_name', 'total_items'],
  maintenance_request_created: ['request_id', 'room_number', 'issue_type', 'priority', 'description'],
  maintenance_status_change: ['request_id', 'room_number', 'old_status', 'new_status'],
}

const TRIGGER_TYPES = [
  {
    value: 'event',
    label: 'Khi có sự kiện',
    description: 'Kích hoạt khi một sự kiện cụ thể xảy ra',
    icon: Zap,
  },
  {
    value: 'schedule',
    label: 'Theo lịch',
    description: 'Chạy định kỳ theo thời gian đã đặt',
    icon: Clock,
  },
  {
    value: 'manual',
    label: 'Thủ công',
    description: 'Kích hoạt bởi người dùng',
    icon: MousePointerClick,
  },
]

export const WorkflowTrigger = ({ form, onChange }: WorkflowTriggerProps) => {
  const selectedEvent = form.trigger_event
  const availableVariables = selectedEvent ? TRIGGER_VARIABLES[selectedEvent] || [] : []
  const selectedEventInfo = TRIGGER_EVENTS.find(e => e.value === selectedEvent)
  
  // Group events by category
  const groupedEvents = TRIGGER_EVENTS.reduce((acc, event) => {
    if (!acc[event.group]) acc[event.group] = []
    acc[event.group].push(event)
    return acc
  }, {} as Record<string, typeof TRIGGER_EVENTS>)
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Workflow chạy khi nào?</h3>
        <p className="text-sm text-muted-foreground">
          Chọn điều kiện kích hoạt workflow
        </p>
      </div>

      <div>
        <Label className="text-sm font-medium">Loại trigger *</Label>
        <RadioGroup
          value={form.trigger_type}
          onValueChange={(value: any) => onChange({ trigger_type: value })}
          className="mt-3 grid grid-cols-3 gap-3"
        >
          {TRIGGER_TYPES.map((type) => (
            <label
              key={type.value}
              htmlFor={`trigger-${type.value}`}
              className={cn(
                "flex flex-col items-center gap-2 p-4 border rounded-lg cursor-pointer transition-colors",
                form.trigger_type === type.value
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-primary/50"
              )}
            >
              <RadioGroupItem 
                value={type.value} 
                id={`trigger-${type.value}`}
                className="sr-only"
              />
              <type.icon className={cn(
                "h-6 w-6",
                form.trigger_type === type.value ? "text-primary" : "text-muted-foreground"
              )} />
              <div className="text-center">
                <p className={cn(
                  "text-sm font-medium",
                  form.trigger_type === type.value ? "text-primary" : ""
                )}>
                  {type.label}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {type.description}
                </p>
              </div>
            </label>
          ))}
        </RadioGroup>
      </div>

      {form.trigger_type === 'event' && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="event-type">Loại sự kiện *</Label>
            <Select
              value={form.trigger_event}
              onValueChange={(value) => onChange({ trigger_event: value })}
            >
              <SelectTrigger id="event-type" className="mt-1.5">
                <SelectValue placeholder="Chọn sự kiện kích hoạt" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(groupedEvents).map(([group, events]) => (
                  <div key={group}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      {group}
                    </div>
                    {events.map((event) => (
                      <SelectItem key={event.value} value={event.value}>
                        {event.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedEventInfo && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex items-center gap-2 text-primary">
                <Zap className="h-4 w-4" />
                <span className="text-sm font-medium">Khi: {selectedEventInfo.label}</span>
              </div>
            </div>
          )}
          
          {availableVariables.length > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <Label className="text-xs text-muted-foreground">Biến có thể dùng trong Actions:</Label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {availableVariables.map(variable => (
                  <code 
                    key={variable} 
                    className="text-xs px-1.5 py-0.5 bg-background rounded border font-mono"
                  >
                    {`{{${variable}}}`}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {form.trigger_type === 'schedule' && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="schedule">Lịch chạy (Cron Expression) *</Label>
            <Input
              id="schedule"
              value={form.trigger_schedule || ''}
              onChange={(e) => onChange({ trigger_schedule: e.target.value })}
              placeholder="0 9 * * *"
              className="mt-1.5 font-mono"
            />
          </div>
          <div className="p-3 bg-muted/50 rounded-lg space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Ví dụ:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><code className="bg-background px-1 rounded">0 9 * * *</code> = Mỗi ngày lúc 9h</div>
              <div><code className="bg-background px-1 rounded">0 9 * * 1</code> = Thứ 2 hàng tuần lúc 9h</div>
              <div><code className="bg-background px-1 rounded">0 0 1 * *</code> = Đầu mỗi tháng</div>
              <div><code className="bg-background px-1 rounded">*/30 * * * *</code> = Mỗi 30 phút</div>
            </div>
          </div>
        </div>
      )}

      {form.trigger_type === 'manual' && (
        <div className="p-4 bg-muted/30 rounded-lg border text-center">
          <MousePointerClick className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Workflow này sẽ chỉ chạy khi được kích hoạt thủ công bởi người dùng
          </p>
        </div>
      )}
    </div>
  )
}
