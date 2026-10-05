import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useUser } from './useUser'
import { getFriendlyError } from '@/lib/errorMessage'

export interface Role {
  id: string
  tenant_id: string
  code: string
  name: string
  description: string | null
  is_system: boolean
  hierarchy_level: number
  created_at: string
  updated_at: string
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[]
}

export interface Permission {
  id: string
  code: string
  name: string
  description: string | null
  module: string
  action: string
}

export function useRolesManagement() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  // Fetch all roles for tenant
  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant ID')
      
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('hierarchy_level')

      if (error) throw error
      return data as Role[]
    },
    enabled: !!tenantId,
  })

  // Fetch role with permissions
  const fetchRoleWithPermissions = async (roleId: string): Promise<RoleWithPermissions> => {
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('*')
      .eq('id', roleId)
      .single()

    if (roleError) throw roleError

    const { data: rolePermissions, error: permError } = await supabase
      .from('role_permissions')
      .select(`
        permission_id,
        permissions (*)
      `)
      .eq('role_id', roleId)

    if (permError) throw permError

    const permissions = rolePermissions?.map((rp: any) => rp.permissions) || []

    return {
      ...role,
      permissions,
    } as RoleWithPermissions
  }

  // Create role
  const createRole = useMutation({
    mutationFn: async (data: {
      code: string
      name: string
      description?: string
      hierarchy_level: number
    }) => {
      if (!tenantId) throw new Error('No tenant ID')

      const { data: role, error } = await supabase
        .from('roles')
        .insert({
          tenant_id: tenantId,
          ...data,
          is_system: false,
        })
        .select()
        .single()

      if (error) throw error
      return role
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      toast({
        title: 'Thành công',
        description: 'Đã tạo vai trò mới',
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

  // Update role
  const updateRole = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Role> & { id: string }) => {
      const { data: role, error } = await supabase
        .from('roles')
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return role
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật vai trò',
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

  // Delete role
  const deleteRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', roleId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      toast({
        title: 'Thành công',
        description: 'Đã xóa vai trò',
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

  // Assign permissions to role
  const assignPermissions = useMutation({
    mutationFn: async ({
      roleId,
      permissionIds,
    }: {
      roleId: string
      permissionIds: string[]
    }) => {
      // First, remove all existing permissions
      await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId)

      // Then add new permissions
      if (permissionIds.length > 0) {
        const { error } = await supabase.from('role_permissions').insert(
          permissionIds.map((permissionId) => ({
            role_id: roleId,
            permission_id: permissionId,
          }))
        )

        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật quyền cho vai trò',
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
    roles,
    isLoading,
    createRole,
    updateRole,
    deleteRole,
    assignPermissions,
    fetchRoleWithPermissions,
  }
}

export function usePermissionsList() {
  const { data: permissions, isLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('module, action')

      if (error) throw error
      return data as Permission[]
    },
  })

  // Group permissions by module
  const permissionsByModule = permissions?.reduce((acc, permission) => {
    if (!acc[permission.module]) {
      acc[permission.module] = []
    }
    acc[permission.module].push(permission)
    return acc
  }, {} as Record<string, Permission[]>)

  return {
    permissions,
    permissionsByModule,
    isLoading,
  }
}
