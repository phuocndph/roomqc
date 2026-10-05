import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  ClipboardCheck, 
  Sparkles, 
  DoorOpen, 
  Package, 
  MoreHorizontal,
  Info
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TASK_TYPE_LABELS, PRIORITY_LABELS } from '@/types/housekeeping.types'
import type { TaskType, TaskPriority } from '@/types/housekeeping.types'

interface CreateHousekeepingTaskActionProps {
  config: any
  onChange: (config: any) => void
  triggerEvent?: string
}

const TASK_TYPES: { value: TaskType; label: string; icon: typeof ClipboardCheck }[] = [
  { value: 'checkout_inspection', label: TASK_TYPE_LABELS.checkout_inspection, icon: ClipboardCheck },
  { value: 'cleaning', label: TASK_TYPE_LABELS.cleaning, icon: Sparkles },
  { value: 'checkin_prep', label: TASK_TYPE_LABELS.checkin_prep, icon: DoorOpen },
  { value: 'amenity_request', label: TASK_TYPE_LABELS.amenity_request, icon: Package },
  { value: 'other', label: TASK_TYPE_LABELS.other, icon: MoreHorizontal },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: PRIORITY_LABELS.low },
  { value: 'medium', label: PRIORITY_LABELS.medium },
  { value: 'high', label: PRIORITY_LABELS.high },
  { value: 'urgent', label: PRIORITY_LABELS.urgent },
]

const ASSIGNMENT_MODES = [
  { value: 'auto_rotate', label: 'Tự động chia đều', description: 'Giao cho staff theo lượt' },
  { value: 'by_floor', label: 'Theo tầng', description: 'Giao cho staff phụ trách tầng' },
  { value: 'specific', label: 'Người cụ thể', description: 'Chọn nhân viên từ event data' },
]

const DUE_AT_PRESETS = [
  { value: 15, label: '15 phút' },
  { value: 30, label: '30 phút' },
  { value: 60, label: '1 giờ' },
  { value: 120, label: '2 giờ' },
  { value: 240, label: '4 giờ' },
]

export function CreateHousekeepingTaskAction({ 
  config, 
  onChange, 
  triggerEvent 
}: CreateHousekeepingTaskActionProps) {
  const [localConfig, setLocalConfig] = useState({
    task_type: 'cleaning' as TaskType,
    priority_mode: 'fixed' as 'fixed' | 'auto',
    priority: 'medium' as TaskPriority,
    assignment_mode: 'auto_rotate',
    due_at_offset: 30, // minutes
    title_template: '',
    description_template: '',
    send_notification: true,
    ...config
  })

  useEffect(() => {
    setLocalConfig(prev => ({ ...prev, ...config }))
  }, [config])

  const handleChange = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates }
    setLocalConfig(newConfig)
    onChange(newConfig)
  }

  const selectedTaskType = TASK_TYPES.find(t => t.value === localConfig.task_type)

  return (
    <div className="space-y-5">
      {/* Task Type */}
      <div>
        <Label className="text-sm font-medium">Loại công việc *</Label>
        <div className="grid grid-cols-5 gap-2 mt-2">
          {TASK_TYPES.map((type) => {
            const Icon = type.icon
            const isSelected = localConfig.task_type === type.value
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => handleChange({ task_type: type.value })}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors",
                  isSelected 
                    ? "border-primary bg-primary/5 text-primary" 
                    : "border-muted hover:border-primary/50"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs text-center leading-tight">{type.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Title Template */}
      <div>
        <Label htmlFor="title_template">Tiêu đề công việc</Label>
        <Input
          id="title_template"
          value={localConfig.title_template}
          onChange={(e) => handleChange({ title_template: e.target.value })}
          placeholder={`${selectedTaskType?.label} - P.{{room_number}}`}
          className="mt-1.5"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Sử dụng biến như <code className="bg-muted px-1 rounded">{'{{room_number}}'}</code>, <code className="bg-muted px-1 rounded">{'{{floor}}'}</code>
        </p>
      </div>

      {/* Description Template */}
      <div>
        <Label htmlFor="description_template">Mô tả (tùy chọn)</Label>
        <Textarea
          id="description_template"
          value={localConfig.description_template}
          onChange={(e) => handleChange({ description_template: e.target.value })}
          placeholder="Mô tả chi tiết công việc cần thực hiện..."
          className="mt-1.5"
          rows={2}
        />
      </div>

      {/* Priority */}
      <div>
        <Label className="text-sm font-medium">Mức độ ưu tiên</Label>
        <RadioGroup
          value={localConfig.priority_mode}
          onValueChange={(value: any) => handleChange({ priority_mode: value })}
          className="mt-2 space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="auto" id="priority-auto" />
            <Label htmlFor="priority-auto" className="font-normal cursor-pointer">
              Tự động theo trigger (nếu có)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="fixed" id="priority-fixed" />
            <Label htmlFor="priority-fixed" className="font-normal cursor-pointer">
              Cố định
            </Label>
          </div>
        </RadioGroup>
        
        {localConfig.priority_mode === 'fixed' && (
          <Select
            value={localConfig.priority}
            onValueChange={(value: TaskPriority) => handleChange({ priority: value })}
          >
            <SelectTrigger className="mt-2 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Assignment Mode */}
      <div>
        <Label className="text-sm font-medium">Phân công cho</Label>
        <RadioGroup
          value={localConfig.assignment_mode}
          onValueChange={(value) => handleChange({ assignment_mode: value })}
          className="mt-2 space-y-2"
        >
          {ASSIGNMENT_MODES.map((mode) => (
            <div key={mode.value} className="flex items-start space-x-2">
              <RadioGroupItem value={mode.value} id={`assign-${mode.value}`} className="mt-0.5" />
              <div>
                <Label htmlFor={`assign-${mode.value}`} className="font-normal cursor-pointer">
                  {mode.label}
                </Label>
                <p className="text-xs text-muted-foreground">{mode.description}</p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Due At Offset */}
      <div>
        <Label className="text-sm font-medium">Thời hạn hoàn thành</Label>
        <Select
          value={String(localConfig.due_at_offset)}
          onValueChange={(value) => handleChange({ due_at_offset: Number(value) })}
        >
          <SelectTrigger className="mt-2 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DUE_AT_PRESETS.map(preset => (
              <SelectItem key={preset.value} value={String(preset.value)}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          Tính từ lúc tạo công việc
        </p>
      </div>

      {/* Send Notification */}
      <div className="flex items-start space-x-2 pt-2 border-t">
        <Checkbox
          id="send_notification"
          checked={localConfig.send_notification}
          onCheckedChange={(checked) => handleChange({ send_notification: !!checked })}
        />
        <div className="grid gap-1.5 leading-none">
          <Label htmlFor="send_notification" className="cursor-pointer">
            Gửi thông báo cho người được giao
          </Label>
          <p className="text-xs text-muted-foreground">
            Push notification sẽ được gửi ngay khi công việc được tạo
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="p-3 bg-muted/50 rounded-lg flex items-start gap-2">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          Công việc sẽ được tạo tự động với room_id và hotel_id từ dữ liệu trigger.
          Nếu trigger không có room_id, công việc sẽ không được tạo.
        </p>
      </div>
    </div>
  )
}
