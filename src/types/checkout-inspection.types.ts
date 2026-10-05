// Checkout inspection request types
export type CheckoutInspectionStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface CheckoutInspectionRequest {
  id: string
  tenant_id: string
  hotel_id: string
  room_id: string
  booking_id: string
  requested_by: string | null
  assigned_to: string
  status: CheckoutInspectionStatus
  room_check_id: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  notes: string | null
}

export interface CheckoutInspectionRequestWithDetails extends CheckoutInspectionRequest {
  assigned_user?: {
    id: string
    full_name: string
    avatar_url?: string
  }
  requested_user?: {
    id: string
    full_name: string
  }
  room?: {
    id: string
    room_number: string
  }
  booking?: {
    id: string
    guest_name: string
  }
}
