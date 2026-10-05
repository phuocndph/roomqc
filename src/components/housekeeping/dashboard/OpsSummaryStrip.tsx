import { Link } from 'react-router-dom'
import { Wrench, PackageSearch, Shirt, Truck, AlertTriangle } from 'lucide-react'
import type { OpsSummary } from '@/hooks/useHousekeepingOpsSummary'

interface Props {
  data?: OpsSummary
  loading?: boolean
}

/**
 * Hàng "Vận hành liên quan" — strip 4 ô compact: Bảo trì, Thất lạc, Giặt ủi, Phiếu giao đồ.
 * Giúp Trưởng buồng phòng nắm operational context không cần rời cockpit.
 */
export function OpsSummaryStrip({ data, loading }: Props) {
  return (
    <div className="border rounded-lg">
      <div className="px-3 py-2 border-b flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Vận hành liên quan</h3>
        <span className="text-[11px] text-muted-foreground">Bảo trì · Thất lạc · Giặt ủi · Giao đồ</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
        <OpsCell
          to="/maintenance/requests"
          icon={Wrench}
          label="Yêu cầu bảo trì đang xử lý"
          value={data?.maintenancePending ?? 0}
          loading={loading}
          extra={
            (data?.maintenanceUrgent ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-red-600">
                <AlertTriangle className="h-3 w-3" /> {data!.maintenanceUrgent} khẩn cấp
              </span>
            ) : null
          }
          tone="text-zinc-700 dark:text-zinc-300"
        />
        <OpsCell
          to="/lost-found"
          icon={PackageSearch}
          label="Đồ thất lạc đang giữ"
          value={data?.lostFoundStored ?? 0}
          loading={loading}
          tone="text-purple-600"
        />
        <OpsCell
          to="/laundry"
          icon={Shirt}
          label="Lô giặt đang xử lý"
          value={data?.laundryInProcess ?? 0}
          loading={loading}
          extra={
            (data?.laundryCompensation ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-600">
                <AlertTriangle className="h-3 w-3" /> {data!.laundryCompensation} cần xử lý đền bù
              </span>
            ) : null
          }
          tone="text-blue-600"
        />
        <OpsCell
          to="/inventory/distributions"
          icon={Truck}
          label="Phiếu giao đồ chờ"
          value={data?.distributionPending ?? 0}
          loading={loading}
          tone="text-amber-600"
        />
      </div>
    </div>
  )
}

function OpsCell({
  to, icon: Icon, label, value, loading, tone = 'text-foreground', extra,
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  loading?: boolean
  tone?: string
  extra?: React.ReactNode
}) {
  return (
    <Link to={to} className="p-3 hover:bg-muted/30 transition flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{loading ? '…' : value}</div>
      {extra ? <div className="leading-tight">{extra}</div> : <div className="h-[14px]" />}
    </Link>
  )
}
