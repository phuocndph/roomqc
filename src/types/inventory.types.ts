import type { Database } from '@/integrations/supabase/types'

export type InventoryTransaction = Database['public']['Tables']['inventory_transactions']['Row']
export type StockAdjustment = Database['public']['Tables']['stock_adjustments']['Row']
export type StockAdjustmentItem = Database['public']['Tables']['stock_adjustment_items']['Row']

export type TransactionType = 'in' | 'out' | 'transfer' | 'adjust' | 'damaged' | 'lost'
export type TransactionCategory = 
  | 'purchase' 
  | 'return' 
  | 'room_assign'
  | 'staff_assign'
  | 'laundry' 
  | 'maintenance' 
  | 'disposal' 
  | 'other'

export type AdjustmentType = 'inventory_check' | 'damage' | 'loss' | 'correction'
export type AdjustmentStatus = 'draft' | 'in_progress' | 'completed' | 'approved' | 'rejected'

export interface InventoryDashboardStats {
  total_stock_value: number
  stock_value_change_percent: number | null
  total_items_count: number
  total_product_types: number
  low_stock_count: number
  reorder_needed_count: number
  today_transactions: {
    total: number
    in: number
    out: number
  }
  value_in_this_month: number
  value_in_last_month: number
  inbound_change_percent: number | null
}

export interface LowStockItem {
  id: string
  code: string
  name: string
  category_id: string
  category_name: string
  quantity_in_stock: number
  minimum_stock: number
  reorder_point: number
  shortage: number
  shortage_percent: number
  unit_price: number
  images: string[]
}

export interface TransactionWithDetails extends InventoryTransaction {
  item_name: string
  item_code: string
  item_images: string[]
  category_name: string
  created_by_name: string
  created_by_avatar: string
  total_count?: number
}

export interface InventoryValueData {
  month: string
  stock_value: number
  value_in: number
  value_out: number
}

export interface CreateInboundData {
  transaction_category: TransactionCategory
  from_location: string
  to_location: string
  to_warehouse_id: string
  items: {
    item_id: string
    quantity: number
    unit_price: number
    notes?: string
  }[]
  related_type?: string
  related_id?: string
  documents?: string[]
  photos?: string[]
  notes?: string
}

export interface CreateOutboundData {
  transaction_category: TransactionCategory
  from_location: string
  to_location: string
  from_warehouse_id: string
  items: {
    item_id: string
    quantity: number
    notes?: string
  }[]
  related_type?: string
  related_id?: string
  recipient_name?: string
  recipient_signature?: string
  documents?: string[]
  photos?: string[]
  notes?: string
}

export interface CreateAdjustmentData {
  adjustment_type: AdjustmentType
  scheduled_date: Date
  assigned_to: string[]
  item_ids: string[]
  notes?: string
}

export interface AdjustmentWithDetails extends StockAdjustment {
  created_by_name: string
  assigned_to_names: string[]
  approved_by_name: string | null
  total_count?: number
}

export interface CheckAdjustmentItemData {
  item_id: string
  actual_quantity: number
  discrepancy_reason?: string
  photos?: string[]
}

export interface InventoryFilters {
  transaction_type?: TransactionType
  category_id?: string
  created_by?: string
  date_from?: Date
  date_to?: Date
  search?: string
}

export interface AdjustmentFilters {
  status?: AdjustmentStatus
  adjustment_type?: AdjustmentType
  created_by?: string
  date_from?: Date
  date_to?: Date
}
