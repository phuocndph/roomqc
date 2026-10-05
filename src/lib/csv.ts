/**
 * Tải xuống file CSV trên trình duyệt.
 * - rows: mảng object đồng nhất key
 * - filename: ví dụ 'qc-staff-2026-04-30.csv'
 */
export function downloadCsv(rows: Record<string, any>[], filename: string, headers?: Record<string, string>) {
  if (!rows || rows.length === 0) return

  const keys = Object.keys(headers ?? rows[0])
  const headerLine = keys.map((k) => csvEscape(headers?.[k] ?? k)).join(',')
  const lines = rows.map((r) => keys.map((k) => csvEscape(r[k])).join(','))

  // BOM để Excel mở đúng tiếng Việt
  const csv = '\ufeff' + [headerLine, ...lines].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function csvEscape(value: any): string {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
