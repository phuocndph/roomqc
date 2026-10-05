import {
  downloadCsv,
  downloadWorkbook,
  objectRecordsToRows,
} from '@/lib/excelUtils'

export async function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = 'Data',
): Promise<void> {
  await downloadWorkbook([{ name: sheetName, rows: objectRecordsToRows(data) }], filename)
}

export function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  downloadCsv(data, filename)
}
