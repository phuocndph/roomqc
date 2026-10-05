import { useState, useRef, useEffect } from 'react'
import { Camera, Upload, Loader2, CheckCircle2, AlertCircle, ScanLine, X, Smartphone, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/integrations/supabase/client'
import { compressImage } from '@/lib/imageCompression'
import { toast } from 'sonner'
import { useUser } from '@/hooks/useUser'
import { WebcamCaptureDialog } from './WebcamCaptureDialog'
import { QRScannerDialog } from './QRScannerDialog'

export interface ScannedDocumentData {
  full_name: string
  id_number: string
  date_of_birth?: string
  gender?: 'male' | 'female'
  nationality?: string
  address?: string
}

interface DocumentScannerProps {
  onScanComplete: (data: ScannedDocumentData, documentType: string, imageUrl?: string) => void
}

const DOCUMENT_TYPES = [
  { value: 'cccd', label: 'CCCD / CMND' },
  { value: 'passport', label: 'Hộ chiếu' },
  { value: 'visa', label: 'Visa' },
]

type ScanStatus = 'idle' | 'uploading' | 'scanning' | 'success' | 'error' | 'waiting_mobile'

export function DocumentScanner({ onScanComplete }: DocumentScannerProps) {
  const { tenantId, user } = useUser()
  const [documentType, setDocumentType] = useState('cccd')
  const [status, setStatus] = useState<ScanStatus>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [scannedData, setScannedData] = useState<ScannedDocumentData | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [showWebcam, setShowWebcam] = useState(false)
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [mobileSessionId, setMobileSessionId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Process image (shared between file upload and webcam capture)
  const processImage = async (base64: string) => {
    setStatus('uploading')
    setErrorMessage('')
    setScannedData(null)
    setPreviewUrl(base64)

    try {
      setStatus('scanning')

      const { data, error } = await supabase.functions.invoke('scan-guest-document', {
        body: { imageBase64: base64, documentType, tenantId },
      })

      if (error) {
        // Extract error message from edge function response
        let errorMsg = 'Lỗi khi quét giấy tờ'
        try {
          const errorBody = await error.context?.json?.()
          if (errorBody?.error) errorMsg = errorBody.error
        } catch {
          // fallback
        }
        throw new Error(errorMsg)
      }
      if (data?.error) throw new Error(data.error)

      const extractedData = data.data as ScannedDocumentData
      setScannedData(extractedData)
      setStatus('success')

      // Upload image to storage
      let imageUrl: string | undefined
      if (tenantId) {
        const fileName = `${tenantId}/${Date.now()}-${documentType}.jpg`
        const blob = await fetch(base64).then(r => r.blob())
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('guest-documents')
          .upload(fileName, blob, { contentType: 'image/jpeg' })

        if (!uploadError && uploadData) {
          const { data: urlData, error: urlError } = await supabase.storage
            .from('guest-documents')
            .createSignedUrl(uploadData.path, 60 * 60)
          if (!urlError && urlData?.signedUrl) imageUrl = urlData.signedUrl
        }
      }

      onScanComplete(extractedData, documentType, imageUrl)
      toast.success('Đã trích xuất thông tin thành công')
    } catch (err: any) {
      console.error('Scan error:', err)
      setStatus('error')
      setErrorMessage(err.message || 'Lỗi khi quét giấy tờ')
      toast.error(err.message || 'Lỗi khi quét giấy tờ')
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Vui lòng chọn file ảnh')
        return
      }
      compressImage(file, 0.8, 1024, 1024).then(processImage)
    }
    e.target.value = ''
  }

  // Start mobile scan session
  const startMobileScan = async () => {
    if (!tenantId || !user?.id) {
      toast.error('Vui lòng đăng nhập')
      return
    }

    try {
      const { data, error } = await supabase
        .from('document_scan_sessions')
        .insert({
          tenant_id: tenantId,
          created_by: user.id,
          document_type: documentType,
          status: 'pending',
        })
        .select('id')
        .single()

      if (error) throw error

      setMobileSessionId(data.id)
      setStatus('waiting_mobile')

      // Build the scan URL
      const scanUrl = `${window.location.origin}/scan-document/${data.id}`

      // Try to send push notification
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            user_id: user.id,
            tenant_id: tenantId,
            title: 'Chụp giấy tờ',
            body: 'Nhấn để chụp ảnh giấy tờ tùy thân',
            action_url: `/scan-document/${data.id}`,
            excludeEndpoints: [],
          },
        })
        toast.success('Đã gửi thông báo đến điện thoại')
      } catch {
        // If push fails, show QR/link fallback
        toast.info('Mở link trên điện thoại để chụp ảnh', { description: scanUrl, duration: 10000 })
      }
    } catch (err: any) {
      console.error('Failed to create scan session:', err)
      toast.error('Không thể tạo phiên quét')
    }
  }

  // Listen for mobile scan completion via realtime
  useEffect(() => {
    if (!mobileSessionId || status !== 'waiting_mobile') return

    const channel = supabase
      .channel(`scan-session-${mobileSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'document_scan_sessions',
          filter: `id=eq.${mobileSessionId}`,
        },
        (payload) => {
          const updated = payload.new as any
          if (updated.status === 'completed' && updated.scanned_data) {
            const extractedData = updated.scanned_data as ScannedDocumentData
            setScannedData(extractedData)
            setPreviewUrl(updated.image_url || null)
            setStatus('success')
            setMobileSessionId(null)
            onScanComplete(extractedData, documentType, updated.image_url)
            toast.success('Đã nhận ảnh từ điện thoại!')
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [mobileSessionId, status, documentType, onScanComplete])

  const reset = () => {
    setStatus('idle')
    setPreviewUrl(null)
    setScannedData(null)
    setErrorMessage('')
    setMobileSessionId(null)
  }

  const isProcessing = status === 'uploading' || status === 'scanning'

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ScanLine className="h-4 w-4 text-primary" />
        Quét giấy tờ tùy thân
      </div>

      {/* Document type + actions row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={documentType} onValueChange={setDocumentType} disabled={isProcessing || status === 'waiting_mobile'}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_TYPES.map(dt => (
              <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={isProcessing || status === 'waiting_mobile'}
          onClick={() => setShowWebcam(true)}
        >
          <Camera className="h-3.5 w-3.5 mr-1" />
          Chụp ảnh
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={isProcessing || status === 'waiting_mobile'}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-1" />
          Tải ảnh
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={isProcessing || status === 'waiting_mobile'}
          onClick={() => setShowQRScanner(true)}
        >
          <QrCode className="h-3.5 w-3.5 mr-1" />
          Quét QR
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={isProcessing || status === 'waiting_mobile'}
          onClick={startMobileScan}
        >
          <Smartphone className="h-3.5 w-3.5 mr-1" />
          Chụp bằng ĐT
        </Button>

        {(status === 'success' || status === 'error' || status === 'waiting_mobile') && (
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs ml-auto" onClick={reset}>
            <X className="h-3.5 w-3.5 mr-1" />
            Xóa
          </Button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          {status === 'uploading' ? 'Đang xử lý ảnh...' : 'Đang trích xuất thông tin...'}
        </div>
      )}

      {/* Waiting for mobile */}
      {status === 'waiting_mobile' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Đang chờ chụp từ điện thoại...</span>
        </div>
      )}

      {/* Preview + Result */}
      {previewUrl && !isProcessing && status !== 'waiting_mobile' && (
        <div className="flex gap-3">
          <img
            src={previewUrl}
            alt="Document preview"
            className="w-20 h-14 object-cover rounded border"
          />
          {status === 'success' && scannedData && (
            <div className="flex-1 text-xs space-y-0.5">
              <div className="flex items-center gap-1 text-green-600 font-medium mb-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Đã trích xuất
              </div>
              <div><span className="text-muted-foreground">Họ tên:</span> {scannedData.full_name}</div>
              <div><span className="text-muted-foreground">Số GT:</span> {scannedData.id_number}</div>
              {scannedData.date_of_birth && (
                <div><span className="text-muted-foreground">Ngày sinh:</span> {scannedData.date_of_birth}</div>
              )}
              {scannedData.gender && (
                <div><span className="text-muted-foreground">Giới tính:</span> {scannedData.gender === 'male' ? 'Nam' : 'Nữ'}</div>
              )}
            </div>
          )}
          {status === 'error' && (
            <div className="flex-1 flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {errorMessage}
            </div>
          )}
        </div>
      )}

      {/* Success from mobile (no preview image locally) */}
      {!previewUrl && status === 'success' && scannedData && (
        <div className="text-xs space-y-0.5">
          <div className="flex items-center gap-1 text-green-600 font-medium mb-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Đã nhận từ điện thoại
          </div>
          <div><span className="text-muted-foreground">Họ tên:</span> {scannedData.full_name}</div>
          <div><span className="text-muted-foreground">Số GT:</span> {scannedData.id_number}</div>
          {scannedData.date_of_birth && (
            <div><span className="text-muted-foreground">Ngày sinh:</span> {scannedData.date_of_birth}</div>
          )}
        </div>
      )}

      {/* Webcam dialog */}
      <WebcamCaptureDialog
        open={showWebcam}
        onOpenChange={setShowWebcam}
        onCapture={processImage}
      />

      {/* QR Scanner dialog */}
      <QRScannerDialog
        open={showQRScanner}
        onOpenChange={setShowQRScanner}
        onScanSuccess={(data) => {
          setScannedData(data)
          setStatus('success')
          onScanComplete(data, 'cccd')
        }}
      />
    </div>
  )
}
