import { format, differenceInHours } from 'date-fns'
import { vi } from 'date-fns/locale'
import { DoorOpen, CheckCircle, AlertTriangle, AlertCircle, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { RoomStatusBadge } from './DistributionStatusBadge'
import { cn } from '@/lib/utils'
import type { DistributionOrderRoom } from '@/types/distribution.types'

interface RoomDeliveryCardProps {
  room: DistributionOrderRoom
  isWarehouseManager?: boolean
  onConfirmDelivery?: (roomOrderId: string) => void
  onUndoDelivery?: (room: DistributionOrderRoom) => void
  isConfirming?: boolean
}

export function RoomDeliveryCard({ 
  room, 
  isWarehouseManager = false,
  onConfirmDelivery,
  onUndoDelivery,
  isConfirming = false
}: RoomDeliveryCardProps) {
  const canConfirm = room.status === 'pending' && isWarehouseManager
  
  const canUndo = (() => {
    if (room.status !== 'confirmed' || !room.confirmed_at) return false
    const hoursSinceConfirm = differenceInHours(new Date(), new Date(room.confirmed_at))
    return hoursSinceConfirm < 24 && isWarehouseManager
  })()

  return (
    <Card className={cn(
      'transition-all',
      room.status === 'confirmed' && 'border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-950/20',
      room.status === 'rejected' && 'border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-950/20'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <DoorOpen className="h-5 w-5" />
            Phòng {room.room_number}
          </CardTitle>
          <RoomStatusBadge status={room.status} />
        </div>
        <div className="text-sm text-muted-foreground">Tầng {room.floor}</div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <Separator />
        
        {/* Items list */}
        <div className="space-y-2">
          {room.items?.map(item => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <div className="flex-1 truncate">
                <span className="font-medium">{item.item_name}</span>
                <span className="text-muted-foreground ml-1">({item.item_code})</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">x{item.quantity}</Badge>
                {room.status === 'confirmed' && 
                  item.quantity_confirmed !== null && 
                  item.quantity_confirmed !== item.quantity && (
                  <Badge variant={item.quantity_confirmed < item.quantity ? 'destructive' : 'outline'}>
                    Thực: {item.quantity_confirmed}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Actions based on status */}
        {room.status === 'pending' && (
          <>
            {canConfirm ? (
              <div className="pt-2">
                <Button 
                  className="w-full" 
                  onClick={() => onConfirmDelivery?.(room.id)}
                  disabled={isConfirming}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isConfirming ? 'Đang xử lý...' : 'Xác nhận giao hàng'}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>Chỉ quản lý kho mới có thể xác nhận</span>
              </div>
            )}
          </>
        )}

        {/* Confirmed info with undo */}
        {room.status === 'confirmed' && room.confirmed_at && (
          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-muted-foreground">
              Xác nhận bởi {room.confirmed_by_name} lúc{' '}
              {format(new Date(room.confirmed_at), 'HH:mm dd/MM', { locale: vi })}
            </div>
            {canUndo && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onUndoDelivery?.(room)}
              >
                <Undo2 className="h-3 w-3 mr-1" />
                Hoàn tác
              </Button>
            )}
          </div>
        )}

        {/* Rejected info */}
        {room.status === 'rejected' && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p>Từ chối bởi {room.confirmed_by_name}</p>
              {room.rejection_reason && (
                <p className="mt-1">Lý do: {room.rejection_reason}</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
