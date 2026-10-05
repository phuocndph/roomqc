import { useState, useMemo, useEffect } from 'react'
import { Tv, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'
import type { RoomItemWithDetails, LostItem, DamagedItem } from '@/types/rooms.types'
import { CategoryGroup, groupItemsByCategory } from './CategoryGroup'
import { CompactItemRow } from './CompactItemRow'
import { BulkActionsHeader } from './BulkActionsHeader'
import { getCheckTypeConfig, type CheckType } from '@/lib/roomCheckConfig'

interface ExtendedRoomItem extends RoomItemWithDetails {
  category_name?: string | null
}

interface EquipmentTabProps {
  items: ExtendedRoomItem[]
  checkType: CheckType
  phase?: 1 | 2 // NEW: Phase for checkout 2-phase flow
  lostItems: LostItem[]
  damagedItems: DamagedItem[]
  onMarkLost: (item: RoomItemWithDetails, quantity: number, estimatedValue?: number) => void
  onMarkDamaged: (item: RoomItemWithDetails, damageInfo: { damage_type: 'repairable' | 'replacement_needed'; damage_cost: number; notes?: string }) => void
  onRemoveFromLost: (itemId: string) => void
  onRemoveFromDamaged: (itemId: string) => void
}

type ItemStatus = 'pending' | 'ok' | 'lost' | 'damaged'

export function EquipmentTab({
  items,
  checkType,
  phase,
  lostItems,
  damagedItems,
  onMarkLost,
  onMarkDamaged,
  onRemoveFromLost,
  onRemoveFromDamaged,
}: EquipmentTabProps) {
  const config = getCheckTypeConfig(checkType)
  
  // Get allowed actions based on phase (for checkout) or default config
  const allowedActions = (() => {
    if (checkType === 'checkout' && phase && config.phase1Actions && config.phase2Actions) {
      return phase === 1 ? config.phase1Actions.equipment : config.phase2Actions.equipment
    }
    return config.equipmentActions
  })()
  
  const [checkedOk, setCheckedOk] = useState<Set<string>>(new Set())
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [pendingType, setPendingType] = useState<'lost' | 'damaged' | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [damageType, setDamageType] = useState<'repairable' | 'replacement_needed'>('repairable')
  const [damageCost, setDamageCost] = useState<number>(0)
  const [itemPrices, setItemPrices] = useState<Record<string, number>>({})
  
  // Fetch unit prices
  useEffect(() => {
    const fetchPrices = async () => {
      const itemIds = items.map(i => i.item_id)
      if (itemIds.length === 0) return
      
      const { data } = await supabase
        .from('items')
        .select('id, unit_price')
        .in('id', itemIds)
      
      if (data) {
        const priceMap: Record<string, number> = {}
        data.forEach(item => {
          priceMap[item.id] = item.unit_price || 0
        })
        setItemPrices(priceMap)
      }
    }
    fetchPrices()
  }, [items])

  const getStatus = (itemId: string): ItemStatus => {
    if (lostItems.some(i => i.item_id === itemId)) return 'lost'
    if (damagedItems.some(i => i.item_id === itemId)) return 'damaged'
    if (checkedOk.has(itemId)) return 'ok'
    return 'pending'
  }

  const groupedItems = useMemo(() => groupItemsByCategory(items), [items])

  const isItemChecked = (itemId: string) => getStatus(itemId) !== 'pending'
  const totalCheckedCount = items.filter(item => isItemChecked(item.item_id)).length
  const getCategoryCheckedCount = (categoryItems: ExtendedRoomItem[]) => 
    categoryItems.filter(item => isItemChecked(item.item_id)).length

  const handleMarkOk = (itemId: string) => {
    setCheckedOk(prev => new Set(prev).add(itemId))
    setExpandedItem(null)
    setPendingType(null)
  }

  const handleMarkAllOk = () => {
    items.forEach(item => {
      if (getStatus(item.item_id) === 'pending') {
        setCheckedOk(prev => new Set(prev).add(item.item_id))
      }
    })
  }

  const handleCategoryMarkAllOk = (categoryItems: ExtendedRoomItem[]) => {
    categoryItems.forEach(item => {
      if (getStatus(item.item_id) === 'pending') {
        setCheckedOk(prev => new Set(prev).add(item.item_id))
      }
    })
  }

  const handleStartAction = (itemId: string, type: 'lost' | 'damaged') => {
    setExpandedItem(itemId)
    setPendingType(type)
    setActionNotes('')
    setDamageType('repairable')
    const itemPrice = itemPrices[itemId] || 0
    setDamageCost(type === 'damaged' ? Math.round(itemPrice * 0.5) : itemPrice)
  }

  const handleConfirmAction = (item: RoomItemWithDetails) => {
    if (!pendingType) return
    const itemPrice = itemPrices[item.item_id] || 0

    if (pendingType === 'lost') {
      onMarkLost(item, 1, itemPrice)
    } else {
      onMarkDamaged(item, {
        damage_type: damageType,
        damage_cost: damageCost,
        notes: actionNotes || undefined
      })
    }
    
    setExpandedItem(null)
    setPendingType(null)
    setActionNotes('')
    setDamageCost(0)
  }

  const handleReset = (item: RoomItemWithDetails) => {
    const status = getStatus(item.item_id)
    if (status === 'lost') onRemoveFromLost(item.item_id)
    else if (status === 'damaged') onRemoveFromDamaged(item.item_id)
    else if (status === 'ok') {
      setCheckedOk(prev => {
        const newSet = new Set(prev)
        newSet.delete(item.item_id)
        return newSet
      })
    }
    setExpandedItem(null)
    setPendingType(null)
  }

  const getItemActions = (item: RoomItemWithDetails) => {
    const actions: { label: string; color: string; onClick: () => void }[] = []
    
    if (allowedActions.includes('damaged')) {
      actions.push({
        label: 'Hỏng',
        color: 'text-amber-600 hover:bg-amber-50',
        onClick: () => handleStartAction(item.item_id, 'damaged')
      })
    }
    if (allowedActions.includes('lost')) {
      actions.push({
        label: 'Mất',
        color: 'text-destructive hover:bg-destructive/10',
        onClick: () => handleStartAction(item.item_id, 'lost')
      })
    }
    
    return actions
  }

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Tv className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p>Không có thiết bị</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <BulkActionsHeader
        totalItems={items.length}
        checkedCount={totalCheckedCount}
        onMarkAllOk={handleMarkAllOk}
      />

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
                const status = getStatus(item.item_id)
                const isExpanded = expandedItem === item.item_id
                const damagedInfo = damagedItems.find(i => i.item_id === item.item_id)
                
                const statusLabel = status === 'lost' ? 'Mất' : status === 'damaged' ? 'Hỏng' : undefined
                const statusColor = status === 'lost' ? 'text-destructive' : status === 'damaged' ? 'text-amber-600' : undefined
                
                return (
                  <div key={item.item_id}>
                    <CompactItemRow
                      itemName={item.item_name}
                      status={status}
                      statusLabel={statusLabel}
                      statusColor={statusColor}
                      actions={getItemActions(item)}
                      onMarkOk={() => handleMarkOk(item.item_id)}
                      onReset={status !== 'pending' ? () => handleReset(item) : undefined}
                      expanded={isExpanded}
                    >
                      {/* Expanded form for lost/damaged */}
                      {pendingType === 'lost' && (
                        <div className="space-y-2 p-2 bg-red-50 rounded-lg border border-red-200 mt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-red-700">Giá đền bù</span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {formatCurrency(itemPrices[item.item_id] || 0)}
                            </span>
                          </div>
                          <Textarea
                            value={actionNotes}
                            onChange={(e) => setActionNotes(e.target.value)}
                            placeholder="Lý do mất..."
                            className="h-12 text-sm"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-8"
                              onClick={() => handleConfirmAction(item)}
                            >
                              Xác nhận
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() => { setExpandedItem(null); setPendingType(null) }}
                            >
                              Hủy
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {pendingType === 'damaged' && (
                        <div className="space-y-2 p-2 bg-amber-50 rounded-lg border border-amber-200 mt-1">
                          <RadioGroup 
                            value={damageType} 
                            onValueChange={(v) => {
                              setDamageType(v as 'repairable' | 'replacement_needed')
                              const price = itemPrices[item.item_id] || 0
                              setDamageCost(v === 'repairable' ? Math.round(price * 0.5) : price)
                            }}
                            className="flex gap-3"
                          >
                            <div className="flex items-center space-x-1.5">
                              <RadioGroupItem value="repairable" id={`r-${item.item_id}`} />
                              <Label htmlFor={`r-${item.item_id}`} className="text-xs">Sửa (50%)</Label>
                            </div>
                            <div className="flex items-center space-x-1.5">
                              <RadioGroupItem value="replacement_needed" id={`rn-${item.item_id}`} />
                              <Label htmlFor={`rn-${item.item_id}`} className="text-xs">Thay (100%)</Label>
                            </div>
                          </RadioGroup>
                          
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-amber-700">Chi phí:</Label>
                            <Input
                              type="text"
                              inputMode="numeric"
                              className="h-7 w-24 text-right font-mono text-sm"
                              value={damageCost > 0 ? damageCost.toString() : ''}
                              onChange={(e) => setDamageCost(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
                            />
                            <span className="text-xs">đ</span>
                          </div>
                          
                          <Textarea
                            value={actionNotes}
                            onChange={(e) => setActionNotes(e.target.value)}
                            placeholder="Mô tả hư hỏng..."
                            className="h-12 text-sm"
                          />
                          
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 border-amber-300 text-amber-700"
                              onClick={() => handleConfirmAction(item)}
                            >
                              Xác nhận
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() => { setExpandedItem(null); setPendingType(null) }}
                            >
                              Hủy
                            </Button>
                          </div>
                        </div>
                      )}
                    </CompactItemRow>
                    
                    {/* Show damage info inline */}
                    {status === 'damaged' && damagedInfo && !isExpanded && (
                      <div className="px-3 pb-2 text-xs text-muted-foreground">
                        {damagedInfo.damage_type === 'repairable' ? 'Cần sửa' : 'Cần thay'} • {formatCurrency(damagedInfo.damage_cost)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CategoryGroup>
        )
      })}
    </div>
  )
}
