import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Loader2, Minus, Plus, PackagePlus, AlertCircle, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { navigateBack } from '@/lib/navigation'
import { useRoom } from '@/hooks/useRooms'
import { useRoomSupplements, useCreateRoomSupplement, type SupplementItem } from '@/hooks/useRoomSupplements'
import { useSubmitReplenishLean } from '@/hooks/useSubmitReplenishLean'
import { LeanContextCard } from '@/components/rooms/lean/LeanContextCard'
import { toast } from 'sonner'

/**
 * Lean Replenish — 1 page, mobile-first.
 *
 * Lưu ý kiến trúc (đã xác nhận với RPC + trigger):
 *  - `createRoomSupplement` (legacy): xuất kho thật (stock_transactions) + cập nhật
 *    `room_items.current_quantity` + tạo `distribution_order` nội bộ nếu cần.
 *  - `submitReplenishLean` (RPC mới): chỉ ghi `room_checks` + fan-out
 *    `room_check_issues` (bucket `missing_replace`) để có audit + đóng task.
 *  - Trigger `trg_room_check_issues_outbox_fanout` KHÔNG xử bucket `missing_replace`
 *    (chỉ xử laundry/lost/damaged/consumed/replaced) → KHÔNG có double-bookkeeping.
 *
 * Flow:
 *  1. Hiển thị "Đồ thiếu" (prefill = missing, clamp theo kho)
 *  2. Hiển thị consumables (mặc định 0)
 *  3. Yêu cầu dọn dẹp + ghi chú
 *  4. Submit: createRoomSupplement → submitReplenishLean
 *
 * URL params:
 *  - ?task_id={id}     — task housekeeping (amenity_request) sẽ tự đóng
 *  - ?returnTo={path}  — chỉ accept path nội bộ '/...' (whitelist), mặc định /my-tasks
 */
export default function RoomReplenishLeanPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const taskId = params.get('task_id')
  // Whitelist returnTo: chỉ chấp nhận path nội bộ bắt đầu bằng '/' và không phải '//'
  const rawReturnTo = params.get('returnTo')
  const returnTo =
    rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
      ? rawReturnTo
      : '/my-tasks'

  const { data: roomData, isLoading: roomLoading } = useRoom(id)
  const room = roomData?.room
  const { data: supplements, isLoading: supplementsLoading } = useRoomSupplements(id)
  const createSupplement = useCreateRoomSupplement()
  const submitLean = useSubmitReplenishLean()

  // qty selections: itemId -> quantity to bring
  const [qty, setQty] = useState<Record<string, number>>({})
  const [cleaning, setCleaning] = useState(false)
  const [notes, setNotes] = useState('')

  // Prefill missing items qty
  useEffect(() => {
    if (!supplements) return
    setQty((prev) => {
      const next = { ...prev }
      for (const it of supplements.missing_items) {
        if (next[it.item_id] === undefined) {
          next[it.item_id] = Math.min(it.missing_quantity, it.quantity_in_stock)
        }
      }
      for (const it of supplements.consumable_items) {
        if (next[it.item_id] === undefined) next[it.item_id] = 0
      }
      return next
    })
  }, [supplements])

  const allItems = useMemo<SupplementItem[]>(
    () => [...(supplements?.missing_items ?? []), ...(supplements?.consumable_items ?? [])],
    [supplements],
  )

  const itemById = useMemo(() => {
    const m: Record<string, SupplementItem> = {}
    for (const it of allItems) m[it.item_id] = it
    return m
  }, [allItems])

  const totalQty = Object.values(qty).reduce((s, v) => s + (v > 0 ? v : 0), 0)
  const isSubmitting = createSupplement.isPending || submitLean.isPending

  const setOne = (itemId: string, value: number) => {
    const it = itemById[itemId]
    if (!it) return
    const safe = Number.isFinite(value) ? value : 0
    const clamped = Math.max(0, Math.min(safe, it.quantity_in_stock))
    setQty((prev) => ({ ...prev, [itemId]: clamped }))
  }

  /** Bổ sung đủ theo gợi ý cho mọi món thiếu (clamp theo kho) */
  const handleFillSuggested = () => {
    if (!supplements) return
    setQty((prev) => {
      const next = { ...prev }
      for (const it of supplements.missing_items) {
        next[it.item_id] = Math.min(it.missing_quantity, it.quantity_in_stock)
      }
      return next
    })
  }

  const handleBack = () => {
    navigateBack(navigate, returnTo || '/rooms')
  }

  const handleSubmit = async () => {
    if (!id || !room) return
    const selected = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([itemId, q]) => ({ itemId, qty: q }))

    if (selected.length === 0 && !cleaning) {
      toast.error('Chưa chọn món nào để bổ sung và chưa yêu cầu dọn dẹp.')
      return
    }

    try {
      // 1) Stock outbound + room_items update (skip nếu không có món nào)
      if (selected.length > 0) {
        await createSupplement.mutateAsync({
          room_id: id,
          room_number: room.room_number,
          items: selected.map((s) => ({
            item_id: s.itemId,
            quantity: s.qty,
            unit_price: itemById[s.itemId]?.unit_price ?? 0,
          })),
          notes: notes || undefined,
        })
      }

      // 2) Lean RPC: room_check + issues fan-out + đóng task + audit
      await submitLean.mutateAsync({
        roomId: id,
        items: selected.map((s) => {
          const it = itemById[s.itemId]
          return {
            item_id: s.itemId,
            item_name: it?.item_name ?? 'Item',
            bucket: 'missing_replace' as const,
            ui_action: 'replenish',
            qty: s.qty,
          }
        }),
        cleaningRequested: cleaning,
        notes: notes || null,
        taskId: taskId || null,
      })

      navigate(returnTo, { replace: true })
    } catch {
      /* toast handled in hooks */
    }
  }

  if (roomLoading || supplementsLoading) {
    return (
      <div className="mx-auto max-w-2xl p-4 space-y-3">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!room) {
    return <div className="p-6 text-center text-muted-foreground">Không tìm thấy phòng.</div>
  }

  const missing = supplements?.missing_items ?? []
  const consumables = supplements?.consumable_items ?? []

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="mx-auto max-w-2xl flex items-center gap-2 p-3">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleBack} aria-label="Quay lại">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-primary" />
              <h1 className="text-base font-semibold truncate">
                Bổ sung đồ — Phòng {room.room_number}
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">
              {missing.length} món thiếu · {consumables.length} món có thể thêm
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <LeanContextCard roomId={id!} />

        {/* Missing items */}
        {missing.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-red-600">Đồ thiếu cần bổ sung</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleFillSuggested}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Bổ sung đủ theo gợi ý
              </Button>
            </div>
            {missing.some((it) => it.quantity_in_stock <= 0) && (
              <div className="flex items-start gap-2 p-3 border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/40 rounded-lg">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Một số món đã hết trong kho. Vui lòng tạo yêu cầu nhập kho hoặc liên hệ quản lý.
                </p>
              </div>
            )}
            <div className="border rounded-lg divide-y">
              {missing.map((it) => (
                <ItemRow
                  key={it.item_id}
                  item={it}
                  value={qty[it.item_id] ?? 0}
                  onChange={(v) => setOne(it.item_id, v)}
                  highlight
                />
              ))}
            </div>
          </section>
        )}


        {/* Consumables */}
        {consumables.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Bổ sung thêm (consumables)
            </h2>
            <div className="border rounded-lg divide-y">
              {consumables.map((it) => (
                <ItemRow
                  key={it.item_id}
                  item={it}
                  value={qty[it.item_id] ?? 0}
                  onChange={(v) => setOne(it.item_id, v)}
                />
              ))}
            </div>
          </section>
        )}

        {missing.length === 0 && consumables.length === 0 && (
          <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
            Phòng đã đủ đồ theo định mức. Bạn vẫn có thể yêu cầu dọn dẹp bên dưới.
          </div>
        )}

        <Separator />

        {/* Cleaning + notes */}
        <section className="space-y-3">
          <div className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <Label className="text-sm">Yêu cầu dọn dẹp thêm</Label>
              <p className="text-xs text-muted-foreground">Báo cho ca dọn phòng kế tiếp.</p>
            </div>
            <Switch checked={cleaning} onCheckedChange={setCleaning} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes" className="text-sm">
              Ghi chú (tuỳ chọn)
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="VD: khách yêu cầu thêm 1 gối ôm..."
              rows={3}
            />
          </div>
        </section>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur z-10">
        <div className="mx-auto max-w-2xl p-3 flex items-center gap-3">
          <div className="flex-1 text-sm">
            <span className="font-semibold">{totalQty}</span>
            <span className="text-muted-foreground"> món sẽ bổ sung</span>
            {cleaning && (
              <span className="ml-2 text-amber-600 text-xs">+ yêu cầu dọn</span>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || (totalQty === 0 && !cleaning)}
            className="h-11 px-6"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Xác nhận bổ sung
          </Button>
        </div>
      </div>
    </div>
  )
}

interface ItemRowProps {
  item: SupplementItem
  value: number
  onChange: (v: number) => void
  highlight?: boolean
}

function ItemRow({ item, value, onChange, highlight }: ItemRowProps) {
  const outOfStock = item.quantity_in_stock <= 0
  const max = item.quantity_in_stock

  return (
    <div className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{item.item_name}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{item.item_code}</span>
          {' · '}
          <span className={cn(highlight && 'text-red-600 font-medium')}>
            Hiện {item.current_quantity}/{item.standard_quantity}
          </span>
          {' · '}
          <span className={cn(outOfStock ? 'text-red-600' : 'text-muted-foreground')}>
            Kho: {item.quantity_in_stock}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={() => onChange(value - 1)}
          disabled={value <= 0}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value || '0', 10)
            onChange(Number.isFinite(n) ? n : 0)
          }}
          className="h-11 w-16 text-center px-1"
          min={0}
          max={max}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
