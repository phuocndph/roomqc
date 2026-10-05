import { Button } from '@/components/ui/button'
import { Loader2, Minimize2, CreditCard, CheckCircle2, AlertTriangle } from 'lucide-react'
import { formatVNCurrency } from '@/lib/pricing'
import { cn } from '@/lib/utils'

interface GroupCheckoutStickyFooterProps {
  remaining: number
  grandTotal: number
  selectedRoomCount: number
  isProcessing: boolean
  isCalculating: boolean
  hasInvalidAdjustments: boolean
  onCancel: () => void
  onMinimize?: () => void
  onDirectCheckout: () => void
  onPayAndCheckout: () => void
}

export function GroupCheckoutStickyFooter({
  remaining,
  grandTotal,
  selectedRoomCount,
  isProcessing,
  isCalculating,
  hasInvalidAdjustments,
  onCancel,
  onMinimize,
  onDirectCheckout,
  onPayAndCheckout,
}: GroupCheckoutStickyFooterProps) {
  const isDisabled = isProcessing || isCalculating || selectedRoomCount === 0 || hasInvalidAdjustments

  return (
    <div className="border-t bg-background px-4 py-3 space-y-2">
      {/* Mini summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Tổng cộng:</span>
        <span className="font-mono font-bold">{formatVNCurrency(grandTotal)}</span>
      </div>
      {remaining > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-red-600 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Còn lại:
          </span>
          <span className="font-mono font-bold text-red-600">{formatVNCurrency(remaining)}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="h-9">
            Hủy
          </Button>
          {onMinimize && (
            <Button type="button" variant="outline" size="sm" onClick={onMinimize} className="h-9">
              <Minimize2 className="h-4 w-4 mr-1.5" />
              Thu nhỏ
            </Button>
          )}
        </div>
        
        {remaining > 0 ? (
          <div className="flex gap-2 flex-1">
            <Button
              variant="outline"
              className="flex-1 h-9"
              disabled={isDisabled}
              onClick={onDirectCheckout}
            >
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Trả phòng (nợ {formatVNCurrency(remaining)})
            </Button>
            <Button
              className="flex-1 h-9"
              disabled={isDisabled}
              onClick={onPayAndCheckout}
            >
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CreditCard className="h-4 w-4 mr-1.5" />
              Thu tiền & Trả phòng
            </Button>
          </div>
        ) : (
          <Button
            className="flex-1 h-9"
            disabled={isDisabled}
            onClick={onDirectCheckout}
          >
            {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Xác nhận Checkout ({selectedRoomCount} phòng)
          </Button>
        )}
      </div>
    </div>
  )
}
