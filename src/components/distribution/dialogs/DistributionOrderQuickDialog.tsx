import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { ExternalLink, MoreHorizontal, Printer, Pencil, Ban, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { OrderStatusBadge } from '@/components/distribution/components/DistributionStatusBadge'
import { RouteDetailView } from '@/components/distribution/components/RouteDetailView'
import { CancelOrderDialog } from '@/components/distribution/dialogs/CancelOrderDialog'
import { EditDistributionDialog } from '@/components/distribution/dialogs/EditDistributionDialog'
import {
  useDistributionOrderDetail,
  useCancelDistributionOrder,
} from '@/hooks/useDistributionOrders'
import { useIsMobile } from '@/hooks/use-mobile'
import { useUser } from '@/hooks/useUser'
import { printDistributionOrder } from '@/utils/printDistributionOrder'

const WAREHOUSE_MANAGER_ROLES = [
  'tenant_owner',
  'manager',
  'warehouse_manager',
  'hotel_manager',
]

interface Props {
  orderId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Popup hiển thị chi tiết phiếu giao hàng để xử lý nhanh,
 * không phải navigate sang trang riêng.
 * Reuse RouteDetailView + các dialog action như trang detail.
 */
export function DistributionOrderQuickDialog({ orderId, open, onOpenChange }: Props) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user } = useUser()

  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)

  const { data: order, isLoading } = useDistributionOrderDetail(open ? orderId : undefined)
  const { mutate: cancelOrder, isPending: isCancelling } = useCancelDistributionOrder()

  const isWarehouseManager = WAREHOUSE_MANAGER_ROLES.includes(user?.user_level_code || '')

  const allRoomsPending = order?.rooms?.every((r) => r.status === 'pending') ?? false
  const canEdit = order?.status === 'pending' && allRoomsPending
  const canCancel = order?.status === 'pending' || order?.status === 'released' || order?.status === 'in_progress'

  const handleCancelOrder = () => {
    if (!orderId || !order) return
    cancelOrder(
      {
        orderId,
        orderCode: order.order_code,
        assignedToUserId: order.assigned_to,
      },
      {
        onSuccess: () => {
          setShowCancelDialog(false)
          onOpenChange(false)
        },
      },
    )
  }

  const ActionsMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <MoreHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Khác</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {order?.status === 'pending' && !order?.assigned_to && isWarehouseManager && (
          <>
            <DropdownMenuItem onClick={() => setShowEditDialog(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Phân công nhân viên
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={() => setShowEditDialog(true)}
          disabled={!canEdit}
          className="gap-2"
        >
          <Pencil className="h-4 w-4" />
          Chỉnh sửa phiếu
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => order && printDistributionOrder(order)} className="gap-2">
          <Printer className="h-4 w-4" />
          In phiếu
        </DropdownMenuItem>
        {canCancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowCancelDialog(true)}
              disabled={isCancelling}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Ban className="h-4 w-4" />
              Huỷ phiếu
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const Header = () =>
    isLoading || !order ? (
      <div className="text-sm text-muted-foreground">Đang tải…</div>
    ) : (
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-base truncate">
              {order.order_code}
            </span>
            <OrderStatusBadge status={order.status} showSubLabel />
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            Tạo bởi {order.created_by_name} ·{' '}
            {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => {
              onOpenChange(false)
              navigate(`/inventory/distributions/${orderId}`)
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Mở trang đầy đủ
          </Button>
          <ActionsMenu />
        </div>
      </div>
    )

  const Body = () => (
    <div className="flex-1 overflow-y-auto -mx-6 px-6">
      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
          Đang tải phiếu…
        </div>
      ) : !order ? (
        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
          Không tìm thấy phiếu giao hàng
        </div>
      ) : (
        orderId && (
          <RouteDetailView
            orderId={orderId}
            embedded
            onAssign={() => setShowEditDialog(true)}
          />
        )
      )}
    </div>
  )

  const ActionDialogs = order ? (
    <>
      <CancelOrderDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        orderCode={order.order_code}
        onConfirm={handleCancelOrder}
        isPending={isCancelling}
      />
      <EditDistributionDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        order={order}
      />
    </>
  ) : null

  if (isMobile) {
    return (
      <>
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="bottom" className="h-[92vh] p-0 flex flex-col">
            <div className="px-4 py-3 border-b">
              <Header />
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {isLoading ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  Đang tải phiếu…
                </div>
              ) : !order ? (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  Không tìm thấy phiếu giao hàng
                </div>
              ) : (
                orderId && (
                  <RouteDetailView
                    orderId={orderId}
                    embedded
                    onAssign={() => setShowEditDialog(true)}
                  />
                )
              )}
            </div>
          </SheetContent>
        </Sheet>
        {ActionDialogs}
      </>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl w-[92vw] h-[88vh] flex flex-col p-6 gap-3 max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="space-y-0">
            <DialogTitle className="sr-only">Chi tiết phiếu giao hàng</DialogTitle>
            <Header />
          </DialogHeader>
          <Body />
        </DialogContent>
      </Dialog>
      {ActionDialogs}
    </>
  )
}
