import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { DEFAULT_PRICING_RULES, PricingRules } from '@/lib/bookingCalculations'

export interface HotelPricingRulesExtra {
  monthlyDiscounts: Record<string, number>
}

export type HotelPricingRules = PricingRules & HotelPricingRulesExtra

const DEFAULT_MONTHLY_DISCOUNTS: Record<string, number> = {
  '1': 0,
  '2': 0,
  '3': 5,
  '6': 10,
  '12': 15,
}

export function useHotelPricingRules(hotelId?: string) {
  return useQuery({
    queryKey: ['hotel-pricing-rules', hotelId],
    queryFn: async (): Promise<HotelPricingRules> => {
      if (!hotelId) {
        return { ...DEFAULT_PRICING_RULES, monthlyDiscounts: DEFAULT_MONTHLY_DISCOUNTS }
      }
      const { data } = await (supabase as any)
        .from('hotel_settings')
        .select(
          'vat_rate, service_fee_rate, late_checkout_12_15_pct, late_checkout_15_18_pct, late_checkout_after18_pct, early_checkin_before5_pct, early_checkin_5_9_pct, early_checkin_9_14_pct, monthly_discounts'
        )
        .eq('hotel_id', hotelId)
        .maybeSingle()

      if (!data) {
        return { ...DEFAULT_PRICING_RULES, monthlyDiscounts: DEFAULT_MONTHLY_DISCOUNTS }
      }

      return {
        ...DEFAULT_PRICING_RULES,
        vatRate: data.vat_rate ?? DEFAULT_PRICING_RULES.vatRate,
        serviceFeeRate: data.service_fee_rate ?? DEFAULT_PRICING_RULES.serviceFeeRate,
        lateCheckout12_15: data.late_checkout_12_15_pct ?? DEFAULT_PRICING_RULES.lateCheckout12_15,
        lateCheckout15_18: data.late_checkout_15_18_pct ?? DEFAULT_PRICING_RULES.lateCheckout15_18,
        lateCheckoutAfter18: data.late_checkout_after18_pct ?? DEFAULT_PRICING_RULES.lateCheckoutAfter18,
        earlyCheckinBefore5: data.early_checkin_before5_pct ?? DEFAULT_PRICING_RULES.earlyCheckinBefore5,
        earlyCheckin5_9: data.early_checkin_5_9_pct ?? DEFAULT_PRICING_RULES.earlyCheckin5_9,
        earlyCheckin9_14: data.early_checkin_9_14_pct ?? DEFAULT_PRICING_RULES.earlyCheckin9_14,
        monthlyDiscounts:
          (data.monthly_discounts as Record<string, number> | null) ?? DEFAULT_MONTHLY_DISCOUNTS,
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled: true,
  })
}
