import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordStrengthMeter } from './PasswordStrengthMeter'
import { createEmailAuthFlow, type EmailAuthMode } from '@/lib/email-auth'
import { resetPasswordSchema } from '@/lib/validations/auth.schemas'

const titles = { signup: 'Xác minh tài khoản', recovery: 'Khôi phục mật khẩu', invite: 'Nhận lời mời nhân viên' }

export function EmailAuthForm({ mode }: { mode: EmailAuthMode }) {
  const [params] = useSearchParams()
  const flow = useRef<ReturnType<typeof createEmailAuthFlow> | null>(null)
  const [email, setEmail] = useState(params.get('email') || '')
  const [step, setStep] = useState<'email' | 'code' | 'password' | 'done'>(mode === 'recovery' ? 'email' : 'code')
  const [code, setCode] = useState(''), [password, setPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [cooldown, setCooldown] = useState(mode === 'signup' ? 60 : 0)
  useEffect(() => {
    const instance = createEmailAuthFlow(); flow.current = instance
    return () => { flow.current = null; void instance.dispose() }
  }, [mode])
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(n => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])
  const run = async (action: () => Promise<void>) => {
    if (busy || !flow.current) return
    setBusy(true); setError('')
    try { await action() } catch (err) { setError(err instanceof Error ? err.message : 'Không thể xử lý. Vui lòng thử lại.') }
    finally { setBusy(false) }
  }
  const send = () => run(async () => {
    await flow.current!.send(mode, email); setCode(''); setCooldown(60); setStep('code')
  })
  const submit = () => run(async () => {
    if (step === 'email') { await flow.current!.send(mode, email); setCooldown(60); setStep('code'); return }
    if (step === 'code') { await flow.current!.verify(mode, email, code); setCode(''); setStep(mode === 'signup' ? 'done' : 'password'); return }
    if (step === 'password') {
      const validated = resetPasswordSchema.safeParse({ password, confirmPassword })
      if (!validated.success) throw new Error(validated.error.issues[0].message)
      await flow.current!.finish(mode, password); setPassword(''); setConfirmPassword(''); setStep('done')
    }
  })
  return <Card className="w-full max-w-md">
    <CardHeader><CardTitle>{step === 'done' ? 'Hoàn tất' : titles[mode]}</CardTitle><CardDescription>
      {step === 'email' ? 'Nhập email để nhận mã khôi phục tài khoản.' : step === 'code'
        ? mode === 'recovery' ? 'Nếu email đã đăng ký, bạn sẽ nhận được mã khôi phục. Kiểm tra cả thư rác.' : 'Nhập email và mã trong thư RoomQC. Mã chỉ dùng một lần và có thời hạn.'
        : step === 'password' ? 'Tự đặt mật khẩu để hoàn tất. Không chia sẻ mật khẩu với người khác.'
        : mode === 'signup' ? 'Email đã được xác minh. Đăng nhập để tiếp tục thiết lập khách sạn.' : 'Bạn có thể đăng nhập bằng mật khẩu vừa đặt.'}
    </CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {step !== 'done' && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit() }}>
        {(step === 'email' || step === 'code') && <div className="space-y-2"><Label htmlFor="email-auth-email">Email</Label><Input id="email-auth-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></div>}
        {step === 'code' && <div className="space-y-2"><Label htmlFor="email-auth-code">Mã xác minh 6 chữ số</Label><Input id="email-auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} disabled={busy} className="text-center text-xl tracking-[0.4em]" /></div>}
        {step === 'password' && <><div className="space-y-2"><Label htmlFor="email-auth-password">Mật khẩu mới</Label><Input id="email-auth-password" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /><PasswordStrengthMeter password={password} /></div><div className="space-y-2"><Label htmlFor="email-auth-confirm">Nhập lại mật khẩu</Label><Input id="email-auth-confirm" type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={busy} /></div></>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{step === 'email' ? 'Gửi mã khôi phục' : step === 'code' ? 'Xác minh mã' : 'Hoàn tất'}</Button>
      </form>}
      {step === 'code' && (mode === 'invite'
        ? <p className="text-sm text-muted-foreground">Chưa nhận được hoặc mã hết hạn? Nhờ quản lý gửi lại lời mời.</p>
        : <Button variant="outline" className="w-full" disabled={busy || cooldown > 0 || !email} onClick={send}>{cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã'}</Button>)}
      <Button variant={step === 'done' ? 'default' : 'ghost'} className="w-full" asChild><Link to="/auth/login">{step === 'done' ? 'Đăng nhập' : 'Quay lại đăng nhập'}</Link></Button>
    </CardContent>
  </Card>
}
