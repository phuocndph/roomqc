import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'

export interface RoomType {
  id: string
  tenant_id: string
  hotel_id?: string
  name: string
  code: string
  description?: string
  max_guests: number
  beds_count: number
  bed_type?: string
  has_balcony: boolean
  has_kitchen: boolean
  has_bathtub: boolean
  square_meters?: number
  default_items?: any[]
  base_price?: number
  display_order: number
  icon?: string
  color?: string
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export const useRoomTypes = () => {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['room-types', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase
        .from('room_types')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('display_order')

      if (error) throw error
      return data as RoomType[]
    },
    enabled: !!tenantId,
  })
}

export const useCreateRoomType = () => {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async (roomType: Partial<RoomType>) => {
      const { data, error } = await supabase
        .from('room_types')
        .insert([{ ...roomType, tenant_id: tenantId } as any])
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room-types'] })
      toast.success('Room type created successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create room type')
    },
  })
}
