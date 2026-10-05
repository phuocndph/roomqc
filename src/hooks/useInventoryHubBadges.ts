import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useQueryClient } from '@tanstack/react-query'

export interface InventoryHubBadges {
  reorderPending: number
  distributionsPending: number
  /** Số phiếu xuất pending/released có created_at > 24h trước — báo đỏ */
  distributionsStale: number
  lowStock: number
  adjustmentsPending: number
}

/**
 * Lightweight count badges for the Inventory Hub left navigation.
 * One query per badge — kept atomic so realtime invalidation is granular.
 */
export function useInventoryHubBadges() {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const tenantId = tenant?.id
  const hotelId = !isAllHotelsMode && selectedHotel?.id ? selectedHotel.id : null
  const qc = useQueryClient()

  // Realtime invalidation on key tables
  useEffect(() => {
    if (!tenantId) return
    const ch = supabase
      .channel(`inv-hub-badges-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reorder_suggestions', filter: `tenant_id=eq.${tenantId}` },
        () => qc.invalidateQueries({ queryKey: ['inventory-hub-badges', tenantId] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'distribution_orders', filter: `tenant_id=eq.${tenantId}` },
        () => qc.invalidateQueries({ queryKey: ['inventory-hub-badges', tenantId] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_adjustments', filter: `tenant_id=eq.${tenantId}` },
        () => qc.invalidateQueries({ queryKey: ['inventory-hub-badges', tenantId] })
      )
      // Realtime cho ô KPI "Low stock" / "Đã hết hàng" khi staff adjust trực tiếp
      // (RPC dashboard đọc quantity_in_stock của items).
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'items', filter: `tenant_id=eq.${tenantId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['inventory-hub-badges', tenantId] })
          qc.invalidateQueries({ queryKey: ['low-stock-items'] })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [tenantId, qc])

  return useQuery({
    queryKey: ['inventory-hub-badges', tenantId, hotelId, isAllHotelsMode],
    queryFn: async (): Promise<InventoryHubBadges> => {
      if (!tenantId) {
        return {
          reorderPending: 0,
          distributionsPending: 0,
          distributionsStale: 0,
          lowStock: 0,
          adjustmentsPending: 0,
        }
      }

      const reorderQ = supabase
        .from('reorder_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')

      // "Cần xử lý" = phiếu chờ thao tác của manager:
      // pending (chờ duyệt) + released (đã xuất kho, chờ phòng confirm).
      // Enum thực tế: pending | in_progress | released | completed | cancelled.
      const distQ = supabase
        .from('distribution_orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['pending', 'released'])

      // Phiếu xuất "quá hạn" — chờ thao tác >24h
      const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const distStaleQ = supabase
        .from('distribution_orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['pending', 'released'])
        .lt('created_at', staleCutoff)

      // Phiếu kiểm kê đang xử lý = draft + in_progress + approved (chờ complete).
      const adjQ = supabase
        .from('stock_adjustments')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['draft', 'in_progress', 'approved'])

      if (hotelId) {
        reorderQ.eq('hotel_id', hotelId)
        distQ.eq('hotel_id', hotelId)
        distStaleQ.eq('hotel_id', hotelId)
        adjQ.eq('hotel_id', hotelId)
      }

      const [reorder, dist, distStale, adj, dash] = await Promise.all([
        reorderQ,
        distQ,
        distStaleQ,
        adjQ,
        supabase.rpc('get_inventory_dashboard_stats', {
          p_tenant_id: tenantId,
          p_hotel_id: hotelId,
        }),
      ])

      const lowStock = (dash.data as any)?.low_stock_count ?? 0

      return {
        reorderPending: reorder.count ?? 0,
        distributionsPending: dist.count ?? 0,
        distributionsStale: distStale.count ?? 0,
        adjustmentsPending: adj.count ?? 0,
        lowStock,
      }
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
