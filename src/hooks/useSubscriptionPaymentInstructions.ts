import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { readPaymentInstructions } from '@/lib/subscription-checkout'

/**
 * Transfer instructions for one of the caller's own pending renewal orders.
 * The platform bank row is not readable by tenants, so the server returns the
 * account, amount and transfer reference for that order only.
 */
export function useSubscriptionPaymentInstructions(paymentId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['subscription-payment-instructions', paymentId],
    enabled: enabled && !!paymentId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_subscription_payment_instructions', { p_payment_id: paymentId! })
      if (error) throw error
      return readPaymentInstructions(data)
    },
  })
}
