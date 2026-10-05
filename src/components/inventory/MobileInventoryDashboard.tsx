import { MobileInventoryHero } from './MobileInventoryHero'
import { MobilePrimaryActions } from './MobilePrimaryActions'
import { MobileSecondaryActions } from './MobileSecondaryActions'
import { MobileRecentTransactions } from './MobileRecentTransactions'
import { InventoryTodoCard } from './hub/InventoryTodoCard'
import { CombinedStockAlerts } from './hub/CombinedStockAlerts'
import { InventoryQuickSearch } from './hub/InventoryQuickSearch'
import { useInventoryDashboard } from '@/hooks/useInventoryDashboard'
import { useNavigate } from 'react-router-dom'

export function MobileInventoryDashboard() {
  const { isLoading } = useInventoryDashboard()
  const navigate = useNavigate()

  // Bridge between TodoCard's onNavigate(tab, sub) signature and the
  // mobile route layout. Same URL contract the desktop hub uses.
  const handleNavigate = (tab: string, sub?: string) => {
    const params = new URLSearchParams({ tab })
    if (sub) params.set('sub', sub)
    navigate(`/inventory?${params.toString()}`)
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="h-32 bg-gradient-to-br from-primary/20 to-primary/5 animate-pulse rounded-2xl" />
        <div className="h-40 bg-muted animate-pulse rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 bg-muted animate-pulse rounded-2xl" />
          <div className="h-16 bg-muted animate-pulse rounded-2xl" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-32">
      <MobileInventoryHero />

      {/* Quick search — đồng nhất với desktop hub */}
      <div className="px-4">
        <InventoryQuickSearch />
      </div>

      {/* Task-first hero — đồng nhất với desktop hub */}
      <div className="px-4">
        <InventoryTodoCard onNavigate={handleNavigate} />
      </div>

      <MobilePrimaryActions />
      <MobileSecondaryActions />

      {/* Cảnh báo tồn kho (gộp critical + low-stock + dead) */}
      <div className="px-4">
        <CombinedStockAlerts />
      </div>

      <MobileRecentTransactions />
    </div>
  )
}
