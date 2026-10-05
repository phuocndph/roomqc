import { Building2, Users, BedDouble, Sparkles, Brush, Wrench, CalendarDays } from 'lucide-react'
import { KpiCardLarge } from './KpiCardLarge'
import type { HousekeepingKpi } from '@/hooks/useHousekeepingKpi'

interface Props {
  data?: HousekeepingKpi
  loading?: boolean
}

function pct(n: number, total: number): number | null {
  if (!total) return null
  return (n / total) * 100
}

export function KpiTopRow({ data, loading }: Props) {
  const total = data?.totalRooms ?? 0
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      <KpiCardLarge label="Tổng phòng"     value={data?.totalRooms ?? 0}    percent={total ? 100 : null}                  icon={Building2}   to="/rooms"                                           loading={loading} />
      <KpiCardLarge label="Đang có khách"  value={data?.occupied ?? 0}      percent={pct(data?.occupied ?? 0, total)}     icon={Users}       to="/rooms?view=grid&status=occupied_clean"         tone="info"        loading={loading} />
      <KpiCardLarge label="Trống - sạch"   value={data?.vacantClean ?? 0}   percent={pct(data?.vacantClean ?? 0, total)}  icon={BedDouble}   to="/rooms?view=grid&status=vacant_clean"             tone="success"     loading={loading} />
      <KpiCardLarge label="Đang dọn"       value={data?.cleaning ?? 0}      percent={pct(data?.cleaning ?? 0, total)}     icon={Sparkles}    to="/rooms?view=grid&status=vacant_dirty"          tone="warning"     loading={loading} />
      <KpiCardLarge label="Bẩn - chờ dọn"  value={data?.vacantDirty ?? 0}   percent={pct(data?.vacantDirty ?? 0, total)}  icon={Brush}       to="/rooms?view=grid&status=vacant_dirty"             tone="danger"      loading={loading} />
      <KpiCardLarge label="Bảo trì"        value={data?.maintenance ?? 0}   percent={pct(data?.maintenance ?? 0, total)}  icon={Wrench}      to="/maintenance/requests"                            tone="maintenance" loading={loading} />
      <KpiCardLarge label="Đặt trước"      value={data?.reserved ?? 0}      percent={pct(data?.reserved ?? 0, total)}     icon={CalendarDays} to="/bookings?tab=upcoming"                           tone="reserved"    loading={loading} />
    </div>
  )
}

export function KpiTotalsStrip({ data, loading }: Props) {
  return (
    <div className="border rounded-lg p-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 items-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tổng cộng</div>
        <Cell label="Tổng phòng"     value={data?.totalRooms ?? 0}  loading={loading} />
        <Cell label="Đang có khách"  value={data?.occupied ?? 0}    loading={loading} tone="text-blue-600" />
        <Cell label="Trống - sạch"   value={data?.vacantClean ?? 0} loading={loading} tone="text-green-600" />
        <Cell label="Đang dọn"       value={data?.cleaning ?? 0}    loading={loading} tone="text-amber-600" />
        <Cell label="Bẩn - chờ dọn"  value={data?.vacantDirty ?? 0} loading={loading} tone="text-red-600" />
        <Cell label="Bảo trì"        value={data?.maintenance ?? 0} loading={loading} tone="text-zinc-700 dark:text-zinc-300" />
        <Cell label="Đặt trước"      value={data?.reserved ?? 0}    loading={loading} tone="text-purple-600" />
      </div>
    </div>
  )
}

function Cell({ label, value, tone = 'text-foreground', loading }: { label: string; value: number; tone?: string; loading?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      <span className={`text-xl font-semibold tabular-nums ${tone}`}>{loading ? '…' : value}</span>
    </div>
  )
}
