import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUser } from '@/hooks/useUser'
import { useProfile } from '@/hooks/useProfile'
import { UserAvatar } from '@/components/users/UserAvatar'
import { profileFormSchema, ProfileFormData } from '@/lib/validations/user.schemas'
import { Loader2 } from 'lucide-react'

export function ProfileForm() {
  const { user } = useUser()
  const { updateProfile, isUpdating } = useProfile()

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: user?.full_name || '',
      phone: user?.phone || '',
      avatarUrl: user?.avatar_url || '',
    },
  })

  const onSubmit = (data: ProfileFormData) => {
    updateProfile({
      full_name: data.fullName,
      phone: data.phone,
      avatar_url: data.avatarUrl,
    })
  }

  if (!user) return null

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex items-center gap-6">
        <UserAvatar user={user} size="lg" />
        <div className="flex-1">
          <Label htmlFor="avatarUrl">URL ảnh đại diện</Label>
          <Input
            id="avatarUrl"
            placeholder="https://example.com/avatar.jpg"
            {...form.register('avatarUrl')}
          />
          {form.formState.errors.avatarUrl && (
            <p className="mt-1 text-sm text-destructive">
              {form.formState.errors.avatarUrl.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fullName">Họ và tên</Label>
          <Input
            id="fullName"
            {...form.register('fullName')}
          />
          {form.formState.errors.fullName && (
            <p className="text-sm text-destructive">
              {form.formState.errors.fullName.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Số điện thoại</Label>
          <Input
            id="phone"
            placeholder="0123456789"
            {...form.register('phone')}
          />
          {form.formState.errors.phone && (
            <p className="text-sm text-destructive">
              {form.formState.errors.phone.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Email</Label>
        <Input value={user.email} disabled />
        <p className="text-sm text-muted-foreground">
          Email không thể thay đổi
        </p>
      </div>

      <Button type="submit" disabled={isUpdating}>
        {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Lưu thay đổi
      </Button>
    </form>
  )
}
