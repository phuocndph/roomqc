
import { CheckCircle, Package, Truck, Lock, Clock, UserX, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
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
import { cn } from '@/lib/utils'
import type { RouteStatus } from '@/types/route-batch.types'

interface DeliveryStepWizardProps {
  status: RouteStatus
  assignedToName?: string | null
  totalStops: number
  completedStops: number
  pendingStops: number
  isWarehouseManager: boolean
  isAssignee: boolean
  hasAssignee?: boolean
  isCreatorSameAsAssignee?: boolean
  canConfirmOnBehalf?: boolean
  onHandoverBatch?: () => void
  onConfirmReceive?: () => void
  onConfirmReceiveOnBehalf?: () => void
  onCloseRoute?: () => void
  isHandingOver?: boolean
  isConfirmingReceive?: boolean
  isClosing?: boolean
}

type Step = {
  id: string
  label: string
  icon: React.ElementType
  status: 'completed' | 'current' | 'upcoming'
}

export function DeliveryStepWizard({
  status,
  assignedToName,
  totalStops,
  completedStops,
  pendingStops,
  isWarehouseManager,
  isAssignee,
  hasAssignee = true,
  isCreatorSameAsAssignee = false,
  canConfirmOnBehalf = false,
  onHandoverBatch,
  onConfirmReceive,
  onConfirmReceiveOnBehalf,
  onCloseRoute,
  isHandingOver,
  isConfirmingReceive,
  isClosing,
}: DeliveryStepWizardProps) {
  const progressPercent = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0

  // released = "Nhận hàng" vẫn current (chưa xong cho đến khi assignee xác nhận)
  // in_progress = "Giao hàng" mới là current
  const getCurrentStep = (): number => {
    switch (status) {
      case 'pending': return 1
      case 'released': return 2
      case 'in_progress': return 3
      case 'completed': return 4
      case 'closed': return 5
      default: return 1
    }
  }
  
  const currentStep = getCurrentStep()
  const useSimplifiedFlow = isCreatorSameAsAssignee && hasAssignee

  const steps: Step[] = useSimplifiedFlow
    ? [
        {
          id: 'prepare_and_receive',
          label: 'Chuẩn bị & Nhận',
          icon: Package,
          status: currentStep > 2 ? 'completed' : currentStep <= 2 ? 'current' : 'upcoming',
        },
        {
          id: 'deliver',
          label: 'Giao hàng',
          icon: Truck,
          status: currentStep > 3 ? 'completed' : currentStep === 3 ? 'current' : 'upcoming',
        },
        {
          id: 'close',
          label: 'Hoàn thành',
          icon: Lock,
          status: currentStep >= 4 ? 'completed' : 'upcoming',
        },
      ]
    : [
        {
          id: 'prepare',
          label: 'Chuẩn bị',
          icon: Package,
          status: currentStep > 1 ? 'completed' : currentStep === 1 ? 'current' : 'upcoming',
        },
        {
          id: 'release',
          label: 'Nhận hàng',
          icon: Truck,
          status: currentStep > 2 ? 'completed' : currentStep === 2 ? 'current' : 'upcoming',
        },
        {
          id: 'deliver',
          label: 'Giao hàng',
          icon: CheckCircle,
          status: currentStep > 3 ? 'completed' : currentStep === 3 ? 'current' : 'upcoming',
        },
        {
          id: 'close',
          label: 'Hoàn thành',
          icon: Lock,
          status: currentStep >= 4 ? 'completed' : 'upcoming',
        },
      ]

  return (
    <div className="border rounded-lg bg-card p-3 space-y-3">
      {/* Step indicators with icons */}
      <div className="flex items-center">
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center min-w-0">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                    step.status === 'completed' && 'bg-green-500',
                    step.status === 'current' && 'bg-primary',
                    step.status === 'upcoming' && 'bg-muted'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      step.status === 'completed' && 'text-white',
                      step.status === 'current' && 'text-primary-foreground',
                      step.status === 'upcoming' && 'text-muted-foreground/50'
                    )}
                  />
                </div>
                <span
                  className={cn(
                    'text-[11px] mt-1 text-center leading-tight',
                    step.status === 'current' && 'font-semibold text-foreground',
                    step.status === 'completed' && 'text-green-600',
                    step.status === 'upcoming' && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-1.5',
                    step.status === 'completed' ? 'bg-green-500' : 'bg-muted'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Inline progress for in_progress */}
      {status === 'in_progress' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Tiến độ</span>
            <span className="font-medium">{completedStops}/{totalStops} phòng ({progressPercent}%)</span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      )}

      {/* Guidance and action */}
      <GuidanceSection
        status={status}
        assignedToName={assignedToName}
        totalStops={totalStops}
        completedStops={completedStops}
        pendingStops={pendingStops}
        isWarehouseManager={isWarehouseManager}
        isAssignee={isAssignee}
        hasAssignee={hasAssignee}
        useSimplifiedFlow={useSimplifiedFlow}
        canConfirmOnBehalf={canConfirmOnBehalf}
        onHandoverBatch={onHandoverBatch}
        onConfirmReceive={onConfirmReceive}
        onConfirmReceiveOnBehalf={onConfirmReceiveOnBehalf}
        onCloseRoute={onCloseRoute}
        isHandingOver={isHandingOver}
        isConfirmingReceive={isConfirmingReceive}
        isClosing={isClosing}
      />
    </div>
  )
}

// Extracted guidance section
function GuidanceSection({
  status,
  assignedToName,
  totalStops,
  pendingStops,
  isWarehouseManager,
  isAssignee,
  hasAssignee,
  useSimplifiedFlow,
  canConfirmOnBehalf,
  onHandoverBatch,
  onConfirmReceive,
  onConfirmReceiveOnBehalf,
  onCloseRoute,
  isHandingOver,
  isConfirmingReceive,
  isClosing,
}: {
  status: RouteStatus
  assignedToName?: string | null
  totalStops: number
  completedStops: number
  pendingStops: number
  isWarehouseManager: boolean
  isAssignee: boolean
  hasAssignee: boolean
  useSimplifiedFlow: boolean
  canConfirmOnBehalf: boolean
  onHandoverBatch?: () => void
  onConfirmReceive?: () => void
  onConfirmReceiveOnBehalf?: () => void
  onCloseRoute?: () => void
  isHandingOver?: boolean
  isConfirmingReceive?: boolean
  isClosing?: boolean
}) {
  if (status === 'pending') {
    if (!hasAssignee && isWarehouseManager) {
      return (
        <div className="flex items-center gap-2 text-amber-600">
          <UserX className="h-4 w-4 shrink-0" />
          <p className="text-sm">Chưa có nhân viên được phân công</p>
        </div>
      )
    }
    
    if (useSimplifiedFlow && isWarehouseManager && isAssignee) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Kiểm tra hàng trong kho. Xác nhận để bắt đầu giao hàng ngay.
          </p>
          {onHandoverBatch && (
            <Button 
              onClick={onHandoverBatch} 
              disabled={isHandingOver}
              className="w-full h-11 text-sm gap-2"
            >
              <Package className="h-4 w-4" />
              {isHandingOver ? 'Đang kiểm tra kho...' : 'Kiểm tra kho & Bắt đầu giao'}
            </Button>
          )}
        </div>
      )
    }

    if (isWarehouseManager && hasAssignee) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Kiểm tra hàng theo danh sách bên dưới.
            {assignedToName && <> Sau đó giao cho <strong>{assignedToName}</strong></>}
          </p>
          {onHandoverBatch && (
            <Button 
              onClick={onHandoverBatch} 
              disabled={isHandingOver}
              className="w-full h-11 text-sm gap-2"
            >
              <Package className="h-4 w-4" />
              {isHandingOver ? 'Đang kiểm tra kho...' : 'Kiểm tra & Giao hàng cho nhân viên'}
            </Button>
          )}
        </div>
      )
    }
    
    if (isAssignee) {
      return (
        <div className="flex items-center gap-2 text-amber-600">
          <Clock className="h-4 w-4 shrink-0" />
          <p className="text-sm">Chờ quản lý kho kiểm tra và giao hàng</p>
        </div>
      )
    }
  }

  if (status === 'released') {
    if (isAssignee) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Hàng đã được chuẩn bị. Xác nhận để bắt đầu giao đến các phòng.
          </p>
          {onConfirmReceive && (
            <Button 
              onClick={onConfirmReceive} 
              disabled={isConfirmingReceive}
              className="w-full h-12 text-base gap-2"
              size="lg"
            >
              <CheckCircle className="h-5 w-5" />
              {isConfirmingReceive ? 'Đang xử lý...' : 'Xác nhận đã nhận đủ hàng'}
            </Button>
          )}
        </div>
      )
    }
    // Không phải assignee — hiện thông báo + (tuỳ chọn) nút "Xác nhận thay nhân viên" cho leader/storekeeper
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 text-amber-600">
          <Clock className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-sm">
            Đang chờ <strong>{assignedToName || 'nhân viên'}</strong> mở phiếu này và bấm "Xác nhận đã nhận hàng".
            {canConfirmOnBehalf && ' Bạn có thể xác nhận thay nếu đã trao hàng trực tiếp.'}
          </p>
        </div>
        {canConfirmOnBehalf && onConfirmReceiveOnBehalf && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isConfirmingReceive}
                className="gap-1.5"
              >
                <UserCheck className="h-3.5 w-3.5" />
                {isConfirmingReceive ? 'Đang xử lý...' : 'Xác nhận thay nhân viên'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xác nhận thay nhân viên?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bạn xác nhận đã trao tay hàng trực tiếp cho <strong>{assignedToName || 'nhân viên'}</strong>?
                  Hành động này sẽ chuyển phiếu sang trạng thái "Đang giao" và được ghi log.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction onClick={onConfirmReceiveOnBehalf}>
                  Xác nhận đã trao hàng
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    )
  }

  if (status === 'in_progress') {
    if (pendingStops > 0) {
      return (
        <p className="text-xs text-muted-foreground">
          Còn {pendingStops} phòng cần giao. Đến từng phòng và ấn "Giao" để xác nhận.
        </p>
      )
    }
    return null
  }

  if (status === 'completed') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Đã giao xong {totalStops} phòng!</span>
        </div>
        {isWarehouseManager && onCloseRoute && (
          <Button 
            onClick={onCloseRoute} 
            disabled={isClosing}
            variant="secondary"
            size="sm"
            className="gap-1.5"
          >
            <Lock className="h-3.5 w-3.5" />
            {isClosing ? 'Đang đóng...' : 'Đóng phiếu'}
          </Button>
        )}
      </div>
    )
  }

  if (status === 'closed') {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Lock className="h-4 w-4" />
        <span className="text-sm">Phiếu đã được đóng</span>
      </div>
    )
  }

  return null
}
