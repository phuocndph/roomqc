import { useState, useMemo, useEffect } from 'react'
import { Droplets, Check, Package, AlertCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { RoomItemWithDetails, ConsumedItem } from '@/types/rooms.types'
import { CategoryGroup, groupItemsByCategory } from './CategoryGroup'
import { getCheckTypeConfig, type CheckType } from '@/lib/roomCheckConfig'
import { supabase } from '@/integrations/supabase/client'

interface ExtendedRoomItem extends RoomItemWithDetails {
  category_name?: string | null
}

interface ConsumableTabProps {
  items: ExtendedRoomItem[]
  checkType: CheckType
  consumedItems: ConsumedItem[]
  onMarkConsumed: (item: RoomItemWithDetails, quantity: number, needRefill: boolean) => void
  onRemoveConsumed: (itemId: string) => void
}

export function ConsumableTab({
  items,
  checkType,
  consumedItems,
  onMarkConsumed,
  onRemoveConsumed,
}: ConsumableTabProps) {
  const config = getCheckTypeConfig(checkType)
  const allowedActions = config.consumableActions
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [needRefill, setNeedRefill] = useState<Record<string, boolean>>({})
  const [okItems, setOkItems] = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [stockMap, setStockMap] = useState<Record<string, number>>({})

  // Fetch stock info for items
  useEffect(() => {
    const fetchStock = async () => {
      const itemIds = items.map(i => i.item_id)
      if (itemIds.length === 0) return

      const { data } = await supabase
        .from('items')
        .select('id, quantity_in_stock')
        .in('id', itemIds)

      if (data) {
        const map: Record<string, number> = {}
        data.forEach(item => {
          map[item.id] = item.quantity_in_stock || 0
        })
        setStockMap(map)
      }
    }

    fetchStock()
  }, [items])

  const getConsumedInfo = (itemId: string) => {
    return consumedItems.find(i => i.item_id === itemId)
  }

  // Group items by category
  const groupedItems = useMemo(() => groupItemsByCategory(items), [items])

  // Get checked count for a category
  const getCategoryCheckedCount = (categoryItems: ExtendedRoomItem[]) => {
    return categoryItems.filter(item => 
      okItems.has(item.item_id) || getConsumedInfo(item.item_id)
    ).length
  }

  const handleMarkOk = (itemId: string) => {
    setOkItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
        onRemoveConsumed(itemId)
      }
      return newSet
    })
    setExpandedItems(prev => {
      const newSet = new Set(prev)
      newSet.delete(itemId)
      return newSet
    })
  }

  const handleMarkAllOk = (categoryItems: ExtendedRoomItem[]) => {
    setOkItems(prev => {
      const newSet = new Set(prev)
      categoryItems.forEach(item => {
        newSet.add(item.item_id)
        onRemoveConsumed(item.item_id)
      })
      return newSet
    })
    setExpandedItems(new Set())
  }

  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
        setOkItems(p => {
          const ns = new Set(p)
          ns.delete(itemId)
          return ns
        })
      }
      return newSet
    })
  }

  const handleConfirmConsumed = (item: ExtendedRoomItem) => {
    const qty = quantities[item.item_id] ?? 1
    const refill = needRefill[item.item_id] ?? true
    onMarkConsumed(item, qty, refill)
    setExpandedItems(prev => {
      const newSet = new Set(prev)
      newSet.delete(item.item_id)
      return newSet
    })
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Droplets className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Không có đồ tiêu hao nào trong phòng này</p>
        </CardContent>
      </Card>
    )
  }

  const renderItemCard = (item: ExtendedRoomItem) => {
    const consumed = getConsumedInfo(item.item_id)
    const isOk = okItems.has(item.item_id)
    const isExpanded = expandedItems.has(item.item_id)
    const qty = quantities[item.item_id] ?? 1
    const refill = needRefill[item.item_id] ?? true
    const currentStock = stockMap[item.item_id] ?? 0
    const isOutOfStock = currentStock === 0
    const isLowStock = currentStock > 0 && currentStock <= 5

    // Status badge
    const getStatusBadge = () => {
      if (consumed) {
        return (
          <Badge variant="secondary" className="flex-shrink-0 text-xs">
            <Package className="mr-1 h-3 w-3" />
            Đã dùng {consumed.quantity}
          </Badge>
        )
      }
      if (isOk) {
        return (
          <Badge className="flex-shrink-0 bg-green-500/10 text-green-600 text-xs">
            <Check className="mr-1 h-3 w-3" />
            Đủ
          </Badge>
        )
      }
      return null
    }

    return (
      <Card key={item.item_id} className={`${consumed ? 'border-primary bg-primary/5' : isOk ? 'border-green-500/50 bg-green-500/5' : ''}`}>
        <CardContent className="p-3">
          {/* Row 1: Info + Status Badge */}
          <div className="flex items-center gap-3">
            {item.item_thumbnail ? (
              <img
                src={item.item_thumbnail}
                alt={item.item_name}
                className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                <Droplets className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{item.item_name}</h4>
              <span className="text-xs text-muted-foreground">SL: {item.standard_quantity}</span>
            </div>
            {getStatusBadge()}
          </div>

          {/* Row 2: Action Buttons - only show if not consumed */}
          {consumed ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  {consumed.need_refill ? (
                    <span className="text-primary">Cần bổ sung {consumed.quantity}</span>
                  ) : (
                    <span className="text-muted-foreground">Không bổ sung</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => onRemoveConsumed(item.item_id)}
                >
                  Hủy
                </Button>
              </div>
              {/* Stock warning when need_refill and out of stock */}
              {consumed.need_refill && isOutOfStock && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Hết hàng trong kho! Không thể bổ sung ngay.
                  </AlertDescription>
                </Alert>
              )}
              {consumed.need_refill && isLowStock && (
                <Alert className="py-2 border-amber-500/50 bg-amber-500/10">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-xs text-amber-700">
                    Tồn kho thấp: còn {currentStock}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant={isOk ? "default" : "outline"}
                  className={`flex-1 h-10 ${isOk ? 'bg-green-500 hover:bg-green-600' : ''}`}
                  onClick={() => handleMarkOk(item.item_id)}
                >
                  <Check className="h-4 w-4 mr-1" />
                  {allowedActions.includes('missing') ? 'Đủ' : 'OK'}
                </Button>
                {allowedActions.includes('consumed') && (
                  <Button
                    type="button"
                    variant={isExpanded ? "default" : "outline"}
                    className="flex-1 h-10"
                    onClick={() => toggleExpand(item.item_id)}
                  >
                    <Package className="h-4 w-4 mr-1" />
                    Đã dùng
                  </Button>
                )}
                {allowedActions.includes('empty') && !allowedActions.includes('consumed') && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-10 text-yellow-600 border-yellow-300 hover:bg-yellow-50"
                    onClick={() => {
                      onMarkConsumed(item, item.standard_quantity, true)
                    }}
                  >
                    <AlertCircle className="h-4 w-4 mr-1" />
                    Hết
                  </Button>
                )}
                {allowedActions.includes('missing') && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-10 text-yellow-600 border-yellow-300 hover:bg-yellow-50"
                    onClick={() => toggleExpand(item.item_id)}
                  >
                    <AlertCircle className="h-4 w-4 mr-1" />
                    Thiếu
                  </Button>
                )}
              </div>

              {/* Row 3: Expandable Details */}
              {isExpanded && (
                <div className="mt-3 p-3 bg-muted/50 rounded-lg animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">SL:</Label>
                      <Input
                        type="number"
                        min={1}
                        max={item.standard_quantity}
                        value={qty}
                        onChange={(e) => setQuantities(prev => ({
                          ...prev,
                          [item.item_id]: parseInt(e.target.value) || 1
                        }))}
                        className="w-16 h-9"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={refill}
                        onCheckedChange={(checked) => setNeedRefill(prev => ({
                          ...prev,
                          [item.item_id]: checked
                        }))}
                      />
                      <Label className="text-xs">Bổ sung</Label>
                    </div>
                  </div>
                  <Button
                    type="button"
                    className="w-full mt-2 h-10"
                    onClick={() => handleConfirmConsumed(item)}
                  >
                    Xác nhận
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
        <Droplets className="inline-block h-4 w-4 mr-2" />
        Ghi nhận đồ tiêu hao khách đã sử dụng
      </div>

      {/* Grouped Items by Category */}
      {Array.from(groupedItems.entries()).map(([categoryName, categoryItems]) => (
        <CategoryGroup
          key={categoryName}
          categoryName={categoryName}
          itemCount={categoryItems.length}
          checkedCount={getCategoryCheckedCount(categoryItems)}
          defaultOpen={true}
          actions={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-green-500 text-green-600 hover:bg-green-500/10"
              onClick={() => handleMarkAllOk(categoryItems)}
            >
              <Check className="h-3 w-3 mr-1" />
              Tất cả Đủ
            </Button>
          }
        >
          {categoryItems.map(renderItemCard)}
        </CategoryGroup>
      ))}
    </div>
  )
}
