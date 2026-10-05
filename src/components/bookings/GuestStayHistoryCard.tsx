import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Skeleton } from '@/components/ui/skeleton'
import { useGuestStayHistory } from '@/hooks/useGuestStayHistory'
import { formatCurrency } from '@/lib/utils'

interface GuestStayHistoryCardProps {
  bookingId: string
  guestPhone?: string | null
  guestIdNumber?: string | null
}

const statusLabel: Record<string, { text: string; className: string }> = {
  checked_out: { text: 'Đã trả', className: 'text-muted-foreground' },
  checked_in: { text: 'Đang ở', className: 'text-green-600' },
  confirmed: { text: 'Đã đặt', className: 'text-blue-600' },
  cancelled: { text: 'Đã hủy', className: 'text-red-600' },
  no_show: { text: 'Không đến', className: 'text-red-600' },
}

export function GuestStayHistoryCard({ bookingId, guestPhone, guestIdNumber }: GuestStayHistoryCardProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGuestStayHistory(bookingId, guestPhone, guestIdNumber)

  if (!guestPhone && !guestIdNumber) return null

  return (
    <div className="rounded-lg border">
      <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-between">
        <span>Lịch sử lưu trú</span>
        {data && data.length > 0 && (
          <span className="text-xs normal-case tracking-normal text-foreground">{data.length} lần</span>
        )}
      </div>
      <div className="divide-y divide-border">
        {isLoading ? (
          <div className="p-3 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Khách lưu trú lần đầu
          </p>
        ) : (
          data.slice(0, 5).map((stay) => {
            const status = statusLabel[stay.status] || { text: stay.status, className: '' }
            return (
              <button
                key={stay.id}
                type="button"
                onClick={() => navigate(`/bookings/${stay.id}`)}
                className="w-full grid grid-cols-12 gap-2 px-3 py-2 text-sm items-center hover:bg-muted/40 text-left"
              >
                <span className="col-span-4 text-xs">
                  {format(new Date(stay.check_in_date), 'dd/MM/yy', { locale: vi })}
                  {' → '}
                  {format(new Date(stay.check_out_date), 'dd/MM/yy', { locale: vi })}
                </span>
                <span className="col-span-2 text-xs">P{stay.room_number || '—'}</span>
                <span className={`col-span-3 text-xs ${status.className}`}>{status.text}</span>
                <span className="col-span-3 text-right font-mono text-xs">
                  {formatCurrency(stay.total_amount || 0)}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
