import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useBookingPayments } from '@/hooks/useBookingPayments'
import { formatCurrency } from '@/lib/utils'
import { useBookingNoShowResolution } from '@/hooks/useBookingNoShowResolution'

interface BookingPaymentHistoryProps {
  bookingId: string
  bookingStatus?: string
}

const methodLabel: Record<string, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  pending_refund: 'Cần hoàn tiền',
}

export function BookingPaymentHistory({ bookingId, bookingStatus }: BookingPaymentHistoryProps) {
  const { data: payments, isLoading } = useBookingPayments(bookingId)
  const resolution = useBookingNoShowResolution(bookingId, bookingStatus === 'no_show')

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
    {bookingStatus === 'no_show' && <div className="rounded-lg border border-slate-300 p-3 text-sm">
      <p className="font-medium">Xử lý cọc khi khách không đến</p>
      {resolution.isLoading ? <p>Đang kiểm tra quyết định xử lý cọc…</p>
        : resolution.isError ? <p>Chưa đọc được quyết định xử lý cọc. Cần kiểm tra quyền và đối soát riêng.</p>
        : resolution.data ? <p>{resolution.data.decision === 'retain'
          ? `Cọc đã chuyển thành phí no-show: ${formatCurrency(resolution.data.retained_amount)}.`
          : `Cọc cần hoàn: ${formatCurrency(resolution.data.refund_due_amount)}. Khách sạn cần thực hiện hoàn tiền và đối soát riêng.`}</p>
        : <p>Chưa có quyết định xử lý cọc được đối soát cho dữ liệu này.</p>}
    </div>}
    {!payments?.length ? <p className="py-3 text-center text-xs text-muted-foreground">Chưa có giao dịch nào</p> :
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
    </div>}
    </div>
  )
}
