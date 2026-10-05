import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useUser } from './useUser'
import { getFriendlyError } from '@/lib/errorMessage'

export function useProfile() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { user } = useUser()

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: { full_name?: string; phone?: string; avatar_url?: string }) => {
      if (!user?.id) throw new Error('User not found')

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] })
      toast({
        title: 'Cập nhật thành công',
        description: 'Thông tin cá nhân đã được cập nhật',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) throw error
    },
    onSuccess: () => {
      toast({
        title: 'Cập nhật thành công',
        description: 'Mật khẩu của bạn đã được thay đổi',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })

  return {
    updateProfile: updateProfileMutation.mutate,
    changePassword: changePasswordMutation.mutate,
    isUpdating: updateProfileMutation.isPending,
    isChangingPassword: changePasswordMutation.isPending,
  }
}
