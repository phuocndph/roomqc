import * as ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { readExcelRows } from '@/lib/excelUtils'

// ============= ITEM IMPORT =============

export interface ItemImportRow {
  sku?: string
  name: string
  category_name?: string
  unit: string
  unit_price: number
  quantity_total: number
  minimum_stock: number
  description?: string
}

export interface CategoryImportRow {
  name: string
  name_en?: string
  code?: string
  description?: string
  icon?: string
  color?: string
  sort_order?: number
}

export interface ImportResult<T> {
  success: boolean
  data: T[]
  errors: { row: number; message: string }[]
  totalRows: number
}

// Download template for Items
export async function downloadItemsTemplate() {
  const workbook = new ExcelJS.Workbook()
  
  // ===== Sheet 1: Tài sản =====
  const ws = workbook.addWorksheet('Tài sản')
  
  const headers = ['Mã SP', 'Tên sản phẩm (*)', 'Danh mục', 'Đơn vị (*)', 'Đơn giá', 'Tồn kho (*)', 'Tồn tối thiểu', 'Tình trạng', 'Ghi chú']
  
  const exampleData: (string | number)[][] = [
    ['DV-001', 'Khăn tắm lớn 70x140cm', 'Đồ vải', 'Cái', 50000, 100, 20, '✓ OK', 'Cotton trắng cao cấp'],
    ['DV-002', 'Khăn tay 40x70cm', 'Đồ vải', 'Cái', 25000, 200, 40, '✓ OK', ''],
    ['DV-003', 'Khăn mặt 30x50cm', 'Đồ vải', 'Cái', 15000, 200, 40, '✓ OK', ''],
    ['DV-004', 'Thảm chân phòng tắm', 'Đồ vải', 'Cái', 35000, 80, 15, '✓ OK', 'Chống trượt'],
    ['DV-005', 'Ga giường đơn', 'Đồ vải', 'Cái', 120000, 60, 10, '✓ OK', '120x200cm'],
    ['DV-006', 'Ga giường đôi', 'Đồ vải', 'Cái', 180000, 100, 20, '✓ OK', '160x200cm'],
    ['DV-007', 'Ga giường King', 'Đồ vải', 'Cái', 220000, 80, 15, '✓ OK', '180x200cm'],
    ['DV-008', 'Vỏ chăn đơn', 'Đồ vải', 'Cái', 200000, 60, 10, '✓ OK', '150x200cm'],
    ['DV-009', 'Vỏ chăn đôi', 'Đồ vải', 'Cái', 280000, 100, 15, '✓ OK', '180x220cm'],
    ['DV-010', 'Vỏ chăn King', 'Đồ vải', 'Cái', 350000, 80, 10, '✓ OK', '200x230cm'],
    ['DV-011', 'Vỏ gối', 'Đồ vải', 'Cái', 30000, 300, 50, '✓ OK', '50x70cm'],
    ['DV-012', 'Gối mềm', 'Đồ vải', 'Cái', 80000, 100, 15, '✓ OK', 'Bông nhân tạo'],
    ['DV-013', 'Gối cứng', 'Đồ vải', 'Cái', 90000, 100, 15, '✓ OK', ''],
    ['DV-014', 'Chăn mỏng', 'Đồ vải', 'Cái', 250000, 50, 10, '✓ OK', 'Lông cừu'],
    ['DV-015', 'Tấm bảo vệ nệm', 'Đồ vải', 'Cái', 150000, 80, 10, '✓ OK', 'Chống thấm'],
    ['DV-016', 'Áo choàng tắm', 'Đồ vải', 'Cái', 150000, 60, 10, '✓ OK', 'Cotton trắng'],
    ['DV-017', 'Tấm trải trang trí giường', 'Đồ vải', 'Cái', 80000, 50, 10, '✓ OK', 'Bed runner'],
    ['DV-018', 'Khăn trải bàn nhà hàng', 'Đồ vải', 'Cái', 100000, 40, 8, '✓ OK', ''],
    ['DV-019', 'Khăn ăn vải', 'Đồ vải', 'Cái', 20000, 100, 20, '✓ OK', 'Nhà hàng'],
    ['DV-020', 'Rèm cản sáng', 'Đồ vải', 'Cái', 500000, 30, 5, '✓ OK', 'Blackout'],
    ['DV-021', 'Rèm voan', 'Đồ vải', 'Cái', 200000, 30, 5, '✓ OK', 'Trang trí'],
    ['TH-001', 'Bàn chải đánh răng', 'Tiêu hao', 'Cái', 5000, 500, 100, '✓ OK', 'Dùng 1 lần'],
    ['TH-002', 'Kem đánh răng mini', 'Tiêu hao', 'Tuýp', 3000, 500, 100, '✓ OK', '10g'],
    ['TH-003', 'Dầu gội đầu', 'Tiêu hao', 'Chai', 8000, 500, 100, '✓ OK', '30ml'],
    ['TH-004', 'Dầu xả', 'Tiêu hao', 'Chai', 8000, 500, 100, '✓ OK', '30ml'],
    ['TH-005', 'Sữa tắm', 'Tiêu hao', 'Chai', 8000, 500, 100, '✓ OK', '30ml'],
    ['TH-006', 'Kem dưỡng thể', 'Tiêu hao', 'Chai', 8000, 300, 60, '✓ OK', '30ml'],
    ['TH-007', 'Xà phòng cục', 'Tiêu hao', 'Cái', 4000, 500, 100, '✓ OK', '20g'],
    ['TH-008', 'Mũ tắm', 'Tiêu hao', 'Cái', 2000, 500, 100, '✓ OK', 'Dùng 1 lần'],
    ['TH-009', 'Bộ dao cạo râu', 'Tiêu hao', 'Bộ', 5000, 300, 50, '✓ OK', 'Dùng 1 lần'],
    ['TH-010', 'Lược', 'Tiêu hao', 'Cái', 2000, 500, 100, '✓ OK', 'Dùng 1 lần'],
    ['TH-011', 'Bộ bông tẩy trang', 'Tiêu hao', 'Bộ', 3000, 300, 50, '✓ OK', 'Bông + tăm bông'],
    ['TH-012', 'Bộ kim chỉ', 'Tiêu hao', 'Bộ', 5000, 200, 30, '✓ OK', ''],
    ['TH-013', 'Bộ đánh giày', 'Tiêu hao', 'Bộ', 5000, 200, 30, '✓ OK', ''],
    ['TH-014', 'Túi giặt đồ', 'Tiêu hao', 'Cái', 3000, 300, 50, '✓ OK', ''],
    ['TH-015', 'Túi vệ sinh', 'Tiêu hao', 'Cái', 1000, 500, 100, '✓ OK', 'Sanitary bag'],
    ['TH-016', 'Dép phòng', 'Tiêu hao', 'Đôi', 10000, 500, 100, '✓ OK', 'Dùng 1 lần'],
    ['TH-017', 'Hộp giấy ăn', 'Tiêu hao', 'Hộp', 10000, 300, 50, '✓ OK', ''],
    ['TH-018', 'Giấy vệ sinh', 'Tiêu hao', 'Cuộn', 5000, 500, 100, '✓ OK', ''],
    ['TH-019', 'Khăn ướt', 'Tiêu hao', 'Gói', 3000, 300, 50, '✓ OK', 'Gói nhỏ'],
    ['TH-020', 'Găng tay cao su', 'Tiêu hao', 'Đôi', 10000, 100, 20, '✓ OK', 'Housekeeping'],
    ['TH-021', 'Bàn chải cọ rửa', 'Tiêu hao', 'Cái', 15000, 30, 5, '✓ OK', ''],
    ['TH-022', 'Nước khoáng 500ml', 'Tiêu hao', 'Chai', 5000, 500, 100, '✓ OK', 'Phòng khách'],
    ['TH-023', 'Trà xanh túi lọc', 'Tiêu hao', 'Gói', 2000, 500, 100, '✓ OK', ''],
    ['TH-024', 'Trà đen túi lọc', 'Tiêu hao', 'Gói', 2000, 500, 100, '✓ OK', ''],
    ['TH-025', 'Cà phê hòa tan', 'Tiêu hao', 'Gói', 3000, 500, 100, '✓ OK', ''],
    ['TH-026', 'Đường gói', 'Tiêu hao', 'Gói', 500, 500, 100, '✓ OK', '5g'],
    ['TH-027', 'Bột kem pha', 'Tiêu hao', 'Gói', 1000, 500, 100, '✓ OK', 'Creamer 5g'],
    ['TH-028', 'Bút bi có logo', 'Tiêu hao', 'Cái', 3000, 200, 30, '✓ OK', ''],
    ['TH-029', 'Sổ ghi chú có logo', 'Tiêu hao', 'Cuốn', 5000, 200, 30, '✓ OK', ''],
    ['TH-030', 'Thẻ từ mở cửa', 'Tiêu hao', 'Cái', 8000, 200, 30, '✓ OK', 'Key card'],
    ['TH-031', 'Thẻ Do Not Disturb', 'Tiêu hao', 'Cái', 2000, 100, 20, '✓ OK', ''],
    ['TH-032', 'Phong bì có logo', 'Tiêu hao', 'Cái', 1500, 200, 30, '✓ OK', ''],
    ['TH-033', 'Phiếu đánh giá khách', 'Tiêu hao', 'Cái', 2000, 200, 30, '✓ OK', ''],
    ['TH-034', 'Nước lau sàn', 'Tiêu hao', 'Lít', 30000, 50, 10, '✓ OK', ''],
    ['TH-035', 'Nước lau kính', 'Tiêu hao', 'Lít', 25000, 30, 5, '✓ OK', ''],
    ['TH-036', 'Nước tẩy bồn cầu', 'Tiêu hao', 'Lít', 25000, 50, 10, '✓ OK', ''],
    ['TH-037', 'Dung dịch khử trùng', 'Tiêu hao', 'Lít', 40000, 30, 5, '✓ OK', ''],
    ['TH-038', 'Nước giặt công nghiệp', 'Tiêu hao', 'Kg', 50000, 50, 10, '✓ OK', ''],
    ['TH-039', 'Nước rửa tay sát khuẩn', 'Tiêu hao', 'Lít', 60000, 30, 5, '✓ OK', ''],
    ['TH-040', 'Xịt phòng thơm', 'Tiêu hao', 'Chai', 50000, 30, 5, '✓ OK', ''],
    ['TH-041', 'Túi rác nhỏ', 'Tiêu hao', 'Cái', 1000, 500, 100, '✓ OK', 'Phòng khách'],
    ['TH-042', 'Túi rác lớn', 'Tiêu hao', 'Cái', 2000, 300, 50, '✓ OK', 'Khu vực công cộng'],
    ['TB-001', 'Ấm siêu tốc 1.8L', 'Thiết bị', 'Cái', 350000, 50, 5, '✓ OK', ''],
    ['TB-002', 'Máy sấy tóc', 'Thiết bị', 'Cái', 250000, 50, 5, '✓ OK', '1600W'],
    ['TB-003', 'Bàn ủi hơi nước', 'Thiết bị', 'Cái', 300000, 20, 3, '✓ OK', ''],
    ['TB-004', 'Cầu là gấp gọn', 'Thiết bị', 'Cái', 350000, 20, 3, '✓ OK', ''],
    ['TB-005', 'Két sắt điện tử', 'Thiết bị', 'Cái', 1200000, 50, 3, '✓ OK', ''],
    ['TB-006', 'Tủ lạnh mini 50L', 'Thiết bị', 'Cái', 3500000, 50, 3, '✓ OK', ''],
    ['TB-007', 'TV 43 inch', 'Thiết bị', 'Cái', 5000000, 50, 3, '✓ OK', 'Smart TV'],
    ['TB-008', 'Điều hòa', 'Thiết bị', 'Cái', 8000000, 50, 2, '✓ OK', '9000-12000 BTU'],
    ['TB-009', 'Điện thoại bàn phòng', 'Thiết bị', 'Cái', 500000, 50, 3, '✓ OK', ''],
    ['TB-010', 'Đèn bàn làm việc', 'Thiết bị', 'Cái', 200000, 50, 5, '✓ OK', 'LED'],
    ['TB-011', 'Đèn ngủ đầu giường', 'Thiết bị', 'Cái', 180000, 100, 5, '✓ OK', ''],
    ['TB-012', 'Đèn trần phòng', 'Thiết bị', 'Cái', 300000, 60, 5, '✓ OK', ''],
    ['TB-013', 'Đèn phòng tắm', 'Thiết bị', 'Cái', 150000, 50, 5, '✓ OK', 'Chống nước'],
    ['TB-014', 'Ổ cắm kéo dài', 'Thiết bị', 'Cái', 100000, 50, 5, '✓ OK', ''],
    ['TB-015', 'Remote TV', 'Thiết bị', 'Cái', 50000, 50, 5, '✓ OK', ''],
    ['TB-016', 'Remote điều hòa', 'Thiết bị', 'Cái', 80000, 50, 5, '✓ OK', ''],
    ['TB-017', 'Đầu báo khói', 'Thiết bị', 'Cái', 150000, 60, 5, '✓ OK', 'PCCC'],
    ['TB-018', 'Khóa cửa điện tử', 'Thiết bị', 'Cái', 2500000, 50, 2, '✓ OK', 'Thẻ từ'],
    ['TB-019', 'Bình nóng lạnh 30L', 'Thiết bị', 'Cái', 2000000, 50, 2, '✓ OK', ''],
    ['TB-020', 'Quạt hút phòng tắm', 'Thiết bị', 'Cái', 200000, 50, 3, '✓ OK', ''],
    ['TB-021', 'Bộ phát Wi-Fi', 'Thiết bị', 'Cái', 800000, 20, 2, '✓ OK', 'Theo tầng/khu vực'],
    ['TB-022', 'Máy hút bụi công nghiệp', 'Thiết bị', 'Cái', 5000000, 5, 1, '✓ OK', 'Housekeeping'],
    ['TB-023', 'Bộ cây lau nhà', 'Thiết bị', 'Bộ', 200000, 20, 3, '✓ OK', ''],
    ['TB-024', 'Xe đẩy dọn phòng', 'Thiết bị', 'Cái', 3000000, 5, 1, '✓ OK', '3 tầng'],
    ['TB-025', 'Xe đẩy đồ giặt', 'Thiết bị', 'Cái', 2000000, 3, 1, '✓ OK', ''],
    ['TB-026', 'Bình xịt vệ sinh', 'Thiết bị', 'Cái', 20000, 20, 5, '✓ OK', 'Cầm tay'],
    ['TB-027', 'Xô lau nhà có vắt', 'Thiết bị', 'Cái', 50000, 10, 2, '✓ OK', ''],
    ['TB-028', 'Bộ chổi + hót rác', 'Thiết bị', 'Bộ', 50000, 10, 2, '✓ OK', ''],
    ['NT-001', 'Khung giường đơn', 'Nội thất', 'Cái', 3000000, 20, 2, '✓ OK', '120x200cm'],
    ['NT-002', 'Khung giường đôi', 'Nội thất', 'Cái', 5000000, 40, 2, '✓ OK', '160x200cm'],
    ['NT-003', 'Khung giường King', 'Nội thất', 'Cái', 6000000, 30, 2, '✓ OK', '180x200cm'],
    ['NT-004', 'Nệm giường đơn', 'Nội thất', 'Cái', 2500000, 20, 2, '✓ OK', ''],
    ['NT-005', 'Nệm giường đôi', 'Nội thất', 'Cái', 4000000, 40, 2, '✓ OK', ''],
    ['NT-006', 'Nệm giường King', 'Nội thất', 'Cái', 5000000, 30, 2, '✓ OK', ''],
    ['NT-007', 'Tủ quần áo', 'Nội thất', 'Cái', 3000000, 50, 2, '✓ OK', ''],
    ['NT-008', 'Bàn làm việc', 'Nội thất', 'Cái', 1500000, 50, 2, '✓ OK', ''],
    ['NT-009', 'Ghế bàn làm việc', 'Nội thất', 'Cái', 800000, 50, 3, '✓ OK', ''],
    ['NT-010', 'Sofa đơn', 'Nội thất', 'Cái', 2000000, 30, 2, '✓ OK', ''],
    ['NT-011', 'Bàn trà', 'Nội thất', 'Cái', 800000, 30, 2, '✓ OK', ''],
    ['NT-012', 'Tủ đầu giường', 'Nội thất', 'Cái', 600000, 100, 3, '✓ OK', ''],
    ['NT-013', 'Kệ để vali', 'Nội thất', 'Cái', 500000, 50, 3, '✓ OK', 'Luggage rack'],
    ['NT-014', 'Gương soi toàn thân', 'Nội thất', 'Cái', 400000, 50, 3, '✓ OK', ''],
    ['NT-015', 'Gương phòng tắm', 'Nội thất', 'Cái', 300000, 50, 3, '✓ OK', 'Có đèn LED'],
    ['NT-016', 'Móc treo quần áo', 'Nội thất', 'Cái', 15000, 300, 30, '✓ OK', 'Gỗ'],
    ['NT-017', 'Thùng rác phòng ngủ', 'Nội thất', 'Cái', 100000, 60, 5, '✓ OK', ''],
    ['NT-018', 'Thùng rác phòng tắm', 'Nội thất', 'Cái', 80000, 60, 5, '✓ OK', 'Có nắp đạp'],
    ['NT-019', 'Tủ minibar', 'Nội thất', 'Cái', 1000000, 50, 2, '✓ OK', ''],
    ['NT-020', 'Giá treo/kệ TV', 'Nội thất', 'Cái', 300000, 50, 3, '✓ OK', ''],
    ['NT-021', 'Đĩa đựng xà phòng', 'Nội thất', 'Cái', 50000, 60, 5, '✓ OK', 'Sứ/inox'],
    ['NT-022', 'Thanh treo khăn', 'Nội thất', 'Cái', 100000, 60, 5, '✓ OK', 'Inox'],
    ['NT-023', 'Cọ bồn cầu có hộp', 'Nội thất', 'Cái', 50000, 60, 5, '✓ OK', ''],
    ['NT-024', 'Vòi sen', 'Nội thất', 'Cái', 200000, 50, 5, '✓ OK', ''],
    ['NT-025', 'Khay đựng amenities', 'Nội thất', 'Cái', 30000, 60, 5, '✓ OK', 'Phòng tắm'],
    ['NT-026', 'Hộp đựng giấy ăn', 'Nội thất', 'Cái', 50000, 60, 5, '✓ OK', ''],
    ['NT-027', 'Cây xỏ giày', 'Nội thất', 'Cái', 15000, 50, 5, '✓ OK', ''],
    ['NT-028', 'Ô dù cho khách mượn', 'Nội thất', 'Cái', 60000, 30, 5, '✓ OK', ''],
    ['NT-029', 'Xô đá phòng', 'Nội thất', 'Cái', 50000, 50, 5, '✓ OK', ''],
    ['NT-030', 'Ly thuỷ tinh phòng', 'Nội thất', 'Cái', 10000, 100, 15, '✓ OK', ''],
    ['NT-031', 'Cốc sứ pha trà phòng', 'Nội thất', 'Cái', 20000, 100, 15, '✓ OK', ''],
    ['NH-001', 'Đĩa ăn chính 26cm', 'Nhà hàng', 'Cái', 40000, 100, 15, '✓ OK', 'Sứ trắng'],
    ['NH-002', 'Đĩa salad 20cm', 'Nhà hàng', 'Cái', 25000, 80, 10, '✓ OK', 'Sứ trắng'],
    ['NH-003', 'Bát súp', 'Nhà hàng', 'Cái', 20000, 80, 10, '✓ OK', 'Sứ trắng'],
    ['NH-004', 'Bát cơm', 'Nhà hàng', 'Cái', 15000, 100, 15, '✓ OK', 'Sứ trắng'],
    ['NH-005', 'Bộ tách trà', 'Nhà hàng', 'Bộ', 30000, 60, 10, '✓ OK', 'Tách + đĩa lót'],
    ['NH-006', 'Bộ tách cà phê', 'Nhà hàng', 'Bộ', 35000, 60, 10, '✓ OK', 'Tách + đĩa lót'],
    ['NH-007', 'Ly nước 300ml', 'Nhà hàng', 'Cái', 15000, 100, 15, '✓ OK', 'Thuỷ tinh'],
    ['NH-008', 'Ly rượu vang', 'Nhà hàng', 'Cái', 30000, 60, 10, '✓ OK', 'Thuỷ tinh'],
    ['NH-009', 'Ly bia 400ml', 'Nhà hàng', 'Cái', 20000, 60, 10, '✓ OK', 'Thuỷ tinh'],
    ['NH-010', 'Ly nước ép 250ml', 'Nhà hàng', 'Cái', 15000, 80, 10, '✓ OK', 'Thuỷ tinh'],
    ['NH-011', 'Dao ăn chính', 'Nhà hàng', 'Cái', 20000, 100, 15, '✓ OK', 'Inox'],
    ['NH-012', 'Nĩa ăn chính', 'Nhà hàng', 'Cái', 15000, 100, 15, '✓ OK', 'Inox'],
    ['NH-013', 'Muỗng súp', 'Nhà hàng', 'Cái', 12000, 100, 15, '✓ OK', 'Inox'],
    ['NH-014', 'Muỗng trà', 'Nhà hàng', 'Cái', 8000, 100, 15, '✓ OK', 'Inox'],
    ['NH-015', 'Đũa', 'Nhà hàng', 'Đôi', 5000, 100, 15, '✓ OK', 'Gỗ/inox'],
    ['NH-016', 'Khay phục vụ tròn', 'Nhà hàng', 'Cái', 80000, 30, 5, '✓ OK', 'Chống trượt'],
    ['NH-017', 'Nồi hâm buffet', 'Nhà hàng', 'Cái', 500000, 10, 2, '✓ OK', 'Chafing dish inox'],
    ['NH-018', 'Xô đá nhà hàng', 'Nhà hàng', 'Cái', 80000, 20, 3, '✓ OK', 'Inox'],
    ['NH-019', 'Bộ lọ tiêu muối', 'Nhà hàng', 'Bộ', 30000, 30, 5, '✓ OK', ''],
    ['NH-020', 'Bìa menu', 'Nhà hàng', 'Cái', 50000, 20, 3, '✓ OK', 'Da/gỗ'],
    ['NH-021', 'Khay đựng hóa đơn', 'Nhà hàng', 'Cái', 30000, 20, 3, '✓ OK', ''],
    ['NH-022', 'Đồ mở nắp chai', 'Nhà hàng', 'Cái', 20000, 10, 2, '✓ OK', ''],
    ['DP-001', 'Đồng phục lễ tân', 'Đồng phục', 'Bộ', 500000, 10, 2, '✓ OK', ''],
    ['DP-002', 'Đồng phục housekeeping', 'Đồng phục', 'Bộ', 300000, 15, 2, '✓ OK', ''],
    ['DP-003', 'Đồng phục phục vụ', 'Đồng phục', 'Bộ', 400000, 15, 2, '✓ OK', 'Nhà hàng'],
    ['DP-004', 'Đồng phục bếp', 'Đồng phục', 'Bộ', 350000, 10, 2, '✓ OK', 'Áo + tạp dề'],
    ['DP-005', 'Đồng phục bảo vệ', 'Đồng phục', 'Bộ', 400000, 5, 1, '✓ OK', ''],
    ['DP-006', 'Thẻ tên nhân viên', 'Đồng phục', 'Cái', 20000, 30, 5, '✓ OK', ''],
  ]
  
  // Column widths
  ws.columns = [
    { width: 12 }, { width: 30 }, { width: 15 }, { width: 10 },
    { width: 12 }, { width: 12 }, { width: 15 }, { width: 12 }, { width: 25 },
  ]
  
  // Styles
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, bottom: { style: 'thin' },
    left: { style: 'thin' }, right: { style: 'thin' },
  }
  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
  const headerFont: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  const dataFont: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11 }
  const altFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } }
  const greenFont: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11, color: { argb: 'FF228B22' } }
  
  // Header row
  const headerRow = ws.addRow(headers)
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.fill = headerFill
    cell.font = headerFont
    cell.border = thinBorder
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  
  // Data rows
  exampleData.forEach((rowData, idx) => {
    const row = ws.addRow(rowData)
    row.eachCell((cell, colNumber) => {
      cell.font = colNumber === 8 ? greenFont : dataFont
      cell.border = thinBorder
      cell.alignment = { vertical: 'middle' }
      if (idx % 2 === 1) cell.fill = altFill
      // Number format for price/stock columns
      if (colNumber === 5) cell.numFmt = '#,##0'
      if (colNumber === 6 || colNumber === 7) cell.numFmt = '#,##0'
      // Center align: Mã SP, Đơn vị, Tồn kho, Tồn tối thiểu, Tình trạng
      if ([1, 4, 6, 7, 8].includes(colNumber)) cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
  })
  
  // ===== Sheet 2: Tổng hợp =====
  const wsSummary = workbook.addWorksheet('Tổng hợp')
  wsSummary.columns = [{ width: 20 }, { width: 15 }, { width: 25 }, { width: 22 }]
  
  // Title
  const titleRow = wsSummary.addRow(['TỔNG HỢP HÀNG HÓA THEO DANH MỤC'])
  wsSummary.mergeCells('A1:D1')
  titleRow.getCell(1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF4472C4' } }
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  titleRow.height = 30
  
  wsSummary.addRow([]) // empty row
  
  // Summary header
  const sumHeaders = ['Danh mục', 'Số mặt hàng', 'Tổng giá trị tồn kho', 'Số mặt hàng cần đặt']
  const sumHeaderRow = wsSummary.addRow(sumHeaders)
  sumHeaderRow.eachCell((cell) => {
    cell.fill = headerFill
    cell.font = headerFont
    cell.border = thinBorder
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  
  const summaryRows: (string | number)[][] = [
    ['Đồ vải', 21, 217100000, 0],
    ['Tiêu hao', 42, 63500000, 0],
    ['Thiết bị', 28, 1329400000, 0],
    ['Nội thất', 31, 1384150000, 0],
    ['Nhà hàng', 22, 36400000, 0],
    ['Đồng phục', 6, 21600000, 0],
  ]
  
  summaryRows.forEach((r, idx) => {
    const row = wsSummary.addRow(r)
    row.eachCell((cell, colNumber) => {
      cell.font = dataFont
      cell.border = thinBorder
      cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'center' }
      if (colNumber === 3) cell.numFmt = '#,##0'
      if (idx % 2 === 1) cell.fill = altFill
    })
  })
  
  // Total row
  const totalRow = wsSummary.addRow(['TỔNG CỘNG', 150, 3052150000, 0])
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Calibri', size: 11, bold: true }
    cell.border = thinBorder
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
    cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'center' }
    if (colNumber === 3) cell.numFmt = '#,##0'
  })
  
  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  saveAs(blob, `template-tai-san-${Date.now()}.xlsx`)
}

// Download template for Categories
export async function downloadCategoriesTemplate() {
  const headers = [
    'Tên danh mục (*)',
    'Tên tiếng Anh',
    'Mã',
    'Mô tả',
    'Icon',
    'Màu (hex)',
    'Thứ tự'
  ]
  
  const exampleData = [
    ['Đồ vải', 'Linen', 'LINEN', 'Khăn, ga, gối', '🧺', '#3B82F6', 1],
    ['Tiêu hao', 'Consumable', 'CONSUMABLE', 'Đồ dùng 1 lần', '🧴', '#10B981', 2],
    ['Thiết bị', 'Equipment', 'EQUIPMENT', 'Thiết bị điện tử', '⚡', '#F59E0B', 3],
    ['Nội thất', 'Furniture', 'FURNITURE', 'Bàn ghế, tủ', '🪑', '#8B5CF6', 4],
  ]
  
  const instructions = [
    ['HƯỚNG DẪN IMPORT DANH MỤC'],
    [''],
    ['1. Cột có dấu (*) là bắt buộc'],
    ['2. Tên danh mục: Tối thiểu 2 ký tự'],
    ['3. Mã: Viết hoa, không dấu, VD: LINEN, EQUIPMENT'],
    ['4. Icon: Emoji hoặc tên icon (VD: 📦, Package)'],
    ['5. Màu: Mã hex, VD: #3B82F6'],
    ['6. Xóa các dòng ví dụ trước khi import'],
  ]
  
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Danh mục')
  ;[headers, ...exampleData].forEach((row) => ws.addRow(row))
  ws.columns = [20, 15, 12, 25, 8, 12, 10].map((width) => ({ width }))

  const wsInstructions = workbook.addWorksheet('Hướng dẫn')
  instructions.forEach((row) => wsInstructions.addRow(row))
  wsInstructions.getColumn(1).width = 50

  const buffer = await workbook.xlsx.writeBuffer()
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `template-danh-muc-${Date.now()}.xlsx`,
  )
}

// Parse Items from Excel file
export async function parseItemsExcel(file: File): Promise<ImportResult<ItemImportRow>> {
  try {
    const jsonData = await readExcelRows(file)
    const rows = jsonData.slice(1).filter((row) => row.some((cell) => cell !== undefined && cell !== ''))
    const items: ItemImportRow[] = []
    const errors: { row: number; message: string }[] = []

    rows.forEach((row, index) => {
      const rowNum = index + 2
      const name = String(row[1] || '').trim()
      const unit = String(row[3] || '').trim()

      if (!name || name.length < 2) {
        errors.push({ row: rowNum, message: 'Tên sản phẩm bắt buộc (tối thiểu 2 ký tự)' })
        return
      }
      if (!unit) {
        errors.push({ row: rowNum, message: 'Đơn vị bắt buộc' })
        return
      }

      items.push({
        sku: row[0] ? String(row[0]).trim() : undefined,
        name,
        category_name: row[2] ? String(row[2]).trim() : undefined,
        unit,
        unit_price: Number(row[4]) || 0,
        quantity_total: Number(row[5]) || 0,
        minimum_stock: Number(row[6]) || 0,
        description: row[8] ? String(row[8]).trim() : undefined,
      })
    })

    return { success: errors.length === 0, data: items, errors, totalRows: rows.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể đọc file'
    return { success: false, data: [], errors: [{ row: 0, message: `Lỗi đọc file: ${message}` }], totalRows: 0 }
  }
}

// Parse Categories from Excel file
export async function parseCategoriesExcel(file: File): Promise<ImportResult<CategoryImportRow>> {
  try {
    const jsonData = await readExcelRows(file)
    const rows = jsonData.slice(1).filter((row) => row.some((cell) => cell !== undefined && cell !== ''))
    const categories: CategoryImportRow[] = []
    const errors: { row: number; message: string }[] = []

    rows.forEach((row, index) => {
      const rowNum = index + 2
      const name = String(row[0] || '').trim()

      if (!name || name.length < 2) {
        errors.push({ row: rowNum, message: 'Tên danh mục bắt buộc (tối thiểu 2 ký tự)' })
        return
      }

      categories.push({
        name,
        name_en: row[1] ? String(row[1]).trim() : undefined,
        code: row[2] ? String(row[2]).trim().toUpperCase() : undefined,
        description: row[3] ? String(row[3]).trim() : undefined,
        icon: row[4] ? String(row[4]).trim() : '📦',
        color: row[5] ? String(row[5]).trim() : '#6B7280',
        sort_order: row[6] ? Number(row[6]) : undefined,
      })
    })

    return { success: errors.length === 0, data: categories, errors, totalRows: rows.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể đọc file'
    return { success: false, data: [], errors: [{ row: 0, message: `Lỗi đọc file: ${message}` }], totalRows: 0 }
  }
}
