import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ControlWorkspaceDetails, ControlWorkspaceRecheckReceipt } from '@/lib/control-admin'
import { useControlWorkspaceRecheck } from '@/hooks/super-admin/useControlWorkspaceRecheck'
import { controlTime } from '@/lib/control-admin-display'

const outcomes: Record<ControlWorkspaceRecheckReceipt['outcome'], string> = {
  queued: 'Đã xếp lịch đối soát. Theo dõi trạng thái đăng ký để xem kết quả.',
  reused_job: 'Đã có công việc đối soát. Hệ thống tiếp tục xử lý công việc hiện có.',
  running: 'Hệ thống đang đối soát. Vui lòng chờ rồi tải lại trạng thái.',
  activated: 'Đã xác nhận dữ liệu đã cấp và cập nhật đăng ký sẵn sàng sử dụng.',
  verified_active: 'Đã xác nhận đăng ký đang hoạt động và dữ liệu khớp.',
  waiting_owner: 'Đã xác nhận lần gửi trước đã đóng. Chủ tài khoản cần tiếp tục thiết lập trên đăng ký này.',
  needs_review: 'Cần kỹ thuật kiểm tra lịch sử và kết quả cấp dữ liệu trước khi tiếp tục.',
  unavailable: 'Chưa xác nhận được kết quả từ cụm dữ liệu. Giữ đăng ký hiện có và thử kiểm tra lại sau.',
}

export function ControlWorkspaceRecheck({ data, onConfirmed }: { data: ControlWorkspaceDetails; onConfirmed: () => unknown }) {
  const workspace = data.workspace, actions = useControlWorkspaceRecheck(workspace.id, onConfirmed)
  const [form, setForm] = useState<{ scope: string; reason: string } | null>(null)
  const fingerprint = data.recheck?.snapshotSha256, scope = JSON.stringify([workspace.id, fingerprint, actions.scope])
  const currentForm = form?.scope === scope ? form : null
  const pending = actions.pending.filter(entry => entry.request.target === workspace.id)
  const disabled = !actions.enabled || actions.busy || pending.length > 0 || !fingerprint
    || !['provisioning', 'active'].includes(workspace.status)
  return <section className="space-y-3 rounded-lg border p-4" aria-label="Kiểm tra lại đăng ký">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <h4 className="font-semibold">Kiểm tra lại đăng ký</h4>
      <p className="mt-1 text-sm text-muted-foreground">Đối soát kết quả cấp dữ liệu và tiếp tục công việc đủ điều kiện.</p>
    </div><Button variant="outline" disabled={disabled} onClick={() => setForm({ scope, reason: '' })}>Kiểm tra lại</Button></div>
    {actions.message && <p role="status" className="text-sm">{actions.message}</p>}
    {actions.supportId && <p className="break-all text-xs text-muted-foreground">Mã hỗ trợ: {actions.supportId}</p>}
    {actions.receipt && <div className="space-y-1 rounded-md border p-3" role="status">
      <p className="font-medium">{outcomes[actions.receipt.outcome]}</p>
      <p className="text-xs text-muted-foreground">Ghi nhận: {controlTime(actions.receipt.recordedAt)}</p>
    </div>}
    {pending.map(entry => <div key={entry.request.key} className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">{entry.state === 'not_applied' ? 'Yêu cầu chưa được áp dụng' : 'Yêu cầu đang chờ xác nhận kết quả'}</p>
      <p className="break-all text-xs text-muted-foreground">Mã lệnh: {entry.request.key}</p>
      <div className="flex flex-wrap gap-2">{entry.state === 'not_applied'
        ? <Button variant="outline" disabled={actions.busy || !actions.enabled} onClick={() => void actions.dismiss(entry)}>Bỏ yêu cầu chưa áp dụng</Button>
        : <><Button variant="outline" disabled={actions.busy || !actions.enabled} onClick={() => void actions.lookup(entry)}>Kiểm tra kết quả</Button>
          {actions.absentKey === entry.request.key && <Button variant="outline" disabled={actions.busy || !actions.enabled} onClick={() => void actions.retry(entry)}>Gửi lại cùng yêu cầu</Button>}</>}
      </div>
    </div>)}
    {currentForm && !disabled && <form className="space-y-3 border-t pt-3" onSubmit={event => {
      event.preventDefault()
      if (!fingerprint || currentForm.reason.trim().length < 5) return
      void actions.execute({ target: workspace.id, expectedVersion: data.recheck!.routingVersion, expectedSnapshotSha256: fingerprint, reason: currentForm.reason })
      setForm(null)
    }}>
      <p className="text-sm font-medium">Xác nhận kiểm tra đăng ký {workspace.slug}</p>
      <Label htmlFor="workspace-recheck-reason">Lý do kiểm tra lại</Label>
      <Textarea id="workspace-recheck-reason" autoFocus minLength={5} maxLength={1000} value={currentForm.reason} onChange={event => setForm({ ...currentForm, reason: event.target.value })} />
      <p className="text-xs text-muted-foreground">Nhập từ 5 đến 1.000 ký tự. Kết quả sẽ được lưu để tra cứu khi mất kết nối.</p>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={currentForm.reason.trim().length < 5}>Xác nhận kiểm tra</Button>
        <Button type="button" variant="outline" onClick={() => setForm(null)}>Hủy</Button></div>
    </form>}
  </section>
}

export function ControlWorkspaceRecheckPending({ onOpen }: { onOpen: (workspaceId: string) => void }) {
  const actions = useControlWorkspaceRecheck('', () => {})
  if (!actions.pending.length) return null
  return <section className="space-y-3 rounded-lg border p-4" aria-label="Đăng ký có yêu cầu chờ xác nhận">
    <h2 className="font-semibold">Yêu cầu kiểm tra đang chờ xác nhận</h2>
    <p className="text-sm text-muted-foreground">Mở đăng ký để kiểm tra kết quả yêu cầu đã gửi.</p>
    {actions.pending.map(entry => <div key={entry.request.key} className="flex flex-wrap items-center justify-between gap-3">
      <p className="break-all text-xs">Đăng ký: {entry.request.target}</p>
      <Button variant="outline" disabled={!actions.enabled} onClick={() => onOpen(entry.request.target)}>Mở đăng ký chờ xác nhận</Button>
    </div>)}
  </section>
}
