import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUser } from './useUser'
import { toast } from 'sonner'
import type { 
  Warehouse, 
  WarehouseInsert, 
  WarehouseUpdate, 
  WarehouseWithStats,
  WarehouseFormData 
} from '@/types/warehouse.types'

export function useWarehouses(includeInactive = false) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['warehouses', tenant?.id, isAllHotelsMode ? 'all' : selectedHotel?.id, includeInactive],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      
      let query = supabase
        .from('warehouses')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }

      if (!includeInactive) {
        query = query.eq('is_active', true)
      }

      const { data, error } = await query
      if (error) throw error
      return data as Warehouse[]
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
  })
}

export function useWarehouse(warehouseId: string | undefined) {
  return useQuery({
    queryKey: ['warehouse', warehouseId],
    queryFn: async () => {
      if (!warehouseId) throw new Error('No warehouse ID')

      const { data, error } = await supabase
        .from('warehouses')
        .select(`
          *,
          hotels:hotel_id (id, name, code)
        `)
        .eq('id', warehouseId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!warehouseId,
  })
}

export function useWarehousesWithStats() {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['warehouses-with-stats', tenant?.id, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')

      let query = supabase
        .from('warehouses')
        .select(`
          *,
          warehouse_stock (
            quantity,
            minimum_stock,
            item:item_id (unit_price)
          )
        `)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }

      const { data, error } = await query
      if (error) throw error

      // Calculate stats for each warehouse
      const warehousesWithStats: WarehouseWithStats[] = (data || []).map(warehouse => {
        const stocks = warehouse.warehouse_stock || []
        return {
          ...warehouse,
          warehouse_stock: undefined, // Remove raw data
          total_items: stocks.length,
          total_quantity: stocks.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0),
          total_value: stocks.reduce((sum: number, s: any) => sum + (s.quantity || 0) * (s.item?.unit_price || 0), 0),
          low_stock_count: stocks.filter((s: any) => s.quantity <= (s.minimum_stock || 0)).length,
        }
      })

      return warehousesWithStats
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
  })
}

export function useDefaultWarehouse() {
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()

  return useQuery({
    queryKey: ['default-warehouse', tenant?.id, selectedHotel?.id],
    queryFn: async () => {
      if (!tenant?.id || !selectedHotel?.id) throw new Error('Missing tenant or hotel')

      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('hotel_id', selectedHotel.id)
        .eq('is_default', true)
        .eq('is_active', true)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return data as Warehouse | null
    },
    enabled: !!tenant?.id && !!selectedHotel?.id,
  })
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const { user } = useUser()

  return useMutation({
    mutationFn: async (data: WarehouseFormData) => {
      if (!tenant?.id || !selectedHotel?.id) throw new Error('Missing tenant or hotel')

      const insertData: WarehouseInsert = {
        ...data,
        tenant_id: tenant.id,
        hotel_id: selectedHotel.id,
      }

      const { data: result, error } = await supabase
        .from('warehouses')
        .insert(insertData)
        .select()
        .single()

      if (error) throw error
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['default-warehouse'] })
      toast.success('Đã tạo kho thành công')
    },
    onError: (error: any) => {
      console.error('Create warehouse error:', error)
      if (error.code === '23505') {
        toast.error('Mã kho đã tồn tại')
      } else {
        toast.error('Không thể tạo kho')
      }
    },
  })
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<WarehouseFormData> }) => {
      const { data: result, error } = await supabase
        .from('warehouses')
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return result
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse', id] })
      queryClient.invalidateQueries({ queryKey: ['default-warehouse'] })
      toast.success('Đã cập nhật kho')
    },
    onError: (error: any) => {
      console.error('Update warehouse error:', error)
      toast.error('Không thể cập nhật kho')
    },
  })
}

export function useDeleteWarehouse() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Check if warehouse has stock
      const { data: stocks } = await supabase
        .from('warehouse_stock')
        .select('quantity')
        .eq('warehouse_id', id)
        .gt('quantity', 0)
        .limit(1)

      if (stocks && stocks.length > 0) {
        throw new Error('Không thể xóa kho còn hàng tồn')
      }

      const { error } = await supabase
        .from('warehouses')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      toast.success('Đã xóa kho')
    },
    onError: (error: any) => {
      console.error('Delete warehouse error:', error)
      toast.error(error.message || 'Không thể xóa kho')
    },
  })
}
