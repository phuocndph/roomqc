import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { controlRequest } from '@/lib/workspace'

export default function WorkspaceStart() {
  const [params] = useSearchParams()
  const login = params.get('mode') === 'login'
  const [slug, setSlug] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const validSlug = /^[a-z][a-z0-9-]{2,47}$/.test(slug) && !slug.endsWith('-') && !slug.includes('--')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    if (!validSlug) { setError('Địa chỉ cần 3–48 ký tự chữ thường không dấu, số hoặc dấu gạch ngang; bắt đầu bằng chữ.'); return }
    submitting.current = true
    setBusy(true); setError('')
    try {
      if (login) {
        await controlRequest(`/workspaces/${slug}/bootstrap`)
        window.location.assign(`/app/${slug}/auth/login`)
      } else {
        const result = await controlRequest('/signup-intents', { method: 'POST', body: JSON.stringify({slug,displayName,email}) })
        // Convenience only; this draft grants no authority and contains no password/token.
        try { sessionStorage.setItem(`roomqc-signup:${slug}`, JSON.stringify({email,displayName})) } catch { /* optional */ }
        window.location.assign(`/app/${slug}/auth/${result.path === `/app/${slug}/auth/login` ? 'login' : 'register'}`)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không thể kết nối. Vui lòng thử lại.')
      submitting.current = false; setBusy(false)
    }
  }

  return <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>{login ? 'Mở doanh nghiệp của bạn' : 'Tạo không gian làm việc'}</CardTitle>
        <CardDescription>{login ? 'Nhập địa chỉ doanh nghiệp được quản lý cấp cho bạn.' : 'Chọn địa chỉ riêng cho doanh nghiệp trên RoomQC.'}</CardDescription>
      </CardHeader>
      <CardContent><form onSubmit={submit} className="space-y-5">
        <fieldset disabled={busy} className="space-y-5">
          {!login && <div className="space-y-2"><Label htmlFor="workspace-name">Tên doanh nghiệp / khách sạn</Label>
            <Input id="workspace-name" required minLength={2} maxLength={120} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Khách sạn An Thủy" /></div>}
          <div className="space-y-2"><Label htmlFor="workspace-slug">Địa chỉ doanh nghiệp</Label>
            <Input id="workspace-slug" required autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={48} value={slug} onChange={e => setSlug(e.target.value.trim().toLowerCase())} placeholder="anthuy" aria-describedby="workspace-preview" />
            <p id="workspace-preview" className="text-sm text-slate-600 break-all">roomqc.com/app/{slug || 'ten-doanh-nghiep'}/</p></div>
          {!login && <div className="space-y-2"><Label htmlFor="workspace-email">Email chủ sở hữu</Label>
            <Input id="workspace-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
            <p className="text-sm text-slate-600">Dùng email này để tạo tài khoản và xác thực ở bước tiếp theo.</p></div>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button className="w-full" type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : login ? 'Tiếp tục đăng nhập' : 'Tiếp tục tạo tài khoản'}</Button>
        </fieldset>
        <a className="block text-center text-sm text-blue-700 underline" href={login ? '/start' : '/start?mode=login'}>{login ? 'Đăng ký doanh nghiệp mới' : 'Đã có doanh nghiệp? Đăng nhập'}</a>
      </form></CardContent>
    </Card>
  </main>
}
