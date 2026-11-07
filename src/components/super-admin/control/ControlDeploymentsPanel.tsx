import { useEffect, useState } from 'react'
import { ControlDeploymentQueue } from './ControlDeploymentQueue'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ControlClusterInput } from './ControlClusterInput'
import { Label } from '@/components/ui/label'
import { controlAdminClient, useControlAdmin } from '@/hooks/super-admin/useControlAdmin'
import { controlTime } from '@/lib/control-admin-display'
import { ControlReadState, ControlStatus } from './ControlReadState'
import type { ControlDeployment } from '@/lib/control-admin'

const states = { running: 'Đang triển khai', deployed: 'Đã triển khai', blocked: 'Chưa đủ điều kiện', not_started: 'Chưa khởi chạy',
  rolled_back: 'Đã quay về bản trước', rollback_failed: 'Lỗi khôi phục — cần kiểm tra', outcome_unknown: 'Chưa xác nhận kết quả' }
const phases = { preflight: 'Kiểm tra trước triển khai', stage_release: 'Chuẩn bị bản cài', validate_compose: 'Kiểm tra cấu hình',
  start_release: 'Khởi chạy dịch vụ', health_gate: 'Kiểm tra dịch vụ', commit_release: 'Xác nhận bản cài' }
const gateReasons: Record<string, string> = {
  DEPLOYMENT_SPEC_UNAVAILABLE: 'Bản triển khai không còn hợp lệ hoặc đã hết hạn. Cần chuẩn bị lại bản cài.',
  DEPLOYMENT_TARGET_NOT_READY: 'Máy chủ hoặc cụm đích chưa sẵn sàng. Kiểm tra liên kết và trạng thái máy.',
  DEPLOYMENT_ADMISSION_OPEN: 'Cần đóng nhận khách mới trước khi triển khai.',
  DEPLOYMENT_RELEASE_NOT_APPROVED: 'Phê duyệt bản cài không còn hiệu lực hoặc không khớp máy đích.',
  DEPLOYMENT_SCHEMA_UNVERIFIED: 'Chưa có kiểm tra cấu trúc dữ liệu tương thích còn hiệu lực.',
  DEPLOYMENT_ARTIFACT_MISMATCH: 'Bộ phần mềm chuẩn bị cài không khớp bản đã duyệt.',
  DEPLOYMENT_BACKUP_UNVERIFIED: 'Chưa có bản sao lưu và kết quả thử khôi phục đạt yêu cầu.',
  VPS_DEPLOY_PRODUCTION_GATES_REQUIRED: 'Chưa mở triển khai vào môi trường phục vụ khách thực tế.',
}
function DeploymentRecord({ run }: { run: ControlDeployment }) {
  const resolution = run.resolution
  return <article aria-label={'Lần triển khai ' + run.id} className="space-y-3 rounded-panel border p-4">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="break-all font-semibold">{run.releaseId}</h3>
      <p className="mt-1 break-all text-sm">Cụm {run.clusterId} · Máy chủ {run.hostId}</p></div>
      <ControlStatus value={resolution?.outcome === 'empty' ? 'neutral' : resolution || run.state === 'deployed' ? 'good' : 'warning'}>{resolution ? 'Đã đối soát kết quả' : states[run.state]}</ControlStatus></div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Bước gần nhất</dt><dd className="mt-1 font-medium">{phases[run.phase]}</dd></div>
      <div><dt className="text-muted-foreground">Cập nhật gần nhất</dt><dd className="mt-1 font-medium">{controlTime(run.updatedAt)}</dd></div>
    </dl>
    {run.lastGate && <div className="space-y-1 border-t pt-3 text-sm"><p className="font-medium">Kiểm tra trước bước: {phases[run.lastGate.phase]}</p>
      <p>{run.lastGate.mode === 'local_test' ? 'Môi trường thử nghiệm local; chưa kiểm điều kiện triển khai staging/production.'
        : run.lastGate.decision === 'ready' ? 'Hồ sơ kiểm tra tại hệ thống điều phối đạt yêu cầu: đã đóng nhận khách, bản cài được duyệt, dữ liệu tương thích và có sao lưu hợp lệ.' : 'Chưa đủ điều kiện triển khai.'}</p>
      <p className="text-muted-foreground">Kiểm tra lúc {controlTime(run.lastGate.observedAt)}</p>
      {run.lastGate.reasons.length > 0 && <ul className="list-inside list-disc text-amber-800">{run.lastGate.reasons.map(reason => <li key={reason}>{gateReasons[reason] ?? `Cần kiểm tra: ${reason}`}</li>)}</ul>}
    </div>}
    {resolution && <p className="text-sm font-medium">{resolution.outcome === 'candidate_healthy' ? 'Đối soát xác nhận bản mới chạy tốt tại thời điểm kiểm tra.'
      : resolution.outcome === 'previous_healthy' ? 'Đối soát xác nhận bản trước chạy tốt tại thời điểm kiểm tra.' : 'Khi đối soát, chưa có dịch vụ của cụm đang chạy.'}</p>}
    {!resolution && run.state === 'running' && <p className="text-sm">Chưa có kết quả cuối. Tải lại để xem tiến độ; nếu ngừng cập nhật, cần đối chiếu máy chủ trước khi chạy lại.</p>}
    {!resolution && ['outcome_unknown', 'rollback_failed'].includes(run.state) && <p role="alert" className="text-sm font-medium">Cần kiểm tra bản đang chạy và khóa triển khai. Hệ thống chặn lượt mới trên cụm này.</p>}
    <details className="border-t pt-3 text-sm"><summary className="cursor-pointer font-medium">Thông tin đối chiếu</summary>
      <dl className="mt-3 space-y-2 break-all"><div><dt className="text-muted-foreground">Mã triển khai</dt><dd>{run.id}</dd></div>
        <div><dt className="text-muted-foreground">Môi trường</dt><dd>{run.environment === 'local' ? 'Thử nghiệm local' : run.environment === 'staging' ? 'Thử nghiệm VPS' : 'Vận hành thật'}</dd></div>
        <div><dt className="text-muted-foreground">Mã kiểm tra cấu hình</dt><dd>{run.composeSha256}</dd></div>
        <div><dt className="text-muted-foreground">Bắt đầu</dt><dd>{controlTime(run.createdAt)}</dd></div>
        <div><dt className="text-muted-foreground">Kết thúc</dt><dd>{run.finishedAt ? controlTime(run.finishedAt) : 'Chưa ghi nhận'}</dd></div>
        {resolution && <><div><dt className="text-muted-foreground">Kết quả ban đầu</dt><dd>{states[run.state]}</dd></div>
          <div><dt className="text-muted-foreground">Đối soát lúc</dt><dd>{controlTime(resolution.observedAt)}</dd></div>
          <div><dt className="text-muted-foreground">Bản đang chạy khi đối soát</dt><dd>{resolution.currentReleaseId ?? 'Chưa có bản đang chạy'}</dd></div>
          <div><dt className="text-muted-foreground">Mã biên nhận đối soát</dt><dd>{resolution.id}</dd></div></>}
        {run.errorCode && <div><dt className="text-muted-foreground">Mã lỗi</dt><dd>{run.errorCode}</dd></div>}</dl></details>
  </article>
}
export function ControlDeploymentsPanel({ onReady }: { onReady: (ready: boolean) => void }) {
  const [params, setParams] = useSearchParams()
  const clusterId = params.get('deployCluster') ?? '', state = params.get('deployState') ?? '', cursor = params.get('deployCursor') ?? ''
  const [input, setInput] = useState(clusterId)
  useEffect(() => setInput(clusterId), [clusterId])
  const list = useControlAdmin(['deployments', clusterId, state, cursor],
    (actor, options) => controlAdminClient.deployments(actor, { clusterId, state, cursor }, options))
  useEffect(() => { onReady(!!list.data && !list.isFetching) }, [list.data, list.isFetching, onReady])
  const update = (key: string, value: string, reset = true) => {
    const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key)
    if (reset) next.delete('deployCursor'); setParams(next)
  }
  return <section aria-label="Lịch sử triển khai" className="space-y-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">Triển khai và cập nhật</h2>
      <p className="mt-1 text-sm text-muted-foreground">Gửi yêu cầu triển khai bản cài đã duyệt và theo dõi tiến độ, kết quả.</p></div>
      <Button variant="outline" disabled={!list.enabled || list.isFetching} onClick={() => void list.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tải lại triển khai</Button></div>
    <ControlDeploymentQueue onChanged={() => list.refetch()} />
    <div className="flex flex-wrap items-end gap-3">
      <form className="flex max-w-full flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); update('deployCluster', input.trim()) }}>
        <div className="space-y-1"><Label htmlFor="deploy-cluster">Mã cụm triển khai</Label>
          <ControlClusterInput id="deploy-cluster" value={input} onChange={setInput} /></div>
        <Button variant="outline" type="submit">Lọc triển khai</Button></form>
      <div className="space-y-1"><Label htmlFor="deploy-state">Tình trạng triển khai</Label>
        <select id="deploy-state" className="block h-10 max-w-full rounded-control border bg-background px-3" value={state} onChange={event => update('deployState', event.target.value)}>
          <option value="">Tất cả tình trạng</option>{Object.entries(states).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></div>
      {cursor && <Button variant="outline" onClick={() => update('deployCursor', '')}>Về trang triển khai đầu</Button>}
    </div>
    <ControlReadState query={list}>
      {list.data?.items.length === 0 && <div className="space-y-2 rounded-panel border p-6"><p className="font-medium">Chưa có lượt triển khai được ghi nhận phù hợp bộ lọc.</p>
        <p className="text-sm text-muted-foreground">Xem yêu cầu triển khai phía trên. Nếu chưa có bản cài, cần chuẩn bị và duyệt bản cài trên máy vận hành.</p></div>}
      <div className="grid gap-3">{list.data?.items.map(run => <DeploymentRecord key={run.id} run={run} />)}</div>
      {list.data?.nextCursor && <Button variant="outline" onClick={() => update('deployCursor', list.data!.nextCursor!, false)}>Trang triển khai tiếp</Button>}
    </ControlReadState>
  </section>
}
