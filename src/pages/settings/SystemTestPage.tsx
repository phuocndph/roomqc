import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, Loader2, RefreshCw, Server, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { runtimeConfig } from '@/lib/runtime-config'
import { getFriendlyError } from '@/lib/errorMessage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type CheckStatus = 'idle' | 'running' | 'pass' | 'warn' | 'fail'

interface CheckResult {
  id: string
  label: string
  detail: string
  status: CheckStatus
  duration?: number
}

const initialChecks: CheckResult[] = [
  { id: 'config', label: 'Cấu hình frontend', detail: 'Chưa kiểm tra', status: 'idle' },
  { id: 'api', label: 'Supabase Auth API', detail: 'Chưa kiểm tra', status: 'idle' },
  { id: 'session', label: 'Phiên đăng nhập', detail: 'Chưa kiểm tra', status: 'idle' },
  { id: 'profile', label: 'Hồ sơ người dùng', detail: 'Chưa kiểm tra', status: 'idle' },
  { id: 'rls', label: 'Đọc dữ liệu qua RLS', detail: 'Chưa kiểm tra', status: 'idle' },
]

function statusIcon(status: CheckStatus) {
  if (status === 'running') return <Loader2 className="h-5 w-5 animate-spin text-primary" />
  if (status === 'pass') return <CheckCircle2 className="h-5 w-5 text-emerald-600" />
  if (status === 'warn') return <CircleAlert className="h-5 w-5 text-amber-600" />
  if (status === 'fail') return <CircleAlert className="h-5 w-5 text-destructive" />
  return <Server className="h-5 w-5 text-muted-foreground" />
}

function statusLabel(status: CheckStatus) {
  if (status === 'running') return 'Đang kiểm tra'
  if (status === 'pass') return 'Đạt'
  if (status === 'warn') return 'Cảnh báo'
  if (status === 'fail') return 'Lỗi'
  return 'Chưa chạy'
}

export default function SystemTestPage() {
  const navigate = useNavigate()
  const { user: authUser } = useAuth()
  const [checks, setChecks] = useState<CheckResult[]>(initialChecks)
  const [running, setRunning] = useState(false)

  const updateCheck = useCallback((id: string, update: Partial<CheckResult>) => {
    setChecks((current) => current.map((check) => (check.id === id ? { ...check, ...update } : check)))
  }, [])

  const runChecks = useCallback(async () => {
    setRunning(true)
    setChecks(initialChecks.map((check) => ({ ...check, status: 'running' })))

    const run = async (id: string, callback: () => Promise<Omit<CheckResult, 'id' | 'label'>>) => {
      const started = performance.now()
      try {
        const result = await callback()
        updateCheck(id, { ...result, duration: Math.round(performance.now() - started) })
      } catch (error) {
        updateCheck(id, {
          status: 'fail',
          detail: getFriendlyError(error),
          duration: Math.round(performance.now() - started),
        })
      }
    }

    await run('config', async () => {
      if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabasePublishableKey) {
        return { status: 'fail', detail: 'Thiếu URL hoặc publishable key của Supabase' }
      }
      return { status: 'pass', detail: `Đang dùng ${new URL(runtimeConfig.supabaseUrl).origin}` }
    })

    await run('api', async () => {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 5000)
      try {
        const response = await fetch(`${runtimeConfig.supabaseUrl.replace(/\/$/, '')}/auth/v1/health`, {
          headers: { apikey: runtimeConfig.supabasePublishableKey },
          signal: controller.signal,
        })
        if (!response.ok) return { status: 'fail', detail: `Auth API trả HTTP ${response.status}` }
        return { status: 'pass', detail: 'Supabase Auth API phản hồi bình thường' }
      } finally {
        window.clearTimeout(timeout)
      }
    })

    await run('session', async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      if (!data.session) return { status: 'warn', detail: 'Chưa có phiên đăng nhập hoạt động' }
      return { status: 'pass', detail: `Đã đăng nhập: ${data.session.user.email ?? data.session.user.id}` }
    })

    await run('profile', async () => {
      if (!authUser?.id) return { status: 'warn', detail: 'Không có user hiện tại để kiểm tra hồ sơ' }
      const { data, error } = await supabase
        .from('users')
        .select('id, tenant_id, hotel_id, status')
        .eq('id', authUser.id)
        .maybeSingle()
      if (error) throw error
      if (!data) return { status: 'warn', detail: 'Auth user chưa có hồ sơ trong bảng users' }
      if (!data.tenant_id) return { status: 'warn', detail: 'Hồ sơ chưa được gán tenant (cần onboarding)' }
      return { status: 'pass', detail: data.hotel_id ? 'Hồ sơ có tenant và khách sạn' : 'Hồ sơ có tenant, chưa có khách sạn' }
    })

    await run('rls', async () => {
      const { error } = await supabase.from('item_categories').select('id').limit(1)
      if (error) throw error
      return { status: 'pass', detail: 'Truy vấn item_categories qua RLS thành công' }
    })

    setRunning(false)
  }, [authUser?.id, updateCheck])

  useEffect(() => {
    void runChecks()
  }, [runChecks])

  const summary = useMemo(() => {
    const pass = checks.filter((check) => check.status === 'pass').length
    const fail = checks.filter((check) => check.status === 'fail').length
    const warn = checks.filter((check) => check.status === 'warn').length
    return { pass, fail, warn }
  }, [checks])

  return (
    <main className="min-h-screen bg-muted/30 p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">RoomQC / Chẩn đoán</p>
            <h1 className="text-2xl font-semibold tracking-tight">Kiểm thử hệ thống</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Kiểm tra kết nối và quyền đọc theo cách chỉ đọc; không tạo, sửa hoặc xóa dữ liệu.
            </p>
          </div>
          <Button onClick={() => void runChecks()} disabled={running} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            Chạy lại
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Kết quả</CardTitle>
            <CardDescription>
              Đạt {summary.pass} · Cảnh báo {summary.warn} · Lỗi {summary.fail}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {checks.map((check) => (
              <div key={check.id} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="mt-0.5">{statusIcon(check.status)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{check.label}</p>
                    <span className="text-xs text-muted-foreground">
                      {statusLabel(check.status)}{check.duration !== undefined ? ` · ${check.duration} ms` : ''}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm text-muted-foreground">{check.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate('/auth/login')}>Về đăng nhập</Button>
          <Button variant="ghost" onClick={() => navigate('/onboarding')}>Mở onboarding</Button>
        </div>
      </div>
    </main>
  )
}
