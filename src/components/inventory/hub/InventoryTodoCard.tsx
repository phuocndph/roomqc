import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useInventoryHubBadges } from '@/hooks/useInventoryHubBadges'
import { InventoryPanelError } from './InventoryPanelError'
import { cn } from '@/lib/utils'

interface Props { onNavigate: (tab: string, sub?: string) => void }

export function InventoryTodoCard({ onNavigate }: Props) {
  const query = useInventoryHubBadges()
  const badges = query.data
  const rows = [
    { count: badges?.distributionsPending ?? 0, title: 'Phiếu xuất cần xử lý', hint: (badges?.distributionsStale ?? 0) > 0 ? `${badges?.distributionsStale} phiếu đã chờ hơn 24 giờ` : 'Chờ duyệt, đang chuẩn bị hoặc chờ nhận hàng', sub: 'outbound', stale: (badges?.distributionsStale ?? 0) > 0 },
    { count: badges?.reorderPending ?? 0, title: 'Đề xuất bổ sung chờ duyệt', hint: 'Xem và duyệt đề xuất đặt hàng', sub: 'reorder', stale: false },
    { count: badges?.adjustmentsPending ?? 0, title: 'Kiểm kê đang xử lý', hint: 'Tiếp tục kiểm kê hoặc hoàn tất phiếu', sub: 'adjustments', stale: false },
  ].filter(row => row.count > 0).sort((a, b) => Number(b.stale) - Number(a.stale))

  return <section aria-labelledby="inv-todo-heading" className="min-w-0 border bg-card">
    <header className="border-b px-4 py-3">
      <h2 id="inv-todo-heading" className="font-semibold">Phiếu cần xử lý</h2>
      <p className="mt-1 text-xs text-muted-foreground">Ưu tiên phiếu đang chờ và chưa hoàn tất.</p>
    </header>
    {query.isLoading ? <div className="space-y-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      : query.isError ? <InventoryPanelError message="Không tải được các phiếu chờ xử lý." onRetry={() => void query.refetch()} />
      : !badges ? <p className="p-4 text-sm text-muted-foreground">Chọn khách sạn để xem phiếu kho.</p>
      : rows.length === 0 ? <div className="flex items-start gap-3 p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700 dark:text-green-400" />
        <div><p className="text-sm font-medium">Không có phiếu chờ xử lý</p><p className="mt-1 text-sm text-muted-foreground">Các phiếu xuất, bổ sung và kiểm kê đã được xử lý.</p></div>
      </div>
      : <div className="divide-y">{rows.map(row => <button key={row.sub} type="button" onClick={() => onNavigate('operations', row.sub)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className={cn('min-w-8 text-xl font-bold tabular-nums', row.stale ? 'text-red-700 dark:text-red-400' : 'text-foreground')}>{row.count}</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{row.title}</span><span className="mt-1 block text-xs text-muted-foreground">{row.hint}</span></span>
        <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
      </button>)}</div>}
  </section>
}
