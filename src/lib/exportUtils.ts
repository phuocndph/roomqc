import { downloadWorkbook, objectRecordsToRows } from '@/lib/excelUtils'

export async function exportItemsToExcel(items: Record<string, any>[], filename: string = 'items-export') {
  if (!items || items.length === 0) {
    throw new Error('Không có dữ liệu để xuất')
  }

  // Format data for Excel
  const excelData = items.map((item, index) => ({
    'STT': index + 1,
    'Mã': item.code,
    'Tên tài sản': item.name,
    'Danh mục': item.category_name || item.item_categories?.name || 'N/A',
    'Đơn vị': item.unit,
    'Đơn giá': item.unit_price,
    'Tổng SL': item.quantity_total || 0,
    'SL khả dụng': item.quantity_available || 0,
    'SL đã phân bổ': item.quantity_allocated || 0,
    'Tồn kho tối thiểu': item.minimum_stock || 0,
    'Trạng thái kho': getStockStatusLabel(item.stock_status),
    'Trạng thái': item.status === 'active' ? 'Đang sử dụng' : 'Ngừng sử dụng',
    'Thương hiệu': item.brand || '',
    'Model': item.model || '',
    'Ngày tạo': new Date(item.created_at).toLocaleDateString('vi-VN'),
  }))

  // Add summary sheet
  const summary = {
    'Tổng số tài sản': items.length,
    'Tổng giá trị': items.reduce((sum, item) => sum + (item.unit_price * (item.quantity_total || 0)), 0),
    'Số lượng tổng': items.reduce((sum, item) => sum + (item.quantity_total || 0), 0),
    'Số lượng khả dụng': items.reduce((sum, item) => sum + (item.quantity_available || 0), 0),
    'Ngày xuất': new Date().toLocaleString('vi-VN'),
  }

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const finalFilename = `${filename}_${timestamp}`

  await downloadWorkbook([
    {
      name: 'Danh sách tài sản',
      rows: objectRecordsToRows(excelData),
      columnWidths: [5, 15, 30, 20, 10, 12, 10, 12, 15, 15, 15, 15, 15, 15, 15],
    },
    {
      name: 'Tóm tắt',
      rows: objectRecordsToRows([summary]),
      columnWidths: [25, 20],
    },
  ], finalFilename)

  return finalFilename
}

function getStockStatusLabel(status: string): string {
  switch (status) {
    case 'in_stock':
      return 'Đủ hàng'
    case 'low_stock':
      return 'Thấp'
    case 'out_of_stock':
      return 'Hết hàng'
    default:
      return status || 'N/A'
  }
}

// Export for other data types (can be extended)
export async function exportToExcel<T extends Record<string, any>>(
  data: T[],
  filename: string,
  sheetName: string = 'Sheet1'
) {
  if (!data || data.length === 0) {
    throw new Error('Không có dữ liệu để xuất')
  }

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const finalFilename = `${filename}_${timestamp}`

  await downloadWorkbook([{
    name: sheetName,
    rows: objectRecordsToRows(data),
  }], finalFilename)

  return finalFilename
}
