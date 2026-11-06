import { useMutation, useQueryClient } from '@tanstack/react-query'
import { passwordChangeFlow } from '@/lib/password-change-client'
import { PasswordChangeError, PasswordIdentityChangedError, type PasswordChangeResult } from '@/lib/password-change'
import { useToast } from '@/hooks/use-toast'
import { useUser } from './useUser'
import { getFriendlyError } from '@/lib/errorMessage'
import { useRef } from 'react'
import { saveSelfProfile, ProfileIdentityChangedError, ProfileSaveNotConfirmedError, type SelfProfileUpdates } from '@/lib/self-profile'

export function useProfile() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { user } = useUser()
  const currentIdentity = useRef(user?.id)
  currentIdentity.current = user?.id

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: SelfProfileUpdates) => {
      if (!user?.id) throw new ProfileSaveNotConfirmedError('Vui lòng đăng nhập lại trước khi sửa hồ sơ.')
      const actorId = user.id
      const saved = await saveSelfProfile(actorId, updates)
      if (currentIdentity.current !== actorId) throw new ProfileIdentityChangedError()
      return saved
    },
    onSuccess: saved => {
      queryClient.invalidateQueries({ queryKey: ['user', saved.id] })
      toast({
        title: 'Cập nhật thành công',
        description: 'Thông tin cá nhân đã được cập nhật',
      })
    },
    onError: (error: unknown) => {
      if (error instanceof ProfileIdentityChangedError) return
      toast({
        title: 'Lỗi',
        description: error instanceof ProfileSaveNotConfirmedError ? error.message : getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })

  const passwordSuccess = async (saved: PasswordChangeResult | null) => {
    if (!saved) { toast({ title: 'Không có lần đổi mật khẩu đang chờ xác nhận' }); return }
    if (currentIdentity.current !== saved.id) return
    await queryClient.invalidateQueries({ queryKey: ['user', saved.id] })
    if (currentIdentity.current !== saved.id) return
    toast({ title: 'Cập nhật thành công', description: saved.completion === 'previous'
      ? 'Lần đổi mật khẩu trước đã hoàn tất. Mật khẩu vừa nhập chưa được gửi.'
      : 'Mật khẩu của bạn đã được thay đổi' })
  }
  const passwordError = (error: unknown) => {
    if (error instanceof PasswordIdentityChangedError) return
    toast({ title: 'Lỗi', description: error instanceof PasswordChangeError
      ? error.message : 'Chưa xác nhận được kết quả. Vui lòng kiểm tra lại trước khi thử tiếp.',
      variant: 'destructive' })
  }
  const changePasswordMutation = useMutation({
    retry: false,
    mutationFn: async ({ newPassword, currentPassword }: { newPassword: string; currentPassword: string }) => {
      if (!user?.id) throw new PasswordChangeError('session_required', 'Vui lòng đăng nhập lại để đổi mật khẩu.')
      const actorId = user.id
      try {
        const saved = await passwordChangeFlow.change({ actorId, newPassword, currentPassword,
          isCurrent: () => currentIdentity.current === actorId })
        if (!saved || saved.id !== actorId) throw new PasswordChangeError('outcome_unknown', 'Chưa xác nhận được kết quả đổi mật khẩu.')
        if (currentIdentity.current !== actorId) throw new PasswordIdentityChangedError()
        return saved
      } catch (error) {
        if (currentIdentity.current !== actorId) throw new PasswordIdentityChangedError()
        throw error
      }
    },
    onSuccess: passwordSuccess,
    onError: passwordError,
  })
  const reconcilePasswordMutation = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!user?.id) throw new PasswordChangeError('session_required', 'Vui lòng đăng nhập lại để kiểm tra.')
      const actorId = user.id
      try { return await passwordChangeFlow.reconcile(actorId, () => currentIdentity.current === actorId) }
      catch (error) {
        if (currentIdentity.current !== actorId) throw new PasswordIdentityChangedError()
        throw error
      }
    },
    onSuccess: passwordSuccess,
    onError: passwordError,
  })
  return {
    updateProfile: updateProfileMutation.mutate,
    updateProfileAsync: updateProfileMutation.mutateAsync,
    changePassword: changePasswordMutation.mutate,
    changePasswordAsync: changePasswordMutation.mutateAsync,
    checkPasswordChangeAsync: reconcilePasswordMutation.mutateAsync,
    isUpdating: updateProfileMutation.isPending,
    isChangingPassword: changePasswordMutation.isPending || reconcilePasswordMutation.isPending,
  }
}
