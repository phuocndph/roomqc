import { useEffect, useRef, useCallback, useState } from 'react'
import { X, ZoomIn, Loader2, Flashlight, FlashlightOff } from 'lucide-react'
import { parseCCCDQR } from '@/lib/parseCCCDQR'
import { ScannedDocumentData } from './DocumentScanner'
import { toast } from 'sonner'

interface QRScannerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScanSuccess: (data: ScannedDocumentData) => void
}

// Tuning constants
const SCAN_INTERVAL_NATIVE_MS = 90   // BarcodeDetector path (fast)
const SCAN_INTERVAL_WASM_MS = 220    // qr-scanner-wechat fallback
const FRAMES_BEFORE_ZOOM = 8         // ~1s of misses before auto-zoom 2x
const ZOOM_DURATION_FRAMES = 10
const SCAN_CROP_SIZE = 720           // square crop canvas px
const HINT_TIMEOUT_MS = 8000

// Crop ratio of the viewfinder box (must match overlay: 56vmin)
const CROP_RATIO = 0.7

type ScanResult = { text: string } | null

export function QRScannerDialog({ open, onOpenChange, onScanSuccess }: QRScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const scanLoopRef = useRef<number | null>(null)
  const failCountRef = useRef(0)
  const zoomFrameCountRef = useRef(0)
  const isZoomedRef = useRef(false)
  const stoppedRef = useRef(false)
  const hintTimerRef = useRef<number | null>(null)
  const hintShownRef = useRef(false)

  const [isLoading, setIsLoading] = useState(true)
  const [isZoomed, setIsZoomed] = useState(false)
  const [isFlashOn, setIsFlashOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [isFrontCamera, setIsFrontCamera] = useState(false)
  const [scanMode, setScanMode] = useState<'native' | 'wasm' | null>(null)

  const stopScanner = useCallback(() => {
    stoppedRef.current = true
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current)
      scanLoopRef.current = null
    }
    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current)
      hintTimerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const handleClose = useCallback(() => {
    stopScanner()
    onOpenChange(false)
  }, [stopScanner, onOpenChange])

  const applyZoom = useCallback(async (zoom: number) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return false
    try {
      const caps = (track as any).getCapabilities?.()
      if (caps?.zoom) {
        const clampedZoom = Math.min(zoom, caps.zoom.max)
        await track.applyConstraints({ advanced: [{ zoom: clampedZoom } as any] })
        return true
      }
    } catch { /* ignore */ }
    return false
  }, [])

  const toggleFlash = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const newState = !isFlashOn
      await track.applyConstraints({ advanced: [{ torch: newState } as any] })
      setIsFlashOn(newState)
    } catch { /* ignore */ }
  }, [isFlashOn])

  useEffect(() => {
    if (!open) return

    stoppedRef.current = false
    failCountRef.current = 0
    zoomFrameCountRef.current = 0
    isZoomedRef.current = false
    hintShownRef.current = false
    setIsLoading(true)
    setIsZoomed(false)
    setIsFlashOn(false)
    setHasTorch(false)
    setIsFrontCamera(false)
    setScanMode(null)

    // Detect native BarcodeDetector
    const BarcodeDetectorCtor = (window as any).BarcodeDetector as
      | undefined
      | { new (opts?: { formats?: string[] }): { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }

    let nativeDetector: { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } | null = null
    let wasmModule: { scan: (source: HTMLCanvasElement) => Promise<ScanResult>, ready: () => Promise<void> } | null = null

    const canvas = document.createElement('canvas')
    canvas.width = SCAN_CROP_SIZE
    canvas.height = SCAN_CROP_SIZE
    canvasRef.current = canvas
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!

    const initDetector = async (): Promise<'native' | 'wasm'> => {
      if (BarcodeDetectorCtor) {
        try {
          const supported = await (BarcodeDetectorCtor as any).getSupportedFormats?.()
          if (!supported || supported.includes('qr_code')) {
            nativeDetector = new BarcodeDetectorCtor({ formats: ['qr_code'] })
            return 'native'
          }
        } catch { /* fall through */ }
      }
      const mod = await import('qr-scanner-wechat')
      await mod.ready()
      wasmModule = mod
      return 'wasm'
    }

    const startScanning = async () => {
      try {
        const mode = await initDetector()
        if (stoppedRef.current) return
        setScanMode(mode)

        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { exact: 'environment' },
              width: { ideal: 1920, max: 4096 },
              height: { ideal: 1080, max: 2160 },
              frameRate: { ideal: 30 },
              focusMode: { ideal: 'continuous' },
              advanced: [{ focusMode: 'continuous' } as any],
            } as MediaTrackConstraints,
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: 'user',
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            },
          })
          setIsFrontCamera(true)
        }

        if (stoppedRef.current) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        const track = stream.getVideoTracks()[0]
        if (track) {
          try {
            const caps = (track as any).getCapabilities?.()
            if (caps?.focusMode?.includes('continuous')) {
              await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] })
            }
            if (caps?.torch) setHasTorch(true)
          } catch { /* ignore */ }
        }

        setIsLoading(false)

        // Hint after N seconds without success
        hintTimerRef.current = window.setTimeout(() => {
          if (!stoppedRef.current && !hintShownRef.current) {
            hintShownRef.current = true
            toast.info('Đưa QR vào giữa khung, cách 20–30cm. Bật đèn pin nếu thiếu sáng.', { duration: 4000 })
          }
        }, HINT_TIMEOUT_MS)

        const intervalMs = mode === 'native' ? SCAN_INTERVAL_NATIVE_MS : SCAN_INTERVAL_WASM_MS
        let lastScanTime = 0
        let scanning = false

        const handleSuccess = async (text: string) => {
          const parsed = parseCCCDQR(text)
          if (parsed) {
            try { navigator.vibrate?.(60) } catch { /* ignore */ }
            await applyZoom(1)
            toast.success('Đã đọc QR CCCD thành công')
            onScanSuccess(parsed)
            handleClose()
            return true
          }
          toast.error('QR không phải định dạng CCCD')
          failCountRef.current = 0
          if (isZoomedRef.current) {
            await applyZoom(1)
            isZoomedRef.current = false
            setIsZoomed(false)
          }
          return false
        }

        const handleMiss = async () => {
          failCountRef.current++
          if (isZoomedRef.current) {
            zoomFrameCountRef.current++
            if (zoomFrameCountRef.current >= ZOOM_DURATION_FRAMES) {
              await applyZoom(1)
              isZoomedRef.current = false
              setIsZoomed(false)
              failCountRef.current = 0
              zoomFrameCountRef.current = 0
            }
          } else if (failCountRef.current >= FRAMES_BEFORE_ZOOM) {
            const zoomed = await applyZoom(2)
            if (zoomed) {
              isZoomedRef.current = true
              setIsZoomed(true)
              zoomFrameCountRef.current = 0
            }
            failCountRef.current = 0
          }
        }

        const scanFrame = async (timestamp: number) => {
          if (stoppedRef.current) return
          scanLoopRef.current = requestAnimationFrame(scanFrame)
          if (scanning) return
          if (timestamp - lastScanTime < intervalMs) return
          lastScanTime = timestamp

          const video = videoRef.current
          if (!video || video.readyState < 2 || video.videoWidth === 0) return

          // Compute crop centered on video, square, CROP_RATIO of shorter side
          const vw = video.videoWidth
          const vh = video.videoHeight
          const cropSize = Math.floor(Math.min(vw, vh) * CROP_RATIO)
          const sx = Math.floor((vw - cropSize) / 2)
          const sy = Math.floor((vh - cropSize) / 2)

          ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, SCAN_CROP_SIZE, SCAN_CROP_SIZE)

          scanning = true
          try {
            if (nativeDetector) {
              const results = await nativeDetector.detect(canvas)
              if (stoppedRef.current) return
              if (results && results.length > 0 && results[0].rawValue) {
                const done = await handleSuccess(results[0].rawValue)
                if (done) return
              } else {
                await handleMiss()
              }
            } else if (wasmModule) {
              const result = await wasmModule.scan(canvas)
              if (stoppedRef.current) return
              if (result?.text) {
                const done = await handleSuccess(result.text)
                if (done) return
              } else {
                await handleMiss()
              }
            }
          } catch {
            // Scan error, continue
          } finally {
            scanning = false
          }
        }

        scanLoopRef.current = requestAnimationFrame(scanFrame)
      } catch (err: any) {
        console.error('QR scanner error:', err)
        toast.error('Không thể mở camera')
        handleClose()
      }
    }

    startScanning()
    return () => { stopScanner() }
  }, [open, onScanSuccess, handleClose, stopScanner, applyZoom])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
        disablePictureInPicture
        style={isFrontCamera ? { transform: 'scaleX(-1)' } : undefined}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-[102]">
          <Loader2 className="h-8 w-8 animate-spin text-white mb-3" />
          <p className="text-white text-sm">Đang khởi tạo camera...</p>
        </div>
      )}

      {/* Scan overlay */}
      {!isLoading && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative" style={{ width: '56vmin', height: '56vmin' }}>
              <div className="absolute bottom-full left-[-50vw] right-[-50vw] top-[-50vh] bg-black/50" />
              <div className="absolute top-full left-[-50vw] right-[-50vw] bottom-[-50vh] bg-black/50" />
              <div className="absolute top-0 bottom-0 right-full left-[-50vw] bg-black/50" />
              <div className="absolute top-0 bottom-0 left-full right-[-50vw] bg-black/50" />

              <div className="absolute inset-0 border border-white/20 rounded-sm" />

              <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-white rounded-tl-sm" />
              <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-white rounded-tr-sm" />
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-white rounded-bl-sm" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-white rounded-br-sm" />

              <div className="absolute left-1 right-1 h-[1px] bg-gradient-to-r from-transparent via-white/60 to-transparent animate-qr-scan" />
            </div>
          </div>

          {/* Scanning indicator */}
          <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            <span className="text-white/80 text-[10px]">
              {scanMode === 'native' ? 'Đang quét' : 'Đang quét'}
            </span>
          </div>

          {isZoomed && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/50 px-3 py-1 rounded-full">
              <ZoomIn className="h-3.5 w-3.5 text-white/80" />
              <span className="text-white/80 text-xs">2x</span>
            </div>
          )}

          <div className="absolute bottom-28 left-0 right-0 text-center">
            <p className="text-white/80 text-[11px]">Hướng camera vào mã QR</p>
          </div>
        </div>
      )}

      {/* Close button */}
      <button aria-label="Đóng"
        onClick={handleClose}
        className="absolute top-4 right-4 z-[101] w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Flash toggle */}
      {hasTorch && !isLoading && (
        <button aria-label="Tắt đèn flash"
          type="button"
          onClick={toggleFlash}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[101] w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
        >
          {isFlashOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
        </button>
      )}
    </div>
  )
}
