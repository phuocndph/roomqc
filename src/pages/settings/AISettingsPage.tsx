import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { ArrowLeft, Brain, Loader2, RotateCcw, Save, TestTube } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useTenant } from '@/hooks/useTenant'
import { getFriendlyError } from '@/lib/errorMessage'
import { toast } from 'sonner'

interface AIModel { id: string; vision: boolean }
const DEFAULT_MODEL = 'gemini-2.5-flash'
const FALLBACK_MODELS: AIModel[] = [
  { id: DEFAULT_MODEL, vision: true },
  { id: 'gemini-3-flash', vision: true },
]
const FALLBACK_CHAIN = [DEFAULT_MODEL, 'gemini-3-flash', 'glm-4.7-flash', 'glm-4.5-flash', 'openai/gpt-oss-120b']
const TEST_IMAGE = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgB//Z'

export default function AISettingsPage() {
  const navigate = useNavigate()
  const { user, role, isLoading: userLoading } = useUser()
  const { tenant, isLoading: tenantLoading, error: tenantError } = useTenant()
  const isAdmin = role === 'super_admin' || role === 'owner' || user?.user_level_code === 'tenant_owner' || user?.is_super_admin
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Quay lại" onClick={() => navigateBack(navigate, '/settings/general')}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><Brain className="h-5 w-5" />Cài đặt AI</h1>
          <p className="text-sm text-muted-foreground">Chọn AI để đọc ảnh giấy tờ của khách</p>
        </div>
      </div>
      {userLoading || tenantLoading ? (
        <p role="status" className="py-6 text-sm">Đang tải thông tin doanh nghiệp…</p>
      ) : !isAdmin ? (
        <Alert variant="destructive"><AlertTitle>Không có quyền truy cập</AlertTitle><AlertDescription>Trang này chỉ dành cho chủ doanh nghiệp và quản trị viên hệ thống.</AlertDescription></Alert>
      ) : tenantError || !tenant?.id || !user?.id ? (
        <Alert variant="destructive"><AlertTitle>Chưa tải được thông tin doanh nghiệp</AlertTitle><AlertDescription>Vui lòng tải lại trang. Nếu vẫn gặp lỗi, hãy kiểm tra tài khoản đang đăng nhập.</AlertDescription></Alert>
      ) : <AISettingsEditor key={tenant.id} tenantId={tenant.id} userId={user.id} />}
    </div>
  )
}

function AISettingsEditor({ tenantId, userId }: { tenantId: string; userId: string }) {
  const queryClient = useQueryClient()
  const settingsKey = useMemo(() => ['ai-settings', tenantId], [tenantId])
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_settings').select('config_key, config_value').eq('tenant_id', tenantId)
      if (error) throw error
      return data || []
    },
    retry: 1,
    refetchOnWindowFocus: false,
  })
  const modelList = useQuery({
    queryKey: ['ai-models', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('beeknoee-models', { body: {} })
      if (error) throw error
      const models = (data?.data as AIModel[] | undefined)?.filter(model => typeof model.id === 'string' && model.vision === true)
      if (!models?.length) throw new Error('Không có model hỗ trợ ảnh')
      return models
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const [draftModel, setDraftModel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ error: boolean; message: string } | null>(null)
  const savedModel = settings.data?.find(row => row.config_key === 'ocr_model')?.config_value || DEFAULT_MODEL
  const ocrModel = draftModel ?? savedModel
  const isDirty = ocrModel !== savedModel
  const ready = settings.isSuccess && !settings.isFetching
  const models = modelList.data || FALLBACK_MODELS
  const currentModelAvailable = models.some(model => model.id === ocrModel)
  const chain = [ocrModel, ...FALLBACK_CHAIN.filter(model => model !== ocrModel)]
  const busy = saving || testing
  const changeModel = (value: string) => { setDraftModel(value); setTestResult(null) }

  const handleSave = async () => {
    if (!ready || busy || !isDirty || !currentModelAvailable) return
    const selectedModel = ocrModel
    setSaving(true)
    setTestResult(null)
    try {
      const { data, error } = await supabase.from('ai_settings')
        .upsert({ tenant_id: tenantId, config_key: 'ocr_model', config_value: selectedModel, updated_by: userId }, { onConflict: 'tenant_id,config_key' })
        .select('config_key, config_value').single()
      if (error) throw error
      if (!data || data.config_value !== selectedModel) throw new Error('Chưa xác nhận cấu hình đã lưu')
      queryClient.setQueryData(settingsKey, [
        ...(settings.data || []).filter(row => row.config_key !== data.config_key),
        { config_key: data.config_key, config_value: data.config_value },
      ])
      setDraftModel(null)
      toast.success('Đã lưu cấu hình AI')
    } catch (error) {
      toast.error('Chưa lưu được cấu hình AI', { description: getFriendlyError(error) })
    } finally { setSaving(false) }
  }

  const handleTest = async () => {
    if (!ready || busy || isDirty) return
    setTesting(true)
    setTestResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('scan-guest-document', { body: { imageBase64: TEST_IMAGE, documentType: 'cccd' } })
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const response = error.context as Response
          const body = await response.clone().json().catch(() => null)
          if (response.status === 422 && typeof body?.error === 'string' && (
            body.error.startsWith('Ảnh không phải giấy tờ tùy thân') || body.error.startsWith('Không thể trích xuất thông tin từ ảnh')
          )) {
            setTestResult({ error: false, message: 'AI đã phản hồi ảnh thử và không nhận diện được giấy tờ. Để kiểm tra độ chính xác, hãy thử quét giấy tờ ở mục Khách lưu trú.' })
            return
          }
          const message = response.status === 401 || response.status === 403
            ? 'Chưa xác thực được yêu cầu. Hãy kiểm tra phiên đăng nhập và cấu hình AI trên máy chủ.'
            : response.status === 429 ? 'Dịch vụ AI đang giới hạn lượt gọi. Vui lòng thử lại sau.'
              : 'Dịch vụ AI chưa xử lý được yêu cầu. Hãy kiểm tra cấu hình trên máy chủ rồi thử lại.'
          setTestResult({ error: true, message })
          return
        }
        throw error
      }
      if (data?.error || !data?.data || typeof data?.model !== 'string') {
        setTestResult({ error: true, message: 'Phản hồi chưa hợp lệ; chưa thể xác nhận AI hoạt động. Vui lòng thử lại.' })
        return
      }
      setTestResult({ error: false, message: `Máy chủ đã trả kết quả qua ${data.model}. Đây là ảnh thử, cần quét giấy tờ thật để kiểm tra độ chính xác.` })
    } catch (error) {
      setTestResult({ error: true, message: getFriendlyError(error) })
    } finally { setTesting(false) }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4">
        <p className="text-sm">Nhà cung cấp <strong>Beeknoee</strong></p><Badge variant="outline">Đọc giấy tờ từ ảnh</Badge>
      </div>
      {settings.isPending ? <p role="status" className="py-6 text-sm">Đang tải cấu hình AI…</p> : settings.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Không tải được cấu hình AI đã lưu</AlertTitle>
          <AlertDescription>Chưa thể chỉnh sửa cấu hình. Vui lòng kiểm tra kết nối rồi thử lại.</AlertDescription>
          <Button variant="outline" className="mt-3" onClick={() => settings.refetch()} disabled={settings.isFetching}>{settings.isFetching ? 'Đang tải lại…' : 'Thử lại'}</Button>
        </Alert>
      ) : (
        <section className="space-y-3 rounded-lg border p-4">
          <Label htmlFor="ocr-model" className="text-base font-semibold">AI đọc giấy tờ</Label>
          <p className="text-sm text-muted-foreground">Chọn model hỗ trợ ảnh. Nếu model chính gặp lỗi, hệ thống sẽ thử model dự phòng.</p>
          <Select value={ocrModel} onValueChange={changeModel} disabled={!ready || busy}>
            <SelectTrigger id="ocr-model"><SelectValue placeholder="Chọn model" /></SelectTrigger>
            <SelectContent>
              {!currentModelAvailable && <SelectItem value={ocrModel}>{ocrModel} (đã lưu, chưa có trong danh sách)</SelectItem>}
              {models.map(model => <SelectItem key={model.id} value={model.id}>{model.id}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-sm" role="status">{isDirty ? 'Có thay đổi chưa lưu.' : `Đang dùng: ${savedModel}`}</p>
          {modelList.isPending && <p role="status" className="text-sm text-muted-foreground">Đang cập nhật danh sách model…</p>}
          {modelList.isError && (
            <Alert className="border-amber-700">
              <AlertTitle>Chưa cập nhật được danh sách model</AlertTitle><AlertDescription>Đang dùng danh sách dự phòng. Cấu hình đã lưu vẫn được giữ nguyên.</AlertDescription>
              <Button variant="outline" className="mt-3" onClick={() => modelList.refetch()} disabled={modelList.isFetching}>{modelList.isFetching ? 'Đang cập nhật…' : 'Tải lại danh sách'}</Button>
            </Alert>
          )}
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-sm font-medium">Thứ tự thử các model</summary>
            <ol className="mt-2 list-inside list-decimal space-y-1 break-all text-sm text-muted-foreground">{chain.map(model => <li key={model}>{model}</li>)}</ol>
          </details>
        </section>
      )}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="flex items-center gap-2 font-semibold"><TestTube className="h-4 w-4" />Kiểm tra kết nối</h2>
        <p className="text-sm text-muted-foreground">Gửi một ảnh thử trống bằng cấu hình đã lưu. Kết quả này chỉ kiểm tra phản hồi AI, chưa đánh giá khả năng đọc giấy tờ.</p>
        {isDirty && <p className="text-sm font-medium">Lưu thay đổi trước khi chạy thử.</p>}
        <Button variant="outline" onClick={handleTest} disabled={!ready || busy || isDirty}>
          {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{testing ? 'Đang kiểm tra…' : 'Chạy thử'}
        </Button>
        {testResult && (
          <Alert variant={testResult.error ? 'destructive' : 'default'} role="status">
            <AlertTitle>{testResult.error ? 'Chưa kiểm tra thành công' : 'Đã nhận phản hồi'}</AlertTitle><AlertDescription>{testResult.message}</AlertDescription>
          </Alert>
        )}
      </section>
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={() => changeModel(DEFAULT_MODEL)} disabled={!ready || busy || ocrModel === DEFAULT_MODEL}><RotateCcw className="mr-2 h-4 w-4" />Đặt lại mặc định</Button>
        <Button onClick={handleSave} disabled={!ready || busy || !isDirty || !currentModelAvailable}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? 'Đang lưu…' : 'Lưu cấu hình'}
        </Button>
      </div>
    </>
  )
}
