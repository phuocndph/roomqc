import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

interface BookingMetadataCardProps {
  bookingId: string
  bookingReference?: string | null
  bookingSource?: string | null
  bookingType?: string | null
  createdAt?: string | null
  createdByName?: string | null
}

const sourceLabel: Record<string, string> = {
  walk_in: 'Khách vãng lai',
  walkin: 'Khách vãng lai',
  direct: 'Trực tiếp',
  phone: 'Điện thoại',
  website: 'Website',
  booking_com: 'Booking.com',
  agoda: 'Agoda',
  expedia: 'Expedia',
  airbnb: 'Airbnb',
  traveloka: 'Traveloka',
  ota: 'OTA khác',
}

const typeLabel: Record<string, string> = {
  daily: 'Theo ngày',
  hourly: 'Theo giờ',
  monthly: 'Theo tháng',
}

export function BookingMetadataCard({
  bookingId,
  bookingReference,
  bookingSource,
  bookingType,
  createdAt,
  createdByName,
}: BookingMetadataCardProps) {
  const shortId = bookingId?.slice(0, 8).toUpperCase()

  const rows: { label: string; value: string }[] = [
    { label: 'Mã booking', value: bookingReference || `BK-${shortId}` },
    { label: 'Loại đặt phòng', value: typeLabel[bookingType || 'daily'] || 'Theo ngày' },
    { label: 'Nguồn đặt phòng', value: sourceLabel[bookingSource || 'walk_in'] || (bookingSource ?? 'Khách vãng lai') },
  ]
  if (createdAt) {
    rows.push({
      label: 'Thời gian tạo',
      value: format(new Date(createdAt), 'HH:mm dd/MM/yyyy', { locale: vi }),
    })
  }
  if (createdByName) {
    rows.push({ label: 'Người tạo', value: createdByName })
  }

  return (
    <div className="rounded-lg border">
      <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Thông tin đặt phòng
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={r.label === 'Mã booking' ? 'font-mono text-xs' : ''}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
