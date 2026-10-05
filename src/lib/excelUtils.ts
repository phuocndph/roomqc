import * as ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

export type ExcelCell = string | number | boolean | Date | null | undefined
export type ExcelRow = readonly ExcelCell[]

export interface ExcelSheetInput {
  name: string
  rows: readonly ExcelRow[]
  columnWidths?: readonly number[]
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function normalizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/*?:]/g, '').split('[').join('').split(']').join('').trim()
  return (cleaned || `Sheet${index + 1}`).slice(0, 31)
}

function uniqueSheetName(name: string, usedNames: Set<string>, index: number): string {
  const base = normalizeSheetName(name, index)
  let candidate = base
  let suffix = 2
  while (usedNames.has(candidate)) {
    const suffixText = ` (${suffix})`
    candidate = `${base.slice(0, 31 - suffixText.length)}${suffixText}`
    suffix += 1
  }
  usedNames.add(candidate)
  return candidate
}

function normalizeFilename(filename: string, extension: string): string {
  return filename.toLowerCase().endsWith(extension) ? filename : `${filename}${extension}`
}

/** Convert object records into a header row followed by value rows. */
export function objectRecordsToRows(records: readonly Record<string, unknown>[]): ExcelRow[] {
  if (records.length === 0) return []

  const headers = Array.from(
    records.reduce((keys, record) => {
      Object.keys(record).forEach((key) => keys.add(key))
      return keys
    }, new Set<string>()),
  )

  return [
    headers,
    ...records.map((record) => headers.map((header) => toExcelCell(record[header]))),
  ]
}

function toExcelCell(value: unknown): ExcelCell {
  if (value === null || value === undefined) return value as null | undefined
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return String(value)
}

/** Create and download one or more XLSX worksheets in the browser. */
export async function downloadWorkbook(
  sheets: readonly ExcelSheetInput[],
  filename: string,
): Promise<void> {
  if (sheets.length === 0) throw new Error('Không có worksheet để xuất')

  const workbook = new ExcelJS.Workbook()
  const usedNames = new Set<string>()
  sheets.forEach((sheet, index) => {
    const worksheet = workbook.addWorksheet(uniqueSheetName(sheet.name, usedNames, index))
    sheet.rows.forEach((row) => worksheet.addRow([...row]))
    if (sheet.columnWidths) {
      sheet.columnWidths.forEach((width, columnIndex) => {
        const column = worksheet.getColumn(columnIndex + 1)
        column.width = Math.max(1, width)
      })
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: XLSX_MIME }), normalizeFilename(filename, '.xlsx'))
}

/** Download UTF-8 CSV while preserving commas, quotes, line breaks, and BOM. */
export function downloadCsv(
  records: readonly Record<string, unknown>[],
  filename: string,
): void {
  const rows = objectRecordsToRows(records)
  const csv = rows
    .map((row) => row.map((value) => {
      const text = value === null || value === undefined ? '' : String(value)
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }).join(','))
    .join('\r\n')

  saveAs(
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }),
    normalizeFilename(filename, '.csv'),
  )
}

function normalizeCellValue(value: unknown): ExcelCell {
  if (value && typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value) return normalizeCellValue(value.result)
  }
  return toExcelCell(value)
}

/** Read the first worksheet of an XLSX file as zero-based row arrays. */
export async function readExcelRows(file: File): Promise<ExcelCell[][]> {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error('Chỉ hỗ trợ file .xlsx; ExcelJS không đọc được định dạng .xls')
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return []

  const rows: ExcelCell[][] = []
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    rows.push(values.map(normalizeCellValue))
  })
  return rows
}

/** Read the first worksheet as records using its first row as column headers. */
export async function readExcelObjects(file: File): Promise<Record<string, ExcelCell>[]> {
  const rows = await readExcelRows(file)
  const headerRow = rows.shift() ?? []
  const headers = headerRow.map((header, index) => String(header ?? `Column ${index + 1}`).trim())

  return rows
    .filter((row) => row.some((cell) => cell !== undefined && cell !== null && cell !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])))
}
