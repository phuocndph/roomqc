import { Loader2 } from 'lucide-react'
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
import { useShiftCheckIn } from '@/hooks/useShiftManagement'

interface Props {
  open: boolean
  onCancel: () => void
  onCheckedIn: () => void
}

/**
 * Dialog chặn thao tác khi nhân viên chưa vào ca.
 * - Hủy → đóng dialog, không chạy action.
 * - Vào ca ngay → gọi useShiftCheckIn, thành công thì onCheckedIn() để
 *   provider tự re-run hành động đang dở.
 */
export function RequireShiftDialog({ open, onCancel, onCheckedIn }: Props) {
  const { mutate: checkIn, isPending } = useShiftCheckIn()

  const handleCheckIn = () => {
    checkIn(undefined, {
      onSuccess: () => onCheckedIn(),
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bạn cần vào ca để tiếp tục</AlertDialogTitle>
          <AlertDialogDescription>
            Mọi thao tác vận hành (kiểm phòng, nhận/hoàn thành công việc, giao
            đồ, chuyển trạng thái phòng…) yêu cầu nhân viên đã bấm vào ca.
            Vào ca ngay để tiếp tục thao tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={onCancel}>
            Hủy
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              e.preventDefault()
              handleCheckIn()
            }}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Vào ca ngay
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
