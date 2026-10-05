import { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
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

export interface NextActionCardProps {
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
  onAssign?: () => void
  onHandoverBatch?: () => void
  onConfirmReceive?: () => void
  onConfirmReceiveOnBehalf?: () => void
  onCloseRoute?: () => void
  isHandingOver?: boolean
  isConfirmingReceive?: boolean
  isClosing?: boolean
}

interface ActionCardSpec {
  tone: 'amber' | 'blue' | 'green' | 'muted'
  title: string
  description?: string
  primary?: { label: string; loadingLabel?: string; onClick?: () => void; loading?: boolean; disabled?: boolean }
  secondary?: ReactNode
}

function buildSpec(props: NextActionCardProps): ActionCardSpec | null {
  const {
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
    onAssign,
    onHandoverBatch,
    onConfirmReceive,
    onConfirmReceiveOnBehalf,
    onCloseRoute,
    isHandingOver,
    isConfirmingReceive,
    isClosing,
  } = props

  const nv = assignedToName || 'nhân viên'

  if (status === 'cancelled') {
    return { tone: 'muted', title: 'Phiếu đã huỷ', description: 'Không thể thao tác trên phiếu này.' }
  }

  if (status === 'closed') {
    return { tone: 'muted', title: 'Phiếu đã đóng', description: 'Phiếu đã hoàn tất và được đóng.' }
  }

  if (status === 'pending') {
    if (!hasAssignee) {
      if (isWarehouseManager) {
        return {
          tone: 'amber',
          title: 'Cần phân công nhân viên giao',
          description: 'Phân công một nhân viên trước khi xuất kho.',
          primary: onAssign ? { label: 'Phân công ngay', onClick: onAssign } : undefined,
        }
      }
      return { tone: 'amber', title: 'Phiếu chưa có nhân viên được phân công' }
    }

    if (isCreatorSameAsAssignee && isWarehouseManager) {
      return {
        tone: 'amber',
        title: 'Kiểm hàng trong kho rồi đi giao',
        description: 'Bấm "Xuất kho" để bắt đầu giao đến các phòng.',
        primary: onHandoverBatch
          ? {
              label: 'Xuất kho & bắt đầu giao',
              loadingLabel: 'Đang xuất kho…',
              onClick: onHandoverBatch,
              loading: isHandingOver,
            }
          : undefined,
      }
    }

    if (isWarehouseManager) {
      return {
        tone: 'amber',
        title: `Chờ bạn xuất kho cho ${nv}`,
        description: 'Kiểm tra hàng theo danh sách bên dưới rồi xuất kho.',
        primary: onHandoverBatch
          ? {
              label: 'Xuất kho cho nhân viên',
              loadingLabel: 'Đang xuất kho…',
              onClick: onHandoverBatch,
              loading: isHandingOver,
            }
          : undefined,
      }
    }

    if (isAssignee) {
      return {
        tone: 'muted',
        title: 'Chờ quản lý kho xuất hàng',
        description: 'Bạn sẽ nhận được thông báo khi hàng sẵn sàng.',
      }
    }

    return { tone: 'muted', title: `Chờ kho xuất hàng cho ${nv}` }
  }

  if (status === 'released') {
    if (isAssignee) {
      return {
        tone: 'amber',
        title: 'Hàng đã sẵn sàng',
        description: 'Xác nhận để bắt đầu giao đến các phòng.',
        primary: onConfirmReceive
          ? {
              label: 'Tôi đã nhận đủ hàng',
              loadingLabel: 'Đang xử lý…',
              onClick: onConfirmReceive,
              loading: isConfirmingReceive,
            }
          : undefined,
      }
    }

    return {
      tone: 'muted',
      title: `Chờ ${nv} xác nhận đã nhận hàng`,
      description: canConfirmOnBehalf
        ? 'Nếu bạn đã trao tay hàng trực tiếp, có thể xác nhận thay.'
        : undefined,
      secondary:
        canConfirmOnBehalf && onConfirmReceiveOnBehalf ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isConfirmingReceive}>
                {isConfirmingReceive ? 'Đang xử lý…' : 'Xác nhận thay nhân viên'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xác nhận thay nhân viên?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bạn xác nhận đã trao hàng trực tiếp cho <strong>{nv}</strong>?
                  Hành động này sẽ chuyển phiếu sang "Đang giao" và được ghi log.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                <AlertDialogAction onClick={onConfirmReceiveOnBehalf}>Xác nhận đã trao hàng</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : undefined,
    }
  }

  if (status === 'in_progress') {
    if (isAssignee) {
      if (pendingStops > 0) {
        return {
          tone: 'blue',
          title: `Còn ${pendingStops} phòng cần giao`,
          description: 'Đến từng phòng và bấm "Đã giao phòng này" để xác nhận.',
        }
      }
      return { tone: 'green', title: 'Đã giao xong tất cả phòng', description: 'Chờ quản lý đóng phiếu.' }
    }
    return {
      tone: 'blue',
      title: `Đang giao: ${completedStops}/${totalStops} phòng`,
      description: assignedToName ? `Nhân viên: ${assignedToName}` : undefined,
    }
  }

  if (status === 'completed') {
    if (isWarehouseManager) {
      return {
        tone: 'green',
        title: `Đã giao xong ${totalStops} phòng`,
        description: 'Đóng phiếu để hoàn tất.',
        primary: onCloseRoute
          ? {
              label: 'Đóng phiếu',
              loadingLabel: 'Đang đóng…',
              onClick: onCloseRoute,
              loading: isClosing,
            }
          : undefined,
      }
    }
    return { tone: 'green', title: 'Đã giao xong', description: 'Chờ quản lý đóng phiếu.' }
  }

  return null
}

const TONE_CLASSES: Record<ActionCardSpec['tone'], { ring: string; accent: string }> = {
  amber: { ring: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20', accent: 'bg-amber-500' },
  blue: { ring: 'border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20', accent: 'bg-blue-500' },
  green: { ring: 'border-green-200 dark:border-green-900/50 bg-green-50/40 dark:bg-green-950/20', accent: 'bg-green-500' },
  muted: { ring: 'border-border bg-muted/30', accent: 'bg-muted-foreground' },
}

export function NextActionCard(props: NextActionCardProps) {
  const spec = buildSpec(props)
  if (!spec) return null

  const tone = TONE_CLASSES[spec.tone]

  return (
    <div className={cn('relative overflow-hidden rounded-lg border p-4 sm:p-5', tone.ring)}>
      <div className={cn('absolute inset-y-0 left-0 w-1', tone.accent)} aria-hidden />
      <div className="pl-2 space-y-3">
        <div className="space-y-1">
          <h2 className="text-base sm:text-lg font-semibold leading-tight">{spec.title}</h2>
          {spec.description && (
            <p className="text-sm text-muted-foreground leading-snug">{spec.description}</p>
          )}
        </div>
        {(spec.primary || spec.secondary) && (
          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
            {spec.secondary}
            {spec.primary && (
              <Button
                onClick={spec.primary.onClick}
                disabled={spec.primary.disabled || spec.primary.loading}
                className="w-full sm:w-auto h-12 sm:h-11 text-sm font-medium px-6"
              >
                {spec.primary.loading && spec.primary.loadingLabel
                  ? spec.primary.loadingLabel
                  : spec.primary.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
