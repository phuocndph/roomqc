// Housekeeping Task Types

export type TaskType = 'checkout_inspection' | 'cleaning' | 'checkin_prep' | 'amenity_request' | 'delivery_confirmation' | 'other'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed_pending_review'
  | 'approved'
  | 'rejected_rework'
  | 'completed'
  | 'cancelled'

export interface HousekeepingTask {
  id: string
  tenant_id: string
  hotel_id: string
  room_id: string
  booking_id: string | null
  
  task_type: TaskType
  title: string | null
  description: string | null
  priority: TaskPriority
  
  assigned_to: string | null
  requested_by: string | null
  
  status: TaskStatus
  started_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  due_at: string | null

  // QC lifecycle (Phase 2 — completion of state machine)
  qc_required?: boolean
  qc_status?: 'pending' | 'approved' | 'rejected' | null
  awaiting_review_at?: string | null
  approved_at?: string | null
  approved_by?: string | null
  rejected_at?: string | null
  rejected_by?: string | null
  rejection_reason?: string | null
  rework_count?: number

  room_check_id: string | null
  distribution_order_room_id: string | null // Link to delivery task
  notes: string | null

  created_at: string
  updated_at: string
}

export interface HousekeepingTaskWithDetails extends HousekeepingTask {
  room?: {
    id: string
    room_number: string
    floor: number
    room_type: string
  }
  assigned_user?: {
    id: string
    full_name: string
    avatar_url: string | null
  }
  requested_user?: {
    id: string
    full_name: string
    avatar_url: string | null
  }
  booking?: {
    id: string
    guest_name: string
    check_out_date: string
  }
  // Add checkout inspection ID for navigation
  checkout_inspection_id?: string | null
}

export interface CreateTaskInput {
  hotel_id: string
  room_id: string
  booking_id?: string
  task_type: TaskType
  title?: string
  description?: string
  priority?: TaskPriority
  assigned_to?: string
  due_at?: string
  notes?: string
}

// Display helpers
export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  checkout_inspection: 'Kiểm tra checkout',
  cleaning: 'Dọn phòng',
  checkin_prep: 'Chuẩn bị check-in',
  amenity_request: 'Bổ sung đồ dùng',
  delivery_confirmation: 'Xác nhận nhận hàng',
  other: 'Khác'
}

export const TASK_TYPE_ICONS: Record<TaskType, string> = {
  checkout_inspection: 'ClipboardCheck',
  cleaning: 'Sparkles',
  checkin_prep: 'DoorOpen',
  amenity_request: 'Package',
  delivery_confirmation: 'PackageCheck',
  other: 'MoreHorizontal'
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Khẩn cấp'
}

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'text-muted-foreground',
  medium: 'text-amber-600',
  high: 'text-orange-600',
  urgent: 'text-red-600'
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Chờ xử lý',
  in_progress: 'Đang thực hiện',
  completed_pending_review: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected_rework: 'Cần làm lại',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

/** Màu chữ semantic cho từng trạng thái task (theo chuẩn Enterprise SaaS Minimalist). */
export const STATUS_TEXT_COLORS: Record<TaskStatus, string> = {
  pending: 'text-muted-foreground',
  in_progress: 'text-blue-600',
  completed_pending_review: 'text-amber-600',
  approved: 'text-green-600',
  rejected_rework: 'text-red-600',
  completed: 'text-green-600',
  cancelled: 'text-muted-foreground',
}

/** Trạng thái cần hiển thị trong tab "Cần duyệt" của Supervisor/Manager. */
export const TASK_REVIEW_STATUSES: TaskStatus[] = ['completed_pending_review', 'rejected_rework']

/** Trạng thái coi là "đã đóng" (xong việc) để filter dashboard. */
export const TASK_TERMINAL_STATUSES: TaskStatus[] = ['approved', 'completed', 'cancelled']

// Duplicate task error structure
export interface DuplicateTaskInfo {
  id: string
  status: TaskStatus
  assignedName: string
}

export function parseDuplicateTaskError(error: Error): DuplicateTaskInfo | null {
  if (!error.message.startsWith('DUPLICATE_TASK:')) return null
  
  const parts = error.message.split(':')
  if (parts.length < 4) return null
  
  return {
    id: parts[1],
    status: parts[2] as TaskStatus,
    assignedName: parts[3] || ''
  }
}
