import { Button } from '@/components/ui/button'
import { controlAdminClient, useControlAdmin } from '@/hooks/super-admin/useControlAdmin'
import type { ControlWorkspace } from '@/lib/control-admin'
import { controlTime } from '@/lib/control-admin-display'
import { ControlReadState } from './ControlReadState'

export function ControlTenantSummary({ workspace }: { workspace: ControlWorkspace }) {
  const query = useControlAdmin(['tenant-summary', workspace.id, workspace.clusterId, workspace.tenantId, workspace.routingVersion, workspace.updatedAt],
    (actor, options) => controlAdminClient.tenantSummary(actor, workspace, options))
  const data = query.isFetching ? undefined : query.data
  const subscriptions: Record<string, string> = { trial: 'Dùng thử', active: 'Đang sử dụng', suspended: 'Tạm ngừng', cancelled: 'Đã hủy', past_due: 'Quá hạn' }
  return <section className="space-y-3 border p-4" aria-label="Tổng quan doanh nghiệp">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Tổng quan doanh nghiệp</h4>
      <Button variant="outline" size="sm" disabled={!query.enabled || query.isFetching} onClick={() => void query.refetch()}>Tải lại tổng quan</Button></div>
    <ControlReadState query={query}>
      {data?.status === 'unavailable' && <div role="status" className="space-y-1">
        <p>{data.errorCode === 'TENANT_SUMMARY_UNBOUND' ? 'Đăng ký chưa có doanh nghiệp được xác nhận.'
          : data.errorCode === 'TENANT_SUMMARY_MISSING' ? 'Chưa tìm thấy biên nhận doanh nghiệp tại cụm đã cấp. Cần đối soát đăng ký.'
            : 'Chưa đọc được dữ liệu từ cụm đã cấp. Hãy kiểm tra kết nối hoặc cấu hình rồi tải lại.'}</p>
        <p className="break-words text-sm text-muted-foreground">Chưa xác định số liệu. Cụm: {data.clusterId} · Mã đối chiếu: {data.errorCode}</p>
      </div>}
      {data?.status === 'available' && <><p className="break-words font-medium">{data.tenant.name}</p>
        <p className="text-sm">Gói sử dụng: {subscriptions[data.tenant.subscriptionStatus] ?? data.tenant.subscriptionStatus}
          {data.tenant.trialEndsAt && data.tenant.subscriptionStatus === 'trial' && ' · Hết dùng thử: ' + controlTime(data.tenant.trialEndsAt)}</p>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[
          ['Khách sạn', data.tenant.hotelCount], ['Tài khoản nhân sự', data.tenant.staffCount], ['Phòng đã tạo', data.tenant.roomCount],
        ].map(([label, value]) => <div key={label} className="border p-3"><dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-xl font-semibold">{Number(value).toLocaleString('vi-VN')}</dd></div>)}</dl>
        <p className="text-xs text-muted-foreground">Nhân sự gồm chủ và tài khoản chưa xóa ở mọi trạng thái. Số phòng lấy từ phòng thực tế đã tạo.</p>
        <p className="text-xs text-muted-foreground">Cụm {data.clusterId} · Ghi nhận: {controlTime(data.observedAt)}</p></>}
    </ControlReadState>
  </section>
}
