export interface ContextualHelpItem {
  title: string
  description: string
  quickSteps: string[]
  tips?: string[]
  relatedGuideIds?: string[]
}

export const contextualHelpMap: Record<string, ContextualHelpItem> = {
  '/rooms': {
    title: 'Quản lý phòng',
    description: 'Xem trạng thái tất cả phòng, kiểm tra phòng và quản lý đồ dùng trong phòng.',
    quickSteps: [
      'Bấm vào phòng để xem chi tiết và đồ dùng',
      'Chọn "Kiểm tra phòng" để bắt đầu kiểm tra check-in/check-out/hàng ngày',
      'Lọc phòng theo trạng thái hoặc tầng bằng thanh filter phía trên',
      'Phòng có biểu tượng cảnh báo = đang thiếu đồ dùng',
    ],
    tips: [
      'Bấm giữ phòng để xem menu nhanh',
      'Màu sắc phòng thể hiện trạng thái: xanh = trống, đỏ = đang dùng, vàng = cần dọn',
    ],
    relatedGuideIds: ['room-check-checkin', 'room-check-checkout', 'room-check-daily'],
  },
  '/bookings': {
    title: 'Quản lý đặt phòng',
    description: 'Tạo, quản lý booking và xử lý check-in/check-out cho khách.',
    quickSteps: [
      'Bấm "Tạo booking" để đặt phòng mới',
      'Tìm booking bằng tên khách, mã booking hoặc số phòng',
      'Bấm vào booking để xem chi tiết, check-in hoặc check-out',
      'Tab "Phụ thu" để xem và thêm các khoản phát sinh',
    ],
    tips: [
      'Lọc theo trạng thái: Đã đặt, Đang ở, Đã trả để tìm nhanh',
    ],
    relatedGuideIds: ['guest-checkin', 'guest-checkout', 'create-booking'],
  },
  '/laundry': {
    title: 'Quản lý giặt là',
    description: 'Tạo lô giặt, theo dõi trạng thái và nhận hàng từ đơn vị giặt.',
    quickSteps: [
      'Bấm "Tạo lô giặt" để gửi đồ đi giặt',
      'Theo dõi trạng thái: Đã giao → Sẵn sàng → Đã nhận → Đã nhập kho',
      'Bấm vào lô để cập nhật trạng thái khi nhận hàng về',
      'Tab "Đơn vị giặt" để quản lý nhà cung cấp dịch vụ giặt',
    ],
    tips: [
      'Khi tạo lô, tồn kho tự động chuyển sang "Đang giặt"',
      'Khi nhận về và nhập kho, tồn kho tự động cộng lại',
    ],
    relatedGuideIds: ['send-laundry'],
  },
  '/inventory': {
    title: 'Quản lý kho',
    description: 'Xem tồn kho, nhập/xuất hàng và kiểm kê.',
    quickSteps: [
      'Xem tổng quan tồn kho tại trang chính',
      'Vào "Nhập kho" để tạo phiếu nhập hàng mới',
      'Vào "Xuất kho" để xuất hàng cho các mục đích',
      'Vào "Kiểm kê" để đối soát số lượng thực tế',
    ],
    tips: [
      'Sản phẩm có biểu tượng cảnh báo = dưới mức tồn kho tối thiểu',
      'Dùng bộ lọc danh mục để tìm sản phẩm nhanh hơn',
    ],
    relatedGuideIds: ['inventory-inbound', 'inventory-outbound', 'stock-audit'],
  },
  '/inventory/inbound': {
    title: 'Nhập kho',
    description: 'Tạo phiếu nhập hàng từ nhà cung cấp vào kho.',
    quickSteps: [
      'Bấm "Tạo phiếu nhập" để bắt đầu',
      'Chọn nhà cung cấp (tùy chọn)',
      'Thêm sản phẩm, nhập số lượng và đơn giá',
      'Xác nhận để tồn kho tự động tăng',
    ],
    relatedGuideIds: ['inventory-inbound'],
  },
  '/inventory/outbound': {
    title: 'Xuất kho',
    description: 'Xuất hàng từ kho cho các mục đích: sử dụng, hỏng, trả nhà cung cấp.',
    quickSteps: [
      'Chọn loại xuất kho phù hợp',
      'Thêm sản phẩm và số lượng',
      'Xác nhận — tồn kho tự động giảm',
    ],
    tips: [
      'Để giao đồ đến phòng, nên dùng "Phiếu giao hàng" thay vì xuất kho thường',
    ],
    relatedGuideIds: ['inventory-outbound'],
  },
  '/inventory/distributions': {
    title: 'Phiếu giao hàng',
    description: 'Quản lý việc giao đồ dùng từ kho đến các phòng.',
    quickSteps: [
      'Bấm "Tạo phiếu" để tạo phiếu giao mới',
      'Theo dõi trạng thái: Chờ → Đang giao → Hoàn thành',
      'Bấm vào phiếu để xem chi tiết và cập nhật tiến độ giao',
    ],
    tips: [
      'Dùng "Tự động phân bổ" để hệ thống tính số lượng theo chuẩn phòng',
      'Có thể tạo phiếu nhanh từ yêu cầu bổ sung',
    ],
    relatedGuideIds: ['distribution-order'],
  },
  '/maintenance': {
    title: 'Quản lý bảo trì',
    description: 'Tạo và theo dõi yêu cầu sửa chữa, bảo trì thiết bị.',
    quickSteps: [
      'Bấm "Tạo yêu cầu" để báo cáo sự cố mới',
      'Điền tiêu đề, vị trí, mức độ ưu tiên',
      'Theo dõi trạng thái: Chờ → Đang xử lý → Hoàn thành',
      'Bấm vào yêu cầu để cập nhật tiến độ',
    ],
    relatedGuideIds: ['report-maintenance'],
  },
  '/items': {
    title: 'Quản lý sản phẩm',
    description: 'Thêm, sửa và quản lý danh mục sản phẩm, đồ dùng.',
    quickSteps: [
      'Bấm "Thêm sản phẩm" để tạo sản phẩm mới',
      'Nhập tên, mã, danh mục và mức tồn kho tối thiểu',
      'Bấm vào sản phẩm để xem chi tiết và chỉnh sửa',
      'Dùng bộ lọc danh mục để tìm nhanh',
    ],
  },
  '/reports': {
    title: 'Báo cáo',
    description: 'Xem các báo cáo tổng hợp theo nhiều khía cạnh.',
    quickSteps: [
      'Chọn loại báo cáo cần xem từ dashboard',
      'Chọn khoảng thời gian phù hợp',
      'Dùng nút "Xuất PDF" hoặc "Xuất Excel" để tải về',
    ],
    relatedGuideIds: ['view-reports'],
  },
  '/settings': {
    title: 'Cài đặt',
    description: 'Cấu hình hệ thống, quản lý người dùng, gói dịch vụ.',
    quickSteps: [
      'Thông tin tổ chức: Cập nhật tên, logo công ty',
      'Người dùng: Thêm, sửa, phân quyền nhân viên',
      'Gói dịch vụ: Gia hạn, mua thêm phòng',
      'Khách sạn: Thêm và quản lý khách sạn',
    ],
    relatedGuideIds: ['manage-subscription', 'add-hotel', 'system-settings', 'manage-staff'],
  },
  '/settings/subscription': {
    title: 'Gói dịch vụ',
    description: 'Quản lý gói subscription, gia hạn và mua thêm phòng.',
    quickSteps: [
      'Xem trạng thái gói hiện tại ở phần trên',
      'Bấm "Gia hạn" để kéo dài thời hạn sử dụng',
      'Bấm "Thêm phòng" để mua thêm quota phòng',
      'Thanh toán bằng QR VietQR — tự động xác nhận',
    ],
    tips: [
      'Giá: 1.000đ/phòng/ngày, giảm giá khi gia hạn dài',
    ],
    relatedGuideIds: ['manage-subscription'],
  },
  '/settings/users': {
    title: 'Quản lý người dùng',
    description: 'Thêm nhân viên, phân quyền và gán khách sạn.',
    quickSteps: [
      'Bấm "Thêm người dùng" để tạo tài khoản mới',
      'Nhập email, tên, chọn vai trò (Quản lý/Nhân viên)',
      'Gán khách sạn cho nhân viên',
      'Bấm vào nhân viên để chỉnh sửa thông tin',
    ],
    relatedGuideIds: ['manage-staff'],
  },
  '/dashboard': {
    title: 'Dashboard',
    description: 'Trang tổng quan hiển thị tình hình hoạt động khách sạn.',
    quickSteps: [
      'Xem tổng số phòng theo trạng thái ở phần trên',
      'Biểu đồ doanh thu và công suất ở phần giữa',
      'Hoạt động gần đây ở phần dưới',
      'Chuyển khách sạn bằng bộ chọn ở header',
    ],
    relatedGuideIds: ['dashboard-overview'],
  },
}
