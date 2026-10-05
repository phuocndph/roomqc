import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'

export function useRecurringIssues(days: number = 90) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['recurring-issues', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id, days],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!tenantId) return []
      if (!isAllHotelsMode && !selectedHotel?.id) return []

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      // Get all maintenance requests
      let query = supabase
        .from('maintenance_requests')
        .select(`
          *,
          room:rooms(id, room_number),
          item:items(id, code, name, unit_price)
        `)
        .eq('tenant_id', tenantId)
        .gte('reported_at', cutoffDate.toISOString())
        // Đợt 3: 500 → 200 — đủ cho phân tích recurring 90 ngày, giảm 60% payload
        .limit(200)
      
      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }
      
      const { data: requests, error } = await query

      if (error) throw error

      // Group by item or room
      const grouped = (requests || []).reduce((acc, req) => {
        const key = req.item_id || req.room_id || 'other'
        if (!acc[key]) {
          acc[key] = {
            id: key,
            type: req.item_id ? 'item' : 'room',
            item: req.item,
            room: req.room,
            location: req.location,
            requests: [],
            totalCost: 0,
          }
        }
        acc[key].requests.push(req)
        acc[key].totalCost += req.actual_cost || req.estimated_cost || 0
        return acc
      }, {} as Record<string, any>)

      // Filter and format
      const recurring = Object.values(grouped)
        .filter(g => g.requests.length >= 2) // At least 2 issues to detect pattern
        .map(g => {
          const last30Days = g.requests.filter((r: any) => {
            const reported = new Date(r.reported_at)
            const thirtyDaysAgo = new Date()
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
            return reported >= thirtyDaysAgo
          }).length

          const issueTypes = g.requests.reduce((acc: Record<string, number>, r: any) => {
            acc[r.issue_type] = (acc[r.issue_type] || 0) + 1
            return acc
          }, {})

          const primaryIssue = Object.entries(issueTypes).sort((a, b) => (b[1] as number) - (a[1] as number))[0]

          // Sort requests by reported_at descending for display in dialog
          const sortedRequests = g.requests
            .slice()
            .sort((a: any, b: any) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime())

          return {
            ...g,
            count30d: last30Days,
            count90d: g.requests.length,
            primaryIssue: primaryIssue?.[0] || 'other',
            issueCount: (primaryIssue?.[1] as number) || 0,
            frequency: Number((g.requests.length / (days / 30)).toFixed(1)), // per month
            avgCost: Math.round(g.totalCost / g.requests.length),
            requests: sortedRequests
          }
        })
        .sort((a, b) => b.count30d - a.count30d)

      return recurring
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
  })
}
