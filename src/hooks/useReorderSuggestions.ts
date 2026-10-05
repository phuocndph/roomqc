import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from 'sonner'

export interface ReorderSuggestion {
  id: string
  tenant_id: string
  hotel_id: string
  item_id: string
  current_stock: number
  on_order_qty: number
  suggested_qty: number
  reason: 'below_min' | 'expiring' | 'manual'
  status: 'pending' | 'approved' | 'ignored' | 'converted'
  ignored_reason: string | null
  ignored_until: string | null
  converted_po_id: string | null
  created_at: string
  updated_at: string
  // joined
  item?: {
    id: string
    name: string
    sku?: string | null
    unit_price?: number | null
    reorder_point?: number | null
    reorder_max_qty?: number | null
    preferred_vendor_id?: string | null
    category_id?: string | null
  }
  hotel?: { id: string; name: string }
  vendor?: { id: string; name: string } | null
}

export function useReorderSuggestions(status: ReorderSuggestion['status'] = 'pending') {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const qc = useQueryClient()

  const hotelId = !isAllHotelsMode && selectedHotel?.id ? selectedHotel.id : null

  // Realtime invalidate
  useEffect(() => {
    if (!tenantId) return
    const channel = supabase
      .channel(`reorder-suggestions-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reorder_suggestions', filter: `tenant_id=eq.${tenantId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['reorder-suggestions'] })
          qc.invalidateQueries({ queryKey: ['reorder-pending-count'] })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, qc])

  return useQuery({
    queryKey: ['reorder-suggestions', tenantId, hotelId, status],
    queryFn: async () => {
      if (!tenantId) return []
      let q = supabase
        .from('reorder_suggestions')
        .select(`
          *,
          item:items!reorder_suggestions_item_id_fkey(
            id, name, sku, unit_price, reorder_point, reorder_max_qty, preferred_vendor_id, category_id
          ),
          hotel:hotels!reorder_suggestions_hotel_id_fkey(id, name)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', status)
        .order('created_at', { ascending: false })
      if (hotelId) q = q.eq('hotel_id', hotelId)
      const { data, error } = await q
      if (error) throw error

      // Fetch vendor names in batch
      const vendorIds = Array.from(
        new Set(
          (data || [])
            .map((r: any) => r.item?.preferred_vendor_id)
            .filter(Boolean)
        )
      ) as string[]
      const vendorMap = new Map<string, { id: string; name: string }>()
      if (vendorIds.length > 0) {
        const { data: vendors } = await supabase
          .from('vendors')
          .select('id, name')
          .in('id', vendorIds)
        ;(vendors || []).forEach((v) => vendorMap.set(v.id, v))
      }

      return (data || []).map((r: any) => ({
        ...r,
        vendor: r.item?.preferred_vendor_id ? vendorMap.get(r.item.preferred_vendor_id) ?? null : null,
      })) as ReorderSuggestion[]
    },
    enabled: !!tenantId,
    staleTime: 30 * 1000,
  })
}

export function useReorderPendingCount() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = !isAllHotelsMode && selectedHotel?.id ? selectedHotel.id : null

  return useQuery({
    queryKey: ['reorder-pending-count', tenantId, hotelId],
    queryFn: async () => {
      if (!tenantId) return 0
      let q = supabase
        .from('reorder_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
      if (hotelId) q = q.eq('hotel_id', hotelId)
      const { count } = await q
      return count || 0
    },
    enabled: !!tenantId,
    staleTime: 60 * 1000,
  })
}

export function useApproveReorderSuggestions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (suggestionIds: string[]) => {
      const { data, error } = await supabase.rpc('approve_reorder_suggestions', {
        _suggestion_ids: suggestionIds,
      })
      if (error) throw error
      return data as { po_ids: string[]; converted_count: number }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['reorder-suggestions'] })
      qc.invalidateQueries({ queryKey: ['reorder-pending-count'] })
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      const poCount = data?.po_ids?.length ?? 0
      toast.success(`Đã tạo ${poCount} đơn đặt hàng nháp từ ${data?.converted_count ?? 0} đề xuất`)
    },
    onError: (err: any) => {
      const msg = err?.message ?? ''
      const map: Record<string, string> = {
        unauthenticated: 'Chưa đăng nhập',
        no_suggestions: 'Chưa chọn đề xuất nào',
        forbidden_approve: 'Bạn không có quyền duyệt',
        no_pending_suggestions: 'Không còn đề xuất nào đang chờ',
        cross_tenant_not_allowed: 'Không thể duyệt đề xuất khác tenant',
      }
      const key = Object.keys(map).find((k) => msg.includes(k))
      toast.error(key ? map[key] : 'Duyệt thất bại: ' + msg)
    },
  })
}

export function useIgnoreReorderSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { suggestionId: string; reason?: string; ignoreDays?: number }) => {
      const { data, error } = await supabase.rpc('ignore_reorder_suggestion', {
        _suggestion_id: params.suggestionId,
        _reason: params.reason ?? null,
        _ignore_days: params.ignoreDays ?? 7,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reorder-suggestions'] })
      qc.invalidateQueries({ queryKey: ['reorder-pending-count'] })
      toast.success('Đã bỏ qua đề xuất')
    },
    onError: (err: any) => {
      const msg = err?.message ?? ''
      const map: Record<string, string> = {
        unauthenticated: 'Chưa đăng nhập',
        not_found: 'Không tìm thấy đề xuất',
        not_pending: 'Đề xuất không còn ở trạng thái chờ',
        forbidden_ignore: 'Bạn không có quyền bỏ qua',
      }
      const key = Object.keys(map).find((k) => msg.includes(k))
      toast.error(key ? map[key] : 'Bỏ qua thất bại')
    },
  })
}

export function useComputeReorderSuggestions() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('no_tenant')
      const hotelId = !isAllHotelsMode && selectedHotel?.id ? selectedHotel.id : null
      const { data, error } = await supabase.rpc('compute_reorder_suggestions', {
        _tenant_id: tenantId,
        _hotel_id: hotelId,
      })
      if (error) throw error
      return data as { created: number; skipped: number }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['reorder-suggestions'] })
      qc.invalidateQueries({ queryKey: ['reorder-pending-count'] })
      toast.success(`Quét xong: ${data?.created ?? 0} đề xuất mới, ${data?.skipped ?? 0} bỏ qua`)
    },
    onError: (err: any) => {
      toast.error('Quét thất bại: ' + (err?.message ?? 'unknown'))
    },
  })
}
