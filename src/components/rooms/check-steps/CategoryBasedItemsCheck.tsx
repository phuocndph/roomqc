import { useState, useEffect, useMemo } from 'react'
import { Search, CheckCircle2, Package, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/integrations/supabase/client'
import { CategoryGroup } from './item-type-tabs/CategoryGroup'
import { CategoryItemRow, type ItemAction } from './item-type-tabs/CategoryItemRow'
import type { 
  RoomItemWithDetails, 
  LaundryItem, 
  ConsumedItem, 
  LostItem, 
  ReplacedItem,
  DamagedItem
} from '@/types/rooms.types'
import type { ItemType } from '@/types/items.types'
import { getCheckTypeConfig, type CheckType } from '@/lib/roomCheckConfig'
import { useToast } from '@/hooks/use-toast'

interface ExtendedRoomItem extends RoomItemWithDetails {
  item_type: ItemType
  category_name: string | null
  category_id: string | null
  item_thumbnail?: string | null
}

interface CategoryInfo {
  id: string
  name: string
  color: string | null
  icon: string | null
  items: ExtendedRoomItem[]
}

interface CategoryBasedItemsCheckProps {
  items: RoomItemWithDetails[]
  roomId: string
  hotelId: string
  tenantId: string
  bookingId?: string | null
  checkType: CheckType
  phase?: 1 | 2
  // State handlers from parent
  laundryItems: LaundryItem[]
  consumedItems: ConsumedItem[]
  lostItems: LostItem[]
  replacedItems: ReplacedItem[]
  damagedItems: DamagedItem[]
  missingItems?: { item_id: string; quantity?: number; missing_quantity?: number }[]
  onLinenStatusChange: (item: RoomItemWithDetails, status: 'ok' | 'laundry' | 'add' | 'change' | 'lost' | 'missing', quantity: number) => void
  onMarkConsumed: (item: RoomItemWithDetails, quantity: number, needRefill: boolean) => void
  onEquipmentLost: (item: RoomItemWithDetails, quantity: number, estimatedValue?: number) => void
  onMarkDamaged: (item: RoomItemWithDetails, damageInfo: { damage_type: 'repairable' | 'replacement_needed'; damage_cost: number; notes?: string; quantity?: number; item_type?: ItemType }) => void
  onResetLinen: (itemId: string) => void
  onRemoveFromLaundry: (itemId: string) => void
  onRemoveFromLost: (itemId: string) => void
  onRemoveFromReplaced: (itemId: string) => void
  onRemoveFromConsumed: (itemId: string) => void
  onRemoveFromDamaged: (itemId: string) => void
}

export function CategoryBasedItemsCheck({
  items,
  roomId,
  hotelId,
  tenantId,
  bookingId,
  checkType,
  phase,
  laundryItems,
  consumedItems,
  lostItems,
  replacedItems,
  damagedItems,
  missingItems = [],
  onLinenStatusChange,
  onMarkConsumed,
  onEquipmentLost,
  onMarkDamaged,
  onResetLinen,
  onRemoveFromLaundry,
  onRemoveFromLost,
  onRemoveFromReplaced,
  onRemoveFromConsumed,
  onRemoveFromDamaged,
}: CategoryBasedItemsCheckProps) {
  const { toast } = useToast()
  const config = getCheckTypeConfig(checkType)
  
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<string>('all')
  const [itemsWithDetails, setItemsWithDetails] = useState<ExtendedRoomItem[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [priceMap, setPriceMap] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())

  // Fetch item details (item_type, category, stock, price)
  useEffect(() => {
    const fetchItemDetails = async () => {
      if (items.length === 0) {
        setIsLoading(false)
        return
      }
      
      setIsLoading(true)
      const itemIds = items.map(i => i.item_id)
      
      const { data } = await supabase
        .from('items')
        .select('id, item_type, quantity_in_stock, unit_price, category_id, item_categories(id, name, color, icon, default_item_type)')
        .in('id', itemIds)
      
      if (data) {
        const newStockMap: Record<string, number> = {}
        const newPriceMap: Record<string, number> = {}
        
        const enrichedItems = items.map(item => {
          const itemData = data.find(d => d.id === item.item_id)
          const category = itemData?.item_categories as { id: string; name: string; color: string | null; icon: string | null; default_item_type: ItemType | null } | null
          
          newStockMap[item.item_id] = itemData?.quantity_in_stock || 0
          newPriceMap[item.item_id] = itemData?.unit_price || 0
          
          return {
            ...item,
            item_type: (itemData?.item_type as ItemType)
              ?? (category?.default_item_type as ItemType)
              ?? 'equipment',
            category_name: category?.name || 'Khác',
            category_id: category?.id || null,
            item_thumbnail: (item as any).item_thumbnail || null,
          }
        })
        
        setStockMap(newStockMap)
        setPriceMap(newPriceMap)
        setItemsWithDetails(enrichedItems)
      } else {
        setItemsWithDetails(items.map(item => ({
          ...item,
          item_type: 'equipment' as ItemType,
          category_name: 'Khác',
          category_id: null,
          item_thumbnail: (item as any).item_thumbnail || null,
        })))
      }
      setIsLoading(false)
    }

    fetchItemDetails()
  }, [items])

  // Group items by category
  const categories = useMemo(() => {
    const categoryMap = new Map<string, CategoryInfo>()
    
    itemsWithDetails.forEach(item => {
      const categoryName = item.category_name || 'Khác'
      const existing = categoryMap.get(categoryName)
      
      if (existing) {
        existing.items.push(item)
      } else {
        categoryMap.set(categoryName, {
          id: item.category_id || categoryName,
          name: categoryName,
          color: null,
          icon: null,
          items: [item],
        })
      }
    })
    
    // Sort categories by name
    return Array.from(categoryMap.values()).sort((a, b) => 
      a.name.localeCompare(b.name, 'vi')
    )
  }, [itemsWithDetails])

  // Get allowed actions based on phase and checkType
  const getAllowedActions = (itemType: ItemType): string[] => {
    if (checkType === 'checkout' && phase && config.phase1Actions && config.phase2Actions) {
      const phaseActions = phase === 1 ? config.phase1Actions : config.phase2Actions
      switch (itemType) {
        case 'linen': return phaseActions.linen || []
        case 'consumable': return phaseActions.consumable || []
        case 'equipment': return phaseActions.equipment || []
        case 'furniture': return phaseActions.furniture || []
      }
    }
    
    switch (itemType) {
      case 'linen': return config.linenActions || []
      case 'consumable': return config.consumableActions || []
      case 'equipment': return config.equipmentActions || []
      case 'furniture': return config.furnitureActions || []
    }
  }

  // Get item status
  const getItemStatus = (itemId: string, itemType: ItemType) => {
    const inLaundry = laundryItems.some(i => i.item_id === itemId)
    const inReplaced = replacedItems.some(i => i.item_id === itemId)
    const inLost = lostItems.some(i => i.item_id === itemId)
    const inDamaged = damagedItems.some(i => i.item_id === itemId)
    const inConsumed = consumedItems.some(i => i.item_id === itemId)
    const inMissing = missingItems.some(i => i.item_id === itemId)
    
    if (inLaundry && inReplaced) return 'change' as const
    if (inLaundry && !inReplaced) return 'laundry' as const
    if (!inLaundry && inReplaced) return 'add' as const
    if (inLost) return 'lost' as const
    if (inDamaged) return 'damaged' as const
    if (inConsumed) return 'consumed' as const
    if (inMissing) return 'missing' as const
    if (checkedItems.has(itemId)) return 'ok' as const
    return 'pending' as const
  }

  // Handle item action
  const handleItemAction = (item: ExtendedRoomItem, action: ItemAction) => {
    switch (action.type) {
      case 'ok':
        setCheckedItems(prev => new Set(prev).add(item.item_id))
        break
      case 'laundry':
        onLinenStatusChange(item, 'laundry', action.quantity)
        break
      case 'add':
        onLinenStatusChange(item, 'add', action.quantity)
        break
      case 'change':
        onLinenStatusChange(item, 'change', action.quantity)
        break
      case 'lost':
        onEquipmentLost(item, action.quantity, action.estimatedValue)
        toast({ title: '⚠️ Đánh dấu mất', description: item.item_name, variant: 'destructive' })
        break
      case 'damaged':
        onMarkDamaged(item, {
          damage_type: action.damageType,
          damage_cost: action.damageCost,
          notes: action.notes,
          item_type: item.item_type,
        })
        toast({ title: '⚠️ Đánh dấu hỏng', description: item.item_name, variant: 'destructive' })
        break
      case 'missing':
        onLinenStatusChange(item, 'missing', action.quantity)
        break
      case 'consumed':
        onMarkConsumed(item, action.quantity, action.needRefill)
        break
    }
  }

  // Cập nhật quantity cho item đã đánh dấu (qua stepper inline)
  // Cách: remove rồi add lại với quantity mới, qua chính các handler đã có.
  const handleUpdateQuantity = (item: ExtendedRoomItem, newQuantity: number) => {
    const status = getItemStatus(item.item_id, item.item_type)
    const qty = Math.max(1, newQuantity)

    switch (status) {
      case 'laundry': {
        onResetLinen(item.item_id)
        onLinenStatusChange(item, 'laundry', qty)
        break
      }
      case 'add': {
        onResetLinen(item.item_id)
        onLinenStatusChange(item, 'add', qty)
        break
      }
      case 'change': {
        onResetLinen(item.item_id)
        onLinenStatusChange(item, 'change', qty)
        break
      }
      case 'missing': {
        onResetLinen(item.item_id)
        onLinenStatusChange(item, 'missing', qty)
        break
      }
      case 'lost': {
        onRemoveFromLost(item.item_id)
        onEquipmentLost(item, qty)
        break
      }
      case 'damaged': {
        const existing = damagedItems.find(d => d.item_id === item.item_id)
        onRemoveFromDamaged(item.item_id)
        onMarkDamaged(item, {
          damage_type: existing?.damage_type || 'replacement_needed',
          damage_cost: existing?.damage_cost || 0,
          notes: existing?.notes,
          quantity: qty,
          item_type: item.item_type,
        })
        break
      }
      case 'consumed': {
        const existing = consumedItems.find(c => c.item_id === item.item_id)
        onRemoveFromConsumed(item.item_id)
        onMarkConsumed(item, qty, existing?.need_refill ?? true)
        break
      }
    }
  }

  // Handle reset item
  const handleResetItem = (item: ExtendedRoomItem) => {
    const status = getItemStatus(item.item_id, item.item_type)
    
    if (item.item_type === 'linen') {
      onResetLinen(item.item_id)
    } else {
      if (status === 'lost') onRemoveFromLost(item.item_id)
      if (status === 'damaged') onRemoveFromDamaged(item.item_id)
      if (status === 'consumed') onRemoveFromConsumed(item.item_id)
    }
    
    setCheckedItems(prev => {
      const newSet = new Set(prev)
      newSet.delete(item.item_id)
      return newSet
    })
  }

  // Filter items by search
  const filterBySearch = (categoryItems: ExtendedRoomItem[]) => {
    if (!search) return categoryItems
    return categoryItems.filter(item => 
      item.item_name.toLowerCase().includes(search.toLowerCase()) ||
      item.item_code.toLowerCase().includes(search.toLowerCase())
    )
  }

  // Calculate progress
  const getCheckedCount = () => {
    const allTrackedIds = new Set([
      ...laundryItems.map(i => i.item_id),
      ...consumedItems.map(i => i.item_id),
      ...lostItems.map(i => i.item_id),
      ...replacedItems.map(i => i.item_id),
      ...damagedItems.map(i => i.item_id),
      ...checkedItems,
    ])
    return allTrackedIds.size
  }

  const totalItems = itemsWithDetails.length
  const checkedCount = getCheckedCount()
  const progressPercent = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0

  // Handle mark all OK in a category
  const handleCategoryMarkAllOk = (categoryItems: ExtendedRoomItem[]) => {
    categoryItems.forEach(item => {
      const status = getItemStatus(item.item_id, item.item_type)
      if (status === 'pending') {
        setCheckedItems(prev => new Set(prev).add(item.item_id))
      }
    })
  }

  // Get filtered items for active tab
  const getFilteredItems = () => {
    if (activeTab === 'all') {
      return filterBySearch(itemsWithDetails)
    }
    const category = categories.find(c => c.id === activeTab || c.name === activeTab)
    return category ? filterBySearch(category.items) : []
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  // Get category checked count
  const getCategoryCheckedCount = (categoryItems: ExtendedRoomItem[]) => {
    return categoryItems.filter(item => 
      getItemStatus(item.item_id, item.item_type) !== 'pending'
    ).length
  }

  return (
    <div className="space-y-2">
      {/* Single sticky header: progress + summary */}
      <div className="sticky top-0 z-10 bg-background -mx-2 px-2 py-1.5 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className={cn(
              "h-4 w-4",
              progressPercent === 100 ? 'text-green-600' : 'text-muted-foreground'
            )} />
            <span className={cn(
              "text-sm font-semibold tabular-nums",
              progressPercent === 100 && "text-green-600"
            )}>
              {checkedCount}/{totalItems}
            </span>
            <Progress 
              value={progressPercent} 
              className={cn(
                "h-1.5 w-20",
                progressPercent === 100 && "[&>div]:bg-green-500"
              )} 
            />
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            {laundryItems.length > 0 && (
              <span className="text-blue-600 font-medium">{laundryItems.length} giặt</span>
            )}
            {missingItems.length > 0 && (
              <span className="text-yellow-600 font-medium">{missingItems.length} thiếu</span>
            )}
            {lostItems.length > 0 && (
              <span className="text-destructive font-medium">{lostItems.length} mất</span>
            )}
            {damagedItems.length > 0 && (
              <span className="text-amber-600 font-medium">{damagedItems.length} hỏng</span>
            )}
            {consumedItems.length > 0 && (
              <span className="text-cyan-600 font-medium">{consumedItems.length} hết</span>
            )}
            
            {checkedCount < totalItems && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs border-green-500 text-green-600 hover:bg-green-50"
                onClick={() => {
                  itemsWithDetails.forEach(item => {
                    const status = getItemStatus(item.item_id, item.item_type)
                    if (status === 'pending') {
                      setCheckedItems(prev => new Set(prev).add(item.item_id))
                    }
                  })
                }}
              >
                Tất cả OK
              </Button>
            )}
            
            {progressPercent === 100 && (
              <span className="text-green-600 font-medium">✓ Xong</span>
            )}
          </div>
        </div>
      </div>

      {/* Compact Search - only show when many items */}
      {totalItems > 10 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm đồ dùng..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      )}

      {/* Tabs by Category - Horizontal scroll with fade indicator */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="relative -mx-4 px-4">
          <div className="overflow-x-auto scrollbar-hide pb-1">
            <TabsList className="inline-flex gap-1 bg-transparent p-0 min-w-max">
              <TabsTrigger 
                value="all" 
                className={cn(
                  "h-8 gap-1.5 px-3 text-xs rounded-full border",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary",
                  "data-[state=inactive]:bg-background data-[state=inactive]:border-border"
                )}
              >
                <Package className="h-3.5 w-3.5" />
                Tất cả
                <span className="bg-background/20 px-1.5 py-0.5 rounded text-[10px] font-medium">
                  {totalItems}
                </span>
              </TabsTrigger>
              
              {categories.map((category) => {
                const catChecked = getCategoryCheckedCount(category.items)
                const isComplete = catChecked === category.items.length
                
                return (
                  <TabsTrigger 
                    key={category.id} 
                    value={category.id}
                    className={cn(
                      "h-8 gap-1.5 px-3 text-xs rounded-full border",
                      "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary",
                      "data-[state=inactive]:bg-background data-[state=inactive]:border-border",
                      isComplete && "data-[state=inactive]:border-green-300 data-[state=inactive]:bg-green-50"
                    )}
                  >
                    {category.name}
                    {isComplete ? (
                      <Check className="h-3.5 w-3.5 text-green-600 data-[state=active]:text-primary-foreground" />
                    ) : (
                      <span className="bg-background/20 px-1.5 py-0.5 rounded text-[10px] font-medium">
                        {category.items.length}
                      </span>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>
          {/* Scroll fade indicator */}
          {categories.length > 3 && (
            <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
          )}
        </div>

        {/* All items tab */}
        <TabsContent value="all" className="mt-3">
          <div className="space-y-2">

            {categories.map((category) => {
              const filteredItems = filterBySearch(category.items)
              if (filteredItems.length === 0) return null
              
              const categoryCheckedCount = category.items.filter(item => 
                getItemStatus(item.item_id, item.item_type) !== 'pending'
              ).length
              
              return (
                <CategoryGroup
                  key={category.id}
                  categoryName={category.name}
                  itemCount={category.items.length}
                  checkedCount={categoryCheckedCount}
                  actions={
                    categoryCheckedCount < category.items.length ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-green-600"
                        onClick={() => handleCategoryMarkAllOk(category.items)}
                      >
                        OK tất cả
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="divide-y divide-border/50">
                    {filteredItems.map(item => {
                      const status = getItemStatus(item.item_id, item.item_type)
                      const allowedActions = getAllowedActions(item.item_type)
                      const consumedInfo = consumedItems.find(c => c.item_id === item.item_id) || null
                      const damagedInfo = damagedItems.find(d => d.item_id === item.item_id) || null
                      const lostInfo = lostItems.find(l => l.item_id === item.item_id) || null
                      const laundryInfo = laundryItems.find(l => l.item_id === item.item_id) || null
                      
                      return (
                        <CategoryItemRow
                          key={item.item_id}
                          item={item}
                          itemType={item.item_type}
                          status={status}
                          availableStock={stockMap[item.item_id]}
                          unitPrice={priceMap[item.item_id]}
                          allowedActions={allowedActions}
                          onAction={(action) => handleItemAction(item, action)}
                          onReset={() => handleResetItem(item)}
                          onUpdateQuantity={(qty) => handleUpdateQuantity(item, qty)}
                          consumedInfo={consumedInfo}
                          damagedInfo={damagedInfo}
                          lostInfo={lostInfo}
                          laundryInfo={laundryInfo}
                        />
                      )
                    })}
                  </div>
                </CategoryGroup>
              )
            })}
          </div>
        </TabsContent>

        {/* Individual category tabs */}
        {categories.map((category) => (
          <TabsContent key={category.id} value={category.id} className="mt-3">
            <div className="space-y-2">

              <div className="border rounded-lg divide-y-0">
                {filterBySearch(category.items).map(item => {
                  const status = getItemStatus(item.item_id, item.item_type)
                  const allowedActions = getAllowedActions(item.item_type)
                  const consumedInfo = consumedItems.find(c => c.item_id === item.item_id) || null
                  const damagedInfo = damagedItems.find(d => d.item_id === item.item_id) || null
                  const lostInfo = lostItems.find(l => l.item_id === item.item_id) || null
                  const laundryInfo = laundryItems.find(l => l.item_id === item.item_id) || null
                  
                  return (
                    <CategoryItemRow
                      key={item.item_id}
                      item={item}
                      itemType={item.item_type}
                      status={status}
                      availableStock={stockMap[item.item_id]}
                      unitPrice={priceMap[item.item_id]}
                      allowedActions={allowedActions}
                      onAction={(action) => handleItemAction(item, action)}
                      onReset={() => handleResetItem(item)}
                      onUpdateQuantity={(qty) => handleUpdateQuantity(item, qty)}
                      consumedInfo={consumedInfo}
                      damagedInfo={damagedInfo}
                      lostInfo={lostInfo}
                      laundryInfo={laundryInfo}
                    />
                  )
                })}
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
