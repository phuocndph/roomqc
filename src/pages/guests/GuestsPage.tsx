import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Plus, Download, X, RotateCcw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useHasModulePermission } from '@/hooks/usePermissions'
import { useUser } from '@/hooks/useUser'
import { isAdminUser } from '@/lib/userAccess'
import {
  useGuestsV2, useGuestStats, exportGuestsToCSV, fetchAllGuests,
  type GuestSegment, type GuestSortKey,
} from '@/hooks/useGuestsV2'
import { GuestKpiBar } from '@/components/guests/GuestKpiBar'
import { GuestSegmentTabs } from '@/components/guests/GuestSegmentTabs'
import { GuestDataTable } from '@/components/guests/GuestDataTable'
import { GuestCardList } from '@/components/guests/GuestCardList'
import { GuestFormDialog } from '@/components/guests/GuestFormDialog'
import { MergeGuestsDialog } from '@/components/guests/MergeGuestsDialog'
import type { Guest } from '@/hooks/useGuests'
import { QueryErrorPanel } from '@/components/shared/QueryErrorPanel'
import { toast } from 'sonner'

const SEGMENTS: GuestSegment[] = ['all', 'vip', 'new', 'returning', 'birthday', 'blacklist']

export default function GuestsPage() {
  const { tenantId } = useUser()
  return <GuestDirectory key={tenantId || 'pending'} tenantId={tenantId} />
}

function GuestDirectory({ tenantId }: { tenantId?: string }) {
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useUser()
  const isAdmin = isAdminUser(user)
  const { data: canManagePerm } = useHasModulePermission('bookings', 'manage')
  const canManage = isAdmin || !!canManagePerm

  const segment: GuestSegment = SEGMENTS.find(value => value === searchParams.get('seg')) || 'all'
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [sortBy, setSortBy] = useState<GuestSortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [exportedCount, setExportedCount] = useState(0)
  const exportController = useRef<AbortController | null>(null)
  const pageSize = 50

  const [formOpen, setFormOpen] = useState(false)
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null)
  const [mergeTarget, setMergeTarget] = useState<Guest | null>(null)

  // Debounce search
  const [searchDebounced, setSearchDebounced] = useState(search)
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [segment, searchDebounced, sortBy, sortDir])
  useEffect(() => () => { exportController.current?.abort() }, [tenantId])

  const setSegment = (s: GuestSegment) => {
    const p = new URLSearchParams(searchParams)
    if (s === 'all') p.delete('seg'); else p.set('seg', s)
    setSearchParams(p, { replace: true })
  }

  const statsQuery = useGuestStats()
  const { data: stats, isLoading: statsLoading } = statsQuery
  const listQuery = useGuestsV2({
    segment, search: searchDebounced, sortBy, sortDir, page, pageSize,
  })
  const { data: listResult, isLoading: listLoading } = listQuery
  const guests = listResult?.rows || []
  const total = listResult?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => {
    if (listQuery.isSuccess && page > totalPages) setPage(totalPages)
  }, [listQuery.isSuccess, page, totalPages])

  const segmentCounts = useMemo(() => ({
    all: stats?.total,
    vip: stats?.vip,
    new: stats?.newCount,
    returning: stats?.returning,
    birthday: stats?.birthday,
    blacklist: stats?.blacklist,
  }), [stats])

  const onSort = (k: GuestSortKey) => {
    if (sortBy === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(k); setSortDir('desc') }
  }

  const handleExport = async () => {
    if (!tenantId || !canManage || exporting || listQuery.isError) return
    const controller = new AbortController()
    exportController.current = controller
    setExporting(true)
    setExportedCount(0)
    try {
      const rows = await fetchAllGuests(tenantId, { segment, search: searchDebounced, sortBy, sortDir }, {
        signal: controller.signal,
        onProgress: setExportedCount,
      })
      controller.signal.throwIfAborted()
      exportGuestsToCSV(rows, `khach-hang-${new Date().toISOString().slice(0, 10)}.csv`)
      toast.success(`Đã xuất ${rows.length} khách hàng theo bộ lọc đã chọn`)
    } catch {
      if (!controller.signal.aborted) toast.error('Chưa xuất được danh sách. Vui lòng thử lại; chưa có file thiếu dữ liệu nào được tải xuống.')
    } finally {
      if (exportController.current === controller) {
        exportController.current = null
        setExporting(false)
      }
    }
  }

  const openEdit = (g: Guest) => { setEditingGuest(g); setFormOpen(true) }
  const openAdd = () => { setEditingGuest(null); setFormOpen(true) }

  const visibleFrom = total === 0 ? 0 : (page - 1) * pageSize + 1
  const visibleTo = Math.min(page * pageSize, total)
  const hasActiveFilters = Boolean(search || segment !== 'all')

  const clearFilters = () => {
    setSearch('')
    setSegment('all')
  }

  return (
    <div className={cn('space-y-5', isMobile && 'px-4 py-4 pb-20')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Khách hàng</h1>
            {!statsLoading && !statsQuery.isError && typeof stats?.total === 'number' && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {stats.total}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Hồ sơ, hạng thành viên và lịch sử lưu trú</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {canManage && (
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={handleExport} disabled={exporting || listLoading || listQuery.isError || total === 0 || search !== searchDebounced || !tenantId} title="Xuất toàn bộ khách hàng theo bộ lọc, không chỉ trang đang xem">
              <Download className="mr-1.5 h-3.5 w-3.5" /> {exporting ? `Đang tải ${exportedCount}…` : 'Xuất tất cả CSV'}
            </Button>
          )}
          {canManage && (
            <Button type="button" size="sm" className="h-9" onClick={openAdd}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Thêm khách
            </Button>
          )}
        </div>
      </div>

      {exporting && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm" role="status">
          <span>Đang lấy toàn bộ hồ sơ theo bộ lọc lúc bắt đầu xuất…</span>
          <Button type="button" variant="outline" size="sm" onClick={() => exportController.current?.abort()}>Hủy xuất</Button>
        </div>
      )}
      {statsQuery.isError
        ? <QueryErrorPanel title="Không tải được thống kê khách hàng" onRetry={() => { void statsQuery.refetch() }} retrying={statsQuery.isFetching} />
        : <GuestKpiBar stats={stats} isLoading={statsLoading} active={segment} onSelect={setSegment} />}

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <GuestSegmentTabs value={segment} onChange={setSegment} counts={statsQuery.isError ? {} : segmentCounts} compact={isMobile} />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            {search && (
              <button
                type="button"
                aria-label="Xóa tìm kiếm"
                title="Xóa tìm kiếm"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <Input
              aria-label="Tìm kiếm khách hàng"
              placeholder="Tìm theo tên, SĐT, email hoặc CCCD"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9 pr-9"
            />
          </div>
          <div className="flex w-full min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground sm:w-auto sm:shrink-0 sm:justify-end">
            <span>{listQuery.isError ? 'Chưa tải được danh sách' : listLoading ? 'Đang tải…' : searchDebounced ? `${total} kết quả phù hợp` : `${total} khách hàng`}</span>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={clearFilters}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Xóa lọc
              </Button>
            )}
          </div>
        </div>
      </div>

      {listQuery.isError ? (
        <QueryErrorPanel title="Không tải được danh sách khách hàng" onRetry={() => { void listQuery.refetch() }} retrying={listQuery.isFetching} />
      ) : isMobile ? (
        <GuestCardList
          guests={guests}
          isLoading={listLoading}
          canManage={canManage}
          onMerge={canManage ? setMergeTarget : undefined}
          onEdit={canManage ? openEdit : undefined}
        />
      ) : (
        <GuestDataTable
          guests={guests}
          isLoading={listLoading}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSort}
          canManage={canManage}
          onMerge={canManage ? setMergeTarget : undefined}
          onEdit={canManage ? openEdit : undefined}
        />
      )}

      {!listQuery.isError && !listLoading && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Hiển thị {visibleFrom}–{visibleTo} / {total} khách
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Trước</Button>
            <span className="px-2 tabular-nums">{page}/{totalPages}</span>
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Sau</Button>
          </div>
        </div>
      )}

      <GuestFormDialog open={formOpen} onOpenChange={setFormOpen} guest={editingGuest} />
      <MergeGuestsDialog open={!!mergeTarget} onOpenChange={(v) => !v && setMergeTarget(null)} target={mergeTarget} />
    </div>
  )
}
