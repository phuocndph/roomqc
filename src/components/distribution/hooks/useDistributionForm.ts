import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useRooms } from '@/hooks/useRooms'
import { useHotelContext } from '@/contexts/HotelContext'
import { useTenant } from '@/hooks/useTenant'
import type { DistributionOrderDetail } from '@/types/distribution.types'

export interface RoomItemAllocation {
  room_id: string
  items: { item_id: string; quantity: number }[]
}

export interface StockValidation {
  isValid: boolean
  overStockItems: { itemId: string; itemName: string; requested: number; available: number }[]
}

interface UseDistributionFormOptions {
  initialOrder?: DistributionOrderDetail | null
}

export function useDistributionForm(options: UseDistributionFormOptions = {}) {
  const { initialOrder } = options
  const { selectedHotel } = useHotelContext()
  const { tenant } = useTenant()
  
  // Fetch ALL items with stock directly (no pagination limit)
  const { data: items = [] } = useQuery({
    queryKey: ['distribution-available-items', selectedHotel?.id, tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('id, name, code, quantity_in_stock, status, category_id, unit')
        .eq('tenant_id', tenant!.id)
        .eq('hotel_id', selectedHotel!.id)
        .gt('quantity_in_stock', 0)
        .order('name')
      if (error) throw error
      return data || []
    },
    enabled: !!tenant?.id && !!selectedHotel?.id,
  })
  
  const { data: rooms = [] } = useRooms()
  
  // Form state
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([])
  const [allocations, setAllocations] = useState<RoomItemAllocation[]>([])
  const [assignedTo, setAssignedTo] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [includeDiscontinued, setIncludeDiscontinued] = useState(false)
  
  // Memoized maps for quick lookup
  const itemsMap = useMemo(() => {
    const map = new Map<string, typeof items[0]>()
    items.forEach(item => map.set(item.id, item))
    return map
  }, [items])
  
  const roomsMap = useMemo(() => {
    const map = new Map<string, typeof rooms[0]>()
    rooms.forEach(room => map.set(room.id, room))
    return map
  }, [rooms])
  
  // Selected rooms sorted by floor and room number
  const selectedRooms = useMemo(() => {
    return selectedRoomIds
      .map(id => roomsMap.get(id))
      .filter(Boolean)
      .sort((a, b) => {
        if (a!.floor !== b!.floor) return a!.floor - b!.floor
        return a!.room_number.localeCompare(b!.room_number)
      }) as typeof rooms
  }, [selectedRoomIds, roomsMap])
  
  // Available items (has stock, optionally filter by status)
  const availableItems = useMemo(() => {
    return items.filter(item => {
      const hasStock = (item.quantity_in_stock || 0) > 0
      const isActive = item.status === 'active'
      return hasStock && (includeDiscontinued || isActive)
    })
  }, [items, includeDiscontinued])
  
  // Initialize form from order
  const initFromOrder = useCallback((order: DistributionOrderDetail) => {
    const roomIds = order.rooms?.map(r => r.room_id) || []
    setSelectedRoomIds(roomIds)
    
    const allocs: RoomItemAllocation[] = order.rooms?.map(room => ({
      room_id: room.room_id,
      items: room.items?.map(item => ({
        item_id: item.item_id,
        quantity: item.quantity,
      })) || [],
    })) || []
    setAllocations(allocs)
    
    setAssignedTo(order.assigned_to || '')
    setNotes(order.notes || '')
  }, [])
  
  // Initialize on mount if initial order provided
  useEffect(() => {
    if (initialOrder) {
      initFromOrder(initialOrder)
    }
  }, [initialOrder, initFromOrder])
  
  // Get room allocation
  const getRoomAllocation = useCallback((roomId: string): RoomItemAllocation => {
    return allocations.find(a => a.room_id === roomId) || { room_id: roomId, items: [] }
  }, [allocations])
  
  // Get item info
  const getItemInfo = useCallback((itemId: string) => {
    return itemsMap.get(itemId)
  }, [itemsMap])
  
  // Get room info
  const getRoomInfo = useCallback((roomId: string) => {
    return roomsMap.get(roomId)
  }, [roomsMap])
  
  // Update item quantity for a room
  const updateItemQuantity = useCallback((roomId: string, itemId: string, quantity: number) => {
    setAllocations(prev => {
      const existing = prev.find(a => a.room_id === roomId)
      
      if (existing) {
        const itemIndex = existing.items.findIndex(i => i.item_id === itemId)
        
        if (quantity <= 0) {
          // Remove item
          return prev.map(a => 
            a.room_id === roomId 
              ? { ...a, items: a.items.filter(i => i.item_id !== itemId) }
              : a
          )
        }
        
        if (itemIndex >= 0) {
          // Update quantity
          return prev.map(a =>
            a.room_id === roomId
              ? { ...a, items: a.items.map(i => i.item_id === itemId ? { ...i, quantity } : i) }
              : a
          )
        } else {
          // Add new item
          return prev.map(a =>
            a.room_id === roomId
              ? { ...a, items: [...a.items, { item_id: itemId, quantity }] }
              : a
          )
        }
      } else if (quantity > 0) {
        // Add new room allocation
        return [...prev, { room_id: roomId, items: [{ item_id: itemId, quantity }] }]
      }
      
      return prev
    })
  }, [])
  
  // Add item to all selected rooms
  const addItemToAllRooms = useCallback((itemId: string, quantity = 1) => {
    setAllocations(prev => {
      return selectedRoomIds.map(roomId => {
        const existing = prev.find(a => a.room_id === roomId)
        const existingItems = existing?.items || []
        const itemExists = existingItems.find(i => i.item_id === itemId)
        
        return {
          room_id: roomId,
          items: itemExists 
            ? existingItems 
            : [...existingItems, { item_id: itemId, quantity }]
        }
      }).filter(a => a.items.length > 0)
    })
  }, [selectedRoomIds])
  
  // Remove item from all rooms
  const removeItemFromAllRooms = useCallback((itemId: string) => {
    setAllocations(prev => 
      prev.map(a => ({
        ...a,
        items: a.items.filter(i => i.item_id !== itemId)
      })).filter(a => a.items.length > 0)
    )
  }, [])
  
  // Set quantity for all rooms
  const setQuantityForAllRooms = useCallback((itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItemFromAllRooms(itemId)
      return
    }
    
    setAllocations(prev => 
      selectedRoomIds.map(roomId => {
        const existing = prev.find(a => a.room_id === roomId)
        const existingItems = existing?.items || []
        const itemIndex = existingItems.findIndex(i => i.item_id === itemId)
        
        const newItems = [...existingItems]
        if (itemIndex >= 0) {
          newItems[itemIndex] = { ...newItems[itemIndex], quantity }
        } else {
          newItems.push({ item_id: itemId, quantity })
        }
        
        return { room_id: roomId, items: newItems }
      })
    )
  }, [selectedRoomIds, removeItemFromAllRooms])
  
  // Handle room selection change
  const handleRoomSelectionChange = useCallback((newRoomIds: string[]) => {
    setSelectedRoomIds(newRoomIds)
    
    // Keep allocations for existing rooms, add empty for new rooms
    setAllocations(prev => {
      const existingRoomIds = prev.map(a => a.room_id)
      const removedRooms = existingRoomIds.filter(id => !newRoomIds.includes(id))
      
      // Filter out removed rooms
      const newAllocations = prev.filter(a => !removedRooms.includes(a.room_id))
      
      // Add empty allocations for new rooms
      const addedRooms = newRoomIds.filter(id => !existingRoomIds.includes(id))
      addedRooms.forEach(roomId => {
        newAllocations.push({ room_id: roomId, items: [] })
      })
      
      return newAllocations
    })
  }, [])
  
  // Get available items for room (not yet allocated)
  const getAvailableItemsForRoom = useCallback((roomId: string, searchTerm = '') => {
    const alloc = getRoomAllocation(roomId)
    const allocatedItemIds = alloc.items.filter(i => i.quantity > 0).map(i => i.item_id)
    const searchLower = searchTerm.trim().toLowerCase()
    
    return availableItems
      .filter(i => !allocatedItemIds.includes(i.id))
      .filter(i => {
        if (!searchLower) return true
        const nameLower = (i?.name ?? '').toLowerCase()
        const codeLower = (i?.code ?? '').toLowerCase()
        return nameLower.includes(searchLower) || codeLower.includes(searchLower)
      })
  }, [availableItems, getRoomAllocation])
  
  // Get total quantity for an item across all rooms
  const getTotalForItem = useCallback((itemId: string) => {
    return allocations.reduce((sum, a) => {
      const item = a.items.find(i => i.item_id === itemId)
      return sum + (item?.quantity || 0)
    }, 0)
  }, [allocations])
  
  // Get unique allocated item IDs
  const allocatedItemIds = useMemo(() => {
    const ids = new Set<string>()
    allocations.forEach(a => a.items.forEach(i => ids.add(i.item_id)))
    return Array.from(ids)
  }, [allocations])
  
  // Calculate stock validation
  const stockValidation = useMemo<StockValidation>(() => {
    const overStockItems: StockValidation['overStockItems'] = []
    
    // Get original quantities if editing
    const originalTotals: Record<string, number> = {}
    initialOrder?.rooms?.forEach(room => {
      room.items?.forEach(item => {
        originalTotals[item.item_id] = (originalTotals[item.item_id] || 0) + item.quantity
      })
    })
    
    allocatedItemIds.forEach(itemId => {
      const item = getItemInfo(itemId)
      if (!item) return
      
      const total = getTotalForItem(itemId)
      const originalQty = originalTotals[itemId] || 0
      // Available = current stock + original (already reserved when editing)
      const available = (item.quantity_in_stock || 0) + originalQty
      
      if (total > available) {
        overStockItems.push({
          itemId,
          itemName: item.name,
          requested: total,
          available,
        })
      }
    })
    
    return {
      isValid: overStockItems.length === 0,
      overStockItems,
    }
  }, [allocatedItemIds, getTotalForItem, getItemInfo, initialOrder])
  
  // Calculate summary
  const summary = useMemo(() => {
    const roomCount = selectedRoomIds.length
    const roomsWithItems = allocations.filter(a => a.items.length > 0).length
    const totalItems = allocations.reduce((sum, a) => 
      sum + a.items.reduce((s, i) => s + i.quantity, 0), 0
    )
    const itemTypesCount = allocatedItemIds.length
    
    return {
      roomCount,
      roomsWithItems,
      totalItems,
      itemTypesCount,
    }
  }, [selectedRoomIds, allocations, allocatedItemIds])
  
  // Reset form
  const reset = useCallback(() => {
    setSelectedRoomIds([])
    setAllocations([])
    setAssignedTo('')
    setNotes('')
  }, [])
  
  // Helper: calculate remaining stock for an item considering current allocations
  const getRemainingStock = useCallback((itemId: string, itemStock: number) => {
    const totalAllocated = allocations.reduce((sum, a) => {
      const item = a.items.find(i => i.item_id === itemId)
      return sum + (item?.quantity || 0)
    }, 0)
    return Math.max(0, itemStock - totalAllocated)
  }, [allocations])

  // Auto-fill missing items for a single room using room detail logic
  const autoFillMissingItemsForRoom = useCallback(async (roomId: string) => {
    try {
      const { data: missingData, error } = await supabase
        .rpc('get_missing_items_from_room_detail', { p_room_ids: [roomId] })
      
      if (error) throw error
      
      const missingItems = missingData as { 
        room_id: string
        item_id: string
        item_name: string
        missing_qty: number
        item_stock: number
      }[] | null
      
      if (!missingItems || missingItems.length === 0) {
        return { success: true, message: 'Phòng đã đủ tiêu chuẩn hoặc chưa thiết lập tiêu chuẩn', count: 0, unfilled: 0, noStandards: true }
      }
      
      // Calculate allocation with stock constraints
      let addedQty = 0
      let unfilledQty = 0
      const itemsToAdd: { item_id: string; quantity: number }[] = []
      
      // Track remaining stock across this batch
      const stockTracker: Record<string, number> = {}
      
      for (const m of missingItems) {
        if (!stockTracker[m.item_id]) {
          stockTracker[m.item_id] = getRemainingStock(m.item_id, m.item_stock)
        }
        
        // Get already allocated quantity for this item in this room
        const existingAlloc = allocations.find(a => a.room_id === roomId)
        const alreadyAllocated = existingAlloc?.items.find(i => i.item_id === m.item_id)?.quantity || 0
        
        // Calculate how much more we need to add (avoid double allocation)
        const needToAdd = Math.max(0, m.missing_qty - alreadyAllocated)
        
        const canAllocate = Math.min(needToAdd, stockTracker[m.item_id])
        if (canAllocate > 0) {
          itemsToAdd.push({ item_id: m.item_id, quantity: canAllocate })
          stockTracker[m.item_id] -= canAllocate
          addedQty += canAllocate
        }
        
        if (canAllocate < needToAdd) {
          unfilledQty += (needToAdd - canAllocate)
        }
      }
      
      if (itemsToAdd.length === 0) {
        // Check if room already has all required items
        const allFilled = missingItems.every(m => {
          const existingAlloc = allocations.find(a => a.room_id === roomId)
          const alreadyAllocated = existingAlloc?.items.find(i => i.item_id === m.item_id)?.quantity || 0
          return alreadyAllocated >= m.missing_qty
        })
        
        if (allFilled) {
          return { success: true, message: 'Phòng đã đủ số lượng theo tiêu chuẩn', count: 0, unfilled: 0 }
        }
        return { success: true, message: 'Không đủ tồn kho để cấp phát thêm', count: 0, unfilled: unfilledQty }
      }
      
      // Update allocations
      setAllocations(prev => {
        const existingIdx = prev.findIndex(a => a.room_id === roomId)
        const existingItems = existingIdx >= 0 ? [...prev[existingIdx].items] : []
        
        itemsToAdd.forEach(({ item_id, quantity }) => {
          const itemIdx = existingItems.findIndex(i => i.item_id === item_id)
          if (itemIdx >= 0) {
            // Add to existing quantity (we already calculated the delta)
            existingItems[itemIdx] = {
              ...existingItems[itemIdx],
              quantity: existingItems[itemIdx].quantity + quantity,
            }
          } else {
            existingItems.push({ item_id, quantity })
          }
        })
        
        if (existingIdx >= 0) {
          const newAllocs = [...prev]
          newAllocs[existingIdx] = { room_id: roomId, items: existingItems }
          return newAllocs
        } else {
          return [...prev, { room_id: roomId, items: existingItems }]
        }
      })
      
      const message = unfilledQty > 0 
        ? `+${addedQty} SP, thiếu ${unfilledQty} do hết kho`
        : `+${addedQty} SP`
      
      return { success: true, message, count: addedQty, unfilled: unfilledQty }
    } catch (err: any) {
      return { success: false, message: err.message || 'Lỗi', count: 0, unfilled: 0 }
    }
  }, [getRemainingStock, allocations])

  // Auto-fill missing items for all selected rooms
  const autoFillMissingItems = useCallback(async () => {
    if (selectedRoomIds.length === 0) return { success: false, message: 'Chưa chọn phòng', count: 0, unfilled: 0 }
    
    try {
      const { data: missingData, error } = await supabase
        .rpc('get_missing_items_from_room_detail', { p_room_ids: selectedRoomIds })
      
      if (error) throw error
      
      const missingItems = missingData as { 
        room_id: string
        room_number: string
        item_id: string
        item_name: string
        missing_qty: number
        item_stock: number
      }[] | null
      
      if (!missingItems || missingItems.length === 0) {
        return { success: true, message: 'Tất cả phòng đã đủ tiêu chuẩn hoặc chưa thiết lập tiêu chuẩn', count: 0, unfilled: 0, noStandards: true }
      }
      
      // Track remaining stock and allocations
      const stockTracker: Record<string, number> = {}
      const byRoom: Record<string, { item_id: string; quantity: number }[]> = {}
      let totalAdded = 0
      let totalUnfilled = 0
      
      for (const m of missingItems) {
        if (!stockTracker[m.item_id]) {
          stockTracker[m.item_id] = getRemainingStock(m.item_id, m.item_stock)
        }
        
        // Get already allocated quantity for this item in this room
        const existingAlloc = allocations.find(a => a.room_id === m.room_id)
        const alreadyAllocated = existingAlloc?.items.find(i => i.item_id === m.item_id)?.quantity || 0
        
        // Calculate how much more we need to add (avoid double allocation)
        const needToAdd = Math.max(0, m.missing_qty - alreadyAllocated)
        
        const canAllocate = Math.min(needToAdd, stockTracker[m.item_id])
        if (canAllocate > 0) {
          if (!byRoom[m.room_id]) byRoom[m.room_id] = []
          byRoom[m.room_id].push({ item_id: m.item_id, quantity: canAllocate })
          stockTracker[m.item_id] -= canAllocate
          totalAdded += canAllocate
        }
        
        if (canAllocate < needToAdd) {
          totalUnfilled += (needToAdd - canAllocate)
        }
      }
      
      if (Object.keys(byRoom).length === 0) {
        // Check if all rooms already have required items
        const allFilled = missingItems.every(m => {
          const existingAlloc = allocations.find(a => a.room_id === m.room_id)
          const alreadyAllocated = existingAlloc?.items.find(i => i.item_id === m.item_id)?.quantity || 0
          return alreadyAllocated >= m.missing_qty
        })
        
        if (allFilled) {
          return { success: true, message: 'Tất cả phòng đã đủ số lượng theo tiêu chuẩn', count: 0, unfilled: 0 }
        }
        return { success: true, message: 'Không đủ tồn kho để cấp phát thêm', count: 0, unfilled: totalUnfilled }
      }
      
      // Merge with existing allocations
      setAllocations(prev => {
        const newAllocs = [...prev]
        
        Object.entries(byRoom).forEach(([roomId, items]) => {
          const existingIdx = newAllocs.findIndex(a => a.room_id === roomId)
          
          if (existingIdx >= 0) {
            const existingItems = [...newAllocs[existingIdx].items]
            items.forEach(({ item_id, quantity }) => {
              const itemIdx = existingItems.findIndex(i => i.item_id === item_id)
              if (itemIdx >= 0) {
                // Add to existing quantity (we already calculated the delta)
                existingItems[itemIdx] = {
                  ...existingItems[itemIdx],
                  quantity: existingItems[itemIdx].quantity + quantity,
                }
              } else {
                existingItems.push({ item_id, quantity })
              }
            })
            newAllocs[existingIdx] = { ...newAllocs[existingIdx], items: existingItems }
          } else {
            newAllocs.push({ room_id: roomId, items })
          }
        })
        
        return newAllocs
      })
      
      const roomCount = Object.keys(byRoom).length
      const message = totalUnfilled > 0
        ? `+${totalAdded} SP cho ${roomCount} phòng, thiếu ${totalUnfilled} do hết kho`
        : `+${totalAdded} SP cho ${roomCount} phòng`
      
      return { success: true, message, count: totalAdded, unfilled: totalUnfilled }
    } catch (err: any) {
      console.error('Auto-fill error:', err)
      return { success: false, message: err.message || 'Lỗi khi tự động lấy SP thiếu', count: 0, unfilled: 0 }
    }
  }, [selectedRoomIds, allocations, getRemainingStock])
  
  // Check form validity
  const isValid = useMemo(() => {
    return (
      selectedRoomIds.length > 0 &&
      allocations.filter(a => a.items.length > 0).length > 0 &&
      stockValidation.isValid
    )
  }, [selectedRoomIds, allocations, stockValidation])
  
  return {
    // State
    selectedRoomIds,
    setSelectedRoomIds: handleRoomSelectionChange,
    allocations,
    setAllocations,
    assignedTo,
    setAssignedTo,
    notes,
    setNotes,
    includeDiscontinued,
    setIncludeDiscontinued,
    
    // Data
    items,
    rooms,
    itemsMap,
    roomsMap,
    selectedRooms,
    availableItems,
    allocatedItemIds,
    
    // Helpers
    getRoomAllocation,
    getItemInfo,
    getRoomInfo,
    updateItemQuantity,
    addItemToAllRooms,
    removeItemFromAllRooms,
    setQuantityForAllRooms,
    getAvailableItemsForRoom,
    getTotalForItem,
    
    // Validation
    stockValidation,
    isValid,
    
    // Summary
    summary,
    
    // Actions
    initFromOrder,
    reset,
    autoFillMissingItems,
    autoFillMissingItemsForRoom,
  }
}

export type DistributionFormReturn = ReturnType<typeof useDistributionForm>
