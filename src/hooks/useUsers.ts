import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { User, UserWithRelations } from '@/types/database.types'
import { toast } from 'sonner'
import { UserFormData } from '@/lib/validations/user.schemas'
import { logCreate, logUpdate, logDelete } from '@/lib/activityLogger'
import { useTenant } from './useTenant'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'

export function useUsers() {
  const { tenant } = useTenant()
  const { user: currentUser } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const selectedHotelId = selectedHotel?.id ?? null

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users', tenant?.id, currentUser?.id, currentUser?.user_level_code, selectedHotelId, isAllHotelsMode],
    queryFn: async () => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required to fetch users')
      }

      // Use RPC to consolidate 3 cascading queries into 1
      const { data, error } = await supabase.rpc('get_users_by_hotel', {
        p_tenant_id: tenant.id,
        p_hotel_id: selectedHotelId && !isAllHotelsMode ? selectedHotelId : null,
        p_user_id: currentUser?.id || null,
        p_user_level: currentUser?.user_level_code || null,
      })

      if (error) throw error
      return (data || []) as UserWithRelations[]
    },
    enabled: !!tenant?.id && !!currentUser,
  })

  return {
    users,
    isLoading,
    error,
  }
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()

  return useMutation({
    mutationFn: async (data: UserFormData) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required to create a user')
      }

      // Call edge function to create auth user + profile
      const { data: result, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: data.email,
          fullName: data.fullName,
          password: data.password,
          userLevelCode: data.userLevelCode,
          hotelId: data.hotelId || null,
          positionId: data.positionId || null,
          reportsTo: data.reportsTo || null,
          tenantId: tenant.id,
        }
      })

      if (error) {
        // Check if it's a quota exceeded error
        if (error.message?.includes('Quota exceeded')) {
          queryClient.invalidateQueries({ queryKey: ['check-quota'] })
          queryClient.invalidateQueries({ queryKey: ['tenant-usage'] })
        }
        throw error
      }

      const user = result.user
      await logCreate('user', user.id, user.full_name, data)
      return user
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['check-quota'] })
      queryClient.invalidateQueries({ queryKey: ['tenant-usage'] })
      toast.success('Người dùng đã được tạo thành công')
    },
    onError: (error: Error) => {
      const errorMessage = error.message.toLowerCase()
      
      if (errorMessage.includes('quota exceeded') || errorMessage.includes('quota')) {
        toast.error('Đã đạt giới hạn số lượng người dùng. Vui lòng nâng cấp gói dịch vụ để tiếp tục.')
      } else if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
        toast.error('Email này đã được sử dụng. Vui lòng chọn email khác.')
      } else if (errorMessage.includes('permission') || errorMessage.includes('not allowed')) {
        toast.error('Bạn không có quyền tạo người dùng với cấp bậc này.')
      } else if (errorMessage.includes('hotel') || errorMessage.includes('hotel_id')) {
        toast.error('Quản lý phải được gán cho một khách sạn. Vui lòng chọn khách sạn.')
      } else if (errorMessage.includes('tenant not approved')) {
        toast.error('Tài khoản doanh nghiệp chưa được duyệt. Vui lòng liên hệ quản trị viên.')
      } else if (errorMessage.includes('primary owner exists')) {
        toast.error('Chỉ có thể có một Chủ sở hữu chính cho mỗi doanh nghiệp.')
      } else {
        toast.error(`Không thể tạo người dùng: ${error.message}`)
      }
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UserFormData }) => {
      const { data: oldData } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single()

      const roleMapping: Record<string, string> = {
        tenant_owner: 'owner',
        manager: 'hotel_manager',
        department_manager: 'department_manager',
        staff: 'staff',
      }

      let department: string | null = null
      if (data.positionId) {
        const { data: position, error: positionError } = await supabase
          .from('positions')
          .select('department')
          .eq('id', data.positionId)
          .maybeSingle()

        if (positionError) throw positionError
        department = position?.department ?? null
      }

      const { data: user, error } = await supabase
        .from('users')
        .update({
          full_name: data.fullName,
          user_level_code: data.userLevelCode,
          role: roleMapping[data.userLevelCode],
          hotel_id: data.hotelId || null,
          position_id: data.positionId || null,
          department,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Keep the app role in sync without requiring the optional local
      // Edge Function runtime.
      const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({ user_id: id, role: roleMapping[data.userLevelCode] as any }, {
          onConflict: 'user_id,role',
        })

      if (roleError) throw roleError

      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', id)
        .in('role', ['owner', 'hotel_manager', 'department_manager', 'staff'])
        .neq('role', roleMapping[data.userLevelCode])

      await logUpdate('user', user.id, user.full_name, oldData, data)
      return user
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Người dùng đã được cập nhật thành công')
    },
    onError: (error: Error) => {
      const errorMessage = error.message.toLowerCase()
      
      if (errorMessage.includes('permission') || errorMessage.includes('not allowed') || errorMessage.includes('cannot manage')) {
        toast.error('Bạn không có quyền cập nhật người dùng này.')
      } else if (errorMessage.includes('owner') && errorMessage.includes('level')) {
        toast.error('Không thể thay đổi cấp bậc của Chủ sở hữu chính.')
      } else if (errorMessage.includes('hotel') || errorMessage.includes('hotel_id')) {
        toast.error('Quản lý phải được gán cho một khách sạn.')
      } else if (errorMessage.includes('subordinates') || errorMessage.includes('has subordinates')) {
        toast.error('Không thể thay đổi cấp bậc vì người dùng này đang quản lý các tài khoản khác.')
      } else {
        toast.error(`Không thể cập nhật người dùng: ${error.message}`)
      }
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single()

      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', id)

      if (error) throw error

      if (user) {
        await logDelete('user', id, user.full_name, user)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Người dùng đã được xóa thành công')
    },
    onError: (error: Error) => {
      const errorMessage = error.message.toLowerCase()
      
      if (errorMessage.includes('primary owner') || errorMessage.includes('is_primary_owner')) {
        toast.error('Không thể xóa Chủ sở hữu chính của doanh nghiệp.')
      } else if (errorMessage.includes('permission') || errorMessage.includes('not allowed')) {
        toast.error('Bạn không có quyền xóa người dùng này.')
      } else if (errorMessage.includes('foreign key') || errorMessage.includes('violates')) {
        toast.error('Không thể xóa người dùng vì còn dữ liệu liên quan. Vui lòng chuyển giao công việc trước.')
      } else {
        toast.error(`Không thể xóa người dùng: ${error.message}`)
      }
    },
  })
}
