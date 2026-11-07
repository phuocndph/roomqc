import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { controlAdminClient, useControlAdmin } from '@/hooks/super-admin/useControlAdmin'
import { controlTime } from '@/lib/control-admin-display'
import { ControlStatus } from './ControlReadState'

const labels = { open: 'Đang nhận đăng ký mới', closed: 'Đang đóng đăng ký mới', no_capacity: 'Chưa có cụm sẵn sàng nhận khách' }
const maximumAge = 30_000

export function ControlSignupStatus() {
  const query = useControlAdmin(['overview'], (actor, options) => controlAdminClient.overview(actor, options))
  const [expired, setExpired] = useState(false)
  const observedAt = query.data?.asOf
  useEffect(() => {
    setExpired(false)
    if (!observedAt) return
    // Display an observation, not an indefinitely live admission guarantee.
    const deadline = Math.min(Date.parse(observedAt), Date.now()) + maximumAge
    const timeout = setTimeout(() => setExpired(true), Math.max(0, deadline - Date.now()))
    return () => clearTimeout(timeout)
  }, [observedAt])
  const signup = query.data?.signup
  const unknown = !query.enabled || query.isFetching || !!query.message || !signup || expired
    || Date.now() - Date.parse(observedAt ?? '') >= maximumAge
  return <section aria-label="Trạng thái đăng ký mới" className="space-y-3 border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold">Tiếp nhận khách hàng mới</h2>
      <Button variant="outline" size="sm" disabled={!query.enabled || query.isFetching} onClick={() => void query.refetch()}>Tải lại trạng thái</Button>
    </div>
    {unknown ? <p role={query.message ? 'alert' : 'status'} className="text-sm">
      {!query.enabled ? 'Cần phiên quản trị đang hoạt động để xem trạng thái.' : query.isFetching ? 'Đang kiểm tra trạng thái đăng ký…'
        : query.message ? 'Không tải được trạng thái đăng ký. Hãy thử tải lại.' : expired || observedAt ? 'Trạng thái cần được cập nhật. Hãy tải lại để kiểm tra.' : 'Chưa xác nhận trạng thái đăng ký.'}
    </p> : <>
      <ControlStatus value={signup.state === 'open' ? 'good' : 'warning'}>{labels[signup.state]}</ControlStatus>
      <p className="text-sm">{signup.state === 'closed' ? 'Đăng ký mới đang được tắt trong cấu hình vận hành. Mở một cụm riêng lẻ chưa bật đăng ký toàn hệ thống.'
        : signup.state === 'no_capacity' ? 'Chưa có cụm đáp ứng đủ sức khỏe, sao lưu và sức chứa. Kiểm tra ở mục Cụm dữ liệu.'
          : `${signup.openClusterCount.toLocaleString('vi-VN')} cụm đang mở · còn ${signup.availableWorkspaceSlots.toLocaleString('vi-VN')} chỗ cấp khách sạn mới.`}</p>
      <p className="text-xs text-muted-foreground">Ghi nhận: {controlTime(observedAt)}. Mỗi đăng ký vẫn được kiểm tra lại trước khi cấp chỗ.</p>
    </>}
    <div className="flex flex-wrap gap-4 text-sm">
      <Link className="font-medium underline underline-offset-4" to="/super-admin/infrastructure">Xem cụm dữ liệu</Link>
      <Link className="font-medium underline underline-offset-4" to="/super-admin/registrations">Theo dõi đăng ký</Link>
    </div>
  </section>
}
