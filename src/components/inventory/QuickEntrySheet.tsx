import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PackagePlus, PackageMinus, Minus, Plus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useItems } from '@/hooks/useItems'
import { useCreateInboundTransaction, useCreateOutboundTransaction } from '@/hooks/useInventoryTransactions'
import { useDefaultWarehouse } from '@/hooks/useWarehouses'
import { cn } from '@/lib/utils'

interface QuickEntrySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: 'in' | 'out'
}

const RECENT_LOCATIONS_KEY = 'inventory_recent_locations'

function getRecentLocations(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_LOCATIONS_KEY) || '[]')
  } catch {
    return []
  }
}

function saveRecentLocation(location: string) {
  const recent = getRecentLocations().filter(l => l !== location)
  recent.unshift(location)
  localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(recent.slice(0, 5)))
}

export function QuickEntrySheet({ open, onOpenChange, type }: QuickEntrySheetProps) {
  const { t } = useTranslation('inventory')
  const { data: itemsData } = useItems({}, 1, 100)
  const items = itemsData?.items || []
  const { data: defaultWarehouse } = useDefaultWarehouse()

  
  const createInbound = useCreateInboundTransaction()
  const createOutbound = useCreateOutboundTransaction()
  
  const [selectedItemId, setSelectedItemId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [fromLocation, setFromLocation] = useState('')
  const [toLocation, setToLocation] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const recentLocations = getRecentLocations()
  const selectedItem = items.find(i => i.id === selectedItemId)
  
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSubmit = async () => {
    if (!selectedItemId) {
      toast.error(t('validation.itemRequired'))
      return
    }
    if (quantity <= 0) {
      toast.error(t('validation.quantityMin'))
      return
    }
    if (!fromLocation) {
      toast.error(t('validation.fromRequired'))
      return
    }
    if (!toLocation) {
      toast.error(t('validation.toRequired'))
      return
    }

    // Check stock for outbound
    if (type === 'out' && selectedItem && quantity > (selectedItem.quantity_in_stock || 0)) {
      toast.error(t('outbound.stockError'))
      return
    }

    setIsSubmitting(true)
    
    try {
      if (type === 'in') {
        await createInbound.mutateAsync({
          transaction_category: 'other',
          from_location: fromLocation,
          to_location: toLocation,
          to_warehouse_id: defaultWarehouse?.id || '',
          items: [{
            item_id: selectedItemId,
            quantity,
            unit_price: selectedItem?.unit_price || 0
          }]
        })
        toast.success(t('inbound.success'))
      } else {
        await createOutbound.mutateAsync({
          transaction_category: 'other',
          from_location: fromLocation,
          to_location: toLocation,
          from_warehouse_id: defaultWarehouse?.id || '',
          items: [{
            item_id: selectedItemId,
            quantity
          }]
        })
        toast.success(t('outbound.success'))
      }
      
      // Save locations to recent
      saveRecentLocation(fromLocation)
      saveRecentLocation(toLocation)
      
      // Reset and close
      setSelectedItemId('')
      setQuantity(1)
      setFromLocation('')
      setToLocation('')
      onOpenChange(false)
    } catch (error) {
      toast.error(t('messages.checkInfo'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setSelectedItemId('')
    setQuantity(1)
    setFromLocation('')
    setToLocation('')
    setSearchQuery('')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            {type === 'in' ? (
              <>
                <PackagePlus className="h-5 w-5 text-blue-500" />
                {t('quickEntry.inbound')}
              </>
            ) : (
              <>
                <PackageMinus className="h-5 w-5 text-orange-500" />
                {t('quickEntry.outbound')}
              </>
            )}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100%-8rem)] py-4">
          <div className="space-y-5">
            {/* Item Selection */}
            <div className="space-y-2">
              <Label>{t('quickEntry.selectItem')}</Label>
              <Input
                placeholder={t('mobileForm.searchItems')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="mb-2"
              />
              <div className="border rounded-lg max-h-40 overflow-y-auto">
                {filteredItems.slice(0, 20).map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedItemId(item.id)
                      setSearchQuery('')
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-left flex items-center justify-between hover:bg-muted transition-colors",
                      selectedItemId === item.id && "bg-primary/10"
                    )}
                  >
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.code}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {t('mobileForm.stock')}: {item.quantity_in_stock || 0}
                    </Badge>
                  </button>
                ))}
                {filteredItems.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground text-center">
                    {t('mobileForm.noItemsFound')}
                  </p>
                )}
              </div>
              {selectedItem && (
                <div className="p-2 bg-muted rounded-lg flex items-center justify-between">
                  <span className="font-medium text-sm">{selectedItem.name}</span>
                  <Badge>{t('mobileForm.stock')}: {selectedItem.quantity_in_stock || 0}</Badge>
                </div>
              )}
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label>{t('mobileForm.quantity')}</Label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={quantity}
                  onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 text-center"
                  min={1}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {type === 'out' && selectedItem && quantity > (selectedItem.quantity_in_stock || 0) && (
                <p className="text-xs text-destructive">
                  {t('mobileForm.outbound.exceededStock')}
                </p>
              )}
            </div>

            {/* From Location */}
            <div className="space-y-2">
              <Label>{t('mobileForm.from')}</Label>
              <Select value={fromLocation} onValueChange={setFromLocation}>
                <SelectTrigger>
                  <SelectValue placeholder={type === 'in' ? t('mobileForm.inbound.fromPlaceholder') : t('mobileForm.outbound.fromPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {recentLocations.map(loc => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">{t('quickEntry.customLocation')}</SelectItem>
                </SelectContent>
              </Select>
              {fromLocation === '__custom__' && (
                <Input
                  placeholder={t('quickEntry.enterLocation')}
                  onChange={e => setFromLocation(e.target.value)}
                />
              )}
              {fromLocation && fromLocation !== '__custom__' && !recentLocations.includes(fromLocation) && null}
            </div>

            {/* To Location */}
            <div className="space-y-2">
              <Label>{t('mobileForm.to')}</Label>
              <Select value={toLocation} onValueChange={setToLocation}>
                <SelectTrigger>
                  <SelectValue placeholder={type === 'in' ? t('mobileForm.inbound.toPlaceholder') : t('mobileForm.outbound.toPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {recentLocations.map(loc => (
                    <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">{t('quickEntry.customLocation')}</SelectItem>
                </SelectContent>
              </Select>
              {toLocation === '__custom__' && (
                <Input
                  placeholder={t('quickEntry.enterLocation')}
                  onChange={e => setToLocation(e.target.value)}
                />
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background flex gap-3">
          <Button variant="outline" onClick={handleReset} className="flex-1">
            {t('quickEntry.reset')}
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !selectedItemId}
            className={cn(
              "flex-1",
              type === 'in' ? "bg-blue-500 hover:bg-blue-600" : "bg-orange-500 hover:bg-orange-600"
            )}
          >
            {isSubmitting ? t('mobileForm.processing') : t('quickEntry.confirm')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
