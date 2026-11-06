import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useControlClusterCommands } from '@/hooks/super-admin/useControlClusterCommands'
import { clusterOperations, type ControlCluster, type ControlClusterCandidate } from '@/lib/control-admin'
import { controlTime } from '@/lib/control-admin-display'

type Operation = typeof clusterOperations[number]
const clusterOperationLabels: Record<Operation, string> = { close_admission: 'Đóng nhận khách mới', open_admission: 'Mở nhận khách mới',
  set_draining: 'Bắt đầu rút tải', set_serving: 'Chuyển sang hoạt động', update_policy: 'Đổi giới hạn không gian',
  set_host_maintenance: 'Đưa máy chủ vào bảo trì', set_host_active: 'Đưa máy chủ hoạt động lại' }
const impact: Record<Operation, string> = { close_admission: 'Dừng cấp chỗ cho đăng ký mới. Khách đang sử dụng giữ nguyên cụm và dữ liệu.',
  open_admission: 'Cho phép nhận đăng ký mới khi máy chủ kiểm lại toàn bộ điều kiện. Nếu chưa đủ sức khỏe, sức chứa hoặc backup, lệnh sẽ bị từ chối.',
  set_draining: 'Đánh dấu cụm đang rút tải và đóng nhận khách mới. Thao tác này không di chuyển hoặc xóa dữ liệu khách đang dùng.',
  set_serving: 'Đánh dấu cụm hoạt động trở lại. Cụm vẫn đóng nhận khách mới; cần kiểm tra sức khỏe rồi mở bằng thao tác riêng.',
  update_policy: 'Thay giới hạn workspace của cụm và tạm đóng nhận khách mới. Không thay ngưỡng giám sát hoặc xóa khách đã cấp. Cần số đo mới trước khi mở lại.',
  set_host_maintenance: 'Đưa máy chủ và cụm liên kết vào bảo trì, rút tải và đóng nhận khách mới. Khách đang dùng vẫn giữ dữ liệu.',
  set_host_active: 'Đưa máy chủ trở lại trạng thái hoạt động. Cụm vẫn đóng nhận khách mới cho đến khi kiểm tra sức khỏe và mở riêng.' }
const fresh = (cluster: ControlCluster) => !!cluster.health && !['unknown', 'unreachable'].includes(cluster.health.status)
  && Date.parse(cluster.health.validUntil) > Date.now()

export function ControlClusterCommands({ target, cluster, candidate, loading, onConfirmed }: {
  target: string; cluster?: ControlCluster; candidate?: ControlClusterCandidate; loading: boolean; onConfirmed: () => unknown
}) {
  const actions = useControlClusterCommands(target, onConfirmed)
  const [form, setForm] = useState<{ operation: Operation; reason: string; limit: string; snapshot: ControlCluster } | null>(null)
  const [registration, setRegistration] = useState<{ snapshot: ControlClusterCandidate; reason: string } | null>(null)
  const registrationReason = registration && registration.snapshot === candidate ? registration.reason : ''
  const currentForm = form && form.snapshot === cluster ? form : null
  const waiting = actions.pending.some(entry => entry.request.target === target)
  const unavailable = !actions.enabled || loading || actions.busy || waiting
  const preflightBlocked = !!candidate && candidate.environment !== 'local' && !candidate.preflightReady
  const prohibited = (operation: Operation) => !cluster || (operation === 'open_admission' && (!fresh(cluster) || cluster.status !== 'active' || cluster.admission.decision === 'open'))
    || (operation === 'close_admission' && cluster.admission.decision === 'manual_closed')
    || (operation === 'set_draining' && cluster.status === 'draining') || (operation === 'set_serving' && cluster.status === 'active')
    || (operation === 'set_host_maintenance' && cluster.hostStatus !== 'active')
    || (operation === 'set_host_active' && cluster.hostStatus !== 'maintenance')
  const validLimit = !!currentForm && /^\d{1,7}$/.test(currentForm.limit) && Number(currentForm.limit) >= 1 && Number(currentForm.limit) <= 1000000
  return <section aria-label="Thao tác cụm dữ liệu" className="space-y-4">
    {actions.busy && <p role="status">Đang xác nhận lệnh với máy chủ…</p>}
    {actions.message && <div role={actions.receipt ? 'status' : 'alert'} className="space-y-2 rounded-lg border p-4 text-sm">
      <p>{actions.message}</p>{actions.supportId && <p>Mã hỗ trợ: {actions.supportId}</p>}
      {actions.receipt && <p>Cụm {actions.receipt.result.id} · Phiên bản đã ghi {actions.receipt.targetVersion}</p>}
      {!actions.enabled && <Button variant="outline" onClick={actions.refresh}>Kiểm tra bộ nhớ trình duyệt</Button>}
    </div>}
    {actions.pending.length > 0 && <section aria-label="Lệnh cụm cần xác nhận" className="space-y-3 rounded-lg border border-amber-700 p-4">
      <h2 className="font-semibold">Lệnh cần xác nhận kết quả</h2>
      {actions.pending.map(entry => <article key={entry.request.key} className="space-y-3 border-t pt-3 text-sm">
        <p className="break-words font-medium">{entry.request.target} · {entry.request.operation === 'register_cluster' ? 'Thêm cụm đã chuẩn bị' : entry.request.operation === 'queue_deployment' ? 'Đưa triển khai vào hàng đợi' : clusterOperationLabels[entry.request.operation]}</p>
        <p>{entry.state === 'not_applied' ? 'Lệnh chưa được áp dụng.' : 'Chưa rõ kết quả. Không bắt đầu lệnh khác cho cụm này.'}</p>
        <p className="break-words">Lý do: {entry.request.reason}</p>
        <details><summary className="cursor-pointer">Thông tin yêu cầu</summary><p className="mt-2 break-all">Mã yêu cầu: {entry.request.key}<br />Lập lúc {controlTime(entry.createdAt)} · Phiên bản {entry.request.expectedVersion}</p></details>
        <div className="flex flex-wrap gap-2">{entry.state === 'not_applied'
          ? <Button variant="outline" disabled={!actions.enabled || actions.busy} onClick={() => void actions.dismiss(entry)}>Đóng yêu cầu và tải lại cụm</Button>
          : <><Button variant="outline" disabled={!actions.enabled || actions.busy} onClick={() => void actions.lookup(entry)}>Kiểm tra kết quả lệnh</Button>
            {actions.absentKey === entry.request.key && <Button disabled={!actions.enabled || actions.busy} onClick={() => void actions.retry(entry)}>Gửi lại cùng lệnh</Button>}</>}
        </div>
      </article>)}
    </section>}
    {candidate && <form aria-label="Thêm cụm đã chuẩn bị" className="space-y-3 border p-4" onSubmit={event => {
      event.preventDefault()
      if (unavailable || registrationReason.trim().length < 5) return
      void actions.execute({ target: candidate.id, operation: 'register_cluster', expectedVersion: 1, reason: registrationReason,
        payload: { hostId: candidate.hostId, backendKind: candidate.backendKind, endpointRef: candidate.endpointRef, credentialRef: candidate.credentialRef } })
      setRegistration(null)
    }}>
      <h3 className="font-semibold">Thêm cụm {candidate.id} trên {candidate.hostName}</h3>
      <p className="text-sm">Ghi nhận máy chủ và cụm đã được chuẩn bị trong cấu hình hệ thống. Cụm mới chờ kiểm tra và đóng nhận khách; thao tác này chưa cài đặt phần mềm lên VPS.</p>
      {!candidate.credentialConfigured && <p className="text-sm font-medium text-amber-800">Chưa có cấu hình kết nối bảo mật. Có thể lưu bản nháp, chưa thể phục vụ khách.</p>}
      {preflightBlocked && <p className="text-sm font-medium text-amber-800">Chưa có preflight SSH hợp lệ trong 24 giờ qua hoặc máy chưa đủ tài nguyên. Cần kiểm tra lại trước khi thêm cụm staging/production.</p>}
      <Label htmlFor="register-cluster-reason">Lý do thêm cụm</Label>
      <Textarea id="register-cluster-reason" maxLength={1000} value={registrationReason}
        onChange={event => setRegistration({ snapshot: candidate, reason: event.target.value })} />
      <Button type="submit" disabled={unavailable || preflightBlocked || registrationReason.trim().length < 5}>Xác nhận thêm cụm</Button>
    </form>}
    {cluster && <div className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Quản lý cụm {cluster.id}</h2>
      <p className="text-sm text-muted-foreground">Các thao tác dưới đây điều chỉnh việc tiếp nhận khách mới. Mỗi lệnh cần lý do và được lưu lịch sử.</p>
      {!fresh(cluster) && <p className="text-sm">Chưa có số đo sức khỏe hợp lệ để mở nhận khách mới. Vẫn có thể đóng nhận khách hoặc rút tải.</p>}
      <div className="flex flex-wrap gap-2">{clusterOperations.map(operation => <Button key={operation} variant="outline"
        disabled={unavailable || prohibited(operation)} onClick={() => setForm({ operation, reason: '', limit: String(cluster.tenantLimit), snapshot: cluster })}>
        {clusterOperationLabels[operation]}</Button>)}</div>
      {currentForm && <form className="space-y-3 border-t pt-4" onSubmit={event => {
        event.preventDefault()
        if (unavailable || prohibited(currentForm.operation) || currentForm.reason.trim().length < 5 || (currentForm.operation === 'update_policy' && !validLimit)) return
        void actions.execute({ target: cluster.id, operation: currentForm.operation, expectedVersion: cluster.rowVersion, reason: currentForm.reason,
          payload: currentForm.operation === 'update_policy' ? { tenantLimit: Number(currentForm.limit) } : {} })
        setForm(null)
      }}>
        <h3 className="font-semibold">Xác nhận: {clusterOperationLabels[currentForm.operation]}</h3>
        <p className="text-sm">{impact[currentForm.operation]}</p>
        <p className="text-sm text-muted-foreground">Cụm {cluster.id} · Phiên bản {cluster.rowVersion} · Đã cấp {cluster.allocatedCount}/{cluster.tenantLimit} workspace</p>
        {currentForm.operation === 'update_policy' && <div className="space-y-2"><Label htmlFor="cluster-limit">Giới hạn workspace mới</Label>
          <Input id="cluster-limit" type="number" min={1} max={1000000} step={1} value={currentForm.limit} onChange={event => setForm({ ...currentForm, limit: event.target.value })} />
          {validLimit && Number(currentForm.limit) <= cluster.allocatedCount && <p className="text-sm">Giới hạn không còn chỗ trống cho khách mới. Các workspace đã cấp được giữ nguyên.</p>}
        </div>}
        <Label htmlFor="cluster-command-reason">Lý do thao tác cụm</Label>
        <Textarea id="cluster-command-reason" autoFocus maxLength={1000} value={currentForm.reason} onChange={event => setForm({ ...currentForm, reason: event.target.value })} />
        <p className="text-sm text-muted-foreground">Nhập từ 5 đến 1.000 ký tự.</p>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={unavailable || prohibited(currentForm.operation) || currentForm.reason.trim().length < 5
          || (currentForm.operation === 'update_policy' && !validLimit)}>Xác nhận thao tác cụm</Button>
          <Button type="button" variant="outline" onClick={() => setForm(null)}>Hủy thao tác</Button></div>
      </form>}
    </div>}
  </section>
}
