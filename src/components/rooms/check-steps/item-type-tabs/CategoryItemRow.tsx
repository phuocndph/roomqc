import { useState } from 'react'
import { Minus, Plus, AlertTriangle, Check, Loader2, WashingMachine, RefreshCw, PlusCircle, Ban, Wrench, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import type { RoomItemWithDetails, ConsumedItem, DamagedItem, LostItem, LaundryItem } from '@/types/rooms.types'
import type { ItemType } from '@/types/items.types'

export type ItemAction = 
  | { type: 'ok' }
  | { type: 'laundry'; quantity: number }
  | { type: 'add'; quantity: number }
  | { type: 'change'; quantity: number }
  | { type: 'lost'; quantity: number; estimatedValue?: number; notes?: string }
  | { type: 'damaged'; damageType: 'repairable' | 'replacement_needed'; damageCost: number; notes?: string }
  | { type: 'missing'; quantity: number }
  | { type: 'consumed'; quantity: number; needRefill: boolean }

export interface CategoryItemRowProps {
  item: RoomItemWithDetails & { 
    item_type?: ItemType
    category_name?: string | null
    item_thumbnail?: string | null
  }
  itemType: ItemType
  status: 'pending' | 'ok' | 'laundry' | 'add' | 'change' | 'lost' | 'damaged' | 'missing' | 'consumed'
  statusLabel?: string
  statusColor?: string
  availableStock?: number
  unitPrice?: number
  allowedActions: string[]
  onAction: (action: ItemAction) => void
  onReset: () => void
  onUpdateQuantity?: (newQuantity: number) => void
  isSaving?: boolean
  // Additional info for displaying after action
  consumedInfo?: ConsumedItem | null
  damagedInfo?: DamagedItem | null
  lostInfo?: LostItem | null
  laundryInfo?: LaundryItem | null
}

const STATUS_CONFIG = {
  ok: { label: 'OK', color: 'text-green-600', bg: 'bg-green-500' },
  laundry: { label: 'Giặt', color: 'text-blue-600', bg: 'bg-blue-500' },
  add: { label: 'Thêm', color: 'text-green-600', bg: 'bg-green-500' },
  change: { label: 'Đổi', color: 'text-primary', bg: 'bg-primary' },
  lost: { label: 'Mất', color: 'text-destructive', bg: 'bg-destructive' },
  damaged: { label: 'Hỏng', color: 'text-amber-600', bg: 'bg-amber-500' },
  missing: { label: 'Thiếu', color: 'text-yellow-600', bg: 'bg-yellow-500' },
  consumed: { label: 'Hết', color: 'text-cyan-600', bg: 'bg-cyan-500' },
  pending: { label: '', color: '', bg: '' },
}

// Action button configs với icon
const ACTION_CONFIG: Record<string, { icon: typeof WashingMachine; label: string; color: string }> = {
  laundry: { icon: WashingMachine, label: 'Giặt', color: 'text-blue-600 hover:bg-blue-50 active:bg-blue-100' },
  change: { icon: RefreshCw, label: 'Đổi', color: 'text-primary hover:bg-primary/10 active:bg-primary/20' },
  add: { icon: PlusCircle, label: 'Thêm', color: 'text-green-600 hover:bg-green-50 active:bg-green-100' },
  lost: { icon: Ban, label: 'Mất', color: 'text-destructive hover:bg-destructive/10 active:bg-destructive/20' },
  damaged: { icon: Wrench, label: 'Hỏng', color: 'text-amber-600 hover:bg-amber-50 active:bg-amber-100' },
  consumed: { icon: Package, label: 'Hết', color: 'text-cyan-600 hover:bg-cyan-50 active:bg-cyan-100' },
  missing: { icon: Package, label: 'Thiếu', color: 'text-amber-600 hover:bg-amber-50 active:bg-amber-100' },
}

export function CategoryItemRow({
  item,
  itemType,
  status,
  statusLabel,
  statusColor,
  availableStock = 0,
  unitPrice = 0,
  allowedActions,
  onAction,
  onReset,
  isSaving = false,
  onUpdateQuantity,
  consumedInfo,
  damagedInfo,
  lostInfo,
  laundryInfo,
}: CategoryItemRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [pendingType, setPendingType] = useState<'lost' | 'damaged' | 'consumed' | null>(null)
  // Quantity hiển thị trong stepper inline. Khởi tạo theo info đã có (resume) hoặc 1.
  const initialQty =
    laundryInfo?.quantity ??
    consumedInfo?.quantity ??
    lostInfo?.quantity ??
    damagedInfo?.quantity ??
    1
  const [quantity, setQuantity] = useState(initialQty)
  const [actionNotes, setActionNotes] = useState('')
  const [needRefill, setNeedRefill] = useState(true)
  const [consumedQty, setConsumedQty] = useState(1)

  const isPending = status === 'pending'
  const isOk = status === 'ok'
  const statusInfo = STATUS_CONFIG[status] || STATUS_CONFIG.pending

  const isOutOfStock = availableStock === 0
  const isLowStock = availableStock > 0 && availableStock <= 5

  const handleMarkOk = () => {
    onAction({ type: 'ok' })
    setExpanded(false)
  }

  const handleQuickAction = (actionType: string) => {
    switch (actionType) {
      case 'laundry':
        onAction({ type: 'laundry', quantity: 1 })
        setQuantity(1)
        break
      case 'add':
        onAction({ type: 'add', quantity: 1 })
        setQuantity(1)
        break
      case 'change':
        onAction({ type: 'change', quantity: 1 })
        setQuantity(1)
        break
      case 'missing':
        onAction({ type: 'missing', quantity: 1 })
        setQuantity(1)
        break
      case 'consumed':
        // Quick: mặc định 1 cái, cần bổ sung. Cô có thể chỉnh stepper inline sau.
        onAction({ type: 'consumed', quantity: 1, needRefill: true })
        setQuantity(1)
        break
      case 'lost':
        // Quick: mặc định 1 cái mất, không hỏi chi phí.
        onAction({ type: 'lost', quantity: 1, estimatedValue: 0 })
        setQuantity(1)
        break
      case 'damaged':
        // Quick: mặc định 1 cái hỏng, cần thay.
        onAction({ type: 'damaged', damageType: 'replacement_needed', damageCost: 0 })
        setQuantity(1)
        break
    }
  }

  const handleConfirmConsumed = () => {
    onAction({ type: 'consumed', quantity: consumedQty, needRefill })
    setPendingType(null)
    setExpanded(false)
  }

  const handleConfirmLostDamaged = () => {
    if (pendingType === 'lost') {
      // Mất = mặc định bổ sung + báo cáo. Không hỏi chi phí.
      onAction({ type: 'lost', quantity: 1, estimatedValue: 0, notes: actionNotes || undefined })
    } else if (pendingType === 'damaged') {
      // Hỏng = cần thay. Không phân biệt sửa/thay, không hỏi chi phí.
      onAction({ type: 'damaged', damageType: 'replacement_needed', damageCost: 0, notes: actionNotes || undefined })
    }
    setPendingType(null)
    setExpanded(false)
    setActionNotes('')
  }

  const handleQuantityChange = (newQty: number) => {
    const qty = Math.max(1, Math.min(newQty, (item.standard_quantity || 1) * 2))
    setQuantity(qty)
  }

  const handleReset = () => {
    onReset()
    setExpanded(false)
    setPendingType(null)
    setQuantity(item.standard_quantity || 1)
    setConsumedQty(1)
    setNeedRefill(true)
  }

  // Build actions: giao điểm của (action hợp lệ cho itemType) × (allowedActions từ config) × (thứ tự ưu tiên)
  const getActionsForItemType = (): string[] => {
    const ITEM_TYPE_ALLOWED_ACTIONS: Record<ItemType, string[]> = {
      linen:      ['laundry', 'change', 'add', 'missing', 'damaged', 'lost'],
      consumable: ['consumed', 'empty', 'missing', 'lost'],
      equipment:  ['damaged', 'missing', 'lost'],
      furniture:  ['damaged', 'missing', 'lost'],
    }
    const PRIORITY_ORDER = ['missing', 'damaged', 'empty', 'consumed', 'lost', 'laundry', 'change', 'add']

    const allowedForType = ITEM_TYPE_ALLOWED_ACTIONS[itemType] || []
    let result = PRIORITY_ORDER.filter(
      (a) => allowedForType.includes(a) && allowedActions.includes(a)
    )

    // Gộp empty → consumed (cùng drawer, cùng nghiệp vụ "cần bổ sung")
    // Nếu config chỉ cho 'empty' (không có 'consumed') thì hiển thị nút "Hết" nhưng route qua flow consumed
    if (result.includes('empty') && !result.includes('consumed')) {
      result = result.map((a) => (a === 'empty' ? 'consumed' : a))
    } else if (result.includes('empty') && result.includes('consumed')) {
      // tránh trùng nút
      result = result.filter((a) => a !== 'empty')
    }

    return result
  }

  const itemActions = getActionsForItemType()
  const needsStockCheck = ['add', 'change'].includes(status)
  const isOverStock = needsStockCheck && quantity > availableStock
  const needsQuantity = ['laundry', 'add', 'change'].includes(status)
  const standardQuantity = item.standard_quantity || 1

  // Render inline info after action is taken
  const renderStatusInfo = () => {
    // Consumed item info
    if (status === 'consumed' && consumedInfo) {
      return (
        <div className="px-3 pb-2 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-cyan-600 font-medium">Hết {consumedInfo.quantity}</span>
            <span>•</span>
            <span>{consumedInfo.need_refill ? 'Cần bổ sung' : 'Không bổ sung'}</span>
          </div>
          {consumedInfo.need_refill && isOutOfStock && (
            <Alert variant="destructive" className="py-1.5 px-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              <AlertDescription className="text-xs">
                Hết hàng trong kho! Không thể bổ sung ngay.
              </AlertDescription>
            </Alert>
          )}
          {consumedInfo.need_refill && isLowStock && (
            <Alert className="py-1.5 px-2 border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <AlertDescription className="text-xs text-amber-700">
                Tồn kho thấp: còn {availableStock}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )
    }

    // Damaged item info
    if (status === 'damaged' && damagedInfo) {
      return (
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          <span className="text-amber-600 font-medium">Cần thay</span>
          {damagedInfo.notes && (
            <p className="mt-0.5 text-muted-foreground/80 italic">"{damagedInfo.notes}"</p>
          )}
        </div>
      )
    }

    // Lost item info
    if (status === 'lost' && lostInfo) {
      return (
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          <span className="text-destructive font-medium">Mất — cần bổ sung</span>
          {lostInfo.notes && (
            <p className="mt-0.5 text-muted-foreground/80 italic">"{lostInfo.notes}"</p>
          )}
        </div>
      )
    }

    // Laundry with quantity
    if (status === 'laundry' && laundryInfo) {
      return (
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          <span className="text-blue-600 font-medium">Giặt ×{laundryInfo.quantity}</span>
        </div>
      )
    }

    return null
  }

    return (
    <>
    <div>
      {/* Main Row */}
      <div
        className={cn(
          "flex items-center gap-2 min-h-[3rem] px-3 transition-colors touch-manipulation",
          isPending && "cursor-pointer hover:bg-muted/50 active:bg-muted",
        )}
      >
        {/* Status circle */}
        <button aria-label="Xác nhận"
          type="button"
          onClick={isPending ? handleMarkOk : undefined}
          disabled={!isPending}
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all border",
            isPending && "border-dashed border-muted-foreground/40 active:scale-95",
            isOk && "bg-green-600 border-green-600",
            !isPending && !isOk && "bg-muted-foreground border-muted-foreground",
          )}
        >
          {isOk && <Check className="h-3.5 w-3.5 text-white" />}
          {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {!isPending && !isOk && <Check className="h-3 w-3 text-white" />}
        </button>

        {/* Item info */}
        <div className="flex items-center gap-2 flex-1 min-w-0" onClick={isPending ? handleMarkOk : undefined}>
          <span className="text-sm font-medium truncate">{item.item_name}</span>
          {standardQuantity > 1 && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              ×{standardQuantity}
            </span>
          )}
        </div>

        {/* Actions or Status display */}
        {isPending ? (
          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
            {itemActions.length === 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs text-green-600 border-green-300 hover:bg-green-50"
                onClick={(e) => {
                  e.stopPropagation()
                  handleMarkOk()
                }}
              >
                OK
              </Button>
            )}
            {itemActions.map((actionType) => {
              const config = ACTION_CONFIG[actionType]
              if (!config) return null
              
              return (
                <Button
                  key={actionType}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 px-2 text-xs",
                    config.color
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleQuickAction(actionType)
                  }}
                >
                  {config.label}
                </Button>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={cn("text-xs font-medium", statusColor || statusInfo.color)}>
              {statusLabel || statusInfo.label}
            </span>
            {/* Stepper inline cho mọi action có quantity (ngoại trừ ok) */}
            {!isOk && onUpdateQuantity && (
              <div className="flex items-center gap-0.5 border rounded-md bg-background">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={quantity <= 1}
                  onClick={(e) => {
                    e.stopPropagation()
                    const newQty = Math.max(1, quantity - 1)
                    setQuantity(newQty)
                    onUpdateQuantity(newQty)
                  }}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="text-xs font-semibold tabular-nums w-6 text-center">
                  {quantity}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={quantity >= standardQuantity}
                  onClick={(e) => {
                    e.stopPropagation()
                    const newQty = Math.min(standardQuantity, quantity + 1)
                    setQuantity(newQty)
                    onUpdateQuantity(newQty)
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums">
              /{standardQuantity}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                handleReset()
              }}
            >
              <span className="text-sm">✕</span>
            </Button>
          </div>
        )}
      </div>

      {/* Inline Status Info - After action taken */}
      {!isPending && renderStatusInfo()}

      {/* Consumed Form - Bottom Drawer */}
      <Drawer open={expanded && pendingType === 'consumed'} onOpenChange={(open) => { if (!open) { setPendingType(null); setExpanded(false) } }}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{item.item_name} — Đánh dấu hết</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs text-muted-foreground">Tiêu chuẩn: {standardQuantity}</p>

            {/* Quantity selector */}
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">Số lượng hết:</Label>
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setConsumedQty(Math.max(1, consumedQty - 1))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Input type="number" min={1} max={standardQuantity} value={consumedQty} onChange={(e) => setConsumedQty(Math.max(1, Math.min(parseInt(e.target.value) || 1, standardQuantity)))} className="w-14 h-8 text-center text-sm font-medium" />
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setConsumedQty(Math.min(standardQuantity, consumedQty + 1))}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">/ {standardQuantity}</span>
            </div>

            {/* Need refill switch */}
            <div className="flex items-center gap-2">
              <Switch checked={needRefill} onCheckedChange={setNeedRefill} />
              <Label className="text-sm">Cần bổ sung từ kho</Label>
            </div>

            {/* Stock warnings */}
            {needRefill && isOutOfStock && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">Hết hàng trong kho! Không thể bổ sung ngay.</AlertDescription>
              </Alert>
            )}
            {needRefill && isLowStock && (
              <Alert className="py-2 border-amber-500/50 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-700">Tồn kho thấp: còn {availableStock}</AlertDescription>
              </Alert>
            )}
          </div>
          <DrawerFooter>
            <Button type="button" onClick={handleConfirmConsumed}>Xác nhận</Button>
            <Button type="button" variant="outline" onClick={() => { setPendingType(null); setExpanded(false) }}>Hủy</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Inline Quantity Adjuster - For laundry/add/change */}
      {expanded && needsQuantity && !pendingType && (
        <div className="px-2 pb-3 pt-1">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
            <span className="text-xs text-muted-foreground shrink-0">Số lượng:</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  const newQty = Math.max(1, quantity - 1)
                  handleQuantityChange(newQty)
                  if (status === 'laundry') onAction({ type: 'laundry', quantity: newQty })
                  else if (status === 'add') onAction({ type: 'add', quantity: newQty })
                  else if (status === 'change') onAction({ type: 'change', quantity: newQty })
                }}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number" min={0}
                value={quantity}
                onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                className={cn(
                  "w-14 h-8 text-center text-sm font-medium",
                  isOverStock && 'border-amber-500 bg-amber-50'
                )}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  const newQty = quantity + 1
                  handleQuantityChange(newQty)
                  if (status === 'laundry') onAction({ type: 'laundry', quantity: newQty })
                  else if (status === 'add') onAction({ type: 'add', quantity: newQty })
                  else if (status === 'change') onAction({ type: 'change', quantity: newQty })
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {needsStockCheck && (
              <span className={cn(
                "text-xs shrink-0",
                isOverStock ? 'text-amber-600 font-medium' : 'text-muted-foreground'
              )}>
                Kho: {availableStock}
              </span>
            )}
            
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 px-3 text-xs ml-auto"
              onClick={() => setExpanded(false)}
            >
              Xong
            </Button>
          </div>
          
          {isOverStock && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 mt-1.5 px-1">
              <AlertTriangle className="h-3 w-3" />
              <span>Kho chỉ còn {availableStock}, yêu cầu {quantity}</span>
            </div>
          )}
        </div>
      )}

    </div>

    {/* Bottom Drawer - Lost Form (đơn giản: chỉ ghi chú, mất = bổ sung + báo cáo) */}
    <Drawer open={expanded && pendingType === 'lost'} onOpenChange={(open) => { if (!open) { setPendingType(null); setExpanded(false) } }}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-base">Báo mất — {item.item_name}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 space-y-3">
          <Alert className="py-2 border-destructive/30 bg-destructive/5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-xs">
              Hệ thống sẽ tự gửi yêu cầu bổ sung cho kho và ghi nhận báo cáo mất.
            </AlertDescription>
          </Alert>
          <Textarea
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            placeholder="Ghi chú ngắn (tùy chọn)..."
            className="h-20 text-sm resize-none"
          />
        </div>
        <DrawerFooter>
          <Button
            type="button"
            variant="destructive"
            className="h-11 w-full"
            onClick={handleConfirmLostDamaged}
          >
            Báo mất — cần bổ sung
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => { setPendingType(null); setExpanded(false) }}
          >
            Hủy
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>

    {/* Bottom Drawer - Damaged Form (đơn giản: hỏng = cần thay, không hỏi chi phí) */}
    <Drawer open={expanded && pendingType === 'damaged'} onOpenChange={(open) => { if (!open) { setPendingType(null); setExpanded(false) } }}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-base">Báo hỏng — {item.item_name}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 space-y-3">
          <Alert className="py-2 border-amber-500/40 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-700">
              Hệ thống sẽ tự tạo phiếu bảo trì "cần thay" cho bộ phận bảo trì.
            </AlertDescription>
          </Alert>
          <Textarea
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            placeholder="Mô tả hư hỏng (tùy chọn)..."
            className="h-20 text-sm resize-none"
          />
        </div>
        <DrawerFooter>
          <Button
            type="button"
            className="h-11 w-full bg-amber-600 hover:bg-amber-700"
            onClick={handleConfirmLostDamaged}
          >
            Báo hỏng — cần thay
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => { setPendingType(null); setExpanded(false) }}
          >
            Hủy
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
    </>
  )
}
