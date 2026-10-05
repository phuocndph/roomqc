import type { Database } from '@/integrations/supabase/types'

export type Item = Database['public']['Tables']['items']['Row']
export type ItemInsert = Database['public']['Tables']['items']['Insert']
export type ItemUpdate = Database['public']['Tables']['items']['Update']

export type ItemCategory = Database['public']['Tables']['item_categories']['Row']
export type ItemImage = Database['public']['Tables']['item_images']['Row']

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'
export type ItemStatus = 'active' | 'discontinued'
export type ItemType = 'linen' | 'consumable' | 'equipment' | 'furniture'

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  linen: 'Đồ vải',
  consumable: 'Tiêu hao',
  equipment: 'Thiết bị',
  furniture: 'Nội thất',
}

// Chargeable item labels
export const CHARGEABLE_LABELS = {
  chargeable: 'Tính phí',
  complimentary: 'Miễn phí',
} as const

export const ITEM_TYPE_OPTIONS: { value: ItemType; label: string; description: string }[] = [
  { value: 'linen', label: 'Đồ vải', description: 'Khăn, ga, gối - cần giặt và thay thế' },
  { value: 'consumable', label: 'Tiêu hao', description: 'Bàn chải, kem đánh răng, nước - dùng 1 lần' },
  { value: 'equipment', label: 'Thiết bị', description: 'Ấm nước, tivi, điều khiển - cần kiểm tra mất/hỏng' },
  { value: 'furniture', label: 'Nội thất', description: 'Bàn, ghế, tủ - kiểm tra tình trạng' },
]

export interface WarehouseBreakdownItem {
  warehouse_id: string
  warehouse_name: string
  warehouse_code: string
  quantity: number
}

export interface ItemWithCategory extends Item {
  category_name: string | null
  category_color: string | null
  stock_status: StockStatus
  total_count?: number
  item_images?: ItemImage[]
  warehouse_breakdown?: WarehouseBreakdownItem[]
}

export interface ItemFilters {
  search?: string
  categoryId?: string
  hotelId?: string
  warehouseId?: string
  stockStatus?: StockStatus
  status?: ItemStatus
}

export interface ItemDetailData {
  item: Item
  category: ItemCategory | null
  hotel: any
  recent_transactions: any[]
  room_allocations: any[]
}

export interface CategoryWithStats extends ItemCategory {
  items_count: number
  total_value: number
}

// Form schemas
export interface ItemFormData {
  // Basic info
  name: string
  name_en?: string
  category_id: string
  hotel_id: string
  description?: string
  
  // Pricing
  unit: string
  unit_price: number
  brand?: string
  model?: string
  
  // Quantity
  quantity_total: number
  minimum_stock: number
  reorder_point?: number
  
  // Specifications
  specifications?: Record<string, any>
  
  // Lifecycle
  expected_lifetime_days?: number
  max_wash_cycles?: number
  
  // Images
  images?: string[]
  
  status: ItemStatus
}

export interface CategoryFormData {
  name: string
  name_en?: string
  description?: string
  icon: string
  color: string
  sort_order?: number
}
