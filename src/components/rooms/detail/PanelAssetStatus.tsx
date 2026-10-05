import { AlertCircle, ArrowRight, CheckCircle2, PackagePlus, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { useRoomDistributionHistory } from '@/hooks/useRoomDistributionHistory'
import type { RoomItemWithDetails } from '@/types/rooms.types'

interface Props {
  roomId: string
  items: RoomItemWithDetails[]
  onViewItems: () => void
  onRequestSupplement: () => void
  onViewDelivery: () => void
}

export function PanelAssetStatus({ roomId, items, onViewItems, onRequestSupplement, onViewDelivery }: Props) {
  const standardItems = items.filter((item) => item.has_standard)
  const missingItems = standardItems.filter((item) => item.missing_quantity > 0)
  const missingQuantity = missingItems.reduce((sum, item) => sum + item.missing_quantity, 0)
  const { data: deliveries, isLoading: deliveriesLoading, isError: deliveriesError } = useRoomDistributionHistory(roomId)
  const pendingDelivery = deliveries?.filter((delivery) => delivery.room_status === 'pending' || delivery.room_status === 'delivered').length || 0

  return (
    <section className="border-b py-5" aria-labelledby="room-attention-title">
      <h2 id="room-attention-title" className="text-base font-semibold">Đồ dùng & giao nhận</h2>
      <div className="mt-2 divide-y">
        {standardItems.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-sm">Chưa thiết lập tiêu chuẩn đồ dùng</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onViewItems}>Xem đồ dùng<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        ) : missingItems.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium">Thiếu {missingItems.length} loại đồ dùng</p>
                <p className="mt-1 text-sm text-muted-foreground">Cần bổ sung {missingQuantity} món theo tiêu chuẩn.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onViewItems}>Xem danh sách<ArrowRight className="ml-2 h-4 w-4" /></Button>
              <PermissionGate module="rooms" action="update">
                <Button variant="outline" size="sm" onClick={onRequestSupplement}><PackagePlus className="mr-2 h-4 w-4" />Bổ sung đồ</Button>
              </PermissionGate>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            <p className="text-sm">Đủ số lượng đồ dùng theo tiêu chuẩn</p>
          </div>
        )}
        {pendingDelivery > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <Truck className="h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-sm">{pendingDelivery} đơn giao đồ cần xử lý</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onViewDelivery}>Xem giao nhận<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        )}
        {(deliveriesLoading || deliveriesError) && (
          <p className="py-3 text-sm text-muted-foreground">
            {deliveriesError ? 'Chưa tải được tình trạng giao nhận.' : 'Đang tải tình trạng giao nhận…'}
          </p>
        )}
      </div>
    </section>
  )
}
