import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2, Camera, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useQuickRoomCheck, type QuickCheckType } from '@/hooks/useQuickRoomCheck'
import { useHotelPhotoMode } from '@/hooks/useHotelPhotoMode'
import { useImageUpload } from '@/hooks/useImageUpload'
import { useUser } from '@/hooks/useUser'
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
import { toast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

interface Props {
  roomId: string
  hotelId?: string | null
  checkType: QuickCheckType
  onSuccessNavigate?: string
}

/**
 * Nút 1-tap "Phòng OK hoàn toàn".
 *
 * - Hiện confirm dialog ngắn gọn
 * - Nếu hotel cấu hình yêu cầu ảnh "always" → hỏi chụp ảnh trước khi xác nhận
 * - Gọi RPC perform_quick_room_check (atomic + audit + tenant guard)
 *
 * Đặt nổi bật ở đầu Step "Tổng quan & loại kiểm" để rút thời gian
 * cho trường hợp phổ biến nhất: phòng không có lỗi.
 */
export function QuickOkButton({ roomId, hotelId, checkType, onSuccessNavigate = '/rooms' }: Props) {
  const navigate = useNavigate()
  const { mutateAsync, isPending } = useQuickRoomCheck()
  const { data: photoMode } = useHotelPhotoMode(hotelId ?? undefined)
  const { uploadImage, isUploading } = useImageUpload()
  const { tenantId } = useUser()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])

  const requirePhoto = photoMode === 'always'

  const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !tenantId) return
    try {
      const uploaded = await uploadImage(file, tenantId)
      if (uploaded?.url) setPhotos((p) => [...p, uploaded.url])
    } catch (err: any) {
      toast({ title: 'Tải ảnh thất bại', description: getFriendlyError(err), variant: 'destructive' })
    } finally {
      e.target.value = ''
    }
  }

  const handleConfirm = async () => {
    if (requirePhoto && photos.length === 0) {
      toast({
        title: 'Cần ít nhất 1 ảnh',
        description: 'Khách sạn yêu cầu chụp ảnh bằng chứng.',
        variant: 'destructive',
      })
      return
    }
    try {
      const startedAt = performance.now()
      await mutateAsync({ roomId, checkType, photos })
      // Metrics hook
      const elapsedMs = Math.round(performance.now() - startedAt)
      try {
        ;(window as any).__roomCheckMetrics?.push?.({
          type: 'quick_path_used',
          roomId,
          checkType,
          elapsedMs,
          at: Date.now(),
        })
      } catch { /* analytics must not block the quick action */ }
      setConfirmOpen(false)
      navigate(onSuccessNavigate)
    } catch {
      // toast đã do hook xử lý
    }
  }

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="w-full h-14 text-base font-semibold gap-2 bg-green-600 hover:bg-green-700 text-white shadow-sm"
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
      >
        <CheckCircle2 className="h-5 w-5" />
        Phòng OK hoàn toàn — Xác nhận nhanh
      </Button>
      <p className="text-[11px] text-muted-foreground text-center">
        Chỉ dùng khi phòng sạch sẽ, không có sự cố.
      </p>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận phòng OK?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn xác nhận phòng đã sạch sẽ, đầy đủ đồ và không có sự cố nào.
              Hệ thống sẽ ghi nhận điểm 5/5 và đóng phiên kiểm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {(requirePhoto || photos.length > 0) && (
            <div className="space-y-2">
              <div className="text-xs font-medium">
                Ảnh bằng chứng {requirePhoto && <span className="text-red-600">*</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {photos.map((url, i) => (
                  <div key={i} className="relative w-16 h-16">
                    <img src={url} alt="" className="w-16 h-16 object-cover rounded-md border" />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="w-16 h-16 border border-dashed rounded-md flex items-center justify-center cursor-pointer hover:bg-muted">
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePickPhoto}
                  />
                </label>
              </div>
            </div>
          )}

          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="mt-0">Để tôi kiểm kỹ</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isPending || (requirePhoto && photos.length === 0)}
              className="bg-green-600 hover:bg-green-700"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
