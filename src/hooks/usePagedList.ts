import { useState } from 'react'

export function usePagedList<T>(rows: T[], resetKey: string, pageSize = 50) {
  const [selection, setSelection] = useState({ key: resetKey, page: 1 })
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.max(1, Math.min(selection.key === resetKey ? selection.page : 1, pages))
  return {
    page,
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    setPage: (next: number) => setSelection({ key: resetKey, page: Math.max(1, Math.min(next, pages)) }),
  }
}
