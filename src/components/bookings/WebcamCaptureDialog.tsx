import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, RotateCcw, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface WebcamCaptureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (base64: string) => void
}

export function WebcamCaptureDialog({ open, onOpenChange, onCapture }: WebcamCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isFrontCamera, setIsFrontCamera] = useState(false)

  const startCamera = useCallback(async () => {
    setError(null)
    setCapturedImage(null)
    setIsFrontCamera(false)
    try {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        setIsFrontCamera(true)
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setIsStreaming(true)
      }
    } catch (err: any) {
      console.error('Camera error:', err)
      setError(err.name === 'NotAllowedError'
        ? 'Bạn cần cho phép truy cập camera trong trình duyệt'
        : 'Không thể mở camera. Vui lòng kiểm tra thiết bị.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setIsStreaming(false)
  }, [])

  useEffect(() => {
    if (open) {
      startCamera()
    } else {
      stopCamera()
      setCapturedImage(null)
      setError(null)
    }
    return () => stopCamera()
  }, [open, startCamera, stopCamera])

  const capture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (isFrontCamera) {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.85)
    setCapturedImage(base64)
    stopCamera()
  }

  const retake = () => {
    setCapturedImage(null)
    startCamera()
  }

  const confirm = () => {
    if (capturedImage) {
      onCapture(capturedImage)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-4 max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Chụp ảnh giấy tờ</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {error && (
            <div className="text-xs text-red-600 text-center py-4">{error}</div>
          )}

          {!capturedImage ? (
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted style={isFrontCamera ? { transform: 'scaleX(-1)' } : undefined} />
              {!isStreaming && !error && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </div>
          ) : (
            <div className="relative rounded-lg overflow-hidden aspect-video">
              <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />

          <div className="flex justify-center gap-2">
            {!capturedImage ? (
              <Button type="button" size="sm" className="h-8 text-xs" onClick={capture} disabled={!isStreaming}>
                <Camera className="h-3.5 w-3.5 mr-1" />
                Chụp
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={retake}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Chụp lại
                </Button>
                <Button type="button" size="sm" className="h-8 text-xs" onClick={confirm}>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Xác nhận
                </Button>
              </>
            )}
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
              <X className="h-3.5 w-3.5 mr-1" />
              Đóng
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
