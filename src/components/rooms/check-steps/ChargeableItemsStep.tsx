import { useState, useEffect } from 'react'
import { Wallet, Plus, Minus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useChargeableItems, CreateChargeableConsumptionInput } from '@/hooks/useChargeableConsumptions'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ChargeableItem {
  id: string
  code: string
  name: string
  unit_price: number
  charge_price: number | null
  item_type: string
  quantity_in_stock: number
}

interface SelectedItem {
  item: ChargeableItem
  quantity: number
}

interface ChargeableItemsStepProps {
  hotelId: string
  bookingId: string
  roomId: string
  onItemsChange: (items: CreateChargeableConsumptionInput[]) => void
  notes?: string
  onNotesChange?: (notes: string) => void
}

export function ChargeableItemsStep({
  hotelId,
  bookingId,
  roomId,
  onItemsChange,
  notes = '',
  onNotesChange,
}: ChargeableItemsStepProps) {
  const { data: items, isLoading } = useChargeableItems(hotelId)
  const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map())

  // Convert selected items to input format for parent
  useEffect(() => {
    if (!items) return

    const inputs: CreateChargeableConsumptionInput[] = []
    selectedItems.forEach((quantity, itemId) => {
      if (quantity > 0) {
        const item = items.find(i => i.id === itemId)
        if (item) {
          inputs.push({
            booking_id: bookingId,
            room_id: roomId,
            item_id: item.id,
            item_code: item.code,
            item_name: item.name,
            quantity,
            unit_price: item.charge_price ?? item.unit_price,
          })
        }
      }
    })
    onItemsChange(inputs)
  }, [selectedItems, items, bookingId, roomId, onItemsChange])

  const handleQuantityChange = (itemId: string, delta: number) => {
    setSelectedItems(prev => {
      const newMap = new Map(prev)
      const currentQty = newMap.get(itemId) || 0
      const item = items?.find(i => i.id === itemId)
      const maxQty = item?.quantity_in_stock || 99
      const newQty = Math.max(0, Math.min(maxQty, currentQty + delta))
      
      if (newQty === 0) {
        newMap.delete(itemId)
      } else {
        newMap.set(itemId, newQty)
      }
      return newMap
    })
  }

  const handleSetQuantity = (itemId: string, quantity: number) => {
    setSelectedItems(prev => {
      const newMap = new Map(prev)
      const item = items?.find(i => i.id === itemId)
      const maxQty = item?.quantity_in_stock || 99
      const newQty = Math.max(0, Math.min(maxQty, quantity))
      
      if (newQty === 0) {
        newMap.delete(itemId)
      } else {
        newMap.set(itemId, newQty)
      }
      return newMap
    })
  }

  // Calculate total
  const totalAmount = items?.reduce((sum, item) => {
    const qty = selectedItems.get(item.id) || 0
    const price = item.charge_price ?? item.unit_price
    return sum + (qty * price)
  }, 0) || 0

  const totalItems = Array.from(selectedItems.values()).reduce((sum, qty) => sum + qty, 0)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Không có đồ dùng tính phí nào được thiết lập
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Vào Quản lý sản phẩm → Đánh dấu "Có tính phí" cho minibar, đồ uống...
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-amber-600" />
          <h3 className="font-semibold text-amber-700">Đồ dùng tính phí khách</h3>
        </div>
        {totalAmount > 0 && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            {totalItems} sản phẩm • {formatCurrency(totalAmount)}
          </Badge>
        )}
      </div>

      {/* Items Grid */}
      <div className="grid gap-2">
        {items.map(item => {
          const quantity = selectedItems.get(item.id) || 0
          const price = item.charge_price ?? item.unit_price
          const isSelected = quantity > 0
          
          return (
            <div
              key={item.id}
              className={cn(
                "border rounded-lg p-3 transition-colors",
                isSelected ? "border-amber-300 bg-amber-50" : "border-border hover:border-muted-foreground/30"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                {/* Item Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    {item.quantity_in_stock <= 5 && (
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs shrink-0",
                          item.quantity_in_stock === 0 && "border-red-300 text-red-600",
                          item.quantity_in_stock > 0 && item.quantity_in_stock <= 5 && "border-amber-300 text-amber-600"
                        )}
                      >
                        {item.quantity_in_stock === 0 ? 'Hết hàng' : `Còn ${item.quantity_in_stock}`}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.code} • {formatCurrency(price)}
                  </p>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleQuantityChange(item.id, -1)}
                    disabled={quantity === 0}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => handleSetQuantity(item.id, parseInt(e.target.value) || 0)}
                    className={cn(
                      "w-12 h-8 text-center text-sm px-1",
                      quantity > 0 && quantity >= item.quantity_in_stock && "border-amber-400"
                    )}
                    min={0}
                    max={item.quantity_in_stock}
                  />
                  
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleQuantityChange(item.id, 1)}
                    disabled={quantity >= item.quantity_in_stock}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {/* Item Total */}
                {isSelected && (
                  <div className="text-right min-w-[80px]">
                    <p className="font-semibold text-amber-700">
                      {formatCurrency(quantity * price)}
                    </p>
                  </div>
                )}
              </div>
              
              {/* Low stock warning */}
              {isSelected && quantity >= item.quantity_in_stock && item.quantity_in_stock > 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  ⚠️ Đã chọn tối đa số lượng tồn kho ({item.quantity_in_stock})
                </p>
              )}
              {item.quantity_in_stock === 0 && (
                <p className="text-xs text-red-600 mt-2">
                  ⚠️ Hết hàng trong kho - Không thể ghi nhận
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Notes */}
      {onNotesChange && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Ghi chú (tùy chọn)
          </label>
          <Textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Ghi chú về đồ dùng tính phí..."
            rows={2}
            className="resize-none text-sm"
          />
        </div>
      )}

      {/* Summary */}
      {totalAmount > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">
                  Tổng phụ thu:
                </span>
              </div>
              <span className="text-xl font-bold text-amber-700">
                {formatCurrency(totalAmount)}
              </span>
            </div>
            <p className="text-xs text-amber-600 mt-1">
              Số tiền này sẽ được thêm vào hóa đơn checkout
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
