import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Plus, Workflow, Bell, Package, Wrench, Shirt, ClipboardCheck, CheckCircle } from 'lucide-react'
import { useWorkflows } from '@/hooks/useWorkflows'
import { WorkflowsList } from '@/components/settings/workflows/WorkflowsList'
import { CreateWorkflowDialog } from '@/components/settings/workflows/CreateWorkflowDialog'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const WORKFLOW_SUGGESTIONS = [
  {
    icon: ClipboardCheck,
    title: 'Checkout → Tạo công việc',
    description: 'Tự động tạo task kiểm tra checkout và giao cho nhân viên',
    trigger: 'room_status_change',
  },
  {
    icon: Bell,
    title: 'Công việc mới → Thông báo',
    description: 'Gửi notification cho nhân viên khi có công việc được giao',
    trigger: 'housekeeping_task_created',
  },
  {
    icon: CheckCircle,
    title: 'Hoàn thành → Báo Manager',
    description: 'Thông báo quản lý khi nhân viên hoàn thành công việc',
    trigger: 'housekeeping_task_completed',
  },
  {
    icon: Package,
    title: 'Cảnh báo hết hàng',
    description: 'Thông báo khi tồn kho xuống dưới mức tối thiểu',
    trigger: 'inventory_low_stock',
  },
  {
    icon: Wrench,
    title: 'Bảo trì khẩn cấp',
    description: 'Thông báo ngay cho quản lý khi có yêu cầu bảo trì urgent',
    trigger: 'maintenance_request_created',
  },
  {
    icon: Shirt,
    title: 'Nhận đồ giặt',
    description: 'Thông báo khi lô giặt sẵn sàng để nhận',
    trigger: 'laundry_batch_status_change',
  },
]

export default function WorkflowsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const { data: workflows, isLoading } = useWorkflows()

  const activeWorkflows = workflows?.filter(w => w.status === 'active') || []
  const inactiveWorkflows = workflows?.filter(w => w.status === 'inactive') || []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quy trình tự động"
        description="Tự động hóa các tác vụ lặp lại với workflow"
      >
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Tạo workflow
        </Button>
      </PageHeader>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-6">
          {activeWorkflows.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Đang hoạt động ({activeWorkflows.length})
              </h3>
              <WorkflowsList workflows={activeWorkflows} />
            </div>
          )}

          {inactiveWorkflows.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Tạm dừng ({inactiveWorkflows.length})
              </h3>
              <WorkflowsList workflows={inactiveWorkflows} />
            </div>
          )}

          {workflows && workflows.length === 0 && (
            <div className="text-center py-12 space-y-6">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <Workflow className="h-8 w-8 text-muted-foreground" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-medium">Chưa có quy trình tự động</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Tạo workflow để tự động hóa các tác vụ như thông báo khi checkout, 
                  cảnh báo hết hàng, hoặc theo dõi quy trình kiểm kê.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
                {WORKFLOW_SUGGESTIONS.map((suggestion, idx) => (
                  <div 
                    key={idx}
                    className="border rounded-lg p-4 text-left hover:bg-muted/50 hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <suggestion.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{suggestion.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {suggestion.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <Button onClick={() => setCreateDialogOpen(true)} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Tạo workflow đầu tiên
              </Button>
            </div>
          )}
        </div>
      )}

      <CreateWorkflowDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  )
}
