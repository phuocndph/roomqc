import { useState } from 'react'
import { Search, Plus, Minus, X, Package, AlertTriangle, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import type { DistributionFormReturn } from '../hooks/useDistributionForm'

interface ItemAllocatorProps {
  form: DistributionFormReturn
  compact?: boolean
}

export function ItemAllocator({ form, compact = false }: ItemAllocatorProps) {
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set())
  const [itemSearchTerms, setItemSearchTerms] = useState<Record<string, string>>({})
  const [isAutoFilling, setIsAutoFilling] = useState(false)
  const [autoFillingRooms, setAutoFillingRooms] = useState<Set<string>>(new Set())
  const { toast } = useToast()
  
  const {
    selectedRooms,
    getRoomAllocation,
    getItemInfo,
    updateItemQuantity,
    getAvailableItemsForRoom,
    getTotalForItem,
    stockValidation,
    summary,
    includeDiscontinued,
    setIncludeDiscontinued,
    autoFillMissingItems,
    autoFillMissingItemsForRoom,
  } = form

  const toggleRoom = (roomId: string) => {
    setExpandedRooms(prev => {
      const next = new Set(prev)
      if (next.has(roomId)) {
        next.delete(roomId)
      } else {
        next.add(roomId)
      }
      return next
    })
  }

  const getSearchTerm = (roomId: string) => itemSearchTerms[roomId] || ''
  
  const setSearchTerm = (roomId: string, value: string) => {
    setItemSearchTerms(prev => ({ ...prev, [roomId]: value }))
  }

  const addItemToRoom = (roomId: string, itemId: string) => {
    updateItemQuantity(roomId, itemId, 1)
    setSearchTerm(roomId, '')
  }

  // Check if item is over stock
  const isOverStock = (itemId: string) => {
    const item = getItemInfo(itemId)
    if (!item) return false
    return getTotalForItem(itemId) > (item.quantity_in_stock || 0)
  }

  const handleAutoFill = async () => {
    setIsAutoFilling(true)
    try {
      const result = await autoFillMissingItems()
      toast({
        title: result.success ? 'Hoàn tất' : 'Lỗi',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      })
    } finally {
      setIsAutoFilling(false)
    }
  }

  const handleAutoFillRoom = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setAutoFillingRooms(prev => new Set(prev).add(roomId))
    
    try {
      const result = await autoFillMissingItemsForRoom(roomId)
      toast({
        title: result.success ? 'OK' : 'Lỗi',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      })
      
      // Auto expand room to show results
      if (result.count && result.count > 0) {
        setExpandedRooms(prev => new Set(prev).add(roomId))
      }
    } finally {
      setAutoFillingRooms(prev => {
        const next = new Set(prev)
        next.delete(roomId)
        return next
      })
    }
  }

  if (selectedRooms.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Vui lòng chọn phòng trước</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Auto-fill button - prominent */}
      <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Wand2 className="h-4 w-4 text-primary" />
              Tự động phân bổ theo tiêu chuẩn
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tính số lượng thiếu cho mỗi phòng dựa trên tiêu chuẩn đã thiết lập, có kiểm tra tồn kho
            </p>
          </div>
          <Button
            type="button"
            onClick={handleAutoFill}
            disabled={isAutoFilling}
            size="sm"
            className="gap-1.5 shrink-0"
          >
            <Wand2 className="h-3.5 w-3.5" />
            {isAutoFilling ? 'Đang xử lý...' : 'Phân bổ'}
          </Button>
        </div>
      </div>

      {/* Stock validation warning */}
      {!stockValidation.isValid && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">Vượt quá tồn kho:</span>
            <ul className="mt-1 list-disc list-inside text-sm">
              {stockValidation.overStockItems.map(item => (
                <li key={item.itemId}>
                  {item.itemName}: yêu cầu {item.requested}, khả dụng {item.available}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Room list with collapsible items */}
      <div className="space-y-2">
        {selectedRooms.map(room => {
          const roomAlloc = getRoomAllocation(room.id)
          const allocatedItems = roomAlloc.items.filter(i => i.quantity > 0)
          const isExpanded = expandedRooms.has(room.id)
          const totalItems = allocatedItems.reduce((sum, i) => sum + i.quantity, 0)
          const searchTerm = getSearchTerm(room.id)
          const availableItems = getAvailableItemsForRoom(room.id, searchTerm)

          return (
            <Card key={room.id} className={cn(compact && 'border-0 shadow-none')}>
              <Collapsible open={isExpanded} onOpenChange={() => toggleRoom(room.id)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <span>Phòng {room.room_number}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          Tầng {room.floor}
                        </span>
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs gap-1"
                          onClick={(e) => handleAutoFillRoom(room.id, e)}
                          disabled={autoFillingRooms.has(room.id)}
                        >
                          <Wand2 className="h-3 w-3" />
                          {autoFillingRooms.has(room.id) ? '...' : 'Tự động'}
                        </Button>
                        {totalItems > 0 && (
                          <Badge variant="secondary">{totalItems} SP</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {isExpanded ? '−' : '+'}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-3">
                    {/* Allocated items */}
                    {allocatedItems.length > 0 ? (
                      <div className="space-y-2">
                        {allocatedItems.map(({ item_id, quantity }) => {
                          const item = getItemInfo(item_id)
                          
                          // Fallback render khi item không tìm thấy trong kho hotel hiện tại
                          if (!item) {
                            return (
                              <div 
                                key={item_id} 
                                className="flex items-center justify-between gap-2 p-2 border rounded border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                    SP không thuộc kho khách sạn hiện tại
                                  </p>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    ID: {item_id.slice(0, 8)}...
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    updateItemQuantity(room.id, item_id, 0)
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )
                          }
                          
                          const overStock = isOverStock(item_id)
                          
                          return (
                            <div 
                              key={item_id} 
                              className={cn(
                                "flex items-center justify-between gap-2 p-2 border rounded",
                                overStock && "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{item.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Tồn: {item.quantity_in_stock || 0}
                                  {overStock && (
                                    <span className="text-red-500 ml-2">
                                      (Thiếu {getTotalForItem(item_id) - (item.quantity_in_stock || 0)})
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    updateItemQuantity(room.id, item_id, quantity - 1)
                                  }}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number"
                                  value={quantity}
                                  onChange={(e) => updateItemQuantity(room.id, item_id, parseInt(e.target.value) || 0)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-14 h-7 text-center"
                                  min={0}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    updateItemQuantity(room.id, item_id, quantity + 1)
                                  }}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    updateItemQuantity(room.id, item_id, 0)
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-3">
                        Chưa có sản phẩm
                      </p>
                    )}

                    {/* Add item inline search */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Nhập tên hoặc mã sản phẩm..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(room.id, e.target.value)}
                            className="pl-8 h-8 text-sm"
                          />
                          {searchTerm && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                              onClick={() => setSearchTerm(room.id, '')}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Checkbox
                            id={`discontinued-${room.id}`}
                            checked={includeDiscontinued}
                            onCheckedChange={(checked) => setIncludeDiscontinued(!!checked)}
                            className="h-3.5 w-3.5"
                          />
                          <Label
                            htmlFor={`discontinued-${room.id}`}
                            className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
                          >
                            SP ngừng
                          </Label>
                        </div>
                      </div>
                      
                      {searchTerm && availableItems.length > 0 && (
                        <div className="border rounded-md divide-y max-h-[140px] overflow-y-auto">
                          {availableItems.slice(0, 8).map(item => (
                            <button
                              key={item.id}
                              type="button"
                              className="w-full flex items-center justify-between gap-2 p-2 text-left hover:bg-muted/50 transition-colors"
                              onClick={() => addItemToRoom(room.id, item.id)}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium truncate">{item.name}</p>
                                  {item.status === 'discontinued' && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-600 border-amber-300">
                                      Ngừng
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {item.code} • Tồn: {item.quantity_in_stock || 0}
                                </p>
                              </div>
                              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {searchTerm && availableItems.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          Không tìm thấy "{searchTerm}"
                        </p>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )
        })}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
        <span>{summary.roomCount} phòng</span>
        <span>{summary.totalItems} sản phẩm</span>
      </div>
    </div>
  )
}
