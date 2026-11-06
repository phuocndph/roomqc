import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { UserWithRelations, AppRole } from '@/types/database.types'
import { runtimeConfig } from '@/lib/runtime-config'

export const useUser = () => {
  const { user: authUser } = useAuth()

  const { data: userData, isLoading, error, refetch } = useQuery({
    queryKey: ['user', authUser?.id, runtimeConfig.workspace?.workspace.id],
    queryFn: async () => {
      if (!authUser?.id) return null

      // Fetch user data with relations
      // Specify which relationship to use for tenants (users_tenant_id_fkey)
      const { data: user, error: userError } = await supabase
        .from('users')
        .select(`
          *,
          tenant:tenants!users_tenant_id_fkey(*),
          hotel:hotels!users_hotel_id_fkey(*),
          position:positions!users_position_id_fkey(id, code, name, user_level_code, department)
        `)
        .eq('id', authUser.id)
        .maybeSingle()

      // If user doesn't exist in users table, return null (needs onboarding)
      if (userError) throw userError
      const workspace = runtimeConfig.workspace?.workspace
      if (workspace?.tenantId && user?.tenant_id !== workspace.tenantId) {
        throw new Error('Tài khoản không thuộc doanh nghiệp đang mở. Hãy đăng xuất và chọn đúng doanh nghiệp.')
      }
      if (workspace && !workspace.tenantId && user?.tenant_id) {
        throw new Error('Doanh nghiệp chưa hoàn tất xác nhận thiết lập. Hãy tải lại trang để kiểm tra kết quả.')
      }
      if (!user) return null

      // Fetch user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', authUser.id)

      if (rolesError) throw rolesError

      // Get primary role (highest priority)
      const roleOrder: AppRole[] = ['super_admin', 'owner', 'hotel_manager', 'department_manager', 'staff']
      const primaryRole = roles
        ?.map(r => r.role as AppRole)
        .sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))[0]

      return {
        ...user,
        roles,
        primaryRole,
      } as UserWithRelations
    },
    enabled: !!authUser?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1, // Only retry once if query fails
    refetchOnWindowFocus: false, // Don't refetch on window focus
  })

  const hasRole = (role: AppRole): boolean => {
    return userData?.roles?.some((r) => r.role === role) || false
  }

  const hasAnyRole = (roles: AppRole[]): boolean => {
    return roles.some((role) => hasRole(role))
  }

  return {
    user: userData,
    isLoading,
    error,
    refetch,
    hasRole,
    hasAnyRole,
    role: userData?.primaryRole,
    tenantId: userData?.tenant_id,
    hotelId: userData?.hotel_id,
  }
}
