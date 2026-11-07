import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { controlAdminClient, useControlAdmin } from '@/hooks/super-admin/useControlAdmin'
import { useControlAutoRefresh } from '@/hooks/super-admin/useControlAutoRefresh'
import { controlTime } from '@/lib/control-admin-display'

const root = '/super-admin/infrastructure'
const number = (value: number) => value.toLocaleString('vi-VN')
export function ControlInfrastructureOverview() {
  const [params] = useSearchParams()
  const overview = useControlAdmin(['overview'], (actor, options) => controlAdminClient.overview(actor, options))
  const backups = useControlAdmin(['infrastructure-backup-summary'], (actor, options) => controlAdminClient.backups(actor, {}, options))
  useControlAutoRefresh(overview)
  useControlAutoRefresh(backups, 60_000)
  const [now, setNow] = useState(Date.now)
  const [showConditions, setShowConditions] = useState(false)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const data = overview.data, backup = backups.data
  const fresh = !!data && !overview.message && Date.now() - Date.parse(data.asOf) < 30_000
  const backupFresh = !!backup && !backups.message && now - Date.parse(backup.asOf) < 90_000
  const clusterLink = (id: string) => {
    const next = new URLSearchParams(params), view = next.get('view')
    next.delete('view'); next.set('cluster', id)
    if (view) next.set('returnView', view)
    return root + '?' + next.toString()
  }
  const cards = [
    { label: 'Cụm dữ liệu', value: fresh ? number(data.clusterCount) : '—', hint: 'Toàn danh bạ hệ thống', to: root, attention: false },
    { label: 'Cảnh báo nghiêm trọng', value: fresh ? number(data.openCriticalAlerts) : '—', hint: 'Chưa phục hồi · xem lịch sử',
      to: root + '?view=alerts&alertState=&alertSeverity=critical', attention: fresh && data.openCriticalAlerts > 0 },
    { label: 'Nhận đăng ký mới', value: fresh ? data.signup.state === 'open' ? 'Đang mở' : data.signup.state === 'closed' ? 'Đang đóng' : 'Chưa sẵn sàng' : '—',
      hint: fresh ? data.signup.state === 'open' ? `Còn ${number(data.signup.availableWorkspaceSlots)} chỗ cấp mới` : 'Xem điều kiện tiếp nhận' : 'Chưa xác nhận trạng thái', to: null, attention: false },
    { label: 'Sao lưu đã ghi nhận', value: backupFresh ? number(backup.total) : '—', hint: backupFresh ? 'Xem kết quả kiểm tra' : 'Chưa xác nhận dữ liệu', to: root + '?view=backups', attention: false },
  ]
  return <section aria-label="Tổng quan hạ tầng" className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <p>{overview.message ? 'Không tải được tổng quan. Thử cập nhật lại.' : !fresh ? 'Tổng quan chưa được xác nhận.'
        : `Cập nhật ${Math.max(0, Math.floor((now - Date.parse(data.asOf)) / 1000))} giây trước · Gồm môi trường thử nghiệm`}</p>
      <Button size="sm" variant="ghost" disabled={!overview.enabled || overview.isFetching || backups.isFetching}
        onClick={() => void Promise.allSettled([overview.refetch(), backups.refetch()])}>
        <RefreshCw className={'mr-1.5 h-3.5 w-3.5 ' + (overview.isFetching || backups.isFetching ? 'animate-spin' : '')} />Cập nhật tổng quan
      </Button>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{cards.map(card => {
      const content = <>
      <span className="block text-xs font-medium">{card.label}</span>
      <strong className={'mt-1 block text-xl leading-tight tabular-nums ' + (card.attention ? 'text-red-700 dark:text-red-400' : '')}>{card.value}</strong>
      <span className="mt-1 block text-xs text-muted-foreground">{card.hint}</span>
      </>
      const className = 'min-w-0 border p-3 text-left transition-colors hover:border-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ' + (card.attention ? 'border-red-600' : 'border-border')
      return card.to ? <Link key={card.label} to={card.to} className={className}>{content}</Link>
        : <button key={card.label} type="button" aria-expanded={showConditions} aria-controls="signup-detail" className={className} onClick={() => setShowConditions(value => !value)}>{content}</button>
    })}</div>
    {fresh && data.staleClusterIds.length > 0 && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 border-amber-600 pl-3 text-sm">
      <span className="font-medium">{number(data.staleClusterIds.length)} cụm chưa có số đo sức khỏe mới</span>
      {data.staleClusterIds.slice(0, 3).map(id => <Link key={id} className="font-medium text-blue-700 underline underline-offset-2 dark:text-blue-400" to={clusterLink(id)}>Kiểm tra {id}</Link>)}
      {data.staleClusterIds.length > 3 && <Link className="underline" to={root}>Xem các cụm còn lại</Link>}
    </div>}
    <details id="signup-detail" open={showConditions} onToggle={event => setShowConditions(event.currentTarget.open)} className="text-sm">
      <summary className="w-fit cursor-pointer text-muted-foreground">Điều kiện nhận khách và phạm vi số liệu</summary>
      <div className="mt-2 space-y-2 border p-3">
        <p>{!fresh ? 'Chưa xác nhận trạng thái đăng ký. Cập nhật tổng quan để kiểm tra.' : data.signup.state === 'closed'
          ? 'Đăng ký mới đang tắt trong cấu hình vận hành. Mở một cụm riêng lẻ chưa bật đăng ký toàn hệ thống.' : data.signup.state === 'no_capacity'
            ? 'Chưa có cụm đáp ứng điều kiện sức khỏe, sao lưu và sức chứa để nhận thêm khách.'
            : `${number(data.signup.openClusterCount)} cụm đang mở · còn ${number(data.signup.availableWorkspaceSlots)} chỗ cấp mới. Mỗi đăng ký vẫn được kiểm tra trước khi cấp chỗ.`}</p>
        <p className="text-muted-foreground">Số liệu gồm cả cụm thử nghiệm và vận hành đã ghi vào danh bạ. {fresh && `Ghi nhận: ${controlTime(data.asOf)}.`} Không suy ra hệ thống bình thường chỉ từ số cảnh báo bằng 0.</p>
        <p className="text-muted-foreground">{backupFresh ? `Có ${number(backup.total)} bản ghi sao lưu tại ${controlTime(backup.asOf)}. Số bản ghi không chứng minh dữ liệu đã khôi phục được.`
          : 'Chưa xác nhận lịch sử sao lưu. Mở mục Sao lưu để kiểm tra; chưa có bản ghi không đồng nghĩa chưa từng sao lưu.'}</p>
        <Link className="font-medium text-blue-700 underline dark:text-blue-400" to="/super-admin/registrations">Theo dõi đăng ký</Link>
      </div>
    </details>
  </section>
}
