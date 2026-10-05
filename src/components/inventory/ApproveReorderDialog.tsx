import { useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useApproveReorderSuggestions, type ReorderSuggestion } from '@/hooks/useReorderSuggestions'
import { formatCurrency } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: ReorderSuggestion[]
}

const NO_VENDOR_KEY = '__no_vendor__'

export function ApproveReorderDialog({ open, onOpenChange, selected }: Props) {
  const approve = useApproveReorderSuggestions()

  const groups = useMemo(() => {
    const map = new Map<string, { vendorName: string; items: ReorderSuggestion[]; total: number }>()
    for (const s of selected) {
      const key = s.vendor?.id ?? NO_VENDOR_KEY
      const vendorName = s.vendor?.name ?? '— Chưa gán nhà cung cấp —'
      if (!map.has(key)) map.set(key, { vendorName, items: [], total: 0 })
      const grp = map.get(key)!
      grp.items.push(s)
      grp.total += Number(s.suggested_qty) * Number(s.item?.unit_price ?? 0)
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }))
  }, [selected])

  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0)

  const handleApprove = async () => {
    await approve.mutateAsync(selected.map((s) => s.id))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Duyệt {selected.length} đề xuất → {groups.length} đơn đặt hàng nháp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {groups.map((g) => (
            <div key={g.key} className="border rounded-lg overflow-hidden">
              <div className="bg-muted/30 px-3 py-2 flex items-center justify-between">
                <div className="text-sm font-medium">{g.vendorName}</div>
                <div className="text-xs text-muted-foreground">
                  {g.items.length} item · {formatCurrency(g.total)}
                </div>
              </div>
              <div className="divide-y">
                {g.items.map((s) => (
                  <div key={s.id} className="px-3 py-2 flex items-center justify-between text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{s.item?.name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        Tồn {s.current_stock} · Đang đặt {s.on_order_qty}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{Number(s.suggested_qty)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(Number(s.suggested_qty) * Number(s.item?.unit_price ?? 0))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {groups.some((g) => g.key === NO_VENDOR_KEY) && (
            <div className="text-xs text-amber-600 px-1">
              Một số item chưa gán nhà cung cấp ưu tiên — các item này sẽ bị <b>bỏ qua</b> khi duyệt. Hãy gán nhà cung cấp ở "Cài đặt nhập lại" rồi duyệt lại.
            </div>
          )}

          <div className="flex justify-between pt-2 border-t text-sm font-medium">
            <span>Tổng giá trị ước tính:</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="button" onClick={handleApprove} disabled={approve.isPending || selected.length === 0}>
            {approve.isPending ? 'Đang tạo...' : `Duyệt & tạo ${groups.length} PO nháp`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
