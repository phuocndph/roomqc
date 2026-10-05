import { 
  BedDouble, Shirt, Wrench, Package, ClipboardCheck, 
  UserCheck, CreditCard, CalendarPlus, Receipt, CalendarClock,
  Warehouse, LayoutGrid, BarChart3, Users,
  LayoutDashboard, CreditCard as CreditCardIcon, Building2, Settings,
  LucideIcon, TruckIcon, ClipboardList, ShieldCheck, Bell
} from 'lucide-react'

export interface GuideStep {
  title: string
  description: string
  detailedDescription?: string
  warnings?: string[]
  note?: string
}

export interface HelpGuide {
  id: string
  title: string
  description: string
  detailedDescription?: string
  icon: LucideIcon
  navigateTo?: string
  steps: GuideStep[]
  tips?: string[]
  prerequisites?: string[]
  importantNotes?: string[]
}

export interface RoleGuides {
  roleId: string
  roleLabel: string
  roleDescription: string
  guides: HelpGuide[]
}

export const helpGuides: RoleGuides[] = [
  {
    roleId: 'housekeeping',
    roleLabel: 'Nhân viên phòng',
    roleDescription: 'Hướng dẫn các thao tác kiểm tra phòng, gửi giặt, báo bảo trì và bổ sung đồ dùng',
    guides: [
      {
        id: 'room-check-checkin',
        title: 'Kiểm tra phòng khi khách nhận phòng (Check-in)',
        description: 'Kiểm tra và chuẩn bị phòng trước khi khách nhận phòng',
        detailedDescription: 'Đây là quy trình kiểm tra phòng TRƯỚC khi khách nhận phòng. Mục đích là đảm bảo phòng đã sạch sẽ, đầy đủ đồ dùng theo tiêu chuẩn, và sẵn sàng đón khách. Nếu phát hiện thiếu hoặc hỏng, hệ thống sẽ tự động tạo yêu cầu bổ sung/sửa chữa. Nhân viên buồng phòng thường thực hiện thao tác này khi nhận thông báo "có phòng cần chuẩn bị check-in" hoặc theo lịch phân công ca.',
        icon: ClipboardCheck,
        navigateTo: '/rooms',
        prerequisites: [
          'Phòng phải có trạng thái "Chờ check-in" hoặc "Đã dọn xong"',
          'Đã có booking gán cho phòng này',
        ],
        steps: [
          { 
            title: 'Vào trang Phòng', 
            description: 'Chọn menu "Phòng" từ thanh điều hướng bên trái',
            detailedDescription: 'Trang Phòng hiển thị tất cả phòng của khách sạn dưới dạng lưới. Mỗi phòng có số phòng, trạng thái (trống, đang sử dụng, cần dọn...) và biểu tượng cảnh báo nếu thiếu đồ. Bạn có thể lọc theo tầng hoặc trạng thái để tìm nhanh phòng cần kiểm tra.',
          },
          { 
            title: 'Chọn phòng cần kiểm tra', 
            description: 'Bấm vào phòng có trạng thái "Chờ check-in" hoặc phòng cần chuẩn bị',
            detailedDescription: 'Khi bấm vào phòng, một popup chi tiết sẽ hiện ra với thông tin: số phòng, loại phòng, trạng thái hiện tại, booking gắn với phòng (nếu có), và danh sách đồ dùng hiện tại. Từ đây bạn có thể bắt đầu kiểm tra.',
          },
          { 
            title: 'Bấm "Kiểm tra phòng"', 
            description: 'Chọn loại kiểm tra "Check-in" từ menu',
            detailedDescription: 'Hệ thống sẽ tự động lấy danh sách đồ dùng tiêu chuẩn của loại phòng này (ví dụ: phòng Deluxe cần 4 khăn tắm, 2 dầu gội, 1 bộ ga...). Danh sách này được cấu hình bởi quản lý trong mục "Chuẩn phòng". Bạn sẽ kiểm tra từng món so với thực tế.',
          },
          { 
            title: 'Kiểm tra từng hạng mục', 
            description: 'Đánh dấu trạng thái các đồ dùng: đủ, thiếu, hỏng, cần thay',
            detailedDescription: 'Hệ thống hiển thị danh sách đồ dùng theo tiêu chuẩn phòng (khăn tắm, dầu gội, ga giường, nước uống...). Với mỗi món, bạn chọn trạng thái: "Đủ" (không cần bổ sung), "Thiếu" (cần thêm — nhập số lượng thiếu), "Hỏng" (cần thay mới), hoặc "Mất" (báo mất). Số lượng thực tế sẽ được so sánh với số chuẩn để tính chênh lệch tự động.',
            warnings: [
              'Nếu chọn "Mất", số lượng tồn kho sẽ bị trừ ngay và ghi nhận vào báo cáo mất mát',
              'Nếu chọn "Hỏng", hệ thống có thể tự tạo yêu cầu bồi thường tùy cấu hình',
            ],
          },
          { 
            title: 'Ghi chú và hoàn thành', 
            description: 'Thêm ghi chú nếu cần và bấm "Hoàn thành kiểm tra"',
            detailedDescription: 'Bạn có thể thêm ghi chú tự do (ví dụ: "Tường bị ố vàng", "Điều hòa có tiếng ồn"). Khi bấm "Hoàn thành", hệ thống sẽ: (1) Lưu kết quả kiểm tra, (2) Tự động tạo yêu cầu bổ sung nếu có món thiếu, (3) Chuyển trạng thái phòng thành "Sẵn sàng" hoặc "Đang sử dụng" tùy theo booking.',
          },
        ],
        tips: [
          'Nếu phát hiện đồ thiếu, hệ thống sẽ tự động tạo yêu cầu bổ sung — bạn không cần tạo thủ công',
          'Phòng sau check-in sẽ tự động chuyển trạng thái thành "Đang sử dụng"',
          'Bạn có thể xem lịch sử kiểm tra trước đó để so sánh',
        ],
        importantNotes: [
          'Kiểm tra phòng check-in nên thực hiện TRƯỚC khi khách đến, không phải sau khi khách nhận phòng',
          'Nếu phòng chưa đạt tiêu chuẩn, hãy hoàn thành bổ sung trước khi xác nhận kiểm tra xong',
        ],
      },
      {
        id: 'room-check-checkout',
        title: 'Kiểm tra phòng khi khách trả phòng (Check-out)',
        description: 'Kiểm tra phòng sau khi khách trả, ghi nhận hư hỏng và mất mát',
        detailedDescription: 'Quy trình kiểm tra phòng SAU khi khách trả phòng. Mục đích là ghi nhận tình trạng phòng, xác định đồ bị mất/hỏng/tiêu hao để tính phụ thu (nếu có) và chuẩn bị cho lượt khách tiếp theo. Đây là bước quan trọng vì liên quan đến tài chính (bồi thường) và tồn kho.',
        icon: ClipboardCheck,
        navigateTo: '/rooms',
        prerequisites: [
          'Khách đã check-out (booking ở trạng thái "Đã trả phòng")',
          'Phòng ở trạng thái "Chờ kiểm tra" hoặc "Cần dọn dẹp"',
        ],
        steps: [
          { 
            title: 'Vào trang Phòng', 
            description: 'Chọn phòng có trạng thái "Chờ check-out"',
            detailedDescription: 'Phòng sau khi khách check-out sẽ chuyển sang trạng thái đặc biệt. Bạn có thể lọc theo trạng thái "Chờ kiểm tra" để tìm nhanh các phòng cần xử lý.',
          },
          { 
            title: 'Bấm "Kiểm tra phòng"', 
            description: 'Chọn loại "Check-out"',
            detailedDescription: 'Hệ thống sẽ hiển thị danh sách đồ dùng ban đầu khi khách nhận phòng (từ kết quả check-in trước đó) để bạn so sánh với tình trạng hiện tại.',
          },
          { 
            title: 'Kiểm tra đồ dùng', 
            description: 'Ghi nhận số lượng đồ còn lại, đồ mất, đồ hỏng',
            detailedDescription: 'Với mỗi đồ dùng, bạn nhập số lượng thực tế còn lại. Hệ thống tự so sánh với số ban đầu để tính: đồ mất (số ban đầu - số còn lại - số tiêu hao), đồ hỏng (bạn đánh dấu thủ công). Đồ mất/hỏng có thể dẫn đến phụ thu cho khách.',
            warnings: [
              'Đồ mất hoặc hỏng do khách gây ra sẽ tự động tạo yêu cầu bồi thường',
              'Hãy kiểm tra kỹ trước khi xác nhận vì kết quả sẽ ảnh hưởng đến bill của khách',
            ],
          },
          { 
            title: 'Ghi nhận tiêu hao', 
            description: 'Đánh dấu các đồ tiêu hao đã sử dụng (nước, snack...)',
            detailedDescription: 'Đồ tiêu hao là các sản phẩm dùng 1 lần như nước đóng chai, trà/cà phê, snack minibar. Nếu đồ tiêu hao có tính phí (chargeable), hệ thống sẽ tự thêm vào tab phụ thu của booking. Đồ tiêu hao miễn phí (complimentary) chỉ trừ tồn kho, không tính tiền khách.',
            note: 'Phân biệt: đồ tiêu hao miễn phí (nước welcome) và đồ tiêu hao tính phí (minibar) — hệ thống đã cấu hình sẵn.',
          },
          { 
            title: 'Hoàn thành', 
            description: 'Bấm "Hoàn thành" — phòng sẽ tự chuyển sang "Cần dọn dẹp"',
            detailedDescription: 'Sau khi hoàn thành kiểm tra, phòng tự động chuyển sang trạng thái "Cần dọn dẹp" (Cleaning). Bộ phận dọn phòng sẽ nhận thông báo. Tồn kho được cập nhật tự động theo kết quả kiểm tra.',
          },
        ],
        tips: [
          'Đồ hỏng/mất sẽ tự động tạo yêu cầu bồi thường nếu được cấu hình',
          'Sau check-out, phòng tự động chuyển trạng thái sang "Cleaning"',
          'Nếu phòng có booking kế tiếp, hệ thống sẽ ưu tiên dọn phòng này',
        ],
        importantNotes: [
          'Kiểm tra check-out nên thực hiện ngay sau khi khách trả phòng, trước khi dọn dẹp',
          'Kết quả kiểm tra sẽ ảnh hưởng đến bill khách — hãy chính xác và cẩn thận',
        ],
      },
      {
        id: 'room-check-daily',
        title: 'Kiểm tra phòng hàng ngày',
        description: 'Kiểm tra định kỳ hàng ngày để đảm bảo đồ dùng đầy đủ',
        detailedDescription: 'Kiểm tra hàng ngày được thực hiện cho các phòng đang có khách ở. Mục đích là bổ sung đồ dùng đã sử dụng (khăn tắm, nước uống, dầu gội...) và phát hiện sớm hư hỏng. Thường thực hiện theo ca sáng, khi nhân viên vào dọn phòng.',
        icon: ClipboardCheck,
        navigateTo: '/rooms',
        prerequisites: [
          'Phòng đang có khách ở (trạng thái "Đang sử dụng")',
          'Khách đã ra ngoài hoặc cho phép vào phòng',
        ],
        steps: [
          { 
            title: 'Vào trang Phòng', 
            description: 'Chọn phòng đang có khách ở',
            detailedDescription: 'Lọc theo trạng thái "Đang sử dụng" để xem tất cả phòng có khách. Phòng có biểu tượng cảnh báo (!) là phòng đang thiếu đồ theo tiêu chuẩn.',
          },
          { 
            title: 'Chọn "Kiểm tra hàng ngày"', 
            description: 'Hệ thống hiển thị danh sách đồ dùng theo tiêu chuẩn phòng',
            detailedDescription: 'Khác với check-in/check-out, kiểm tra hàng ngày tập trung vào đồ tiêu hao cần bổ sung. Hệ thống sẽ hiển thị danh sách đồ dùng và số lượng hiện tại so với tiêu chuẩn.',
          },
          { 
            title: 'Kiểm tra và cập nhật', 
            description: 'Ghi nhận đồ đã sử dụng, cần bổ sung',
            detailedDescription: 'Nhập số lượng thực tế cho từng đồ dùng. Hệ thống tự tính số lượng cần bổ sung = số chuẩn - số thực tế. Ví dụ: phòng chuẩn có 2 chai nước, còn 0 → cần bổ sung 2.',
          },
          { 
            title: 'Gửi yêu cầu bổ sung', 
            description: 'Nếu thiếu, hệ thống sẽ tạo yêu cầu bổ sung tự động',
            detailedDescription: 'Sau khi hoàn thành, nếu có đồ cần bổ sung, hệ thống tự tạo yêu cầu gửi đến kho. Kho sẽ chuẩn bị hàng và tạo phiếu giao đến phòng.',
          },
        ],
        tips: [
          'Nên kiểm tra hàng ngày vào buổi sáng khi khách ra ngoài',
          'Kiểm tra hàng ngày giúp phát hiện sớm hư hỏng và tránh khiếu nại từ khách',
        ],
        importantNotes: [
          'Kiểm tra hàng ngày không ảnh hưởng đến bill khách — chỉ cập nhật tồn kho và tạo yêu cầu bổ sung',
        ],
      },
      {
        id: 'send-laundry',
        title: 'Gửi đồ đi giặt',
        description: 'Tạo lô giặt và gửi đồ cho đơn vị giặt ủi',
        detailedDescription: 'Chức năng gửi đồ giặt dùng khi bạn thu gom đồ vải (khăn tắm, ga giường, áo gối...) từ các phòng và gửi cho đơn vị giặt ủi bên ngoài. Hệ thống sẽ tự động trừ tồn kho và chuyển sang trạng thái "Đang giặt". Khi đồ giặt về, quản lý sẽ nhận hàng và nhập lại kho.',
        icon: Shirt,
        navigateTo: '/laundry',
        prerequisites: [
          'Đã có ít nhất 1 đơn vị giặt (vendor) được cấu hình trong hệ thống',
          'Đồ cần giặt phải còn trong tồn kho',
        ],
        steps: [
          { 
            title: 'Vào trang Giặt là', 
            description: 'Chọn "Giặt là" từ menu điều hướng',
            detailedDescription: 'Trang Giặt là hiển thị danh sách tất cả lô giặt đã tạo, với trạng thái và thông tin đơn vị giặt. Bạn có thể lọc theo trạng thái (Đang giặt, Sẵn sàng nhận, Đã nhận...) để theo dõi.',
          },
          { 
            title: 'Bấm "Tạo lô giặt"', 
            description: 'Chọn đơn vị giặt (vendor) từ danh sách',
            detailedDescription: 'Mỗi đơn vị giặt có thể có giá và thời gian giao khác nhau. Chọn đơn vị phù hợp. Nếu chỉ có 1 đơn vị, hệ thống sẽ chọn sẵn.',
          },
          { 
            title: 'Thêm sản phẩm', 
            description: 'Chọn loại đồ và nhập số lượng gửi giặt',
            detailedDescription: 'Chọn từ danh sách sản phẩm vải (khăn tắm, khăn mặt, ga giường...) và nhập số lượng. Hệ thống hiển thị số lượng tồn kho hiện tại để bạn biết có bao nhiêu để gửi. Không thể gửi nhiều hơn số tồn kho.',
            warnings: [
              'Khi xác nhận, số lượng tồn kho sẽ bị trừ ngay lập tức',
              'Không thể gửi giặt nếu số lượng vượt quá tồn kho hiện tại',
            ],
          },
          { 
            title: 'Xác nhận và gửi', 
            description: 'Kiểm tra lại và bấm "Tạo lô giặt"',
            detailedDescription: 'Sau khi xác nhận: (1) Lô giặt được tạo với trạng thái "Đã giao" (delivered), (2) Tồn kho tự động trừ đi số lượng đã gửi, (3) Số lượng "Đang giặt" tăng lên tương ứng. Đơn vị giặt sẽ nhận thông tin đơn hàng.',
          },
        ],
        tips: [
          'Khi tạo lô giặt, số lượng tồn kho sẽ tự động giảm và chuyển sang "Đang giặt"',
          'Theo dõi trạng thái lô: Đã giao → Sẵn sàng → Đã nhận → Đã nhập kho',
          'Bạn có thể gom nhiều loại đồ vào cùng 1 lô giặt',
        ],
        importantNotes: [
          'Luồng trạng thái lô giặt: Đã giao (delivered) → Sẵn sàng nhận (ready) → Đã nhận (received) → Đã nhập kho (stocked)',
          'Chỉ khi lô giặt được đánh dấu "Đã nhập kho" thì tồn kho mới được cộng lại',
          'Nếu có đồ bị mất hoặc hỏng trong quá trình giặt, ghi nhận ở bước nhận hàng để trừ tồn kho',
        ],
      },
      {
        id: 'report-maintenance',
        title: 'Báo cáo bảo trì',
        description: 'Tạo yêu cầu sửa chữa khi phát hiện hư hỏng',
        detailedDescription: 'Khi phát hiện thiết bị hoặc cơ sở vật chất bị hỏng (vòi nước rỉ, điều hòa không mát, bóng đèn cháy, cửa bị kẹt...), bạn tạo yêu cầu bảo trì để bộ phận kỹ thuật xử lý. Yêu cầu sẽ được phân loại theo mức độ ưu tiên và giao cho người phụ trách.',
        icon: Wrench,
        navigateTo: '/maintenance',
        steps: [
          { 
            title: 'Vào trang Bảo trì', 
            description: 'Chọn "Bảo trì" từ menu',
            detailedDescription: 'Trang Bảo trì hiển thị tất cả yêu cầu đang xử lý và lịch sử. Bạn có thể xem nhanh yêu cầu nào đang chờ, đang sửa, đã xong.',
          },
          { 
            title: 'Bấm "Tạo yêu cầu"', 
            description: 'Điền tiêu đề mô tả vấn đề',
            detailedDescription: 'Tiêu đề nên ngắn gọn, rõ ràng. Ví dụ: "Vòi nước phòng 301 bị rỉ", "Điều hòa phòng 205 không mát". Mô tả chi tiết giúp kỹ thuật chuẩn bị đúng dụng cụ.',
          },
          { 
            title: 'Chọn vị trí', 
            description: 'Chọn phòng hoặc khu vực bị hư hỏng',
            detailedDescription: 'Chọn phòng cụ thể hoặc khu vực chung (hành lang, sảnh, bể bơi...). Vị trí giúp kỹ thuật biết cần đến đâu.',
          },
          { 
            title: 'Chọn mức độ ưu tiên', 
            description: 'Thấp, Trung bình, Cao hoặc Khẩn cấp',
            detailedDescription: '• Thấp: Không ảnh hưởng đến khách, xử lý khi rảnh (ví dụ: sơn tường bị ố). • Trung bình: Ảnh hưởng nhẹ, xử lý trong ngày (ví dụ: remote TV hỏng). • Cao: Ảnh hưởng đáng kể, cần xử lý nhanh (ví dụ: nước nóng không chạy). • Khẩn cấp: Cần xử lý ngay lập tức (ví dụ: rò nước, mất điện phòng khách).',
          },
          { 
            title: 'Gửi yêu cầu', 
            description: 'Bấm "Gửi" — quản lý sẽ nhận thông báo',
            detailedDescription: 'Sau khi gửi, yêu cầu ở trạng thái "Chờ duyệt". Quản lý hoặc bộ phận kỹ thuật sẽ nhận thông báo, duyệt và bắt đầu xử lý. Bạn có thể theo dõi tiến độ trên trang Bảo trì.',
          },
        ],
        tips: [
          'Mô tả chi tiết (có ảnh nếu được) giúp kỹ thuật xử lý nhanh hơn',
          'Yêu cầu "Khẩn cấp" sẽ gửi thông báo ngay lập tức cho quản lý',
        ],
        importantNotes: [
          'Luồng trạng thái: Chờ duyệt (waiting) → Đã duyệt (pending) → Đang xử lý (in_progress) → Hoàn thành (completed)',
          'Nếu vấn đề ảnh hưởng đến khách đang ở, hãy chọn ưu tiên "Cao" hoặc "Khẩn cấp"',
        ],
      },
      {
        id: 'supplement-request',
        title: 'Yêu cầu bổ sung đồ dùng',
        description: 'Tạo yêu cầu bổ sung khi phòng thiếu đồ',
        detailedDescription: 'Khi phòng thiếu đồ dùng (khách yêu cầu thêm khăn, hết nước, thiếu dầu gội...), bạn tạo yêu cầu bổ sung. Kho sẽ chuẩn bị hàng và tạo phiếu giao đến phòng. Lưu ý: yêu cầu bổ sung cũng được tạo TỰ ĐỘNG sau khi kiểm tra phòng nếu phát hiện thiếu.',
        icon: Package,
        navigateTo: '/supplements',
        steps: [
          { 
            title: 'Vào trang Bổ sung', 
            description: 'Chọn "Kho" → "Yêu cầu bổ sung" từ menu',
            detailedDescription: 'Trang này hiển thị tất cả yêu cầu bổ sung đang chờ xử lý và lịch sử. Bạn có thể tạo yêu cầu mới hoặc xem trạng thái yêu cầu đã gửi.',
          },
          { 
            title: 'Bấm "Tạo yêu cầu"', 
            description: 'Chọn phòng cần bổ sung',
            detailedDescription: 'Chọn phòng cụ thể. Hệ thống sẽ hiển thị danh sách đồ dùng hiện tại của phòng và số lượng theo tiêu chuẩn để bạn biết thiếu bao nhiêu.',
          },
          { 
            title: 'Chọn sản phẩm', 
            description: 'Chọn loại đồ dùng và số lượng cần bổ sung',
            detailedDescription: 'Chọn từ danh sách sản phẩm của khách sạn. Bạn có thể thêm nhiều sản phẩm cùng lúc. Số lượng bổ sung thường được gợi ý sẵn dựa trên chênh lệch giữa chuẩn và thực tế.',
          },
          { 
            title: 'Gửi yêu cầu', 
            description: 'Bấm "Gửi" — kho sẽ chuẩn bị và giao hàng',
            detailedDescription: 'Sau khi gửi, yêu cầu chuyển đến bộ phận kho. Quản lý kho sẽ tạo phiếu giao hàng và phân công nhân viên giao đến phòng. Bạn có thể theo dõi trạng thái trên trang này.',
          },
        ],
        tips: [
          'Yêu cầu bổ sung cũng được tạo tự động từ kiểm tra phòng — không cần tạo lại',
          'Nếu cần gấp, ghi chú "Cần gấp" để kho ưu tiên xử lý',
        ],
      },
    ],
  },
  {
    roleId: 'frontdesk',
    roleLabel: 'Lễ tân',
    roleDescription: 'Hướng dẫn các thao tác check-in, check-out, booking và xử lý thanh toán',
    guides: [
      {
        id: 'guest-checkin',
        title: 'Check-in khách',
        description: 'Nhận phòng cho khách từ booking đã đặt trước',
        detailedDescription: 'Quy trình check-in là bước tiếp nhận khách vào phòng. Lễ tân xác minh thông tin khách, kiểm tra giấy tờ, và xác nhận phòng. Sau check-in, phòng chuyển sang trạng thái "Đang sử dụng" và nhân viên phòng sẽ nhận thông báo chuẩn bị. Check-in có thể thực hiện cho khách đặt trước (reservation) hoặc khách walk-in (tạo booking rồi check-in luôn).',
        icon: UserCheck,
        navigateTo: '/bookings',
        prerequisites: [
          'Phải có booking ở trạng thái "Đã đặt" (confirmed) cho phòng cần check-in',
          'Phòng phải ở trạng thái "Sẵn sàng" hoặc "Trống"',
        ],
        steps: [
          { 
            title: 'Vào trang Booking', 
            description: 'Chọn "Booking" từ menu điều hướng',
            detailedDescription: 'Trang Booking hiển thị tất cả đặt phòng với các bộ lọc: Tất cả, Đã đặt, Đang ở, Đã trả. Mặc định hiển thị booking hôm nay và sắp tới.',
          },
          { 
            title: 'Tìm booking', 
            description: 'Tìm theo tên khách, mã booking hoặc số phòng',
            detailedDescription: 'Dùng ô tìm kiếm phía trên để tìm nhanh. Bạn có thể tìm theo: tên khách (ví dụ "Nguyễn Văn A"), mã booking (ví dụ "BK-2024-001"), hoặc số phòng (ví dụ "301"). Lọc theo trạng thái "Đã đặt" để chỉ xem booking chờ check-in.',
          },
          { 
            title: 'Bấm "Check-in"', 
            description: 'Xác nhận thông tin khách và phòng',
            detailedDescription: 'Hệ thống hiển thị form xác nhận với thông tin khách (tên, SĐT, email), thông tin phòng (số phòng, loại phòng, giá), và ngày check-in/check-out. Kiểm tra lại tất cả trước khi xác nhận.',
          },
          { 
            title: 'Xác nhận giấy tờ', 
            description: 'Kiểm tra CCCD/Passport, quét nếu cần',
            detailedDescription: 'Theo quy định, khách cần xuất trình giấy tờ tùy thân. Hệ thống hỗ trợ quét CCCD/Passport bằng camera để tự động nhận diện thông tin (nếu bật tính năng quét giấy tờ). Bạn cũng có thể nhập thủ công.',
            note: 'Tính năng quét giấy tờ tự động cần được bật trong Cài đặt hệ thống.',
          },
          { 
            title: 'Hoàn tất', 
            description: 'Bấm xác nhận — phòng chuyển sang "Đang sử dụng"',
            detailedDescription: 'Sau khi xác nhận check-in: (1) Booking chuyển sang trạng thái "Đang ở", (2) Phòng chuyển sang "Đang sử dụng", (3) Nhân viên phòng nhận thông báo kiểm tra phòng check-in, (4) Thời gian check-in thực tế được ghi nhận.',
          },
        ],
        tips: [
          'Nếu khách walk-in (không có booking), tạo booking mới trước rồi check-in ngay',
          'Có thể check-in sớm nếu phòng đã sẵn sàng, không cần chờ đến giờ chuẩn',
        ],
        importantNotes: [
          'Check-in sẽ trigger kiểm tra phòng cho nhân viên buồng phòng — đảm bảo phòng đã sẵn sàng trước khi check-in',
          'Nếu khách có yêu cầu đặc biệt (phòng cao, xa thang máy...), kiểm tra trước khi xác nhận phòng',
        ],
      },
      {
        id: 'guest-checkout',
        title: 'Check-out & Thanh toán',
        description: 'Trả phòng và xử lý thanh toán cho khách',
        detailedDescription: 'Quy trình check-out bao gồm: tính tổng chi phí (tiền phòng + phụ thu), xử lý thanh toán, và trả phòng. Sau check-out, phòng sẽ chuyển sang trạng thái cần kiểm tra/dọn dẹp. Đây là lúc tất cả các khoản phí được tổng hợp: tiền phòng, dịch vụ minibar, giặt ủi khách, hư hỏng...',
        icon: CreditCard,
        navigateTo: '/bookings',
        prerequisites: [
          'Booking ở trạng thái "Đang ở"',
          'Nên hoàn tất kiểm tra phòng check-out trước để có đầy đủ phụ thu',
        ],
        steps: [
          { 
            title: 'Tìm booking đang ở', 
            description: 'Vào trang Booking, lọc trạng thái "Đang ở"',
            detailedDescription: 'Lọc theo trạng thái "Đang ở" (checked-in) để thấy tất cả booking đang lưu trú. Booking hết hạn hôm nay sẽ được đánh dấu nổi bật.',
          },
          { 
            title: 'Bấm "Check-out"', 
            description: 'Hệ thống hiển thị tổng chi phí',
            detailedDescription: 'Trang check-out hiển thị bảng tổng hợp tất cả chi phí: tiền phòng (số đêm × giá phòng), phụ thu minibar, phụ thu dịch vụ, phụ thu hư hỏng (nếu có), và tổng cộng. Kiểm tra kỹ từng khoản.',
          },
          { 
            title: 'Kiểm tra phụ thu', 
            description: 'Xem các khoản phụ thu (minibar, dịch vụ, hư hỏng)',
            detailedDescription: 'Tab phụ thu liệt kê chi tiết từng khoản: sản phẩm gì, số lượng, đơn giá, tổng tiền. Phụ thu có thể đến từ: (1) Minibar (đồ tiêu hao tính phí), (2) Dịch vụ thêm (giặt ủi khách, spa), (3) Hư hỏng tài sản (từ kiểm tra check-out). Bạn có thể thêm/xóa phụ thu trước khi thanh toán.',
            warnings: [
              'Sau khi xác nhận check-out, không thể thêm phụ thu nữa',
            ],
          },
          { 
            title: 'Xử lý thanh toán', 
            description: 'Chọn phương thức: tiền mặt, thẻ, chuyển khoản',
            detailedDescription: 'Các phương thức thanh toán: Tiền mặt (nhập số tiền nhận, tính tiền thối), Thẻ (nhập mã giao dịch), Chuyển khoản (hiển thị mã QR VietQR để khách quét). Có thể kết hợp nhiều phương thức cho 1 bill.',
          },
          { 
            title: 'Hoàn tất', 
            description: 'In hóa đơn nếu cần và xác nhận check-out',
            detailedDescription: 'Sau xác nhận: (1) Booking chuyển thành "Đã trả phòng", (2) Phòng chuyển sang "Cần dọn dẹp", (3) Hóa đơn được lưu trong hệ thống, (4) Có thể in PDF hoặc gửi email cho khách.',
          },
        ],
        tips: [
          'Nên yêu cầu nhân viên phòng kiểm tra check-out trước khi lễ tân xử lý thanh toán',
          'Tiền cọc (nếu có) sẽ được trừ tự động vào tổng bill',
        ],
        importantNotes: [
          'Kiểm tra kỹ tất cả phụ thu TRƯỚC khi xác nhận check-out — không thể thêm sau',
          'Nếu khách check-out muộn, hệ thống có thể tính phí phụ thu tùy cấu hình',
        ],
      },
      {
        id: 'create-booking',
        title: 'Tạo booking mới',
        description: 'Đặt phòng cho khách walk-in hoặc đặt trước',
        detailedDescription: 'Tạo booking là bước đầu tiên trong quy trình đón khách. Booking có thể tạo cho khách đặt trước (reservation) hoặc khách đến trực tiếp (walk-in). Hệ thống tự động kiểm tra phòng trống, tính giá, và áp dụng khuyến mãi nếu có.',
        icon: CalendarPlus,
        navigateTo: '/bookings/new',
        steps: [
          { 
            title: 'Bấm "Tạo booking"', 
            description: 'Từ trang Booking, bấm nút "Tạo mới"',
            detailedDescription: 'Nút "Tạo mới" nằm ở góc phải trên trang Booking. Form tạo booking sẽ mở ra với các trường cần điền.',
          },
          { 
            title: 'Nhập thông tin khách', 
            description: 'Tên, SĐT, email, số giấy tờ',
            detailedDescription: 'Nhập đầy đủ thông tin khách hàng. Nếu khách đã từng đặt phòng trước đó, hệ thống sẽ gợi ý tự động khi bạn gõ tên hoặc SĐT — giúp tiết kiệm thời gian. Trường bắt buộc: Tên và SĐT.',
          },
          { 
            title: 'Chọn phòng và ngày', 
            description: 'Chọn loại phòng, ngày nhận/trả phòng',
            detailedDescription: 'Chọn ngày check-in và check-out, sau đó chọn loại phòng. Hệ thống chỉ hiển thị phòng có sẵn cho khoảng thời gian đã chọn (lọc tự động phòng đã đặt). Bạn có thể chọn phòng cụ thể hoặc để hệ thống tự gán.',
          },
          { 
            title: 'Xác nhận giá', 
            description: 'Kiểm tra giá phòng, áp dụng khuyến mãi nếu có',
            detailedDescription: 'Giá phòng được tính tự động theo: loại phòng × số đêm. Nếu có chương trình khuyến mãi đang chạy, hệ thống sẽ hiển thị giá gốc và giá sau giảm. Bạn cũng có thể nhập giá thủ công (nếu có quyền).',
          },
          { 
            title: 'Lưu booking', 
            description: 'Bấm "Tạo booking" để hoàn thành',
            detailedDescription: 'Booking được tạo với trạng thái "Đã đặt" (confirmed). Từ đây có thể: (1) Check-in ngay nếu khách đã đến, (2) Để chờ khách đến theo lịch, (3) Hủy nếu khách thay đổi.',
          },
        ],
        tips: [
          'Với khách walk-in, tạo booking rồi check-in luôn trong cùng 1 lượt',
          'Kiểm tra xung đột phòng trước khi đặt (hệ thống cảnh báo nếu phòng đã đặt)',
        ],
      },
      {
        id: 'handle-surcharge',
        title: 'Xử lý phụ thu',
        description: 'Ghi nhận các khoản phụ thu minibar, dịch vụ trong thời gian khách ở',
        detailedDescription: 'Phụ thu là các khoản phí phát sinh ngoài tiền phòng: minibar (nước, snack có phí), dịch vụ thêm (giặt ủi, spa), hư hỏng tài sản. Phụ thu được tích lũy trong suốt thời gian khách ở và tổng hợp vào bill khi check-out.',
        icon: Receipt,
        navigateTo: '/bookings',
        steps: [
          { 
            title: 'Tìm booking đang ở', 
            description: 'Vào booking của khách đang ở',
            detailedDescription: 'Tìm booking bằng tên khách hoặc số phòng. Chỉ booking ở trạng thái "Đang ở" mới có thể thêm phụ thu.',
          },
          { 
            title: 'Chọn tab "Phụ thu"', 
            description: 'Xem danh sách các khoản phụ thu hiện có',
            detailedDescription: 'Tab Phụ thu hiển thị tất cả khoản đã ghi nhận: nguồn gốc (thủ công, từ kiểm tra phòng, từ minibar), ngày ghi nhận, số tiền. Tổng phụ thu hiện tại hiển thị ở trên cùng.',
          },
          { 
            title: 'Bấm "Thêm phụ thu"', 
            description: 'Chọn loại: minibar, dịch vụ, hư hỏng',
            detailedDescription: 'Chọn danh mục phụ thu: (1) Minibar — chọn sản phẩm từ danh sách minibar, (2) Dịch vụ — nhập tên dịch vụ tùy ý, (3) Hư hỏng — liên kết với kết quả kiểm tra phòng.',
          },
          { 
            title: 'Nhập chi tiết', 
            description: 'Chọn sản phẩm, số lượng, đơn giá',
            detailedDescription: 'Với minibar: chọn sản phẩm → giá tự động điền. Với dịch vụ/hư hỏng: nhập tên, đơn giá, số lượng. Tổng tiền = đơn giá × số lượng. Có thể thêm ghi chú giải thích.',
          },
          { 
            title: 'Lưu', 
            description: 'Phụ thu sẽ tự động cộng vào bill khi check-out',
            detailedDescription: 'Phụ thu được lưu ngay và hiển thị trong tab Phụ thu. Khi check-out, tất cả phụ thu sẽ tự động tổng hợp vào bill cuối cùng. Khách có thể yêu cầu xem phụ thu bất kỳ lúc nào.',
          },
        ],
        tips: [
          'Phụ thu từ kiểm tra phòng (đồ mất, hỏng) được tạo tự động — không cần thêm thủ công',
          'Nên ghi nhận phụ thu ngay khi phát sinh để tránh bỏ sót',
        ],
      },
      {
        id: 'extend-booking',
        title: 'Gia hạn booking',
        description: 'Kéo dài thời gian lưu trú cho khách',
        detailedDescription: 'Khi khách muốn ở thêm, bạn gia hạn booking để kéo dài ngày check-out. Hệ thống tự tính thêm chi phí cho số đêm gia hạn. Lưu ý: phòng phải còn trống trong khoảng gia hạn.',
        icon: CalendarClock,
        navigateTo: '/bookings',
        prerequisites: [
          'Booking ở trạng thái "Đang ở"',
          'Phòng phải trống trong khoảng ngày gia hạn (không có booking khác)',
        ],
        steps: [
          { 
            title: 'Tìm booking', 
            description: 'Vào booking của khách cần gia hạn',
            detailedDescription: 'Tìm booking đang ở theo tên khách hoặc số phòng.',
          },
          { 
            title: 'Bấm "Gia hạn"', 
            description: 'Chọn ngày check-out mới',
            detailedDescription: 'Calendar hiển thị các ngày khả dụng (ngày đã có booking khác sẽ bị khóa). Chọn ngày check-out mới, phải sau ngày check-out cũ.',
            warnings: [
              'Nếu phòng đã có booking khác sau đó, không thể gia hạn — cần đổi phòng cho khách',
            ],
          },
          { 
            title: 'Xác nhận giá', 
            description: 'Hệ thống tính thêm chi phí cho số ngày gia hạn',
            detailedDescription: 'Chi phí gia hạn = giá phòng/đêm × số đêm thêm. Giá áp dụng theo giá đang dùng cho booking này. Bạn xem xét và xác nhận.',
          },
          { 
            title: 'Lưu', 
            description: 'Xác nhận gia hạn — booking được cập nhật',
            detailedDescription: 'Ngày check-out mới được cập nhật, chi phí bổ sung ghi nhận. Khách được thông báo (nếu cấu hình email/SMS).',
          },
        ],
      },
    ],
  },
  {
    roleId: 'manager',
    roleLabel: 'Quản lý',
    roleDescription: 'Hướng dẫn quản lý kho, chuẩn phòng, báo cáo và phân quyền nhân sự',
    guides: [
      {
        id: 'inventory-inbound',
        title: 'Nhập kho',
        description: 'Nhập hàng mới vào kho từ nhà cung cấp',
        detailedDescription: 'Nhập kho là thao tác ghi nhận hàng hóa mới vào hệ thống khi nhận từ nhà cung cấp. Mỗi lần nhập tạo 1 phiếu nhập có mã riêng, ghi nhận: sản phẩm gì, số lượng, đơn giá, nhà cung cấp. Tồn kho tự động tăng sau khi phiếu nhập được xác nhận.',
        icon: Warehouse,
        navigateTo: '/inventory/inbound',
        prerequisites: [
          'Sản phẩm cần nhập phải đã tồn tại trong danh mục sản phẩm (nếu chưa có, thêm ở mục Sản phẩm trước)',
        ],
        steps: [
          { 
            title: 'Vào trang Nhập kho', 
            description: 'Chọn "Kho" → "Nhập kho" từ menu',
            detailedDescription: 'Trang Nhập kho hiển thị lịch sử tất cả phiếu nhập: mã phiếu, ngày nhập, nhà cung cấp, tổng giá trị, trạng thái. Bạn có thể xem chi tiết từng phiếu bằng cách bấm vào.',
          },
          { 
            title: 'Bấm "Tạo phiếu nhập"', 
            description: 'Chọn nhà cung cấp (nếu có)',
            detailedDescription: 'Chọn nhà cung cấp từ danh sách đã cấu hình, hoặc để trống nếu nhập nội bộ. Nhà cung cấp giúp theo dõi nguồn gốc hàng hóa và đối soát sau này.',
          },
          { 
            title: 'Thêm sản phẩm', 
            description: 'Chọn sản phẩm, nhập số lượng và đơn giá',
            detailedDescription: 'Tìm sản phẩm bằng tên hoặc mã. Nhập số lượng nhận được và đơn giá mua. Hệ thống tính tổng tiền tự động. Bạn có thể thêm nhiều sản phẩm vào cùng 1 phiếu. Nếu sản phẩm chưa có trong hệ thống, cần thêm ở mục "Sản phẩm" trước.',
          },
          { 
            title: 'Xác nhận', 
            description: 'Kiểm tra lại và bấm "Tạo phiếu nhập"',
            detailedDescription: 'Kiểm tra lại tổng số sản phẩm, số lượng, đơn giá. Sau khi xác nhận: (1) Phiếu nhập được tạo với mã tự sinh, (2) Tồn kho tất cả sản phẩm trong phiếu tăng lên tương ứng, (3) Lịch sử giao dịch kho được ghi nhận.',
            warnings: [
              'Sau khi xác nhận phiếu nhập, tồn kho tăng ngay — hãy kiểm tra kỹ số lượng trước khi xác nhận',
            ],
          },
        ],
        tips: [
          'Số lượng tồn kho sẽ tự động tăng sau khi phiếu nhập được tạo',
          'Có thể nhập nhiều sản phẩm trong cùng 1 phiếu',
          'Ghi nhận đơn giá chính xác để báo cáo chi phí đúng',
        ],
      },
      {
        id: 'inventory-outbound',
        title: 'Xuất kho',
        description: 'Xuất hàng từ kho cho các mục đích khác nhau',
        detailedDescription: 'Xuất kho là thao tác ghi nhận hàng hóa ra khỏi kho. Có nhiều loại xuất kho: xuất sử dụng (cho phòng, cho bộ phận), xuất hỏng (đồ hỏng cần hủy), xuất trả nhà cung cấp, xuất khác. Tồn kho tự động giảm sau khi phiếu xuất được xác nhận.',
        icon: TruckIcon,
        navigateTo: '/inventory/outbound',
        steps: [
          { 
            title: 'Vào trang Xuất kho', 
            description: 'Chọn "Kho" → "Xuất kho"',
            detailedDescription: 'Trang Xuất kho hiển thị lịch sử phiếu xuất. Bạn có thể lọc theo loại xuất, thời gian, và xem chi tiết từng phiếu.',
          },
          { 
            title: 'Chọn loại xuất', 
            description: 'Xuất sử dụng, xuất hỏng, xuất trả nhà cung cấp...',
            detailedDescription: '• Xuất sử dụng: Xuất cho bộ phận sử dụng (nhà bếp, spa...). • Xuất hỏng: Đồ hỏng cần hủy bỏ, ghi nhận nguyên nhân. • Xuất trả NCC: Trả hàng cho nhà cung cấp (lỗi, thừa). • Giao đến phòng: Nên dùng "Phiếu giao hàng" thay vì xuất kho thường để có theo dõi chi tiết hơn.',
            note: 'Để giao đồ đến phòng, nên dùng chức năng "Phiếu giao hàng" thay vì xuất kho — có theo dõi chi tiết hơn từng phòng.',
          },
          { 
            title: 'Thêm sản phẩm', 
            description: 'Chọn sản phẩm và số lượng cần xuất',
            detailedDescription: 'Chọn sản phẩm, nhập số lượng cần xuất. Hệ thống hiển thị tồn kho hiện tại — không thể xuất vượt quá số tồn. Thêm ghi chú lý do xuất nếu cần.',
            warnings: [
              'Không thể xuất nhiều hơn số lượng tồn kho hiện tại',
            ],
          },
          { 
            title: 'Xác nhận', 
            description: 'Tạo phiếu xuất — tồn kho tự động giảm',
            detailedDescription: 'Sau khi xác nhận: (1) Phiếu xuất được tạo, (2) Tồn kho giảm tương ứng, (3) Giao dịch được ghi nhận trong lịch sử kho.',
          },
        ],
        importantNotes: [
          'Phân biệt "Xuất kho" và "Phiếu giao hàng": Xuất kho dùng cho mục đích chung, Phiếu giao hàng dùng khi giao đồ đến từng phòng cụ thể',
        ],
      },
      {
        id: 'stock-audit',
        title: 'Kiểm kê kho',
        description: 'Kiểm tra và đối soát số lượng thực tế với hệ thống',
        detailedDescription: 'Kiểm kê kho là quá trình đếm hàng thực tế và so sánh với số liệu trên hệ thống. Mục đích: phát hiện chênh lệch (thừa/thiếu) do sai sót nhập liệu, mất mát, hoặc các nguyên nhân khác. Nên thực hiện định kỳ (hàng tuần hoặc hàng tháng) để đảm bảo tồn kho chính xác.',
        icon: ClipboardList,
        navigateTo: '/reports/stock-audit',
        steps: [
          { 
            title: 'Vào trang Kiểm kê', 
            description: 'Chọn "Kho" → "Kiểm kê"',
            detailedDescription: 'Trang Kiểm kê hiển thị lịch sử các đợt kiểm kê và kết quả. Bạn có thể xem lại đợt kiểm kê trước để so sánh xu hướng.',
          },
          { 
            title: 'Tạo đợt kiểm kê', 
            description: 'Bấm "Tạo kiểm kê mới"',
            detailedDescription: 'Hệ thống tạo 1 đợt kiểm kê mới với danh sách tất cả sản phẩm trong kho. Số lượng trên hệ thống được hiển thị sẵn, bạn cần nhập số thực tế.',
          },
          { 
            title: 'Nhập số thực tế', 
            description: 'Nhập số lượng đếm được cho từng sản phẩm',
            detailedDescription: 'Đi đến kho thực tế, đếm từng sản phẩm và nhập vào hệ thống. Có thể kiểm kê theo nhóm (ví dụ: chỉ kiểm vải, chỉ kiểm tiêu hao) hoặc kiểm kê toàn bộ. Hệ thống hỗ trợ quét barcode nếu sản phẩm có mã vạch.',
          },
          { 
            title: 'Xem chênh lệch', 
            description: 'Hệ thống tự tính chênh lệch giữa thực tế và sổ sách',
            detailedDescription: 'Hệ thống hiển thị bảng so sánh: sản phẩm, số hệ thống, số thực tế, chênh lệch (+/-). Sản phẩm có chênh lệch lớn được tô đỏ để dễ nhận biết. Cần xem xét nguyên nhân cho mỗi chênh lệch.',
          },
          { 
            title: 'Xác nhận điều chỉnh', 
            description: 'Duyệt và cập nhật tồn kho theo thực tế',
            detailedDescription: 'Sau khi xác nhận, tồn kho trên hệ thống sẽ được cập nhật theo số thực tế. Chênh lệch được ghi nhận trong lịch sử để theo dõi. Đây là hành động quan trọng — nên có sự phê duyệt của quản lý.',
            warnings: [
              'Xác nhận kiểm kê sẽ THAY ĐỔI tồn kho trên hệ thống — không thể hoàn tác tự động',
              'Nên ghi chú nguyên nhân chênh lệch cho từng sản phẩm để đối soát sau',
            ],
          },
        ],
        importantNotes: [
          'Kiểm kê nên thực hiện định kỳ (ít nhất 1 lần/tháng) để phát hiện sớm bất thường',
          'Nên kiểm kê khi không có hoạt động nhập/xuất kho để tránh sai lệch',
        ],
      },
      {
        id: 'room-standards',
        title: 'Thiết lập chuẩn phòng',
        description: 'Cấu hình danh sách đồ dùng tiêu chuẩn cho từng loại phòng',
        detailedDescription: 'Chuẩn phòng định nghĩa danh sách đồ dùng và số lượng tiêu chuẩn cho từng loại phòng (Standard, Deluxe, Suite...). Chuẩn phòng được dùng khi: (1) Kiểm tra phòng check-in/check-out — so sánh thực tế với chuẩn, (2) Tạo phiếu giao hàng — tự động tính số lượng cần giao, (3) Phân bổ đồ dùng — biết phòng cần bao nhiêu đồ.',
        icon: LayoutGrid,
        navigateTo: '/rooms/standards',
        steps: [
          { 
            title: 'Vào cài đặt chuẩn phòng', 
            description: 'Chọn "Phòng" → "Chuẩn phòng"',
            detailedDescription: 'Trang chuẩn phòng hiển thị danh sách loại phòng và số lượng đồ dùng đã cấu hình cho mỗi loại.',
          },
          { 
            title: 'Chọn loại phòng', 
            description: 'Chọn loại phòng cần thiết lập (Standard, Deluxe, Suite...)',
            detailedDescription: 'Mỗi loại phòng có chuẩn riêng. Ví dụ: Standard có 2 khăn tắm, Deluxe có 4 khăn tắm, Suite có 6 khăn tắm. Chọn loại phòng muốn xem hoặc chỉnh sửa.',
          },
          { 
            title: 'Thêm sản phẩm', 
            description: 'Chọn đồ dùng và số lượng tiêu chuẩn cho loại phòng',
            detailedDescription: 'Thêm sản phẩm từ danh mục, nhập số lượng tiêu chuẩn. Ví dụ: Khăn tắm lớn = 2, Khăn mặt = 2, Dầu gội = 1, Nước đóng chai = 2. Phân loại: đồ lâu bền (khăn, ga — dùng nhiều lần) và đồ tiêu hao (nước, snack — dùng 1 lần).',
          },
          { 
            title: 'Lưu', 
            description: 'Chuẩn phòng sẽ được áp dụng khi kiểm tra phòng',
            detailedDescription: 'Sau khi lưu, chuẩn phòng áp dụng cho TẤT CẢ phòng cùng loại. Khi nhân viên kiểm tra phòng, hệ thống sẽ so sánh theo chuẩn mới này.',
          },
        ],
        tips: [
          'Chuẩn phòng dùng để so sánh khi kiểm tra check-in/check-out',
          'Phân biệt đồ tiêu hao (nước, snack) và đồ lâu bền (khăn, ga) — ảnh hưởng cách tính tồn kho',
          'Cập nhật chuẩn phòng khi thay đổi chính sách dịch vụ (ví dụ: tăng số khăn cho Suite)',
        ],
        importantNotes: [
          'Thay đổi chuẩn phòng ảnh hưởng đến TẤT CẢ phòng cùng loại — cân nhắc kỹ trước khi thay đổi',
          'Chuẩn phòng là cơ sở để hệ thống tự động tính số lượng bổ sung — thiết lập chính xác rất quan trọng',
        ],
      },
      {
        id: 'view-reports',
        title: 'Xem báo cáo',
        description: 'Xem các báo cáo tổng hợp về kho, giặt là, tài chính',
        detailedDescription: 'Module báo cáo tổng hợp dữ liệu từ tất cả hoạt động: tồn kho (nhập/xuất/tồn), giặt ủi (số lô, chi phí), bảo trì (số yêu cầu, thời gian xử lý), vận hành (công suất phòng, kiểm tra). Quản lý dùng báo cáo để ra quyết định: mua thêm hàng, đánh giá nhân viên, kiểm soát chi phí.',
        icon: BarChart3,
        navigateTo: '/reports',
        steps: [
          { 
            title: 'Vào trang Báo cáo', 
            description: 'Chọn "Báo cáo" từ menu',
            detailedDescription: 'Trang Báo cáo hiển thị dashboard tổng quan và các loại báo cáo chi tiết. Dữ liệu được tự động cập nhật theo thời gian thực.',
          },
          { 
            title: 'Chọn loại báo cáo', 
            description: 'Kho, Giặt là, Tài chính, Vận hành, Bảo trì...',
            detailedDescription: '• Báo cáo Kho: Tồn kho hiện tại, lịch sử nhập/xuất, sản phẩm dưới mức tối thiểu. • Báo cáo Giặt là: Số lô, chi phí, thời gian trung bình. • Báo cáo Tài chính: Doanh thu, chi phí, lợi nhuận. • Báo cáo Vận hành: Công suất phòng, số lượt check-in/out. • Báo cáo Bảo trì: Số yêu cầu, thời gian xử lý trung bình.',
          },
          { 
            title: 'Chọn khoảng thời gian', 
            description: 'Lọc theo ngày, tuần, tháng',
            detailedDescription: 'Dùng bộ chọn ngày để lọc dữ liệu. Có thể chọn nhanh: Hôm nay, 7 ngày qua, 30 ngày qua, tháng này, quý này. Hoặc chọn khoảng tùy chỉnh.',
          },
          { 
            title: 'Xuất báo cáo', 
            description: 'Bấm "Xuất PDF" hoặc "Xuất Excel" để tải về',
            detailedDescription: 'PDF phù hợp để trình bày, in ấn. Excel phù hợp để phân tích thêm, chia sẻ dữ liệu. File tải về chứa đầy đủ dữ liệu theo bộ lọc đã chọn.',
          },
        ],
      },
      {
        id: 'manage-staff',
        title: 'Quản lý nhân sự',
        description: 'Thêm, sửa, phân quyền cho nhân viên',
        detailedDescription: 'Quản lý nhân sự cho phép bạn tạo tài khoản cho nhân viên, phân vai trò (Quản lý hoặc Nhân viên), và gán khách sạn. Mỗi vai trò có quyền truy cập khác nhau: Quản lý có thể xem tất cả và cấu hình hệ thống, Nhân viên chỉ xem/thao tác trên khách sạn được gán.',
        icon: Users,
        navigateTo: '/settings/users',
        steps: [
          { 
            title: 'Vào Cài đặt → Nhân sự', 
            description: 'Chọn "Cài đặt" → "Quản lý người dùng"',
            detailedDescription: 'Trang quản lý người dùng hiển thị danh sách tất cả nhân viên: tên, email, vai trò, khách sạn được gán, trạng thái hoạt động.',
          },
          { 
            title: 'Thêm nhân viên', 
            description: 'Bấm "Thêm người dùng", nhập email, tên, vai trò',
            detailedDescription: 'Nhập email (dùng để đăng nhập), tên hiển thị, và chọn vai trò. Hệ thống sẽ gửi email mời với link đặt mật khẩu. Nhân viên cần xác nhận email trước khi đăng nhập được.',
            note: 'Email phải là email thật — nhân viên cần xác nhận email để kích hoạt tài khoản.',
          },
          { 
            title: 'Phân quyền', 
            description: 'Chọn vai trò: Quản lý hoặc Nhân viên',
            detailedDescription: '• Quản lý (Manager): Xem tất cả dữ liệu, quản lý kho, quản lý nhân sự, xem báo cáo, cấu hình hệ thống. Có thể tạo Quản lý khác hoặc Nhân viên. • Nhân viên (Staff): Kiểm tra phòng, tạo yêu cầu bổ sung, gửi giặt, báo bảo trì. Chỉ xem dữ liệu của khách sạn được gán.',
          },
          { 
            title: 'Gán khách sạn', 
            description: 'Chọn khách sạn mà nhân viên được quyền truy cập',
            detailedDescription: 'Nhân viên chỉ thấy và thao tác trên dữ liệu của khách sạn được gán. Một nhân viên có thể được gán nhiều khách sạn. Quản lý và Chủ khách sạn tự động có quyền truy cập tất cả.',
          },
        ],
        tips: [
          'Quản lý có thể tạo Quản lý khác hoặc Nhân viên',
          'Nhân viên chỉ xem được dữ liệu của khách sạn được gán',
          'Có thể vô hiệu hóa tài khoản nhân viên thay vì xóa để giữ lịch sử',
        ],
        importantNotes: [
          'Phân quyền ảnh hưởng đến bảo mật dữ liệu — chỉ cấp quyền Quản lý cho người tin tưởng',
          'Nhân viên nghỉ việc nên bị vô hiệu hóa tài khoản ngay để tránh truy cập trái phép',
        ],
      },
      {
        id: 'distribution-order',
        title: 'Tạo phiếu giao hàng',
        description: 'Tạo phiếu giao đồ dùng từ kho đến các phòng',
        detailedDescription: 'Phiếu giao hàng dùng để giao đồ dùng từ kho đến các phòng cụ thể. Khác với "Xuất kho" thông thường, phiếu giao hàng theo dõi chi tiết: giao đến phòng nào, ai giao, đã giao chưa, và kiểm tra khi giao. Phù hợp khi cần phân bổ đồ dùng hàng loạt (ví dụ: bổ sung khăn cho 20 phòng).',
        icon: TruckIcon,
        navigateTo: '/inventory?tab=operations&sub=outbound&view=manual',
        prerequisites: [
          'Đã cấu hình chuẩn phòng (để tự động tính số lượng)',
          'Tồn kho đủ cho số lượng cần giao',
        ],
        steps: [
          { 
            title: 'Vào trang Phiếu giao', 
            description: 'Chọn "Kho" → "Phiếu giao hàng" → "Tạo mới"',
            detailedDescription: 'Trang phiếu giao hiển thị danh sách tất cả phiếu đã tạo với trạng thái. Bấm "Tạo mới" để bắt đầu.',
          },
          { 
            title: 'Chọn phòng', 
            description: 'Chọn các phòng cần giao hàng',
            detailedDescription: 'Chọn phòng bằng cách tick chọn từ danh sách. Có thể lọc theo tầng, trạng thái phòng. Dùng "Chọn tất cả" nếu cần giao cho nhiều phòng cùng lúc.',
          },
          { 
            title: 'Phân bổ sản phẩm', 
            description: 'Chọn sản phẩm và số lượng cho từng phòng',
            detailedDescription: 'Có 2 cách: (1) Thủ công — chọn sản phẩm, nhập số lượng cho từng phòng. (2) Tự động — bấm "Tự động phân bổ" để hệ thống tính số lượng dựa trên chuẩn phòng và tồn kho hiện tại. Cách tự động nhanh hơn và chính xác hơn cho phần lớn trường hợp.',
            note: 'Nút "Tự động phân bổ" tính số lượng cần giao = số chuẩn phòng - số hiện tại trong phòng. Rất tiện cho việc bổ sung hàng loạt.',
          },
          { 
            title: 'Phân công nhân viên', 
            description: 'Chọn nhân viên đi giao',
            detailedDescription: 'Chọn nhân viên phụ trách giao hàng từ danh sách. Nhân viên được chọn sẽ nhận thông báo về phiếu giao hàng và có thể xem chi tiết: phòng nào cần giao, đồ gì, số lượng bao nhiêu.',
          },
          { 
            title: 'Tạo phiếu', 
            description: 'Bấm "Tạo phiếu" — nhân viên sẽ nhận thông báo',
            detailedDescription: 'Sau khi tạo: (1) Phiếu ở trạng thái "Chờ xử lý" (pending), (2) Kho kiểm tra tồn kho và xác nhận, (3) Nhân viên nhận hàng và bắt đầu giao, (4) Mỗi phòng được đánh dấu khi giao xong, (5) Hoàn thành khi tất cả phòng đã giao.',
          },
        ],
        tips: [
          'Dùng nút "Tự động phân bổ" để hệ thống tính số lượng theo chuẩn phòng — nhanh và chính xác',
          'Có thể tạo phiếu từ yêu cầu bổ sung để nhanh hơn',
          'Chia nhỏ phiếu theo tầng/khu vực nếu số phòng nhiều để dễ quản lý',
        ],
        importantNotes: [
          'Luồng trạng thái phiếu: Chờ (pending) → Đã xuất kho (released) → Đang giao (in_progress) → Hoàn thành (completed)',
          'Tồn kho sẽ bị trừ khi phiếu được xác nhận xuất kho, không phải khi tạo phiếu',
        ],
      },
    ],
  },
  {
    roleId: 'owner',
    roleLabel: 'Chủ khách sạn',
    roleDescription: 'Hướng dẫn quản lý tổng quan, subscription, cấu hình hệ thống',
    guides: [
      {
        id: 'dashboard-overview',
        title: 'Xem Dashboard tổng quan',
        description: 'Nắm bắt tình hình hoạt động qua dashboard',
        detailedDescription: 'Dashboard là trang tổng quan hiển thị tình hình hoạt động khách sạn theo thời gian thực. Bao gồm: trạng thái phòng (trống, đang dùng, cần dọn), thống kê hoạt động gần đây (check-in/out, bảo trì, giặt là), và biểu đồ xu hướng. Chủ khách sạn dùng dashboard hàng ngày để nắm bắt tổng quan mà không cần vào từng module.',
        icon: LayoutDashboard,
        navigateTo: '/dashboard',
        steps: [
          { 
            title: 'Mở Dashboard', 
            description: 'Dashboard là trang mặc định khi đăng nhập',
            detailedDescription: 'Sau khi đăng nhập, bạn sẽ thấy Dashboard ngay. Cũng có thể bấm vào logo hoặc menu "Dashboard" ở sidebar để quay lại bất kỳ lúc nào.',
          },
          { 
            title: 'Xem tổng quan', 
            description: 'Xem số phòng trống, đang sử dụng, cần dọn',
            detailedDescription: 'Phần trên cùng hiển thị số phòng theo trạng thái: Trống (xanh), Đang sử dụng (đỏ), Cần dọn (vàng), Đang bảo trì (cam). Số liệu cập nhật theo thời gian thực khi nhân viên thao tác.',
          },
          { 
            title: 'Xem thống kê', 
            description: 'Biểu đồ doanh thu, công suất phòng, hoạt động',
            detailedDescription: 'Biểu đồ công suất phòng cho thấy phần trăm phòng được sử dụng theo thời gian. Hoạt động gần đây liệt kê các sự kiện mới nhất: check-in, check-out, yêu cầu bảo trì, phiếu giao hàng...',
          },
          { 
            title: 'Chuyển khách sạn', 
            description: 'Dùng bộ chọn khách sạn ở header để xem từng KS',
            detailedDescription: 'Nếu bạn quản lý nhiều khách sạn, dùng dropdown ở góc trên bên phải để chuyển giữa các khách sạn. Mỗi khi chuyển, toàn bộ dữ liệu trên trang sẽ cập nhật theo khách sạn được chọn.',
          },
        ],
        tips: [
          'Kiểm tra dashboard mỗi sáng để nắm tình hình: phòng nào trống, phòng nào cần dọn, có yêu cầu bảo trì nào chưa xử lý không',
          'Dashboard cập nhật thời gian thực — không cần refresh trang',
        ],
      },
      {
        id: 'manage-subscription',
        title: 'Quản lý gói dịch vụ',
        description: 'Gia hạn, mua thêm phòng, thanh toán subscription',
        detailedDescription: 'Gói dịch vụ (subscription) quyết định số phòng tối đa bạn có thể quản lý và thời hạn sử dụng. Mô hình tính phí theo phòng: 1.000đ/phòng/ngày. Bạn có thể gia hạn (kéo dài thời hạn) hoặc mua thêm phòng (tăng quota). Thanh toán qua VietQR — tự động xác nhận sau khi chuyển khoản.',
        icon: CreditCardIcon,
        navigateTo: '/settings/subscription',
        steps: [
          { 
            title: 'Vào Cài đặt → Gói dịch vụ', 
            description: 'Chọn "Cài đặt" → "Gói dịch vụ"',
            detailedDescription: 'Trang Gói dịch vụ hiển thị trạng thái hiện tại: số phòng đã đăng ký, ngày hết hạn, số phòng đang dùng, và lịch sử thanh toán.',
          },
          { 
            title: 'Xem gói hiện tại', 
            description: 'Xem số phòng, ngày hết hạn, trạng thái',
            detailedDescription: 'Thông tin gói bao gồm: (1) Số phòng đã đăng ký (quota tối đa), (2) Số phòng đang sử dụng thực tế, (3) Ngày hết hạn subscription, (4) Trạng thái: Active (đang hoạt động), Expiring Soon (sắp hết hạn), Expired (đã hết hạn).',
          },
          { 
            title: 'Gia hạn', 
            description: 'Bấm "Gia hạn", chọn thời hạn (3/6/12 tháng)',
            detailedDescription: 'Chọn thời hạn gia hạn. Giá giảm khi gia hạn dài: 3 tháng giảm 5%, 6 tháng giảm 10%, 1 năm giảm 15%. Gia hạn sẽ cộng thêm ngày vào ngày hết hạn hiện tại (không mất ngày còn lại). Ví dụ: còn 10 ngày + gia hạn 90 ngày = 100 ngày.',
          },
          { 
            title: 'Mua thêm phòng', 
            description: 'Bấm "Thêm phòng", nhập số lượng cần thêm',
            detailedDescription: 'Nhập số phòng muốn thêm. Giá được tính tỷ lệ với số ngày còn lại của subscription. Ví dụ: thêm 5 phòng, còn 60 ngày → 5 × 1.000đ × 60 = 300.000đ. Sau khi thanh toán, quota phòng tăng ngay.',
            note: 'Mua thêm phòng GIỮ NGUYÊN ngày hết hạn, chỉ tăng số phòng được quản lý.',
          },
          { 
            title: 'Thanh toán', 
            description: 'Quét mã QR VietQR để thanh toán',
            detailedDescription: 'Hệ thống tạo mã QR VietQR với nội dung chuyển khoản đã điền sẵn. Bạn dùng app ngân hàng quét mã QR và xác nhận chuyển khoản. Hệ thống tự động xác nhận thanh toán trong 1-5 phút (qua webhook). Không cần gửi ảnh chuyển khoản.',
          },
        ],
        tips: [
          'Gia hạn dài hơn được giảm giá: 3 tháng -5%, 6 tháng -10%, 1 năm -15%',
          'Mua thêm phòng giữ nguyên ngày hết hạn, chỉ tăng số phòng',
          'Thanh toán VietQR được xác nhận tự động — không cần liên hệ hỗ trợ',
        ],
        importantNotes: [
          'Khi subscription hết hạn, hệ thống vẫn hoạt động nhưng không thể tạo dữ liệu mới — gia hạn trước khi hết hạn để tránh gián đoạn',
          'Nội dung chuyển khoản phải đúng với mã trên QR — nếu sai, thanh toán không được tự động xác nhận',
        ],
      },
      {
        id: 'add-hotel',
        title: 'Thêm khách sạn mới',
        description: 'Tạo và cấu hình khách sạn mới trong hệ thống',
        detailedDescription: 'Nếu bạn quản lý nhiều cơ sở, bạn có thể thêm khách sạn mới vào hệ thống. Mỗi khách sạn có dữ liệu riêng biệt: phòng, kho, nhân viên, báo cáo. Nhân viên có thể được gán cho 1 hoặc nhiều khách sạn. Lưu ý: số phòng mới phải nằm trong quota subscription.',
        icon: Building2,
        navigateTo: '/settings/hotels',
        prerequisites: [
          'Gói dịch vụ phải còn đủ quota phòng cho khách sạn mới',
          'Bạn phải có vai trò Chủ khách sạn (Owner)',
        ],
        steps: [
          { 
            title: 'Vào Cài đặt → Khách sạn', 
            description: 'Chọn "Cài đặt" → "Quản lý khách sạn"',
            detailedDescription: 'Trang quản lý khách sạn hiển thị danh sách tất cả khách sạn đã tạo: tên, địa chỉ, số phòng, quản lý phụ trách, trạng thái.',
          },
          { 
            title: 'Bấm "Thêm khách sạn"', 
            description: 'Điền tên, địa chỉ, loại hình',
            detailedDescription: 'Nhập thông tin cơ bản: tên khách sạn, mã (code — dùng nội bộ), địa chỉ, loại hình (khách sạn, homestay, resort...). Mã code phải duy nhất và ngắn gọn (ví dụ: "HN01", "SGN02").',
          },
          { 
            title: 'Cấu hình số tầng và phòng', 
            description: 'Nhập số tầng, tổng số phòng',
            detailedDescription: 'Số tầng giúp hệ thống tổ chức phòng theo tầng. Tổng số phòng là số phòng sẽ tạo. Lưu ý: tổng số phòng ở TẤT CẢ khách sạn không được vượt quá quota subscription.',
            warnings: [
              'Tổng phòng tất cả khách sạn không được vượt quota gói dịch vụ — cần mua thêm phòng nếu không đủ',
            ],
          },
          { 
            title: 'Gán quản lý', 
            description: 'Chọn người quản lý cho khách sạn mới',
            detailedDescription: 'Chọn tài khoản quản lý phụ trách. Quản lý có toàn quyền trên khách sạn được gán: quản lý phòng, kho, nhân sự, báo cáo. Có thể thay đổi sau.',
          },
          { 
            title: 'Lưu', 
            description: 'Khách sạn mới sẽ xuất hiện trong bộ chọn',
            detailedDescription: 'Sau khi lưu, khách sạn mới xuất hiện trong dropdown chọn khách sạn ở header. Bạn có thể bắt đầu thêm phòng, cấu hình chuẩn phòng, và gán nhân viên.',
          },
        ],
        tips: [
          'Số phòng thêm phải nằm trong quota của gói subscription',
          'Mỗi khách sạn có thể có quản lý riêng',
          'Sau khi tạo khách sạn, cần cấu hình chuẩn phòng và thêm phòng',
        ],
      },
      {
        id: 'system-settings',
        title: 'Cài đặt hệ thống',
        description: 'Cấu hình thông tin tổ chức, thông báo, bảo mật',
        detailedDescription: 'Cài đặt hệ thống bao gồm các cấu hình chung cho toàn bộ tổ chức: thông tin công ty, cấu hình thông báo (email, push), quản lý bảo mật (nhật ký hoạt động, phiên đăng nhập), và các tùy chọn nâng cao. Chỉ Chủ khách sạn mới có quyền truy cập đầy đủ các cài đặt này.',
        icon: Settings,
        navigateTo: '/settings',
        steps: [
          { 
            title: 'Vào trang Cài đặt', 
            description: 'Chọn "Cài đặt" từ menu',
            detailedDescription: 'Trang Cài đặt có nhiều mục: Thông tin tổ chức, Người dùng, Khách sạn, Gói dịch vụ, Thông báo, Bảo mật, và các cài đặt nâng cao.',
          },
          { 
            title: 'Thông tin tổ chức', 
            description: 'Cập nhật tên, logo, thông tin liên hệ',
            detailedDescription: 'Thông tin tổ chức hiển thị trên: hóa đơn in cho khách, email gửi cho khách, giao diện đăng nhập nhân viên. Cập nhật tên, logo, SĐT, email, địa chỉ để chuyên nghiệp hơn.',
          },
          { 
            title: 'Cấu hình thông báo', 
            description: 'Bật/tắt email, push notification cho từng sự kiện',
            detailedDescription: 'Cấu hình thông báo cho các sự kiện: Check-in/out, Yêu cầu bảo trì mới, Phiếu giao hàng, Subscription sắp hết hạn... Mỗi sự kiện có thể bật/tắt riêng cho email và push notification. Chọn ai nhận (tất cả quản lý, chỉ quản lý liên quan, hoặc tùy chỉnh).',
          },
          { 
            title: 'Quản lý bảo mật', 
            description: 'Xem nhật ký hoạt động, quản lý phiên đăng nhập',
            detailedDescription: 'Nhật ký hoạt động ghi lại mọi thao tác: ai đăng nhập lúc nào, ai tạo/sửa/xóa dữ liệu gì. Giúp kiểm soát bảo mật và phát hiện bất thường. Có thể xem phiên đăng nhập đang active và đăng xuất từ xa nếu cần.',
          },
        ],
        importantNotes: [
          'Chỉ Chủ khách sạn (Owner) mới thay đổi được cài đặt hệ thống',
          'Thay đổi thông tin tổ chức sẽ ảnh hưởng đến tất cả hóa đơn và email gửi đi',
        ],
      },
      {
        id: 'manage-notifications',
        title: 'Quản lý thông báo',
        description: 'Cấu hình các loại thông báo cho hệ thống',
        detailedDescription: 'Hệ thống hỗ trợ 3 kênh thông báo: Email (gửi đến hộp thư), Push Notification (hiện trên trình duyệt/điện thoại), và In-app (hiện trong ứng dụng). Bạn cấu hình sự kiện nào cần gửi thông báo, qua kênh nào, và gửi cho ai.',
        icon: Bell,
        navigateTo: '/settings/notifications',
        steps: [
          { 
            title: 'Vào Cài đặt → Thông báo', 
            description: 'Chọn "Cài đặt" → "Thông báo"',
            detailedDescription: 'Trang cấu hình thông báo hiển thị bảng: cột trái là danh sách sự kiện, cột phải là các kênh thông báo (email, push, in-app) — bật/tắt bằng toggle.',
          },
          { 
            title: 'Chọn loại thông báo', 
            description: 'Email, Push notification, In-app',
            detailedDescription: '• Email: Phù hợp cho thông báo quan trọng cần lưu lại (subscription hết hạn, báo cáo). • Push: Phù hợp cho thông báo cần phản hồi nhanh (yêu cầu bảo trì khẩn, phiếu giao hàng). • In-app: Thông báo nhẹ nhàng hiển thị khi user đang dùng app.',
          },
          { 
            title: 'Cấu hình sự kiện', 
            description: 'Chọn sự kiện nào cần gửi thông báo',
            detailedDescription: 'Các sự kiện có thể cấu hình: Check-in/out mới, Yêu cầu bảo trì mới, Yêu cầu bổ sung, Phiếu giao hàng được tạo, Lô giặt thay đổi trạng thái, Subscription sắp hết hạn, Thanh toán thành công...',
          },
          { 
            title: 'Lưu cài đặt', 
            description: 'Thông báo sẽ tự động gửi theo cấu hình',
            detailedDescription: 'Sau khi lưu, hệ thống tự gửi thông báo theo cấu hình mỗi khi sự kiện xảy ra. Có thể thay đổi bất kỳ lúc nào.',
          },
        ],
        tips: [
          'Push notification cần được cho phép trên trình duyệt/điện thoại khi được hỏi lần đầu',
          'Nên bật thông báo cho các sự kiện quan trọng: bảo trì khẩn, subscription hết hạn',
        ],
      },
    ],
  },
]
