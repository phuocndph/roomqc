import type { Database } from '@/integrations/supabase/types'

export type Room = Database['public']['Tables']['rooms']['Row']
export type RoomInsert = Database['public']['Tables']['rooms']['Insert']
export type RoomUpdate = Database['public']['Tables']['rooms']['Update']

export type RoomItem = Database['public']['Tables']['room_items']['Row']
export type RoomCheck = Database['public']['Tables']['room_checks']['Row']

export type RoomType = 'standard' | 'deluxe' | 'suite' | 'vip'

/**
 * State Machine v2 — Trạng thái phòng đầy đủ (11 trạng thái).
 * Các giá trị legacy (`vacant`, `occupied`, `cleaning`, `maintenance`, `check_in`, `check_out`)
 * được giữ làm bí danh trong giai đoạn rollout — code mới không nên dùng.
 */
export type RoomStatusV2 =
  | 'vacant_clean'
  | 'vacant_inspected'
  | 'vacant_dirty'
  | 'occupied_clean'
  | 'occupied_dirty'
  | 'dnd'
  | 'service_refused'
  | 'sleep_out'
  | 'skipper'
  | 'out_of_order'
  | 'out_of_service'

export type RoomStatusLegacy =
  | 'vacant'
  | 'occupied'
  | 'cleaning'
  | 'maintenance'
  | 'out_of_order'
  | 'check_in'
  | 'check_out'

/** Union dùng cho UI hiện tại — cho phép cả mới và cũ trong giai đoạn rollout */
export type RoomStatus = RoomStatusV2 | RoomStatusLegacy

export type CheckType = 'daily' | 'periodic' | 'checkout' | 'checkin' | 'maintenance' | 'delivery' | 'replenish'

export interface RoomWithStats extends Omit<Room, 'hourly_price' | 'monthly_price' | 'min_hours' | 'max_hours' | 'dnd_until' | 'dnd_reason' | 'oos_until' | 'oos_reason' | 'last_deep_clean_at' | 'last_status_changed_at' | 'last_status_changed_by' | 'legacy_status'> {
  total_items: number
  missing_items: number
  items_in_laundry: number
  last_check_at: string | null
  last_check_score: number | null
  // Pricing fields (may not come from RPC, use default if missing)
  hourly_price: number | null
  monthly_price: number | null
  min_hours: number | null
  max_hours: number | null
  // State machine v2 fields (RPC may omit)
  dnd_until?: string | null
  dnd_reason?: string | null
  oos_until?: string | null
  oos_reason?: string | null
  last_deep_clean_at?: string | null
  last_status_changed_at?: string | null
  last_status_changed_by?: string | null
  legacy_status?: string | null
}

export interface RoomFilters {
  search?: string
  floor?: number
  roomType?: RoomType
  status?: RoomStatus
  missingItemsOnly?: boolean
}

// Detailed item tracking interfaces for room checks
export interface LaundryItem {
  item_id: string
  item_name: string
  item_code?: string
  quantity: number
  notes?: string
}

export interface ConsumedItem {
  item_id: string
  item_name: string
  item_code?: string
  quantity: number
  need_refill: boolean
}

export interface LostItem {
  item_id: string
  item_name: string
  item_code?: string
  item_type: 'linen' | 'consumable' | 'equipment' | 'furniture'
  quantity: number
  estimated_value?: number
  notes?: string
}

export interface DamagedItem {
  item_id: string
  item_name: string
  item_code?: string
  item_type?: 'linen' | 'consumable' | 'equipment' | 'furniture'
  quantity: number
  damage_type: 'repairable' | 'replacement_needed'
  damage_level?: 'minor' | 'moderate' | 'major' | 'critical'
  damage_cost: number
  notes?: string
  photos?: string[]
}

// Re-export DamageChargeItem from bookingCalculations for convenience
export type { DamageChargeItem } from '@/lib/bookingCalculations'

export interface ReplacedItem {
  item_id: string
  item_name: string
  item_code?: string
  quantity: number
  from_stock: boolean
}

// Cleaning request data for checkout
export type CleaningPriority = 'low' | 'medium' | 'high' | 'urgent'
export type RoomCondition = 'clean' | 'dirty' | 'very_dirty'

export interface CleaningRequestData {
  needs_cleaning: boolean
  cleaning_priority: CleaningPriority
  cleaning_notes?: string
  room_condition: RoomCondition
}

export interface RoomCheckFormData {
  check_type: CheckType
  cleanliness_score?: number
  items_complete: boolean
  items_missing: any[]
  items_damaged: any[]
  items_sent_to_laundry: LaundryItem[]
  items_consumed: ConsumedItem[]
  items_lost: LostItem[]
  items_replaced: ReplacedItem[]
  notes?: string
  photos?: string[]
  // Cleaning request fields (checkout only)
  needs_cleaning?: boolean
  cleaning_priority?: CleaningPriority
  cleaning_notes?: string
  room_condition?: RoomCondition
}

export interface FloorPlanData {
  [floor: string]: {
    id: string
    room_number: string
    room_type: RoomType
    status: RoomStatus
  }[]
}

export interface RoomDetailData {
  room: Room
  hotel: any
  items: RoomItemWithDetails[]
  recent_checks: RoomCheckWithUser[]
  missing_items?: any[]
}

export interface RoomItemWithDetails {
  item_id: string
  item_code: string
  item_name: string
  item_type?: string
  item_thumbnail?: string
  category_id?: string | null
  category_name?: string
  standard_quantity: number
  current_quantity: number
  missing_quantity: number
  condition: string
  is_verified: boolean
  verified_at?: string
  verified_by?: string
  room_item_id?: string | null
  has_standard: boolean
  // Enrichment fields (Sprint 4 #33) — RPC `get_room_items_with_standards`
  is_chargeable?: boolean
  unit_price?: number | null
  asset_group?: string | null
  default_item_type?: string | null
  unit?: string | null
}

export interface RoomCheckWithUser {
  id: string
  check_type: CheckType
  cleanliness_score?: number
  items_complete: boolean
  items_missing: any[]
  items_damaged: any[]
  items_sent_to_laundry?: LaundryItem[]
  items_consumed?: ConsumedItem[]
  items_lost?: LostItem[]
  items_replaced?: ReplacedItem[]
  notes?: string
  photos?: string[]
  checked_at: string
  checked_by_name: string
  checked_by_avatar?: string
}

