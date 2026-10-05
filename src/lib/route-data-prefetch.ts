/**
 * Route DATA prefetch — bổ trợ cho `route-prefetch.ts` (chunk JS).
 *
 * Khi user `pointerdown`/`hover`/`focus` link trong sidebar/bottom nav,
 * ngoài việc prefetch chunk JS, ta cũng pre-fill cache của React Query cho
 * query chính của trang đích → vào trang là có data ngay (không skeleton).
 *
 * Context (tenantId, hotelId, queryClient) được register một lần bởi
 * `useRegisterPrefetchContext()` trong MainLayout.
 *
 * Quy tắc an toàn:
 * - Bỏ qua trên kết nối chậm (save-data/2g).
 * - Throttle 30s cho mỗi route để không spam.
 * - Chỉ prefetch query "trang trống filter" (filter mặc định).
 * - Cache hit miss đều vô hại (sẽ refetch như bình thường).
 */
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

interface PrefetchCtx {
  queryClient: QueryClient
  tenantId: string | null | undefined
  hotelId: string | null | undefined
  isAllHotelsMode: boolean
}

let ctxRef: PrefetchCtx | null = null
export const setPrefetchContext = (ctx: PrefetchCtx) => {
  ctxRef = ctx
}

const lastPrefetchAt = new Map<string, number>()
const THROTTLE_MS = 30_000

const isSlowConnection = () => {
  if (typeof navigator === 'undefined') return false
  const conn = (navigator as any).connection
  if (!conn) return false
  if (conn.saveData) return true
  if (conn.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return true
  return false
}

type DataPrefetchFn = (ctx: PrefetchCtx) => Promise<unknown>

// Mỗi route ánh xạ tới 1 hàm prefetch dữ liệu cho query CHÍNH của trang đó
// với filter mặc định (rỗng). Query key PHẢI khớp 100% với hook tương ứng.
const dataPrefetchers: Record<string, DataPrefetchFn> = {
  // /rooms → useRooms({})
  '/rooms': async ({ queryClient, tenantId, hotelId, isAllHotelsMode }) => {
    if (!tenantId) return
    const filters = {}
    return queryClient.prefetchQuery({
      queryKey: ['rooms', tenantId, hotelId, isAllHotelsMode, filters],
      staleTime: 30_000,
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_rooms_filtered', {
          p_tenant_id: tenantId,
          p_hotel_id: isAllHotelsMode ? null : hotelId,
          p_floor: null,
          p_room_type: null,
          p_status: null,
          p_search: null,
          p_missing_items_only: false,
        })
        if (error) throw error
        return (data || []).map((room: any) => ({
          ...room,
          hourly_price: room.hourly_price ?? null,
          monthly_price: room.monthly_price ?? null,
          min_hours: room.min_hours ?? null,
          max_hours: room.max_hours ?? null,
        }))
      },
    })
  },

  // /bookings → BookingsPage useQuery key ['all-bookings', hotel|'all', statusFilter='all']
  '/bookings': async ({ queryClient, tenantId, hotelId, isAllHotelsMode }) => {
    if (!tenantId) return
    const hotelKey = isAllHotelsMode ? 'all' : hotelId
    return queryClient.prefetchQuery({
      queryKey: ['all-bookings', hotelKey, 'all'],
      staleTime: 30_000,
      queryFn: async () => {
        let query = supabase
          .from('room_bookings')
          .select(`
            *,
            room:rooms(room_number, room_type, floor, status),
            booking_type,
            hourly_rate,
            hourly_start_time,
            hourly_end_time,
            booking_hours,
            monthly_rate,
            booking_months,
            booking_group_id
          `)
          .order('check_in_date', { ascending: false })
          .limit(100)
        if (!isAllHotelsMode && hotelId) {
          query = query.eq('hotel_id', hotelId)
        }
        const { data, error } = await query
        if (error) return []
        return data
      },
    })
  },

  // /inventory/distributions → useRoutesWithFilters({}, 1, 25)
  '/inventory/distributions': async ({ queryClient, tenantId, hotelId, isAllHotelsMode }) => {
    if (!tenantId) return
    const filters = {}
    const page = 1
    const pageSize = 25
    return queryClient.prefetchQuery({
      queryKey: [
        'distribution-routes',
        tenantId,
        isAllHotelsMode ? 'all' : hotelId,
        filters,
        page,
        pageSize,
      ],
      staleTime: 30_000,
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_distribution_orders_filtered', {
          p_tenant_id: tenantId,
          p_hotel_id: isAllHotelsMode ? null : hotelId,
          p_status: null,
          p_assigned_to: null,
          p_floor: null,
          p_shift_date: null,
          p_shift_code: null,
          p_limit: pageSize,
          p_offset: 0,
        })
        if (error) throw error
        const { data: countResult } = await supabase.rpc('get_distribution_orders_count', {
          p_tenant_id: tenantId,
          p_hotel_id: isAllHotelsMode ? null : hotelId,
          p_status: null,
          p_assigned_to: null,
          p_floor: null,
          p_shift_date: null,
          p_shift_code: null,
        })
        return {
          data: (data || []) as any[],
          totalCount: (countResult as number) || 0,
        }
      },
    })
  },
}

const findDataPrefetcher = (path: string): DataPrefetchFn | undefined => {
  if (dataPrefetchers[path]) return dataPrefetchers[path]
  // longest-prefix match
  const keys = Object.keys(dataPrefetchers).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (path.startsWith(key + '/') || path === key) return dataPrefetchers[key]
  }
  return undefined
}

export const prefetchRouteData = (path: string) => {
  if (typeof window === 'undefined') return
  if (!ctxRef) return
  if (isSlowConnection()) return

  const fn = findDataPrefetcher(path)
  if (!fn) return

  const now = Date.now()
  const last = lastPrefetchAt.get(path) || 0
  if (now - last < THROTTLE_MS) return
  lastPrefetchAt.set(path, now)

  fn(ctxRef).catch(() => {
    // không quan trọng — cache miss vô hại
    lastPrefetchAt.delete(path)
  })
}
