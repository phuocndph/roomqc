import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export interface UserHotel {
  user_id: string
  hotel_id: string
  assigned_at: string | null
  assigned_by: string | null
  can_create_managers: boolean
  can_create_staff: boolean
  can_view_reports: boolean
  can_export_data: boolean
  can_approve_requests: boolean
  hotel?: {
    id: string
    name: string
    code: string
    status: string
  }
}

export function useUserHotels(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-hotels', userId],
    queryFn: async () => {
      if (!userId) return []
      
      const { data, error } = await supabase
        .from('user_hotels')
        .select(`
          *,
          hotel:hotels(id, name, code, status)
        `)
        .eq('user_id', userId)
      
      if (error) throw error
      return data as UserHotel[]
    },
    enabled: !!userId,
  })
}

export function useAssignUserHotels() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      userId, 
      hotelIds,
      permissions = {} 
    }: { 
      userId: string
      hotelIds: string[]
      permissions?: {
        can_create_managers?: boolean
        can_create_staff?: boolean
        can_view_reports?: boolean
        can_export_data?: boolean
        can_approve_requests?: boolean
      }
    }) => {
      // First, get current assignments
      const { data: existing } = await supabase
        .from('user_hotels')
        .select('hotel_id')
        .eq('user_id', userId)
      
      const existingHotelIds = existing?.map(e => e.hotel_id) || []
      
      // Hotels to add
      const toAdd = hotelIds.filter(id => !existingHotelIds.includes(id))
      
      // Hotels to remove
      const toRemove = existingHotelIds.filter(id => !hotelIds.includes(id))
      
      // Remove unassigned hotels
      if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('user_hotels')
          .delete()
          .eq('user_id', userId)
          .in('hotel_id', toRemove)
        
        if (deleteError) throw deleteError
      }
      
      // Add new hotels
      if (toAdd.length > 0) {
        const { error: insertError } = await supabase
          .from('user_hotels')
          .insert(toAdd.map(hotel_id => ({
            user_id: userId,
            hotel_id,
            assigned_at: new Date().toISOString(),
            can_create_managers: permissions.can_create_managers ?? false,
            can_create_staff: permissions.can_create_staff ?? false,
            can_view_reports: permissions.can_view_reports ?? true,
            can_export_data: permissions.can_export_data ?? false,
            can_approve_requests: permissions.can_approve_requests ?? false,
          })))
        
        if (insertError) throw insertError
      }
      
      return { added: toAdd.length, removed: toRemove.length }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-hotels', variables.userId] })
      toast.success('Đã cập nhật phân quyền khách sạn')
    },
    onError: (error: Error) => {
      toast.error('Lỗi cập nhật: ' + error.message)
    },
  })
}

export function useUpdateUserHotelPermissions() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      userId, 
      hotelId,
      permissions 
    }: { 
      userId: string
      hotelId: string
      permissions: {
        can_create_managers?: boolean
        can_create_staff?: boolean
        can_view_reports?: boolean
        can_export_data?: boolean
        can_approve_requests?: boolean
      }
    }) => {
      const { error } = await supabase
        .from('user_hotels')
        .update(permissions)
        .eq('user_id', userId)
        .eq('hotel_id', hotelId)
      
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-hotels', variables.userId] })
      toast.success('Đã cập nhật quyền')
    },
    onError: (error: Error) => {
      toast.error('Lỗi: ' + error.message)
    },
  })
}
