import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useHotelContext } from '@/contexts/HotelContext'

interface HotelStockRow {
  hotel_id: string
  hotel_name: string
  total_value: number
  sku_count: number
  low_stock: number
}

function formatVnd(v: number) {
  if (!v) return '0 ₫'
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)} tỷ`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} tr`
  return new Intl.NumberFormat('vi-VN').format(v)
}

/**
 * Visible only in All-Hotels mode with > 1 hotel.
 * Computed client-side from items table to avoid an extra RPC.
 */
export function InventoryHotelBreakdown() {
  const { tenant } = useTenant()
  const { availableHotels, isAllHotelsMode } = useHotelContext()

  const enabled =
    !!tenant?.id && isAllHotelsMode && (availableHotels?.length ?? 0) > 1

  const { data, isLoading } = useQuery({
    queryKey: ['inv-hub-hotel-breakdown', tenant?.id],
    queryFn: async (): Promise<HotelStockRow[]> => {
      if (!tenant?.id) return []
      const { data: rows, error } = await supabase
        .from('items')
        .select('hotel_id, quantity_in_stock, unit_price, reorder_point')
        .eq('tenant_id', tenant.id)
      if (error) throw error

      const map = new Map<string, HotelStockRow>()
      for (const r of rows ?? []) {
        const hid = r.hotel_id as string
        if (!hid) continue
        const name = availableHotels.find((h) => h.id === hid)?.name ?? 'Khách sạn'
        const entry =
          map.get(hid) ?? {
            hotel_id: hid,
            hotel_name: name,
            total_value: 0,
            sku_count: 0,
            low_stock: 0,
          }
        entry.sku_count += 1
        entry.total_value += (r.quantity_in_stock || 0) * (r.unit_price || 0)
        if (r.reorder_point !== null && (r.quantity_in_stock || 0) <= (r.reorder_point || 0)) {
          entry.low_stock += 1
        }
        map.set(hid, entry)
      }
      return [...map.values()].sort((a, b) => b.total_value - a.total_value)
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  const total = useMemo(
    () => (data ?? []).reduce((s, r) => s + r.total_value, 0),
    [data],
  )

  if (!enabled) return null

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="text-sm font-semibold">Phân bổ theo khách sạn</div>
        <div className="text-[11px] text-muted-foreground">Chế độ Tất cả khách sạn</div>
      </div>
      {isLoading ? (
        <div className="p-4 text-xs text-muted-foreground">Đang tính…</div>
      ) : !data || data.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">Chưa có dữ liệu kho.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b">
                <th className="text-left px-3 py-2">Khách sạn</th>
                <th className="text-right px-3 py-2">Giá trị</th>
                <th className="text-right px-3 py-2">% tổng</th>
                <th className="text-right px-3 py-2">SKU</th>
                <th className="text-right px-3 py-2">Sắp hết</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const pct = total > 0 ? (r.total_value / total) * 100 : 0
                return (
                  <tr key={r.hotel_id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium truncate max-w-[200px]">
                      {r.hotel_name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatVnd(r.total_value)} ₫
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {pct.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sku_count}</td>
                    <td
                      className={
                        'px-3 py-2 text-right tabular-nums ' +
                        (r.low_stock > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground')
                      }
                    >
                      {r.low_stock}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
