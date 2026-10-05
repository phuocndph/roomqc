import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Edit, Pause, Play, Trash2, FileText, Zap, Clock, Filter, PlayCircle } from 'lucide-react'
import { Workflow, useToggleWorkflow, useDeleteWorkflow } from '@/hooks/useWorkflows'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface WorkflowsListProps {
  workflows: Workflow[]
}

const TRIGGER_LABELS: Record<string, string> = {
  room_status_change: 'Thay đổi trạng thái phòng',
  room_check_completed: 'Kiểm tra phòng hoàn thành',
  room_standards_applied: 'Setup phòng hoàn thành',
  'room.checkout': 'Checkout phòng',
  adjustment_created: 'Phiếu kiểm kê được tạo',
  adjustment_started: 'Bắt đầu kiểm kê',
  adjustment_completed: 'Hoàn thành kiểm kê',
  adjustment_approved: 'Phiếu kiểm kê được duyệt',
  adjustment_rejected: 'Phiếu kiểm kê bị từ chối',
  inventory_low_stock: 'Tồn kho thấp',
  inventory_transaction: 'Giao dịch kho',
  laundry_batch_status_change: 'Thay đổi trạng thái giặt',
  maintenance_request_created: 'Yêu cầu bảo trì mới',
  maintenance_status_change: 'Thay đổi trạng thái bảo trì',
}

export const WorkflowsList = ({ workflows }: WorkflowsListProps) => {
  const toggleWorkflow = useToggleWorkflow()
  const deleteWorkflow = useDeleteWorkflow()

  const handleToggle = (workflow: Workflow) => {
    toggleWorkflow.mutate({
      id: workflow.id,
      status: workflow.status === 'active' ? 'inactive' : 'active'
    })
  }

  const handleDelete = (id: string) => {
    deleteWorkflow.mutate(id)
  }

  const getTriggerLabel = (workflow: Workflow) => {
    if (workflow.trigger_type === 'event' && workflow.trigger_event) {
      return TRIGGER_LABELS[workflow.trigger_event] || workflow.trigger_event
    }
    if (workflow.trigger_type === 'schedule' && workflow.trigger_schedule) {
      return `Lịch: ${workflow.trigger_schedule}`
    }
    if (workflow.trigger_type === 'manual') {
      return 'Kích hoạt thủ công'
    }
    return workflow.trigger_type
  }

  const getTriggerIcon = (workflow: Workflow) => {
    if (workflow.trigger_type === 'event') return <Zap className="h-3.5 w-3.5" />
    if (workflow.trigger_type === 'schedule') return <Clock className="h-3.5 w-3.5" />
    return <PlayCircle className="h-3.5 w-3.5" />
  }

  return (
    <div className="space-y-3">
      {workflows.map((workflow) => (
        <Card key={workflow.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold truncate">{workflow.name}</h4>
                <Badge 
                  variant={workflow.status === 'active' ? 'default' : 'secondary'}
                  className="text-[10px] px-1.5"
                >
                  {workflow.status === 'active' && '🟢 Đang chạy'}
                  {workflow.status === 'inactive' && '⚪ Tạm dừng'}
                  {workflow.status === 'error' && '🔴 Lỗi'}
                </Badge>
              </div>
              
              {workflow.description && (
                <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                  {workflow.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  {getTriggerIcon(workflow)}
                  <span>{getTriggerLabel(workflow)}</span>
                </div>
                
                {workflow.conditions && workflow.conditions.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Filter className="h-3.5 w-3.5" />
                    <span>{workflow.conditions.length} điều kiện</span>
                  </div>
                )}
                
                {workflow.actions && workflow.actions.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Play className="h-3.5 w-3.5" />
                    <span>{workflow.actions.length} hành động</span>
                  </div>
                )}

                {workflow.last_run_at && (
                  <span className="text-muted-foreground">
                    Lần chạy cuối: {format(new Date(workflow.last_run_at), 'dd/MM HH:mm', { locale: vi })}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mt-2 text-xs">
                <span>
                  <span className="font-medium">{workflow.total_executions}</span> lần chạy
                </span>
                <span className="text-green-600">
                  <span className="font-medium">{workflow.success_count}</span> thành công
                </span>
                {workflow.failed_count > 0 && (
                  <span className="text-red-600">
                    <span className="font-medium">{workflow.failed_count}</span> thất bại
                  </span>
                )}
              </div>

              {workflow.last_error && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                  Lỗi: {workflow.last_error}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="sm" className="h-8 px-2">
                <Edit className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => handleToggle(workflow)}
                disabled={toggleWorkflow.isPending}
              >
                {workflow.status === 'active' ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>

              <Button variant="ghost" size="sm" className="h-8 px-2">
                <FileText className="h-4 w-4" />
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Xóa workflow</AlertDialogTitle>
                    <AlertDialogDescription>
                      Bạn có chắc chắn muốn xóa workflow "{workflow.name}"? 
                      Hành động này không thể hoàn tác.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Hủy</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(workflow.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Xóa
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
