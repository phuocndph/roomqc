/**
 * Chuẩn hoá thông báo lỗi cho người dùng cuối (tiếng Việt).
 *
 * Dùng cho mọi toast/alert thay vì hiển thị raw `error.message` từ Supabase/Postgres/Network
 * (vốn là tiếng Anh kỹ thuật và có thể leak chi tiết schema).
 *
 * Ưu tiên sử dụng qua pattern:
 *   toast.error('Tiêu đề', { description: getFriendlyError(error) })
 */
export function getFriendlyError(error: unknown): string {
  if (typeof error === 'string') return error

  const raw = error && typeof error === 'object' && 'message' in error
    ? (error as { message?: unknown }).message
    : undefined
  const msg = typeof raw === 'string' ? raw : ''
  const normalized = msg.toLowerCase()

  // Map lỗi Supabase/Postgres phổ biến
  if (normalized.includes('duplicate key')) return 'Dữ liệu này đã tồn tại, vui lòng kiểm tra lại.'
  if (normalized.includes('violates foreign key')) return 'Không thể thực hiện vì dữ liệu liên quan đang được sử dụng.'
  if (normalized.includes('violates not-null')) return 'Vui lòng điền đầy đủ thông tin bắt buộc.'
  if (normalized.includes('jwt') || normalized.includes('token')) return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.'
  if (
    normalized.includes('network') ||
    normalized.includes('fetch') ||
    normalized.includes('cors') ||
    normalized.includes('err_connection') ||
    normalized.includes('econnrefused') ||
    normalized.includes('network request failed')
  ) return 'Không thể kết nối máy chủ. Kiểm tra URL Supabase và thử lại.'
  if (normalized.includes('permission') || normalized.includes('policy')) return 'Bạn không có quyền thực hiện thao tác này.'
  if (normalized.includes('timeout')) return 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.'

  return 'Đã xảy ra lỗi. Vui lòng thử lại hoặc liên hệ hỗ trợ.'
}
