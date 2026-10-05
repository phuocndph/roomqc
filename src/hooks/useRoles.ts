import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface Role {
  value: string
  label: string
}

export function useRoles() {
  const { data: roles, isLoading, error } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      // Get unique roles from user_roles table
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .order('role')

      if (error) throw error
      
      // Get unique roles and format them
      const uniqueRoles = Array.from(new Set(data?.map(r => r.role) || []))
      
      return uniqueRoles.map(role => ({
        value: role,
        label: formatRoleName(role)
      })) as Role[]
    },
  })

  return {
    data: roles,
    isLoading,
    error,
  }
}

function formatRoleName(role: string): string {
  return role
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
