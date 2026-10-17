import * as ExcelJS from 'exceljs'

export interface RoomTemplateHotel {
  name: string
  code?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
}

export interface ImportedRoom {
  room_number: string
  floor: number
  room_type: string
  source_row: number
  status?: string
  bed_type?: string
  max_guests?: number
  area_sqm?: number
  base_price?: number
  amenities?: string[]
  has_balcony?: boolean
  has_window?: boolean
  smoking_allowed?: boolean
  view_type?: string
  notes?: string
}

export const ROOM_IMPORT_HEADERS = [
  'Số phòng*', 'Tầng*', 'Hạng phòng*', 'Số khách tối đa', 'Loại giường',
  'Diện tích (m²)', 'Ghi chú', 'Giá cơ bản/đêm (đ)', 'Tiện nghi (cách nhau bằng dấu ;)',
  'Ban công', 'Cửa sổ', 'Cho phép hút thuốc', 'Hướng nhìn', 'Trạng thái',
] as const

const types = { 'Tiêu chuẩn': 'standard', 'Cao cấp': 'deluxe', Suite: 'suite', VIP: 'vip' }
const beds = { 'Giường đơn': 'single', 'Giường đôi': 'double', Queen: 'queen', King: 'king', 'Hai giường đơn': 'twin' }
const views = { 'Thành phố': 'city', 'Biển': 'sea', 'Núi': 'mountain', 'Vườn': 'garden', 'Hồ bơi': 'pool' }
const statuses = { 'Trống đã dọn': 'vacant_clean', 'Trống chưa dọn': 'vacant_dirty', 'Phòng hỏng': 'out_of_order', 'Tạm ngừng': 'out_of_service' }
const navy = '17365D'
const ink = '172B4D'
const key = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\*/g, '').replace(/\s+/g, ' ')

function heading(sheet: ExcelJS.Worksheet, row: number, text: string, size = 11, height = 24, lastColumn = 'N') {
  sheet.mergeCells(`A${row}:${lastColumn}${row}`)
  const cell = sheet.getCell(row, 1)
  cell.value = text
  cell.font = { name: 'Arial', size, color: { argb: ink }, bold: size > 11 }
  cell.alignment = { vertical: 'middle', wrapText: true }
  sheet.getRow(row).height = height
}

export const ROOM_TEMPLATE_HEADER_ROW = 5
export const ROOM_TEMPLATE_FIRST_ROW = 6
const lastTemplateRow = 205

function tableHeader(sheet: ExcelJS.Worksheet, row: number, headers: readonly string[]) {
  const groupColors = ['17365D', '17365D', '17365D', '334155', '334155', '334155', '334155', '166534', '0F766E', '0F766E', '0F766E', '0F766E', '0F766E', '374151']
  sheet.getRow(row).values = [...headers]
  sheet.getRow(row).height = 32
  sheet.getRow(row).eachCell((cell, column) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${groupColors[column - 1] ?? '374151'}` } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { right: { style: 'thin', color: { argb: 'FFFFFFFF' } } }
  })
}

/** Browser-side generator: keep the actual downloaded XLSX and importer in one contract. */
export function createRoomImportWorkbook(hotel: RoomTemplateHotel, createdAt = new Date()) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'RoomQC'
  workbook.subject = `Danh sách phòng - ${hotel.name}`
  workbook.title = `Mẫu nhập phòng - ${hotel.name}`
  workbook.created = createdAt
  const sheet = workbook.addWorksheet('Danh sách phòng', { properties: { tabColor: { argb: navy } } })
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 5, topLeftCell: 'D6', activeCell: 'D6', showGridLines: false }]
  const widths = [16, 9, 20, 17, 22, 16, 30, 22, 38, 13, 13, 20, 18, 22]
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })
  heading(sheet, 1, hotel.name, 14, hotel.name.length > 65 ? 44 : 26)
  heading(sheet, 2, ['Mẫu nhập phòng', hotel.code, hotel.phone && `ĐT: ${hotel.phone}`].filter(Boolean).join(' — '), 11, 20)
  const contact = [hotel.address && `Địa chỉ: ${hotel.address}`, hotel.phone && `Điện thoại: ${hotel.phone}`, hotel.email && `Email: ${hotel.email}`].filter(Boolean).join('   |   ')
  heading(sheet, 3, '1. Điền phòng từ dòng 6.   2. Lưu file .xlsx.   3. Tải lên RoomQC để kiểm tra và nhập.', 11, 22)
  heading(sheet, 4, 'Điền đủ thông tin cần dùng từ cột A đến N. Chỉ 3 cột có * bắt buộc. Cuộn ngang để xem giá, tiện nghi và vận hành. Xem Hướng dẫn.', 11, 32)
  sheet.getCell('A4').value = { text: sheet.getCell('A4').text, hyperlink: "#'Hướng dẫn'!A1" }
  sheet.getCell('A4').font = { name: 'Arial', size: 11, color: { argb: 'FF1D4ED8' }, underline: true }
  tableHeader(sheet, ROOM_TEMPLATE_HEADER_ROW, ROOM_IMPORT_HEADERS)
  sheet.autoFilter = `A5:N${lastTemplateRow}`
  const listValidation = (choices: string[], hint: string): ExcelJS.DataValidation => ({
    type: 'list', allowBlank: true, formulae: [`"${choices.join(',')}"`], showErrorMessage: true,
    errorStyle: 'stop', errorTitle: 'Chọn giá trị trong danh sách', error: hint,
    showInputMessage: true, promptTitle: 'Cách điền', prompt: hint,
  })
  for (let row = ROOM_TEMPLATE_FIRST_ROW; row <= lastTemplateRow; row++) {
    sheet.getRow(row).height = 20
    for (let column = 1; column <= 14; column++) {
      const cell = sheet.getCell(row, column)
      cell.font = { name: 'Arial', size: 11, color: { argb: ink } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } } }
      cell.alignment = { vertical: 'middle', horizontal: [2, 4, 6, 8].includes(column) ? 'right' : 'left' }
    }
    sheet.getCell(row, 1).numFmt = '@'
    sheet.getCell(row, 2).dataValidation = { type: 'whole', operator: 'between', formulae: [1, 999], allowBlank: true, showErrorMessage: true, error: 'Nhập tầng bằng số nguyên từ 1 đến 999.' }
    sheet.getCell(row, 3).dataValidation = listValidation(Object.keys(types), 'Tiêu chuẩn, Cao cấp, Suite hoặc VIP.')
    sheet.getCell(row, 4).dataValidation = { type: 'whole', operator: 'between', formulae: [1, 20], allowBlank: true, showErrorMessage: true, error: 'Nhập số khách từ 1 đến 20.' }
    sheet.getCell(row, 5).dataValidation = listValidation(Object.keys(beds), 'Chọn loại giường. Hai giường đơn là Twin. Có thể để trống.')
    sheet.getCell(row, 6).numFmt = '0.##'
    sheet.getCell(row, 6).dataValidation = { type: 'decimal', operator: 'between', formulae: [0.01, 1000], allowBlank: true, showErrorMessage: true, error: 'Diện tích lớn hơn 0 và không quá 1.000 m².' }
    sheet.getCell(row, 8).numFmt = '#,##0 "đ"'
    sheet.getCell(row, 8).dataValidation = { type: 'whole', operator: 'between', formulae: [0, 999999999], allowBlank: true, showErrorMessage: true, error: 'Nhập số tiền nguyên, không âm; ví dụ 500000.' }
    for (const column of [10, 11, 12]) sheet.getCell(row, column).dataValidation = listValidation(['Có', 'Không'], 'Chọn Có hoặc Không; để trống để dùng mặc định.')
    sheet.getCell(row, 13).dataValidation = listValidation(Object.keys(views), 'Chọn hướng nhìn hoặc để trống.')
    sheet.getCell(row, 14).dataValidation = listValidation(Object.keys(statuses), 'Để trống là Trống đã dọn. Khách đang ở phải được tạo qua đặt phòng.')
  }
  sheet.addConditionalFormatting({ ref: 'A6:C5000', rules: [{ type: 'expression', priority: 2,
    formulae: ['AND(COUNTA($A6:$N6)>0,OR($A6="",$B6="",$C6=""))'],
    style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } } },
  }] })
  sheet.addConditionalFormatting({ ref: 'A6:A5000', rules: [{ type: 'expression', priority: 1,
    formulae: ['AND($A6<>"",COUNTIF($A$6:$A$5000,SUBSTITUTE(SUBSTITUTE(SUBSTITUTE($A6,"~","~~"),"*","~*"),"?","~?"))>1)'],
    style: { font: { color: { argb: 'FFB91C1C' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } } },
  }] })
  sheet.pageSetup = { ...sheet.pageSetup, orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:5' }
  sheet.headerFooter.oddFooter = `${hotel.name.replace(/&/g, '&&')} | RoomQC &RTrang &P / &N`

  const guide = workbook.addWorksheet('Hướng dẫn', { properties: { tabColor: { argb: '64748B' } } })
  guide.views = [{ state: 'frozen', xSplit: 3, ySplit: 8, topLeftCell: 'D9', activeCell: 'A9', showGridLines: false }]
  widths.forEach((width, index) => { guide.getColumn(index + 1).width = width })
  heading(guide, 1, 'HƯỚNG DẪN NHẬP PHÒNG', 14, 26)
  heading(guide, 2, hotel.name, 12, hotel.name.length > 70 ? 38 : 22)
  heading(guide, 3, '1. Mở Danh sách phòng, điền từ dòng 6. Mỗi dòng là một phòng.')
  heading(guide, 4, '2. Chọn hạng và loại giường từ danh sách. Một tầng có thể có nhiều hạng phòng.')
  heading(guide, 5, '3. Lưu .xlsx, tải lên RoomQC, kiểm tra rồi bấm Nhập phòng.')
  heading(guide, 6, 'Chỉ 3 cột có * bắt buộc. Nên điền giá, tiện nghi và đặc điểm phòng để hồ sơ hoàn chỉnh. Dòng trống sẽ được tự bỏ qua.', 11, 30)
  heading(guide, 7, 'VÍ DỤ ĐẦY ĐỦ — không nhập các phòng này vào hệ thống', 12, 24)
  tableHeader(guide, 8, ROOM_IMPORT_HEADERS)
  guide.getRow(9).values = ['001', 1, 'Tiêu chuẩn', 2, 'Giường đôi', 25, '', 500000, 'wifi;tv;điều hòa', 'Không', 'Có', 'Không', 'Thành phố', 'Trống đã dọn']
  guide.getRow(10).values = ['A-102', 1, 'Cao cấp', 2, 'Hai giường đơn', 32, 'Phòng góc', 750000, 'wifi;tv;minibar;két sắt', 'Có', 'Có', 'Không', 'Vườn', 'Trống đã dọn']
  guide.getRow(11).values = ['B-201', 2, 'Suite', 4, 'King', 48, 'Có bồn tắm', 1200000, 'wifi;tv;minibar;bồn tắm;máy sấy', 'Có', 'Có', 'Không', 'Biển', 'Trống chưa dọn']
  for (const row of [9, 10, 11]) {
    guide.getCell(row, 1).numFmt = '@'
    guide.getCell(row, 8).numFmt = '#,##0 "đ"'
    guide.getRow(row).height = 30
    guide.getRow(row).eachCell(cell => {
      cell.font = { name: 'Arial', size: 10, color: { argb: ink } }
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } } }
    })
  }
  heading(guide, 12, 'Tất cả 14 cột đều hiển thị. Ba cột nhận diện được cố định; cuộn ngang để xem và điền các nhóm còn lại.', 11, 30)
  heading(guide, 13, 'Hiện hỗ trợ tầng 1–999 và 4 hạng: Tiêu chuẩn, Cao cấp, Suite, VIP. Chưa hỗ trợ tên tầng/hạng riêng.', 11, 32)
  heading(guide, 14, 'Ô đỏ: kiểm tra thông tin bắt buộc hoặc số phòng trùng. Khi tải lên, RoomQC sẽ kiểm tra lại.', 11, 30)
  heading(guide, 15, 'TRA CỨU KHI CẦN', 12, 26)
  const rules = [
    ['Số phòng*', 'Mã duy nhất trong khách sạn, tối đa 20 ký tự. Nhập dạng văn bản để giữ 001; không trùng mã giữa các tòa.'],
    ['Tầng*', 'Số nguyên 1–999. Không tự suy tầng từ số phòng.'],
    ['Hạng phòng*', 'Chọn Tiêu chuẩn, Cao cấp, Suite hoặc VIP. Các phòng cùng tầng có thể chọn hạng khác nhau.'],
    ['Số khách tối đa', 'Nhập số nguyên 1–20. Bỏ trống dùng 2 khách.'],
    ['Loại giường', 'Giường đơn, Giường đôi, Queen, King hoặc Hai giường đơn (Twin). Bỏ trống: chưa khai báo.'],
    ['Diện tích (m²)', 'Nhập số lớn hơn 0 và không quá 1.000. Không thêm chữ m² vào giá trị.'],
    ['Ghi chú', 'Thông tin khác về phòng. Có thể bỏ trống.'],
    ['Giá cơ bản/đêm (đ)', 'Giá niêm yết cơ bản của phòng cho một đêm. Nhập số như 500000, không thêm dấu phân cách hoặc ký hiệu tiền. Bảng giá có thể điều chỉnh giá theo ngày.'],
    ['Tiện nghi', 'Ngăn cách từng tiện nghi bằng dấu ;. Ví dụ: wifi;tv;minibar;điều hòa. RoomQC lưu từng mục thành danh sách tiện nghi của phòng.'],
    ['Có / Không', 'Có ban công, có cửa sổ, cho phép hút thuốc. Bỏ trống: không ban công, có cửa sổ, không hút thuốc.'],
    ['Hướng nhìn', 'Thành phố, Biển, Núi, Vườn hoặc Hồ bơi. Có thể bỏ trống.'],
    ['Trạng thái', 'Bỏ trống: Trống đã dọn. Có thể chọn Trống chưa dọn, Phòng hỏng, Tạm ngừng. Khách đang ở cần tạo đặt phòng.'],
    ['Thêm dòng nhập', 'Có sẵn 200 dòng. Cần thêm: sao chép dòng trống cuối bảng xuống dưới để giữ định dạng và danh sách chọn. Tối đa 5.000 dòng gồm cả tiêu đề.'],
    ['Giữ nguyên cấu trúc', 'Giữ tên cột. Có thể đổi thứ tự cột, để dòng trống. Không dùng công thức trong dữ liệu.'],
    ['Sau khi tải lên', 'Sửa đúng dòng báo lỗi rồi tải lại. Số phòng đã có không được ghi đè. Kiểm tra kết quả để biết phòng nào đã nhập thành công.'],
  ]
  rules.forEach(([label, description], index) => {
    const row = index + 16
    guide.mergeCells(`A${row}:C${row}`)
    guide.mergeCells(`D${row}:N${row}`)
    guide.getCell(row, 1).value = label
    guide.getCell(row, 4).value = description
    guide.getRow(row).height = description.length > 135 ? 54 : 42
  })
  const hotelInfoRow = 17 + rules.length
  heading(guide, hotelInfoRow, 'THÔNG TIN KHÁCH SẠN', 12, 26)
  heading(guide, hotelInfoRow + 1, `${hotel.name}${hotel.code ? ` (${hotel.code})` : ''}`, 11, hotel.name.length > 70 ? 42 : 24)
  heading(guide, hotelInfoRow + 2, contact || 'Bổ sung thông tin liên hệ tại Cài đặt > Thông tin khách sạn.', 11, Math.max(42, Math.ceil(contact.length / 85) * 16))
  guide.eachRow((row) => row.eachCell((cell) => {
    cell.font ??= { name: 'Arial', size: 11, color: { argb: ink } }
    cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true }
  }))
  guide.pageSetup = { ...guide.pageSetup, orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printArea: `A1:N${hotelInfoRow + 2}` }
  return workbook
}

const aliases: Record<string, string> = {}
ROOM_IMPORT_HEADERS.forEach(header => { aliases[key(header)] = header })
Object.entries({
  'Loại phòng': 'Hạng phòng*', 'Số phòng': 'Số phòng*', 'Tầng': 'Tầng*',
  'Giá cơ bản': 'Giá cơ bản/đêm (đ)', 'Giá tham khảo (đ)': 'Giá cơ bản/đêm (đ)',
  'Ban công (yes/no)': 'Ban công', 'Cửa sổ (yes/no)': 'Cửa sổ',
  'Cho phép hút thuốc (yes/no)': 'Cho phép hút thuốc', 'Loại view': 'Hướng nhìn',
}).forEach(([from, to]) => { aliases[key(from)] = to })

function text(cell: ExcelJS.Cell): string {
  if (cell.type === ExcelJS.ValueType.Formula) throw new Error('Có ô công thức; hãy sao chép và dán giá trị trước khi tải lên.')
  return cell.text.trim()
}

/** Read known data sheets, preserving physical Excel row numbers after branding/blank rows. */
export function parseRoomImportWorkbook(workbook: ExcelJS.Workbook): { rooms: ImportedRoom[]; errors: string[] } {
  const required = ROOM_IMPORT_HEADERS.slice(0, 3)
  const candidates: Array<{ sheet: ExcelJS.Worksheet; header: number; columns: Map<string, number> }> = []
  for (const sheet of workbook.worksheets) {
    if (sheet.state !== 'visible' || key(sheet.name) === 'huong dan') continue
    for (let row = 1; row <= Math.min(30, sheet.rowCount); row++) {
      const columns = new Map<string, number>()
      sheet.getRow(row).eachCell((cell, column) => {
        const header = aliases[key(cell.text)]
        if (header) columns.set(header, columns.has(header) ? -1 : column)
      })
      if (required.every(header => columns.has(header))) { candidates.push({ sheet, header: row, columns }); break }
    }
  }
  if (candidates.length !== 1) return { rooms: [], errors: [candidates.length ? 'File có nhiều bảng phòng. Chỉ giữ một sheet dữ liệu phòng để tránh nhập nhầm.' : 'Không tìm thấy bảng phòng. Cần ba cột Số phòng*, Tầng*, Hạng phòng* (hoặc Loại phòng* trong mẫu cũ).'] }
  const { sheet, header, columns } = candidates[0]
  if ([...columns.values()].includes(-1)) return { rooms: [], errors: ['Có tên cột bị lặp. Mỗi trường chỉ được xuất hiện một lần.'] }
  if (sheet.rowCount > 5000 || sheet.columnCount > 100) return { rooms: [], errors: ['File quá lớn. Giữ tối đa 5.000 dòng và 100 cột trong sheet phòng.'] }
  const rooms: ImportedRoom[] = []
  const errors: string[] = []
  const seen = new Map<string, number>()
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= header) return
    try {
      const fail = (name: string, message: string): never => {
        const column = columns.get(name)
        throw new Error(`${column ? `Cột ${sheet.getColumn(column).letter} (${name.replace('*', '')})` : name.replace('*', '')}: ${message}`)
      }
      const record = Object.fromEntries([...columns].map(([name, column]) => {
        try { return [name, text(row.getCell(column))] }
        catch (error) { return fail(name, error instanceof Error ? error.message : 'Không đọc được ô.') }
      }))
      if (Object.values(record).every(value => !value)) return
      const number = (name: string, min: number, max: number, integer = false, mandatory = false) => {
        const value = record[name]
        if (!value) { if (mandatory) fail(name, 'Chưa điền. Hãy bổ sung giá trị.'); return undefined }
        if (!(integer ? /^\d+$/ : /^\d+(\.\d+)?$/).test(value)) fail(name, 'Nhập giá trị số, không thêm đơn vị hoặc dấu phân cách hàng nghìn.')
        const parsed = Number(value)
        if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) fail(name, `Cần ${integer ? 'số nguyên' : 'số'} từ ${min} đến ${max}.`)
        return parsed
      }
      const choice = (name: string, options: Record<string, string>, extra: Record<string, string> = {}) => {
        if (!record[name]) return undefined
        const match = Object.entries({ ...options, ...extra }).find(([label, code]) => key(label) === key(record[name]) || key(code) === key(record[name]))
        if (!match) return fail(name, `Chọn ${Object.keys(options).join(', ')}.`)
        return match[1]
      }
      const yesNo = (name: string, fallback: boolean) => {
        if (!record[name]) return fallback
        if (['co', 'yes', 'true', '1'].includes(key(record[name]))) return true
        if (['khong', 'no', 'false', '0'].includes(key(record[name]))) return false
        return fail(name, 'Chọn Có hoặc Không.')
      }
      const roomNumber = record['Số phòng*']
      if (!roomNumber || roomNumber.length > 20) fail('Số phòng*', 'Điền mã từ 1 đến 20 ký tự.')
      const roomIdentity = roomNumber.normalize('NFC').toLocaleUpperCase('vi')
      if (seen.has(roomIdentity)) fail('Số phòng*', `Mã ${roomNumber} bị trùng với dòng ${seen.get(roomIdentity)}. Giữ một dòng hoặc sửa mã phòng.`)
      const roomType = choice('Hạng phòng*', types)
      if (!roomType) return fail('Hạng phòng*', 'Chưa điền. Chọn hạng phòng từ danh sách.')
      const room: ImportedRoom = {
        room_number: roomNumber, floor: number('Tầng*', 1, 999, true, true)!, room_type: roomType, source_row: rowNumber,
        max_guests: number('Số khách tối đa', 1, 20, true), bed_type: choice('Loại giường', beds, { 'Đơn': 'single', 'Đôi': 'double', Twin: 'twin' }),
        area_sqm: number('Diện tích (m²)', 0.01, 1000), base_price: number('Giá cơ bản/đêm (đ)', 0, 999999999, true),
        notes: record['Ghi chú'] || undefined, amenities: (record['Tiện nghi (cách nhau bằng dấu ;)'] || '').split(';').map(value => value.trim()).filter(Boolean),
        has_balcony: yesNo('Ban công', false), has_window: yesNo('Cửa sổ', true), smoking_allowed: yesNo('Cho phép hút thuốc', false),
        view_type: choice('Hướng nhìn', views, { ocean: 'sea' }), status: choice('Trạng thái', statuses, { vacant: 'vacant_clean', cleaning: 'vacant_dirty', maintenance: 'out_of_service', vacant_inspected: 'vacant_inspected' }) || 'vacant_clean',
      }
      seen.set(roomIdentity, rowNumber)
      rooms.push(room)
    } catch (error) { errors.push(`Sheet ${sheet.name}, dòng ${rowNumber}: ${error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.'}`) }
  })
  return { rooms: errors.length ? [] : rooms, errors }
}

export async function readRoomImportFile(file: File) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Chỉ hỗ trợ file Excel .xlsx.')
  if (file.size > 5 * 1024 * 1024) throw new Error('File vượt quá 5 MB. Hãy bỏ dữ liệu và sheet không cần thiết.')
  const workbook = new ExcelJS.Workbook()
  try { await workbook.xlsx.load(await file.arrayBuffer()) }
  catch { throw new Error('Không đọc được file Excel. Hãy mở file bằng Excel, lưu lại dạng .xlsx rồi tải lại, hoặc điền vào file mẫu mới.') }
  return parseRoomImportWorkbook(workbook)
}

export function roomTemplateFilename(hotel: RoomTemplateHotel) {
  const slug = key(hotel.name || hotel.code).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)
  return `mau-phong-${slug || 'khach-san'}.xlsx`
}

export function roomImportTypeLabel(code: string) {
  return Object.entries(types).find(([, value]) => value === code)?.[0] || code
}
