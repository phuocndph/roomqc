import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Download, Search, Eye, Package, TrendingUp, TrendingDown } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { TransactionTypeBadge } from '@/components/inventory/TransactionTypeBadge'
import { TransactionDetailDialog } from '@/components/inventory/TransactionDetailDialog'
import { useInventoryTransactions } from '@/hooks/useInventoryTransactions'

import { format } from 'date-fns'
import { vi, enUS } from 'date-fns/locale'
import { useBreakpoint } from '@/lib/breakpoints'
import { useQueryClient } from '@tanstack/react-query'
import type { TransactionType, InventoryFilters } from '@/types/inventory.types'
import { PullToRefresh } from '@/components/mobile/PullToRefresh'
import { MobileFilterSheet } from '@/components/inventory/MobileFilterSheet'
import { MobileTransactionCard } from '@/components/inventory/MobileTransactionCard'
import { navigateBack } from '@/lib/navigation'
import { TransactionListSkeleton } from '@/components/inventory/TransactionCardSkeleton'
import { EmptyTransactions } from '@/components/inventory/EmptyTransactions'
import { useInView } from 'react-intersection-observer'

export function TransactionListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isMobile } = useBreakpoint()
  const { t, i18n } = useTranslation(['inventory', 'common'])
  const queryClient = useQueryClient()
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null)
  const [filters, setFilters] = useState<InventoryFilters>(() => {
    const typeParam = searchParams.get('type')
    const transactionType = typeParam === 'adjustment' ? 'adjust' : typeParam
    return {
      search: searchParams.get('search') || '',
      transaction_type: transactionType === 'in' || transactionType === 'out' || transactionType === 'adjust'
        ? transactionType
        : undefined,
      category_id: '',
      created_by: '',
      date_from: undefined,
      date_to: undefined,
    }
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  
  const { data, isLoading, isFetching } = useInventoryTransactions(filters, page, pageSize)
  
  const transactions = data?.transactions || []
  const totalPages = data?.totalPages || 0
  const hasNextPage = page < totalPages
  
  const dateLocale = i18n.language === 'vi' ? vi : enUS
  
  // Infinite scroll
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '100px',
  })

  useEffect(() => {
    if (inView && hasNextPage && !isFetching && isMobile) {
      setPage(prev => prev + 1)
    }
  }, [inView, hasNextPage, isFetching, isMobile])
  
  const summary = transactions.reduce(
    (acc, t) => {
      if (t.transaction_type === 'in') {
        acc.totalIn += t.quantity
      } else if (t.transaction_type === 'out') {
        acc.totalOut += Math.abs(t.quantity)
      }
      return acc
    },
    { totalIn: 0, totalOut: 0 }
  )

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
  }

  const handleFilterByCategory = (category: string) => {
    setFilters({ ...filters, category_id: category })
  }

  // Mobile View
  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="space-y-3">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => navigateBack(navigate, '/inventory')}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-base font-semibold">{t('transactionHistory')}</h1>
                  <p className="text-xs text-muted-foreground">
                    {data?.total || 0} giao dịch
                  </p>
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex gap-4 px-3 text-xs">
              <div className="flex items-center gap-1">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{data?.total || 0}</span>
              </div>
              <div className="flex items-center gap-1 text-green-600">
                <TrendingDown className="h-3.5 w-3.5" />
                <span className="font-medium">+{summary.totalIn}</span>
              </div>
              <div className="flex items-center gap-1 text-amber-600">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="font-medium">-{summary.totalOut}</span>
              </div>
            </div>

            {/* Mobile Filter */}
            <div className="px-3">
              <MobileFilterSheet filters={filters} onFiltersChange={setFilters} />
            </div>

            {/* Transaction Cards */}
            <div className="px-3 space-y-2">
              {isLoading ? (
                <TransactionListSkeleton count={5} />
              ) : transactions.length === 0 ? (
                <EmptyTransactions />
              ) : (
                <>
                  {transactions.map((transaction) => (
                    <MobileTransactionCard
                      key={transaction.id}
                      transaction={{
                        id: transaction.id,
                        transaction_code: transaction.transaction_code,
                        transaction_type: transaction.transaction_type as 'in' | 'out' | 'adjustment',
                        transaction_category: transaction.transaction_category,
                        item_name: transaction.item_name,
                        item_code: transaction.item_code,
                        quantity: transaction.quantity,
                        created_at: transaction.created_at,
                        created_by_name: transaction.created_by_name,
                        from_location: transaction.from_location,
                        to_location: transaction.to_location,
                      }}
                      onClick={() => setSelectedTransaction(transaction.id)}
                    />
                  ))}
                  
                  {/* Infinite scroll trigger */}
                  {hasNextPage && (
                    <div ref={loadMoreRef} className="py-3">
                      {isFetching && <TransactionListSkeleton count={2} />}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </PullToRefresh>

        {/* Transaction Detail Dialog */}
        {selectedTransaction && (
          <TransactionDetailDialog
            transactionId={selectedTransaction}
            open={!!selectedTransaction}
            onOpenChange={(open) => !open && setSelectedTransaction(null)}
          />
        )}
      </div>
    )
  }

  // Desktop View
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('transactionHistory')}
        description={t('transactionHistoryDesc')}
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigateBack(navigate, '/inventory')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('back')}
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            {t('exportExcel')}
          </Button>
        </div>
      </PageHeader>
      
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <Package className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">{t('stats.totalTransactions')}</p>
            <p className="text-xl font-bold">{data?.total || 0}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <TrendingDown className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-xs text-muted-foreground">{t('stats.totalIn')}</p>
            <p className="text-xl font-bold text-green-600">+{summary.totalIn}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <TrendingUp className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-xs text-muted-foreground">{t('stats.totalOut')}</p>
            <p className="text-xl font-bold text-amber-600">-{summary.totalOut}</p>
          </div>
        </div>
      </div>
      
      <div className="border rounded-lg p-3">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('filters.searchPlaceholder')}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10 h-9"
            />
          </div>
          
          <DateRangePicker
            value={{
              from: filters.date_from,
              to: filters.date_to,
            }}
            onChange={(range) => 
              setFilters({
                ...filters,
                date_from: range.from || undefined,
                date_to: range.to || undefined,
              })
            }
          />
          
          <Select
            value={filters.transaction_type || "all"}
            onValueChange={(value) => 
              setFilters({ ...filters, transaction_type: value === "all" ? undefined : value as any })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={t('fields.transactionType')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('transactionType.all')}</SelectItem>
              <SelectItem value="in">{t('transactionLabel.in')}</SelectItem>
              <SelectItem value="out">{t('transactionLabel.out')}</SelectItem>
              <SelectItem value="adjustment">{t('transactionType.adjustment')}</SelectItem>
            </SelectContent>
          </Select>
          
          <Select
            value={filters.category_id || "all"}
            onValueChange={(value) => 
              setFilters({ ...filters, category_id: value === "all" ? "" : value })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={t('filters.category')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.all')}</SelectItem>
              <SelectItem value="purchase">{t('category.purchase')}</SelectItem>
              <SelectItem value="return">{t('category.return')}</SelectItem>
              <SelectItem value="room_assign">{t('category.room_assign')}</SelectItem>
              <SelectItem value="staff_assign">{t('category.staff_assign')}</SelectItem>
              <SelectItem value="laundry">{t('category.laundry')}</SelectItem>
              <SelectItem value="maintenance">{t('category.maintenance')}</SelectItem>
              <SelectItem value="disposal">{t('category.disposal')}</SelectItem>
              <SelectItem value="other">{t('category.other')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="border rounded-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p>{t('loading')}</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">{t('noTransactions')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t('table.code')}</TableHead>
                  <TableHead className="text-xs">{t('table.type')}</TableHead>
                  <TableHead className="text-xs">{t('table.item')}</TableHead>
                  <TableHead className="text-xs">{t('table.quantity')}</TableHead>
                  <TableHead className="text-xs">{t('table.location')}</TableHead>
                  <TableHead className="text-xs">{t('table.creator')}</TableHead>
                  <TableHead className="text-xs">{t('table.date')}</TableHead>
                  <TableHead className="text-xs text-right">{t('table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs py-2">
                      {transaction.transaction_code}
                    </TableCell>
                    <TableCell className="py-2">
                      <TransactionTypeBadge type={transaction.transaction_type === 'adjustment' ? 'adjust' : transaction.transaction_type as TransactionType} />
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2">
                        {transaction.item_images?.[0] && (
                          <img 
                            src={transaction.item_images[0]} 
                            alt={transaction.item_name}
                            className="h-6 w-6 rounded object-cover"
                          />
                        )}
                        <div>
                          <p className="text-sm">{transaction.item_name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <span className={transaction.transaction_type === 'in' ? 'text-green-600 font-medium text-sm' : 'text-amber-600 font-medium text-sm'}>
                        {transaction.transaction_type === 'in' ? '+' : '-'}{Math.abs(transaction.quantity)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs py-2">
                      {transaction.from_location && <div>{transaction.from_location}</div>}
                      {transaction.to_location && <div>→ {transaction.to_location}</div>}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={transaction.created_by_avatar} />
                          <AvatarFallback className="text-[10px]">
                            {transaction.created_by_name?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs">{transaction.created_by_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs py-2">
                      {transaction.created_at ? format(new Date(transaction.created_at), 'dd/MM HH:mm', { locale: dateLocale }) : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setSelectedTransaction(transaction.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      
      {/* Pagination */}
      {transactions.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {t('pagination.showing')} {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, data?.total || 0)} {t('pagination.of')} {data?.total || 0}
            </p>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                setPageSize(parseInt(value))
                setPage(1)
              }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              {t('pagination.prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={!hasNextPage}
            >
              {t('pagination.next')}
            </Button>
          </div>
        </div>
      )}

      {/* Transaction Detail Dialog */}
      {selectedTransaction && (
        <TransactionDetailDialog
          transactionId={selectedTransaction}
          open={!!selectedTransaction}
          onOpenChange={(open) => !open && setSelectedTransaction(null)}
        />
      )}
    </div>
  )
}
