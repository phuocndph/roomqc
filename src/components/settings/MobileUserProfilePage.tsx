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
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import {
  profileFormSchema,
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
  const { updateProfile, changePassword, isUpdating, isChangingPassword } = useProfile()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    values: {
      fullName: user?.full_name || '',
      phone: user?.phone || '',
      avatarUrl: user?.avatar_url || '',
    },
  })

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

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn tệp ảnh')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Kích thước ảnh tối đa 5MB')
      return
    }

    setIsUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const filePath = `${user.id}/avatar-${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, cacheControl: '3600' })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      profileForm.setValue('avatarUrl', publicUrl, { shouldDirty: true })

      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user.id)
      await refetch()

      toast.success('Tải ảnh đại diện thành công')
    } catch (err: any) {
      toast.error('Lỗi khi tải ảnh: ' + (err.message || 'Không xác định'))
    } finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const onUpdateProfile = (data: ProfileFormData) => {
    updateProfile({
      full_name: data.fullName,
      phone: data.phone || undefined,
      avatar_url: data.avatarUrl || undefined,
    })
  }

  const onChangePassword = (data: ChangePasswordData) => {
    changePassword(data.newPassword)
    passwordForm.reset()
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
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className="w-full"
                    >
                      {isUploadingAvatar ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {isUploadingAvatar ? 'Đang tải...' : 'Tải ảnh từ máy'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG tối đa 5MB</p>
                  </div>
                </div>
                {profileForm.formState.errors.avatarUrl && (
                  <p className="text-xs text-destructive">{profileForm.formState.errors.avatarUrl.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isUpdating}
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
                disabled={isChangingPassword}
              >
                {isChangingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
                {isChangingPassword ? 'Đang đổi...' : 'Đổi mật khẩu'}
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
