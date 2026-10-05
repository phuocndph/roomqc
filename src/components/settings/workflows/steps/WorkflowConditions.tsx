import { Button } from '@/components/ui/button'
import { Plus, X, HelpCircle } from 'lucide-react'
import { WorkflowCondition } from '@/hooks/useWorkflows'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface WorkflowConditionsProps {
  conditions: WorkflowCondition[]
  onChange: (conditions: WorkflowCondition[]) => void
  triggerType: string
  triggerEvent?: string
}

const OPERATORS = [
  { value: 'equals', label: 'Bằng' },
  { value: 'not_equals', label: 'Khác' },
  { value: 'greater_than', label: 'Lớn hơn' },
  { value: 'less_than', label: 'Nhỏ hơn' },
  { value: 'contains', label: 'Chứa' },
  { value: 'in', label: 'Thuộc' },
]

// Fields available for each trigger type
const TRIGGER_FIELDS: Record<string, { value: string; label: string; description?: string }[]> = {
  adjustment_created: [
    { value: 'total_items', label: 'Tổng sản phẩm', description: 'Số lượng sản phẩm trong phiếu' },
    { value: 'adjustment_type', label: 'Loại kiểm kê' },
  ],
  adjustment_completed: [
    { value: 'discrepancy_count', label: 'Số lượng chênh lệch', description: 'Số sản phẩm có chênh lệch' },
    { value: 'total_items', label: 'Tổng sản phẩm' },
  ],
  adjustment_approved: [
    { value: 'discrepancy_count', label: 'Số lượng chênh lệch' },
    { value: 'total_items', label: 'Tổng sản phẩm' },
  ],
  adjustment_rejected: [
    { value: 'rejection_reason', label: 'Lý do từ chối' },
  ],
  room_status_change: [
    { value: 'new_status', label: 'Trạng thái mới' },
    { value: 'old_status', label: 'Trạng thái cũ' },
    { value: 'floor', label: 'Tầng' },
  ],
  room_check_completed: [
    { value: 'check_type', label: 'Loại kiểm tra' },
    { value: 'has_issues', label: 'Có vấn đề' },
  ],
  inventory_low_stock: [
    { value: 'category', label: 'Danh mục' },
    { value: 'current_stock', label: 'Tồn kho hiện tại' },
    { value: 'minimum_stock', label: 'Tồn kho tối thiểu' },
  ],
  maintenance_request_created: [
    { value: 'priority', label: 'Mức độ ưu tiên' },
    { value: 'issue_type', label: 'Loại sự cố' },
  ],
  laundry_batch_status_change: [
    { value: 'new_status', label: 'Trạng thái mới' },
    { value: 'old_status', label: 'Trạng thái cũ' },
    { value: 'total_items', label: 'Tổng số lượng' },
  ],
}

export const WorkflowConditions = ({ 
  conditions, 
  onChange,
  triggerType,
  triggerEvent
}: WorkflowConditionsProps) => {
  const addCondition = () => {
    onChange([
      ...conditions,
      { field: '', operator: 'equals', value: '' }
    ])
  }

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index))
  }

  const updateCondition = (index: number, updates: Partial<WorkflowCondition>) => {
    onChange(
      conditions.map((condition, i) =>
        i === index ? { ...condition, ...updates } : condition
      )
    )
  }

  const getAvailableFields = () => {
    if (triggerEvent && TRIGGER_FIELDS[triggerEvent]) {
      return TRIGGER_FIELDS[triggerEvent]
    }
    // Default fields
    return [
      { value: 'hotel_id', label: 'Khách sạn' },
    ]
  }

  const fields = getAvailableFields()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Điều kiện (không bắt buộc)</h3>
        <p className="text-sm text-muted-foreground">
          Chỉ chạy workflow khi thỏa mãn các điều kiện sau
        </p>
      </div>

      {conditions.length === 0 && (
        <div className="p-6 border border-dashed rounded-lg text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Chưa có điều kiện nào. Workflow sẽ chạy cho tất cả các sự kiện.
          </p>
          <Button variant="outline" onClick={addCondition}>
            <Plus className="h-4 w-4 mr-2" />
            Thêm điều kiện
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {conditions.map((condition, index) => (
          <div key={index} className="border rounded-lg p-4 bg-muted/20">
            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-4">
                <Label className="text-xs">Trường</Label>
                <Select
                  value={condition.field}
                  onValueChange={(value) => updateCondition(index, { field: value })}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder="Chọn trường" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field.value} value={field.value}>
                        <div className="flex items-center gap-2">
                          {field.label}
                          {field.description && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{field.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-3">
                <Label className="text-xs">Phép so sánh</Label>
                <Select
                  value={condition.operator}
                  onValueChange={(value: any) => updateCondition(index, { operator: value })}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-4">
                <Label className="text-xs">Giá trị</Label>
                <Input
                  value={condition.value}
                  onChange={(e) => updateCondition(index, { value: e.target.value })}
                  placeholder="Nhập giá trị"
                  className="mt-1 h-9"
                />
              </div>

              <div className="col-span-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCondition(index)}
                  className="h-9 w-9"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {conditions.length > 0 && (
          <Button variant="outline" size="sm" onClick={addCondition}>
            <Plus className="h-4 w-4 mr-2" />
            Thêm điều kiện
          </Button>
        )}

        {conditions.length > 1 && (
          <div className="pt-3 border-t">
            <Label className="text-sm">Kết hợp điều kiện</Label>
            <RadioGroup defaultValue="all" className="flex gap-6 mt-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="match-all" />
                <Label htmlFor="match-all" className="font-normal text-sm">
                  Tất cả điều kiện (AND)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="any" id="match-any" />
                <Label htmlFor="match-any" className="font-normal text-sm">
                  Bất kỳ điều kiện nào (OR)
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}
      </div>
    </div>
  )
}
