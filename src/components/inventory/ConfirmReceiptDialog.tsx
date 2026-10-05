import { useState } from 'react'
import { Plus, Minus, CheckCircle, Package, AlertTriangle, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTranslation } from 'react-i18next'
import type { DistributionOrderRoom, DistributionOrderItem } from '@/types/distribution.types'
import AddItemsDialog from './AddItemsDialog'

interface ItemConfirmation {
  item_id: string
  quantity_confirmed: number
  item_name: string
  item_code: string
  quantity_requested: number
}

interface AdditionalItem {
  item_id: string
  item_name: string
  item_code: string
  quantity: number
  quantity_in_stock: number
}

interface ConfirmReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: DistributionOrderRoom | null
  onConfirm: (
    roomOrderId: string, 
    items: { item_id: string; quantity_confirmed: number }[],
    additionalItems: { item_id: string; quantity: number }[]
  ) => void
  isPending: boolean
}

export default function ConfirmReceiptDialog({
  open,
  onOpenChange,
  room,
  onConfirm,
  isPending,
}: ConfirmReceiptDialogProps) {
  const isMobile = useIsMobile()
  const { t } = useTranslation('distribution')
  
  const [itemConfirmations, setItemConfirmations] = useState<ItemConfirmation[]>([])
  const [additionalItems, setAdditionalItems] = useState<AdditionalItem[]>([])
  const [showAddItems, setShowAddItems] = useState(false)

  // Initialize confirmations when room changes
  const initializeConfirmations = () => {
    if (room?.items) {
      setItemConfirmations(
        room.items.map(item => ({
          item_id: item.item_id,
          quantity_confirmed: item.quantity,
          item_name: item.item_name,
          item_code: item.item_code,
          quantity_requested: item.quantity,
        }))
      )
      setAdditionalItems([])
    }
  }

  // Reset state when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && room) {
      initializeConfirmations()
    }
    onOpenChange(newOpen)
  }

  const updateQuantity = (itemId: string, delta: number) => {
    setItemConfirmations(prev =>
      prev.map(item => {
        if (item.item_id === itemId) {
          const newQty = Math.max(0, Math.min(item.quantity_requested, item.quantity_confirmed + delta))
          return { ...item, quantity_confirmed: newQty }
        }
        return item
      })
    )
  }

  const setQuantity = (itemId: string, value: number) => {
    setItemConfirmations(prev =>
      prev.map(item => {
        if (item.item_id === itemId) {
          const newQty = Math.max(0, Math.min(item.quantity_requested, value))
          return { ...item, quantity_confirmed: newQty }
        }
        return item
      })
    )
  }

  const updateAdditionalQuantity = (itemId: string, delta: number) => {
    setAdditionalItems(prev =>
      prev.map(item => {
        if (item.item_id === itemId) {
          const newQty = Math.max(1, Math.min(item.quantity_in_stock, item.quantity + delta))
          return { ...item, quantity: newQty }
        }
        return item
      })
    )
  }

  const removeAdditionalItem = (itemId: string) => {
    setAdditionalItems(prev => prev.filter(item => item.item_id !== itemId))
  }

  const handleAddItems = (items: AdditionalItem[]) => {
    // Merge with existing additional items
    const existingIds = new Set(additionalItems.map(i => i.item_id))
    const newItems = items.filter(i => !existingIds.has(i.item_id))
    setAdditionalItems(prev => [...prev, ...newItems])
    setShowAddItems(false)
  }

  const handleConfirm = () => {
    if (!room) return
    
    const items = itemConfirmations.map(item => ({
      item_id: item.item_id,
      quantity_confirmed: item.quantity_confirmed,
    }))
    
    const additional = additionalItems.map(item => ({
      item_id: item.item_id,
      quantity: item.quantity,
    }))
    
    onConfirm(room.id, items, additional)
  }

  const hasDifferences = itemConfirmations.some(
    item => item.quantity_confirmed !== item.quantity_requested
  )

  const Content = () => (
    <div className="space-y-4">
      {/* Ordered Items */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Package className="h-4 w-4" />
          {t('confirmReceipt.orderedItems', 'Đồ trong phiếu')}
        </h4>
        
        <ScrollArea className={isMobile ? 'h-[300px]' : 'max-h-[350px]'}>
          <div className="space-y-3 pr-4">
            {itemConfirmations.map(item => {
              const isDifferent = item.quantity_confirmed !== item.quantity_requested
              const isMissing = item.quantity_confirmed < item.quantity_requested
              
              return (
                <div 
                  key={item.item_id} 
                  className={`p-3 rounded-lg border ${
                    isDifferent 
                      ? isMissing 
                        ? 'border-amber-200 bg-amber-50/50' 
                        : 'border-border'
                      : 'border-border bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.item_name}</p>
                      <p className="text-xs text-muted-foreground">{item.item_code}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {t('confirmReceipt.requested', 'Yêu cầu')}: {item.quantity_requested}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {t('confirmReceipt.actualReceived', 'Thực nhận')}:
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.item_id, -1)}
                        disabled={item.quantity_confirmed <= 0}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        value={item.quantity_confirmed}
                        onChange={(e) => setQuantity(item.item_id, parseInt(e.target.value) || 0)}
                        className="w-16 h-8 text-center"
                        min={0}
                        max={item.quantity_requested}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item.item_id, 1)}
                        disabled={item.quantity_confirmed >= item.quantity_requested}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {isMissing && (
                    <div className="flex items-center gap-1 mt-2 text-amber-600 text-xs">
                      <AlertTriangle className="h-3 w-3" />
                      <span>{t('confirmReceipt.missing', 'Thiếu')} {item.quantity_requested - item.quantity_confirmed}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Additional Items */}
      {additionalItems.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              {t('confirmReceipt.additionalItems', 'Đồ phát sinh')}
            </h4>
            
            <div className="space-y-2">
              {additionalItems.map(item => (
                <div key={item.item_id} className="p-3 rounded-lg border border-green-200 bg-green-50/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.item_name}</p>
                      <p className="text-xs text-muted-foreground">{item.item_code}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => removeAdditionalItem(item.item_id)}
                    >
                      ×
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-muted-foreground">{t('confirmReceipt.quantity', 'Số lượng')}:</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateAdditionalQuantity(item.item_id, -1)}
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-10 text-center text-sm">{item.quantity}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateAdditionalQuantity(item.item_id, 1)}
                        disabled={item.quantity >= item.quantity_in_stock}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      ({t('confirmReceipt.inStock', 'Tồn')}: {item.quantity_in_stock})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Add Items Button */}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setShowAddItems(true)}
      >
        <PlusCircle className="h-4 w-4 mr-2" />
        {t('confirmReceipt.addIncidentals', 'Thêm đồ phát sinh')}
      </Button>
    </div>
  )

  const Footer = () => (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
        {t('confirmReceipt.cancel', 'Hủy')}
      </Button>
      <Button onClick={handleConfirm} disabled={isPending} className="flex-1">
        <CheckCircle className="h-4 w-4 mr-2" />
        {isPending 
          ? t('confirmReceipt.processing', 'Đang xử lý...') 
          : t('confirmReceipt.confirm', 'Xác nhận nhận hàng')
        }
      </Button>
    </div>
  )

  // Get existing item IDs to exclude from add dialog
  const existingItemIds = [
    ...itemConfirmations.map(i => i.item_id),
    ...additionalItems.map(i => i.item_id),
  ]

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>
                {t('confirmReceipt.title', 'Xác nhận nhận hàng')} - {t('confirmReceipt.room', 'Phòng')} {room?.room_number}
              </DrawerTitle>
              <DrawerDescription>
                {t('confirmReceipt.description', 'Điều chỉnh số lượng thực tế nhận và thêm đồ phát sinh nếu có')}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-4">
              <Content />
            </div>
            <DrawerFooter>
              <Footer />
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        <AddItemsDialog
          open={showAddItems}
          onOpenChange={setShowAddItems}
          onAdd={handleAddItems}
          excludeItemIds={existingItemIds}
        />
      </>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t('confirmReceipt.title', 'Xác nhận nhận hàng')} - {t('confirmReceipt.room', 'Phòng')} {room?.room_number}
            </DialogTitle>
            <DialogDescription>
              {t('confirmReceipt.description', 'Điều chỉnh số lượng thực tế nhận và thêm đồ phát sinh nếu có')}
            </DialogDescription>
          </DialogHeader>
          <Content />
          <DialogFooter>
            <Footer />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddItemsDialog
        open={showAddItems}
        onOpenChange={setShowAddItems}
        onAdd={handleAddItems}
        excludeItemIds={existingItemIds}
      />
    </>
  )
}
