import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface HotelStaffMember {
  id: string
  full_name: string
  avatar_url: string | null
  email: string | null
  phone: string | null
  user_level_code: string | null
  position_name: string | null
  // Telegram info for direct contact
  telegram_username: string | null
  telegram_chat_id: string | null
}

export function useHotelStaffList(hotelId: string | undefined) {
  return useQuery({
    queryKey: ['hotel-staff-list', hotelId],
    queryFn: async () => {
      if (!hotelId) return []
      
      // Get all users assigned to this hotel via user_hotels
      const { data, error } = await supabase
        .from('user_hotels')
        .select(`
          user_id,
          user:users!user_hotels_user_id_fkey(
            id,
            full_name,
            avatar_url,
            email,
            phone,
            user_level_code,
            telegram_username,
            position:positions(name),
            telegram_connections(chat_id, is_active)
          )
        `)
        .eq('hotel_id', hotelId)
      
      if (error) {
        console.error('Error fetching hotel staff:', error)
        return []
      }
      
      // Transform and filter active users
      const staffList: HotelStaffMember[] = data
        .filter(item => item.user)
        .map(item => {
          const user = item.user as any
          // Get active telegram connection's chat_id
          const activeConnection = user.telegram_connections?.find((tc: any) => tc.is_active)
          
          return {
            id: user.id,
            full_name: user.full_name || 'Không tên',
            avatar_url: user.avatar_url,
            email: user.email,
            phone: user.phone,
            user_level_code: user.user_level_code,
            position_name: user.position?.name || null,
            telegram_username: user.telegram_username || null,
            telegram_chat_id: activeConnection?.chat_id || null,
          }
        })
      
      // Sort: managers first, then staff, alphabetically within each group
      return staffList.sort((a, b) => {
        const levelOrder: Record<string, number> = {
          manager: 1,
          staff: 2,
        }
        const aOrder = levelOrder[a.user_level_code || ''] || 3
        const bOrder = levelOrder[b.user_level_code || ''] || 3
        
        if (aOrder !== bOrder) return aOrder - bOrder
        return a.full_name.localeCompare(b.full_name, 'vi')
      })
    },
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
