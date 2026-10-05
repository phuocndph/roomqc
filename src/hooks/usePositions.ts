import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

export interface Position {
  id: string
  tenant_id: string
  code: string
  name: string
  description?: string
  user_level_code: 'manager' | 'staff'
  department?: string
  display_order: number
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export function usePositions(userLevelCode?: 'manager' | 'staff') {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['positions', tenantId, userLevelCode],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      let query = supabase
        .from('positions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('display_order')

      if (userLevelCode) {
        query = query.eq('user_level_code', userLevelCode)
      }

      const { data, error } = await query

      if (error) throw error
      return data as Position[]
    },
    enabled: !!tenantId,
  })
}

export function useCreatePosition() {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async (data: Omit<Position, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => {
      if (!tenantId) throw new Error('No tenant')

      const { data: position, error } = await supabase
        .from('positions')
        .insert({
          ...data,
          tenant_id: tenantId,
        })
        .select()
        .single()

      if (error) throw error
      return position
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      toast({
        title: 'Thành công',
        description: 'Đã tạo chức vụ mới',
      })
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Lỗi',
        description: getFriendlyError(error),
      })
    },
  })
}

export function useUpdatePosition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Position> }) => {
      const { data: position, error } = await supabase
        .from('positions')
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return position
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật chức vụ',
      })
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Lỗi',
        description: getFriendlyError(error),
      })
    },
  })
}

export function useDeletePosition() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('positions')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      toast({
        title: 'Thành công',
        description: 'Đã xóa chức vụ',
      })
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Lỗi',
        description: getFriendlyError(error),
      })
    },
  })
}
