import { Separator } from '@/components/ui/separator'
import { CreditCard } from 'lucide-react'
import { formatVNCurrency } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import type { ServiceChargeDetail } from '@/hooks/useBookingServiceCharges'

interface GroupCheckoutTotals {
  roomTotal: number
  damageCharges: number
  serviceCharges: number
  lateCharges: number
  earlyCheckinCharges: number
  extraCharges: number
  totalPaid: number
  subtotal: number
  vatAmount: number
  serviceFeeAmount: number
  grandTotal: number
  remaining: number
  depositApplied: number
  holdingDeposit: number
  isLastCheckout: boolean
}

interface GroupCheckoutSummaryProps {
  totals: GroupCheckoutTotals
  selectedRoomCount: number
  roomsRemaining: number
  allServiceDetails?: ServiceChargeDetail[]
}

export function GroupCheckoutSummary({ totals, selectedRoomCount, roomsRemaining, allServiceDetails }: GroupCheckoutSummaryProps) {
  const hasServiceDetails = allServiceDetails && allServiceDetails.length > 0

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CreditCard className="h-4 w-4" />
        Tổng hợp thanh toán ({selectedRoomCount} phòng)
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tiền phòng</span>
          <span className="font-mono">{formatVNCurrency(totals.roomTotal)}</span>
        </div>
        
        {totals.earlyCheckinCharges > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Phụ thu check-in sớm</span>
            <span className="font-mono text-amber-600">{formatVNCurrency(totals.earlyCheckinCharges)}</span>
          </div>
        )}
        
        {totals.lateCharges > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Phụ thu checkout trễ</span>
            <span className="font-mono text-amber-600">{formatVNCurrency(totals.lateCharges)}</span>
          </div>
        )}
        
        {totals.damageCharges > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Phí đền bù thiệt hại</span>
            <span className="font-mono text-red-600">{formatVNCurrency(totals.damageCharges)}</span>
          </div>
        )}
        
        {/* Service & Minibar itemized details */}
        {hasServiceDetails ? (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border/50 pb-1 mt-1">
              Dịch vụ & Minibar
            </div>
            {allServiceDetails.map((detail) => (
              <div key={detail.id} className="flex justify-between text-sm py-0.5">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="text-xs uppercase text-muted-foreground/60 w-12 shrink-0">
                    {detail.source === 'minibar' ? 'Minibar' : 'Dịch vụ'}
                  </span>
                  <span className="truncate">
                    {detail.service_name}
                    {detail.quantity > 1 && ` ×${detail.quantity}`}
                  </span>
                </span>
                <span className="font-mono shrink-0 ml-2">{formatVNCurrency(detail.total_price)}</span>
              </div>
            ))}
          </div>
        ) : totals.serviceCharges > 0 ? (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Dịch vụ sử dụng</span>
            <span className="font-mono">{formatVNCurrency(totals.serviceCharges)}</span>
          </div>
        ) : null}
        
        {totals.extraCharges > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Chi phí khác</span>
            <span className="font-mono">{formatVNCurrency(totals.extraCharges)}</span>
          </div>
        )}

        <Separator className="my-1" />
        
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Tạm tính</span>
          <span className="font-mono">{formatVNCurrency(totals.subtotal)}</span>
        </div>
        
        {totals.vatAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Thuế GTGT</span>
            <span className="font-mono">{formatVNCurrency(totals.vatAmount)}</span>
          </div>
        )}
        
        {totals.serviceFeeAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Phí dịch vụ</span>
            <span className="font-mono">{formatVNCurrency(totals.serviceFeeAmount)}</span>
          </div>
        )}

        <Separator className="my-1" />
        
        <div className="flex justify-between font-bold text-base">
          <span>TỔNG CỘNG</span>
          <span className="font-mono">{formatVNCurrency(totals.grandTotal)}</span>
        </div>
        
        {totals.depositApplied > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Tiền đặt cọc</span>
            <span className="font-mono">-{formatVNCurrency(totals.depositApplied)}</span>
          </div>
        )}
        
        {totals.holdingDeposit > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              Tiền cọc (giữ)
              <span className="text-xs">(còn {roomsRemaining} phòng)</span>
            </span>
            <span className="font-mono text-amber-600">{formatVNCurrency(totals.holdingDeposit)}</span>
          </div>
        )}
        
        {totals.totalPaid > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Đã thanh toán</span>
            <span className="font-mono">-{formatVNCurrency(totals.totalPaid)}</span>
          </div>
        )}

        <Separator className="my-1" />
        
        <div className={cn("flex justify-between font-bold text-base", totals.remaining > 0 ? "text-red-600" : "text-green-600")}>
          <span>CÒN LẠI</span>
          <span className="font-mono">{formatVNCurrency(Math.max(0, totals.remaining))}</span>
        </div>
      </div>
    </div>
  )
}
