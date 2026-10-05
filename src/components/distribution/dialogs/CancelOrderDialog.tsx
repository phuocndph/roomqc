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

interface CancelOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderCode: string
  onConfirm: () => void
  isPending?: boolean
}

export function CancelOrderDialog({ 
  open, 
  onOpenChange, 
  orderCode, 
  onConfirm,
  isPending = false 
}: CancelOrderDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xác nhận hủy phiếu</AlertDialogTitle>
          <AlertDialogDescription>
            Bạn có chắc muốn hủy phiếu giao hàng{' '}
            <span className="font-mono font-semibold">{orderCode}</span>?
            <br />
            Tất cả sản phẩm chưa giao sẽ được hoàn trả về kho.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Đóng</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? 'Đang hủy...' : 'Xác nhận hủy'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
