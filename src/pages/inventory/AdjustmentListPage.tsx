import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { 
  ArrowLeft, 
  Plus, 
  ClipboardCheck,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  RefreshCw,
  Package,
  Loader2
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useStockAdjustments } from '@/hooks/useStockAdjustments'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileAdjustmentCard } from '@/components/inventory/MobileAdjustmentCard'
import { navigateBack } from '@/lib/navigation'

const statusConfig = {
  draft: { icon: Clock, color: 'text-muted-foreground', label: 'Nháp' },
  in_progress: { icon: ClipboardCheck, color: 'text-blue-600', label: 'Đang kiểm' },
  completed: { icon: Clock, color: 'text-yellow-600', label: 'Chờ duyệt' },
  approved: { icon: CheckCircle, color: 'text-green-600', label: 'Đã duyệt' },
  rejected: { icon: XCircle, color: 'text-red-600', label: 'Từ chối' },
}

export function AdjustmentListPage() {
  const navigate = useNavigate()
  const { t } = useTranslation('inventory')
  const { isMobile } = useBreakpoint()
  const [status, setStatus] = useState<string>('all')
  const [filters, setFilters] = useState({
    date_from: null as Date | null,
    date_to: null as Date | null,
  })
  const [page, setPage] = useState(1)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  const { data, isLoading, refetch } = useStockAdjustments(
    {
      status: status === 'all' ? undefined : (status as any),
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
    },
    page,
    25
  )
  
  const adjustments = data?.adjustments || []

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refetch()
    setIsRefreshing(false)
  }

  // Mobile view
  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pb-20">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-3 py-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateBack(navigate, '/inventory')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-base font-semibold">{t('adjustment.title')}</h1>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} disabled={isRefreshing} aria-label="Làm mới">
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
              <Button size="icon" className="h-8 w-8" onClick={() => navigate('/inventory/adjustments/new')}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto px-3 py-2">
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs h-7 px-2">{t('adjustment.tabs.all')}</TabsTrigger>
              <TabsTrigger value="draft" className="text-xs h-7 px-2">{t('adjustment.tabs.draft')}</TabsTrigger>
              <TabsTrigger value="in_progress" className="text-xs h-7 px-2">{t('adjustment.tabs.in_progress')}</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs h-7 px-2">{t('adjustment.tabs.completed')}</TabsTrigger>
              <TabsTrigger value="approved" className="text-xs h-7 px-2">{t('adjustment.tabs.approved')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        <div className="px-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : adjustments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">{t('adjustment.noAdjustments')}</p>
              <Button size="sm" className="mt-3" onClick={() => navigate('/inventory/adjustments/new')}>
                <Plus className="h-4 w-4 mr-1" />
                {t('adjustment.new')}
              </Button>
            </div>
          ) : (
            adjustments.map((adjustment) => (
              <MobileAdjustmentCard
                key={adjustment.id}
                adjustment={adjustment}
                onClick={() => navigate(`/inventory/adjustments/${adjustment.id}`)}
              />
            ))
          )}
        </div>
      </div>
    )
  }
  
  // Desktop view
  return (
    <div className="space-y-4">
      <PageHeader
        title={t('adjustment.title')}
        description={t('adjustment.description')}
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateBack(navigate, '/inventory')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t('back')}
          </Button>
          <Button size="sm" onClick={() => navigate('/inventory/adjustments/new')}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('adjustment.new')}
          </Button>
        </div>
      </PageHeader>
      
      {/* Filters */}
      <div className="flex items-center justify-between gap-4 border rounded-lg p-3">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs h-7">{t('adjustment.tabs.all')}</TabsTrigger>
            <TabsTrigger value="draft" className="text-xs h-7">{t('adjustment.tabs.draft')}</TabsTrigger>
            <TabsTrigger value="in_progress" className="text-xs h-7">{t('adjustment.tabs.in_progress')}</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs h-7">{t('adjustment.tabs.completed')}</TabsTrigger>
            <TabsTrigger value="approved" className="text-xs h-7">{t('adjustment.tabs.approved')}</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <DateRangePicker
          value={{
            from: filters.date_from,
            to: filters.date_to,
          }}
          onChange={(range) => 
            setFilters({
              date_from: range?.from || null,
              date_to: range?.to || null,
            })
          }
        />
      </div>
      
      {/* Table */}
      <div className="border rounded-lg">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t('adjustment.table.code')}</TableHead>
                <TableHead className="text-xs">{t('adjustment.table.type')}</TableHead>
                <TableHead className="text-xs">{t('adjustment.table.date')}</TableHead>
                <TableHead className="text-xs">{t('adjustment.table.creator')}</TableHead>
                <TableHead className="text-xs">{t('adjustment.table.assignee')}</TableHead>
                <TableHead className="text-xs text-center">{t('adjustment.table.totalItems')}</TableHead>
                <TableHead className="text-xs text-center">{t('adjustment.table.discrepancy')}</TableHead>
                <TableHead className="text-xs text-right">{t('adjustment.table.valueDiff')}</TableHead>
                <TableHead className="text-xs">{t('adjustment.table.status')}</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : adjustments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">
                    {t('adjustment.noAdjustments')}
                  </TableCell>
                </TableRow>
              ) : (
                adjustments.map((adjustment: any) => {
                  const statusInfo = statusConfig[adjustment.status as keyof typeof statusConfig]
                  const StatusIcon = statusInfo?.icon || Clock
                  const typeKey = `adjustment.type.${adjustment.adjustment_type}` as const
                  
                  return (
                    <TableRow
                      key={adjustment.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50",
                        adjustment.status === 'completed' && "bg-yellow-50 dark:bg-yellow-950/20"
                      )}
                      onClick={() => navigate(`/inventory/adjustments/${adjustment.id}`)}
                    >
                      <TableCell className="font-medium text-sm py-2">
                        {adjustment.adjustment_code}
                      </TableCell>
                      <TableCell className="text-sm py-2">
                        {t(typeKey)}
                      </TableCell>
                      <TableCell className="text-sm py-2">
                        {adjustment.scheduled_date && format(new Date(adjustment.scheduled_date), 'dd/MM/yyyy', { locale: vi })}
                      </TableCell>
                      <TableCell className="text-sm py-2">
                        {adjustment.created_by_name || 'N/A'}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex -space-x-1.5">
                          {adjustment.assigned_to?.slice(0, 3).map((userId: string, i: number) => (
                            <Avatar key={i} className="h-5 w-5 border border-background">
                              <AvatarFallback className="text-[10px]">
                                {userId.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {adjustment.assigned_to && adjustment.assigned_to.length > 3 && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-background bg-muted text-[10px]">
                              +{adjustment.assigned_to.length - 3}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm py-2">
                        <span className="font-medium">{adjustment.total_items_checked || 0}</span>
                        <span className="text-muted-foreground">/{adjustment.total_items || 0}</span>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        {adjustment.total_discrepancies > 0 ? (
                          <span className="text-red-600 font-medium text-sm">{adjustment.total_discrepancies}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right py-2">
                        {adjustment.total_value_difference !== 0 ? (
                          <span className={cn(
                            'font-medium text-sm',
                            adjustment.total_value_difference > 0 ? 'text-green-600' : 'text-red-600'
                          )}>
                            {adjustment.total_value_difference > 0 ? '+' : ''}
                            {formatCurrency(Math.abs(adjustment.total_value_difference))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className={cn('flex items-center gap-1 text-xs', statusInfo?.color)}>
                          <StatusIcon className="h-3 w-3" />
                          {statusInfo?.label || adjustment.status}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (adjustment.status === 'draft' || adjustment.status === 'in_progress') {
                              navigate(`/inventory/adjustments/${adjustment.id}/check`)
                            } else {
                              navigate(`/inventory/adjustments/${adjustment.id}`)
                            }
                          }}
                        >
                          {adjustment.status === 'draft' || adjustment.status === 'in_progress' ? (
                            <ClipboardCheck className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
