import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { takeNativePhoto } from '@/lib/native/camera'
import { toast } from 'sonner'

export function NativePhotoButton({ onPhoto, disabled = false }: { onPhoto: (file: File) => Promise<void>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false)
  const taking = useRef(false)
  async function takePhoto() {
    if (taking.current || disabled) return
    taking.current = true
    setBusy(true)
    try {
      const file = await takeNativePhoto()
      if (file) await onPhoto(file)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chưa chụp được ảnh. Vui lòng thử lại.')
    } finally { taking.current = false; setBusy(false) }
  }
  return <Button type="button" variant="outline" className="min-h-12 w-full" disabled={disabled || busy} onClick={takePhoto}>
    {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Camera className="mr-2 h-5 w-5" />}
    {busy ? 'Đang xử lý ảnh…' : 'Chụp ảnh'}
  </Button>
}
