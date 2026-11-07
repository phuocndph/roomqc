import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ControlReadState, ControlStatus } from './ControlReadState'
import { useControlAdmin, controlAdminClient } from '@/hooks/super-admin/useControlAdmin'
import { useControlAlerts } from '@/hooks/super-admin/useControlAlerts'
import { controlTime } from '@/lib/control-admin-display'

const names: Record<string, string> = { CPU_CRITICAL: 'CPU quá tải', CPU_HIGH: 'CPU sử dụng cao', MEMORY_CRITICAL: 'RAM gần cạn', MEMORY_LOW: 'RAM còn ít',
  DISK_CRITICAL: 'Ổ dữ liệu gần đầy', DISK_LOW: 'Ổ dữ liệu còn ít dung lượng', INODE_CRITICAL: 'Số tệp gần giới hạn', INODE_LOW: 'Số tệp tăng cao',
  DB_CONNECTIONS_CRITICAL: 'Kết nối database gần hết', DB_CONNECTIONS_HIGH: 'Kết nối database tăng cao',
  BACKEND_UNREACHABLE: 'Cụm dữ liệu mất kết nối', BACKEND_PROBE_FAILED: 'Dịch vụ chưa phản hồi đầy đủ', METRICS_STALE: 'Giám sát chưa có số đo mới' }
const states = { open: 'Chưa nhận xử lý', acknowledged: 'Đã nhận xử lý', resolved: 'Đã phục hồi' }
export function ControlAlertsPanel({ onReady }: { onReady: (ready: boolean) => void }) {
  const [params, setParams] = useSearchParams(), state = params.get('alertState') ?? 'open', severity = params.get('alertSeverity') ?? '', cursor = params.get('alertCursor') ?? ''
  const list = useControlAdmin(['alerts', state, severity, cursor], (actor, options) => controlAdminClient.alerts(actor, { state, severity, cursor }, options))
  const actions = useControlAlerts(() => list.refetch())
  const [form, setForm] = useState<{ id: string; reason: string; scope: unknown } | null>(null)
  // Form scope follows the current page snapshot; it cannot bind to rows from another session/query.
  const formCurrent = form?.scope === list.data
  useEffect(() => { onReady(!!list.data && !list.isFetching) }, [list.data, list.isFetching, onReady])
  const update = (key: string, value: string, reset = true) => {
    const next = new URLSearchParams(params); if (value || key === 'alertState') next.set(key, value); else next.delete(key)
    if (reset) next.delete('alertCursor'); setParams(next)
  }
  return <section aria-label="Cảnh báo hạ tầng" className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Cảnh báo cần theo dõi</h2>
      <p className="mt-1 text-sm text-muted-foreground">Nhận xử lý để xác định người phụ trách. Hệ thống chỉ đóng cảnh báo khi đã phục hồi.</p></div>
      <Button variant="outline" disabled={!list.enabled || list.isFetching || actions.busy} onClick={() => void list.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tải lại cảnh báo</Button>
    </div>
    {actions.busy && <p role="status" className="text-sm">Đang xác nhận yêu cầu với máy chủ…</p>}
    {actions.message && <div role={actions.receipt ? 'status' : 'alert'} className="space-y-2 rounded-lg border p-4 text-sm">
      <p>{actions.message}</p>{actions.supportId && <p>Mã hỗ trợ: {actions.supportId}</p>}
      {!actions.enabled && <Button variant="outline" onClick={actions.refresh}>Kiểm tra bộ nhớ trình duyệt</Button>}
    </div>}
    {actions.pending.length > 0 && <section aria-label="Yêu cầu nhận xử lý đang chờ" className="space-y-3 rounded-lg border border-amber-700 p-4">
      <h3 className="font-semibold">Yêu cầu cần xác nhận kết quả</h3>
      {actions.pending.map(entry => <article key={entry.request.key} className="space-y-3 border-t pt-3 text-sm">
        <p className="break-words">{entry.state === 'not_applied' ? 'Yêu cầu chưa được áp dụng.' : 'Chưa xác nhận kết quả nhận xử lý.'} Lập lúc {controlTime(entry.createdAt)}.</p>
        <p className="break-words">Lý do: {entry.request.reason}</p>
        <details><summary className="cursor-pointer">Thông tin yêu cầu</summary><p className="mt-2 break-all">Cảnh báo: {entry.request.target}<br />Mã yêu cầu: {entry.request.key}</p></details>
        <div className="flex flex-wrap gap-2">{entry.state === 'not_applied'
          ? <Button variant="outline" disabled={!actions.enabled || actions.busy} onClick={() => void actions.dismiss(entry)}>Đóng yêu cầu và tải lại</Button>
          : <><Button variant="outline" disabled={!actions.enabled || actions.busy} onClick={() => void actions.lookup(entry)}>Kiểm tra kết quả</Button>
            {actions.absentKey === entry.request.key && <Button disabled={!actions.enabled || actions.busy} onClick={() => void actions.retry(entry)}>Gửi lại cùng yêu cầu</Button>}</>}
        </div>
      </article>)}
    </section>}
    <div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label htmlFor="alert-state">Tình trạng cảnh báo</Label>
      <select id="alert-state" className="block h-10 rounded-md border bg-background px-3" value={state} onChange={event => update('alertState', event.target.value)}>
        <option value="">Tất cả</option>{Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></div><div className="space-y-1"><Label htmlFor="alert-severity">Mức độ</Label>
      <select id="alert-severity" className="block h-10 rounded-md border bg-background px-3" value={severity} onChange={event => update('alertSeverity', event.target.value)}>
        <option value="">Tất cả mức độ</option><option value="critical">Nghiêm trọng</option><option value="warning">Cần chú ý</option>
      </select></div>{cursor && <Button variant="outline" onClick={() => update('alertCursor', '')}>Về trang cảnh báo đầu</Button>}
    </div>
    <ControlReadState query={list}>
      {list.data?.items.length === 0 && <div className="space-y-2 rounded-panel border p-6"><p className="font-medium">Không có cảnh báo phù hợp bộ lọc.</p>
        <p className="text-sm text-muted-foreground">Đây là các cảnh báo đã được ghi nhận. Kiểm tra thêm thời điểm đo ở VPS và cụm dữ liệu để xác nhận tình trạng dịch vụ.</p></div>}
      <div className="space-y-3">{list.data?.items.map(alert => {
        const waiting = actions.pending.some(entry => entry.request.target === alert.id)
        const canAck = !alert.acknowledgedAt && !alert.resolvedAt
        return <article key={alert.id} aria-label={(names[alert.type] ?? alert.type) + ' — ' + alert.resourceId} className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-2">
            <h3 className="break-words font-semibold">{names[alert.type] ?? alert.type}</h3>
            <p className="break-all text-sm">Tài nguyên: {alert.resourceId}</p>
          </div><ControlStatus value={alert.resolvedAt ? 'good' : 'warning'}>{alert.resolvedAt ? states.resolved : alert.acknowledgedAt ? states.acknowledged : states.open}</ControlStatus></div>
          <p className="text-sm">{alert.severity === 'critical' ? 'Nghiêm trọng' : 'Cần chú ý'} · Phát hiện {controlTime(alert.openedAt)}</p>
          <p className="text-sm text-muted-foreground">Ghi nhận gần nhất: {controlTime(alert.lastSeenAt)}{alert.resolvedAt ? ` · Phục hồi: ${controlTime(alert.resolvedAt)}` : ''}</p>
          {alert.acknowledgedAt && <p className="text-sm break-all">Đã nhận lúc {controlTime(alert.acknowledgedAt)} · Người phụ trách: {alert.acknowledgedBy}</p>}
          {canAck && (formCurrent && form?.id === alert.id ? <form className="space-y-3 border-t pt-3" onSubmit={event => {
            event.preventDefault(); if (!formCurrent || waiting || actions.busy) return
            void actions.acknowledge(alert, form.reason); setForm(null)
          }}><Label htmlFor={'ack-reason-' + alert.id}>Ghi chú nhận xử lý</Label>
            <Textarea id={'ack-reason-' + alert.id} autoFocus maxLength={1000} value={form.reason} placeholder="Ví dụ: Đang kiểm tra dung lượng ổ dữ liệu"
              onChange={event => setForm({ ...form, reason: event.target.value })} />
            <p className="text-sm text-muted-foreground">Nhập từ 5 đến 1.000 ký tự. Thao tác này không mở lại nhận khách mới.</p>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!actions.enabled || actions.busy || waiting || form.reason.trim().length < 5}>Xác nhận nhận xử lý</Button>
              <Button type="button" variant="outline" onClick={() => setForm(null)}>Hủy</Button></div>
          </form> : <Button variant="outline" disabled={!actions.enabled || actions.busy || waiting} onClick={() => setForm({ id: alert.id, reason: '', scope: list.data })}>
            {waiting ? 'Đang chờ xác nhận' : 'Nhận xử lý'}</Button>)}
        </article>
      })}</div>
      {list.data?.nextCursor && <Button variant="outline" onClick={() => update('alertCursor', list.data!.nextCursor!, false)}>Trang cảnh báo tiếp</Button>}
    </ControlReadState>
  </section>
}
