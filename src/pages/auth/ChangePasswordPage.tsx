import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { passwordChangeFlow } from '@/lib/password-change-client'
import { PasswordChangeError, PasswordIdentityChangedError, type PasswordChangeContext, type PasswordChangeResult } from '@/lib/password-change'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'

const schema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
    .regex(/[A-Z]/, 'Cần ít nhất 1 chữ hoa').regex(/[a-z]/, 'Cần ít nhất 1 chữ thường')
    .regex(/[0-9]/, 'Cần ít nhất 1 số').regex(/[^A-Za-z0-9]/, 'Cần ít nhất 1 ký tự đặc biệt'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, { message: 'Mật khẩu xác nhận không khớp', path: ['confirmPassword'] })
type Values = z.infer<typeof schema>

export default function ChangePasswordPage() {
  const { user, session, updatePassword } = useAuth()
  const queryClient = useQueryClient(), navigate = useNavigate()
  const identity = useRef(user?.id); identity.current = user?.id
  const mounted = useRef(true)
  const [context, setContext] = useState<PasswordChangeContext | null>(null)
  const [contextError, setContextError] = useState('')
  const [recheck, setRecheck] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const form = useForm<Values>({ resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } })
  const finish = useCallback(async (saved: PasswordChangeResult) => {
    await queryClient.invalidateQueries({ queryKey: ['user', saved.id] })
    if (!mounted.current || identity.current !== saved.id) return
    toast.success(saved.completion === 'previous'
      ? 'Lần đổi mật khẩu trước đã được xác nhận hoàn tất.' : 'Đổi mật khẩu thành công!')
    navigate('/auth/callback', { replace: true })
  }, [navigate, queryClient])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { form.reset() }, [user?.id, form])
  useEffect(() => {
    let cancelled = false
    setContext(null); setContextError('')
    if (!user?.id) { setContextError('Vui lòng đăng nhập hoặc mở liên kết khôi phục mật khẩu hợp lệ.'); return }
    const actorId = user.id
    void (async () => {
      try {
        const value = await passwordChangeFlow.context(actorId)
        const saved = await passwordChangeFlow.reconcile(actorId, () => !cancelled && identity.current === actorId)
        if (cancelled || identity.current !== actorId) return
        if (saved) { await finish(saved); return }
        setContext(value)
      } catch (error) {
        if (cancelled || identity.current !== actorId) return
        setContextError(error instanceof PasswordChangeError ? error.message : 'Chưa kiểm tra được phiên. Vui lòng kiểm tra lại kết quả.')
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, session?.access_token, recheck, finish])
  const onSubmit = async (values: Values) => {
    if (!context || context.actorId !== identity.current) return
    if (!context.isRecovery && !values.currentPassword) {
      form.setError('currentPassword', { message: 'Vui lòng nhập mật khẩu hiện tại.' }); return
    }
    setIsSubmitting(true)
    try {
      const { error, data } = await updatePassword(values.newPassword, values.currentPassword || undefined)
      if (error) throw error
      if (!data || data.id !== context.actorId) throw new PasswordChangeError('outcome_unknown', 'Chưa xác nhận được kết quả. Hãy kiểm tra trước khi gửi lại.')
      await finish(data)
    } catch (error) {
      if (mounted.current && identity.current === context.actorId && !(error instanceof PasswordIdentityChangedError)) {
        toast.error(error instanceof PasswordChangeError ? error.message : 'Chưa xác nhận được kết quả. Hãy kiểm tra trước khi gửi lại.')
      }
    } finally { if (mounted.current) setIsSubmitting(false) }
  }
  return <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
    <div className="absolute top-4 right-4"><LanguageSwitcher /></div>
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Đổi mật khẩu</CardTitle>
        <CardDescription>{context?.isRecovery
          ? 'Phiên khôi phục đã được server xác nhận. Hãy đặt mật khẩu mới.'
          : 'Đổi mật khẩu để tiếp tục sử dụng hệ thống.'}</CardDescription>
      </CardHeader>
      <CardContent>
        {!context && !contextError && <p role="status">Đang kiểm tra phiên và lần đổi mật khẩu trước...</p>}
        {contextError && <p role="alert" className="mb-4 text-sm text-destructive">{contextError}</p>}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {context && !context.isRecovery && <div className="space-y-2">
            <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
            <Input id="currentPassword" type="password" autoComplete="current-password" disabled={isSubmitting} {...form.register('currentPassword')} />
            {form.formState.errors.currentPassword && <p role="alert">{form.formState.errors.currentPassword.message}</p>}
          </div>}
          <div className="space-y-2">
            <Label htmlFor="newPassword">Mật khẩu mới</Label>
            <Input id="newPassword" type="password" autoComplete="new-password" disabled={!context || isSubmitting} {...form.register('newPassword')} />
            <PasswordStrengthMeter password={form.watch('newPassword')} />
            {form.formState.errors.newPassword && <p role="alert">{form.formState.errors.newPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
            <Input id="confirmPassword" type="password" autoComplete="new-password" disabled={!context || isSubmitting} {...form.register('confirmPassword')} />
            {form.formState.errors.confirmPassword && <p role="alert">{form.formState.errors.confirmPassword.message}</p>}
          </div>
          <p className="text-sm text-muted-foreground">Nếu mất kết nối sau khi gửi, kiểm tra kết quả trước khi gửi lại. Không cần nhập lại mật khẩu để kiểm tra.</p>
          <Button type="button" variant="outline" className="w-full" disabled={isSubmitting}
            onClick={() => setRecheck(value => value + 1)}>Kiểm tra và tiếp tục</Button>
          <Button type="submit" className="w-full" disabled={!context || !!contextError || isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Đổi mật khẩu
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
}
