import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useHotelContext } from '@/contexts/HotelContext'

import { useToast } from '@/hooks/use-toast'
import type { HotelService, HotelServiceFormData } from '@/types/services.types'
import { getFriendlyError } from '@/lib/errorMessage'

export function useHotelServices(activeOnly = false) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id
  const { selectedHotel } = useHotelContext()
  const selectedHotelId = selectedHotel?.id

  return useQuery({
    queryKey: ['hotel-services', tenantId, selectedHotelId, activeOnly],
    queryFn: async () => {
      if (!tenantId || !selectedHotelId) return []

      let query = supabase
        .from('hotel_services')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('hotel_id', selectedHotelId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (activeOnly) {
        query = query.eq('is_active', true)
      }

      const { data, error } = await query
      if (error) throw error
      return (data || []) as HotelService[]
    },
    enabled: !!tenantId && !!selectedHotelId,
  })
}

export function useCreateService() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const selectedHotelId = selectedHotel?.id
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (formData: HotelServiceFormData) => {
      if (!tenant?.id || !selectedHotelId) throw new Error('Missing tenant/hotel')

      const { data, error } = await supabase
        .from('hotel_services')
        .insert({
          tenant_id: tenant.id,
          hotel_id: selectedHotelId,
          name: formData.name,
          name_en: formData.name_en || null,
          category: formData.category,
          description: formData.description || null,
          unit: formData.unit,
          price: formData.price,
          is_active: formData.is_active,
          icon: formData.icon,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel-services'] })
      toast({ title: 'Đã thêm dịch vụ' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(error) })
    },
  })
}

export function useUpdateService() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id, ...formData }: HotelServiceFormData & { id: string }) => {
      const { data, error } = await supabase
        .from('hotel_services')
        .update({
          name: formData.name,
          name_en: formData.name_en || null,
          category: formData.category,
          description: formData.description || null,
          unit: formData.unit,
          price: formData.price,
          is_active: formData.is_active,
          icon: formData.icon,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel-services'] })
      toast({ title: 'Đã cập nhật dịch vụ' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(error) })
    },
  })
}

export function useDeleteService() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('hotel_services')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotel-services'] })
      toast({ title: 'Đã xóa dịch vụ' })
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(error) })
    },
  })
}
