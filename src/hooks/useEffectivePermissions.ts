import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'

export interface EffectivePermission {
  module: string
  action: string
  source: string
}

/**
 * Trả về union toàn bộ quyền hiệu lực của user (từ mọi role + grant trực tiếp).
 * Dùng cho UI quản trị + cảnh báo role thừa quyền / conflict.
 */
export function useEffectivePermissions(userId?: string | null) {
  const { user } = useUser()
  const targetId = userId ?? user?.id ?? null

  return useQuery({
    queryKey: ['effective-permissions', targetId],
    enabled: !!targetId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EffectivePermission[]> => {
      const { data, error } = await supabase.rpc('get_effective_permissions', {
        _user_id: targetId!,
      })
      if (error) throw error
      return (data as any) ?? []
    },
  })
}
