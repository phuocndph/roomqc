import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { useMarkRoomReady } from '@/hooks/useRooms'

interface CleaningCompleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: string
  roomNumber: string
  onComplete?: () => void // Callback when cleaning is completed
}

export function CleaningCompleteDialog({
  open,
  onOpenChange,
  roomId,
  roomNumber,
  onComplete,
}: CleaningCompleteDialogProps) {
  const navigate = useNavigate()
  const [option, setOption] = useState<'direct' | 'check'>('direct')
  const markRoomReady = useMarkRoomReady()

  const handleConfirm = async () => {
    if (option === 'check') {
      // Navigate to room check page - task will be auto-completed when check is submitted
      onOpenChange(false)
      navigate(`/rooms/${roomId}/check?type=daily`)
    } else {
      // Mark room as ready directly
      await markRoomReady.mutateAsync({ roomId, skipCheck: true })
      onComplete?.() // Call callback after marking ready
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Hoàn thành dọn phòng {roomNumber}?
          </DialogTitle>
          <DialogDescription>
            Phòng sẽ chuyển sang trạng thái "Sẵn sàng" và có thể nhận khách.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={option}
          onValueChange={(v) => setOption(v as 'direct' | 'check')}
          className="gap-3 py-4"
        >
          <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer"
            onClick={() => setOption('direct')}
          >
            <RadioGroupItem value="direct" id="direct" className="mt-0.5" />
            <Label htmlFor="direct" className="cursor-pointer flex-1">
              <span className="font-medium">Mở phòng ngay</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Phòng sẽ chuyển sang "Trống" ngay lập tức
              </p>
            </Label>
          </div>

          <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer"
            onClick={() => setOption('check')}
          >
            <RadioGroupItem value="check" id="check" className="mt-0.5" />
            <Label htmlFor="check" className="cursor-pointer flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">Kiểm tra nhanh trước</span>
                <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Đảm bảo phòng đã đủ đồ dùng trước khi nhận khách
              </p>
            </Label>
          </div>
        </RadioGroup>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={markRoomReady.isPending}
          >
            {markRoomReady.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}