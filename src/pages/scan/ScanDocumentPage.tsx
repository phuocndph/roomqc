import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Camera, Loader2, CheckCircle2, AlertCircle, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'
import { compressImage } from '@/lib/imageCompression'

type Status = 'idle' | 'uploading' | 'scanning' | 'success' | 'error'

export default function ScanDocumentPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [status, setStatus] = useState<Status>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [sessionData, setSessionData] = useState<any>(null)
  const [sessionInvalid, setSessionInvalid] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!sessionId) return
    const autoOpen = async () => {
      let session: any = null
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-scan-session?sessionId=${sessionId}`,
          { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
        )
        const json = await resp.json()
        session = json?.session
      } catch (_) { /* an unavailable scan session is handled below */ }
      if (!session || session.status !== 'pending') {
        setSessionInvalid(true)
        setStatus('error')
        setErrorMsg('Phiên quét không hợp lệ hoặc đã hoàn thành')
        return
      }
      setSessionData(session)
      setTimeout(() => fileInputRef.current?.click(), 300)
    }
    autoOpen()
  }, [sessionId])

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (!sessionId) return

    setStatus('uploading')
    setErrorMsg('')

    try {
      // mobile-scan-upload (service role) re-validates session status server-side
      // and accepts both 'pending' and 'failed' (auto-resetting failed→pending).

      // Compress image
      const base64 = await compressImage(file, 0.8, 1024, 1024)
      setPreviewUrl(base64)
      setStatus('scanning')

      // Single API call - server handles OCR + storage upload + session update
      const { data: result, error: fnError } = await supabase.functions.invoke('mobile-scan-upload', {
        body: {
          sessionId,
          imageBase64: base64,
          documentType: sessionData?.document_type,
        },
      })

      if (fnError) throw fnError
      if (result?.error) throw new Error(result.error)

      setStatus('success')
    } catch (err: any) {
      console.error('[ScanDoc] Error:', err)
      setStatus('error')
      setErrorMsg(err.message || 'Lỗi khi quét giấy tờ')
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">Link không hợp lệ</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <ScanLine className="h-8 w-8 mx-auto text-primary" />
          <h1 className="text-lg font-semibold">Chụp giấy tờ tùy thân</h1>
          <p className="text-xs text-muted-foreground">
            Chụp ảnh rõ nét để trích xuất thông tin tự động
          </p>
        </div>

        {status === 'idle' && (
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full h-12"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="h-5 w-5 mr-2" />
              Chụp ảnh giấy tờ
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {(status === 'uploading' || status === 'scanning') && (
          <div className="text-center space-y-3 py-6">
            {previewUrl && (
              <img src={previewUrl} alt="Preview" className="w-full rounded-lg border" />
            )}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {status === 'uploading' ? 'Đang xử lý ảnh...' : 'Đang trích xuất thông tin...'}
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center space-y-3 py-6">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-600">Đã quét thành công!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Thông tin đã được gửi về máy tính. Bạn có thể đóng trang này.
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-3 py-6">
            <AlertCircle className="h-12 w-12 mx-auto text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-600">Lỗi quét giấy tờ</p>
              <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setStatus('idle'); setPreviewUrl(null) }}
            >
              Thử lại
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
