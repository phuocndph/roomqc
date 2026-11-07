import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { controlAdminClient, useControlAdmin } from '@/hooks/super-admin/useControlAdmin'
import { useControlClusterCommands } from '@/hooks/super-admin/useControlClusterCommands'
import { ControlReadState } from './ControlReadState'
import { controlTime } from '@/lib/control-admin-display'

const states = { queued: 'Đang chờ thực thi', running: 'Đang triển khai', succeeded: 'Đã hoàn tất', failed: 'Không hoàn tất', needs_review: 'Cần đối soát trước khi chạy tiếp' }

export function ControlDeploymentQueue({ onChanged }: { onChanged: () => unknown }) {
  const [selected, setSelected] = useState(''), [reason, setReason] = useState(''), [cursor, setCursor] = useState(''), [specCursor, setSpecCursor] = useState('')
  const specs = useControlAdmin(['deployment-specs', specCursor], (actor, options) => controlAdminClient.deploymentSpecs(actor, { cursor: specCursor }, options))
  const jobs = useControlAdmin(['deployment-jobs', cursor], (actor, options) => controlAdminClient.deploymentJobs(actor, { cursor }, options))
  const spec = specs.data?.items.find(item => item.id === selected)
  const cluster = useControlAdmin(['deployment-cluster', spec?.clusterId ?? ''], (actor, options) => controlAdminClient.cluster(actor, spec!.clusterId, options), !!spec)
  const actions = useControlClusterCommands(spec?.clusterId ?? '', () => { void jobs.refetch(); void cluster.refetch(); onChanged() })
  const active = jobs.data?.items.some(job => job.clusterId === spec?.clusterId && ['queued', 'running', 'needs_review'].includes(job.state))
  const waiting = actions.pending.some(entry => entry.request.target === spec?.clusterId)
  const ready = !!spec && !!cluster.data && cluster.data.id === spec.clusterId && !cluster.isFetching && !specs.isFetching
    && cluster.data.admission.decision === 'manual_closed' && cluster.data.hostId === spec.hostId && cluster.data.hostStatus === 'active'
    && Date.parse(spec.expiresAt) > Date.now() && !active && !waiting && actions.enabled && !actions.busy
  const polling = jobs.data?.items.some(job => ['queued', 'running'].includes(job.state))
  const reload = useRef(() => {}); reload.current = () => { void jobs.refetch(); onChanged() }
  useEffect(() => {
    if (!jobs.enabled || !polling || cursor) return
    const timer = setInterval(() => reload.current(), 10000)
    return () => clearInterval(timer)
  }, [jobs.enabled, polling, cursor])

  return <section aria-label="Hàng đợi triển khai" className="space-y-4 border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">Yêu cầu triển khai</h3>
      <p className="mt-1 text-sm text-muted-foreground">Chọn bản cài đã được người vận hành chuẩn bị. Bộ thực thi riêng sẽ nhận lệnh; trang này không giữ khóa kết nối VPS.</p></div>
      <Button variant="outline" disabled={!jobs.enabled || jobs.isFetching} onClick={() => { void jobs.refetch(); void specs.refetch(); onChanged() }}>Tải lại hàng đợi</Button></div>
    <ControlReadState query={specs}>
      {specs.data?.items.length === 0 ? <p className="text-sm">Chưa có bản cài được duyệt còn hạn. Cần chuẩn bị bản cài trên máy vận hành trước. Hiện chưa mở triển khai production.</p>
        : <form className="grid gap-3" onSubmit={event => {
          event.preventDefault()
          if (!ready || !spec || !cluster.data || reason.trim().length < 5) return
          void actions.execute({ target: spec.clusterId, operation: 'queue_deployment', expectedVersion: cluster.data.rowVersion,
            reason, payload: { specId: spec.id, executionSha256: spec.executionSha256 } })
          setReason('')
        }}>
          <div className="space-y-1"><Label htmlFor="deployment-spec">Bản cài và cụm đích</Label>
            <select id="deployment-spec" className="block min-h-10 w-full rounded-control border bg-background px-3" value={selected}
              onChange={event => { setSelected(event.target.value); setReason('') }} disabled={actions.busy}>
              <option value="">Chọn bản cài đã duyệt</option>{specs.data?.items.map(item => <option key={item.id} value={item.id}>
                {item.clusterId} · {item.releaseId} · {item.environment === 'local' ? 'Thử nghiệm local' : 'Kiểm thử staging'}</option>)}</select></div>
          {spec && <><p className="text-sm">Máy {spec.hostId} · Có hiệu lực đến {controlTime(spec.expiresAt)}</p>
            <ControlReadState query={cluster}>{cluster.data && cluster.data.admission.decision !== 'manual_closed' && <p className="text-sm text-amber-800">Cần đóng nhận khách mới ở chi tiết cụm trước khi triển khai.</p>}</ControlReadState>
            <Label htmlFor="deployment-reason">Lý do triển khai</Label><Textarea id="deployment-reason" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} />
            <p className="text-sm text-muted-foreground">Có thể khởi động lại dịch vụ của cụm đã chọn. Kết quả nhận lệnh chỉ xác nhận đã vào hàng đợi; theo dõi trạng thái bên dưới.</p>
            <Button className="justify-self-start" type="submit" disabled={!ready || reason.trim().length < 5}>Đưa triển khai vào hàng đợi</Button></>}
        </form>}
      <div className="flex flex-wrap gap-2">{specCursor && <Button variant="outline" onClick={() => { setSpecCursor(''); setSelected('') }}>Trang bản cài đầu</Button>}
        {specs.data?.nextCursor && <Button variant="outline" onClick={() => { setSpecCursor(specs.data!.nextCursor!); setSelected('') }}>Bản cài tiếp</Button>}</div>
    </ControlReadState>
    {actions.message && <p role={actions.receipt ? 'status' : 'alert'} className="break-words text-sm">{actions.receipt ? 'Đã xác nhận nhận lệnh. Xem hàng đợi để biết kết quả triển khai.' : actions.message}
      {actions.supportId && ` Mã hỗ trợ: ${actions.supportId}`}</p>}
    {actions.pending.map(entry => <div key={entry.request.key} className="space-y-2 border border-amber-700 p-3 text-sm">
      <p>Cụm {entry.request.target}: {entry.state === 'not_applied' ? 'lệnh chưa được áp dụng.' : 'chưa rõ kết quả nhận lệnh. Giữ nguyên yêu cầu để kiểm tra.'}</p>
      <p className="break-all">Mã yêu cầu: {entry.request.key}</p><div className="flex flex-wrap gap-2">
        {entry.state === 'not_applied' ? <Button variant="outline" disabled={!actions.enabled || actions.busy} onClick={() => void actions.dismiss(entry)}>Đóng yêu cầu đã bị từ chối</Button>
          : <><Button variant="outline" disabled={!actions.enabled || actions.busy} onClick={() => void actions.lookup(entry)}>Kiểm tra kết quả nhận lệnh</Button>
            {actions.absentKey === entry.request.key && <Button disabled={!actions.enabled || actions.busy} onClick={() => void actions.retry(entry)}>Gửi lại cùng yêu cầu</Button>}</>}
      </div></div>)}
    {!actions.enabled && <Button variant="outline" onClick={actions.refresh}>Kiểm tra khả năng gửi lệnh</Button>}
    <ControlReadState query={jobs}>
      {jobs.data?.items.length === 0 && <p className="text-sm text-muted-foreground">Chưa có yêu cầu triển khai từ trang quản trị.</p>}
      {jobs.data?.items.map(job => <article key={job.id} className="space-y-1 border-t pt-3 text-sm">
        <p className="font-semibold">{job.clusterId} · {job.releaseId}</p><p>{states[job.state]}</p>
        {job.errorCode && <p className="break-all text-amber-800">Mã xử lý: {job.errorCode}</p>}
        <p className="text-muted-foreground">Cập nhật: {controlTime(job.updatedAt)}</p>
        {job.state === 'queued' && <p className="text-muted-foreground">Đang chờ bộ thực thi nhận lệnh. Nếu chờ lâu, kiểm tra bộ thực thi trên máy vận hành.</p>}
        {job.state === 'needs_review' && <p>Không gửi lại triển khai. Người vận hành cần đối soát lượt chạy cũ trước.</p>}
        <details><summary className="cursor-pointer">Thông tin theo dõi</summary><p className="mt-1 break-all">Công việc: {job.id}<br />Lượt triển khai: {job.runId ?? 'Chưa bắt đầu'}</p></details>
      </article>)}
      <div className="flex flex-wrap gap-2">{cursor && <Button variant="outline" onClick={() => setCursor('')}>Trang hàng đợi đầu</Button>}
        {jobs.data?.nextCursor && <Button variant="outline" onClick={() => setCursor(jobs.data!.nextCursor!)}>Hàng đợi tiếp</Button>}</div>
    </ControlReadState>
  </section>
}
