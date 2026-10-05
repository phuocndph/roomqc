import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { toast } from './use-toast'
import type { LaundryVendor, VendorFormData, VendorPerformance } from '@/types/laundry.types'
import { getFriendlyError } from '@/lib/errorMessage'

export function useLaundryVendors(filters: { status?: string } = {}) {
  const { tenant } = useTenant()
  
  return useQuery({
    queryKey: ['laundry-vendors', tenant?.id, filters],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      
      let query = supabase
        .from('laundry_vendors')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name')
      
      if (filters.status) {
        query = query.eq('status', filters.status)
      }
      
      const { data, error } = await query
      
      if (error) throw error
      return data as LaundryVendor[]
    },
    enabled: !!tenant?.id,
  })
}

export function useLaundryVendor(vendorId: string | undefined) {
  return useQuery({
    queryKey: ['laundry-vendor', vendorId],
    queryFn: async () => {
      if (!vendorId) throw new Error('No vendor ID')
      
      const { data, error } = await supabase
        .from('laundry_vendors')
        .select('*')
        .eq('id', vendorId)
        .single()
      
      if (error) throw error
      return data as LaundryVendor
    },
    enabled: !!vendorId,
  })
}

export function useVendorPerformance(vendorId: string | undefined, days: number = 30) {
  return useQuery({
    queryKey: ['vendor-performance', vendorId, days],
    queryFn: async () => {
      if (!vendorId) throw new Error('No vendor ID')
      
      const { data, error } = await supabase
        .rpc('get_vendor_performance', {
          p_vendor_id: vendorId,
          p_days: days,
        })
      
      if (error) throw error
      return data as unknown as VendorPerformance
    },
    enabled: !!vendorId,
  })
}

export function useCreateVendor() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  
  return useMutation({
    mutationFn: async (data: VendorFormData) => {
      // Auto-generate vendor code
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
      const code = `LV-${timestamp}-${random}`
      
      const vendorData: any = {
        tenant_id: tenant?.id,
        code: code,
        name: data.name,
        type: data.type,
        address: data.address,
        phone: data.phone,
        email: data.email,
        contact_person: data.contact_person,
        notes: data.notes,
      }
      
      const { data: vendor, error } = await supabase
        .from('laundry_vendors')
        .insert(vendorData)
        .select()
        .single()
      
      if (error) throw error
      return vendor
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-vendors'] })
      toast({
        title: 'Thành công',
        description: 'Đã thêm đơn vị giặt mới',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateVendor() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<VendorFormData> }) => {
      const { error } = await supabase
        .from('laundry_vendors')
        .update(data)
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['laundry-vendor', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['laundry-vendors'] })
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật thông tin đơn vị giặt',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteVendor() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (vendorId: string) => {
      const { error } = await supabase
        .from('laundry_vendors')
        .update({ status: 'inactive' })
        .eq('id', vendorId)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-vendors'] })
      toast({
        title: 'Thành công',
        description: 'Đã vô hiệu hóa đơn vị giặt',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}
