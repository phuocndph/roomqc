import { useTranslation } from 'react-i18next'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCheckoutTime, type ActiveBooking } from '@/hooks/useActiveRoomBookings'

interface Props {
  booking: ActiveBooking
  minutesToCheckout: number | null
}

export function QuickViewBookingCard({ booking, minutesToCheckout }: Props) {
  const { t } = useTranslation(['rooms'])
  return (
    <div className="rounded-md border px-3 py-2 space-y-0.5">
      <div className="flex items-center gap-2">
        <LogOut className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">
          {t('grid.checkoutAt', { time: formatCheckoutTime(booking.expected_check_out_time) })}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="truncate">{booking.guest_name}</span>
      </div>
      {minutesToCheckout !== null && (
        <div
          className={cn(
            'text-xs pl-6',
            minutesToCheckout < 0
              ? 'text-red-600 font-medium'
              : minutesToCheckout <= 120
                ? 'text-orange-600'
                : 'text-muted-foreground',
          )}
        >
          {minutesToCheckout < 0
            ? t('grid.checkoutOverdue', { minutes: Math.abs(minutesToCheckout) })
            : minutesToCheckout <= 120
              ? t('grid.checkoutSoon')
              : `Còn ${Math.round(minutesToCheckout / 60)}h`}
        </div>
      )}
    </div>
  )
}
