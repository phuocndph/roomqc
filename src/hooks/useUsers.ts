import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useRef } from 'react'
import { UserWithRelations } from '@/types/database.types'
import { toast } from 'sonner'
import { UserFormData } from '@/lib/validations/user.schemas'
import { logDelete } from '@/lib/activityLogger'
import { useStaffInvitationAdmin } from './useStaffInvitationAdmin'
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
  const invitations = useStaffInvitationAdmin(false)
  const mutation = useMutation({
    mutationKey: ['create-staff-invitation', invitations.scope],
    mutationFn: (data: UserFormData) => invitations.create({ ...data, email: data.email ?? '',
      fullName: data.fullName ?? '', userLevelCode: data.userLevelCode ?? '' }),
    retry: false,
  })
  return { ...mutation, scope: invitations.scope }
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  const { user: actor } = useUser()
  // Retain a request ID after an ambiguous network failure. A second click with
  // the same edit/version replays the server receipt, not a second audit/write.
  const pending = useRef<{ key: string; requestId: string } | null>(null)

  return useMutation({
    mutationFn: async ({ id, data, expectedUpdatedAt }: {
      id: string; data: UserFormData; expectedUpdatedAt: string | null
    }) => {
      if (!actor?.id) throw new Error('Bạn cần đăng nhập lại trước khi cập nhật.')
      const changes = {
        full_name: data.fullName.trim(),
        hotel_id: data.hotelId ?? null,
        position_id: data.positionId ?? null,
        reports_to: data.reportsTo ?? null,
      }
      const key = JSON.stringify([actor.id, actor.tenant_id, id, expectedUpdatedAt, changes])
      if (pending.current?.key !== key) pending.current = { key, requestId: crypto.randomUUID() }
      const { data: user, error } = await supabase.rpc('edit_employee_profile', {
        p_target_id: id,
        p_changes: changes,
        p_expected_updated_at: expectedUpdatedAt,
        p_request_id: pending.current.requestId,
      })
      if (error) throw error
      if (!user || typeof user !== 'object' || Array.isArray(user) || user.id !== id) {
        throw new Error('Chưa xác minh được kết quả cập nhật. Vui lòng thử lại.')
      }
      if (pending.current?.key === key) pending.current = null
      return user
    },
    onSuccess: () => {
      for (const key of ['users', 'user', 'user-hotels', 'managers-by-hotel', 'user-permissions']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
      toast.success('Người dùng đã được cập nhật thành công')
    },
    onError: (error: Error) => {
      if (error.message === 'EMPLOYEE_EDIT_STALE_VERSION') {
        queryClient.invalidateQueries({ queryKey: ['users'] })
        toast.error('Hồ sơ đã thay đổi. Hãy đóng và mở lại để tải dữ liệu mới trước khi sửa.')
      } else if (error.message.includes('EMPLOYEE_EDIT_ACTIVE_')) {
        toast.error('Phiên đăng nhập hoặc tài khoản không còn hiệu lực. Vui lòng đăng nhập lại.')
      } else if (error.message.includes('NOT_ALLOWED')) {
        toast.error('Bạn không có quyền cập nhật người dùng trong phạm vi này.')
      } else if (error.message.includes('EMPLOYEE_EDIT_INVALID_')) {
        toast.error('Thông tin nhân viên không hợp lệ. Hãy kiểm tra khách sạn, vị trí và người quản lý.')
      } else if (error.message === 'EMPLOYEE_EDIT_REQUEST_CONFLICT') {
        toast.error('Yêu cầu cập nhật bị xung đột. Hãy mở lại hồ sơ và thử lại.')
      } else {
        toast.error('Chưa cập nhật được hồ sơ. Bạn có thể thử lại; hệ thống sẽ kiểm tra kết quả trước khi ghi tiếp.')
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
