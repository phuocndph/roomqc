import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, ChevronUp, ChevronDown, Trash2, ArrowDown } from 'lucide-react'
import { CreateMaintenanceAction } from '../actions/CreateMaintenanceAction'
import { CreateHousekeepingTaskAction } from '../actions/CreateHousekeepingTaskAction'
import { SendNotificationAction } from '../actions/SendNotificationAction'
import { UpdateRecordAction } from '../actions/UpdateRecordAction'
import { CallWebhookAction } from '../actions/CallWebhookAction'
import { ActionExecutionSettingsComponent } from '../shared/ActionExecutionSettings'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface LocalWorkflowAction {
  type: string
  config: any
}

const ACTION_TYPES = [
  { value: 'send_notification', label: 'Gửi thông báo', description: 'Telegram, Push, In-app' },
  { value: 'send_email', label: 'Gửi email', description: 'Email thông báo' },
  { value: 'create_housekeeping_task', label: 'Tạo công việc buồng phòng', description: 'Dọn phòng, kiểm tra...' },
  { value: 'create_maintenance', label: 'Tạo yêu cầu bảo trì', description: 'Phiếu bảo trì tự động' },
  { value: 'update_record', label: 'Cập nhật dữ liệu', description: 'Thay đổi trạng thái, giá trị' },
  { value: 'call_webhook', label: 'Gọi Webhook', description: 'Tích hợp hệ thống ngoài' },
]

interface WorkflowActionsProps {
  actions: LocalWorkflowAction[]
  onChange: (actions: LocalWorkflowAction[]) => void
  triggerType: string
  triggerEvent?: string
}

export const WorkflowActions = ({ actions, onChange, triggerType, triggerEvent }: WorkflowActionsProps) => {
  const addAction = (type: string) => {
    const newAction: LocalWorkflowAction = {
      type,
      config: {}
    }
    onChange([...actions, newAction])
  }

  const removeAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index))
  }

  const moveAction = (index: number, direction: 'up' | 'down') => {
    const newActions = [...actions]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    
    if (targetIndex >= 0 && targetIndex < actions.length) {
      [newActions[index], newActions[targetIndex]] = [newActions[targetIndex], newActions[index]]
      onChange(newActions)
    }
  }

  const updateAction = (index: number, config: any) => {
    const newActions = [...actions]
    newActions[index] = { ...newActions[index], config }
    onChange(newActions)
  }

  const getActionInfo = (type: string) => {
    return ACTION_TYPES.find(t => t.value === type)
  }

  const renderActionConfig = (action: LocalWorkflowAction, index: number) => {
    switch (action.type) {
      case 'create_housekeeping_task':
        return (
          <CreateHousekeepingTaskAction
            config={action.config}
            onChange={(config) => updateAction(index, config)}
            triggerEvent={triggerEvent}
          />
        )
      case 'create_maintenance':
        return (
          <CreateMaintenanceAction
            config={action.config}
            onChange={(config) => updateAction(index, config)}
          />
        )
      case 'send_notification':
      case 'send_email':
        return (
          <SendNotificationAction
            config={action.config}
            onChange={(config) => updateAction(index, config)}
            type={action.type === 'send_email' ? 'email' : 'notification'}
            triggerType={triggerType}
          />
        )
      case 'update_record':
        return (
          <UpdateRecordAction
            config={action.config}
            onChange={(config) => updateAction(index, config)}
          />
        )
      case 'call_webhook':
        return (
          <CallWebhookAction
            config={action.config}
            onChange={(config) => updateAction(index, config)}
          />
        )
      default:
        return <div className="text-sm text-muted-foreground">Loại hành động không xác định</div>
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Hành động</h3>
        <p className="text-sm text-muted-foreground">
          Thêm các hành động sẽ được thực hiện khi workflow chạy
        </p>
      </div>

      <div className="space-y-3">
        {actions && actions.length > 0 ? (
          actions.map((action, index) => {
            const actionInfo = getActionInfo(action.type)
            return (
              <div key={index}>
                {index > 0 && (
                  <div className="flex justify-center py-2">
                    <div className="flex flex-col items-center">
                      <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                )}
                <Card className="p-4 border-l-4 border-l-primary">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {index + 1}
                      </Badge>
                      <div>
                        <span className="font-medium text-sm">{actionInfo?.label || action.type}</span>
                        {actionInfo?.description && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({actionInfo.description})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveAction(index, 'up')}
                        disabled={index === 0}
                        title="Di chuyển lên"
                        type="button"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveAction(index, 'down')}
                        disabled={index === actions.length - 1}
                        title="Di chuyển xuống"
                        type="button"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeAction(index)}
                        title="Xóa hành động"
                        type="button"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t">
                    {renderActionConfig(action, index)}
                  </div>
                </Card>
              </div>
            )
          })
        ) : (
          <div className="text-center py-8 border border-dashed rounded-lg">
            <Plus className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Chưa có hành động nào. Thêm hành động đầu tiên bên dưới.
            </p>
          </div>
        )}
      </div>

      <div className="pt-2">
        <Select onValueChange={(value) => addAction(value)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="+ Thêm hành động..." />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                <div className="flex flex-col">
                  <span>{type.label}</span>
                  <span className="text-xs text-muted-foreground">{type.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {actions && actions.length > 0 && (
        <ActionExecutionSettingsComponent
          settings={{
            execution_mode: 'sequential',
            on_failure: 'stop',
            retry_count: 3
          }}
          onChange={() => {}}
        />
      )}
    </div>
  )
}
