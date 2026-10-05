// Shared types for Outbound flow (used by QuickOutboundDialog & MobileOutboundForm)

export type OutboundCategory =
  | 'room_assign'
  | 'laundry'
  | 'maintenance'
  | 'disposal'
  | 'other'

export interface LaundryExtras {
  vendor_id: string
  delivery_date: Date
  expected_return_date: Date
  delivery_staff_id: string
  receiver_name: string
  notes?: string
}

export interface MaintenanceExtras {
  id: string
  title: string
  room_number?: string
}

export interface OutboundItemInput {
  item_id: string
  quantity: number
  available_quantity?: number
  notes?: string
  weight_kg?: number
}

export interface OutboundSubmitPayload {
  transaction_category: OutboundCategory
  from_warehouse_id: string
  to_location?: string
  items: OutboundItemInput[]
  recipient_name?: string
  photos?: string[]
  notes?: string
}

export interface OutboundSubmitExtras {
  selectedRoomIds?: string[]
  laundryData?: LaundryExtras | null
  selectedMaintenanceRequest?: MaintenanceExtras | null
}

export type OutboundSubmitKind = 'outbound' | 'laundry' | 'distribution'
