import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bell, Database, HardDrive, RefreshCw, Rocket, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { controlAdminClient, useControlAdmin } from '@/hooks/super-admin/useControlAdmin'
import type { ControlCluster } from '@/lib/control-admin'
import { ControlReadState, ControlStatus } from '@/components/super-admin/control/ControlReadState'
import { controlTime } from '@/lib/control-admin-display'
import { useControlScroll } from '@/hooks/super-admin/useControlScroll'
import { ControlAlertsPanel } from '@/components/super-admin/control/ControlAlertsPanel'
import { ControlClusterCommands } from '@/components/super-admin/control/ControlClusterCommands'
import { ControlBackupsPanel } from '@/components/super-admin/control/ControlBackupsPanel'
import { ControlHostsPanel } from '@/components/super-admin/control/ControlHostsPanel'
import { ControlDeploymentsPanel } from '@/components/super-admin/control/ControlDeploymentsPanel'
import { ControlInfrastructureOverview } from '@/components/super-admin/control/ControlInfrastructureOverview'
import { ControlResourceMeter } from '@/components/super-admin/control/ControlResourceMeter'
import { useControlAutoRefresh } from '@/hooks/super-admin/useControlAutoRefresh'

const admissionText = { open: 'Đang nhận khách mới', blocked: 'Tạm chặn nhận khách', manual_closed: 'Đã đóng nhận khách' }
const stateText = { active: 'Hoạt động', draining: 'Đang rút tải', offline: 'Ngừng hoạt động' }
const healthText = { healthy: 'Bình thường', degraded: 'Cần chú ý', unreachable: 'Mất kết nối', unknown: 'Chưa xác nhận' }
const percent = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%'
const currentHealth = (cluster: ControlCluster) => !!cluster.health && ['healthy', 'degraded'].includes(cluster.health.status) && Date.parse(cluster.health.validUntil) > Date.now()
const metricPercent = (value: number | null | undefined) => typeof value === 'number' ? percent(value) : 'Chưa xác nhận'
const ratio = (used: number | null | undefined, total: number | null | undefined) =>
  typeof used === 'number' && typeof total === 'number' && total > 0 && used <= total ? percent(used / total * 100) : 'Chưa xác nhận'
const admissionLabel = (cluster: ControlCluster) => cluster.admission.decision === 'open' && !currentHealth(cluster)
  ? 'Cần tải lại số đo' : admissionText[cluster.admission.decision]

function ClusterDetail({ cluster }: { cluster: ControlCluster }) {
  const health = cluster.health, fresh = currentHealth(cluster)
  const metrics = fresh ? health.metrics : null
  const rows = [
    ['Máy chủ liên kết', cluster.hostId || 'Chưa liên kết máy chủ'], ['Trạng thái máy chủ', cluster.hostStatus === 'active' ? 'Hoạt động' : cluster.hostStatus === 'maintenance' ? 'Đang bảo trì' : cluster.hostStatus === 'retired' ? 'Đã ngừng sử dụng' : 'Chưa liên kết'],
    ['Thời điểm đo', controlTime(health?.observedAt)], ['Số đo có hiệu lực đến', controlTime(health?.validUntil)],
  ]
  const usedPercent = (available: number | null | undefined, total: number | null | undefined) =>
    typeof available === 'number' && typeof total === 'number' && total > 0 && available <= total ? (total - available) / total * 100 : null
  return <section aria-label={'Chi tiết cụm ' + cluster.id} className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold break-all">Cụm {cluster.id}</h2>
      <span className="text-sm text-muted-foreground">{stateText[cluster.status]}</span></div>
    <dl className="grid gap-3 sm:grid-cols-3">
      <div className="border p-3"><dt className="text-sm text-muted-foreground">Sức khỏe dịch vụ</dt>
        <dd className={'mt-1 font-semibold ' + (fresh && health?.status === 'healthy' ? 'text-green-800 dark:text-green-300' : fresh ? 'text-amber-800 dark:text-amber-300' : '')}>{health ? fresh ? healthText[health.status] : 'Số đo đã cũ hoặc chưa xác nhận' : 'Chưa có số đo'}</dd></div>
      <div className="border p-3"><dt className="text-sm text-muted-foreground">Nhận khách mới</dt><dd className="mt-1 font-semibold">{admissionLabel(cluster)}</dd></div>
      <div className="border p-3"><dt className="text-sm text-muted-foreground">Không gian đã cấp / giới hạn</dt><dd className="mt-1 font-semibold tabular-nums">{cluster.allocatedCount} / {cluster.tenantLimit}</dd></div>
    </dl>
    {!fresh && <p className="border-l-4 border-amber-600 pl-3 text-sm">Chưa xác nhận được sức khỏe dịch vụ. Cần kiểm tra bộ giám sát trước khi quyết định mở nhận khách.</p>}
    <section aria-label="Tài nguyên cụm" className="space-y-3 border p-4"><h3 className="font-semibold">Tài nguyên dịch vụ</h3>
      <dl className="grid gap-4 min-[440px]:grid-cols-3">
        <ControlResourceMeter label="CPU đang dùng" percent={metrics?.cpuUsedPercent ?? null} value={metricPercent(metrics?.cpuUsedPercent)} />
        <ControlResourceMeter label="RAM đang dùng" percent={usedPercent(metrics?.memoryAvailableBytes, metrics?.memoryTotalBytes)}
          value={metricPercent(usedPercent(metrics?.memoryAvailableBytes, metrics?.memoryTotalBytes))} detail={'Còn trống: ' + ratio(metrics?.memoryAvailableBytes, metrics?.memoryTotalBytes)} />
        <ControlResourceMeter label="Ổ dữ liệu đang dùng" percent={usedPercent(metrics?.dataDiskFreeBytes, metrics?.dataDiskTotalBytes)}
          value={metricPercent(usedPercent(metrics?.dataDiskFreeBytes, metrics?.dataDiskTotalBytes))} detail={'Còn trống: ' + ratio(metrics?.dataDiskFreeBytes, metrics?.dataDiskTotalBytes)} />
      </dl>
      <p className="border-t pt-3 text-sm">Kết nối database / ngân sách: <strong>{typeof metrics?.dbConnectionsUsed === 'number' && typeof metrics?.dbConnectionBudget === 'number'
        ? `${metrics.dbConnectionsUsed} / ${metrics.dbConnectionBudget}` : 'Chưa xác nhận'}</strong></p>
    </section>
    <details className="border p-3"><summary className="cursor-pointer text-sm font-medium">Kết nối và thông tin kỹ thuật</summary>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}>
        <dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium break-words">{value}</dd>
      </div>)}</dl>
    {fresh && health.dataDisks && <div className="mt-3 space-y-2"><h4 className="font-semibold">Từng ổ dữ liệu</h4>
      {health.dataDisks.map(disk => <p key={disk.id} className="break-words rounded-lg border p-3 text-sm">{disk.id}: còn {percent(disk.freeBytes / disk.totalBytes * 100)} dung lượng · còn {percent(disk.inodeFreePercent)} inode</p>)}
    </div>}
    </details>
    {cluster.admission.reasonCodes.length > 0 && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Lý do chưa nhận khách mới</summary>
      <ul className="mt-3 list-inside list-disc text-sm break-all">{cluster.admission.reasonCodes.map(code => <li key={code}>{code}</li>)}</ul>
    </details>}
    {health?.measurementScope === 'docker-desktop-vm' && <p className="text-sm text-muted-foreground">Số đo từ môi trường Docker Desktop; chưa dùng để xác định sức chứa VPS.</p>}
  </section>
}

export function InfrastructurePage() {
  const [params, setParams] = useSearchParams(), status = params.get('status') || '', cursor = params.get('cursor') || ''
  const alertsView = params.get('view') === 'alerts', searchKey = params.toString()
  const backupsView = params.get('view') === 'backups', hostsView = params.get('view') === 'hosts', deploymentsView = params.get('view') === 'deployments'
  const secondaryView = alertsView || backupsView || hostsView || deploymentsView
  const [alertReady, setAlertReady] = useState({ key: '', ready: false })
  const ready = useCallback((value: boolean) => setAlertReady({ key: searchKey, ready: value }), [searchKey])
  const target = params.get('cluster') || ''
  const returnView = params.get('returnView') || ''
  const returnNames: Record<string, string> = { hosts: 'máy chủ', alerts: 'cảnh báo', backups: 'sao lưu', deployments: 'triển khai' }
  const list = useControlAdmin(['clusters', status, cursor], (actor, options) => controlAdminClient.clusters(actor, { status, cursor }, options), !target && !secondaryView)
  const detail = useControlAdmin(['cluster', target], (actor, options) => controlAdminClient.cluster(actor, target, options), !!target && !secondaryView)
  const active = target ? detail : list
  useControlAutoRefresh(active, 60_000)
  const root = useControlScroll(secondaryView ? alertReady.key === searchKey && alertReady.ready : !!active.data && !active.isFetching)
  const [clock, tick] = useState(0)
  const expirations = [...(list.data?.items ?? []).map(cluster => cluster.health?.validUntil), detail.data?.health?.validUntil].filter(Boolean).join(',')
  useEffect(() => {
    const next = Math.min(...expirations.split(',').map(Date.parse).filter(time => time > Date.now()))
    if (!Number.isFinite(next)) return
    const timeout = setTimeout(() => tick(value => value + 1), Math.min(2147483647, Math.max(1, next - Date.now() + 1)))
    return () => clearTimeout(timeout)
  }, [expirations, clock])
  const update = (key: string, value: string, resetPage = false) => {
    const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key)
    if (resetPage) next.delete('cursor'); setParams(next)
  }
  const switchView = (view: string) => {
    const next = new URLSearchParams(params)
    for (const key of ['cluster', 'returnView', 'action', 'candidate', 'candidateCursor']) next.delete(key)
    if (view) next.set('view', view); else next.delete('view')
    setParams(next)
  }
  return <div ref={root} className="mx-auto max-w-6xl space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Hạ tầng</h1>
      <p className="mt-1 text-sm text-muted-foreground">Theo dõi máy chủ, dịch vụ và khả năng nhận khách.</p></div>
      {!secondaryView && <Button variant="outline" disabled={!active.enabled || active.isFetching} onClick={() => void active.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tải lại</Button>}
    </div>
    <ControlInfrastructureOverview />
    <nav aria-label="Nội dung hạ tầng" className="grid grid-cols-3 gap-1 border-b pb-3 [&>button]:px-2 [&>button]:text-xs sm:flex sm:flex-wrap sm:[&>button]:px-3 sm:[&>button]:text-sm">
      <Button size="sm" variant={hostsView ? 'default' : 'ghost'} aria-pressed={hostsView} onClick={() => switchView('hosts')}><Server className="mr-1.5 h-4 w-4" />Máy chủ VPS</Button>
      <Button size="sm" variant={secondaryView ? 'ghost' : 'default'} aria-pressed={!secondaryView} onClick={() => switchView('')}><Database className="mr-1.5 h-4 w-4" />Cụm dữ liệu</Button>
      <Button size="sm" variant={alertsView ? 'default' : 'ghost'} aria-pressed={alertsView} onClick={() => switchView('alerts')}><Bell className="mr-1.5 h-4 w-4" />Cảnh báo</Button>
      <Button size="sm" variant={backupsView ? 'default' : 'ghost'} aria-pressed={backupsView} onClick={() => switchView('backups')}><HardDrive className="mr-1.5 h-4 w-4" />Sao lưu</Button>
      <Button size="sm" variant={deploymentsView ? 'default' : 'ghost'} aria-pressed={deploymentsView} onClick={() => switchView('deployments')}><Rocket className="mr-1.5 h-4 w-4" />Triển khai</Button>
    </nav>
    {deploymentsView ? <ControlDeploymentsPanel onReady={ready} /> : hostsView ? <ControlHostsPanel onReady={ready} /> : backupsView ? <ControlBackupsPanel onReady={ready} /> : alertsView ? <ControlAlertsPanel onReady={ready} /> : target ? <><Button variant="outline" onClick={() => {
      const next = new URLSearchParams(params); next.delete('cluster'); if (returnNames[returnView]) next.set('view', returnView); next.delete('returnView'); setParams(next)
    }}>Quay lại danh sách {returnNames[returnView] || 'cụm'}</Button>
      <ControlReadState query={detail} keepPreviousData>{detail.data && <ClusterDetail cluster={detail.data} />}</ControlReadState></>
      : <><div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label htmlFor="cluster-status">Trạng thái cụm</Label>
        <select id="cluster-status" className="block h-10 rounded-md border bg-background px-3" value={status} onChange={event => update('status', event.target.value, true)}>
          <option value="">Tất cả</option>{Object.entries(stateText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></div>{cursor && <Button variant="outline" onClick={() => update('cursor', '')}>Về trang đầu</Button>}</div>
      <ControlReadState query={list} keepPreviousData>
        {list.data?.items.length === 0 && <p className="rounded-lg border p-6">Không có cụm phù hợp bộ lọc.</p>}
        <div className="grid gap-3">{list.data?.items.map(cluster => <article key={cluster.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
          <div className="min-w-0 space-y-2"><h3 className="font-semibold break-all">{cluster.id}</h3>
            <ControlStatus value={cluster.admission.decision === 'open' && currentHealth(cluster) ? 'good' : 'warning'}>{admissionLabel(cluster)}</ControlStatus>
            <p className="text-sm">Sức khỏe dịch vụ: <strong>{currentHealth(cluster) ? healthText[cluster.health!.status] : 'Chưa xác nhận'}</strong></p>
            <p className="text-sm text-muted-foreground">{stateText[cluster.status]} · {cluster.allocatedCount} / {cluster.tenantLimit} không gian đã cấp</p>
            <p className="text-sm text-muted-foreground">Đo gần nhất: {controlTime(cluster.health?.observedAt)}</p></div>
          <Button variant="outline" aria-label={'Xem cụm ' + cluster.id} onClick={() => update('cluster', cluster.id)}>Xem chi tiết</Button>
        </article>)}</div>
        {list.data?.nextCursor && <Button variant="outline" onClick={() => update('cursor', list.data!.nextCursor!)}>Trang tiếp</Button>}
      </ControlReadState></>}
    {!secondaryView && <ControlClusterCommands target={target} cluster={detail.data} loading={!!target && (!detail.enabled || detail.isFetching)} onConfirmed={() => active.refetch()} />}
  </div>
}
