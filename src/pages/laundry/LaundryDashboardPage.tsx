import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Inbox, PackageCheck, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { LaundryExpenseChart } from '@/components/laundry/LaundryExpenseChart'
import { ActiveBatchesTable } from '@/components/laundry/ActiveBatchesTable'
import { VendorPerformanceTable } from '@/components/laundry/VendorPerformanceTable'
import { LaundryRequestsTab } from '@/components/laundry/LaundryRequestsTab'
import { useLaundryDashboardStats } from '@/hooks/useLaundryDashboard'
import { useLaundryBatches } from '@/hooks/useLaundryBatches'
import { usePendingLaundryRequestsCount } from '@/hooks/useLaundryRequests'
import { formatCurrency } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { sortLaundryBatches } from '@/lib/laundryPresentation'

export function LaundryDashboardPage() {
  const [params, setParams] = useSearchParams()
  const [showAnalysis, setShowAnalysis] = useState(false)
  const activeTab = params.get('tab') === 'requests' ? 'requests' : 'batches'
  const sendBatchId = params.get('sendBatch')
  const statsQuery = useLaundryDashboardStats()
  const readyQuery = useLaundryBatches({ status: 'ready' })
  const deliveredQuery = useLaundryBatches({ status: 'delivered' })
  const washingQuery = useLaundryBatches({ status: 'washing' })
  const pendingQuery = usePendingLaundryRequestsCount()
  const batchesLoading =
    readyQuery.isLoading || deliveredQuery.isLoading || washingQuery.isLoading
  const batchesError =
    readyQuery.isError || deliveredQuery.isError || washingQuery.isError
  const activeBatches = sortLaundryBatches([
    ...(readyQuery.data?.batches || []),
    ...(deliveredQuery.data?.batches || []),
    ...(washingQuery.data?.batches || []),
  ])
  const batchTotal =
    (readyQuery.data?.total || 0) +
    (deliveredQuery.data?.total || 0) +
    (washingQuery.data?.total || 0)

  useEffect(() => {
    if (sendBatchId && activeTab !== 'requests') {
      const next = new URLSearchParams(params)
      next.set('tab', 'requests')
      setParams(next, { replace: true })
    }
  }, [sendBatchId, activeTab, params, setParams])

  const changeTab = (value: string) => {
    const next = new URLSearchParams(params)
    next.delete('sendBatch')
    if (value === 'requests') next.set('tab', 'requests')
    else next.delete('tab')
    setParams(next)
  }

  return (
    <div className="space-y-5 px-4 py-4 md:p-0">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Giặt là
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gom yêu cầu từ phòng, gửi giặt và nhận đồ trả về.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/laundry/batches">Danh sách lô giặt</Link>
          </Button>
          <PermissionGate module="laundry" action="create">
            <Button asChild>
              <Link to="/laundry/batches/new">
                <Plus className="mr-2 h-4 w-4" />
                Tạo lô gửi giặt
              </Link>
            </Button>
          </PermissionGate>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => changeTab('requests')}
          className="rounded-lg border bg-card p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Inbox className="h-4 w-4" />
            Yêu cầu chờ gom
          </span>
          <span className="mt-2 block text-3xl font-bold text-amber-700 dark:text-amber-400">
            {pendingQuery.isLoading || pendingQuery.isError
              ? '—'
              : (pendingQuery.data ?? 0)}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Từ các phòng, cần đưa vào lô
          </span>
        </button>
        <Link
          to="/laundry/batches?status=ready"
          className="rounded-lg border bg-card p-4 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <PackageCheck className="h-4 w-4" />
            Sẵn sàng nhận
          </span>
          <span className="mt-2 block text-3xl font-bold text-green-700 dark:text-green-400">
            {readyQuery.isLoading || readyQuery.isError
              ? '—'
              : (readyQuery.data?.total ?? 0)}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Lô giặt đã có thể nhận về
          </span>
        </Link>
        <Link
          to="/laundry/batches"
          className="rounded-lg border bg-card p-4 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <span className="text-sm font-medium">Lô đang luân chuyển</span>
          <span className="mt-2 block text-3xl font-bold">
            {statsQuery.isLoading || statsQuery.isError
              ? '—'
              : (statsQuery.data?.active_batches ?? 0)}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Đã gửi, đang giặt hoặc chờ nhận
          </span>
        </Link>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">Chi phí tháng này</p>
          {statsQuery.isLoading ? (
            <Skeleton className="mt-3 h-8 w-28" />
          ) : (
            <p className="mt-2 break-words text-xl font-bold">
              {statsQuery.isError
                ? 'Chưa tải được'
                : formatCurrency(statsQuery.data?.current_month_cost ?? 0)}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Chi phí giặt là đã ghi nhận
          </p>
        </div>
      </div>
      {(statsQuery.isError || pendingQuery.isError) && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
        >
          <p>Một số số liệu chưa tải được.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void statsQuery.refetch()
              void pendingQuery.refetch()
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Thử lại
          </Button>
        </div>
      )}
      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-transparent p-0 sm:w-fit">
          <TabsTrigger
            value="batches"
            className="min-h-11 border px-4 data-[state=active]:bg-slate-900 data-[state=active]:text-white dark:data-[state=active]:bg-slate-200 dark:data-[state=active]:text-slate-950"
          >
            Lô gửi giặt
          </TabsTrigger>
          <TabsTrigger
            value="requests"
            className="min-h-11 gap-2 border px-4 data-[state=active]:bg-slate-900 data-[state=active]:text-white dark:data-[state=active]:bg-slate-200 dark:data-[state=active]:text-slate-950"
          >
            Yêu cầu từ phòng
            {pendingQuery.data != null && (
              <span className="tabular-nums">({pendingQuery.data})</span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="batches" className="mt-4">
          {batchesError ? (
            <div role="alert" className="rounded-lg border p-8 text-center">
              <p>Không thể tải các lô đang giặt.</p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => {
                  void readyQuery.refetch()
                  void deliveredQuery.refetch()
                  void washingQuery.refetch()
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Thử lại
              </Button>
            </div>
          ) : (
            <ActiveBatchesTable
              batches={activeBatches.slice(0, 10)}
              totalCount={batchTotal}
              isLoading={batchesLoading}
            />
          )}
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <LaundryRequestsTab />
        </TabsContent>
      </Tabs>
      <section className="rounded-lg border bg-card">
        <button
          type="button"
          aria-expanded={showAnalysis}
          aria-controls="laundry-analysis"
          onClick={() => setShowAnalysis(!showAnalysis)}
          className="flex min-h-12 w-full items-center justify-between gap-3 p-4 text-left text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <span>Chi phí & đánh giá nhà cung cấp</span>
          <span>{showAnalysis ? 'Thu gọn −' : 'Xem thêm +'}</span>
        </button>
        {showAnalysis && (
          <div
            id="laundry-analysis"
            className="grid gap-4 border-t p-4 lg:grid-cols-2"
          >
            <LaundryExpenseChart />
            <VendorPerformanceTable />
          </div>
        )}
      </section>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/laundry/vendors">Nhà cung cấp giặt là</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/laundry/compensation">Theo dõi đền bù</Link>
        </Button>
      </div>
    </div>
  )
}
