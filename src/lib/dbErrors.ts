/**
 * Map các mã lỗi RPC/PostgreSQL sang thông điệp tiếng Việt thân thiện.
 *
 * Dùng chung cho mọi mutation: cứ catch (err) → toast(mapDbError(err.message)).
 */
export function mapDbError(message: string | undefined | null): string {
  const msg = String(message ?? '')

  // Read-only mode (Phase 1)
  if (msg.includes('TENANT_READ_ONLY')) {
    return 'Tài khoản đang ở chế độ chỉ đọc. Vui lòng gia hạn để tiếp tục thao tác.'
  }

  // Permission
  if (msg.includes('FORBIDDEN')) return 'Bạn không có quyền thực hiện thao tác này.'
  if (msg.includes('NOT_AUTHENTICATED')) return 'Vui lòng đăng nhập lại.'
  if (msg.includes('NOT_FOUND')) return 'Không tìm thấy dữ liệu yêu cầu.'

  // Tenant isolation
  if (msg.includes('TENANT_MISMATCH')) return 'Dữ liệu không thuộc tài khoản của bạn.'
  if (msg.includes('USER_HAS_NO_TENANT')) return 'Tài khoản của bạn chưa được gán vào khách sạn nào.'

  // Room check guard
  if (msg.includes('ROOM_NOT_FOUND')) return 'Không tìm thấy phòng. Có thể đã bị xóa.'
  if (msg.includes('TASK_NOT_FOUND')) return 'Không tìm thấy công việc. Có thể đã bị xóa.'
  if (msg.includes('TASK_NOT_ASSIGNED_TO_USER')) return 'Công việc này không được giao cho bạn.'
  if (msg.includes('INVALID_CHECK_TYPE')) return 'Loại kiểm tra không hợp lệ.'

  // Rate limit (Phase 1 — Lượt 3)
  if (msg.includes('RATE_LIMITED')) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.'

  // State machine v2 (Phase 2)
  if (msg.includes('INVALID_TASK_TRANSITION')) return 'Chuyển trạng thái công việc không hợp lệ.'
  if (msg.includes('INVALID_BOOKING_TRANSITION')) return 'Chuyển trạng thái booking không hợp lệ.'
  if (msg.includes('NO_PERMISSION_QC')) return 'Bạn không có quyền duyệt/từ chối công việc này.'
  if (msg.includes('NO_PERMISSION_CANCEL')) return 'Bạn không có quyền hủy công việc của người khác.'
  if (msg.includes('NO_PERMISSION_BOOKING_FLAG')) return 'Bạn không có quyền đặt khách ngủ ngoài / bỏ trốn.'
  if (msg.includes('BOOKING_NOT_FOUND')) return 'Không tìm thấy booking.'

  // QC Mode (multi-role / qc workflow)
  if (msg.includes('PEER_REVIEW_SELF_FORBIDDEN')) return 'Chế độ peer: bạn không được tự duyệt công việc của chính mình.'
  if (msg.includes('NO_PERMISSION_QC_STRICT')) return 'Chế độ strict: chỉ quản lý hoặc chủ khách sạn được duyệt.'
  if (msg.includes('NO_PERMISSION_COMPLETE')) return 'Bạn không được phép hoàn tất công việc này.'
  if (msg.includes('REJECTION_REASON_REQUIRED')) return 'Vui lòng nhập lý do trả về (tối thiểu 3 ký tự).'

  // No-Show / Reschedule (v1.0.25)
  if (msg.includes('INVALID_BOOKING_STATUS_FOR_NO_SHOW')) return 'Chỉ booking đang "Đã đặt" mới có thể đánh dấu No-Show.'
  if (msg.includes('INVALID_BOOKING_STATUS_FOR_RESCHEDULE')) return 'Chỉ booking đang "Đã đặt" mới có thể dời lịch.'
  if (msg.includes('NOT_OVERDUE')) return 'Booking này chưa quá giờ check-in.'
  if (msg.includes('BOOKING_CONFLICT')) return 'Phòng đã có lịch trùng trong khoảng thời gian này.'
  if (msg.includes('INVALID_DATE_RANGE')) return 'Ngày trả phòng phải sau ngày nhận phòng.'

  return msg || 'Đã xảy ra lỗi không xác định.'
}
