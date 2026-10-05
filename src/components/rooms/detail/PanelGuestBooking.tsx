import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Plus, UserRound } from 'lucide-react'
import { format, isValid } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { useRoomBooking } from '@/hooks/useRoomBooking'
import { RoomBookingDialog } from '@/components/rooms/RoomBookingDialog'
import { formatCurrency } from '@/lib/utils'

interface Props {
  roomId: string
  hotelId: string
  tenantId: string
  roomNumber: string
}

function bookingDate(value: string, time?: string | null) {
  const date = new Date(value)
  if (!isValid(date)) return 'Chưa xác định'
  return `${format(date, 'dd/MM/yyyy')} · ${time?.slice(0, 5) || format(date, 'HH:mm')}`
}

export function PanelGuestBooking({ roomId, hotelId, tenantId, roomNumber }: Props) {
  const { data: booking, isLoading } = useRoomBooking(roomId)
  const [showCreate, setShowCreate] = useState(false)
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <section aria-label="Thông tin khách" className="space-y-3 py-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </section>
    )
  }

  if (!booking) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-4 border-b py-5" aria-label="Thông tin khách">
        <div className="flex items-center gap-3">
          <UserRound className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <h2 className="text-base font-semibold">Chưa có khách</h2>
            <p className="mt-1 text-sm text-muted-foreground">Không có đặt phòng hiện tại.</p>
          </div>
        </div>
        <PermissionGate module="bookings" action="create">
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />Tạo đặt phòng
          </Button>
          {showCreate && (
            <RoomBookingDialog
              open={showCreate}
              onOpenChange={setShowCreate}
              roomId={roomId}
              roomNumber={roomNumber}
              hotelId={hotelId}
              tenantId={tenantId}
            />
          )}
        </PermissionGate>
      </section>
    )
  }

  const debt = Math.max(0, (booking.total_amount ?? 0) - (booking.amount_paid ?? 0) - (booking.deposit_amount ?? 0))
  const guestLabel = booking.status === 'checked_in' ? 'Khách đang ở' : 'Đặt phòng sắp tới'
  const statusLabels: Record<string, string> = {
    checked_in: 'Đang ở',
    confirmed: 'Đã xác nhận',
    pending: 'Chờ xác nhận',
    checked_out: 'Đã trả phòng',
  }

  return (
    <section className="space-y-4 border-b py-5" aria-label="Thông tin khách">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm text-muted-foreground">{guestLabel}</h2>
          <p className="mt-1 break-words text-lg font-semibold">{booking.guest_name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusLabels[booking.status] || booking.status}
            {booking.guest_phone && ` · ${booking.guest_phone}`}
            {booking.guest_count > 1 && ` · ${booking.guest_count} khách`}
          </p>
        </div>
        <PermissionGate module="bookings" action="view">
          <Button variant="outline" size="sm" onClick={() => navigate(`/bookings/${booking.id}`)}>
            Xem đặt phòng<ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </PermissionGate>
      </div>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Nhận phòng</dt>
          <dd className="mt-1 text-sm font-medium">{bookingDate(booking.check_in_date, booking.expected_check_in_time)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Dự kiến trả phòng</dt>
          <dd className="mt-1 text-sm font-medium">{bookingDate(booking.check_out_date, booking.expected_check_out_time)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Còn phải thu</dt>
          <dd className={`mt-1 text-sm font-semibold ${debt > 0 ? 'text-destructive' : ''}`}>
            {formatCurrency(debt)}
          </dd>
        </div>
      </dl>
    </section>
  )
}
