import { useState, useMemo, useEffect, useCallback } from 'react'
import { Droplets, Check, Minus, Plus, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { RoomItemWithDetails, ConsumedItem } from '@/types/rooms.types'
import { CategoryGroup, groupItemsByCategory } from './CategoryGroup'
import { useBookingConsumables, useInitializeBookingConsumables, useUpdateConsumableRemaining, BookingConsumableWithItem } from '@/hooks/useBookingConsumables'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getCheckTypeConfig, type CheckType } from '@/lib/roomCheckConfig'

interface ExtendedRoomItem extends RoomItemWithDetails {
  category_name?: string | null
}

interface ConsumableTabBookingProps {
  items: ExtendedRoomItem[]
  bookingId: string | null
  roomId: string
  tenantId: string
  checkType: CheckType
  phase?: 1 | 2 // NEW: Phase for checkout 2-phase flow
  consumedItems: ConsumedItem[]
  onMarkConsumed: (item: RoomItemWithDetails, quantity: number, needRefill: boolean) => void
  onRemoveConsumed: (itemId: string) => void
}

type FilterType = 'all' | 'unchecked' | 'lacking' | 'excess' | 'ok'

interface ItemState {
  seen: number | null
  isDirty: boolean
}

export function ConsumableTabBooking({
  items,
  bookingId,
  roomId,
  tenantId,
  checkType,
  phase,
  consumedItems,
  onMarkConsumed,
  onRemoveConsumed,
}: ConsumableTabBookingProps) {
  const config = getCheckTypeConfig(checkType)
  
  // Get allowed actions based on phase (for checkout) or default config
  const allowedActions = (() => {
    if (checkType === 'checkout' && phase && config.phase1Actions && config.phase2Actions) {
      return phase === 1 ? config.phase1Actions.consumable : config.phase2Actions.consumable
    }
    return config.consumableActions
  })()
  
  const { data: bookingConsumables, isLoading, refetch } = useBookingConsumables(bookingId || undefined)
  const { mutate: initializeConsumables, isPending: isInitializingConsumables } = useInitializeBookingConsumables()
  const updateRemaining = useUpdateConsumableRemaining()
  
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({})
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set())

  const consumablesMap = useMemo(() => {
    const map = new Map<string, BookingConsumableWithItem>()
    bookingConsumables?.forEach(bc => map.set(bc.item_id, bc))
    return map
  }, [bookingConsumables])

  const getRequired = useCallback((item: ExtendedRoomItem): number => {
    const bc = consumablesMap.get(item.item_id)
    if (bc) return bc.total_available
    return item.standard_quantity ?? item.current_quantity ?? 0
  }, [consumablesMap])

  const getSeen = useCallback((item: ExtendedRoomItem): number | null => {
    const state = itemStates[item.item_id]
    if (state?.seen !== undefined && state.seen !== null) return state.seen
    const bc = consumablesMap.get(item.item_id)
    if (bc?.remaining_quantity !== null && bc?.remaining_quantity !== undefined) return bc.remaining_quantity
    return null
  }, [itemStates, consumablesMap])

  const getItemStatus = useCallback((item: ExtendedRoomItem) => {
    const required = getRequired(item)
    const seen = getSeen(item)
    if (seen === null) return { status: 'unchecked' as const, diff: 0, required, seen: null }
    const diff = seen - required
    if (diff < 0) return { status: 'lacking' as const, diff: Math.abs(diff), required, seen }
    if (diff > 0) return { status: 'excess' as const, diff, required, seen }
    return { status: 'ok' as const, diff: 0, required, seen }
  }, [getRequired, getSeen])

  useEffect(() => {
    const shouldInit = bookingId && roomId && tenantId && !isLoading && 
      (!bookingConsumables || bookingConsumables.length === 0) && 
      items.length > 0 && !isInitializingConsumables

    if (shouldInit) {
      initializeConsumables({ bookingId, roomId, tenantId }, { onSuccess: () => refetch() })
    }
  }, [bookingId, roomId, tenantId, isLoading, bookingConsumables, items, isInitializingConsumables, initializeConsumables, refetch])

  useEffect(() => {
    if (bookingConsumables && bookingConsumables.length > 0) {
      const states: Record<string, ItemState> = {}
      bookingConsumables.forEach(bc => {
        if (bc.remaining_quantity !== null) {
          states[bc.item_id] = { seen: bc.remaining_quantity, isDirty: false }
        }
      })
      if (Object.keys(states).length > 0) {
        setItemStates(prev => ({ ...prev, ...states }))
      }
    }
  }, [bookingConsumables])

  const updateSeen = useCallback((itemId: string, value: number) => {
    setItemStates(prev => ({
      ...prev,
      [itemId]: { seen: Math.max(0, value), isDirty: true }
    }))
  }, [])

  const persistSeen = useCallback(async (item: ExtendedRoomItem) => {
    const bc = consumablesMap.get(item.item_id)
    const seen = getSeen(item)
    if (!bc || seen === null) return

    setSavingItems(prev => new Set(prev).add(item.item_id))
    
    try {
      await updateRemaining.mutateAsync({ bookingConsumableId: bc.id, remainingQuantity: seen })
      
      const required = getRequired(item)
      const consumed = Math.max(0, required - seen)
      if (consumed > 0) {
        onMarkConsumed(item, consumed, true)
      } else {
        onRemoveConsumed(item.item_id)
      }
      
      setItemStates(prev => ({
        ...prev,
        [item.item_id]: { ...prev[item.item_id], isDirty: false }
      }))
      
      toast.success(`Đã lưu`)
    } catch {
      toast.error('Lỗi lưu')
    } finally {
      setSavingItems(prev => {
        const next = new Set(prev)
        next.delete(item.item_id)
        return next
      })
    }
  }, [consumablesMap, getSeen, getRequired, updateRemaining, onMarkConsumed, onRemoveConsumed])

  const handleQuickOk = async (item: ExtendedRoomItem) => {
    const required = getRequired(item)
    setItemStates(prev => ({ ...prev, [item.item_id]: { seen: required, isDirty: true } }))
    
    const bc = consumablesMap.get(item.item_id)
    if (bc) {
      setSavingItems(prev => new Set(prev).add(item.item_id))
      try {
        await updateRemaining.mutateAsync({ bookingConsumableId: bc.id, remainingQuantity: required })
        onRemoveConsumed(item.item_id)
        setItemStates(prev => ({ ...prev, [item.item_id]: { seen: required, isDirty: false } }))
      } finally {
        setSavingItems(prev => {
          const next = new Set(prev)
          next.delete(item.item_id)
          return next
        })
      }
    }
  }

  const handleMarkAllOk = async (categoryItems: ExtendedRoomItem[]) => {
    for (const item of categoryItems) {
      const required = getRequired(item)
      setItemStates(prev => ({ ...prev, [item.item_id]: { seen: required, isDirty: false } }))
      onRemoveConsumed(item.item_id)
      
      const bc = consumablesMap.get(item.item_id)
      if (bc) {
        updateRemaining.mutate({ bookingConsumableId: bc.id, remainingQuantity: required })
      }
    }
    toast.success(`Đã đánh dấu tất cả đủ`)
  }

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items
    return items.filter(item => getItemStatus(item).status === activeFilter)
  }, [items, activeFilter, getItemStatus])

  const groupedItems = useMemo(() => groupItemsByCategory(filteredItems), [filteredItems])

  const filterCounts = useMemo(() => {
    let unchecked = 0, lacking = 0, excess = 0, ok = 0
    items.forEach(item => {
      const { status } = getItemStatus(item)
      if (status === 'unchecked') unchecked++
      else if (status === 'lacking') lacking++
      else if (status === 'excess') excess++
      else ok++
    })
    return { unchecked, lacking, excess, ok, total: items.length }
  }, [items, getItemStatus])

  const getCategoryCheckedCount = (categoryItems: ExtendedRoomItem[]) => {
    return categoryItems.filter(item => getItemStatus(item).status !== 'unchecked').length
  }

  if (bookingId && (isLoading || initializeConsumables.isPending)) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Droplets className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p>Không có đồ tiêu hao</p>
      </div>
    )
  }

  const checkedCount = filterCounts.total - filterCounts.unchecked

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as FilterType)}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả ({filterCounts.total})</SelectItem>
            <SelectItem value="unchecked">Chưa kiểm ({filterCounts.unchecked})</SelectItem>
            <SelectItem value="lacking">Thiếu ({filterCounts.lacking})</SelectItem>
            <SelectItem value="excess">Thừa ({filterCounts.excess})</SelectItem>
            <SelectItem value="ok">Đủ ({filterCounts.ok})</SelectItem>
          </SelectContent>
        </Select>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{checkedCount}/{filterCounts.total}</span>
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${filterCounts.total > 0 ? (checkedCount / filterCounts.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Items list */}
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
                className="h-6 text-xs px-2"
                onClick={() => handleMarkAllOk(categoryItems)}
              >
                Tất cả đủ
              </Button>
            }
          >
            <div className="divide-y divide-border">
              {categoryItems.map(item => {
                const { status, diff, required, seen } = getItemStatus(item)
                const isDirty = itemStates[item.item_id]?.isDirty
                const isSaving = savingItems.has(item.item_id)
                const displaySeen = seen ?? required
                
                // For checkout with booking: show full counter UI
                // For other check types: show simple OK/Thiếu buttons
                const isFullCounterMode = checkType === 'checkout' && bookingId
                
                return (
                  <div key={item.item_id} className="flex items-center gap-2 py-2.5 px-1">
                    {/* Item info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.item_name}</div>
                      <div className="text-xs text-muted-foreground">Cần: {required}</div>
                    </div>
                    
                    {isFullCounterMode ? (
                      <>
                        {/* Counter - only for checkout with booking */}
                        <div className="flex items-center gap-0.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateSeen(item.item_id, displaySeen - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number" min={0}
                            value={displaySeen}
                            onChange={(e) => updateSeen(item.item_id, parseInt(e.target.value) || 0)}
                            className="w-10 h-7 text-center text-sm px-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateSeen(item.item_id, displaySeen + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        
                        {/* Status */}
                        <div className="w-12 text-right text-xs font-medium">
                          {status === 'ok' && <Check className="h-4 w-4 text-success ml-auto" />}
                          {status === 'lacking' && <span className="text-destructive">-{diff}</span>}
                          {status === 'excess' && <span className="text-warning">+{diff}</span>}
                          {status === 'unchecked' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-1.5"
                              onClick={() => handleQuickOk(item)}
                              disabled={isSaving}
                            >
                              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Đủ'}
                            </Button>
                          )}
                        </div>
                        
                        {/* Save */}
                        <div className="w-7">
                          {isDirty && status !== 'unchecked' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => persistSeen(item)}
                              disabled={isSaving}
                            >
                              {isSaving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Save className="h-3.5 w-3.5 text-primary" />
                              )}
                            </Button>
                          )}
                        </div>
                      </>
                    ) : (
                      /* Simple buttons for daily/checkin/maintenance */
                      <div className="flex items-center gap-1">
                        {status === 'unchecked' ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-success hover:bg-success/10"
                              onClick={() => handleQuickOk(item)}
                              disabled={isSaving}
                            >
                              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'OK'}
                            </Button>
                            {allowedActions.includes('missing') && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-warning hover:bg-warning/10"
                                onClick={() => {
                                  updateSeen(item.item_id, 0)
                                  onMarkConsumed(item, required, true)
                                }}
                              >
                                Thiếu
                              </Button>
                            )}
                            {allowedActions.includes('empty') && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  updateSeen(item.item_id, 0)
                                  onMarkConsumed(item, required, true)
                                }}
                              >
                                Hết
                              </Button>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-1">
                            {status === 'ok' && <Check className="h-4 w-4 text-success" />}
                            {status === 'lacking' && <span className="text-xs text-destructive">Thiếu {diff}</span>}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                setItemStates(prev => {
                                  const newState = { ...prev }
                                  delete newState[item.item_id]
                                  return newState
                                })
                                onRemoveConsumed(item.item_id)
                              }}
                            >
                              <Minus className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CategoryGroup>
        )
      })}

      {/* Summary */}
      {filterCounts.unchecked === 0 && filterCounts.total > 0 && (
        <div className="border-t pt-3 mt-3">
          <div className="text-sm font-medium mb-2">Tổng kết</div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div>
              <div className="text-xl font-semibold text-green-600">{filterCounts.ok}</div>
              <div className="text-xs text-muted-foreground">Đủ</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-destructive">{filterCounts.lacking}</div>
              <div className="text-xs text-muted-foreground">Thiếu</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-amber-600">{filterCounts.excess}</div>
              <div className="text-xs text-muted-foreground">Thừa</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
