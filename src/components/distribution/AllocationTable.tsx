import { useMemo, useState } from 'react'
import { Minus, Plus, Trash2, AlertTriangle, Copy, ClipboardPaste } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useItems } from '@/hooks/useItems'
import { useRooms } from '@/hooks/useRooms'
import { toast } from 'sonner'
import type { RoomItemAllocation } from './hooks/useDistributionForm'

interface AllocationTableProps {
  selectedRoomIds: string[]
  allocations: RoomItemAllocation[]
  onQuantityChange: (roomId: string, itemId: string, quantity: number) => void
  onRemoveItem: (itemId: string) => void
  onSetQuantityForAll: (itemId: string, quantity: number) => void
}

export function AllocationTable({
  selectedRoomIds,
  allocations,
  onQuantityChange,
  onRemoveItem,
  onSetQuantityForAll,
}: AllocationTableProps) {
  const [copiedQuantities, setCopiedQuantities] = useState<Record<string, number> | null>(null)
  
  // Fetch all items (1000) to ensure all selected items can be displayed
  const { data: itemsData } = useItems({}, 1, 1000)
  const { data: rooms = [] } = useRooms()
  
  const items = useMemo(() => itemsData?.items ?? [], [itemsData?.items])
  
  const roomsMap = useMemo(() => {
    const map = new Map<string, typeof rooms[0]>()
    rooms.forEach(r => map.set(r.id, r))
    return map
  }, [rooms])
  
  const itemsMap = useMemo(() => {
    const map = new Map<string, typeof items[0]>()
    items.forEach(i => map.set(i.id, i))
    return map
  }, [items])
  
  const selectedRooms = useMemo(() => {
    return selectedRoomIds
      .map(id => roomsMap.get(id))
      .filter(Boolean)
      .sort((a, b) => {
        if (a!.floor !== b!.floor) return a!.floor - b!.floor
        return a!.room_number.localeCompare(b!.room_number)
      }) as typeof rooms
  }, [selectedRoomIds, roomsMap])
  
  // Get unique item IDs from allocations
  const allocatedItemIds = useMemo(() => {
    const ids = new Set<string>()
    allocations.forEach(a => a.items.forEach(i => ids.add(i.item_id)))
    return Array.from(ids)
  }, [allocations])
  
  // Get quantity for a specific room and item
  const getQuantity = (roomId: string, itemId: string): number => {
    const roomAlloc = allocations.find(a => a.room_id === roomId)
    const itemAlloc = roomAlloc?.items.find(i => i.item_id === itemId)
    return itemAlloc?.quantity || 0
  }
  
  // Get total quantity for an item across all rooms
  const getTotalForItem = (itemId: string): number => {
    let total = 0
    allocations.forEach(a => {
      const itemAlloc = a.items.find(i => i.item_id === itemId)
      if (itemAlloc) total += itemAlloc.quantity
    })
    return total
  }
  
  // Check if item is overstocked
  const isOverstocked = (itemId: string): boolean => {
    const item = itemsMap.get(itemId)
    if (!item) return false
    return getTotalForItem(itemId) > (item.quantity_in_stock ?? 0)
  }
  
  // Copy quantities for an item across all rooms
  const handleCopy = (itemId: string) => {
    const quantities: Record<string, number> = {}
    selectedRoomIds.forEach(roomId => {
      quantities[roomId] = getQuantity(roomId, itemId)
    })
    setCopiedQuantities(quantities)
    toast.success('Đã sao chép số lượng')
  }
  
  // Paste copied quantities to an item
  const handlePaste = (itemId: string) => {
    if (!copiedQuantities) return
    selectedRoomIds.forEach(roomId => {
      const qty = copiedQuantities[roomId] ?? 0
      onQuantityChange(roomId, itemId, qty)
    })
    toast.success('Đã dán số lượng')
  }
  
  if (selectedRooms.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground bg-muted/20">
        <p>Vui lòng chọn phòng trước</p>
      </div>
    )
  }
  
  if (allocatedItemIds.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground bg-muted/20">
        <p>Chưa có sản phẩm nào được chọn</p>
        <p className="text-xs mt-1">Thêm sản phẩm từ danh sách bên trên</p>
      </div>
    )
  }
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <ScrollArea className="w-full">
        <div className="min-w-max">
          {/* Header */}
          <div className="flex bg-muted/50 border-b">
            <div className="w-[200px] shrink-0 px-3 py-2 font-medium text-sm border-r">
              Sản phẩm
            </div>
            {selectedRooms.map(room => (
              <div key={room.id} className="w-[100px] shrink-0 px-2 py-2 text-center font-medium text-sm border-r">
                <div>{room.room_number}</div>
                <div className="text-xs text-muted-foreground">Tầng {room.floor}</div>
              </div>
            ))}
            <div className="w-[80px] shrink-0 px-2 py-2 text-center font-medium text-sm border-r">
              Tổng
            </div>
            <div className="w-[140px] shrink-0 px-2 py-2 text-center font-medium text-sm">
              Thao tác
            </div>
          </div>
          
          {/* Rows */}
          {allocatedItemIds.map(itemId => {
            const item = itemsMap.get(itemId)
            if (!item) return null
            
            const total = getTotalForItem(itemId)
            const stock = item.quantity_in_stock ?? 0
            const overstock = isOverstocked(itemId)
            
            return (
              <div key={itemId} className="flex border-b last:border-b-0 hover:bg-muted/30">
                {/* Item info */}
                <div className="w-[200px] shrink-0 px-3 py-2 border-r">
                  <div className="font-medium text-sm truncate">{item.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      Tồn: {stock}
                    </Badge>
                    {overstock && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Vượt
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Quantity inputs for each room */}
                {selectedRooms.map(room => {
                  const qty = getQuantity(room.id, itemId)
                  return (
                    <div key={room.id} className="w-[100px] shrink-0 px-2 py-2 border-r flex items-center justify-center">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => onQuantityChange(room.id, itemId, Math.max(0, qty - 1))}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          min={0}
                          value={qty}
                          onChange={e => onQuantityChange(room.id, itemId, parseInt(e.target.value) || 0)}
                          className="w-12 h-7 text-center text-sm p-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => onQuantityChange(room.id, itemId, qty + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
                
                {/* Total */}
                <div className="w-[80px] shrink-0 px-2 py-2 border-r flex items-center justify-center">
                  <Badge variant={overstock ? 'destructive' : 'secondary'}>
                    {total}
                  </Badge>
                </div>
                
                {/* Actions */}
                <div className="w-[140px] shrink-0 px-2 py-2 flex items-center justify-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleCopy(itemId)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sao chép số lượng</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handlePaste(itemId)}
                        disabled={!copiedQuantities}
                      >
                        <ClipboardPaste className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Dán số lượng</TooltipContent>
                  </Tooltip>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Tất cả"
                    className="w-12 h-7 text-xs p-1"
                    onBlur={e => {
                      const val = parseInt(e.target.value)
                      if (!isNaN(val) && val >= 0) {
                        onSetQuantityForAll(itemId, val)
                        e.target.value = ''
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const val = parseInt((e.target as HTMLInputElement).value)
                        if (!isNaN(val) && val >= 0) {
                          onSetQuantityForAll(itemId, val)
                          ;(e.target as HTMLInputElement).value = ''
                        }
                      }
                    }}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => onRemoveItem(itemId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Xóa sản phẩm</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
