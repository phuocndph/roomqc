import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useToast } from '@/hooks/use-toast'
import type { Guest } from '@/hooks/useGuests'

export type GuestSegment = 'all' | 'vip' | 'new' | 'returning' | 'birthday' | 'blacklist'
export type GuestSortKey = 'created_at' | 'full_name' | 'total_stays' | 'total_spent' | 'last_stay_date'

export interface GuestListParams {
  segment?: GuestSegment
  search?: string
  sortBy?: GuestSortKey
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

function applySegment(query: any, segment: GuestSegment) {
  const now = new Date()
  const month = now.getMonth() + 1
  switch (segment) {
    case 'vip':
      return query.in('vip_level', ['gold', 'vip', 'platinum'])
    case 'new': {
      const d = new Date(); d.setDate(d.getDate() - 30)
      return query.gte('created_at', d.toISOString())
    }
    case 'returning':
      return query.gte('total_stays', 2)
    case 'blacklist':
      return query.eq('vip_level', 'blacklist')
    case 'birthday':
      // Filtered client-side (PostgREST cannot extract month easily without RPC)
      return query
    default:
      return query
  }
}

export function useGuestsV2(params: GuestListParams = {}) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id
  const {
    segment = 'all',
    search = '',
    sortBy = 'created_at',
    sortDir = 'desc',
    page = 1,
    pageSize = 50,
  } = params

  return useQuery({
    queryKey: ['guests-v2', tenantId, segment, search, sortBy, sortDir, page, pageSize],
    queryFn: async () => {
      if (!tenantId) return { rows: [] as Guest[], total: 0 }

      let q = supabase
        .from('guests')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)

      q = applySegment(q, segment)

      if (search.trim()) {
        const s = search.trim().replace(/[%,]/g, '')
        q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%,id_number.ilike.%${s}%`)
      }

      // Birthday: bring more rows then filter client-side
      const isBirthday = segment === 'birthday'
      const effectivePageSize = isBirthday ? 1000 : pageSize
      const from = isBirthday ? 0 : (page - 1) * pageSize
      const to = from + effectivePageSize - 1

      q = q.order(sortBy, { ascending: sortDir === 'asc', nullsFirst: false })
       .range(from, to)

      const { data, error, count } = await q
      if (error) throw error

      let rows = (data || []) as Guest[]
      if (isBirthday) {
        const month = new Date().getMonth() + 1
        rows = rows.filter(g => g.date_of_birth && (new Date(g.date_of_birth).getMonth() + 1) === month)
      }
      return { rows, total: count ?? rows.length }
    },
    enabled: !!tenantId,
  })
}

export interface GuestStats {
  total: number
  vip: number
  newCount: number
  returning: number
  birthday: number
  blacklist: number
  totalRevenue: number
}

export function useGuestStats() {
  const { tenant } = useTenant()
  const tenantId = tenant?.id

  return useQuery<GuestStats>({
    queryKey: ['guest-stats', tenantId],
    queryFn: async () => {
      if (!tenantId) {
        return { total: 0, vip: 0, newCount: 0, returning: 0, birthday: 0, blacklist: 0, totalRevenue: 0 }
      }
      const monthNow = new Date().getMonth() + 1
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const [allRes, totalRes] = await Promise.all([
        supabase
          .from('guests')
          .select('vip_level,total_stays,total_spent,date_of_birth,created_at')
          .eq('tenant_id', tenantId)
          .limit(5000),
        supabase
          .from('guests')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
      ])
      if (allRes.error) throw allRes.error
      const rows = allRes.data || []

      let vip = 0, newCount = 0, returning = 0, birthday = 0, blacklist = 0, totalRevenue = 0
      for (const g of rows as any[]) {
        if (g.vip_level === 'gold' || g.vip_level === 'vip' || g.vip_level === 'platinum') vip++
        if (g.vip_level === 'blacklist') blacklist++
        if (g.total_stays >= 2) returning++
        if (g.created_at && new Date(g.created_at) >= thirtyDaysAgo) newCount++
        if (g.date_of_birth && (new Date(g.date_of_birth).getMonth() + 1) === monthNow) birthday++
        totalRevenue += Number(g.total_spent || 0)
      }

      return {
        total: totalRes.count ?? rows.length,
        vip, newCount, returning, birthday, blacklist, totalRevenue,
      }
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  })
}

export function useMergeGuests() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  return useMutation({
    mutationFn: async (params: { targetId: string; sourceIds: string[] }) => {
      const { data, error } = await (supabase.rpc as any)('merge_guests', {
        p_target_id: params.targetId,
        p_source_ids: params.sourceIds,
      })
      if (error) throw error
      return data
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['guests'] })
      queryClient.invalidateQueries({ queryKey: ['guests-v2'] })
      queryClient.invalidateQueries({ queryKey: ['guest-stats'] })
      toast({
        title: 'Đã gộp khách hàng',
        description: `Đã chuyển ${data?.bookings_moved ?? 0} booking, gộp ${data?.merged_count ?? 0} khách.`,
      })
    },
    onError: (e: any) => {
      const msg = String(e?.message || '')
      const map: Record<string, string> = {
        PERMISSION_DENIED: 'Bạn không có quyền gộp khách hàng',
        CROSS_TENANT: 'Khách hàng không cùng cơ sở',
        TARGET_NOT_FOUND: 'Không tìm thấy khách hàng đích',
        TARGET_IN_SOURCES: 'Khách đích không được trùng với khách nguồn',
      }
      const matched = Object.keys(map).find(k => msg.includes(k))
      toast({ variant: 'destructive', title: 'Gộp thất bại', description: matched ? map[matched] : msg })
    },
  })
}

export function exportGuestsToCSV(rows: Guest[], filename = 'khach-hang.csv') {
  const headers = ['Họ tên', 'SĐT', 'Email', 'CCCD', 'Quốc tịch', 'Hạng', 'Lần ở', 'Tổng chi tiêu', 'Lần cuối', 'Ngày tạo']
  const vipMap: Record<string, string> = { normal: 'Thường', silver: 'Bạc', gold: 'Vàng', vip: 'VIP', platinum: 'Bạch kim', blacklist: 'Blacklist' }
  const escape = (v: any) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const g of rows) {
    lines.push([
      g.full_name,
      g.phone || '',
      g.email || '',
      g.id_number || '',
      g.nationality || '',
      vipMap[g.vip_level] || g.vip_level,
      g.total_stays,
      g.total_spent,
      g.last_stay_date || '',
      g.created_at?.slice(0, 10) || '',
    ].map(escape).join(','))
  }
  const csv = '\uFEFF' + lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
