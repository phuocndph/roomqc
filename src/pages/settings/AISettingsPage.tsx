import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { ArrowLeft, Brain, Loader2, RotateCcw, Save, Sparkles, TestTube, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useTenant } from '@/hooks/useTenant'
import { toast } from 'sonner'

interface BeeknoeeModel {
  id: string
  owned_by: string
  context_window: number | null
  vision: boolean
}

const FALLBACK_MODELS: BeeknoeeModel[] = [
  { id: 'gemini-2.5-flash', owned_by: 'google', context_window: 1000000, vision: true },
  { id: 'gemini-3-flash', owned_by: 'google', context_window: 1000000, vision: true },
  { id: 'gemini-2.5-flash-lite', owned_by: 'google', context_window: 1000000, vision: false },
  { id: 'glm-4.7-flash', owned_by: 'z-ai', context_window: 128000, vision: false },
  { id: 'glm-4.5-flash', owned_by: 'z-ai', context_window: 128000, vision: false },
  { id: 'openai/gpt-oss-120b', owned_by: 'openai', context_window: 128000, vision: false },
]

const DEFAULT_MODEL = 'gemini-2.5-flash'
const FALLBACK_CHAIN = ['gemini-2.5-flash', 'gemini-3-flash', 'glm-4.7-flash', 'glm-4.5-flash', 'openai/gpt-oss-120b']

export default function AISettingsPage() {
  const navigate = useNavigate()
  const { user, role } = useUser()
  const { tenant } = useTenant()

  const isAdmin = role === 'super_admin' || role === 'owner' || (user as any)?.user_level_code === 'tenant_owner' || (user as any)?.is_super_admin

  const [models, setModels] = useState<BeeknoeeModel[]>(FALLBACK_MODELS)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  const [ocrModel, setOcrModel] = useState<string>(DEFAULT_MODEL)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  // Load saved settings from DB
  useEffect(() => {
    if (!tenant?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await (supabase as any)
        .from('ai_settings')
        .select('config_key, config_value')
        .eq('tenant_id', tenant.id)
      if (cancelled) return
      const map: Record<string, string> = {}
      for (const row of data || []) map[row.config_key] = row.config_value
      setOcrModel(map.ocr_model || DEFAULT_MODEL)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [tenant?.id])

  // Fetch live model list
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setModelsLoading(true)
      setModelsError(null)
      try {
        const { data, error } = await supabase.functions.invoke('beeknoee-models', { body: {} })
        if (cancelled) return
        if (error) {
          setModelsError(error.message || 'Không lấy được danh sách model')
        } else if (data?.data?.length) {
          setModels(data.data as BeeknoeeModel[])
        }
      } catch (e: any) {
        if (!cancelled) setModelsError(e?.message || 'Lỗi tải model')
      } finally {
        if (!cancelled) setModelsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visionModels = useMemo(() => models.filter((m) => m.vision), [models])

  const handleSave = async () => {
    if (!tenant?.id || !user?.id) return
    setSaving(true)
    try {
      const { error } = await (supabase as any)
        .from('ai_settings')
        .upsert(
          { tenant_id: tenant.id, config_key: 'ocr_model', config_value: ocrModel, updated_by: user.id },
          { onConflict: 'tenant_id,config_key' },
        )
      if (error) throw error
      toast.success('Đã lưu cấu hình AI')
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Lỗi khi lưu cấu hình')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setOcrModel(DEFAULT_MODEL)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // Tiny 1x1 jpeg to validate API path quickly (no real OCR result expected)
      // Use a small fake CCCD test - pass a base64 of a simple white pixel; AI sẽ trả is_valid_document=false
      const testBase64 =
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgB//Z'
      const { data, error } = await supabase.functions.invoke('scan-guest-document', {
        body: {
          imageBase64: testBase64,
          documentType: 'cccd',
          tenantId: tenant?.id,
        },
      })
      if (error) {
        setTestResult(`❌ Lỗi: ${error.message}`)
      } else if (data?.error) {
        // Lỗi 422 (không phải giấy tờ) là OK - chứng tỏ AI hoạt động
        setTestResult(`✅ AI phản hồi (model: ${data.model || 'N/A'}). AI nói: "${data.error}"`)
      } else {
        setTestResult(`✅ Thành công với model ${data?.model || 'N/A'}`)
      }
    } catch (e: any) {
      setTestResult(`❌ Lỗi: ${e?.message || 'Unknown'}`)
    } finally {
      setTesting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="container max-w-3xl py-8">
        <Alert variant="destructive">
          <AlertTitle>Không có quyền truy cập</AlertTitle>
          <AlertDescription>Trang này chỉ dành cho Owner và Super Admin.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/settings/general')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Cài đặt AI
          </h1>
          <p className="text-xs text-muted-foreground">Quản lý nhà cung cấp AI cho phân tích ảnh giấy tờ</p>
        </div>
      </div>

      <Separator />

      {/* Provider info */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Nhà cung cấp AI</span>
          </div>
          <Badge variant="secondary" className="font-mono text-xs">Beeknoee</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Tất cả các yêu cầu phân tích ảnh (OCR giấy tờ tùy thân) sẽ được gửi qua Beeknoee. Khi model chính
          không phản hồi, hệ thống tự động chuyển sang model dự phòng.
        </p>
      </div>

      {/* OCR Model */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600" />
            <Label className="text-sm font-medium">Model OCR chính</Label>
          </div>
          {modelsLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground">
          Dùng để đọc và trích xuất thông tin từ ảnh CCCD, hộ chiếu, visa. Nên chọn model có vision.
        </p>
        {loading ? (
          <div className="h-9 bg-muted animate-pulse rounded" />
        ) : (
          <Select value={ocrModel} onValueChange={setOcrModel}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Chọn model" />
            </SelectTrigger>
            <SelectContent>
              {visionModels.length > 0 ? (
                visionModels.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{m.id}</span>
                      <span className="text-[10px] text-muted-foreground">— {m.owned_by}</span>
                    </div>
                  </SelectItem>
                ))
              ) : (
                models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="font-mono text-xs">{m.id}</span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}
        {modelsError && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-950">
            <AlertTitle className="text-sm">Đang dùng danh sách model mặc định</AlertTitle>
            <AlertDescription className="text-xs text-amber-900">
              Không tải được danh sách model mới từ máy chủ. Bạn vẫn có thể tiếp tục với các model đang hiển thị;
              hãy thử lại sau nếu cần cập nhật danh sách.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Fallback chain */}
      <div className="border rounded-lg p-4 space-y-2">
        <Label className="text-sm font-medium">Chuỗi model dự phòng</Label>
        <p className="text-xs text-muted-foreground">
          Nếu model chính fail, hệ thống thử lần lượt các model sau (cố định, không cấu hình được):
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {FALLBACK_CHAIN.map((m, i) => (
            <Badge key={m} variant={m === ocrModel ? 'default' : 'outline'} className="font-mono text-[10px]">
              {i + 1}. {m}
            </Badge>
          ))}
        </div>
      </div>

      {/* Test */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium flex items-center gap-2">
            <TestTube className="h-4 w-4 text-primary" />
            Kiểm tra kết nối
          </Label>
          <Button size="sm" variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Chạy thử
          </Button>
        </div>
        {testResult && (
          <div className="text-xs font-mono p-2 rounded bg-muted whitespace-pre-wrap">{testResult}</div>
        )}
      </div>

      {/* Actions */}
      <div className="sticky bottom-4 z-20 flex items-center justify-end gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Đặt lại mặc định
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          Lưu cấu hình
        </Button>
      </div>
    </div>
  )
}
