import { Button } from '@/components/ui/button'

export function AuthoritySaveNotice({ notice, pendingCount, busy, onRecover }: {
  notice: string | null; pendingCount: number; busy: boolean; onRecover: () => void
}) {
  if (!notice && !pendingCount) return null
  return <div className="space-y-2 rounded-md border border-border bg-background p-3 text-sm" role="status">
    {notice && <p>{notice}</p>}
    {pendingCount > 0 && <>
      <p>Có {pendingCount} lần lưu chưa xác nhận. Kiểm tra kết quả trước khi lưu thay đổi khác.</p>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRecover}>
        {busy ? 'Đang kiểm tra…' : 'Kiểm tra và tiếp tục lần lưu trước'}
      </Button>
    </>}
  </div>
}
