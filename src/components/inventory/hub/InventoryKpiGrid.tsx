import { useNavigate } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInventoryDashboard } from '@/hooks/useInventoryDashboard'
import { Skeleton } from '@/components/ui/skeleton'
import { InventoryPanelError } from './InventoryPanelError'

const number = new Intl.NumberFormat('vi-VN')
function formatVnd(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} tỷ ₫`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} triệu ₫`
  return number.format(value) + ' ₫'
}

interface Props {
  onNavigate: (tab: string, sub?: string) => void
}

export function InventoryKpiGrid({ onNavigate }: Props) {
  const navigate = useNavigate()
  const query = useInventoryDashboard()
  const stats = query.data

  if (query.isLoading) return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Đang tải số liệu kho">
    {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
  </div>
  if (query.isError) return <div className="border bg-card"><InventoryPanelError message="Không tải được số liệu tổng quan." onRetry={() => void query.refetch()} /></div>

  const tiles = [
    { label: 'Giá trị tồn kho', value: stats ? formatVnd(stats.total_stock_value) : '—', hint: 'Giá trị hàng đang có', onClick: () => onNavigate('analytics', 'consumption') },
    { label: 'Mặt hàng', value: stats ? number.format(stats.total_product_types) : '—', hint: 'Xem danh sách hàng hóa', onClick: () => navigate('/items') },
    { label: 'Cần bổ sung', value: stats ? number.format(stats.low_stock_count) : '—', hint: 'Tồn kho dưới định mức', alert: (stats?.low_stock_count ?? 0) > 0, onClick: () => navigate('/items?stockStatus=low_stock') },
    { label: 'Giao dịch hôm nay', value: stats ? number.format(stats.today_transactions?.total ?? 0) : '—', hint: stats ? `${stats.today_transactions?.in ?? 0} nhập · ${stats.today_transactions?.out ?? 0} xuất` : 'Chưa có dữ liệu', onClick: () => onNavigate('operations', 'transactions') },
  ]

  return <section aria-label="Tình hình kho" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {tiles.map(tile => <button key={tile.label} type="button" onClick={tile.onClick} className="group relative min-w-0 border bg-card p-4 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="block pr-4 text-sm font-medium text-muted-foreground">{tile.label}</span>
      <span className={cn('mt-2 block break-words text-2xl font-bold tabular-nums tracking-tight', tile.alert && 'text-red-700 dark:text-red-400')}>{tile.value}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{tile.hint}</span>
      <ArrowUpRight aria-hidden="true" className="absolute right-3 top-4 h-4 w-4 text-muted-foreground group-hover:text-primary" />
    </button>)}
  </section>
}
