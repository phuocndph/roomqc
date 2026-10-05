import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface RoomCheckLeanConfig {
  /** Feature flag bật flow Lean cho /rooms/:id/check (default true) */
  use_lean: boolean
  quick_path_enabled: boolean
  quick_path_rate_limit_minutes: number
  photo_required_damaged_lost: boolean
  photo_required_missing_replace: boolean
  photo_required_consumed_chargeable: boolean
}

const DEFAULTS: RoomCheckLeanConfig = {
  use_lean: true,
  quick_path_enabled: true,
  quick_path_rate_limit_minutes: 30,
  photo_required_damaged_lost: true,
  photo_required_missing_replace: false,
  photo_required_consumed_chargeable: false,
}

/**
 * Đọc hotels.settings.room_check — Lean config per hotel.
 * Có default an toàn nếu hotel chưa cấu hình.
 */
export function useRoomCheckLeanConfig(hotelId: string | null | undefined) {
  return useQuery({
    queryKey: ['room-check-lean-config', hotelId],
    enabled: !!hotelId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RoomCheckLeanConfig> => {
      const { data, error } = await supabase
        .from('hotels')
        .select('settings')
        .eq('id', hotelId!)
        .maybeSingle()
      if (error) throw error
      const cfg = (data?.settings as any)?.room_check ?? {}
      return {
        use_lean: cfg.use_lean ?? DEFAULTS.use_lean,
        quick_path_enabled: cfg.quick_path_enabled ?? DEFAULTS.quick_path_enabled,
        quick_path_rate_limit_minutes:
          cfg.quick_path_rate_limit_minutes ?? DEFAULTS.quick_path_rate_limit_minutes,
        photo_required_damaged_lost:
          cfg.photo_required_damaged_lost ?? DEFAULTS.photo_required_damaged_lost,
        photo_required_missing_replace:
          cfg.photo_required_missing_replace ?? DEFAULTS.photo_required_missing_replace,
        photo_required_consumed_chargeable:
          cfg.photo_required_consumed_chargeable ?? DEFAULTS.photo_required_consumed_chargeable,
      }
    },
  })
}

