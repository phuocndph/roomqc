import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'
import { logCreate, logUpdate, logDelete } from '@/lib/activityLogger'

export interface Hotel {
  id: string
  tenant_id: string
  code: string
  name: string
  type: 'hotel' | 'resort' | 'apartment' | 'hostel' | 'other'
  
  // Contact Info
  address: string | null
  city: string | null
  state: string | null
  country: string
  postal_code: string | null
  phone: string | null
  email: string | null
  website: string | null
  
  // Capacity
  total_rooms: number
  total_floors: number
  
  // Manager
  manager_id: string | null
  manager_name: string | null
  manager_email: string | null
  
  // Settings Override
  settings: any
  
  // Status
  status: 'active' | 'inactive' | 'maintenance'
  
  // Metadata
  logo_url: string | null
  description: string | null
  created_at: string
  updated_at: string
  inactive_at: string | null
  inactive_reason: string | null
  
  // Computed fields
  _count?: {
    users: number
    rooms: number
    items: number
    laundry_batches: number
    maintenance_requests: number
  }
}

export interface HotelFormData {
  code: string
  name: string
  type: 'hotel' | 'resort' | 'apartment' | 'hostel' | 'other'
  
  // Contact
  address?: string
  city?: string
  state?: string
  country: string
  postal_code?: string
  phone?: string
  email?: string
  website?: string
  
  // Capacity
  total_rooms: number
  total_floors: number
  
  // Manager
  manager_id?: string
  
  // Settings
  settings?: any
  
  // Metadata
  logo_url?: string
  description?: string
  status: 'active' | 'inactive' | 'maintenance'
}

export const useHotels = (filters?: {
  status?: string
  type?: string
  city?: string
  manager_id?: string
  search?: string
}) => {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['hotels', tenantId, filters],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant ID')

      let query = supabase
        .from('hotels')
        .select(`
          *,
          users:users!users_hotel_id_fkey(count),
          rooms:rooms(count),
          items:items(count),
          laundry_batches:laundry_batches(count),
          maintenance_requests:maintenance_requests(count)
        `)
        .eq('tenant_id', tenantId)

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }
      if (filters?.type && filters.type !== 'all') {
        query = query.eq('type', filters.type)
      }
      if (filters?.city && filters.city !== 'all') {
        query = query.eq('city', filters.city)
      }
      if (filters?.manager_id && filters.manager_id !== 'all') {
        query = query.eq('manager_id', filters.manager_id)
      }
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%,address.ilike.%${filters.search}%`)
      }

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) throw error
      
      // Transform the data to include counts
      const hotels = data?.map((hotel: any) => ({
        ...hotel,
        _count: {
          users: hotel.users?.[0]?.count || 0,
          rooms: hotel.rooms?.[0]?.count || 0,
          items: hotel.items?.[0]?.count || 0,
          laundry_batches: hotel.laundry_batches?.[0]?.count || 0,
          maintenance_requests: hotel.maintenance_requests?.[0]?.count || 0,
        }
      }))
      
      return hotels as Hotel[]
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,      // 2 minutes
    gcTime: 5 * 60 * 1000,          // 5 minutes
    refetchOnWindowFocus: false,
  })
}

export const useHotel = (hotelId: string | undefined) => {
  return useQuery({
    queryKey: ['hotel', hotelId],
    queryFn: async () => {
      if (!hotelId) throw new Error('No hotel ID')

      const { data, error } = await supabase
        .from('hotels')
        .select('*')
        .eq('id', hotelId)
        .single()

      if (error) throw error
      return data as Hotel
    },
    enabled: !!hotelId,
  })
}

export const useCreateHotel = () => {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async (data: HotelFormData) => {
      if (!tenantId) throw new Error('No tenant ID')

      const { data: hotel, error } = await supabase
        .from('hotels')
        .insert({
          tenant_id: tenantId,
          code: data.code,
          name: data.name,
          type: data.type,
          address: data.address || null,
          city: data.city || null,
          state: data.state || null,
          country: data.country,
          postal_code: data.postal_code || null,
          phone: data.phone || null,
          email: data.email || null,
          website: data.website || null,
          total_rooms: data.total_rooms,
          total_floors: data.total_floors,
          manager_id: data.manager_id || null,
          settings: data.settings || {},
          logo_url: data.logo_url || null,
          description: data.description || null,
          status: data.status,
        } as any)
        .select()
        .single()

      if (error) throw error

      await logCreate('hotel', hotel.id, hotel.name, data)
      return hotel
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotels'] })
      toast.success('Hotel created successfully')
    },
    onError: (error: Error) => {
      toast.error('Failed to create hotel: ' + error.message)
    },
  })
}

export const useDeactivateHotel = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      id, 
      reason,
      effectiveDate 
    }: { 
      id: string
      reason: string
      effectiveDate?: string
    }) => {
      const { data: oldData } = await supabase
        .from('hotels')
        .select('*')
        .eq('id', id)
        .single()

      const { data: hotel, error } = await supabase
        .from('hotels')
        .update({
          status: 'inactive',
          inactive_at: effectiveDate || new Date().toISOString(),
          inactive_reason: reason,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      await logUpdate('hotel', hotel.id, hotel.name, oldData, { status: 'inactive', inactive_reason: reason })
      return hotel
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotels'] })
      toast.success('Hotel deactivated successfully')
    },
    onError: (error: Error) => {
      toast.error('Failed to deactivate hotel: ' + error.message)
    },
  })
}

export const useUpdateHotel = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<HotelFormData> }) => {
      const { data: oldData } = await supabase
        .from('hotels')
        .select('*')
        .eq('id', id)
        .single()

      const { data: hotel, error } = await supabase
        .from('hotels')
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      await logUpdate('hotel', hotel.id, hotel.name, oldData, data)
      return hotel
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotels'] })
      queryClient.invalidateQueries({ queryKey: ['hotel'] })
      toast.success('Hotel updated successfully')
    },
    onError: (error: Error) => {
      toast.error('Failed to update hotel: ' + error.message)
    },
  })
}

export const useDeleteHotel = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Check if hotel has any users
      const { count } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('hotel_id', id)

      if (count && count > 0) {
        throw new Error('Cannot delete hotel with assigned users')
      }

      const { data: hotel } = await supabase
        .from('hotels')
        .select('*')
        .eq('id', id)
        .single()

      const { error } = await supabase
        .from('hotels')
        .delete()
        .eq('id', id)

      if (error) throw error

      if (hotel) {
        await logDelete('hotel', id, hotel.name, hotel)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hotels'] })
      toast.success('Hotel deleted successfully')
    },
    onError: (error: Error) => {
      toast.error('Failed to delete hotel: ' + error.message)
    },
  })
}
