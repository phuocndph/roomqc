import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Package, CheckCircle2, AlertCircle, Loader2, BoxesIcon, Coffee, PackagePlus, Search, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useUpdateRoomItemQuantity } from '@/hooks/useRoomItems'
import { CustomerUsedDialog } from './CustomerUsedDialog'

interface RoomItem {
  item_id: string
  item_code: string
  item_name: string
  item_type: 'linen' | 'consumable' | 'equipment' | 'furniture'
  item_thumbnail?: string
  category_name?: string
  standard_quantity: number
  current_quantity: number
  missing_quantity: number
  condition: string
  is_verified: boolean
  verified_at?: string
  verified_by?: string
  room_item_id?: string | null
  has_standard: boolean
}

interface RoomItemsListProps {
  items: RoomItem[]
  roomId: string
  onRequestSupplement?: (item: RoomItem) => void
}

export function RoomItemsList({ items, roomId, onRequestSupplement }: RoomItemsListProps) {
  const { t } = useTranslation('rooms')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const updateQuantity = useUpdateRoomItemQuantity()

  // Dialog state for customer used
  const [customerUsedDialogOpen, setCustomerUsedDialogOpen] = useState(false)
  const [selectedItemForUsed, setSelectedItemForUsed] = useState<RoomItem | null>(null)

  // Separate standard items and other items (distributed but not in standards)
  const standardItems = items.filter(item => item.has_standard)
  const otherItems = items.filter(item => !item.has_standard)
  
  // Calculate missing items dynamically based on current quantities
  const missingItems = standardItems.filter(item => {
    const currentQty = quantities[item.item_id] ?? item.current_quantity
    const missing = item.standard_quantity - currentQty
    return missing > 0
  })
  
  const totalMissing = missingItems.reduce((sum, item) => {
    const currentQty = quantities[item.item_id] ?? item.current_quantity
    const missing = Math.max(0, item.standard_quantity - currentQty)
    return sum + missing
  }, 0)

  // Filter items by search query
  const filterBySearch = (itemList: RoomItem[]) => {
    if (!searchQuery.trim()) return itemList
    const query = searchQuery.toLowerCase()
    return itemList.filter(item => 
      item.item_name.toLowerCase().includes(query) ||
      item.item_code.toLowerCase().includes(query) ||
      item.category_name?.toLowerCase().includes(query)
    )
  }

  // Group items by category
  const groupByCategory = (itemList: RoomItem[]) => {
    const groups: Record<string, RoomItem[]> = {}
    itemList.forEach(item => {
      const category = item.category_name || t('itemsList.uncategorized')
      if (!groups[category]) groups[category] = []
      groups[category].push(item)
    })
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
  }

  // Auto-expand categories with missing items
  useEffect(() => {
    const categoriesWithMissing = new Set<string>()
    missingItems.forEach(item => {
      categoriesWithMissing.add(item.category_name || t('itemsList.uncategorized'))
    })
    if (categoriesWithMissing.size > 0 && expandedCategories.size === 0) {
      setExpandedCategories(categoriesWithMissing)
    }
  }, [missingItems, expandedCategories.size, t])

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const expandAllCategories = (itemList: RoomItem[]) => {
    const categories = new Set(itemList.map(item => item.category_name || t('itemsList.uncategorized')))
    setExpandedCategories(categories)
  }

  const handleQuantityChange = (itemId: string, value: string) => {
    const qty = value === '' ? 0 : parseInt(value) || 0
    setQuantities(prev => ({ ...prev, [itemId]: qty }))
  }

  const handleQuantityBlur = async (item: RoomItem) => {
    const newQty = quantities[item.item_id]
    if (newQty !== undefined && newQty !== item.current_quantity) {
      setSavingItemId(item.item_id)
      try {
        await updateQuantity.mutateAsync({
          roomId,
          itemId: item.item_id,
          quantity: newQty,
          roomItemId: item.room_item_id || null,
        })
        setQuantities(prev => {
          const newState = { ...prev }
          delete newState[item.item_id]
          return newState
        })
      } catch (error) {
        setQuantities(prev => {
          const newState = { ...prev }
          delete newState[item.item_id]
          return newState
        })
      } finally {
        setSavingItemId(null)
      }
    }
  }

  const handleCustomerUsed = (item: RoomItem) => {
    setSelectedItemForUsed(item)
    setCustomerUsedDialogOpen(true)
  }

  const handleRequestSupplement = (item: RoomItem) => {
    if (onRequestSupplement) {
      onRequestSupplement(item)
    }
  }

  // Status helpers
  const getStatusInfo = (item: RoomItem) => {
    const currentQty = quantities[item.item_id] ?? item.current_quantity
    const diff = item.has_standard ? currentQty - item.standard_quantity : null
    
    if (diff === null) return null
    if (diff === 0) return { text: 'Đủ', color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30' }
    if (diff > 0) return { text: `+${diff}`, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' }
    return { text: `${diff}`, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' }
  }

  // Show message if no items at all
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
        <Package className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Chưa có đồ dùng</p>
          <p className="text-xs text-muted-foreground">
            <Link to="/rooms/standards" className="underline hover:text-primary">
              Quản lý tiêu chuẩn
            </Link>{' '}
            để thiết lập đồ dùng cho phòng
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Customer Used Dialog */}
      <CustomerUsedDialog
        open={customerUsedDialogOpen}
        onOpenChange={setCustomerUsedDialogOpen}
        item={selectedItemForUsed}
        roomId={roomId}
      />

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Tìm đồ dùng..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      <Tabs defaultValue={missingItems.length > 0 ? "missing" : (standardItems.length > 0 ? "required" : "other")} className="w-full">
        <TabsList className="h-8 p-0.5 bg-muted/50 w-full">
          <TabsTrigger value="required" className="h-7 text-xs flex-1 gap-1">
            <Package className="h-3 w-3" />
            Tiêu chuẩn
            <span className="text-muted-foreground">({standardItems.length})</span>
          </TabsTrigger>
          <TabsTrigger value="missing" className="h-7 text-xs flex-1 gap-1">
            <AlertCircle className="h-3 w-3" />
            Thiếu
            {missingItems.length > 0 && (
              <span className="text-red-600 font-medium">({missingItems.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="other" className="h-7 text-xs flex-1 gap-1">
            <BoxesIcon className="h-3 w-3" />
            Khác
            <span className="text-muted-foreground">({otherItems.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Required items (standards) - Grouped by category */}
        <TabsContent value="required" className="mt-3 space-y-2">
          {standardItems.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Chưa thiết lập tiêu chuẩn</p>
            </div>
          ) : (
            <>
              {/* Expand/Collapse All Button */}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] h-6 px-2"
                  onClick={() => {
                    const filtered = filterBySearch(standardItems)
                    if (expandedCategories.size === groupByCategory(filtered).length) {
                      setExpandedCategories(new Set())
                    } else {
                      expandAllCategories(filtered)
                    }
                  }}
                >
                  <FolderOpen className="h-3 w-3 mr-1" />
                  {expandedCategories.size === groupByCategory(filterBySearch(standardItems)).length 
                    ? 'Thu gọn' 
                    : 'Mở rộng'}
                </Button>
              </div>
              
              {groupByCategory(filterBySearch(standardItems)).map(([category, categoryItems]) => {
                const categoryMissingCount = categoryItems.filter(item => {
                  const currentQty = quantities[item.item_id] ?? item.current_quantity
                  return item.standard_quantity - currentQty > 0
                }).length
                const isExpanded = expandedCategories.has(category)

                return (
                  <Collapsible
                    key={category}
                    open={isExpanded}
                    onOpenChange={() => toggleCategory(category)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-2 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          <span className="text-sm font-medium">{category}</span>
                          <span className="text-xs text-muted-foreground">({categoryItems.length})</span>
                        </div>
                        {categoryMissingCount > 0 && (
                          <span className="text-xs font-medium text-red-600">
                            Thiếu {categoryMissingCount}
                          </span>
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 space-y-1">
                      {categoryItems.map((item) => {
                        const currentQty = quantities[item.item_id] ?? item.current_quantity
                        const status = getStatusInfo(item)
                        
                        return (
                          <div key={item.item_id} className="flex items-center gap-2 p-2 border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                            {/* Thumbnail */}
                            {item.item_thumbnail ? (
                              <img
                                src={item.item_thumbnail}
                                alt={item.item_name}
                                className="h-8 w-8 rounded object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <Link
                                to={`/items/${item.item_id}`}
                                className="text-sm font-medium hover:underline truncate block"
                              >
                                {item.item_name}
                              </Link>
                              <p className="text-[10px] text-muted-foreground font-mono">{item.item_code}</p>
                            </div>
                            
                            {/* Quantity */}
                            <div className="flex items-center gap-1 text-xs">
                              <span className="font-bold">{currentQty}</span>
                              <span className="text-muted-foreground">/</span>
                              <span className="text-primary font-medium">{item.standard_quantity}</span>
                            </div>
                            
                            {/* Status */}
                            {status && (
                              <span className={`text-xs font-medium w-10 text-center ${status.color}`}>
                                {status.text}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
              
              {filterBySearch(standardItems).length === 0 && searchQuery && (
                <div className="text-center py-6 text-muted-foreground">
                  <Search className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Không tìm thấy</p>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Tab 2: Missing items */}
        <TabsContent value="missing" className="mt-3">
          {missingItems.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-600">Đủ hàng</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tất cả đồ dùng đều đạt tiêu chuẩn
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Summary */}
              <div className="flex items-center justify-between p-2 border rounded-lg bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900 mb-2">
                <span className="text-xs text-red-700 dark:text-red-300">
                  {missingItems.length} loại thiếu • Tổng {totalMissing} món
                </span>
              </div>
              
              {missingItems.map((item) => {
                const currentQty = quantities[item.item_id] ?? item.current_quantity
                const missing = Math.max(0, item.standard_quantity - currentQty)
                
                return (
                  <div key={item.item_id} className="flex items-center gap-2 p-2 border-b last:border-b-0">
                    {/* Thumbnail */}
                    {item.item_thumbnail ? (
                      <img
                        src={item.item_thumbnail}
                        alt={item.item_name}
                        className="h-10 w-10 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.item_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Có {currentQty} / Cần {item.standard_quantity}
                      </p>
                    </div>
                    
                    {/* Missing count */}
                    <div className="text-center">
                      <p className="text-lg font-bold text-red-600">-{missing}</p>
                      <p className="text-[10px] text-muted-foreground">thiếu</p>
                    </div>
                    
                    {/* Action */}
                    {onRequestSupplement && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => handleRequestSupplement(item)}
                      >
                        <PackagePlus className="h-3 w-3 mr-1" />
                        Bổ sung
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Other items (not in standards) */}
        <TabsContent value="other" className="mt-3">
          {otherItems.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <BoxesIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Không có đồ khác</p>
            </div>
          ) : (
            <div className="space-y-1">
              {otherItems.map((item) => {
                const currentQty = quantities[item.item_id] ?? item.current_quantity
                
                return (
                  <div key={item.item_id} className="flex items-center gap-2 p-2 border-b last:border-b-0">
                    {/* Thumbnail */}
                    {item.item_thumbnail ? (
                      <img
                        src={item.item_thumbnail}
                        alt={item.item_name}
                        className="h-8 w-8 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/items/${item.item_id}`}
                        className="text-sm font-medium hover:underline truncate block"
                      >
                        {item.item_name}
                      </Link>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono">{item.item_code}</span>
                        {item.category_name && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded">{item.category_name}</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Quantity */}
                    <span className="text-sm font-bold">{currentQty}</span>
                    
                    {/* Action */}
                    {item.item_type === 'consumable' && currentQty > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => handleCustomerUsed(item)}
                      >
                        <Coffee className="h-3 w-3 mr-1" />
                        Dùng
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
