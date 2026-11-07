import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProfile } from '@/hooks/useProfile'
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter'
import { changePasswordSchema, ChangePasswordData } from '@/lib/validations/user.schemas'
import { Loader2 } from 'lucide-react'

export function ChangePasswordForm() {
  const { changePasswordAsync, checkPasswordChangeAsync, isChangingPassword } = useProfile()

  const form = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const newPassword = form.watch('newPassword')

  const onSubmit = async (data: ChangePasswordData) => {
    try {
      await changePasswordAsync({ currentPassword: data.currentPassword, newPassword: data.newPassword })
      form.reset()
    } catch {
      // The mutation displays a safe error. Keep inputs for correction/recovery.
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-sm text-muted-foreground">Nếu bị mất kết nối sau khi gửi, hãy kiểm tra lần đổi trước trước khi gửi lại.</p>
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
        <Input
          id="currentPassword"
          type="password"
          {...form.register('currentPassword')}
        />
        {form.formState.errors.currentPassword && (
          <p className="text-sm text-destructive">
            {form.formState.errors.currentPassword.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">Mật khẩu mới</Label>
        <Input
          id="newPassword"
          type="password"
          {...form.register('newPassword')}
        />
        <PasswordStrengthMeter password={newPassword} />
        {form.formState.errors.newPassword && (
          <p className="text-sm text-destructive">
            {form.formState.errors.newPassword.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
        <Input
          id="confirmPassword"
          type="password"
          {...form.register('confirmPassword')}
        />
        {form.formState.errors.confirmPassword && (
          <p className="text-sm text-destructive">
            {form.formState.errors.confirmPassword.message}
          </p>
        )}
      </div>

      <Button type="button" variant="outline" disabled={isChangingPassword}
        onClick={() => { void checkPasswordChangeAsync().catch(() => {}) }}>
        Kiểm tra lần đổi trước
      </Button>
      <Button type="submit" disabled={isChangingPassword || form.formState.isSubmitting}>
        {isChangingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Đổi mật khẩu
      </Button>
    </form>
  )
}
