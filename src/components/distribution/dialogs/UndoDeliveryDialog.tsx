import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { DistributionOrderRoom } from '@/types/distribution.types'

interface UndoDeliveryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: DistributionOrderRoom | null
  onConfirm: () => void
  isPending?: boolean
}

export function UndoDeliveryDialog({ 
  open, 
  onOpenChange, 
  room, 
  onConfirm,
  isPending = false 
}: UndoDeliveryDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hoàn tác xác nhận</AlertDialogTitle>
          <AlertDialogDescription>
            Hoàn tác xác nhận giao hàng cho phòng{' '}
            <span className="font-semibold">{room?.room_number}</span>?
            <br />
            Phòng sẽ được chuyển về trạng thái chờ xác nhận.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Đóng</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Đang xử lý...' : 'Xác nhận hoàn tác'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
