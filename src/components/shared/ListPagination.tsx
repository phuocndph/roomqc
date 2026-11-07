import { Button } from '@/components/ui/button'

export function ListPagination({ total, page, pageSize = 50, onPageChange }: {
  total: number; page: number; pageSize?: number; onPageChange: (page: number) => void
}) {
  if (total <= pageSize) return null
  const pages = Math.ceil(total / pageSize)
  return (
    <nav aria-label="Phân trang danh sách" className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
      <span role="status">Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}</span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>Trước</Button>
        <span className="tabular-nums">{page}/{pages}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= pages}>Sau</Button>
      </div>
    </nav>
  )
}
