import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import type {
  ConsumptionSnapshot,
  ConsumptionTrendPoint,
  RefreshSnapshotResult,
} from '@/types/inventory-analytics.types'
import { toast } from '@/hooks/use-toast'

/**
 * Phase C2 — Latest consumption snapshots (today's row per item).
 * Returns one row per item for the most recent snapshot_date.
 */
export function useLatestConsumptionSnapshots(limit: number = 200) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: [
      'consumption-snapshots-latest',
      tenant?.id,
      isAllHotelsMode ? 'all' : selectedHotel?.id,
      limit,
    ],
    queryFn: async (): Promise<ConsumptionSnapshot[]> => {
      if (!tenant?.id) throw new Error('No tenant')

      // Server-side DISTINCT ON (item_id) — trả đúng 1 dòng latest/item.
      // Tránh truncate khi tenant có >limit raw rows (mỗi item nhiều snapshot_date).
      const { data, error } = await supabase.rpc('get_latest_consumption_snapshots', {
        p_tenant_id: tenant.id,
        p_hotel_id: !isAllHotelsMode && selectedHotel?.id ? selectedHotel.id : null,
        p_limit: limit,
      })
      if (error) throw error

      // Backfill `item` join (RPC trả raw snapshot row; widgets vẫn dùng item.name)
      const rows = (data ?? []) as unknown as ConsumptionSnapshot[]
      const itemIds = Array.from(new Set(rows.map((r: any) => r.item_id).filter(Boolean)))
      if (itemIds.length === 0) return rows
      const { data: items } = await supabase
        .from('items')
        .select('id, name, item_code:code, unit_price')
        .in('id', itemIds)
      const byId = new Map((items ?? []).map((i: any) => [i.id, i]))
      return rows.map((r: any) => ({ ...r, item: byId.get(r.item_id) ?? null }))
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 60 * 1000,
  })
}

/**
 * Daily outbound trend for a single item over `days` window (default 90).
 */
export function useConsumptionTrend(itemId: string | null | undefined, days: number = 90) {
  return useQuery({
    queryKey: ['consumption-trend', itemId, days],
    queryFn: async (): Promise<ConsumptionTrendPoint[]> => {
      if (!itemId) return []
      const { data, error } = await supabase.rpc('get_consumption_trend', {
        _item_id: itemId,
        _days: days,
      })
      if (error) throw error
      return (data ?? []) as unknown as ConsumptionTrendPoint[]
    },
    enabled: !!itemId,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Manual refresh — useful for ops when cron is delayed.
 * Owner / Manager only (RPC is SECURITY DEFINER but RLS on snapshot table
 * still requires write via service role; here we just trigger compute).
 */
export function useRefreshSnapshots() {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<RefreshSnapshotResult> => {
      if (!tenant?.id) throw new Error('No tenant')
      const { data, error } = await supabase.rpc('refresh_consumption_snapshots', {
        _tenant_id: tenant.id,
        _hotel_id: isAllHotelsMode ? null : selectedHotel?.id ?? null,
      })
      if (error) throw error
      return data as unknown as RefreshSnapshotResult
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['consumption-snapshots-latest'] })
      qc.invalidateQueries({ queryKey: ['dead-stock-report'] })
      toast({
        title: 'Đã cập nhật snapshot',
        description: `${res.processed} item · ngày ${res.snapshot_date}`,
      })
    },
    onError: (e: any) => {
      toast({
        title: 'Lỗi cập nhật snapshot',
        description: e?.message ?? 'Không xác định',
        variant: 'destructive',
      })
    },
  })
}
