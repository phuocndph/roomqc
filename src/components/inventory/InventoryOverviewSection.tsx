import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { RecentTransactions } from './RecentTransactions'
import { InventoryKpiGrid } from './hub/InventoryKpiGrid'
import { CombinedStockAlerts } from './hub/CombinedStockAlerts'
import { InventoryTodoCard } from './hub/InventoryTodoCard'

const InventoryValueChart = lazy(() => import('./InventoryValueChart').then(m => ({ default: m.InventoryValueChart })))
const InventoryForecastWidget = lazy(() => import('./hub/InventoryForecastWidget').then(m => ({ default: m.InventoryForecastWidget })))
const InventoryTopConsumedWidget = lazy(() => import('./hub/InventoryTopConsumedWidget').then(m => ({ default: m.InventoryTopConsumedWidget })))
const InventoryHotelBreakdown = lazy(() => import('./hub/InventoryHotelBreakdown').then(m => ({ default: m.InventoryHotelBreakdown })))

interface Props {
  onNavigate: (tab: string, sub?: string) => void
}

export function InventoryOverviewSection({ onNavigate }: Props) {
  const [analysisOpen, setAnalysisOpen] = useState(false)

  return <div className="space-y-5">
    <InventoryKpiGrid onNavigate={onNavigate} />
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
      <InventoryTodoCard onNavigate={onNavigate} />
      <CombinedStockAlerts />
    </div>
    <RecentTransactions />
    <details className="group border bg-card" onToggle={e => setAnalysisOpen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span><span className="block font-semibold">Phân tích kho</span><span className="mt-1 block text-sm text-muted-foreground">Giá trị tồn kho, dự báo và mức tiêu thụ</span></span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      {analysisOpen && <div className="space-y-4 border-t p-4">
        <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
          <Link to="/inventory/analytics" className="font-medium text-primary hover:underline">Phân tích tiêu thụ</Link>
          <Link to="/inventory/dead-stock" className="font-medium text-primary hover:underline">Hàng tồn trên 90 ngày</Link>
        </div>
        <Suspense fallback={<p className="py-6 text-sm text-muted-foreground">Đang tải phân tích…</p>}>
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <div className="min-w-0"><InventoryValueChart /></div>
            <div className="min-w-0 space-y-4"><InventoryForecastWidget /><InventoryTopConsumedWidget /></div>
          </div>
        </Suspense>
      </div>}
    </details>
    <Suspense fallback={null}><InventoryHotelBreakdown /></Suspense>
  </div>
}
