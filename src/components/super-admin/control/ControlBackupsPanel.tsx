import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ControlClusterInput } from './ControlClusterInput'
import { Label } from '@/components/ui/label'
import { ControlReadState, ControlStatus } from './ControlReadState'
import { controlAdminClient, useControlAdmin } from '@/hooks/super-admin/useControlAdmin'
import { controlTime } from '@/lib/control-admin-display'
import type { ControlBackup } from '@/lib/control-admin'

const scopes = { directory: 'Danh bạ hệ thống', cluster: 'Database cụm', objects: 'Tệp đính kèm', bundle: 'Gói sao lưu' }
const states = { pending: 'Chờ kiểm tra', verified: 'Đã kiểm tra bản sao lưu', failed: 'Kiểm tra thất bại' }
function BackupRecord({ backup }: { backup: ControlBackup }) {
  const incomplete = backup.verificationState === 'verified' && (!backup.completedAt || !backup.manifestHash)
  return <article aria-label={'Bản sao lưu ' + backup.id} className="space-y-3 rounded-panel border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="font-semibold">{scopes[backup.scope]}</h3>
        <p className="mt-1 break-all text-sm">{backup.clusterId ? 'Cụm ' + backup.clusterId : 'Toàn hệ thống'}</p></div>
      <ControlStatus value={backup.verificationState === 'failed' || incomplete ? 'warning' : 'neutral'}>
        {incomplete ? 'Thiếu thông tin kiểm tra' : states[backup.verificationState]}</ControlStatus>
    </div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Hoàn tất sao lưu</dt><dd className="mt-1 font-medium">{backup.completedAt ? controlTime(backup.completedAt) : 'Chưa ghi nhận hoàn tất'}</dd></div>
      <div><dt className="text-muted-foreground">Lần thử khôi phục được ghi nhận</dt><dd className="mt-1 font-medium">{backup.restoreTestAt ? controlTime(backup.restoreTestAt) : 'Chưa ghi nhận thử khôi phục'}</dd></div>
    </dl>
    <details className="border-t pt-3 text-sm"><summary className="cursor-pointer font-medium">Thông tin đối chiếu</summary>
      <dl className="mt-3 space-y-2 break-all"><div><dt className="text-muted-foreground">Mã bản ghi</dt><dd>{backup.id}</dd></div>
        <div><dt className="text-muted-foreground">Mã sao lưu</dt><dd>{backup.backupId ?? 'Chưa có mã hiển thị'}</dd></div>
        <div><dt className="text-muted-foreground">Mã kiểm tra manifest</dt><dd>{backup.manifestHash ?? 'Chưa ghi nhận mã kiểm tra hợp lệ'}</dd></div>
        <div><dt className="text-muted-foreground">Ghi nhận lúc</dt><dd>{controlTime(backup.createdAt)}</dd></div></dl>
    </details>
  </article>
}

export function ControlBackupsPanel({ onReady }: { onReady: (ready: boolean) => void }) {
  const [params, setParams] = useSearchParams()
  const clusterId = params.get('backupCluster') ?? '', scope = params.get('backupScope') ?? ''
  const verificationState = params.get('backupState') ?? '', cursor = params.get('backupCursor') ?? ''
  const [clusterInput, setClusterInput] = useState(clusterId)
  useEffect(() => setClusterInput(clusterId), [clusterId])
  const list = useControlAdmin(['backups', clusterId, scope, verificationState, cursor],
    (actor, options) => controlAdminClient.backups(actor, { clusterId, scope, verificationState, cursor }, options))
  useEffect(() => { onReady(!!list.data && !list.isFetching) }, [list.data, list.isFetching, onReady])
  const update = (key: string, value: string, reset = true) => {
    const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key)
    if (reset) next.delete('backupCursor'); setParams(next)
  }
  return <section aria-label="Lịch sử sao lưu" className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Sao lưu dữ liệu</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Lịch sử sao lưu đã ghi nhận. Cần thử khôi phục để xác nhận dữ liệu dùng được.</p></div>
      <Button variant="outline" disabled={!list.enabled || list.isFetching} onClick={() => void list.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tải lại sao lưu</Button>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <form className="flex max-w-full flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); update('backupCluster', clusterInput.trim()) }}>
        <div className="min-w-0 space-y-1"><Label htmlFor="backup-cluster">Mã cụm</Label>
          <ControlClusterInput id="backup-cluster" value={clusterInput} onChange={setClusterInput} /></div>
        <Button type="submit" variant="outline">Lọc theo cụm</Button>
      </form>
      <div className="space-y-1"><Label htmlFor="backup-scope">Loại sao lưu</Label>
        <select id="backup-scope" className="block h-10 max-w-full rounded-control border bg-background px-3" value={scope} onChange={event => update('backupScope', event.target.value)}>
          <option value="">Tất cả loại</option>{Object.entries(scopes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></div>
      <div className="space-y-1"><Label htmlFor="backup-state">Tình trạng kiểm tra</Label>
        <select id="backup-state" className="block h-10 max-w-full rounded-control border bg-background px-3" value={verificationState} onChange={event => update('backupState', event.target.value)}>
          <option value="">Tất cả tình trạng</option>{Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></div>
      {cursor && <Button variant="outline" onClick={() => update('backupCursor', '')}>Về trang sao lưu đầu</Button>}
    </div>
    <ControlReadState query={list}>
      {list.data && <p role="status" className="text-sm">Có {list.data.total.toLocaleString('vi-VN')} bản ghi phù hợp · Cập nhật lúc {controlTime(list.data.asOf)}</p>}
      {list.data?.items.length === 0 && <div className="space-y-2 rounded-panel border p-6"><p className="font-medium">Chưa có bản sao lưu được ghi nhận phù hợp bộ lọc.</p>
        <p className="text-sm text-muted-foreground">Kiểm tra bộ lọc và dịch vụ sao lưu. Chưa có bản ghi không đồng nghĩa dữ liệu chưa từng được sao lưu.</p></div>}
      <div className="grid gap-3">{list.data?.items.map(backup => <BackupRecord key={backup.id} backup={backup} />)}</div>
      {list.data?.nextCursor && <Button variant="outline" onClick={() => update('backupCursor', list.data!.nextCursor!, false)}>Trang sao lưu tiếp</Button>}
    </ControlReadState>
  </section>
}
