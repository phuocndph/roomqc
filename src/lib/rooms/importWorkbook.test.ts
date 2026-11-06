import * as ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { createRoomImportWorkbook, parseRoomImportWorkbook, readRoomImportFile, roomTemplateFilename } from './importWorkbook'

const hotel = { name: 'Khách sạn kiểm thử', code: 'KS-01', address: 'Địa chỉ kiểm thử', phone: 'Số điện thoại kiểm thử', email: 'test@example.com' }
const make = () => createRoomImportWorkbook(hotel, new Date('2026-10-16T00:00:00Z'))
function fill(workbook: ExcelJS.Workbook, row: number, roomNumber = '001', roomType = 'Tiêu chuẩn') {
  workbook.worksheets[0].getRow(row).values = [roomNumber, 1, roomType, 2, 'Đôi', 25]
}

describe('hotel room Excel template and import contract', () => {
  it('writes sheet properties in OOXML schema order so native Excel does not discard the sheet', async () => {
    // ExcelJS can read its own invalid output, so inspect the serialized XML directly.
    const zip = await JSZip.loadAsync(await make().xlsx.writeBuffer())
    for (const name of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      const xml = new DOMParser().parseFromString(await zip.file(name)!.async('string'), 'application/xml')
      expect(xml.querySelector('parsererror')).toBeNull()
      const order = ['tabColor', 'outlinePr', 'pageSetUpPr']
      const properties = [...xml.getElementsByTagName('sheetPr')[0].children].map(node => node.localName)
      expect(properties).toEqual([...properties].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
      expect(xml.getElementsByTagName('pageMargins')).toHaveLength(1)
    }
  })

  it('exports a branded, empty template with frozen identifiers and editable Vietnamese lists', async () => {
    const source = make()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await source.xlsx.writeBuffer())
    const sheet = workbook.worksheets[0]
    expect(sheet.getCell('A1').text).toBe(hotel.name)
    expect(sheet.getCell('A2').text).toContain(hotel.code)
    expect(sheet.getCell('A2').text).toContain(hotel.phone)
    expect(sheet.views[0]).toMatchObject({ xSplit: 3, ySplit: 5, topLeftCell: 'D6', activeCell: 'D6', showGridLines: false })
    expect(sheet.getCell('A6').numFmt).toBe('@')
    expect(sheet.getCell('C6').dataValidation.formulae?.[0]).toContain('Tiêu chuẩn')
    expect(sheet.columns.filter(column => !column.hidden)).toHaveLength(14)
    expect(sheet.getColumn(6).hidden).not.toBe(true)
    expect(sheet.getColumn(14).outlineLevel).toBe(0)
    expect(sheet.getCell('H5').text).toBe('Giá cơ bản/đêm (đ)')
    expect(sheet.getCell('I5').text).toContain('Tiện nghi')
    expect(sheet.getCell('N5').text).toBe('Trạng thái')
    expect(sheet.getCell('A4').text).toContain('cột A đến N')
    expect(sheet.rowCount).toBe(205)
    expect(parseRoomImportWorkbook(workbook)).toEqual({ rooms: [], errors: [] })
    const guide = workbook.getWorksheet('Hướng dẫn')!
    expect(guide.getCell('A9').text).toBe('001')
    expect(guide.getCell('A9').numFmt).toBe('@')
    expect(guide.getCell('H9').value).toBe(500000)
    expect(guide.getCell('I9').text).toContain('wifi')
    const guideText = guide.getSheetValues().flat().join(' ')
    expect(guideText).toContain(hotel.address)
    expect(guideText).toContain(hotel.email)
  })

  it('round-trips mixed categories on the same floor, leading zeros, explicit zero prices and optional defaults', async () => {
    const source = make()
    fill(source, 6)
    fill(source, 10, 'A-102', 'Cao cấp')
    source.worksheets[0].getCell('H10').value = 0
    source.worksheets[0].getCell('J10').value = 'Có'
    source.worksheets[0].getCell('M10').value = 'Biển'
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await source.xlsx.writeBuffer())
    const result = parseRoomImportWorkbook(workbook)
    expect(result.errors).toEqual([])
    expect(result.rooms).toHaveLength(2)
    expect(result.rooms[0]).toMatchObject({ room_number: '001', source_row: 6, floor: 1, room_type: 'standard', status: 'vacant_clean', has_window: true })
    expect(result.rooms[0].base_price).toBeUndefined()
    expect(result.rooms[1]).toMatchObject({ source_row: 10, floor: 1, room_type: 'deluxe', base_price: 0, has_balcony: true, view_type: 'sea' })
  })

  it('accepts old headers and codes with guidance as the first worksheet', () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Hướng dẫn').addRow(['Giải thích'])
    const sheet = workbook.addWorksheet('Rooms')
    sheet.addRow(['Số phòng*', 'Tầng*', 'Loại phòng*', 'Trạng thái', 'Giá cơ bản', 'Cửa sổ (yes/no)', 'Loại view'])
    sheet.addRow(['P101', 1, 'standard', 'vacant', 500000, 'no', 'ocean'])
    expect(parseRoomImportWorkbook(workbook).rooms[0]).toMatchObject({ room_number: 'P101', base_price: 500000, has_window: false, view_type: 'sea', status: 'vacant_clean', source_row: 2 })
  })

  it('accepts reordered columns without treating hotel metadata as rooms', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Phòng của tôi')
    sheet.addRow(['Khách sạn kiểm thử'])
    sheet.addRow(['Hạng phòng', 'Số phòng', 'Tầng'])
    sheet.addRow(['VIP', 'A-201', 2])
    expect(parseRoomImportWorkbook(workbook).rooms[0]).toMatchObject({ room_number: 'A-201', room_type: 'vip', floor: 2, source_row: 3 })
  })

  it.each([
    ['Tầng chữ', 'B12', 'Trệt', 'Tầng'],
    ['Hạng chưa hỗ trợ', 'C12', 'Villa', 'Hạng phòng'],
    ['Sức chứa sai', 'D12', 0, 'Số khách'],
    ['Có/không sai', 'J12', 'có thể', 'Ban công'],
    ['Giá âm', 'H12', -1, 'Giá cơ bản/đêm'],
    ['Khách đang ở chưa có booking', 'N12', 'occupied_clean', 'Trạng thái'],
    ['Công thức có cache cũ', 'H12', { formula: '1+1', result: 500000 }, 'công thức'],
  ])('rejects %s at its actual Excel row', (_label, address, value, message) => {
    const workbook = make()
    fill(workbook, 12)
    workbook.worksheets[0].getCell(address).value = value as ExcelJS.CellValue
    const result = parseRoomImportWorkbook(workbook)
    expect(result.rooms).toEqual([])
    expect(result.errors[0]).toContain('dòng 12')
    expect(result.errors[0]).toContain(message)
  })

  it('rejects duplicate room codes before importing any row', () => {
    const workbook = make()
    fill(workbook, 8, 'A-101')
    fill(workbook, 11, 'a-101')
    const result = parseRoomImportWorkbook(workbook)
    expect(result.rooms).toEqual([])
    expect(result.errors[0]).toContain('dòng 11')
    expect(result.errors[0]).toContain('trùng')
  })

  it('rejects ambiguous sheets and duplicate recognized columns', () => {
    const workbook = make()
    const second = workbook.addWorksheet('Rooms')
    second.addRow(['Số phòng', 'Tầng', 'Loại phòng'])
    expect(parseRoomImportWorkbook(workbook).errors[0]).toContain('nhiều bảng')
    workbook.removeWorksheet(second.id)
    workbook.worksheets[0].getCell('O5').value = 'Loại phòng*'
    expect(parseRoomImportWorkbook(workbook).errors[0]).toContain('cột bị lặp')
  })

  it('uses a readable filename without filesystem characters from the hotel name', () => {
    expect(roomTemplateFilename({ name: 'An Thủy / Resort' })).toBe('mau-phong-an-thuy-resort.xlsx')
  })

  it('still reads the previous branded template with row 7 headers and legacy bed labels', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Danh sách phòng')
    sheet.getCell('A3').value = hotel.name
    sheet.getRow(7).values = ['Số phòng*', 'Tầng*', 'Hạng phòng*', 'Loại giường']
    sheet.getRow(8).values = ['001', 1, 'Cao cấp', 'Twin']
    expect(parseRoomImportWorkbook(workbook).rooms[0]).toMatchObject({ room_number: '001', bed_type: 'twin', source_row: 8 })
  })

  it.each([['Giường đơn', 'single'], ['Giường đôi', 'double'], ['Hai giường đơn', 'twin'], ['Twin', 'twin'], ['Đơn', 'single'], ['Đôi', 'double']])('maps bed label %s without changing its stored code', (label, code) => {
    const workbook = make()
    fill(workbook, 6)
    workbook.worksheets[0].getCell('E6').value = label
    expect(parseRoomImportWorkbook(workbook).rooms[0].bed_type).toBe(code)
  })

  it('locates invalid pasted data after reordered columns and retains the row to correct', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Phòng')
    sheet.getRow(5).values = ['Hạng phòng*', 'Số phòng*', 'Tầng*']
    sheet.getRow(9).values = ['VIP', 'A-101', 'Trệt']
    expect(parseRoomImportWorkbook(workbook).errors[0]).toMatch(/dòng 9: Cột C \(Tầng\)/)
  })

  it('reads added rows and all optional data without importing guide examples', async () => {
    const workbook = make()
    const sheet = workbook.worksheets[0]
    fill(workbook, 206, 'A-201', 'VIP')
    sheet.getCell('F206').value = 42
    sheet.getCell('G206').value = 'Góc yên tĩnh'
    sheet.getCell('H206').value = 0
    sheet.getCell('I206').value = 'wifi;tv'
    sheet.getCell('J206').value = 'Có'
    sheet.getCell('K206').value = 'Không'
    sheet.getCell('L206').value = 'Có'
    sheet.getCell('M206').value = 'Biển'
    sheet.getCell('N206').value = 'Phòng hỏng'
    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(await workbook.xlsx.writeBuffer())
    const result = parseRoomImportWorkbook(loaded)
    expect(result.errors).toEqual([])
    expect(result.rooms).toHaveLength(1)
    expect(result.rooms[0]).toMatchObject({ source_row: 206, area_sqm: 42, notes: 'Góc yên tĩnh', base_price: 0, amenities: ['wifi', 'tv'], has_balcony: true, has_window: false, smoking_allowed: true, view_type: 'sea', status: 'out_of_order' })
  })

  it('serializes missing-field and duplicate warnings with relative row references and escaped wildcard codes', async () => {
    const zip = await JSZip.loadAsync(await make().xlsx.writeBuffer())
    const xml = new DOMParser().parseFromString(await zip.file('xl/worksheets/sheet1.xml')!.async('string'), 'application/xml')
    const formulas = [...xml.getElementsByTagName('conditionalFormatting')].map(node => node.textContent)
    expect(formulas).toContain('AND(COUNTA($A6:$N6)>0,OR($A6="",$B6="",$C6=""))')
    expect(formulas.some(formula => formula?.includes('COUNTIF($A$6:$A$5000') && formula.includes('"*","~*"'))).toBe(true)
  })

  it('provides actionable feedback for a corrupt workbook', async () => {
    const file = { name: 'phong.xlsx', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as File
    await expect(readRoomImportFile(file)).rejects.toThrow('mở file bằng Excel')
  })

  it('keeps the compact view with missing contact details and wraps a long hotel name', () => {
    const workbook = createRoomImportWorkbook({ name: 'Khách sạn '.repeat(12) })
    expect(workbook.worksheets[0].getRow(1).height).toBe(44)
    expect(workbook.worksheets[0].getCell('A2').text).toBe('Mẫu nhập phòng')
    expect(parseRoomImportWorkbook(workbook)).toEqual({ rooms: [], errors: [] })
  })
})
