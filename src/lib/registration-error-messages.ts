/**
 * Converts the registration RPC's safe, expected failures into instructions a
 * hotel owner can act on.  Transport errors are deliberately kept separate so
 * the UI never calls a server-side validation problem a "network" problem.
 */
export function getRegistrationErrorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : ''

  const normalized = message.toLowerCase()

  if (/failed to fetch|networkerror|network request failed|load failed|err_network|connection refused|econnrefused|cors/.test(normalized)) {
    return 'Không thể kết nối tới máy chủ. Hãy kiểm tra mạng rồi thử lại; hệ thống sẽ kiểm tra thiết lập đã có để tránh tạo trùng.'
  }

  if (normalized.includes('no active subscription plan found')) {
    return 'Hệ thống chưa có gói dùng thử đang hoạt động. Vui lòng liên hệ quản trị viên RoomQC.'
  }

  if (normalized.includes('registration email does not match')) {
    return 'Email thiết lập phải trùng với email bạn đã dùng để đăng ký.'
  }

  if (normalized.includes('required registration fields are invalid') || normalized.includes('violates check constraint')) {
    return 'Một vài thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường bắt buộc.'
  }

  if (normalized.includes('staff accounts cannot create a tenant') || normalized.includes('super admin accounts cannot use tenant registration')) {
    return 'Tài khoản này không thể tạo khách sạn mới. Hãy đăng nhập bằng tài khoản chủ sở hữu.'
  }

  if (normalized.includes('already provisioned')) {
    return 'Tài khoản này đã được thiết lập. Vui lòng đăng nhập lại để mở khách sạn hiện có.'
  }

  if (normalized.includes('duplicate key') || normalized.includes('already uses this email')) {
    return 'Email này đã gắn với một khách sạn khác. Vui lòng đăng nhập hoặc dùng email khác.'
  }

  return 'Không thể hoàn tất thiết lập lúc này. Vui lòng thử lại; thao tác an toàn để thực hiện lại.'
}
