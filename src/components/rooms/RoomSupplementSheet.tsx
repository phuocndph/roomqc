import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Package,
  Minus,
  Plus,
  Check,
  AlertTriangle,
  Loader2,
  PackagePlus,
  Coffee,
  AlertCircle,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useRoomSupplements, useCreateRoomSupplement, type SupplementItem } from '@/hooks/useRoomSupplements'
import { formatCurrency, cn } from '@/lib/utils'
import { triggerHaptic } from '@/lib/haptics'
import { motion, AnimatePresence } from 'framer-motion'

interface RoomSupplementSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: string
  roomNumber: string
  initialMode?: 'missing' | 'extra'
}

export function RoomSupplementSheet({
  open,
  onOpenChange,
  roomId,
  roomNumber,
  initialMode = 'missing',
}: RoomSupplementSheetProps) {
  const { t } = useTranslation(['rooms', 'inventory', 'common'])
  const { data: supplementData, isLoading } = useRoomSupplements(open ? roomId : undefined)
  const createSupplement = useCreateRoomSupplement()

  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [activeTab, setActiveTab] = useState(initialMode === 'extra' ? 'consumable' : 'missing')

  // Reset state when opened
  useEffect(() => {
    if (open && supplementData) {
      const initial: Record<string, number> = {}
      // Pre-select based on mode
      if (initialMode === 'missing') {
        supplementData.missing_items.forEach(item => {
          initial[item.item_id] = item.missing_quantity
        })
        setActiveTab('missing')
      } else {
        setActiveTab('consumable')
      }
      setSelectedItems(initial)
      setNotes('')
    }
  }, [open, supplementData, initialMode])

  const handleQuantityChange = (itemId: string, delta: number, maxQty: number) => {
    triggerHaptic('light')
    setSelectedItems(prev => {
      const current = prev[itemId] || 0
      const newQty = Math.max(0, Math.min(maxQty, current + delta))
      if (newQty === 0) {
        const { [itemId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [itemId]: newQty }
    })
  }

  const handleSetQuantity = (itemId: string, qty: number, maxQty: number) => {
    const newQty = Math.max(0, Math.min(maxQty, qty))
    setSelectedItems(prev => {
      if (newQty === 0) {
        const { [itemId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [itemId]: newQty }
    })
  }

  const handleSubmit = () => {
    // Guard against double submit
    if (createSupplement.isPending) return

    const items = Object.entries(selectedItems)
      .filter(([_, qty]) => qty > 0)
      .map(([item_id, quantity]) => ({ item_id, quantity }))

    if (items.length === 0) {
      triggerHaptic('error')
      return
    }

    createSupplement.mutate(
      {
        room_id: roomId,
        room_number: roomNumber,
        items,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          triggerHaptic('success')
          onOpenChange(false)
        },
      }
    )
  }

  const totalSelectedItems = Object.keys(selectedItems).length
  const totalSelectedQuantity = Object.values(selectedItems).reduce((sum, qty) => sum + qty, 0)
  const totalValue = Object.entries(selectedItems).reduce((sum, [itemId, qty]) => {
    const item = [...(supplementData?.missing_items || []), ...(supplementData?.consumable_items || [])]
      .find(i => i.item_id === itemId)
    return sum + (item?.unit_price || 0) * qty
  }, 0)

  const hasStockIssue = Object.entries(selectedItems).some(([itemId, qty]) => {
    const item = [...(supplementData?.missing_items || []), ...(supplementData?.consumable_items || [])]
      .find(i => i.item_id === itemId)
    return item && qty > item.quantity_in_stock
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            {t('supplement.title', { roomNumber })}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : !supplementData ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-muted-foreground">{t('supplement.noData')}</p>
          </div>
        ) : (
          <>
            {/* Summary Bar */}
            <div className="px-4 py-3 bg-muted/50 border-b shrink-0">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-muted-foreground">{t('supplement.selected')}: </span>
                    <span className="font-semibold">{totalSelectedItems} {t('supplement.items')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('supplement.quantity')}: </span>
                    <span className="font-semibold">{totalSelectedQuantity}</span>
                  </div>
                </div>
                <div className="font-semibold text-primary">
                  {formatCurrency(totalValue)}
                </div>
              </div>
            </div>

            {/* Stock Warning */}
            {hasStockIssue && (
              <div className="px-4 pt-3 shrink-0">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{t('supplement.stockWarning')}</AlertDescription>
                </Alert>
              </div>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-4 mt-3 shrink-0">
                <TabsTrigger value="missing" className="flex-1 gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {t('supplement.missingTab')}
                  {supplementData.missing_items.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                      {supplementData.missing_items.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="consumable" className="flex-1 gap-1">
                  <Coffee className="h-4 w-4" />
                  {t('supplement.consumableTab')}
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 px-4 py-3">
                <TabsContent value="missing" className="m-0 space-y-2">
                  {supplementData.missing_items.length === 0 ? (
                    <div className="text-center py-8">
                      <Check className="h-12 w-12 text-green-500 mx-auto mb-2" />
                      <p className="text-muted-foreground">{t('supplement.noMissing')}</p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {supplementData.missing_items.map((item) => (
                        <SupplementItemCard
                          key={item.item_id}
                          item={item}
                          selectedQuantity={selectedItems[item.item_id] || 0}
                          onQuantityChange={(delta) => 
                            handleQuantityChange(item.item_id, delta, item.quantity_in_stock)
                          }
                          onSetQuantity={(qty) => 
                            handleSetQuantity(item.item_id, qty, item.quantity_in_stock)
                          }
                          t={t}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </TabsContent>

                <TabsContent value="consumable" className="m-0 space-y-2">
                  {supplementData.consumable_items.length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">{t('supplement.noConsumable')}</p>
                    </div>
                  ) : (
                    <AnimatePresence>
                      {supplementData.consumable_items.map((item) => (
                        <SupplementItemCard
                          key={item.item_id}
                          item={item}
                          selectedQuantity={selectedItems[item.item_id] || 0}
                          onQuantityChange={(delta) => 
                            handleQuantityChange(item.item_id, delta, item.quantity_in_stock)
                          }
                          onSetQuantity={(qty) => 
                            handleSetQuantity(item.item_id, qty, item.quantity_in_stock)
                          }
                          t={t}
                          isExtra
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>

            {/* Notes */}
            <div className="px-4 py-3 border-t shrink-0">
              <Label htmlFor="notes">{t('supplement.notes')}</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('supplement.notesPlaceholder')}
                className="mt-1 min-h-[60px]"
              />
            </div>

            {/* Submit Button */}
            <div className="p-4 border-t bg-background shrink-0">
              <Button
                className="w-full h-12"
                disabled={totalSelectedItems === 0 || hasStockIssue || createSupplement.isPending}
                onClick={handleSubmit}
              >
                {createSupplement.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('supplement.processing')}
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {t('supplement.confirm', { count: totalSelectedQuantity })}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

interface SupplementItemCardProps {
  item: SupplementItem
  selectedQuantity: number
  onQuantityChange: (delta: number) => void
  onSetQuantity: (qty: number) => void
  t: (key: string, options?: any) => string
  isExtra?: boolean
}

function SupplementItemCard({
  item,
  selectedQuantity,
  onQuantityChange,
  onSetQuantity,
  t,
  isExtra = false,
}: SupplementItemCardProps) {
  const hasStock = item.quantity_in_stock > 0
  const isOverStock = selectedQuantity > item.quantity_in_stock

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <Card className={cn(
        "p-3",
        selectedQuantity > 0 && "border-primary bg-primary/5",
        isOverStock && "border-destructive bg-destructive/5"
      )}>
        <div className="flex items-center gap-3">
          {/* Thumbnail */}
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
            {item.item_thumbnail ? (
              <img src={item.item_thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <Package className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{item.item_name}</p>
              {isExtra && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {t('supplement.extra')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{item.item_code}</span>
              {item.category_name && (
                <>
                  <span>•</span>
                  <span>{item.category_name}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              {!isExtra && (
                <span className="text-xs">
                  <span className="text-muted-foreground">{t('supplement.need')}: </span>
                  <span className="font-semibold text-red-600">{item.missing_quantity}</span>
                </span>
              )}
              <span className={cn(
                "text-xs",
                !hasStock && "text-red-600"
              )}>
                <span className="text-muted-foreground">{t('supplement.inStock')}: </span>
                <span className={cn("font-semibold", hasStock ? "text-green-600" : "text-red-600")}>
                  {item.quantity_in_stock}
                </span>
              </span>
            </div>
          </div>

          {/* Quantity Control */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={selectedQuantity <= 0}
              onClick={() => onQuantityChange(-1)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className={cn(
              "w-10 h-8 flex items-center justify-center rounded border text-sm font-semibold",
              selectedQuantity > 0 ? "bg-primary text-primary-foreground border-primary" : "bg-muted"
            )}>
              {selectedQuantity}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={!hasStock || selectedQuantity >= item.quantity_in_stock}
              onClick={() => onQuantityChange(1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Quick fill button for missing items */}
        {!isExtra && item.missing_quantity > 0 && selectedQuantity !== item.missing_quantity && hasStock && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-xs h-7"
            onClick={() => onSetQuantity(Math.min(item.missing_quantity, item.quantity_in_stock))}
          >
            {t('supplement.fillMissing', { count: Math.min(item.missing_quantity, item.quantity_in_stock) })}
          </Button>
        )}
      </Card>
    </motion.div>
  )
}
