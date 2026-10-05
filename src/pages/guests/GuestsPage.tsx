import { useEffect, useMemo, useState } from 'react'
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
  useGuestsV2, useGuestStats, exportGuestsToCSV,
  type GuestSegment, type GuestSortKey,
} from '@/hooks/useGuestsV2'
import { GuestKpiBar } from '@/components/guests/GuestKpiBar'
import { GuestSegmentTabs } from '@/components/guests/GuestSegmentTabs'
import { GuestDataTable } from '@/components/guests/GuestDataTable'
import { GuestCardList } from '@/components/guests/GuestCardList'
import { GuestFormDialog } from '@/components/guests/GuestFormDialog'
import { MergeGuestsDialog } from '@/components/guests/MergeGuestsDialog'
import type { Guest } from '@/hooks/useGuests'

export default function GuestsPage() {
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useUser()
  const isAdmin = isAdminUser(user)
  const { data: canManagePerm } = useHasModulePermission('bookings', 'manage')
  const canManage = isAdmin || !!canManagePerm

  const segment = (searchParams.get('seg') as GuestSegment) || 'all'
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [sortBy, setSortBy] = useState<GuestSortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
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

  const setSegment = (s: GuestSegment) => {
    const p = new URLSearchParams(searchParams)
    if (s === 'all') p.delete('seg'); else p.set('seg', s)
    setSearchParams(p, { replace: true })
  }

  const { data: stats, isLoading: statsLoading } = useGuestStats()
  const { data: listResult, isLoading: listLoading } = useGuestsV2({
    segment, search: searchDebounced, sortBy, sortDir, page, pageSize,
  })
  const guests = listResult?.rows || []
  const total = listResult?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

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

  const handleExport = () => {
    exportGuestsToCSV(guests, `khach-hang-${new Date().toISOString().slice(0, 10)}.csv`)
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
            {!statsLoading && typeof stats?.total === 'number' && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {stats.total}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Hồ sơ, hạng thành viên và lịch sử lưu trú</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {canManage && (
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={handleExport} disabled={guests.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Xuất CSV
            </Button>
          )}
          {canManage && (
            <Button type="button" size="sm" className="h-9" onClick={openAdd}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Thêm khách
            </Button>
          )}
        </div>
      </div>

      <GuestKpiBar stats={stats} isLoading={statsLoading} active={segment} onSelect={setSegment} />

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <GuestSegmentTabs value={segment} onChange={setSegment} counts={segmentCounts} compact={isMobile} />

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
            <span>{searchDebounced ? `${total} kết quả phù hợp` : `${total} khách hàng`}</span>
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

      {isMobile ? (
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

      {totalPages > 1 && (
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
