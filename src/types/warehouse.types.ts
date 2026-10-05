import type { Database } from '@/integrations/supabase/types'

export type Warehouse = Database['public']['Tables']['warehouses']['Row']
export type WarehouseInsert = Database['public']['Tables']['warehouses']['Insert']
export type WarehouseUpdate = Database['public']['Tables']['warehouses']['Update']

export type WarehouseStock = Database['public']['Tables']['warehouse_stock']['Row']
export type WarehouseStockInsert = Database['public']['Tables']['warehouse_stock']['Insert']

export type WarehouseLocationType = Database['public']['Enums']['warehouse_location_type']

export const WAREHOUSE_LOCATION_TYPE_LABELS: Record<WarehouseLocationType, string> = {
  warehouse: 'Kho',
  room: 'Phòng',
  floor: 'Tầng',
  external: 'Bên ngoài',
}

export const WAREHOUSE_LOCATION_TYPE_OPTIONS: { value: WarehouseLocationType; label: string; description: string }[] = [
  { value: 'warehouse', label: 'Kho', description: 'Kho chứa hàng chính' },
  { value: 'room', label: 'Phòng', description: 'Phòng khách sạn' },
  { value: 'floor', label: 'Tầng', description: 'Tầng trong khách sạn' },
  { value: 'external', label: 'Bên ngoài', description: 'Nhà cung cấp, đối tác bên ngoài' },
]

export interface WarehouseWithStats extends Warehouse {
  total_items: number
  total_quantity: number
  total_value: number
  low_stock_count: number
}

export interface WarehouseStockWithItem extends WarehouseStock {
  item_name: string
  item_code: string
  category_name: string | null
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock'
}

export interface WarehouseFormData {
  code: string
  name: string
  location_type: WarehouseLocationType
  address?: string
  description?: string
  is_default: boolean
  is_active: boolean
  sort_order?: number
}

export interface TransferItem {
  item_id: string
  quantity: number
  unit_price?: number
  notes?: string
  available_quantity?: number
  item_name?: string
}

export interface CreateTransferData {
  from_warehouse_id: string
  to_warehouse_id: string
  items: TransferItem[]
  notes?: string
}

export interface WarehouseFilters {
  search?: string
  location_type?: WarehouseLocationType
  is_active?: boolean
}
