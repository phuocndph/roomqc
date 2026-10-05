import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useReorderSuggestions,
  useComputeReorderSuggestions,
  type ReorderSuggestion,
} from '@/hooks/useReorderSuggestions'
import { useHotelContext } from '@/contexts/HotelContext'
import { ApproveReorderDialog } from '@/components/inventory/ApproveReorderDialog'
import { IgnoreSuggestionDialog } from '@/components/inventory/IgnoreSuggestionDialog'
import { ReorderSettingsDialog } from '@/components/inventory/ReorderSettingsDialog'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { useUser } from '@/hooks/useUser'
import { isAdminUser } from '@/lib/userAccess'
import { useHasPermission } from '@/hooks/usePermission'

const REASON_LABEL: Record<ReorderSuggestion['reason'], string> = {
  below_min: 'Dưới mức tối thiểu',
  expiring: 'Sắp hết hạn',
  manual: 'Thủ công',
}

export default function ReorderSuggestionsPage() {
  const { data: suggestions, isLoading } = useReorderSuggestions('pending')
  const compute = useComputeReorderSuggestions()
  const { isAllHotelsMode } = useHotelContext()
  const { user } = useUser()
  const isAdmin = isAdminUser(user)
  const { hasPermission: canApprove } = useHasPermission('inventory', 'approve')
  const allowApprove = isAdmin || canApprove

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reasonFilter, setReasonFilter] = useState<string>('all')
  const [vendorFilter, setVendorFilter] = useState<string>('all')
  const [approveOpen, setApproveOpen] = useState(false)
  const [ignoreTarget, setIgnoreTarget] = useState<{ id: string; name: string } | null>(null)
  const [settingsTarget, setSettingsTarget] = useState<{ id: string; name: string } | null>(null)

  const filtered = useMemo(() => {
    return (suggestions ?? []).filter((s) => {
      if (reasonFilter !== 'all' && s.reason !== reasonFilter) return false
      if (vendorFilter !== 'all') {
        if (vendorFilter === '__none__' && s.vendor) return false
        if (vendorFilter !== '__none__' && s.vendor?.id !== vendorFilter) return false
      }
      return true
    })
  }, [suggestions, reasonFilter, vendorFilter])

  const vendorOptions = useMemo(() => {
    const map = new Map<string, string>()
    let hasNone = false
    ;(suggestions ?? []).forEach((s) => {
      if (s.vendor) map.set(s.vendor.id, s.vendor.name)
      else hasNone = true
    })
    return { vendors: Array.from(map.entries()), hasNone }
  }, [suggestions])

  const selected = useMemo(
    () => filtered.filter((s) => selectedIds.has(s.id)),
    [filtered, selectedIds]
  )

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))

  const toggleAll = () => {
    if (allFilteredSelected) {
      const next = new Set(selectedIds)
      filtered.forEach((s) => next.delete(s.id))
      setSelectedIds(next)
    } else {
      const next = new Set(selectedIds)
      filtered.forEach((s) => next.add(s.id))
      setSelectedIds(next)
    }
  }

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  return (
    <div className="space-y-4 p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Đề xuất nhập hàng</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Hệ thống tự động sinh đề xuất khi tồn kho dưới mức tối thiểu
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => compute.mutate()}
            disabled={compute.isPending}
          >
            {compute.isPending ? 'Đang quét...' : 'Quét lại ngay'}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selected.length === 0 || !allowApprove || isAllHotelsMode}
            onClick={() => setApproveOpen(true)}
            title={isAllHotelsMode ? 'Chuyển sang một hotel cụ thể để duyệt' : undefined}
          >
            Duyệt {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border rounded-lg p-2">
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Lý do" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả lý do</SelectItem>
            <SelectItem value="below_min">Dưới mức tối thiểu</SelectItem>
            <SelectItem value="expiring">Sắp hết hạn</SelectItem>
            <SelectItem value="manual">Thủ công</SelectItem>
          </SelectContent>
        </Select>

        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue placeholder="Nhà cung cấp" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nhà cung cấp</SelectItem>
            {vendorOptions.hasNone && <SelectItem value="__none__">— Chưa gán —</SelectItem>}
            {vendorOptions.vendors.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} / {suggestions?.length ?? 0} đề xuất
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-sm text-muted-foreground">
              Không có đề xuất nào — kho đang đủ.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Chọn tất cả"
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-left">Hotel</th>
                  <th className="px-3 py-2 text-right">Tồn</th>
                  <th className="px-3 py-2 text-right">Đang đặt</th>
                  <th className="px-3 py-2 text-right">Đề xuất</th>
                  <th className="px-3 py-2 text-left">Vendor</th>
                  <th className="px-3 py-2 text-left">Lý do</th>
                  <th className="px-3 py-2 text-left">Thời gian</th>
                  <th className="px-3 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={selectedIds.has(s.id)}
                        onCheckedChange={() => toggleOne(s.id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{s.item?.name ?? '—'}</div>
                      {s.item?.unit_price != null && (
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(Number(s.item.unit_price))}/đv
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{s.hotel?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={Number(s.current_stock) === 0 ? 'text-red-600 font-medium' : ''}>
                        {Number(s.current_stock)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {Number(s.on_order_qty) || '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-600">
                      {Number(s.suggested_qty)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.vendor?.name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">{REASON_LABEL[s.reason]}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatRelativeTime(s.created_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {allowApprove && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setSettingsTarget({ id: s.item_id, name: s.item?.name ?? '' })}
                          >
                            Cài đặt
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setIgnoreTarget({ id: s.id, name: s.item?.name ?? '' })}
                          >
                            Bỏ qua
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ApproveReorderDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        selected={selected}
      />
      <IgnoreSuggestionDialog
        open={!!ignoreTarget}
        onOpenChange={(o) => !o && setIgnoreTarget(null)}
        suggestionId={ignoreTarget?.id ?? null}
        itemName={ignoreTarget?.name}
      />
      <ReorderSettingsDialog
        open={!!settingsTarget}
        onOpenChange={(o) => !o && setSettingsTarget(null)}
        itemId={settingsTarget?.id ?? null}
        itemName={settingsTarget?.name}
      />
    </div>
  )
}

