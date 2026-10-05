import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { DEFAULT_PRICING_RULES, PricingRules } from '@/lib/bookingCalculations'

interface RoomPricingRule {
  id: string
  tenant_id: string
  hotel_id: string
  standard_checkin_time: string
  standard_checkout_time: string
  early_checkin_before_5: number
  early_checkin_5_9: number
  early_checkin_9_14: number
  late_checkout_12_15: number
  late_checkout_15_18: number
  late_checkout_after_18: number
  default_vat_rate: number
  default_service_fee_rate: number
  weekend_surcharge: number
  high_season_surcharge: number
}

export function usePricingRules(hotelId?: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['pricing-rules', hotelId],
    queryFn: async () => {
      if (!hotelId) return null

      const { data, error } = await supabase
        .from('room_pricing_rules')
        .select('*')
        .eq('hotel_id', hotelId)
        .maybeSingle()

      if (error) {
        console.error('Error fetching pricing rules:', error)
        return null
      }

      return data as RoomPricingRule | null
    },
    enabled: !!hotelId,
  })

  // Convert database format to PricingRules format
  const pricingRules: PricingRules = data
    ? {
        standardCheckinTime: data.standard_checkin_time || DEFAULT_PRICING_RULES.standardCheckinTime,
        standardCheckoutTime: data.standard_checkout_time || DEFAULT_PRICING_RULES.standardCheckoutTime,
        earlyCheckinBefore5: data.early_checkin_before_5 ?? DEFAULT_PRICING_RULES.earlyCheckinBefore5,
        earlyCheckin5_9: data.early_checkin_5_9 ?? DEFAULT_PRICING_RULES.earlyCheckin5_9,
        earlyCheckin9_14: data.early_checkin_9_14 ?? DEFAULT_PRICING_RULES.earlyCheckin9_14,
        lateCheckout12_15: data.late_checkout_12_15 ?? DEFAULT_PRICING_RULES.lateCheckout12_15,
        lateCheckout15_18: data.late_checkout_15_18 ?? DEFAULT_PRICING_RULES.lateCheckout15_18,
        lateCheckoutAfter18: data.late_checkout_after_18 ?? DEFAULT_PRICING_RULES.lateCheckoutAfter18,
        weekendSurcharge: data.weekend_surcharge ?? DEFAULT_PRICING_RULES.weekendSurcharge,
        highSeasonSurcharge: data.high_season_surcharge ?? DEFAULT_PRICING_RULES.highSeasonSurcharge,
        vatRate: data.default_vat_rate ?? DEFAULT_PRICING_RULES.vatRate,
        serviceFeeRate: data.default_service_fee_rate ?? DEFAULT_PRICING_RULES.serviceFeeRate,
      }
    : DEFAULT_PRICING_RULES

  return {
    pricingRules,
    isLoading,
    hasCustomRules: !!data,
  }
}

/**
 * Calculate total service charges from booking consumables
 */
export async function calculateServiceChargesFromConsumables(bookingId: string): Promise<number> {
  const { data, error } = await supabase
    .from('booking_consumables')
    .select('consumed_quantity, initial_quantity, supplemented_quantity, remaining_quantity, unit_price, item:items(unit_price)')
    .eq('booking_id', bookingId)

  if (error || !data) {
    console.error('Error fetching consumables:', error)
    return 0
  }

  return data.reduce((total, consumable) => {
    const totalAvailable = (consumable.initial_quantity || 0) + (consumable.supplemented_quantity || 0)
    const consumed = consumable.consumed_quantity || (totalAvailable - (consumable.remaining_quantity || 0))
    const price = consumable.unit_price || (consumable.item as any)?.unit_price || 0
    return total + (consumed * price)
  }, 0)
}
