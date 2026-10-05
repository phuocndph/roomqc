import { Suspense, lazy } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

const BookingDetailPage = lazy(() =>
  import('@/pages/bookings/BookingDetailPage').then((m) => ({ default: m.BookingDetailPage })),
)

interface Props {
  bookingId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

function DialogSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-24" />
    </div>
  )
}

export function BookingDetailDialog({ bookingId, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <VisuallyHidden>
          <DialogTitle>Phiếu booking</DialogTitle>
        </VisuallyHidden>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {bookingId && (
            <Suspense fallback={<DialogSkeleton />}>
              <BookingDetailPage
                idProp={bookingId}
                embedded
                onClose={() => onOpenChange(false)}
              />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
