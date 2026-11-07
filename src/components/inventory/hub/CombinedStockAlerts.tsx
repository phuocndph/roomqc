import { Link, useNavigate } from 'react-router-dom'
import { Package, Plus } from 'lucide-react'
import { useLowStockItems, useInventoryDashboard } from '@/hooks/useInventoryDashboard'
import { useCanAccess } from '@/components/auth/PermissionRoute'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InventoryPanelError } from './InventoryPanelError'
import { cn } from '@/lib/utils'

export function CombinedStockAlerts() {
  const navigate = useNavigate()
  const query = useLowStockItems(50)
  const dashboard = useInventoryDashboard()
  const { canCreate } = useCanAccess('items', ['create'])
  const items = query.data ?? []
  const emptyCatalog = !dashboard.isError && dashboard.data?.total_product_types === 0

  return <section id="low-stock-section" aria-labelledby="inv-stock-heading" className="min-w-0 border bg-card">
    <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
      <div><h2 id="inv-stock-heading" className="font-semibold">Hàng cần bổ sung</h2><p className="mt-1 text-xs text-muted-foreground">Mặt hàng có tồn kho dưới định mức tối thiểu.</p></div>
      <Link to="/items?stockStatus=low_stock" className="py-1 text-sm font-medium text-primary hover:underline">Xem tất cả</Link>
    </header>
    {query.isLoading ? <div className="space-y-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      : query.isError ? <InventoryPanelError onRetry={() => void query.refetch()} />
      : !query.data ? <p className="p-4 text-sm text-muted-foreground">Chọn khách sạn để xem tồn kho.</p>
      : emptyCatalog ? <div className="flex items-start gap-3 p-5">
        <Package className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div><p className="text-sm font-medium">Kho chưa có mặt hàng</p><p className="mt-1 text-sm text-muted-foreground">Thêm mặt hàng trước, sau đó nhập số lượng vào kho.</p>
          {canCreate && <Button asChild size="sm" variant="outline" className="mt-3"><Link to="/items/new"><Plus className="h-4 w-4" />Thêm mặt hàng</Link></Button>}
        </div>
      </div>
      : items.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Không có mặt hàng nào dưới định mức.</p>
      : <div>
        <div className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] gap-2 px-4 py-2 text-xs text-muted-foreground"><span>Mặt hàng</span><span className="text-right">Tồn</span><span className="text-right">Tối thiểu</span></div>
        <ul className="divide-y border-t">{items.slice(0, 6).map(item => <li key={item.id}>
          <button type="button" onClick={() => navigate(`/items/${item.id}`)} className="grid w-full grid-cols-[minmax(0,1fr)_4rem_4rem] items-center gap-2 px-4 py-3 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <span className="min-w-0"><span className="block truncate font-medium">{item.name}</span><span className="block truncate text-xs text-muted-foreground">{item.code}</span></span>
            <span className={cn('text-right font-semibold tabular-nums', item.quantity_in_stock === 0 ? 'text-red-700 dark:text-red-400' : 'text-amber-800 dark:text-amber-400')}>{item.quantity_in_stock}</span>
            <span className="text-right tabular-nums">{item.minimum_stock}</span>
          </button>
        </li>)}</ul>
        {items.length > 6 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Đang hiển thị 6 mặt hàng. Chọn “Xem tất cả” để xem đầy đủ.</p>}
      </div>}
  </section>
}
