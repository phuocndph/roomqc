import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, ChevronDown, AlertTriangle, RotateCcw, Undo2, ArrowRightLeft, Package, ChevronRight, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  useDeliverStop,
  useMarkCannotAccess,
  useRetryStop,
  useReturnToStock,
  useHandoverStop,
  useConfirmReceiveOrder,
} from '@/hooks/useRouteBatch'
import type { RouteStop, ExceptionType, ShiftCode } from '@/types/route-batch.types'
import { EXCEPTION_TYPE_LABELS, SHIFT_LABELS } from '@/types/route-batch.types'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

interface UnifiedRoomListProps {
  stops: RouteStop[]
  orderCode?: string
  tenantId?: string
  hotelId?: string
  orderStatus: string
  isAssignee: boolean
  canDeliverAsManager?: boolean
  onRefresh?: () => void
}

export function UnifiedRoomList({
  stops,
  orderCode,
  tenantId,
  hotelId,
  orderStatus,
  isAssignee,
  canDeliverAsManager = false,
  onRefresh,
}: UnifiedRoomListProps) {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [showCannotAccessDialog, setShowCannotAccessDialog] = useState(false)
  const [showHandoverDialog, setShowHandoverDialog] = useState(false)
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null)
  const [exceptionType, setExceptionType] = useState<ExceptionType>('guest_inside')
  const [exceptionReason, setExceptionReason] = useState('')
  const [nextShift, setNextShift] = useState<ShiftCode>('afternoon')
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set())

  const toggleExpand = (roomId: string) => {
    setExpandedRooms(prev => {
      const next = new Set(prev)
      if (next.has(roomId)) {
        next.delete(roomId)
      } else {
        next.add(roomId)
      }
      return next
    })
  }

  const deliverStop = useDeliverStop()
  const markCannotAccess = useMarkCannotAccess()
  const retryStop = useRetryStop()
  const returnToStock = useReturnToStock()
  const handoverStop = useHandoverStop()
  // confirmReceiveOrder removed in v1.1.15 — NV phải xác nhận qua NextActionCard, không auto-confirm.

  // Assignee có thể giao ngay khi phiếu đã released (sẽ tự xác nhận nhận hàng)
  // Manager/Storekeeper chỉ giao thay khi đã in_progress
  // v1.1.15: chỉ cho giao khi đã in_progress. 'released' phải bấm "Tôi đã nhận đủ hàng" trước.
  const canDeliverStops =
    (isAssignee && orderStatus === 'in_progress') ||
    (canDeliverAsManager && orderStatus === 'in_progress')

  const { groupedStops, hasMultipleBatches } = useMemo(() => {
    const batches = new Map<number, RouteStop[]>()
    
    stops.forEach(stop => {
      const batchNum = stop.batch_number || 1
      if (!batches.has(batchNum)) {
        batches.set(batchNum, [])
      }
      batches.get(batchNum)!.push(stop)
    })
    
    const sortOrder = { pending: 0, cannot_access: 1, delivered: 2, resolved: 3 }
    batches.forEach((batchStops) => {
      batchStops.sort((a, b) => 
        (sortOrder[a.stop_status] ?? 99) - (sortOrder[b.stop_status] ?? 99)
      )
    })
    
    const sortedBatches = Array.from(batches.entries()).sort(([a], [b]) => a - b)
    
    return {
      groupedStops: sortedBatches,
      hasMultipleBatches: batches.size > 1
    }
  }, [stops])

  const performDeliver = (stop: RouteStop) => {
    deliverStop.mutate(
      {
        roomOrderId: stop.id,
        roomInfo: {
          room_id: stop.room_id,
          room_number: stop.room_number,
          hotel_id: hotelId,
          tenant_id: tenantId,
          order_code: orderCode,
          room_order_id: stop.id,
          items: stop.items.map(i => ({
            item_name: i.item_name,
            quantity: i.quantity
          }))
        }
      },
      { 
        onSuccess: () => {
          onRefresh?.()
          toast.info('Đang chuyển đến bước kiểm tra phòng...')
          navigate(`/rooms/${stop.room_id}/check?type=delivery&distribution_order_id=${stop.distribution_order_id}&room_order_id=${stop.id}&returnTo=/inventory/distributions/${stop.distribution_order_id}`)
        } 
      }
    )
  }

  const handleDeliver = (stop: RouteStop) => {
    // v1.1.15: bỏ auto-confirm im lặng. NV phải bấm "Tôi đã nhận đủ hàng" trước
    // (NextActionCard). Khi orderStatus === 'released' mà cố giao → toast nhắc.
    if (orderStatus === 'released') {
      toast.warning('Bạn cần xác nhận "Tôi đã nhận đủ hàng" trước khi giao phòng.')
      return
    }
    performDeliver(stop)
  }

  const openCannotAccessDialog = (stop: RouteStop, quickType?: ExceptionType) => {
    setSelectedStop(stop)
    setExceptionType(quickType || 'guest_inside')
    setExceptionReason('')
    setShowCannotAccessDialog(true)
  }

  const handleMarkCannotAccess = () => {
    if (!selectedStop) return
    markCannotAccess.mutate(
      {
        roomOrderId: selectedStop.id,
        exceptionType,
        exceptionReason: exceptionReason || undefined,
      },
      {
        onSuccess: () => {
          setShowCannotAccessDialog(false)
          setSelectedStop(null)
          onRefresh?.()
        },
      }
    )
  }

  const handleRetry = (stop: RouteStop) => {
    retryStop.mutate(
      { roomOrderId: stop.id },
      { onSuccess: () => onRefresh?.() }
    )
  }

  const handleReturnToStock = (stop: RouteStop) => {
    returnToStock.mutate(
      { roomOrderId: stop.id },
      { onSuccess: () => onRefresh?.() }
    )
  }

  const openHandoverDialog = (stop: RouteStop) => {
    setSelectedStop(stop)
    setNextShift('afternoon')
    setShowHandoverDialog(true)
  }

  const handleHandover = () => {
    if (!selectedStop) return
    handoverStop.mutate(
      {
        roomOrderId: selectedStop.id,
        nextShiftCode: nextShift,
      },
      {
        onSuccess: () => {
          setShowHandoverDialog(false)
          setSelectedStop(null)
          onRefresh?.()
        },
      }
    )
  }

  const handleRoomClick = (stop: RouteStop) => {
    navigate(`/rooms/${stop.room_id}/check?type=delivery&distribution_order_id=${stop.distribution_order_id}&room_order_id=${stop.id}&returnTo=/inventory/distributions/${stop.distribution_order_id}`)
  }

  if (stops.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Không có phòng nào trong phiếu này
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden">
        {groupedStops.map(([batchNumber, batchStops]) => (
          <div key={batchNumber}>
            {hasMultipleBatches && (
              <div className="px-3 py-1.5 bg-muted/50 border-b text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Package className="h-3.5 w-3.5" />
                Batch {batchNumber} ({batchStops.length} phòng)
              </div>
            )}
            
            {batchStops.map((stop) => (
              <RoomCard
                key={stop.id}
                stop={stop}
                orderStatus={orderStatus}
                isAssignee={isAssignee}
                canDeliver={canDeliverStops && stop.stop_status === 'pending'}
                canMarkCannotAccess={canDeliverStops && stop.stop_status === 'pending'}
                canRetry={canDeliverStops && stop.stop_status === 'cannot_access'}
                canReturnToStock={canDeliverStops && stop.stop_status === 'cannot_access'}
                canHandover={canDeliverStops && stop.stop_status === 'cannot_access'}
                onDeliver={() => handleDeliver(stop)}
                onCannotAccess={(quickType) => openCannotAccessDialog(stop, quickType)}
                onRetry={() => handleRetry(stop)}
                onReturnToStock={() => handleReturnToStock(stop)}
                onHandover={() => openHandoverDialog(stop)}
                onRoomClick={() => handleRoomClick(stop)}
                isDelivering={deliverStop.isPending}
                isRetrying={retryStop.isPending}
                isReturning={returnToStock.isPending}
                isMobile={isMobile}
                isExpanded={expandedRooms.has(stop.id)}
                onToggleExpand={() => toggleExpand(stop.id)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Cannot Access Dialog */}
      <Dialog open={showCannotAccessDialog} onOpenChange={setShowCannotAccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Không vào được phòng {selectedStop?.room_number}</DialogTitle>
            <DialogDescription>
              Chọn lý do không thể giao hàng đến phòng này
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Lý do</Label>
              <Select
                value={exceptionType}
                onValueChange={(v) => setExceptionType(v as ExceptionType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXCEPTION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ghi chú (tùy chọn)</Label>
              <Textarea
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value)}
                placeholder="Thêm ghi chú chi tiết..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCannotAccessDialog(false)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={handleMarkCannotAccess}
              disabled={markCannotAccess.isPending}
            >
              {markCannotAccess.isPending ? 'Đang xử lý...' : 'Xác nhận'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Handover Dialog */}
      <Dialog open={showHandoverDialog} onOpenChange={setShowHandoverDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bàn giao phòng {selectedStop?.room_number}</DialogTitle>
            <DialogDescription>
              Tạo route mới cho ca sau với phòng này
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Ca tiếp theo</Label>
              <Select
                value={nextShift}
                onValueChange={(v) => setNextShift(v as ShiftCode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SHIFT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-medium mb-1">Lưu ý:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Hàng đã được trả về kho</li>
                <li>Route mới sẽ được tạo với cùng danh sách sản phẩm</li>
                <li>Route mới sẽ gán cho giám sát ca sau</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHandoverDialog(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleHandover}
              disabled={handoverStop.isPending}
            >
              {handoverStop.isPending ? 'Đang xử lý...' : 'Bàn giao'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface RoomCardProps {
  stop: RouteStop
  orderStatus: string
  isAssignee: boolean
  canDeliver: boolean
  canMarkCannotAccess: boolean
  canRetry: boolean
  canReturnToStock: boolean
  canHandover: boolean
  onDeliver: () => void
  onCannotAccess: (quickType?: ExceptionType) => void
  onRetry: () => void
  onReturnToStock: () => void
  onHandover: () => void
  onRoomClick: () => void
  isDelivering: boolean
  isRetrying: boolean
  isReturning: boolean
  isMobile: boolean
  isExpanded: boolean
  onToggleExpand: () => void
}

function RoomCard({
  stop,
  orderStatus,
  isAssignee,
  canDeliver,
  canMarkCannotAccess,
  canRetry,
  canReturnToStock,
  canHandover,
  onDeliver,
  onCannotAccess,
  onRetry,
  onReturnToStock,
  onHandover,
  onRoomClick,
  isDelivering,
  isRetrying,
  isReturning,
  isMobile,
  isExpanded,
  onToggleExpand,
}: RoomCardProps) {
  const isCompleted = stop.stop_status === 'delivered' || stop.stop_status === 'resolved'
  const isCannotAccess = stop.stop_status === 'cannot_access'
  const canClickRoom = orderStatus === 'in_progress' || orderStatus === 'completed'
  
  // Item summary: show first 2 items inline
  const firstItems = stop.items.slice(0, 2)
  const remainingCount = stop.items.length - 2
  const summaryParts = firstItems.map(i => `${i.item_name} x${i.quantity}`)
  const summaryText = remainingCount > 0 
    ? `${summaryParts.join(', ')} +${remainingCount}`
    : summaryParts.join(', ')

  return (
    <div
      className={cn(
        'px-3 py-2.5 border-b last:border-b-0 border-l-4 transition-all',
        isCompleted && 'border-l-green-500 opacity-60',
        isCannotAccess && 'border-l-red-500 opacity-60',
        !isCompleted && !isCannotAccess && 'border-l-transparent hover:bg-muted/20'
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-3">
        {/* Expand toggle */}
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          className="p-1 -ml-1 hover:bg-muted rounded shrink-0"
        >
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isExpanded && "rotate-180"
          )} />
        </button>

        {/* Room info */}
        <div 
          className={cn(
            "flex flex-col min-w-0 flex-1 gap-0.5",
            canClickRoom ? "cursor-pointer group" : "cursor-default"
          )}
          onClick={canClickRoom ? onRoomClick : undefined}
        >
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-sm font-bold shrink-0",
              isCompleted && "line-through"
            )}>
              {stop.room_number}
            </span>
            {isCompleted && <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />}
            {isCannotAccess && <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />}
            {canClickRoom && (
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          {/* Inline item summary */}
          <span className="text-xs text-muted-foreground truncate">{summaryText}</span>
        </div>
        
        {/* Deliver button - larger on mobile */}
        {canDeliver && (
          <Button
            onClick={(e) => { e.stopPropagation(); onDeliver(); }}
            disabled={isDelivering}
            size={isMobile ? 'default' : 'sm'}
            className={cn(
              'shrink-0 gap-1.5',
              isMobile && 'h-11 px-5 text-sm font-semibold'
            )}
          >
            <CheckCircle className="h-4 w-4" />
            {isDelivering ? '...' : 'GIAO'}
          </Button>
        )}

        {/* Disabled deliver button with tooltip when pending but blocked by status */}
        {!canDeliver && stop.stop_status === 'pending' && orderStatus !== 'completed' && orderStatus !== 'closed' && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0">
                  <Button
                    disabled
                    size={isMobile ? 'default' : 'sm'}
                    variant="outline"
                    className={cn(
                      'shrink-0 gap-1.5 pointer-events-none',
                      isMobile && 'h-11 px-5 text-sm font-semibold'
                    )}
                  >
                    <CheckCircle className="h-4 w-4" />
                    GIAO
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[240px]">
                {orderStatus === 'pending' && 'Phiếu chưa được giao từ kho.'}
                {orderStatus === 'released' && !isAssignee && 'Chờ nhân viên xác nhận nhận hàng. Bạn không phải người được phân công.'}
                {orderStatus === 'released' && isAssignee && 'Bấm "Xác nhận đã nhận đủ hàng" ở phía trên trước khi giao.'}
                {orderStatus === 'in_progress' && !isAssignee && 'Chỉ nhân viên được phân công mới có thể giao phòng.'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {/* Cannot access icon button */}
        {canMarkCannotAccess && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
               aria-label="Ban">
                <Ban className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onCannotAccess('guest_inside')}>
                Khách trong phòng
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCannotAccess('dnd')}>
                Do Not Disturb
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCannotAccess('locked')}>
                Phòng khóa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCannotAccess('other')}>
                Lý do khác...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        
        {/* Status for completed */}
        {isCompleted && (
          <span className="text-xs text-green-600 font-medium shrink-0">Đã giao</span>
        )}
      </div>

      {/* Expanded items list */}
      {isExpanded && (
        <div className="mt-2 ml-4 pl-3 space-y-0.5 border-l-2 border-muted">
          {stop.items.map(item => (
            <div 
              key={item.id}
              className="flex items-center justify-between text-sm py-0.5"
            >
              <span className={cn(
                "text-muted-foreground",
                (item.quantity_confirmed ?? 0) > 0 && "text-green-600"
              )}>
                {item.item_name}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                x{item.quantity}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Exception info */}
      {stop.exception_type && (
        <div className="mt-1 text-xs text-destructive">
          {EXCEPTION_TYPE_LABELS[stop.exception_type]}
          {stop.exception_reason && `: ${stop.exception_reason}`}
        </div>
      )}

      {/* Actions for cannot_access stops */}
      {isCannotAccess && (canRetry || canReturnToStock || canHandover) && (
        <div className="mt-2 flex gap-2">
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={isRetrying}
              className="h-8 flex-1 gap-1 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Thử lại
            </Button>
          )}
          {canReturnToStock && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReturnToStock}
              disabled={isReturning}
              className="h-8 flex-1 gap-1 text-xs"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Trả kho
            </Button>
          )}
          {canHandover && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onHandover}
              className="h-8 flex-1 gap-1 text-xs"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Bàn giao
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
