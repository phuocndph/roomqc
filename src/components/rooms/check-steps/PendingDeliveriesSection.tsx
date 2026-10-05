import { Package, Check, Loader2, Truck, Clock, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { 
  PendingDelivery, 
  usePendingDeliveriesForRoom, 
  useConfirmDeliveryFromRoomCheck 
} from '@/hooks/usePendingDeliveries'
import { useUpdateConsumableSupplemented } from '@/hooks/useBookingConsumables'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useState } from 'react'

interface PendingDeliveriesSectionProps {
  roomId: string
  bookingId?: string | null
  onDeliveryConfirmed?: () => void
}

export function PendingDeliveriesSection({ 
  roomId, 
  bookingId,
  onDeliveryConfirmed 
}: PendingDeliveriesSectionProps) {
  const { data: pendingDeliveries, isLoading } = usePendingDeliveriesForRoom(roomId)
  const confirmDelivery = useConfirmDeliveryFromRoomCheck()
  const updateSupplemented = useUpdateConsumableSupplemented()
  const [confirmingAll, setConfirmingAll] = useState(false)

  if (isLoading) {
    return null
  }

  if (!pendingDeliveries || pendingDeliveries.length === 0) {
    return null
  }

  // Update booking_consumables supplemented_quantity for consumable items in delivery
  const updateBookingConsumables = async (delivery: PendingDelivery) => {
    if (!bookingId) return

    // Update supplemented_quantity for each consumable item
    for (const item of delivery.items) {
      try {
        await updateSupplemented.mutateAsync({
          bookingId,
          itemId: item.item_id,
          additionalQuantity: item.quantity,
        })
      } catch (error) {
        // If item doesn't exist in booking_consumables, ignore (could be non-consumable)
      }
    }
  }

  const handleConfirmDelivery = async (delivery: PendingDelivery) => {
    await confirmDelivery.mutateAsync({ roomOrderId: delivery.room_order_id })
    await updateBookingConsumables(delivery)
    onDeliveryConfirmed?.()
  }

  const handleConfirmAll = async () => {
    setConfirmingAll(true)
    try {
      for (const delivery of pendingDeliveries) {
        await confirmDelivery.mutateAsync({ roomOrderId: delivery.room_order_id })
        await updateBookingConsumables(delivery)
      }
      onDeliveryConfirmed?.()
    } finally {
      setConfirmingAll(false)
    }
  }

  const totalItems = pendingDeliveries.reduce(
    (sum, d) => sum + d.items.reduce((s, i) => s + i.quantity, 0),
    0
  )

  return (
    <Alert className="border-primary/50 bg-primary/5">
      <Truck className="h-4 w-4 text-primary" />
      <AlertTitle className="flex items-center gap-2">
        Phiếu giao hàng chờ xác nhận
        <Badge variant="secondary" className="ml-1">
          {pendingDeliveries.length} phiếu
        </Badge>
        <Badge variant="outline" className="ml-1">
          {totalItems} items
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-3">
        {/* Confirm All Button */}
        {pendingDeliveries.length > 1 && (
          <Button 
            onClick={handleConfirmAll}
            disabled={confirmingAll || confirmDelivery.isPending}
            className="w-full mb-3"
            variant="default"
          >
            {confirmingAll ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang xác nhận...
              </>
            ) : (
              <>
                <CheckCheck className="mr-2 h-4 w-4" />
                Xác nhận tất cả {pendingDeliveries.length} phiếu
              </>
            )}
          </Button>
        )}

        <Accordion type="multiple" className="w-full">
          {pendingDeliveries.map((delivery) => (
            <DeliveryAccordionItem 
              key={delivery.room_order_id}
              delivery={delivery}
              onConfirm={() => handleConfirmDelivery(delivery)}
              isConfirming={confirmDelivery.isPending || confirmingAll}
            />
          ))}
        </Accordion>
      </AlertDescription>
    </Alert>
  )
}

interface DeliveryAccordionItemProps {
  delivery: PendingDelivery
  onConfirm: () => void
  isConfirming: boolean
}

function DeliveryAccordionItem({ 
  delivery, 
  onConfirm, 
  isConfirming 
}: DeliveryAccordionItemProps) {
  const itemCount = delivery.items.reduce((s, i) => s + i.quantity, 0)
  const timeAgo = delivery.created_at 
    ? formatDistanceToNow(new Date(delivery.created_at), { addSuffix: true, locale: vi })
    : ''

  return (
    <AccordionItem value={delivery.room_order_id} className="border rounded-lg mb-2 bg-background">
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex items-center justify-between w-full pr-4">
          <div className="flex items-center gap-3">
            <Package className="h-4 w-4 text-muted-foreground" />
            <div className="text-left">
              <span className="font-medium">{delivery.order_code}</span>
              <span className="text-muted-foreground ml-2 text-sm">
                (Batch {delivery.batch_number})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {itemCount} items
            </Badge>
            {delivery.stop_status === 'pending' && (
              <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Clock className="h-3 w-3 mr-1" />
                Chờ giao
              </Badge>
            )}
            {delivery.stop_status === 'received' && (
              <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Package className="h-3 w-3 mr-1" />
                Đang giao
              </Badge>
            )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <div className="space-y-3">
          {/* Items list - compact layout without item codes */}
          <div className="grid grid-cols-1 gap-1">
            {delivery.items.map((item) => (
              <div 
                key={item.id} 
                className="flex items-center justify-between py-1.5 px-3 bg-muted/30 rounded"
              >
                <span className="text-sm font-medium">{item.item_name}</span>
                <Badge variant="outline" className="text-xs">
                  x{item.quantity}
                </Badge>
              </div>
            ))}
          </div>

          {/* Time info */}
          {timeAgo && (
            <p className="text-xs text-muted-foreground">
              Tạo phiếu {timeAgo}
            </p>
          )}

          {/* Confirm button */}
          <Button
            onClick={onConfirm}
            disabled={isConfirming}
            className="w-full"
            size="sm"
          >
            {isConfirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang xác nhận...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Xác nhận đã nhận đủ hàng
              </>
            )}
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}