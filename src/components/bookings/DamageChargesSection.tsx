import { useState } from 'react'
import { AlertTriangle, X, RotateCcw, Edit2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { DamageChargeItem } from '@/lib/bookingCalculations'

interface DamageChargesSectionProps {
  damageItems: DamageChargeItem[]
  onAdjustCharge: (itemId: string, newCharge: number) => void
  onWaiveItem: (itemId: string) => void
  onResetItem: (itemId: string) => void
  originalItems: DamageChargeItem[]
}

export function DamageChargesSection({
  damageItems,
  onAdjustCharge,
  onWaiveItem,
  onResetItem,
  originalItems,
}: DamageChargesSectionProps) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  const lostItems = damageItems.filter(item => item.item_type === 'lost')
  const damagedItems = damageItems.filter(item => item.item_type === 'damaged')
  const consumedItems = damageItems.filter(item => item.item_type === 'consumed')

  const totalDamageCharge = damageItems.reduce(
    (sum, item) => sum + item.charge_amount * item.quantity,
    0
  )

  const getOriginalCharge = (itemId: string) => {
    const original = originalItems.find(i => i.item_id === itemId)
    return original ? original.charge_amount : 0
  }

  const isAdjusted = (itemId: string) => {
    const current = damageItems.find(i => i.item_id === itemId)
    const original = originalItems.find(i => i.item_id === itemId)
    return current && original && current.charge_amount !== original.charge_amount
  }

  const handleStartEdit = (item: DamageChargeItem) => {
    setEditingItemId(item.item_id)
    setEditValue(item.charge_amount.toString())
  }

  const handleConfirmEdit = (itemId: string) => {
    const newCharge = parseInt(editValue.replace(/[^0-9]/g, '')) || 0
    onAdjustCharge(itemId, newCharge)
    setEditingItemId(null)
  }

  const handleCancelEdit = () => {
    setEditingItemId(null)
  }

  if (damageItems.length === 0) {
    return null
  }

  const renderItem = (item: DamageChargeItem) => {
    const adjusted = isAdjusted(item.item_id)
    const originalCharge = getOriginalCharge(item.item_id)
    const isEditing = editingItemId === item.item_id

    return (
      <div
        key={item.item_id}
        className={cn(
          'flex items-center justify-between py-2 text-sm',
          adjusted && 'bg-amber-50/50 -mx-2 px-2 rounded'
        )}
      >
        <div className="flex-1">
          <span className="font-medium">{item.item_name}</span>
          {item.quantity > 1 && (
            <span className="text-muted-foreground"> (x{item.quantity})</span>
          )}
          {item.damage_type && (
            <span className="text-xs text-muted-foreground ml-2">
              ({item.damage_type === 'repairable' ? 'Sửa chữa' : 'Thay thế'})
            </span>
          )}
          {adjusted && (
            <div className="text-xs text-amber-600">
              Gốc: {formatCurrency(originalCharge * item.quantity)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <Input
                type="text"
                inputMode="numeric"
                className="w-24 h-7 text-right font-mono text-xs"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmEdit(item.item_id)
                  if (e.key === 'Escape') handleCancelEdit()
                }}
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => handleConfirmEdit(item.item_id)}
              >
                ✓
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleCancelEdit}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <>
              <span className={cn('font-mono text-sm', adjusted && 'text-amber-600')}>
                {formatCurrency(item.charge_amount * item.quantity)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => handleStartEdit(item)}
              >
                <Edit2 className="h-3 w-3" />
              </Button>
              {item.charge_amount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                  onClick={() => onWaiveItem(item.item_id)}
                  title="Miễn phí"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
              {adjusted && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => onResetItem(item.item_id)}
                  title="Khôi phục"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 p-3 border border-amber-200 rounded-lg bg-amber-50/30">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
        <AlertTriangle className="h-4 w-4" />
        PHÍ PHỤ THU (Hỏng/Mất/Đã dùng)
      </div>

      {lostItems.length > 0 && (
        <div>
          <div className="text-xs text-red-600 font-medium mb-1">
            Đồ mất ({lostItems.length})
          </div>
          {lostItems.map(renderItem)}
        </div>
      )}

      {damagedItems.length > 0 && (
        <div className={lostItems.length > 0 ? 'mt-2' : ''}>
          <div className="text-xs text-orange-600 font-medium mb-1">
            Đồ hỏng ({damagedItems.length})
          </div>
          {damagedItems.map(renderItem)}
        </div>
      )}

      {consumedItems.length > 0 && (
        <div className={(lostItems.length > 0 || damagedItems.length > 0) ? 'mt-2' : ''}>
          <div className="text-xs text-blue-600 font-medium mb-1">
            Đồ đã dùng ({consumedItems.length})
          </div>
          {consumedItems.map(renderItem)}
        </div>
      )}

      <Separator className="my-2" />

      <div className="flex justify-between font-medium">
        <span className="text-amber-700">Tổng phí phụ thu</span>
        <span className="text-amber-700 font-mono">{formatCurrency(totalDamageCharge)}</span>
      </div>
    </div>
  )
}
