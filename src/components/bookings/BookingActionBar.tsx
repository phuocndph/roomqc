import { Printer, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BookingActionBarProps {
  remaining: number
  canCollect: boolean
  onCollect: () => void
  onPrintInvoice: () => void
}

/**
 * Sticky action bar cho tab Thanh toán: Thu tiền + In hóa đơn
 */
export function BookingActionBar({
  remaining,
  canCollect,
  onCollect,
  onPrintInvoice,
}: BookingActionBarProps) {
  return (
    <div className="sticky bottom-0 -mx-2 sm:mx-0 mt-4 border-t bg-background/95 backdrop-blur p-3 flex items-center justify-end gap-2 z-10">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={onPrintInvoice}
      >
        <Printer className="h-4 w-4 mr-1.5" />
        In hóa đơn
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-9"
        disabled={!canCollect || remaining <= 0}
        onClick={onCollect}
      >
        <Wallet className="h-4 w-4 mr-1.5" />
        Thu tiền
      </Button>
    </div>
  )
}
