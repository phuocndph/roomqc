import { useEffect, useState } from 'react'
import { ControlTenantSummary } from '@/components/super-admin/control/ControlTenantSummary'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { controlAdminClient, useControlAdmin } from '@/hooks/super-admin/useControlAdmin'
import type { ControlWorkspaceDetails } from '@/lib/control-admin'
import { ControlReadState, ControlStatus } from '@/components/super-admin/control/ControlReadState'
import { controlTime } from '@/lib/control-admin-display'
import { useControlScroll } from '@/hooks/super-admin/useControlScroll'
import { ControlWorkspaceRecheck, ControlWorkspaceRecheckPending } from '@/components/super-admin/control/ControlWorkspaceRecheck'
import { ControlSignupStatus } from '@/components/super-admin/control/ControlSignupStatus'

const states = { reserved: 'Chờ chủ tài khoản thiết lập', provisioning: 'Đang cấp dữ liệu', active: 'Đã sẵn sàng',
  suspended: 'Tạm ngừng', migrating: 'Đang chuyển cụm', expired: 'Đã hết hạn giữ chỗ' }
const receipts = { verified: 'Đã đối soát khớp', missing: 'Chưa tìm thấy kết quả cấp dữ liệu',
  conflict: 'Kết quả không khớp — cần kỹ thuật đối soát', unavailable: 'Chưa kết nối được cụm — chưa xác định kết quả' }
const jobs = { queued: 'Đang chờ', leased: 'Đang xử lý', retry: 'Chờ thử lại', waiting_owner: 'Cần chủ tài khoản tiếp tục',
  needs_review: 'Cần kỹ thuật kiểm tra', succeeded: 'Đã hoàn thành', cancelled: 'Đã hủy' }

function RegistrationDetail({ data, onConfirmed }: { data: ControlWorkspaceDetails; onConfirmed: () => unknown }) {
  const workspace = data.workspace
  const next = data.receipt.status === 'conflict' ? 'Chuyển kỹ thuật đối soát; giữ nguyên đăng ký và dữ liệu hiện có.'
    : data.receipt.status === 'unavailable' ? 'Kiểm tra kết nối cụm rồi tải lại để đối soát kết quả.'
      : workspace.status === 'active' && data.receipt.status === 'verified' ? 'Khách có thể tiếp tục sử dụng không gian đã cấp.'
        : workspace.status === 'active' ? 'Chưa xác nhận kết quả cấp dữ liệu. Cần kỹ thuật đối soát đăng ký hiện có.'
        : workspace.status === 'reserved' ? 'Chủ tài khoản cần tiếp tục xác minh và thiết lập trên đăng ký hiện có.'
          : workspace.status === 'suspended' ? 'Không gian đang tạm ngừng. Kiểm tra gói sử dụng và chính sách hỗ trợ.'
            : workspace.status === 'expired' ? 'Đã hết hạn giữ chỗ. Kiểm tra lịch sử trước khi hướng dẫn khách tiếp tục.'
              : workspace.status === 'migrating' ? 'Đang chuyển cụm. Theo dõi tiến độ và giữ nguyên ánh xạ dữ liệu.'
          : 'Theo dõi tiến độ và kết quả đối soát; không đăng ký lại khách sạn.'
  return <section className="space-y-4" aria-label={'Chi tiết đăng ký ' + workspace.slug}>
    <div><h3 className="text-lg font-semibold">{workspace.displayName}</h3><p className="break-all text-sm text-muted-foreground">{workspace.slug} · {workspace.id}</p></div>
    <p className="rounded-lg border p-4 font-medium">{next}</p>
    <dl className="grid gap-4 sm:grid-cols-2">{[
      ['Trạng thái', states[workspace.status]], ['Cụm dữ liệu', workspace.clusterId], ['Đối soát', receipts[data.receipt.status]],
      ['Công việc cấp phát', data.job ? jobs[data.job.state] : 'Chưa có công việc'], ['Khách sạn đã cấp', workspace.hotelId ?? 'Chưa xác nhận'],
      ['Cập nhật gần nhất', controlTime(workspace.updatedAt)], ['Mã lỗi gần nhất', workspace.lastErrorCode ?? data.job?.lastErrorCode ?? 'Không có'],
    ].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
    <ControlTenantSummary workspace={workspace} />
    <ControlWorkspaceRecheck key={workspace.id} data={data} onConfirmed={onConfirmed} />
    <h4 className="font-semibold">Lịch sử cấp phát</h4>
    {data.timeline.items.length ? <ol className="space-y-3">{data.timeline.items.map(event => <li key={event.id} className="rounded-lg border p-3">
      <p className="break-words text-sm font-medium">{event.type}</p><p className="text-sm text-muted-foreground">{controlTime(event.createdAt)}</p>
      {event.requestId && <p className="break-all text-xs text-muted-foreground">Mã yêu cầu: {event.requestId}</p>}
    </li>)}</ol> : <p className="text-sm text-muted-foreground">Chưa có lịch sử cấp phát.</p>}
  </section>
}

export function RegistrationsPage() {
  const [params, setParams] = useSearchParams(), status = params.get('status') || '', search = params.get('search') || ''
  const clusterId = params.get('clusterId') || '', cursor = params.get('cursor') || '', target = params.get('workspace') || ''
  const timelineCursor = params.get('timelineCursor') || ''
  const [draft, setDraft] = useState({ search, clusterId })
  useEffect(() => { setDraft({ search, clusterId }) }, [search, clusterId])
  const list = useControlAdmin(['registrations', status, search, clusterId, cursor],
    (actor, options) => controlAdminClient.workspaces(actor, { status, search, clusterId, cursor }, options), !target)
  const detail = useControlAdmin(['registration', target, timelineCursor],
    (actor, options) => controlAdminClient.workspace(actor, target, timelineCursor, options), !!target)
  const active = target ? detail : list
  const root = useControlScroll(!!active.data && !active.isFetching)
  const update = (key: string, value: string, resetPage = false) => {
    const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key)
    if (resetPage) next.delete('cursor'); if (key === 'workspace') next.delete('timelineCursor'); setParams(next)
  }
  return <div ref={root} className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Đăng ký mới</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tìm đăng ký, xem bước đang xử lý và kết quả cấp dữ liệu.</p></div>
      <Button variant="outline" disabled={!active.enabled || active.isFetching} onClick={() => void active.refetch()}>Tải lại</Button></div>
    <ControlSignupStatus />
    {target ? <><Button variant="outline" onClick={() => update('workspace', '')}>Quay lại danh sách đăng ký</Button>
      <ControlReadState query={detail}>{detail.data && <RegistrationDetail data={detail.data} onConfirmed={detail.refetch} />}
        {detail.data?.timeline.nextCursor && <Button variant="outline" className="mt-4" onClick={() => update('timelineCursor', detail.data!.timeline.nextCursor!)}>Lịch sử trước đó</Button>}
        {timelineCursor && <Button variant="outline" className="mt-4 ml-2" onClick={() => update('timelineCursor', '')}>Lịch sử mới nhất</Button>}
      </ControlReadState></>
      : <><ControlWorkspaceRecheckPending onOpen={id => update('workspace', id)} /><form className="flex flex-wrap items-end gap-3 rounded-lg border p-4" onSubmit={event => {
        event.preventDefault(); const next = new URLSearchParams(params); next.delete('cursor')
        for (const [key, value] of Object.entries(draft)) { if (value.trim()) next.set(key, value.trim()); else next.delete(key) }
        setParams(next)
      }}><div className="min-w-0 flex-1 space-y-1"><Label htmlFor="registration-search">Tên, địa chỉ doanh nghiệp hoặc mã yêu cầu</Label>
        <Input id="registration-search" maxLength={120} value={draft.search} onChange={event => setDraft({ ...draft, search: event.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="registration-cluster">Mã cụm</Label><Input id="registration-cluster" maxLength={40} value={draft.clusterId} onChange={event => setDraft({ ...draft, clusterId: event.target.value })} placeholder="Tất cả cụm" /></div>
        <div className="space-y-1"><Label htmlFor="registration-status">Trạng thái</Label><select id="registration-status" className="block h-10 max-w-full rounded-md border bg-background px-3" value={status} onChange={event => update('status', event.target.value, true)}>
          <option value="">Tất cả</option>{Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></div><Button type="submit">Tìm kiếm</Button></form>
      {cursor && <Button variant="outline" onClick={() => update('cursor', '')}>Về trang đầu</Button>}
      <ControlReadState query={list}>
        {list.data?.items.length === 0 && <p className="rounded-lg border p-6">Không có đăng ký phù hợp bộ lọc.</p>}
        <div className="grid gap-3">{list.data?.items.map(workspace => <article key={workspace.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
          <div className="min-w-0 space-y-2"><h3 className="font-semibold break-words">{workspace.displayName}</h3>
            <ControlStatus value={workspace.status === 'active' ? 'good' : workspace.status === 'provisioning' ? 'warning' : 'neutral'}>{states[workspace.status]}</ControlStatus>
            <p className="break-all text-sm text-muted-foreground">{workspace.slug} · Cụm {workspace.clusterId}</p>
            <p className="text-sm text-muted-foreground">Cập nhật: {controlTime(workspace.updatedAt)}</p></div>
          <Button variant="outline" aria-label={'Xem đăng ký ' + workspace.slug} onClick={() => update('workspace', workspace.id)}>Xem chi tiết</Button>
        </article>)}</div>
        {list.data?.nextCursor && <Button variant="outline" onClick={() => update('cursor', list.data!.nextCursor!)}>Trang tiếp</Button>}
      </ControlReadState></>}
  </div>
}
