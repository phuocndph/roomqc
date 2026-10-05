import { lazy, Suspense } from 'react'
import { RecentTransactions } from '@/components/inventory/RecentTransactions'
import { InventoryValueChart } from '@/components/inventory/InventoryValueChart'
import { InventoryKpiGrid } from '@/components/inventory/hub/InventoryKpiGrid'
import { InventoryForecastWidget } from '@/components/inventory/hub/InventoryForecastWidget'
import { InventoryTopConsumedWidget } from '@/components/inventory/hub/InventoryTopConsumedWidget'
import { CombinedStockAlerts } from '@/components/inventory/hub/CombinedStockAlerts'
import { InventoryTodoCard } from '@/components/inventory/hub/InventoryTodoCard'

// Lazy — only renders in chain mode (component guards itself)
const InventoryHotelBreakdown = lazy(() =>
  import('@/components/inventory/hub/InventoryHotelBreakdown').then((m) => ({
    default: m.InventoryHotelBreakdown,
  })),
)

interface Props {
  onNavigate: (tab: string, sub?: string) => void
}

/**
 * Task-first overview:
 *   1. "Việc cần làm hôm nay" (TodoCard)  ← answers "what now?"
 *   2. KPI grid (4 compact tiles)         ← background context
 *   3. Chart + Forecast / Top + Alerts    ← deeper look
 *   4. Recent transactions                ← audit trail
 *   5. Hotel breakdown (chain mode only, lazy)
 */
export function InventoryOverviewSection({ onNavigate }: Props) {
  return (
    <div className="font-body space-y-4">
      {/* 1. Việc cần làm hôm nay */}
      <InventoryTodoCard onNavigate={onNavigate} />

      {/* 2. Tình hình kho — compact KPI grid */}
      <InventoryKpiGrid onNavigate={onNavigate} />

      {/* 3. Bento — chart + insights */}
      <div className="grid gap-3 lg:grid-cols-12 lg:auto-rows-[152px]">
        <div className="rounded-xl border border-border/70 bg-card overflow-hidden lg:col-span-8 lg:row-span-2 shadow-tile">
          <InventoryValueChart />
        </div>
        <div className="rounded-xl border border-border/70 bg-card overflow-hidden lg:col-span-4 lg:row-span-2 shadow-tile">
          <InventoryForecastWidget />
        </div>
        <div className="rounded-xl border border-border/70 bg-card overflow-hidden lg:col-span-7 lg:row-span-2 shadow-tile">
          <InventoryTopConsumedWidget />
        </div>
        <div
          id="low-stock-section"
          className="rounded-xl border border-border/70 bg-card overflow-hidden lg:col-span-5 lg:row-span-2 shadow-tile"
        >
          <CombinedStockAlerts />
        </div>
      </div>

      {/* 4. Recent transactions */}
      <div className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-tile">
        <RecentTransactions />
      </div>

      {/* 5. Hotel breakdown — chain mode only, lazy */}
      <Suspense fallback={null}>
        <InventoryHotelBreakdown />
      </Suspense>
    </div>
  )
}
