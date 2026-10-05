import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useBookingPayments } from '@/hooks/useBookingPayments'
import { formatCurrency } from '@/lib/utils'

interface BookingPaymentHistoryProps {
  bookingId: string
}

const methodLabel: Record<string, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
}

export function BookingPaymentHistory({ bookingId }: BookingPaymentHistoryProps) {
  const { data: payments, isLoading } = useBookingPayments(bookingId)

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (!payments || payments.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-3 text-center">
        Chưa có giao dịch nào
      </p>
    )
  }

  return (
    <div className="divide-y divide-border rounded-lg border">
      <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
        <span className="col-span-3">Thời gian</span>
        <span className="col-span-3">Phương thức</span>
        <span className="col-span-3">Mã GD</span>
        <span className="col-span-2 text-right">Số tiền</span>
        <span className="col-span-1 text-right">TT</span>
      </div>
      {payments.map((p) => {
        const time = p.paid_at || p.created_at
        return (
          <div key={p.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm items-center">
            <span className="col-span-3 text-xs text-muted-foreground">
              {time ? format(new Date(time), 'HH:mm dd/MM/yy', { locale: vi }) : '—'}
            </span>
            <span className="col-span-3 text-xs">
              {methodLabel[p.payment_method] || p.payment_method}
            </span>
            <span className="col-span-3 font-mono text-xs truncate" title={p.transaction_reference || ''}>
              {p.transaction_reference || '—'}
            </span>
            <span className="col-span-2 text-right font-mono text-sm">
              {formatCurrency(p.amount)}
            </span>
            <span className="col-span-1 text-right">
              {p.payment_status === 'completed' && (
                <Badge variant="outline" className="border-green-500/50 text-green-600 text-xs px-1 py-0 h-4">OK</Badge>
              )}
              {p.payment_status === 'pending' && (
                <Badge variant="outline" className="border-amber-500/50 text-amber-600 text-xs px-1 py-0 h-4">Chờ</Badge>
              )}
              {p.payment_status === 'cancelled' && (
                <Badge variant="outline" className="border-red-500/50 text-red-600 text-xs px-1 py-0 h-4">Hủy</Badge>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
