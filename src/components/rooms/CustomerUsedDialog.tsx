import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus, Coffee, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Package } from 'lucide-react'
import { useUpdateRoomItemQuantity } from '@/hooks/useRoomItems'
import { useCreateChargeableConsumption } from '@/hooks/useChargeableConsumptions'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { triggerHaptic } from '@/lib/haptics'

interface CustomerUsedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: {
    item_id: string
    item_code: string
    item_name: string
    item_thumbnail?: string
    current_quantity: number
    room_item_id?: string | null
  } | null
  roomId: string
  bookingId?: string | null
}

export function CustomerUsedDialog({
  open,
  onOpenChange,
  item,
  roomId,
  bookingId,
}: CustomerUsedDialogProps) {
  const { t } = useTranslation(['rooms', 'common'])
  const [quantity, setQuantity] = useState(1)
  const updateQuantity = useUpdateRoomItemQuantity()
  const createChargeable = useCreateChargeableConsumption()

  const handleQuantityChange = (delta: number) => {
    triggerHaptic('light')
    setQuantity(prev => {
      const newQty = prev + delta
      if (newQty < 1) return 1
      if (item && newQty > item.current_quantity) return item.current_quantity
      return newQty
    })
  }

  const handleConfirm = async () => {
    if (!item) return

    const newQuantity = item.current_quantity - quantity
    
    if (newQuantity < 0) {
      toast.error(t('quickActions.invalidQuantity'))
      return
    }

    try {
      await updateQuantity.mutateAsync({
        roomId,
        itemId: item.item_id,
        quantity: newQuantity,
        roomItemId: item.room_item_id || null,
      })

      // Check if item is chargeable and create billing record
      try {
        const { data: itemData } = await supabase
          .from('items')
          .select('is_chargeable, charge_price, unit_price')
          .eq('id', item.item_id)
          .single()

        if (itemData?.is_chargeable) {
          // Find active booking for this room
          const activeBookingId = bookingId || await (async () => {
            const { data: activeBooking } = await supabase
              .from('room_bookings')
              .select('id')
              .eq('room_id', roomId)
              .in('status', ['checked_in', 'confirmed'])
              .order('check_in_date', { ascending: false })
              .limit(1)
              .maybeSingle()
            return activeBooking?.id || null
          })()

          if (activeBookingId) {
            const chargePrice = itemData.charge_price ?? itemData.unit_price ?? 0
            await createChargeable.mutateAsync({
              booking_id: activeBookingId,
              room_id: roomId,
              item_id: item.item_id,
              item_code: item.item_code,
              item_name: item.item_name,
              quantity,
              unit_price: chargePrice,
            })
          }
        }
      } catch (error) {
        console.error('Failed to create chargeable consumption:', error)
      }
      
      triggerHaptic('success')
      toast.success(t('quickActions.customerUsedSuccess', { 
        quantity, 
        itemName: item.item_name 
      }))
      onOpenChange(false)
      setQuantity(1)
    } catch (error) {
      triggerHaptic('error')
      toast.error(t('quickActions.customerUsedError'))
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setQuantity(1)
    }
    onOpenChange(open)
  }

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[340px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-amber-500" />
            {t('quickActions.customerUsedTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Item Info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            {item.item_thumbnail ? (
              <img
                src={item.item_thumbnail}
                alt={item.item_name}
                className="h-12 w-12 rounded object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded bg-background">
                <Package className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{item.item_name}</p>
              <p className="text-xs text-muted-foreground">{item.item_code}</p>
            </div>
            <Badge variant="secondary">
              {t('quickActions.inRoom')}: {item.current_quantity}
            </Badge>
          </div>

          {/* Quantity Selector */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground text-center">
              {t('quickActions.howManyUsed')}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                type="button"
                className="h-12 w-12"
                disabled={quantity <= 1}
                onClick={() => handleQuantityChange(-1)}
              >
                <Minus className="h-5 w-5" />
              </Button>
              <div className="w-20 h-12 flex items-center justify-center rounded-lg border-2 border-primary bg-primary/5 text-2xl font-bold text-primary">
                {quantity}
              </div>
              <Button
                variant="outline"
                size="icon"
                type="button"
                className="h-12 w-12"
                disabled={quantity >= item.current_quantity}
                onClick={() => handleQuantityChange(1)}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Quick Select */}
          {item.current_quantity > 1 && (
            <div className="flex justify-center gap-2">
              {[1, 2, 3].filter(n => n <= item.current_quantity).map(n => (
                <Button
                  key={n}
                  variant={quantity === n ? "default" : "outline"}
                  size="sm"
                  type="button"
                  className="h-8 w-10"
                  onClick={() => {
                    triggerHaptic('light')
                    setQuantity(n)
                  }}
                >
                  {n}
                </Button>
              ))}
              {item.current_quantity > 3 && (
                <Button
                  variant={quantity === item.current_quantity ? "default" : "outline"}
                  size="sm"
                  type="button"
                  className="h-8"
                  onClick={() => {
                    triggerHaptic('light')
                    setQuantity(item.current_quantity)
                  }}
                >
                  {t('quickActions.all')} ({item.current_quantity})
                </Button>
              )}
            </div>
          )}

          {/* Result Preview */}
          <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {t('quickActions.afterUsed')}: <span className="font-bold">{item.current_quantity - quantity}</span>
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={updateQuantity.isPending || createChargeable.isPending}
          >
            {t('common:cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={updateQuantity.isPending || createChargeable.isPending}
            className="bg-amber-500 hover:bg-amber-600"
          >
            {(updateQuantity.isPending || createChargeable.isPending) ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('common:processing')}
              </>
            ) : (
              <>
                <Coffee className="h-4 w-4 mr-2" />
                {t('quickActions.confirm')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
