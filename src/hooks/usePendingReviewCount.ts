import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useHasPermission } from './usePermission'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Đếm số task `completed_pending_review` thuộc tenant + (hotel đang chọn nếu có).
 * Chỉ chạy nếu user có quyền manage_housekeeping (hoặc admin).
 * Auto-refresh qua realtime trên housekeeping_tasks.
 */
export function usePendingReviewCount() {
  const { user } = useUser()
  const { selectedHotel } = useHotelContext()
  const { hasPermission } = useHasPermission('rooms', 'manage')
  const tenantId = user?.tenant_id
  const hotelId = selectedHotel?.id ?? null
  const enabled = !!tenantId && hasPermission

  const qc = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    const ch = supabase
      .channel('pending-review-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'housekeeping_tasks' },
        () => qc.invalidateQueries({ queryKey: ['pending-review-count'] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [enabled, qc])

  return useQuery({
    queryKey: ['pending-review-count', tenantId, hotelId],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('housekeeping_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!)
        .eq('status', 'completed_pending_review')
      if (hotelId) q = q.eq('hotel_id', hotelId)
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    },
  })
}
