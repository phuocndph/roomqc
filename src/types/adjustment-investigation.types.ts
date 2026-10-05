// Investigation status for adjustment items
export type InvestigationStatus = 'pending' | 'investigating' | 'resolved'

// Resolution type when investigation is complete
export type ResolutionType = 
  | 'adjust_stock'      // Điều chỉnh tồn kho trực tiếp
  | 'compensation'      // Yêu cầu bồi thường
  | 'supplementary_in'  // Ghi nhận nhập bổ sung
  | 'supplementary_out' // Ghi nhận xuất bổ sung

// Item status in adjustment workflow
export type AdjustmentItemStatus = 
  | 'pending'           // Chờ duyệt
  | 'investigating'     // Đang điều tra
  | 'approved'          // Đã duyệt

// Linked document type
export type LinkedDocumentType = 
  | 'inventory_transaction'
  | 'compensation_request'
  | 'investigation_ticket'

// Variance reason codes
export const VARIANCE_REASONS = {
  damage: { label: 'Hư hỏng', description: 'Đồ dùng bị hỏng không sử dụng được' },
  expired: { label: 'Hết hạn', description: 'Đã hết hạn sử dụng' },
  loss: { label: 'Mất mát', description: 'Không tìm thấy, không rõ nguyên nhân' },
  theft: { label: 'Thất thoát', description: 'Nghi ngờ bị lấy cắp' },
  unrecorded_out: { label: 'Xuất chưa ghi nhận', description: 'Đã xuất kho nhưng chưa ghi sổ' },
  unrecorded_in: { label: 'Nhập chưa ghi nhận', description: 'Đã nhập kho nhưng chưa ghi sổ' },
  data_error: { label: 'Sai số liệu', description: 'Số liệu ban đầu không chính xác' },
  other: { label: 'Khác', description: 'Nguyên nhân khác' },
} as const

export type VarianceReasonCode = keyof typeof VARIANCE_REASONS

// Resolution options based on variance type
export const RESOLUTION_OPTIONS = {
  shortage: [
    { value: 'adjust_stock', label: 'Điều chỉnh giảm tồn kho', description: 'Cập nhật số lượng trong hệ thống' },
    { value: 'compensation', label: 'Yêu cầu bồi thường', description: 'Tạo phiếu yêu cầu bồi thường' },
    { value: 'supplementary_out', label: 'Ghi nhận xuất bổ sung', description: 'Đã xuất nhưng chưa ghi nhận' },
  ],
  surplus: [
    { value: 'adjust_stock', label: 'Điều chỉnh tăng tồn kho', description: 'Cập nhật số lượng trong hệ thống' },
    { value: 'supplementary_in', label: 'Ghi nhận nhập bổ sung', description: 'Đã nhập nhưng chưa ghi nhận' },
  ],
} as const

// DTO for starting investigation
export interface StartInvestigationDto {
  itemId: string
  adjustmentId: string
  notes?: string
}

// DTO for resolving investigation
export interface ResolveInvestigationDto {
  itemId: string
  adjustmentId: string
  resolutionType: ResolutionType
  resolutionNotes?: string
  responsiblePersonId?: string // For compensation
}

// DTO for approving item directly (for matched items)
export interface ApproveItemDto {
  itemId: string
  adjustmentId: string
  notes?: string
}

// Extended adjustment item with investigation fields
export interface AdjustmentItemWithInvestigation {
  id: string
  adjustment_id: string
  item_id: string
  system_quantity: number
  actual_quantity: number
  difference: number
  unit_price: number | null
  value_difference: number | null
  discrepancy_reason: string | null
  status: AdjustmentItemStatus
  checked_by: string | null
  checked_at: string | null
  photos: string[] | null
  notes: string | null
  
  // Investigation fields
  investigation_status: InvestigationStatus | null
  investigation_notes: string | null
  investigation_started_at: string | null
  investigation_completed_at: string | null
  resolution_type: ResolutionType | null
  resolution_notes: string | null
  responsible_person_id: string | null
  linked_document_type: LinkedDocumentType | null
  linked_document_id: string | null
  approved_by: string | null
  approved_at: string | null
  
  // Relations
  item?: {
    id: string
    code: string
    name: string
    unit_price: number | null
    category?: { name: string; color: string }
    item_images?: { id: string; url: string; is_primary: boolean }[]
  }
  checked_by_user?: { id: string; full_name: string; avatar_url: string }
  approved_by_user?: { id: string; full_name: string; avatar_url: string }
  responsible_person?: { id: string; full_name: string; avatar_url: string }
}
