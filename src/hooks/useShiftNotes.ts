import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { format, subDays } from 'date-fns'

export function useShiftNotes(days = 3) {
  const { tenantId, user } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id ?? null

  const dateFrom = format(subDays(new Date(), days - 1), 'yyyy-MM-dd')
  const dateTo = format(new Date(), 'yyyy-MM-dd')

  const q = useQuery({
    queryKey: ['shift-notes', tenantId, hotelId, dateFrom, dateTo],
    enabled: !!tenantId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      let query = supabase
        .from('shift_notes')
        .select('id, note_date, content, author_name, created_at')
        .eq('tenant_id', tenantId!)
        .gte('note_date', dateFrom)
        .lte('note_date', dateTo)
        .order('created_at', { ascending: false })
      if (hotelId) query = query.eq('hotel_id', hotelId)
      const { data } = await query
      return data || []
    },
  })

  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: async ({ content, noteDate }: { content: string; noteDate: string }) => {
      const { error } = await supabase.from('shift_notes').insert({
        tenant_id: tenantId!,
        hotel_id: hotelId,
        note_date: noteDate,
        content,
        author_id: user?.id,
        author_name: user?.full_name || user?.email || 'Nhân viên',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-notes'] }),
  })

  return { notes: q.data || [], isLoading: q.isLoading, save }
}
