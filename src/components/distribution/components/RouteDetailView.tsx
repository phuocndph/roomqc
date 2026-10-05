import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { UnifiedRoomList } from './UnifiedRoomList'
import { NextActionCard } from './NextActionCard'
import { ShiftBadge } from './ShiftBadge'
import { AdjustQuantityDialog, type InsufficientItem, type ItemAdjustment } from './AdjustQuantityDialog'
import { useRouteDetail, useCloseRoute, useConfirmReceiveOrder, useHandoverBatch } from '@/hooks/useRouteBatch'
import { useAuth } from '@/contexts/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { navigateBack } from '@/lib/navigation'
import type { ShiftCode, RouteStatus } from '@/types/route-batch.types'
import {
  MapPin,
  Calendar,
  User,
  Package,
  Lock,
  ArrowLeft,
  FileText,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'


interface RouteDetailViewProps {
  orderId: string
  embedded?: boolean
  onAssign?: () => void
}

export function RouteDetailView({ orderId, embedded = false, onAssign }: RouteDetailViewProps) {
  const { t } = useTranslation('distribution')
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: route, isLoading, error } = useRouteDetail(orderId)
  const closeRoute = useCloseRoute()
  const confirmReceive = useConfirmReceiveOrder()
  const handoverBatch = useHandoverBatch()

  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [insufficientItems, setInsufficientItems] = useState<InsufficientItem[]>([])

  const firstPendingBatch = route?.batches?.find(b => b.status === 'open')

  const isSelfAssignFlow = !!(user?.id && user.id === route?.created_by && user.id === route?.assigned_to)

  const handleHandoverFirstBatch = useCallback(async () => {
    if (!firstPendingBatch || !route) return
    
    const result = await handoverBatch.mutateAsync({ 
      batchId: firstPendingBatch.id,
      silent: isSelfAssignFlow,
    })
    
    if (!result.success && result.error === 'INSUFFICIENT_STOCK' && result.insufficient_items) {
      setInsufficientItems(result.insufficient_items)
      setAdjustDialogOpen(true)
      return
    }
    
    if (result.success && isSelfAssignFlow) {
      await confirmReceive.mutateAsync({ orderId: route.id, silent: true })
      toast.success('Đã kiểm tra kho & bắt đầu giao hàng')
    }
  }, [firstPendingBatch, handoverBatch, route, isSelfAssignFlow, confirmReceive])

  const handleHandoverWithAdjustments = useCallback(async (adjustments: ItemAdjustment[], reason: string) => {
    if (!firstPendingBatch || !route) return
    
    try {
      const result = await handoverBatch.mutateAsync({ 
        batchId: firstPendingBatch.id, 
        adjustments,
        silent: isSelfAssignFlow,
      })
      
      if (result.success) {
        setAdjustDialogOpen(false)
        setInsufficientItems([])
        
        if (isSelfAssignFlow) {
          await confirmReceive.mutateAsync({ orderId: route.id, silent: true })
          toast.success('Đã kiểm tra kho & bắt đầu giao hàng (đã điều chỉnh)')
        }
      }
    } catch (error) {
      toast.error('Không thể giao hàng')
    }
  }, [firstPendingBatch, handoverBatch, route, isSelfAssignFlow, confirmReceive])

  const isAssignee = user?.id === route?.assigned_to
  const userLevel = (user as any)?.user_level_code || ''
  const isLeader = ['tenant_owner', 'manager', 'supervisor'].includes(userLevel)
  const isStorekeeper = 
    ['tenant_owner', 'manager', 'warehouse_manager', 'storekeeper'].includes(userLevel) ||
    user?.id === route?.created_by
  const isCreatorSameAsAssignee = !!(user?.id && user.id === route?.created_by && user.id === route?.assigned_to)

  const totalStops = route?.stops?.length || 0
  const deliveredStops = route?.stops?.filter(s => s.stop_status === 'delivered').length || 0
  const resolvedStops = route?.stops?.filter(s => s.stop_status === 'resolved').length || 0
  const completedStops = deliveredStops + resolvedStops
  const cannotAccessStops = route?.stops?.filter(s => s.stop_status === 'cannot_access').length || 0
  const pendingStops = totalStops - completedStops - cannotAccessStops
  const progressPercent = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0

  const canClose = isLeader && (
    route?.status === 'completed' || 
    (route?.status === 'in_progress' && pendingStops === 0 && cannotAccessStops === 0)
  )

  const handleConfirmReceive = useCallback(async () => {
    if (!route) return
    await confirmReceive.mutateAsync({ orderId: route.id })
  }, [route, confirmReceive])

  const handleConfirmReceiveOnBehalf = useCallback(async () => {
    if (!route) return
    await confirmReceive.mutateAsync({ orderId: route.id })
    toast.success(`Đã xác nhận trao hàng thay ${route.assigned_to_name || 'nhân viên'}`)
  }, [route, confirmReceive])

  const handleEditOrder = useCallback(() => {
    setAdjustDialogOpen(false)
    toast.info('Vui lòng chỉnh sửa phiếu và thử lại')
  }, [])

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['route-detail', orderId] })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !route) {
    return (
      <div className="border rounded-lg p-6">
        <p className="text-destructive">Không thể tải thông tin route</p>
        <Button variant="outline" className="mt-4" onClick={() => navigateBack(navigate, '/inventory')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Quay lại
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header - only show when not embedded */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/inventory')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{route.order_code}</h1>
            </div>
          </div>
          {canClose && (
            <Button
              onClick={() => closeRoute.mutate({ orderId: route.id })}
              disabled={closeRoute.isPending}
              className="gap-2"
            >
              <Lock className="h-4 w-4" />
              {closeRoute.isPending ? 'Đang đóng...' : 'Đóng Route'}
            </Button>
          )}
        </div>
      )}

      {/* Next action card (replaces 4-step wizard) */}
      <NextActionCard
        status={route.status as RouteStatus}
        assignedToName={route.assigned_to_name}
        totalStops={totalStops}
        completedStops={completedStops}
        pendingStops={pendingStops}
        isWarehouseManager={isStorekeeper}
        isAssignee={isAssignee}
        hasAssignee={!!route.assigned_to}
        isCreatorSameAsAssignee={isCreatorSameAsAssignee}
        onAssign={
          route.status === 'pending' && !route.assigned_to && (isStorekeeper || isLeader)
            ? onAssign
            : undefined
        }
        onHandoverBatch={
          route.status === 'pending' && isStorekeeper && firstPendingBatch && route.assigned_to
            ? handleHandoverFirstBatch
            : undefined
        }
        onConfirmReceive={route.status === 'released' && isAssignee ? handleConfirmReceive : undefined}
        canConfirmOnBehalf={route.status === 'released' && !isAssignee && (isLeader || isStorekeeper)}
        onConfirmReceiveOnBehalf={
          route.status === 'released' && !isAssignee && (isLeader || isStorekeeper)
            ? handleConfirmReceiveOnBehalf
            : undefined
        }
        onCloseRoute={canClose ? () => closeRoute.mutate({ orderId: route.id }) : undefined}
        isHandingOver={handoverBatch.isPending}
        isConfirmingReceive={confirmReceive.isPending}
        isClosing={closeRoute.isPending}
      />

      {/* Compact one-line info + progress */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border rounded-lg text-sm">
        {route.shift_code && <ShiftBadge shift={route.shift_code as ShiftCode} />}
        {route.floor !== null && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>Tầng {route.floor}</span>
          </span>
        )}
        {route.shift_date && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{format(new Date(route.shift_date), 'dd/MM', { locale: vi })}</span>
          </span>
        )}
        {route.assigned_to_name && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span>{route.assigned_to_name}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 min-w-[140px]">
          <Progress value={progressPercent} className="h-1.5 flex-1" />
          <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
            {completedStops}/{totalStops}
          </span>
        </div>
      </div>

      {/* Room List */}
      <UnifiedRoomList
        stops={route.stops || []}
        orderCode={route.order_code}
        tenantId={route.tenant_id}
        hotelId={route.hotel_id}
        orderStatus={route.status}
        isAssignee={isAssignee}
        canDeliverAsManager={isStorekeeper || isLeader}
        onRefresh={handleRefresh}
      />

      {/* Notes - design spec: div border rounded-lg */}
      {route.notes && (
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Ghi chú</span>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{route.notes}</p>
        </div>
      )}

      {/* Adjust Quantity Dialog */}
      <AdjustQuantityDialog
        open={adjustDialogOpen}
        onOpenChange={setAdjustDialogOpen}
        insufficientItems={insufficientItems}
        onConfirm={handleHandoverWithAdjustments}
        onEditOrder={handleEditOrder}
        isConfirming={handoverBatch.isPending}
      />
    </div>
  )
}
