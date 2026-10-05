// Route/Batch/Stop System Types

export type ShiftCode = 'morning' | 'afternoon' | 'night'
export type BatchStatus = 'open' | 'handed_over' | 'received' | 'done'
export type StopStatus = 'pending' | 'delivered' | 'cannot_access' | 'resolved'
export type ExceptionType = 'guest_inside' | 'dnd' | 'locked' | 'retry' | 'other'
export type RouteStatus = 'pending' | 'released' | 'in_progress' | 'completed' | 'closed' | 'cancelled'

export interface DistributionBatch {
  id: string
  distribution_order_id: string
  batch_number: number
  status: BatchStatus
  handed_over_at: string | null
  handed_over_by: string | null
  handed_over_by_name?: string | null
  received_at: string | null
  received_by: string | null
  received_by_name?: string | null
  created_at: string
  updated_at: string
  // Computed
  stops_count?: number
  stops_delivered?: number
  stops_cannot_access?: number
}

export interface RouteStop {
  id: string
  distribution_order_id: string
  room_id: string
  room_number: string
  floor: number
  batch_number: number
  status: string // Legacy status
  stop_status: StopStatus
  exception_type: ExceptionType | null
  exception_reason: string | null
  delivered_at: string | null
  delivered_by: string | null
  delivered_by_name: string | null
  confirmed_at: string | null
  confirmed_by_name: string | null
  returned_at: string | null
  handover_to_order_id: string | null
  handover_at: string | null
  items: RouteStopItem[]
}

export interface RouteStopItem {
  id: string
  item_id: string
  item_name: string
  item_code: string
  quantity: number
  quantity_confirmed: number
  status: string
}

export interface RouteDetail {
  id: string
  order_code: string
  status: RouteStatus
  floor: number | null
  shift_date: string
  shift_code: ShiftCode
  batch_size: number
  total_rooms: number
  total_items: number
  rooms_completed: number
  assigned_to: string | null
  assigned_to_name: string | null
  created_by: string
  created_by_name: string
  released_at: string | null
  released_by: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  notes: string | null
  tenant_id?: string
  hotel_id?: string
  batches: DistributionBatch[]
  stops: RouteStop[]
}

export interface RouteFilters {
  status?: RouteStatus
  floor?: number
  shift_date?: string
  shift_code?: ShiftCode
  assigned_to?: string
}

// RPC Response types
export interface HandoverBatchResponse {
  success: boolean
  batch_id: string
  status: string
  handed_over_at: string
}

export interface ReceiveBatchResponse {
  success: boolean
  batch_id: string
  status: string
  received_at: string
}

export interface DeliverStopResponse {
  success: boolean
  room_order_id: string
  stop_status: string
  delivered_at: string
}

export interface MarkCannotAccessResponse {
  success: boolean
  room_order_id: string
  stop_status: string
  exception_type: string
}

export interface RetryStopResponse {
  success: boolean
  room_order_id: string
  stop_status: string
}

export interface ReturnToStockResponse {
  success: boolean
  room_order_id: string
  returned_at: string
}

export interface HandoverStopResponse {
  success: boolean
  room_order_id: string
  stop_status: string
  next_order_id: string
  next_order_code: string
  next_shift_code: string
}

export interface CloseRouteResponse {
  success: boolean
  order_id: string
  status: string
  closed_at: string
}

// Shift labels
export const SHIFT_LABELS: Record<ShiftCode, string> = {
  morning: 'Ca sáng',
  afternoon: 'Ca chiều',
  night: 'Ca tối',
}

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  open: 'Chờ giao',
  handed_over: 'Đã giao',
  received: 'Đã nhận',
  done: 'Hoàn thành',
}

export const STOP_STATUS_LABELS: Record<StopStatus, string> = {
  pending: 'Chờ giao',
  delivered: 'Đã giao',
  cannot_access: 'Không vào được',
  resolved: 'Đã xử lý',
}

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  guest_inside: 'Khách trong phòng',
  dnd: 'Do Not Disturb',
  locked: 'Phòng khóa',
  retry: 'Thử lại',
  other: 'Lý do khác',
}
