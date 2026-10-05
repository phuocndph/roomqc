export type ActivityType = 
  | 'inventory_add'
  | 'inventory_remove'
  | 'laundry_sent'
  | 'laundry_received'
  | 'room_check'
  | 'maintenance'
  | 'low_stock'
  | 'other'

export interface DashboardStats {
  total_value: number
  total_value_last_month: number
  total_value_change_percent: number | null
  total_items: number
  in_stock: number
  in_use: number
  in_laundry: number
  low_stock_count: number
  active_laundry_batches: number
}

export interface ExpenseData {
  month: string
  purchase: number
  laundry: number
  maintenance: number
  total: number
}

export interface TopItem {
  id: string
  code: string
  name: string
  thumbnail: string | null
  category_name: string | null
  category_color: string | null
  quantity_in_use: number
  quantity_total: number
  utilization_rate: number
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock'
}

export interface DashboardActivity {
  id: string
  type: ActivityType
  description: string
  user_name: string
  user_avatar: string | null
  created_at: string
  metadata: {
    entity_type: string
    entity_id: string | null
    entity_name: string | null
    action: string
  }
}
