import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'

export interface OpsSummary {
  maintenancePending: number       // pending + in_progress
  maintenanceUrgent: number        // priority urgent/high & not done
  lostFoundStored: number          // status = 'stored'
  laundryInProcess: number         // delivered/washing/ready
  laundryCompensation: number      // partially_received/compensation_needed
  distributionPending: number      // distribution_orders pending
}

const MAINT_OPEN = ['pending', 'waiting', 'in_progress']
const LAUNDRY_PROCESS = ['delivered', 'washing', 'ready']
const LAUNDRY_COMP = ['partially_received', 'compensation_needed']

export function useHousekeepingOpsSummary(hotelId?: string | null) {
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const qc = useQueryClient()

  const query = useQuery<OpsSummary>({
    queryKey: ['hk-ops-summary', tenantId, hotelId],
    enabled: !!tenantId && !!hotelId,
    staleTime: 30_000,
    queryFn: async () => {
      const [maintAll, maintUrgent, lostStored, laundryProc, laundryComp, distPending] = await Promise.all([
        supabase
          .from('maintenance_requests')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!).eq('hotel_id', hotelId!)
          .in('status', MAINT_OPEN),
        supabase
          .from('maintenance_requests')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!).eq('hotel_id', hotelId!)
          .in('status', MAINT_OPEN).in('priority', ['urgent', 'high']),
        supabase
          .from('lost_found_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!).eq('hotel_id', hotelId!)
          .eq('status', 'stored'),
        supabase
          .from('laundry_batches')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!).eq('hotel_id', hotelId!)
          .in('status', LAUNDRY_PROCESS),
        supabase
          .from('laundry_batches')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!).eq('hotel_id', hotelId!)
          .in('status', LAUNDRY_COMP),
        supabase
          .from('distribution_orders')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId!).eq('hotel_id', hotelId!)
          .in('status', ['pending', 'approved', 'preparing']),
      ])

      return {
        maintenancePending: maintAll.count || 0,
        maintenanceUrgent: maintUrgent.count || 0,
        lostFoundStored: lostStored.count || 0,
        laundryInProcess: laundryProc.count || 0,
        laundryCompensation: laundryComp.count || 0,
        distributionPending: distPending.count || 0,
      }
    },
  })

  useEffect(() => {
    if (!tenantId || !hotelId) return
    const ch = supabase
      .channel(`hk-ops-${hotelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_requests', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-ops-summary', tenantId, hotelId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lost_found_items', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-ops-summary', tenantId, hotelId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_batches', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-ops-summary', tenantId, hotelId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'distribution_orders', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-ops-summary', tenantId, hotelId] }))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tenantId, hotelId, qc])

  return query
}
