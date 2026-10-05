export type DistributionOrderStatus = 'pending' | 'released' | 'in_progress' | 'completed' | 'cancelled'
export type DistributionRoomStatus = 'pending' | 'delivered' | 'confirmed' | 'rejected'

export interface DistributionOrder {
  id: string
  order_code: string
  status: DistributionOrderStatus
  total_rooms: number
  total_items: number
  rooms_completed: number
  assigned_to: string | null
  assigned_to_name: string | null
  created_by: string
  created_by_name: string
  notes: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  total_count?: number
}

export interface DistributionOrderRoom {
  id: string
  room_id: string
  room_number: string
  floor: number
  status: DistributionRoomStatus
  delivered_at: string | null
  delivered_by: string | null
  delivered_by_name: string | null
  confirmed_at: string | null
  confirmed_by_name: string | null
  rejection_reason: string | null
  items: DistributionOrderItem[]
}

export interface DistributionOrderItem {
  id: string
  item_id: string
  item_name: string
  item_code: string
  quantity: number
  quantity_confirmed: number
  status: string
}

export interface DistributionOrderDetail extends Omit<DistributionOrder, 'rooms_completed' | 'total_count'> {
  rooms: DistributionOrderRoom[]
}

export interface CreateDistributionData {
  assigned_to?: string
  notes?: string
  auto_release?: boolean
  rooms: {
    room_id: string
    items: {
      item_id: string
      quantity: number
    }[]
  }[]
}

export interface DistributionFilters {
  status?: DistributionOrderStatus
  assigned_to?: string
}
