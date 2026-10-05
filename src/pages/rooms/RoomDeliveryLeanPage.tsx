import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Loader2, Minus, Plus, PackageCheck, AlertCircle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useRoom } from '@/hooks/useRooms'
import { navigateBack } from '@/lib/navigation'
import { usePendingDeliveriesForRoom, type PendingDeliveryItem } from '@/hooks/usePendingDeliveries'
import { useSubmitDeliveryLean } from '@/hooks/useSubmitDeliveryLean'
import { LeanContextCard } from '@/components/rooms/lean/LeanContextCard'
import { toast } from 'sonner'

/**
 * Lean Delivery — 1 màn hình mobile-first thay thế DeliveryConfirmationModal cũ.
 *
 * URL params (giữ tương thích với entry cũ từ /distribution UI):
 *  - room_order_id | distribution_order_room_id  — bắt buộc
 *  - task_id        — task delivery_confirmation sẽ tự đóng
 *  - returnTo       — điều hướng sau khi xong (mặc định /my-tasks)
 *
 * Flow:
 *  - Hiển thị danh sách items của phiếu giao (mặc định nhận đủ số lượng)
 *  - Stepper +/− để giảm nếu nhận thiếu (clamp 0..ordered)
 *  - 1-tap "Nhận đủ tất cả" → bỏ qua items_actual (RPC forward sang
 *    confirm_delivery_from_room_check)
 *  - Submit: useSubmitDeliveryLean (atomic: room_check + confirm + đóng task + audit)
 */
export default function RoomDeliveryLeanPage() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const dorRoomId =
    params.get('distribution_order_room_id') || params.get('room_order_id') || ''
  const taskId = params.get('task_id')
  const rawReturnTo = params.get('returnTo')
  const returnTo =
    rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
      ? rawReturnTo
      : '/my-tasks'

  const { data: roomData, isLoading: roomLoading } = useRoom(id)
  const room = roomData?.room
  const { data: deliveries, isLoading: dlvLoading } = usePendingDeliveriesForRoom(id)
  const submitLean = useSubmitDeliveryLean()

  const delivery = useMemo(
    () => deliveries?.find((d) => d.room_order_id === dorRoomId),
    [deliveries, dorRoomId],
  )

  // qty actual selections: distribution_order_items.id -> qty
  const [qty, setQty] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [fullMode, setFullMode] = useState(true) // default: nhận đủ

  // Prefill = quantity (full)
  useEffect(() => {
    if (!delivery) return
    setQty((prev) => {
      const next = { ...prev }
      for (const it of delivery.items) {
        if (next[it.id] === undefined) next[it.id] = it.quantity
      }
      return next
    })
  }, [delivery])

  const itemById = useMemo(() => {
    const m: Record<string, PendingDeliveryItem> = {}
    for (const it of delivery?.items ?? []) m[it.id] = it
    return m
  }, [delivery])

  const totalActual = Object.values(qty).reduce((s, v) => s + (v > 0 ? v : 0), 0)
  const totalOrdered = (delivery?.items ?? []).reduce((s, it) => s + it.quantity, 0)
  const hasShortage = !fullMode && totalActual < totalOrdered

  const setOne = (itemId: string, value: number) => {
    const it = itemById[itemId]
    if (!it) return
    const safe = Number.isFinite(value) ? value : 0
    const clamped = Math.max(0, Math.min(safe, it.quantity))
    setQty((prev) => ({ ...prev, [itemId]: clamped }))
    if (clamped !== it.quantity) setFullMode(false)
  }

  const handleFullToggle = () => {
    if (!delivery) return
    setFullMode(true)
    const next: Record<string, number> = {}
    for (const it of delivery.items) next[it.id] = it.quantity
    setQty(next)
  }

  const handleBack = () => {
    navigateBack(navigate, returnTo || '/rooms')
  }

  const handleSubmit = async () => {
    if (!id || !dorRoomId || !delivery) return

    try {
      await submitLean.mutateAsync({
        roomId: id,
        distributionOrderRoomId: dorRoomId,
        itemsActual: fullMode
          ? undefined
          : delivery.items.map((it) => ({
              item_id: it.id,
              quantity_actual: qty[it.id] ?? 0,
              notes: null,
            })),
        notes: notes || null,
        taskId: taskId || null,
      })
      navigate(returnTo, { replace: true })
    } catch {
      /* toast handled in hook */
    }
  }

  if (roomLoading || dlvLoading) {
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

  if (!dorRoomId) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Thiếu mã phiếu giao (room_order_id).
      </div>
    )
  }

  if (!delivery) {
    return (
      <div className="mx-auto max-w-2xl p-6 space-y-4 text-center">
        <PackageCheck className="h-10 w-10 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Phiếu giao này đã được xử lý hoặc không còn ở trạng thái chờ.
        </p>
        <Button variant="outline" onClick={() => navigate(returnTo, { replace: true })}>
          Quay lại
        </Button>
      </div>
    )
  }

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
              <PackageCheck className="h-4 w-4 text-primary" />
              <h1 className="text-base font-semibold truncate">
                Nhận hàng — Phòng {room.room_number}
              </h1>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Phiếu {delivery.order_code} · Đợt {delivery.batch_number}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <LeanContextCard roomId={id!} />

        {/* Full receive shortcut */}
        <button
          type="button"
          onClick={handleFullToggle}
          className={
            'w-full border rounded-lg p-3 flex items-center justify-between transition ' +
            (fullMode
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-input hover:bg-muted')
          }
        >
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">Nhận đủ tất cả ({totalOrdered} món)</span>
          </div>
          {fullMode && <span className="text-xs">đã chọn</span>}
        </button>

        {/* Items */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Danh sách hàng</h2>
          <div className="border rounded-lg divide-y">
            {delivery.items.map((it) => (
              <ItemRow
                key={it.id}
                item={it}
                value={qty[it.id] ?? it.quantity}
                onChange={(v) => setOne(it.id, v)}
                short={!fullMode && (qty[it.id] ?? it.quantity) < it.quantity}
              />
            ))}
          </div>
        </section>

        {hasShortage && (
          <div className="flex items-start gap-2 p-3 border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/40 rounded-lg">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Bạn đang báo nhận thiếu. Vui lòng ghi rõ lý do bên dưới để quản lý kho xử lý.
            </p>
          </div>
        )}

        <Separator />

        <div className="space-y-1">
          <Label htmlFor="notes" className="text-sm">
            Ghi chú {hasShortage && <span className="text-red-600">*</span>}
          </Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              hasShortage
                ? 'VD: Thiếu 2 khăn tắm, kho cần bổ sung...'
                : 'Tuỳ chọn'
            }
            rows={3}
          />
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur z-10">
        <div className="mx-auto max-w-2xl p-3 flex items-center gap-3">
          <div className="flex-1 text-sm">
            <span className="font-semibold">{totalActual}</span>
            <span className="text-muted-foreground">/{totalOrdered} món</span>
            {hasShortage && (
              <span className="ml-2 text-amber-600 text-xs">báo thiếu</span>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={
              submitLean.isPending ||
              totalActual === 0 ||
              (hasShortage && !notes.trim())
            }
            className="h-11 px-6"
          >
            {submitLean.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Xác nhận nhận hàng
          </Button>
        </div>
      </div>
    </div>
  )
}

interface ItemRowProps {
  item: PendingDeliveryItem
  value: number
  onChange: (v: number) => void
  short?: boolean
}

function ItemRow({ item, value, onChange, short }: ItemRowProps) {
  const diff = item.quantity - value
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{item.item_name}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">{item.item_code}</span>
          {' · '}
          <span>Đặt {item.quantity}</span>
          {' · '}
          <span className={short ? 'text-amber-600 font-medium' : 'text-green-600 font-medium'}>
            Nhận {value}
          </span>
          {short && diff > 0 && (
            <>
              {' · '}
              <span className="text-red-600 font-medium">Thiếu {diff}</span>
            </>
          )}
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
          max={item.quantity}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11"
          onClick={() => onChange(value + 1)}
          disabled={value >= item.quantity}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
