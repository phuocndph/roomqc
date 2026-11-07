import { useEffect, useState } from 'react'
import type { ControlHost } from '@/lib/control-admin'
import { Button } from '@/components/ui/button'
import { ControlResourceMeter } from './ControlResourceMeter'

export type HostObservationCheck = { hostId: string; previousObservedAt: string; startedAt: number;
  state: 'waiting' | 'updated' | 'timeout' | 'failed'; observedAt?: string }

const gib = (bytes: number) => (bytes / 1024 ** 3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })
export function ControlHostResources({ resources, check, onCheck, disabled = false }: {
  resources: NonNullable<ControlHost['resources']>; check?: HostObservationCheck; onCheck?: () => void; disabled?: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    const interval = setInterval(() => { if (!document.hidden) setNow(Date.now()) }, 15_000)
    const remaining = Date.parse(resources.validUntil) - Date.now()
    const timer = remaining >= 0 ? setTimeout(() => setNow(Date.now()), Math.min(remaining + 1, 2_147_483_647)) : undefined
    return () => { clearInterval(interval); clearTimeout(timer) }
  }, [resources.validUntil])
  const fresh = resources.fresh && now <= Date.parse(resources.validUntil)
  const memoryUsed = Math.max(0, resources.memoryTotalBytes - resources.memoryAvailableBytes)
  const diskUsed = Math.max(0, resources.diskTotalBytes - resources.diskAvailableBytes)
  const seconds = Math.max(0, Math.floor((now - Date.parse(resources.observedAt)) / 1000))
  return <section aria-label="Tài nguyên VPS" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
      <p role="status" className={'flex items-center gap-2 font-medium ' + (fresh ? 'text-green-800 dark:text-green-300' : 'text-amber-800 dark:text-amber-300')}>
        <span aria-hidden="true" className={'h-2 w-2 rounded-full ' + (fresh ? 'bg-green-600' : 'bg-amber-600')} />
        {fresh ? 'Đã kết nối giám sát VPS' : 'Số đo đã cũ — cần kiểm tra kết nối giám sát'}
      </p>
      <p title={new Date(resources.observedAt).toLocaleString('vi-VN')} className="text-muted-foreground">
        {fresh ? `Đo ${seconds < 60 ? seconds + ' giây' : Math.floor(seconds / 60) + ' phút'} trước` : 'Dữ liệu lần đo cuối'}
      </p>
    </div>
    <dl className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-3">
      <ControlResourceMeter label="CPU" percent={resources.cpuUsagePercent} value={resources.cpuUsagePercent.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%'} detail={resources.cpuCount + ' vCPU'} stale={!fresh} />
      <ControlResourceMeter label="RAM đang dùng" percent={memoryUsed / resources.memoryTotalBytes * 100}
        value={`${gib(memoryUsed)} / ${gib(resources.memoryTotalBytes)} GB`} detail="Dung lượng đã dùng / tổng" stale={!fresh} />
      <ControlResourceMeter label="Ổ đĩa đang dùng" percent={100 - resources.diskFreePercent}
        value={`${gib(diskUsed)} / ${gib(resources.diskTotalBytes)} GB`} detail={`Còn ${gib(resources.diskAvailableBytes)} GB · ${resources.diskFreePercent.toLocaleString('vi-VN')}%`} stale={!fresh} />
    </dl>
    {fresh && resources.reasonCodes.includes('DISK_HEADROOM_LOW') && <p className="border-l-4 border-red-600 pl-3 text-sm font-medium text-red-700 dark:text-red-400">Ổ đĩa còn dưới 15% — đang chặn cài thêm RoomQC.</p>}
    {fresh && resources.reasonCodes.includes('DOCKER_UNAVAILABLE') && <p className="border-l-4 border-red-600 pl-3 text-sm font-medium text-red-700 dark:text-red-400">Chưa kết nối được Docker — chưa đủ điều kiện triển khai.</p>}
    {onCheck && <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <Button type="button" size="sm" variant="outline" disabled={disabled || check?.state === 'waiting'} onClick={onCheck}>
        {check?.state === 'waiting' ? 'Đang kiểm tra số đo…' : 'Kiểm tra số đo mới'}
      </Button>
      <span className="text-xs text-muted-foreground">Tự động đo khoảng mỗi 60 giây</span>
    </div>}
    {check?.state === 'waiting' && <p role="status" className="text-sm">Đang chờ lượt đo VPS mới, tối đa 90 giây. Bạn vẫn có thể xem số đo trước đó.</p>}
    {check?.state === 'updated' && <p role="status" className="text-sm text-green-800 dark:text-green-300">Đã nhận số đo mới lúc {new Date(check.observedAt!).toLocaleString('vi-VN')}.</p>}
    {check?.state === 'timeout' && <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">Chưa nhận được số đo mới sau 90 giây. Bộ giám sát có thể đã dừng hoặc mất kết nối SSH. Tải lại trang không khắc phục được lỗi này.</p>}
    {check?.state === 'failed' && <p role="alert" className="text-sm text-red-700 dark:text-red-400">Không kiểm tra được số đo. Kiểm tra kết nối hoặc phiên quản trị rồi thử lại.</p>}
    <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer">Chi tiết phép đo và điều kiện tài nguyên</summary>
      <div className="mt-2 space-y-2 border-t pt-2">
        <p>Đo qua SSH chỉ đọc · {new Date(resources.observedAt).toLocaleString('vi-VN')} · Docker {resources.dockerServerVersion || 'Chưa kết nối được'}</p>
        <p>VPS được đo tự động khoảng mỗi 60 giây. Nút kiểm tra chờ lượt đo mới, không chạy lệnh đo trực tiếp.</p>
        {fresh && resources.deploymentAllowed && <p>Đủ điều kiện tài nguyên sơ bộ; cần kiểm tra bản cài, dịch vụ và sao lưu trước khi nhận khách.</p>}
        <p>Số đo máy chủ không thay cho kiểm tra sức khỏe cụm hoặc bằng chứng sao lưu.</p>
      </div>
    </details>
  </section>
}
