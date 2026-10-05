import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { 
  Download, 
  Upload, 
  Clock,
  ArrowRight,
  Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TransactionDetailDialog } from './TransactionDetailDialog'
import { useInventoryTransactions } from '@/hooks/useInventoryTransactions'
import { formatDistanceToNow } from 'date-fns'
import { vi, enUS } from 'date-fns/locale'
import { cn } from '@/lib/utils'

const transactionIcons: Record<string, any> = {
  in: Download,
  out: Upload,
}

function truncateCode(code: string): string {
  if (!code) return ''
  const parts = code.split('-')
  if (parts.length >= 2) {
    return `#${parts[parts.length - 1].slice(-4)}`
  }
  return `#${code.slice(-4)}`
}

export function RecentTransactions() {
  const { t, i18n } = useTranslation(['inventory'])
  const navigate = useNavigate()
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null)
  const dateLocale = i18n.language === 'vi' ? vi : enUS
  
  const { data, isLoading } = useInventoryTransactions({}, 1, 8)
  const transactions = data?.transactions || []
  
  if (isLoading) {
    return (
      <div className="border rounded-lg p-3 h-full">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    )
  }
  
  return (
    <>
      <div className="border rounded-lg p-3 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t('recentTransactions.title')}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => navigate('/inventory/transactions')}
          >
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
        
        {/* Content */}
        {transactions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-6">
            <Clock className="h-6 w-6 text-muted-foreground/50" />
            <p className="mt-2 text-xs text-muted-foreground">
              {t('recentTransactions.noTransactions')}
            </p>
          </div>
        ) : (
          <div className="space-y-1 flex-1 overflow-y-auto max-h-[300px]">
            {transactions.map((transaction) => {
              const Icon = transactionIcons[transaction.transaction_type] || Package
              const isIn = transaction.transaction_type === 'in'
              
              return (
                <div
                  key={transaction.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer text-sm"
                  onClick={() => setSelectedTransaction(transaction.id)}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isIn ? "text-green-600" : "text-amber-600")} />
                  
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{transaction.item_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(transaction.created_at), {
                        addSuffix: true,
                        locale: dateLocale,
                      })}
                    </p>
                  </div>
                  
                  <span className={cn(
                    "text-xs font-medium shrink-0",
                    isIn ? "text-green-600" : "text-amber-600"
                  )}>
                    {isIn ? '+' : '-'}{Math.abs(transaction.quantity)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      
      <TransactionDetailDialog
        transactionId={selectedTransaction}
        open={!!selectedTransaction}
        onOpenChange={(open) => !open && setSelectedTransaction(null)}
      />
    </>
  )
}
