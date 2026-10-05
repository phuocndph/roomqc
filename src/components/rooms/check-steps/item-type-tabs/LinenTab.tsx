import { useState, useEffect, useMemo } from 'react'
import { Shirt, Minus, Plus, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { RoomItemWithDetails, LaundryItem, LostItem, ReplacedItem } from '@/types/rooms.types'
import { CategoryGroup, groupItemsByCategory } from './CategoryGroup'
import { CompactItemRow } from './CompactItemRow'
import { BulkActionsHeader } from './BulkActionsHeader'
import { getCheckTypeConfig, type LinenAction, type CheckType } from '@/lib/roomCheckConfig'

type LinenStatus = 'ok' | 'laundry' | 'add' | 'change' | 'lost' | 'damaged' | 'missing'

interface ExtendedRoomItem extends RoomItemWithDetails {
  category_name?: string | null
}

interface LinenTabProps {
  items: ExtendedRoomItem[]
  checkType: CheckType
  phase?: 1 | 2 // NEW: Phase for checkout 2-phase flow
  laundryItems: LaundryItem[]
  lostItems: LostItem[]
  replacedItems: ReplacedItem[]
  stockMap?: Record<string, number>
  onLinenStatusChange: (item: RoomItemWithDetails, status: LinenStatus, quantity: number) => void
  onResetStatus: (itemId: string) => void
}

const STATUS_CONFIG: Record<LinenStatus, { label: string; color: string }> = {
  ok: { label: 'OK', color: 'text-green-600' },
  laundry: { label: 'Giặt', color: 'text-blue-600' },
  add: { label: 'Thêm', color: 'text-green-600' },
  change: { label: 'Đổi', color: 'text-primary' },
  lost: { label: 'Mất', color: 'text-destructive' },
  damaged: { label: 'Hỏng', color: 'text-amber-600' },
  missing: { label: 'Thiếu', color: 'text-yellow-600' },
}

export function LinenTab({
  items,
  checkType,
  phase,
  laundryItems,
  lostItems,
  replacedItems,
  stockMap = {},
  onLinenStatusChange,
  onResetStatus,
}: LinenTabProps) {
  const config = getCheckTypeConfig(checkType)
  
  // Get allowed actions based on phase (for checkout) or default config
  const allowedActions = (() => {
    if (checkType === 'checkout' && phase && config.phase1Actions && config.phase2Actions) {
      return phase === 1 ? config.phase1Actions.linen : config.phase2Actions.linen
    }
    return config.linenActions
  })()
  
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [statuses, setStatuses] = useState<Record<string, LinenStatus>>({})
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  // Initialize quantities
  useEffect(() => {
    const initial: Record<string, number> = {}
    items.forEach(item => {
      if (quantities[item.item_id] === undefined) {
        initial[item.item_id] = item.standard_quantity || item.current_quantity || 1
      }
    })
    if (Object.keys(initial).length > 0) {
      setQuantities(prev => ({ ...prev, ...initial }))
    }
  }, [items, quantities])

  const groupedItems = useMemo(() => groupItemsByCategory(items), [items])

  const getQuantity = (itemId: string, defaultQty: number) => quantities[itemId] ?? defaultQty

  const getCurrentStatus = (itemId: string): LinenStatus => {
    if (statuses[itemId]) return statuses[itemId]
    
    const inLaundry = laundryItems.some(i => i.item_id === itemId)
    const inReplaced = replacedItems.some(i => i.item_id === itemId)
    const inLost = lostItems.some(i => i.item_id === itemId)
    
    if (inLaundry && inReplaced) return 'change'
    if (inLaundry && !inReplaced) return 'laundry'
    if (!inLaundry && inReplaced) return 'add'
    if (inLost) return 'lost'
    return 'ok'
  }

  const isItemChecked = (itemId: string) => {
    const status = getCurrentStatus(itemId)
    return status !== 'ok' || statuses[itemId] === 'ok'
  }

  const getCategoryCheckedCount = (categoryItems: ExtendedRoomItem[]) => {
    return categoryItems.filter(item => isItemChecked(item.item_id)).length
  }

  const totalCheckedCount = items.filter(item => isItemChecked(item.item_id)).length

  const handleMarkOk = (item: RoomItemWithDetails) => {
    const currentStatus = getCurrentStatus(item.item_id)
    if (currentStatus !== 'ok') {
      onResetStatus(item.item_id)
    }
    setStatuses(prev => ({ ...prev, [item.item_id]: 'ok' }))
    setExpandedItem(null)
  }

  const handleStatusChange = (item: RoomItemWithDetails, newStatus: LinenStatus) => {
    const currentStatus = getCurrentStatus(item.item_id)
    
    if (currentStatus !== 'ok') {
      onResetStatus(item.item_id)
    }
    
    // For statuses that need quantity, expand the row
    if (['laundry', 'add', 'change', 'lost', 'damaged', 'missing'].includes(newStatus)) {
      setExpandedItem(item.item_id)
      setStatuses(prev => ({ ...prev, [item.item_id]: newStatus }))
      const qty = getQuantity(item.item_id, item.standard_quantity)
      onLinenStatusChange(item, newStatus, qty)
    } else {
      setStatuses(prev => ({ ...prev, [item.item_id]: newStatus }))
    }
  }

  const handleQuantityChange = (item: RoomItemWithDetails, qty: number) => {
    const newQty = Math.max(1, Math.min(qty, item.standard_quantity * 2))
    setQuantities(prev => ({ ...prev, [item.item_id]: newQty }))
    
    const currentStatus = getCurrentStatus(item.item_id)
    if (currentStatus !== 'ok') {
      onResetStatus(item.item_id)
      onLinenStatusChange(item, currentStatus, newQty)
    }
  }

  const handleReset = (item: RoomItemWithDetails) => {
    onResetStatus(item.item_id)
    setStatuses(prev => {
      const newStatuses = { ...prev }
      delete newStatuses[item.item_id]
      return newStatuses
    })
    setExpandedItem(null)
  }

  const handleMarkAllOk = () => {
    items.forEach(item => {
      const currentStatus = getCurrentStatus(item.item_id)
      if (!isItemChecked(item.item_id)) {
        if (currentStatus !== 'ok') {
          onResetStatus(item.item_id)
        }
        setStatuses(prev => ({ ...prev, [item.item_id]: 'ok' }))
      }
    })
    setExpandedItem(null)
  }

  const handleCategoryMarkAllOk = (categoryItems: ExtendedRoomItem[]) => {
    categoryItems.forEach(item => {
      const currentStatus = getCurrentStatus(item.item_id)
      if (!isItemChecked(item.item_id)) {
        if (currentStatus !== 'ok') {
          onResetStatus(item.item_id)
        }
        setStatuses(prev => ({ ...prev, [item.item_id]: 'ok' }))
      }
    })
  }

  // Build actions based on allowed actions
  const getItemActions = (item: RoomItemWithDetails) => {
    const actions: { label: string; color: string; onClick: () => void }[] = []
    
    if (allowedActions.includes('laundry')) {
      actions.push({
        label: 'Giặt',
        color: 'text-blue-600 hover:bg-blue-50',
        onClick: () => handleStatusChange(item, 'laundry')
      })
    }
    if (allowedActions.includes('change')) {
      actions.push({
        label: 'Đổi',
        color: 'hover:bg-primary/10',
        onClick: () => handleStatusChange(item, 'change')
      })
    }
    if (allowedActions.includes('add')) {
      actions.push({
        label: 'Thêm',
        color: 'text-green-600 hover:bg-green-50',
        onClick: () => handleStatusChange(item, 'add')
      })
    }
    if (allowedActions.includes('missing')) {
      actions.push({
        label: 'Thiếu',
        color: 'text-yellow-600 hover:bg-yellow-50',
        onClick: () => handleStatusChange(item, 'missing')
      })
    }
    if (allowedActions.includes('lost')) {
      actions.push({
        label: 'Mất',
        color: 'text-destructive hover:bg-destructive/10',
        onClick: () => handleStatusChange(item, 'lost')
      })
    }
    if (allowedActions.includes('damaged')) {
      actions.push({
        label: 'Hỏng',
        color: 'text-amber-600 hover:bg-amber-50',
        onClick: () => handleStatusChange(item, 'damaged')
      })
    }
    
    return actions
  }

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Shirt className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p>Không có đồ vải</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Global bulk actions header */}
      <BulkActionsHeader
        totalItems={items.length}
        checkedCount={totalCheckedCount}
        onMarkAllOk={handleMarkAllOk}
      />

      {/* Items grouped by category */}
      {Array.from(groupedItems.entries()).map(([categoryName, categoryItems]) => {
        if (categoryItems.length === 0) return null
        
        return (
          <CategoryGroup
            key={categoryName}
            categoryName={categoryName}
            itemCount={categoryItems.length}
            checkedCount={getCategoryCheckedCount(categoryItems)}
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2 text-green-600"
                onClick={() => handleCategoryMarkAllOk(categoryItems)}
              >
                Tất cả OK
              </Button>
            }
          >
            <div className="divide-y-0">
              {categoryItems.map(item => {
                const status = getCurrentStatus(item.item_id)
                const isChecked = isItemChecked(item.item_id)
                const isExpanded = expandedItem === item.item_id
                const qty = getQuantity(item.item_id, item.standard_quantity)
                const statusInfo = STATUS_CONFIG[status] || STATUS_CONFIG.ok
                const needsQuantity = ['laundry', 'add', 'change', 'lost', 'damaged', 'missing'].includes(status)
                
                // Stock validation for actions that consume stock (add, change)
                const availableStock = stockMap[item.item_id] ?? 0
                const needsStockCheck = ['add', 'change'].includes(status)
                const isOverStock = needsStockCheck && qty > availableStock
                
                return (
                  <CompactItemRow
                    key={item.item_id}
                    itemName={item.item_name}
                    standardQuantity={item.standard_quantity}
                    status={isChecked ? status : 'pending'}
                    statusLabel={status !== 'ok' ? statusInfo.label : undefined}
                    statusColor={statusInfo.color}
                    actions={getItemActions(item)}
                    onMarkOk={() => handleMarkOk(item)}
                    onReset={isChecked ? () => handleReset(item) : undefined}
                    expanded={isExpanded && needsQuantity}
                  >
                    {/* Quantity adjustment for expanded items */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Số lượng:</span>
                        <div className="flex items-center gap-0.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleQuantityChange(item, qty - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number" min={0}
                            value={qty}
                            onChange={(e) => handleQuantityChange(item, parseInt(e.target.value) || 1)}
                            className={`w-12 h-7 text-center text-sm px-1 ${isOverStock ? 'border-amber-500' : ''}`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleQuantityChange(item, qty + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        {needsStockCheck && (
                          <span className={`text-xs ${isOverStock ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            Kho: {availableStock}
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs ml-auto"
                          onClick={() => setExpandedItem(null)}
                        >
                          Xong
                        </Button>
                      </div>
                      {/* Stock warning */}
                      {isOverStock && (
                        <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Kho chỉ còn {availableStock}, yêu cầu {qty}</span>
                        </div>
                      )}
                    </div>
                  </CompactItemRow>
                )
              })}
            </div>
          </CategoryGroup>
        )
      })}
    </div>
  )
}
