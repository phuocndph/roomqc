import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useUser } from '@/hooks/useUser'
import { useProfile } from '@/hooks/useProfile'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { navigateBack } from '@/lib/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User, Mail, Lock, Save, MessageCircle, Loader2, Upload } from 'lucide-react'
import { TelegramConnectionCard } from '@/components/profile/TelegramConnectionCard'
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter'
import { useSelfProfileForm } from '@/hooks/useSelfProfileForm'
import { uploadSelfProfileAvatar, ProfileIdentityChangedError, ProfileSaveNotConfirmedError } from '@/lib/self-profile'
import { getFriendlyError } from '@/lib/errorMessage'
import { toast } from 'sonner'
import {
  ProfileFormData,
  changePasswordSchema,
  ChangePasswordData,
} from '@/lib/validations/user.schemas'

const getUserLevelLabel = (code?: string | null) => {
  switch (code) {
    case 'super_admin':
      return 'Quản trị hệ thống'
    case 'tenant_owner':
      return 'Chủ khách sạn'
    case 'manager':
      return 'Quản lý'
    case 'staff':
      return 'Nhân viên'
    default:
      return code || 'Chưa xác định'
  }
}

export const MobileUserProfilePage = () => {
  const navigate = useNavigate()
  const { user, refetch } = useUser()
  const { updateProfile, changePasswordAsync, checkPasswordChangeAsync, isUpdating, isChangingPassword } = useProfile()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const currentIdentity = useRef(user?.id)
  currentIdentity.current = user?.id

  const profileForm = useSelfProfileForm(user)

  const passwordForm = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  const newPassword = passwordForm.watch('newPassword')
  const currentAvatarUrl = profileForm.watch('avatarUrl')

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return

    setIsUploadingAvatar(true)
    try {
      const saved = await uploadSelfProfileAvatar(user.id, file, () => currentIdentity.current === user.id)
      if (currentIdentity.current !== saved.id) return
      profileForm.resetField('avatarUrl', {defaultValue: saved.avatar_url || ''})
      await refetch()
      if (currentIdentity.current !== saved.id) return
      toast.success('Tải ảnh đại diện thành công')
    } catch (error: unknown) {
      if (!(error instanceof ProfileIdentityChangedError)) {
        toast.error(error instanceof ProfileSaveNotConfirmedError ? error.message : getFriendlyError(error))
      }
    } finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const onUpdateProfile = (data: ProfileFormData) => {
    updateProfile({
      full_name: data.fullName,
      phone: data.phone ?? '',
      avatar_url: data.avatarUrl ?? '',
    })
  }

  const onChangePassword = async (data: ChangePasswordData) => {
    try {
      await changePasswordAsync({ currentPassword: data.currentPassword, newPassword: data.newPassword })
      passwordForm.reset()
    } catch { /* Preserve input until the server confirms completion. */ }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title="Thông tin cá nhân"
        onBack={() => navigateBack(navigate, '/settings')}
      />

      <div className="p-4 space-y-4">
        {/* Current Info Display */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Thông tin hiện tại
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Email:</span>
              <span className="font-medium text-xs break-all text-right">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cấp bậc:</span>
              <Badge variant="secondary">{getUserLevelLabel(user?.user_level_code)}</Badge>
            </div>
            {user?.hotel?.name && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Khách sạn:</span>
                <span className="font-medium text-xs text-right">{user.hotel.name}</span>
              </div>
            )}
            {user?.position?.name && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Vị trí:</span>
                <span className="font-medium text-xs text-right">{user.position.name}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Update Profile Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Cập nhật thông tin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={profileForm.handleSubmit(onUpdateProfile)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Họ và tên</Label>
                <Input
                  id="fullName"
                  placeholder="Nguyễn Văn A"
                  {...profileForm.register('fullName')}
                />
                {profileForm.formState.errors.fullName && (
                  <p className="text-xs text-destructive">{profileForm.formState.errors.fullName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0901234567"
                  {...profileForm.register('phone')}
                />
                {profileForm.formState.errors.phone && (
                  <p className="text-xs text-destructive">{profileForm.formState.errors.phone.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Ảnh đại diện</Label>
                <input type="hidden" {...profileForm.register('avatarUrl')} />
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={currentAvatarUrl || undefined} alt={user?.full_name || ''} />
                    <AvatarFallback>
                      {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      aria-label="Chọn ảnh đại diện"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar || isUpdating}
                      className="w-full"
                    >
                      {isUploadingAvatar ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {isUploadingAvatar ? 'Đang tải...' : 'Tải ảnh từ máy'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP, GIF tối đa 5MB</p>
                  </div>
                </div>
                {profileForm.formState.errors.avatarUrl && (
                  <p className="text-xs text-destructive">{profileForm.formState.errors.avatarUrl.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isUpdating || isUploadingAvatar}
              >
                {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {isUpdating ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change Password Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Đổi mật khẩu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  {...passwordForm.register('currentPassword')}
                />
                {passwordForm.formState.errors.currentPassword && (
                  <p className="text-xs text-destructive">{passwordForm.formState.errors.currentPassword.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">Mật khẩu mới</Label>
                <Input
                  id="newPassword"
                  type="password"
                  {...passwordForm.register('newPassword')}
                />
                <PasswordStrengthMeter password={newPassword} />
                {passwordForm.formState.errors.newPassword && (
                  <p className="text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  {...passwordForm.register('confirmPassword')}
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                variant="secondary"
                disabled={isChangingPassword || passwordForm.formState.isSubmitting}
              >
                {isChangingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                {isChangingPassword ? 'Đang đổi...' : 'Đổi mật khẩu'}
              </Button>
              <Button type="button" variant="outline" className="w-full" disabled={isChangingPassword}
                onClick={() => { void checkPasswordChangeAsync().catch(() => {}) }}>
                Kiểm tra lần đổi trước
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Telegram Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Kết nối Telegram
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TelegramConnectionCard compact />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
