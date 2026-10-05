import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { useRoom } from '@/hooks/useRooms'
import { useRoomCheckLeanConfig } from '@/hooks/useRoomCheckLeanConfig'

const RouterFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
    <span className="text-sm">Đang mở phòng…</span>
  </div>
)

const RoomCheckPage = lazy(() =>
  import('@/pages/rooms/RoomCheckPage').then((m) => ({
    default: m.RoomCheckPage,
  })),
)

/**
 * Lean rollout router cho /rooms/:id/check.
 *
 * Quyết định route thực:
 * - Nếu URL có tín hiệu wizard-only (replenish, delivery, distribution_order_id,
 *   inspection, room_order_id) → giữ nguyên wizard cũ.
 * - Còn lại → redirect sang /check-lean theo per-hotel flag
 *   `settings.room_check.use_lean` (mặc định true ở giai đoạn này).
 *
 * Mọi query string được giữ nguyên qua redirect.
 */
export default function RoomCheckRouter() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()

  const { data: roomData, isLoading } = useRoom(id)
  const hotelId = roomData?.room?.hotel_id ?? null
  const { data: leanCfg, isLoading: cfgLoading } = useRoomCheckLeanConfig(hotelId)

  // Đợi room + cfg trước khi quyết định để tránh flash redirect sai
  if (isLoading || (hotelId && cfgLoading)) {
    return <RouterFallback />
  }

  const checkType = params.get('type') || ''
  const hasInspection = !!params.get('inspection')
  // Opt-in/opt-out Lean
  const optInLean = params.get('lean') === '1'
  const optOutLean = params.get('lean') === '0'

  // Per-hotel flag — default ON
  const useLean = (leanCfg as any)?.use_lean ?? true

  // Lean replenish: redirect sang /check-replenish khi flag bật (mặc định ON)
  if (checkType === 'replenish' && useLean && !optOutLean) {
    const qs = new URLSearchParams(params)
    qs.delete('type')
    qs.delete('lean')
    const tail = qs.toString()
    return (
      <Navigate
        to={`/rooms/${id}/check-replenish${tail ? `?${tail}` : ''}`}
        replace
      />
    )
  }

  // Lean delivery: redirect sang /check-delivery khi flag bật
  if (checkType === 'delivery' && useLean && !optOutLean) {
    const qs = new URLSearchParams(params)
    qs.delete('type')
    qs.delete('lean')
    const tail = qs.toString()
    return (
      <Navigate
        to={`/rooms/${id}/check-delivery${tail ? `?${tail}` : ''}`}
        replace
      />
    )
  }

  // Legacy: checkout-inspection + bất kỳ ?type=delivery/replenish nào còn lại
  // (opt-out hoặc flag tắt) → wizard cũ.
  if (
    checkType === 'delivery' ||
    checkType === 'replenish' ||
    hasInspection ||
    !!params.get('distribution_order_id') ||
    !!params.get('room_order_id')
  ) {
    return (
      <Suspense fallback={<RouterFallback />}>
        <RoomCheckPage />
      </Suspense>
    )
  }

  // Tránh "unused" cảnh báo cho optInLean (giữ cho compatibility ngoài luồng)
  void optInLean

  if (!useLean) {
    return (
      <Suspense fallback={<RouterFallback />}>
        <RoomCheckPage />
      </Suspense>
    )
  }

  // Redirect sang Lean, giữ nguyên query
  const qs = params.toString()
  return (
    <Navigate
      to={`/rooms/${id}/check-lean${qs ? `?${qs}` : ''}`}
      replace
    />
  )
}
