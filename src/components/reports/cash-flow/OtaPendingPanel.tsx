import { formatCurrency } from '@/lib/utils'
import type { OtaPendingItem } from '@/hooks/useCashFlowReport'

interface Props {
  rows: OtaPendingItem[]
  loading?: boolean
}

export function OtaPendingPanel({ rows, loading }: Props) {
  if (loading) {
    return <div className="rounded-lg border border-border h-40 animate-pulse bg-muted/30" />
  }
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
        OTA đã thanh toán đầy đủ.
      </div>
    )
  }
  const totalPending = rows.reduce((s, r) => s + r.pending, 0)
  return (
    <div className="rounded-lg border border-border">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">OTA chưa thanh toán</h3>
        <span className="text-xs font-mono text-amber-600">{formatCurrency(totalPending)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 font-medium">Kênh</th>
              <th className="text-right py-2 px-3 font-medium">Booking</th>
              <th className="text-right py-2 px-3 font-medium">Doanh thu</th>
              <th className="text-right py-2 px-3 font-medium">Hoa hồng</th>
              <th className="text-right py-2 px-3 font-medium">Đã trả</th>
              <th className="text-right py-2 px-3 font-medium">Còn giữ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.source}>
                <td className="py-2 px-3 font-medium">{r.label}</td>
                <td className="py-2 px-3 text-right tabular-nums">{r.bookings}</td>
                <td className="py-2 px-3 text-right font-mono">{formatCurrency(r.gross)}</td>
                <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                  -{formatCurrency(r.commission)}
                </td>
                <td className="py-2 px-3 text-right font-mono text-green-600">
                  {formatCurrency(r.alreadyPaid)}
                </td>
                <td className="py-2 px-3 text-right font-mono text-amber-600">
                  {formatCurrency(r.pending)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
