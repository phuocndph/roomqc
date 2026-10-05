import type { Database } from '@/integrations/supabase/types'

export type LaundryVendor = Database['public']['Tables']['laundry_vendors']['Row']
export type LaundryBatch = Database['public']['Tables']['laundry_batches']['Row']
export type LaundryBatchItem = Database['public']['Tables']['laundry_batch_items']['Row']

export type BatchStatus = 'draft' | 'delivered' | 'washing' | 'ready' | 'received' | 'stocked' | 'cancelled'
export type VendorType = 'external' | 'in_house'

export interface LaundryDashboardStats {
  items_in_laundry: number
  active_batches: number
  current_month_cost: number
  last_month_cost: number
  cost_change_percent: number | null
  avg_quality_rating: number
}

export interface LaundryBatchWithVendor extends LaundryBatch {
  vendor_name: string
  vendor_logo: string | null
  vendor_rating: number
  total_count?: number
}

export interface LaundryBatchFilters {
  vendorId?: string
  status?: BatchStatus
  search?: string
  fromDate?: Date
  toDate?: Date
}

export interface BatchDetailData {
  batch: LaundryBatch
  vendor: LaundryVendor
  hotel: any
  delivery_staff: any
  return_staff: any
  items: BatchItemWithDetails[]
}

export interface BatchItemWithDetails extends LaundryBatchItem {
  item_code: string
  item_name: string
  item_thumbnail: string | null
  category_name: string | null
}

export interface VendorPerformance {
  total_orders: number
  total_cost: number
  avg_quality: number
  avg_timeliness: number
  avg_rating: number
  total_lost: number
  total_damaged: number
  on_time_rate: number
}

export interface MonthlyExpense {
  month: string
  total_batches: number
  total_items: number
  estimated_cost: number
  actual_cost: number
}

// Form types
export interface CreateBatchStep1Data {
  vendor_id: string
  delivery_date: Date
  expected_return_date: Date
  delivery_staff_id: string
  receiver_name: string
  notes?: string
}

export interface CreateBatchStep2Data {
  items: {
    item_id: string
    quantity: number
    weight_kg: number
    condition_note?: string
  }[]
}

export interface CreateBatchStep3Data {
  confirmed: boolean
}

export interface ReceiveBatchData {
  actual_return_date: Date
  delivery_person_name: string
  actual_cost: number
  quality_rating: number
  timeliness_rating: number
  items: {
    item_id: string
    quantity_returned: number
    quantity_lost: number
    quantity_damaged: number
    return_condition: string
    notes?: string
  }[]
  return_photos: string[]
  return_notes?: string
  compensation_amount: number
}

export interface VendorFormData {
  name: string
  type: VendorType
  address: string
  phone: string
  email?: string
  contact_person: string
  notes?: string
}
