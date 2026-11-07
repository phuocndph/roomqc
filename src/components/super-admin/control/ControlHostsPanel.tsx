import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { controlAdminClient, useControlAdmin } from '@/hooks/super-admin/useControlAdmin'
import type { ControlHost } from '@/lib/control-admin'
import { ControlReadState } from './ControlReadState'
import { ControlClusterCommands } from './ControlClusterCommands'
import { ControlHostResources, type HostObservationCheck } from './ControlHostResources'
import { useControlAutoRefresh } from '@/hooks/super-admin/useControlAutoRefresh'

const environments = { local: 'Máy thử nghiệm', staging: 'Kiểm thử trước triển khai', production: 'Phục vụ khách thực tế' }
const statuses = { active: 'Đang sử dụng', maintenance: 'Đang bảo trì', retired: 'Đã ngừng sử dụng' }
const preflightState = (host: ControlHost) => {
  if (host.environment === 'local') return 'Máy thử nghiệm — không yêu cầu SSH preflight'
  if (!host.preflight) return 'Chưa có kiểm tra VPS'
  if (!host.preflightReady) return 'Kiểm tra không đạt hoặc đã hết hạn'
  return 'Đủ điều kiện triển khai'
}

export function ControlHostsPanel({ onReady }: { onReady: (ready: boolean) => void }) {
  const [params, setParams] = useSearchParams()
  const environment = params.get('hostEnvironment') || '', cursor = params.get('hostCursor') || ''
  const adding = params.get('action') === 'add-cluster', candidateCursor = params.get('candidateCursor') || '', target = params.get('candidate') || ''
  const hosts = useControlAdmin(['hosts', environment, cursor], (actor, options) => controlAdminClient.hosts(actor, { environment, cursor }, options))
  const candidates = useControlAdmin(['cluster-candidates', candidateCursor], (actor, options) => controlAdminClient.clusterCandidates(actor, candidateCursor, options), adding)
  const candidate = candidates.data?.items.find(item => item.id === target)
  const { enabled: hostsEnabled, refetch: refetchHosts } = hosts
  const [check, setCheck] = useState<HostObservationCheck>()
  const latestRefetch = useRef(refetchHosts)
  latestRefetch.current = refetchHosts
  useEffect(() => { onReady(!!hosts.data && !hosts.isFetching) }, [hosts.data, hosts.isFetching, onReady])
  useControlAutoRefresh(hosts, 60_000)
  // A list reload is not a new measurement. Confirm only a strictly newer,
  // unexpired observation from the collector; never manufacture a timestamp.
  useEffect(() => {
    if (check?.state !== 'waiting') return
    if (!hostsEnabled || hosts.message) { setCheck(current => current && { ...current, state: 'failed' }); return }
    const resources = hosts.data?.items.find(host => host.id === check.hostId)?.resources
    if (resources?.fresh && Date.parse(resources.validUntil) > Date.now()
      && Date.parse(resources.observedAt) > Date.parse(check.previousObservedAt)) {
      setCheck(current => current && { ...current, state: 'updated', observedAt: resources.observedAt })
    }
  }, [check, hostsEnabled, hosts.data, hosts.message])
  useEffect(() => {
    if (check?.state !== 'waiting' || !hostsEnabled) return
    const interval = setInterval(() => void latestRefetch.current(), 5000)
    const timeout = setTimeout(() => setCheck(current => current?.state === 'waiting' ? { ...current, state: 'timeout' } : current),
      Math.max(0, check.startedAt + 90_000 - Date.now()))
    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [check, hostsEnabled])
  useEffect(() => { setCheck(undefined) }, [environment, cursor, hostsEnabled])
  const checkObservation = (host: ControlHost) => {
    if (!hostsEnabled || check?.state === 'waiting' || !host.resources) return
    setCheck({ hostId: host.id, previousObservedAt: host.resources.observedAt, startedAt: Date.now(), state: 'waiting' })
    void latestRefetch.current()
  }
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key)
    if (key === 'hostEnvironment') next.delete('hostCursor')
    if (key === 'candidateCursor') next.delete('candidate')
    setParams(next)
  }
  const confirmed = () => Promise.allSettled([hosts.refetch(), candidates.refetch()])
  return <section aria-label="Máy chủ VPS" className="space-y-4">
    <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 space-y-1"><Label htmlFor="host-environment">Môi trường máy chủ</Label>
      <select id="host-environment" value={environment} onChange={event => update('hostEnvironment', event.target.value)} className="block h-10 rounded-control border bg-background px-3">
        <option value="">Tất cả môi trường</option>{Object.entries(environments).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></div>
      <Button variant="outline" disabled={!hosts.enabled || hosts.isFetching} onClick={() => void hosts.refetch()}>{hosts.isFetching ? 'Đang tải danh sách…' : 'Tải lại danh sách'}</Button>
      <Button variant="outline" onClick={() => update('action', adding ? '' : 'add-cluster')}>{adding ? 'Đóng phần thêm cụm' : 'Thêm cụm đã chuẩn bị'}</Button>
      {cursor && <Button variant="outline" onClick={() => update('hostCursor', '')}>Trang máy chủ đầu</Button>}
    </div>
    <ControlReadState query={hosts} keepPreviousData>
      {hosts.data?.items.length === 0 && <div className="space-y-2 border p-4"><p>Chưa có máy chủ được ghi nhận phù hợp bộ lọc.</p>
        <p className="text-sm text-muted-foreground">Cụm cũ có thể chưa liên kết với máy chủ. Xem mục Cụm dữ liệu để kiểm tra; chưa có liên kết không đồng nghĩa VPS đã dừng.</p></div>}
      {hosts.data?.items.map(host => <article key={host.id} aria-label={'Máy chủ ' + host.id} className="space-y-4 border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 space-y-1"><h3 className="break-words text-base font-semibold">{host.name}</h3>
          <p className="break-words text-xs text-muted-foreground">{host.providerLabel || 'Chưa ghi nhà cung cấp'}{host.region ? ' · ' + host.region : ''} · {environments[host.environment]}</p>
        </div><span className={'border px-2 py-1 text-xs font-medium ' + (host.status === 'maintenance' ? 'border-amber-600 text-amber-800 dark:text-amber-300' : 'border-border')}>{statuses[host.status]}</span></div>
          {!host.resources && <p className={host.preflightReady ? 'text-sm text-emerald-700' : 'text-sm text-amber-800'}>{preflightState(host)}</p>}
          {!host.resources && host.preflight && <p className="text-sm text-muted-foreground">
            Kiểm tra: {new Date(host.preflight.capturedAt).toLocaleString('vi-VN')} · Ổ trống {host.preflight.diskFreePercent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% · Docker {host.preflight.dockerServerVersion || 'chưa xác định'}
          </p>}
          {host.resources && <ControlHostResources resources={host.resources} check={check?.hostId === host.id ? check : undefined}
            onCheck={host.status !== 'retired' ? () => checkObservation(host) : undefined} disabled={!hosts.enabled || check?.state === 'waiting'} />}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          <p>{host.cluster ? `Dịch vụ RoomQC: cụm ${host.cluster.id} · ${host.cluster.allocatedCount} / ${host.cluster.tenantLimit} không gian đã cấp` : 'Dịch vụ RoomQC: chưa liên kết cụm dữ liệu'}</p>
        {host.cluster && <Button size="sm" variant="outline" onClick={() => {
          const next = new URLSearchParams(params); next.delete('view'); next.set('cluster', host.cluster!.id); next.set('returnView', 'hosts'); setParams(next)
        }}>Xem cụm {host.cluster.id}</Button>}
        </div>
        <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer">Thông tin máy chủ</summary>
          <p className="mt-2 break-words">Mã máy: {host.id} · {host.region || 'Chưa ghi khu vực'}. {host.cluster?.health ? 'Xem chi tiết cụm để kiểm tra số đo và khả năng nhận khách.' : 'Chưa có số đo sức khỏe cụm được xác nhận.'}</p>
        </details>
      </article>)}
      {hosts.data?.nextCursor && <Button variant="outline" onClick={() => update('hostCursor', hosts.data!.nextCursor!)}>Trang máy chủ tiếp</Button>}
    </ControlReadState>
    <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer">Máy chủ và cụm dữ liệu khác nhau thế nào?</summary>
      <p className="mt-2">Mỗi máy chủ chứa một cụm RoomQC; một cụm có thể phục vụ nhiều khách sạn. Danh sách lấy từ hệ thống RoomQC, chưa đồng bộ tài khoản nhà cung cấp VPS.</p>
    </details>
    {adding && <section aria-label="Cụm sẵn sàng ghi nhận" className="space-y-3 border-t pt-4">
      <h2 className="text-lg font-semibold">Chọn cụm đã được cấu hình trước</h2>
      <p className="text-sm text-muted-foreground">Danh sách do máy chủ quản lý. Chưa hỗ trợ nhập IP và cài đặt VPS từ trang này.</p>
      <Button variant="outline" disabled={!candidates.enabled || candidates.isFetching} onClick={() => void candidates.refetch()}>Tải lại cụm có thể thêm</Button>
      <ControlReadState query={candidates}>
        {candidates.data?.items.length === 0 && <p>Chưa có cụm mới được duyệt để thêm. Cần chuẩn bị kết nối và cấu hình máy chủ trước.</p>}
        {candidates.data?.items.map(item => <Button key={item.id} variant={target === item.id ? 'default' : 'outline'} aria-pressed={target === item.id}
          onClick={() => update('candidate', item.id)}>{item.hostName} · {item.id}</Button>)}
        {candidateCursor && <Button variant="outline" onClick={() => update('candidateCursor', '')}>Trang cụm có thể thêm đầu</Button>}
        {candidates.data?.nextCursor && <Button variant="outline" onClick={() => update('candidateCursor', candidates.data!.nextCursor!)}>Trang cụm có thể thêm tiếp</Button>}
      </ControlReadState>
    </section>}
    <ControlClusterCommands target={target} candidate={adding ? candidate : undefined} loading={adding && (!candidates.enabled || candidates.isFetching)} onConfirmed={confirmed} />
  </section>
}
