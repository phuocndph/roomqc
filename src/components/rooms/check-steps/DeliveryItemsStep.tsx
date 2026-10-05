import { useState, useEffect } from 'react'
import { UseFormReturn } from 'react-hook-form'
import { CheckCircle2, Package, Plus, RefreshCw, AlertCircle, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { supabase } from '@/integrations/supabase/client'
import type { RoomCheckFormData, ReplacedItem, LaundryItem } from '@/types/rooms.types'
import { cn } from '@/lib/utils'

interface DeliveryItemsStepProps {
  distributionOrderId: string
  roomOrderId: string
  form: UseFormReturn<RoomCheckFormData>
  roomId: string
  hotelId: string
  tenantId: string
}

interface DeliveredItem {
  id: string
  item_id: string
  item_name: string
  item_code?: string
  quantity: number
  quantity_confirmed?: number
  status: 'confirmed' | 'partial' | 'missing'
}

type ItemAction = 'ok' | 'add' | 'change'

export function DeliveryItemsStep({ 
  distributionOrderId, 
  roomOrderId, 
  form,
  roomId,
  hotelId,
  tenantId,
}: DeliveryItemsStepProps) {
  // Track action for each item
  const [itemActions, setItemActions] = useState<Record<string, ItemAction>>({})
  const [addedItems, setAddedItems] = useState<Record<string, number>>({}) // item_id -> extra qty
  const [changedItems, setChangedItems] = useState<Record<string, number>>({}) // item_id -> changed qty

  // Fetch delivered items from distribution order
  const { data: deliveredItems, isLoading } = useQuery({
    queryKey: ['delivery-items', roomOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distribution_order_items')
        .select(`
          id,
          item_id,
          quantity,
          quantity_confirmed,
          status,
          items:item_id (
            id,
            name,
            code
          )
        `)
        .eq('distribution_order_room_id', roomOrderId)

      if (error) throw error

      return (data || []).map(item => ({
        id: item.id,
        item_id: item.item_id,
        item_name: (item.items as any)?.name || 'Unknown',
        item_code: (item.items as any)?.code,
        quantity: item.quantity,
        quantity_confirmed: item.quantity_confirmed,
        status: item.status as 'confirmed' | 'partial' | 'missing',
      }))
    },
    enabled: !!roomOrderId,
  })

  // Initialize default actions to 'ok'
  useEffect(() => {
    if (deliveredItems && Object.keys(itemActions).length === 0) {
      const defaults: Record<string, ItemAction> = {}
      deliveredItems.forEach(item => {
        defaults[item.item_id] = 'ok'
      })
      setItemActions(defaults)
    }
  }, [deliveredItems, itemActions])

  // Sync to form when actions change
  useEffect(() => {
    if (!deliveredItems) return

    const replaced: ReplacedItem[] = []
    const laundry: LaundryItem[] = []

    deliveredItems.forEach(item => {
      const action = itemActions[item.item_id]
      
      if (action === 'add') {
        const addQty = addedItems[item.item_id] || 1
        replaced.push({
          item_id: item.item_id,
          item_name: item.item_name,
          item_code: item.item_code,
          quantity: addQty,
          from_stock: true,
        })
      } else if (action === 'change') {
        const changeQty = changedItems[item.item_id] || 1
        // Đổi = gửi đồ cũ đi giặt + thay đồ mới
        laundry.push({
          item_id: item.item_id,
          item_name: item.item_name,
          item_code: item.item_code,
          quantity: changeQty,
          notes: 'Đổi đồ khi giao hàng',
        })
        replaced.push({
          item_id: item.item_id,
          item_name: item.item_name,
          item_code: item.item_code,
          quantity: changeQty,
          from_stock: true,
        })
      }
    })

    form.setValue('items_replaced', replaced)
    form.setValue('items_sent_to_laundry', laundry)
  }, [itemActions, addedItems, changedItems, deliveredItems, form])

  const setAction = (itemId: string, action: ItemAction) => {
    setItemActions(prev => ({ ...prev, [itemId]: action }))
    // Reset quantities when changing action
    if (action === 'ok') {
      setAddedItems(prev => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
      setChangedItems(prev => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
    }
  }

  const updateAddedQty = (itemId: string, delta: number) => {
    setAddedItems(prev => {
      const current = prev[itemId] || 1
      const next = Math.max(1, current + delta)
      return { ...prev, [itemId]: next }
    })
  }

  const updateChangedQty = (itemId: string, delta: number) => {
    setChangedItems(prev => {
      const current = prev[itemId] || 1
      const next = Math.max(1, current + delta)
      return { ...prev, [itemId]: next }
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!deliveredItems || deliveredItems.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Không có dữ liệu</AlertTitle>
        <AlertDescription>
          Không tìm thấy danh sách đồ giao cho phòng này.
        </AlertDescription>
      </Alert>
    )
  }

  const allConfirmed = Object.values(itemActions).every(a => a === 'ok')

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-cyan-600" />
          <span className="font-medium">Đồ đã giao</span>
          <Badge variant="outline">{deliveredItems.length} sản phẩm</Badge>
        </div>
        {allConfirmed && (
          <Badge className="bg-green-100 text-green-700 border-green-300">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Đã xác nhận đủ
          </Badge>
        )}
      </div>

      {/* Items list */}
      <div className="border rounded-lg divide-y">
        {deliveredItems.map(item => {
          const action = itemActions[item.item_id] || 'ok'
          const addQty = addedItems[item.item_id] || 1
          const changeQty = changedItems[item.item_id] || 1

          return (
            <div key={item.id} className="p-3 space-y-2">
              {/* Item info */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{item.item_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.item_code && <span className="font-mono">{item.item_code}</span>}
                    <span className="mx-1">•</span>
                    SL: {item.quantity}
                  </p>
                </div>
                {action === 'ok' && (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={action === 'ok' ? 'default' : 'outline'}
                  className={cn('h-8 text-xs', action === 'ok' && 'bg-green-600 hover:bg-green-700')}
                  onClick={() => setAction(item.item_id, 'ok')}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  OK
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={action === 'add' ? 'default' : 'outline'}
                  className="h-8 text-xs"
                  onClick={() => setAction(item.item_id, 'add')}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Thêm
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={action === 'change' ? 'default' : 'outline'}
                  className="h-8 text-xs"
                  onClick={() => setAction(item.item_id, 'change')}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Đổi
                </Button>
              </div>

              {/* Quantity adjustment for add/change */}
              {action === 'add' && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-muted/50 rounded">
                  <span className="text-xs text-muted-foreground">Số lượng thêm:</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() => updateAddedQty(item.item_id, -1)}
                    >
                      -
                    </Button>
                    <span className="w-8 text-center font-medium">{addQty}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() => updateAddedQty(item.item_id, 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>
              )}

              {action === 'change' && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-muted/50 rounded">
                  <span className="text-xs text-muted-foreground">Số lượng đổi:</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() => updateChangedQty(item.item_id, -1)}
                    >
                      -
                    </Button>
                    <span className="w-8 text-center font-medium">{changeQty}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() => updateChangedQty(item.item_id, 1)}
                    >
                      +
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground ml-2">
                    (Đồ cũ sẽ gửi giặt)
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Help text */}
      <p className="text-xs text-muted-foreground">
        <strong>OK:</strong> Đồ giao đủ • <strong>Thêm:</strong> Bổ sung thêm từ kho • <strong>Đổi:</strong> Thay đồ cũ bằng đồ mới (đồ cũ gửi giặt)
      </p>
    </div>
  )
}
