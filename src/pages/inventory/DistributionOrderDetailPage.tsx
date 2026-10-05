import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { ArrowLeft, MoreHorizontal, Printer, Pencil, Ban, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigateBack } from '@/lib/navigation'
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
import { UndoDeliveryDialog } from '@/components/distribution/dialogs/UndoDeliveryDialog'
import { EditDistributionDialog } from '@/components/distribution/dialogs/EditDistributionDialog'
import { useDistributionOrderDetail, useCancelDistributionOrder } from '@/hooks/useDistributionOrders'
import { useUndoRoomDelivery } from '@/hooks/useRoomDistributionHistory'
import { useIsMobile } from '@/hooks/use-mobile'
import { useUser } from '@/hooks/useUser'
import { printDistributionOrder } from '@/utils/printDistributionOrder'
import type { DistributionOrderRoom } from '@/types/distribution.types'

const WAREHOUSE_MANAGER_ROLES = ['tenant_owner', 'manager', 'warehouse_manager', 'hotel_manager']

export default function DistributionOrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user } = useUser()
  
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showUndoDialog, setShowUndoDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<DistributionOrderRoom | null>(null)
  
  const { data: order, isLoading } = useDistributionOrderDetail(id)
  const { mutate: cancelOrder, isPending: isCancelling } = useCancelDistributionOrder()
  const { mutate: undoDelivery, isPending: isUndoing } = useUndoRoomDelivery()

  const isWarehouseManager = WAREHOUSE_MANAGER_ROLES.includes(user?.user_level_code || '')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Đang tải...</div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-muted-foreground">Không tìm thấy phiếu giao hàng</div>
        <Button variant="outline" onClick={() => navigateBack(navigate, '/inventory/distributions')}>
          Quay lại
        </Button>
      </div>
    )
  }

  const allRoomsPending = order.rooms?.every(r => r.status === 'pending') ?? false
  const canEdit = order.status === 'pending' && allRoomsPending
  const canCancel = order.status === 'pending' || order.status === 'in_progress'

  const handleUndoRoom = () => {
    if (!selectedRoom || !user?.id) return
    undoDelivery({
      distributionOrderRoomId: selectedRoom.id,
      performedBy: user.id
    }, {
      onSuccess: () => {
        setShowUndoDialog(false)
        setSelectedRoom(null)
      }
    })
  }

  const handleCancelOrder = () => {
    if (!id || !order) return
    cancelOrder({
      orderId: id,
      orderCode: order.order_code,
      assignedToUserId: order.assigned_to,
    }, {
      onSuccess: () => {
        setShowCancelDialog(false)
        navigate('/inventory/distributions')
      }
    })
  }

  const ActionsMenu = ({ size = 'sm' }: { size?: 'sm' | 'default' }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size === 'sm' ? 'sm' : 'default'} className="gap-1">
          <MoreHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Khác</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {order.status === 'pending' && !order.assigned_to && isWarehouseManager && (
          <>
            <DropdownMenuItem onClick={() => setShowEditDialog(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Phân công nhân viên
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={() => setShowEditDialog(true)} disabled={!canEdit} className="gap-2">
          <Pencil className="h-4 w-4" />
          Chỉnh sửa phiếu
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => printDistributionOrder(order)} className="gap-2">
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

  // Mobile view
  if (isMobile) {
    return (
      <>
        <div className="flex flex-col h-full">
          {/* Slim header */}
          <div className="sticky top-0 z-10 bg-background border-b px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateBack(navigate, '/inventory/distributions')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-sm truncate">{order.order_code}</span>
                  <OrderStatusBadge status={order.status} />
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {order.created_by_name} • {format(new Date(order.created_at), 'dd/MM HH:mm', { locale: vi })}
                </p>
              </div>
              <ActionsMenu />
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3">
            {id && <RouteDetailView orderId={id} embedded onAssign={() => setShowEditDialog(true)} />}
          </div>
        </div>

        {/* Dialogs */}
        <CancelOrderDialog
          open={showCancelDialog}
          onOpenChange={setShowCancelDialog}
          orderCode={order.order_code}
          onConfirm={handleCancelOrder}
          isPending={isCancelling}
        />

        <UndoDeliveryDialog
          open={showUndoDialog}
          onOpenChange={setShowUndoDialog}
          room={selectedRoom}
          onConfirm={handleUndoRoom}
          isPending={isUndoing}
        />

        <EditDistributionDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          order={order}
        />
      </>
    )
  }

  // Desktop view
  return (
    <div className="container mx-auto py-6 space-y-4 max-w-5xl">
      {/* Slim header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/inventory/distributions')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold font-mono">{order.order_code}</h1>
            <OrderStatusBadge status={order.status} showSubLabel />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tạo bởi {order.created_by_name} • {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
          </p>
        </div>
        <ActionsMenu size="default" />
      </div>

      {/* Route View */}
      {id && <RouteDetailView orderId={id} embedded onAssign={() => setShowEditDialog(true)} />}

      {/* Dialogs */}
      <CancelOrderDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        orderCode={order.order_code}
        onConfirm={handleCancelOrder}
        isPending={isCancelling}
      />
      
      <UndoDeliveryDialog
        open={showUndoDialog}
        onOpenChange={setShowUndoDialog}
        room={selectedRoom}
        onConfirm={handleUndoRoom}
        isPending={isUndoing}
      />
      
      <EditDistributionDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        order={order}
      />
    </div>
  )
}
