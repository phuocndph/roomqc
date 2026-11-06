import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, ArrowUpFromLine, ArrowRight, Clock, Package, type LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { TransactionDetailDialog } from './TransactionDetailDialog'
import { useInventoryTransactions } from '@/hooks/useInventoryTransactions'
import { format, isValid } from 'date-fns'
import { InventoryPanelError } from './hub/InventoryPanelError'
import { cn } from '@/lib/utils'

const types: Record<string, { label: string; icon: LucideIcon }> = {
  in: { label: 'Nhập kho', icon: ArrowDownToLine },
  out: { label: 'Xuất kho', icon: ArrowUpFromLine },
  transfer: { label: 'Chuyển kho', icon: Package },
  adjust: { label: 'Điều chỉnh', icon: Package },
  damaged: { label: 'Hư hỏng', icon: Package },
  lost: { label: 'Thất thoát', icon: Package },
}

export function RecentTransactions() {
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null)
  const query = useInventoryTransactions({}, 1, 5)
  const transactions = query.data?.transactions ?? []

  return <>
    <section aria-labelledby="inv-recent-heading" className="min-w-0 border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 id="inv-recent-heading" className="font-semibold">Giao dịch gần đây</h2>
        <Link to="/inventory/transactions" className="inline-flex items-center gap-1 py-1 text-sm font-medium text-primary hover:underline">Xem lịch sử<ArrowRight className="h-4 w-4" /></Link>
      </header>
      {query.isLoading ? <div className="space-y-3 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        : query.isError ? <InventoryPanelError message="Không tải được lịch sử giao dịch." onRetry={() => void query.refetch()} />
        : transactions.length === 0 ? <div className="flex items-center gap-3 p-5"><Clock className="h-5 w-5 shrink-0 text-muted-foreground" /><p className="text-sm text-muted-foreground">Chưa có giao dịch nhập, xuất kho.</p></div>
        : <ul className="divide-y">{transactions.map(transaction => {
          const type = types[transaction.transaction_type] ?? { label: 'Giao dịch', icon: Package }
          const Icon = type.icon
          const incoming = transaction.transaction_type === 'in'
          const outgoing = ['out', 'damaged', 'lost'].includes(transaction.transaction_type)
          const quantity = incoming ? `+${Math.abs(transaction.quantity)}` : outgoing ? `−${Math.abs(transaction.quantity)}` : String(transaction.quantity)
          const date = new Date(transaction.created_at)
          return <li key={transaction.id}><button type="button" onClick={() => setSelectedTransaction(transaction.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', incoming ? 'text-green-700 dark:text-green-400' : outgoing ? 'text-amber-800 dark:text-amber-400' : 'text-muted-foreground')} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{transaction.item_name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{type.label} · {isValid(date) ? format(date, 'dd/MM HH:mm') : 'Chưa có thời gian'}</span></span>
            <span className="shrink-0 font-semibold tabular-nums">{quantity}</span>
            <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button></li>
        })}</ul>}
    </section>
    {selectedTransaction && <TransactionDetailDialog transactionId={selectedTransaction} open onOpenChange={open => !open && setSelectedTransaction(null)} />}
  </>
}
